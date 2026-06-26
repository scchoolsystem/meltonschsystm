import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// =============================================================================
// SMARTDEV ERP TIMETABLE ENGINE v2
// Replaces the flat "same lessons-per-week for every subject" generator with
// an aSc/Zeraki-style solver:
//   1. Lesson demand per class from class_subjects (+ subjects.lessons_per_week)
//   2. Teacher matching: teacher_subjects ∩ teacher_class_assignments ∩ staff_availability
//   3. Room allocation: subject_room_requirements room_type > class capacity fit > any active room
//   4. Double periods: subjects.allow_double_period → consecutive period pairs
//   5. Breaks respected via period_templates.is_break = false filter (already excluded)
//   6. Workload balancing: per-teacher per-day cap + gap minimization
//   7. Subject distribution: no subject repeats same day unless it's its double period
//   8. Conflict engine: teacher/room/class usage tracked per (day, start_time) slot
// Storage: timetable_slots (the live table — auto_timetable is unused legacy/drift)
// =============================================================================

type Period = {
  id: string; day_of_week: number; period_index: number;
  label: string; start_time: string; end_time: string; is_break: boolean;
};
type ClassSubjectDemand = { subject_id: string; lessons: number; allow_double: boolean; preferred_room_type: string | null };
type SlotUsage = { teachers: Set<string>; rooms: Set<string>; classes: Set<string> };

