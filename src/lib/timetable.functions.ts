import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const generateTimetable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      classIds: z.array(z.string().uuid()).min(1),
      lessonsPerSubjectPerWeek: z.number().min(1).max(10).default(4),
      replaceExisting: z.boolean().default(true),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // ── Auth ──────────────────────────────────────────────────────────────────
    const [{ data: isAdmin }, { data: isAcademic }] = await Promise.all([
      supabase.rpc("is_admin", { _user_id: userId }),
      supabase.rpc("has_role", { _user_id: userId, _role: "academic_master" }),
    ]);
    if (!isAdmin && !isAcademic)
      throw new Error("Only admins or academic master can generate timetables");

    const { data: schoolId } = await supabase.rpc("my_school_id");
    if (!schoolId) throw new Error("No school context");

    // ── Load classes ──────────────────────────────────────────────────────────
    const { data: classRows, error: clsErr } = await supabase
      .from("classes").select("id,name").eq("school_id", schoolId).in("id", data.classIds);
    if (clsErr) throw new Error(clsErr.message);
    const allowed = new Set((classRows ?? []).map((r: any) => r.id));
    const classNames = new Map((classRows ?? []).map((r: any) => [r.id, r.name]));
    const invalid = data.classIds.filter((id) => !allowed.has(id));
    if (invalid.length) throw new Error(`Classes not in your school: ${invalid.join(", ")}`);

    // ── Load period templates (non-break slots only) ───────────────────────────
    const { data: periodRows = [], error: pErr } = await supabase
      .from("period_templates")
      .select("id,day_of_week,period_index,label,start_time,end_time,is_break")
      .eq("school_id", schoolId).eq("is_break", false)
      .order("day_of_week").order("period_index");
    if (pErr) throw new Error("Could not load period templates: " + pErr.message);
    if (!(periodRows as any[]).length)
      return { ok: false, error: "No period templates configured. Go to Timetable → Periods tab first.", inserted: 0, conflicts: [] };

    // ── Load rooms ────────────────────────────────────────────────────────────
    const { data: roomRows = [], error: rErr } = await supabase
      .from("rooms").select("id,name").eq("school_id", schoolId).eq("is_active", true).order("name");
    if (rErr) throw new Error("Could not load rooms: " + rErr.message);
    const roomNames = (roomRows as any[]).map((r: any) => r.name);
    if (!roomNames.length)
      return { ok: false, error: "No active rooms configured. Go to Timetable → Rooms tab first.", inserted: 0, conflicts: [] };

    // ── Load subjects, staff, teacher-subject assignments ─────────────────────
    const [{ data: subjects = [] }, { data: staff = [] }, { data: teacherSubjectRows = [] }] =
      await Promise.all([
        supabase.from("subjects").select("id,code,name,level").eq("school_id", schoolId),
        supabase.from("staff").select("id,role,first_name,last_name").eq("school_id", schoolId),
        supabase.from("teacher_subjects").select("staff_id,subject_id").eq("school_id", schoolId),
      ]);

    const teacherPool = (staff as any[]).filter((s) =>
      ["teacher", "subject_teacher", "class_teacher", "hod", "academic_master"].includes(s.role)
    );
    const teachers = teacherPool.length ? teacherPool : (staff as any[]);

    if (!(subjects as any[]).length || !teachers.length)
      return { ok: false, error: "Need at least one subject and one teacher before generating.", inserted: 0, conflicts: [] };

    // subject_id → staff_ids qualified to teach it
    const qualifiedFor = new Map<string, string[]>();
    (teacherSubjectRows as any[]).forEach((r) => {
      const arr = qualifiedFor.get(r.subject_id) ?? [];
      arr.push(r.staff_id);
      qualifiedFor.set(r.subject_id, arr);
    });

    // ── Pre-flight check: enough periods? ─────────────────────────────────────
    const totalPeriodsAvailable = (periodRows as any[]).length;
    const totalLessonsNeeded = (subjects as any[]).length * data.lessonsPerSubjectPerWeek;
    const conflicts: string[] = [];

    if (totalLessonsNeeded > totalPeriodsAvailable) {
      conflicts.push(
        `Warning: ${totalLessonsNeeded} lessons needed (${(subjects as any[]).length} subjects × ${data.lessonsPerSubjectPerWeek}/week) ` +
        `but only ${totalPeriodsAvailable} period slots exist. ` +
        `Reduce lessons-per-week or add more periods. Some lessons will be dropped.`
      );
    }

    // ── Clear existing if requested ───────────────────────────────────────────
    if (data.replaceExisting)
      await supabase.from("timetable_slots").delete().in("class_id", data.classIds);

    // ── Conflict tracking ─────────────────────────────────────────────────────
    // Key: "day-start_time"
    // Tracks which teachers/rooms are already used in that time slot ACROSS all classes
    type SlotUsage = { teachers: Set<string>; rooms: Set<string>; classes: Set<string> };
    const usage = new Map<string, SlotUsage>();
    const slotKey = (day: number, start: string) => `${day}-${start}`;
    const ensureUsage = (k: string): SlotUsage => {
      let u = usage.get(k);
      if (!u) { u = { teachers: new Set(), rooms: new Set(), classes: new Set() }; usage.set(k, u); }
      return u;
    };

    type TimetableSlot = {
      class_id: string; subject_id: string; teacher_id: string | null;
      day_of_week: number; start_time: string; end_time: string; room: string | null;
    };
    const inserts: TimetableSlot[] = [];
    const noQualifiedFor = new Set<string>();

    // ── Main scheduling loop — one class at a time ────────────────────────────
    for (const classId of data.classIds) {
      // Build demand list: each subject repeated lessonsPerSubjectPerWeek times
      const demand: string[] = [];
      (subjects as any[]).forEach((s) => {
        for (let i = 0; i < data.lessonsPerSubjectPerWeek; i++) demand.push(s.id);
      });

      // Shuffle demand so subjects spread across days (deterministic per class)
      let seed = classId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      demand.sort(() => rng() - 0.5);

      // Track how many of each subject we've scheduled for THIS class
      const scheduledCount = new Map<string, number>();
      // Track which teacher is "sticky" for a subject in this class
      // (same teacher teaches the same subject to the same class all week)
      const stickyTeacher = new Map<string, string>();

      let demandIdx = 0;

      // Iterate over ALL periods for this class
      for (const period of periodRows as any[]) {
        if (demandIdx >= demand.length) break;

        const k = slotKey(period.day_of_week, period.start_time);
        const u = ensureUsage(k);

        // Skip if this class already has a slot at this time (class double-booking)
        if (u.classes.has(classId)) continue;

        const subjectId = demand[demandIdx];

        // ── Pick teacher ──────────────────────────────────────────────────────
        const qualifiedIds = qualifiedFor.get(subjectId);
        let candidatePool: any[];

        if (qualifiedIds && qualifiedIds.length) {
          const qSet = new Set(qualifiedIds);
          candidatePool = teachers.filter((t) => qSet.has(t.id));
        } else {
          noQualifiedFor.add(subjectId);
          candidatePool = teachers; // fallback: any teacher
        }

        // Try sticky teacher first (same teacher for this subject all week)
        let teacherId: string | null = null;
        const sticky = stickyTeacher.get(subjectId);
        if (sticky && !u.teachers.has(sticky)) {
          teacherId = sticky;
        } else {
          // Find a free teacher from the qualified pool
          const free = candidatePool.find((t) => !u.teachers.has(t.id));
          if (free) {
            teacherId = free.id;
            // Set as sticky only if not already set
            if (!stickyTeacher.has(subjectId)) stickyTeacher.set(subjectId, free.id);
          } else {
            // Last resort: any free teacher at all
            const anyFree = teachers.find((t) => !u.teachers.has(t.id));
            if (anyFree) {
              teacherId = anyFree.id;
              conflicts.push(
                `${classNames.get(classId)} · ${period.label ?? `Day ${period.day_of_week} P${period.period_index}`}: ` +
                `no qualified teacher free — assigned ${anyFree.first_name} ${anyFree.last_name} as fallback`
              );
            } else {
              // Truly no teacher available — skip this period, try next
              conflicts.push(
                `${classNames.get(classId)} · ${period.label ?? `Day ${period.day_of_week} P${period.period_index}`}: ` +
                `all teachers busy — slot skipped`
              );
              demandIdx++; // consume demand anyway to avoid infinite loop
              continue;
            }
          }
        }

        // ── Pick room ─────────────────────────────────────────────────────────
        const room = roomNames.find((r) => !u.rooms.has(r)) ?? null;

        // ── Commit ────────────────────────────────────────────────────────────
        u.teachers.add(teacherId!);
        u.classes.add(classId);
        if (room) u.rooms.add(room);

        inserts.push({
          class_id: classId,
          subject_id: subjectId,
          teacher_id: teacherId,
          day_of_week: period.day_of_week,
          start_time: period.start_time,
          end_time: period.end_time,
          room,
        });

        scheduledCount.set(subjectId, (scheduledCount.get(subjectId) ?? 0) + 1);
        demandIdx++;
      }

      // Report any unscheduled lessons for this class
      if (demandIdx < demand.length) {
        const unscheduled = demand.length - demandIdx;
        conflicts.push(
          `${classNames.get(classId)}: ${unscheduled} lesson(s) unscheduled — ` +
          `not enough period slots. Add more periods or reduce lessons-per-subject.`
        );
      }
    }

    // Report subjects with no qualified teachers
    if (noQualifiedFor.size) {
      const subjectCodes = (subjects as any[])
        .filter((s) => noQualifiedFor.has(s.id))
        .map((s) => s.code ?? s.name)
        .join(", ");
      conflicts.push(
        `No qualified teacher assigned for: ${subjectCodes}. ` +
        `Go to Staff → each teacher → Subjects Taught to assign properly.`
      );
    }

    // ── Batch insert ──────────────────────────────────────────────────────────
    let inserted = 0;
    for (let i = 0; i < inserts.length; i += 50) {
      const chunk = inserts.slice(i, i + 50);
      const { data: rows, error } = await supabase
        .from("timetable_slots").insert(chunk).select("id");
      if (error) {
        conflicts.push(`DB insert error (batch ${Math.floor(i / 50) + 1}): ${error.message}`);
      } else {
        inserted += rows?.length ?? 0;
      }
    }

    return {
      ok: true,
      inserted,
      totalPlanned: inserts.length,
      conflicts,
      summary: {
        classes: data.classIds.length,
        periodsAvailable: totalPeriodsAvailable,
        lessonsRequested: totalLessonsNeeded * data.classIds.length,
      },
    };
  });