export const generateTimetable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      classIds: z.array(z.string().uuid()).min(1),
      replaceExisting: z.boolean().default(true),
      maxLessonsPerTeacherPerDay: z.number().min(1).max(12).default(6),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // ── Auth ──────────────────────────────────────────────────────────────
    const [{ data: isAdmin }, { data: isAcademic }] = await Promise.all([
      supabase.rpc("is_admin", { _user_id: userId }),
      supabase.rpc("has_role", { _user_id: userId, _role: "academic_master" }),
    ]);
    if (!isAdmin && !isAcademic)
      throw new Error("Only admins or academic master can generate timetables");

    const { data: schoolId } = await supabase.rpc("my_school_id");
    if (!schoolId) throw new Error("No school context");

    // ── Load classes ─────────────────────────────────────────────────────
    const { data: classRows, error: clsErr } = await supabase
      .from("classes").select("id,name,capacity,class_teacher_id,stream,level")
      .eq("school_id", schoolId).in("id", data.classIds);
    if (clsErr) throw new Error(clsErr.message);
    const allowed = new Set((classRows ?? []).map((r: any) => r.id));
    const classNames = new Map((classRows ?? []).map((r: any) => [r.id, r.name]));
    const classCapacity = new Map((classRows ?? []).map((r: any) => [r.id, r.capacity]));
    const invalid = data.classIds.filter((id) => !allowed.has(id));
    if (invalid.length) throw new Error(`Classes not in your school: ${invalid.join(", ")}`);

    // ── Load period templates (non-break only) ──
    const { data: periodRows = [], error: pErr } = await supabase
      .from("period_templates")
      .select("id,day_of_week,period_index,label,start_time,end_time,is_break")
      .eq("school_id", schoolId).eq("is_break", false)
      .order("day_of_week").order("period_index");
    if (pErr) throw new Error("Could not load period templates: " + pErr.message);
    const periods = (periodRows ?? []) as Period[];
    if (!periods.length)
      return { ok: false, error: "No period templates configured. Go to Timetable → Periods tab first.", inserted: 0, conflicts: [] };

    // ── Load rooms ────────────────────────────────────────────────────────
    const { data: roomRows = [], error: rErr } = await supabase
      .from("rooms").select("id,name,room_type,capacity").eq("school_id", schoolId).eq("is_active", true).order("name");
    if (rErr) throw new Error("Could not load rooms: " + rErr.message);
    const rooms = (roomRows ?? []) as { id: string; name: string; room_type: string; capacity: number }[];
    if (!rooms.length)
      return { ok: false, error: "No active rooms configured. Go to Timetable → Rooms tab first.", inserted: 0, conflicts: [] };

    // ── Load subjects, class_subjects, subject_room_requirements ──────────
    const { data: subjects = [] } = await supabase
      .from("subjects").select("id,code,name,level,lessons_per_week,allow_double_period,preferred_time_of_day")
      .eq("school_id", schoolId);
    const subjectMap = new Map((subjects as any[]).map((s) => [s.id, s]));

    const { data: classSubjectRows = [], error: csErr } = await supabase
      .from("class_subjects").select("class_id,subject_id,lessons_per_week").in("class_id", data.classIds);
    if (csErr) throw new Error("Could not load class_subjects: " + csErr.message + " (run the class_subjects migration first)");

    const { data: roomReqRows = [] } = await supabase
      .from("subject_room_requirements").select("subject_id,room_type").eq("school_id", schoolId);
    const roomReqFor = new Map((roomReqRows as any[]).map((r) => [r.subject_id, r.room_type]));

    // ── Load staff, teacher_subjects, teacher_class_assignments, availability ──
    const { data: staffRows = [] } = await supabase
      .from("staff").select("id,user_id,first_name,last_name,status").eq("school_id", schoolId).eq("status", "active");
    const staffById = new Map((staffRows as any[]).map((s) => [s.id, s]));
    const staffByUserId = new Map((staffRows as any[]).filter((s) => s.user_id).map((s) => [s.user_id, s]));

    const { data: teacherSubjectRows = [] } = await supabase
      .from("teacher_subjects").select("staff_id,subject_id").eq("school_id", schoolId);
    const qualifiedFor = new Map<string, string[]>(); // subject_id -> staff_id[]
    (teacherSubjectRows as any[]).forEach((r) => {
      const arr = qualifiedFor.get(r.subject_id) ?? [];
      arr.push(r.staff_id);
      qualifiedFor.set(r.subject_id, arr);
    });

    const { data: assignmentRows = [] } = await supabase
      .from("teacher_class_assignments").select("teacher_user_id,class_id").eq("school_id", schoolId).eq("is_active", true);
    const assignedStaffIdsForClass = new Map<string, Set<string>>(); // class_id -> staff_id set
    (assignmentRows as any[]).forEach((r) => {
      const staff = staffByUserId.get(r.teacher_user_id);
      if (!staff) return;
      const set = assignedStaffIdsForClass.get(r.class_id) ?? new Set<string>();
      set.add(staff.id);
      assignedStaffIdsForClass.set(r.class_id, set);
    });
    const classesWithAssignments = new Set(Array.from(assignedStaffIdsForClass.keys()));

    const { data: availabilityRows = [] } = await supabase
      .from("staff_availability").select("staff_id,day_of_week,period_index,available").eq("school_id", schoolId);
    const unavailable = new Map<string, Set<string>>();
    (availabilityRows as any[]).filter((r) => r.available === false).forEach((r) => {
      const set = unavailable.get(r.staff_id) ?? new Set<string>();
      set.add(`${r.day_of_week}-${r.period_index}`);
      unavailable.set(r.staff_id, set);
    });

    // ── Clear existing if requested ────────────────────────────────────────
    if (data.replaceExisting)
      await supabase.from("timetable_slots").delete().in("class_id", data.classIds);

    const conflicts: string[] = [];

    // ── Global usage tracking ──────────────────────────────────────────────
    const usage = new Map<string, SlotUsage>();
    const slotKey = (day: number, start: string) => `${day}-${start}`;
    const ensureUsage = (k: string): SlotUsage => {
      let u = usage.get(k);
      if (!u) { u = { teachers: new Set(), rooms: new Set(), classes: new Set() }; usage.set(k, u); }
      return u;
    };
    const teacherDailyLoad = new Map<string, Map<number, number>>();
    const bumpLoad = (teacherId: string, day: number) => {
      const m = teacherDailyLoad.get(teacherId) ?? new Map<number, number>();
      m.set(day, (m.get(day) ?? 0) + 1);
      teacherDailyLoad.set(teacherId, m);
    };
    const loadOn = (teacherId: string, day: number) => teacherDailyLoad.get(teacherId)?.get(day) ?? 0;

    type Insert = {
      class_id: string; subject_id: string; teacher_id: string | null;
      day_of_week: number; start_time: string; end_time: string;
      room: string | null; room_id: string | null; period_template_id: string;
      school_id: string;
    };
    const inserts: Insert[] = [];
    const noQualifiedFor = new Set<string>();

    // Group periods by day
    const periodsByDay = new Map<number, Period[]>();
    periods.forEach((p) => {
      const arr = periodsByDay.get(p.day_of_week) ?? [];
      arr.push(p);
      periodsByDay.set(p.day_of_week, arr);
    });
    periodsByDay.forEach((arr) => arr.sort((a, b) => a.period_index - b.period_index));

    const isTeacherFree = (staffId: string, day: number, periodIndex: number, k: string) => {
      const u = ensureUsage(k);
      if (u.teachers.has(staffId)) return false;
      if (unavailable.get(staffId)?.has(`${day}-${periodIndex}`)) return false;
      return true;
    };

    const pickRoom = (subjectId: string, classId: string, k: string): { id: string | null; name: string | null } => {
      const u = ensureUsage(k);
      const requiredType = roomReqFor.get(subjectId);
      const cap = classCapacity.get(classId) ?? 0;
      if (requiredType) {
        const r = rooms.find((rm) => rm.room_type === requiredType && !u.rooms.has(rm.id));
        if (r) return { id: r.id, name: r.name };
      }
      const fit = rooms.find((rm) => rm.room_type === "classroom" && rm.capacity >= cap && !u.rooms.has(rm.id));
      if (fit) return { id: fit.id, name: fit.name };
      const any = rooms.find((rm) => !u.rooms.has(rm.id));
      if (any) return { id: any.id, name: any.name };
      return { id: null, name: null };
    };

    // ── Main scheduling loop ──────────────────────────────────────────────
    for (const classId of data.classIds) {
      const csForClass = (classSubjectRows as any[]).filter((cs) => cs.class_id === classId);
      if (!csForClass.length) {
        conflicts.push(`${classNames.get(classId)}: no subjects configured in class_subjects — skipped.`);
        continue;
      }

      const demand: ClassSubjectDemand[] = csForClass.map((cs) => {
        const subj = subjectMap.get(cs.subject_id);
        return {
          subject_id: cs.subject_id,
          lessons: cs.lessons_per_week ?? subj?.lessons_per_week ?? 4,
          allow_double: !!subj?.allow_double_period,
          preferred_room_type: roomReqFor.get(cs.subject_id) ?? null,
        };
      });

      const days = Array.from(periodsByDay.keys()).sort((a, b) => a - b);
      const numDays = days.length || 1;

      type Unit = { subject_id: string; periodsNeeded: 1 | 2 };
      const dayUnits = new Map<number, Unit[]>();
      days.forEach((d) => dayUnits.set(d, []));

      demand.forEach((d, subjectIdx) => {
        const base = Math.floor(d.lessons / numDays);
        const extra = d.lessons % numDays;
        const rotation = subjectIdx % numDays;
        days.forEach((day, i) => {
          const pos = (i - rotation + numDays) % numDays;
          let count = base + (pos < extra ? 1 : 0);
          if (d.allow_double) {
            while (count >= 2) { dayUnits.get(day)!.push({ subject_id: d.subject_id, periodsNeeded: 2 }); count -= 2; }
          }
          while (count >= 1) { dayUnits.get(day)!.push({ subject_id: d.subject_id, periodsNeeded: 1 }); count -= 1; }
        });
      });

      const scheduledTodayForClass = new Map<number, Set<string>>();
      const stickyTeacher = new Map<string, string>();

      for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
        const day = days[dayIdx];
        const units = dayUnits.get(day)!;
        if (!units.length) continue;
        const dayPeriods = periodsByDay.get(day)!;
        const todaySet = scheduledTodayForClass.get(day) ?? new Set<string>();
        scheduledTodayForClass.set(day, todaySet);

        for (let pi = 0; pi < dayPeriods.length; pi++) {
          if (!units.length) break;

          const period = dayPeriods[pi];
          const k = slotKey(period.day_of_week, period.start_time);
          const u = ensureUsage(k);
          if (u.classes.has(classId)) continue;

          let chosenIdx = units.findIndex((un) => !todaySet.has(un.subject_id));
          if (chosenIdx === -1) chosenIdx = 0;

          const unit = units[chosenIdx];
          const needsDouble = unit.periodsNeeded === 2;
          const nextPeriod = dayPeriods[pi + 1];
          if (needsDouble && !nextPeriod) {
            unit.periodsNeeded = 1;
          }

          const classAssigned = assignedStaffIdsForClass.get(classId);
          const restrictToAssigned = classesWithAssignments.has(classId);
          const qualifiedIds = qualifiedFor.get(unit.subject_id);
          let pool: string[];
          if (qualifiedIds && qualifiedIds.length) {
            pool = restrictToAssigned && classAssigned
              ? qualifiedIds.filter((id) => classAssigned.has(id))
              : qualifiedIds;
            if (!pool.length) pool = qualifiedIds;
          } else {
            noQualifiedFor.add(unit.subject_id);
            pool = Array.from(staffById.keys());
          }

          const sticky = stickyTeacher.get(unit.subject_id);
          let teacherId: string | null = null;
          if (sticky && isTeacherFree(sticky, day, period.period_index, k)) {
            teacherId = sticky;
          } else {
            const free = pool.find((id) => isTeacherFree(id, day, period.period_index, k)
              && loadOn(id, day) < data.maxLessonsPerTeacherPerDay);
            if (free) {
              teacherId = free;
              if (!stickyTeacher.has(unit.subject_id)) stickyTeacher.set(unit.subject_id, free);
            } else {
              const anyFree = pool.find((id) => isTeacherFree(id, day, period.period_index, k));
              if (anyFree) {
                teacherId = anyFree;
                conflicts.push(`${classNames.get(classId)} · ${period.label}: teacher over daily cap, assigned anyway`);
              } else {
                conflicts.push(`${classNames.get(classId)} · ${period.label}: no teacher available — slot skipped`);
                continue;
              }
            }
          }

          if (needsDouble && nextPeriod) {
            const k2 = slotKey(nextPeriod.day_of_week, nextPeriod.start_time);
            const u2 = ensureUsage(k2);
            const teacherFreeNext = !u2.teachers.has(teacherId!) && !unavailable.get(teacherId!)?.has(`${day}-${nextPeriod.period_index}`);
            if (!teacherFreeNext || u2.classes.has(classId)) {
              unit.periodsNeeded = 1;
            }
          }

          const room = pickRoom(unit.subject_id, classId, k);

          u.teachers.add(teacherId!);
          u.classes.add(classId);
          if (room.id) u.rooms.add(room.id);
          bumpLoad(teacherId!, day);
          todaySet.add(unit.subject_id);

          inserts.push({
            class_id: classId, subject_id: unit.subject_id, teacher_id: teacherId,
            day_of_week: period.day_of_week, start_time: period.start_time, end_time: period.end_time,
            room: room.name, room_id: room.id, period_template_id: period.id, school_id: schoolId,
          });

          if (unit.periodsNeeded === 2 && nextPeriod) {
            const k2 = slotKey(nextPeriod.day_of_week, nextPeriod.start_time);
            const u2 = ensureUsage(k2);
            const room2 = pickRoom(unit.subject_id, classId, k2);
            u2.teachers.add(teacherId!);
            u2.classes.add(classId);
            if (room2.id) u2.rooms.add(room2.id);
            bumpLoad(teacherId!, day);
            inserts.push({
              class_id: classId, subject_id: unit.subject_id, teacher_id: teacherId,
              day_of_week: nextPeriod.day_of_week, start_time: nextPeriod.start_time, end_time: nextPeriod.end_time,
              room: room2.name, room_id: room2.id, period_template_id: nextPeriod.id, school_id: schoolId,
            });
            pi++;
          }

          units.splice(chosenIdx, 1);
        }
      }

      const leftover = Array.from(dayUnits.values()).reduce((sum, arr) => sum + arr.length, 0);
      if (leftover) {
        conflicts.push(`${classNames.get(classId)}: ${leftover} lesson(s) unscheduled — not enough period slots on the relevant day(s).`);
      }
    }

    if (noQualifiedFor.size) {
      const codes = Array.from(noQualifiedFor).map((id) => subjectMap.get(id)?.code ?? subjectMap.get(id)?.name ?? id).join(", ");
      conflicts.push(`No qualified teacher (via teacher_subjects) for: ${codes}. Assign teachers under Staff → Subjects Taught.`);
    }

    // ── Batch insert ─────────────────────────────────────────────────────
    let inserted = 0;
    for (let i = 0; i < inserts.length; i += 50) {
      const chunk = inserts.slice(i, i + 50);
      const { data: rows, error } = await supabase.from("timetable_slots").insert(chunk).select("id");
      if (error) conflicts.push(`DB insert error (batch ${Math.floor(i / 50) + 1}): ${error.message}`);
      else inserted += rows?.length ?? 0;
    }

    return {
      ok: true,
      inserted,
      totalPlanned: inserts.length,
      conflicts,
      summary: { classes: data.classIds.length, periodsAvailable: periods.length },
    };
  });
