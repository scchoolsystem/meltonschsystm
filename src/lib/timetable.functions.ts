import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Period {
  id: string;
  day_of_week: number;
  period_index: number;
  label: string;
  start_time: string;
  end_time: string;
  is_break: boolean;
  event_type?: string;
}

interface Room {
  id: string;
  name: string;
  room_type: string;
  capacity: number;
  is_active: boolean;
}

interface Teacher {
  id: string;
  first_name: string;
  last_name: string;
  max_lessons_per_day: number;
  max_lessons_per_week: number;
  preferred_free_day?: number | null;
  preferred_free_periods?: string | null;
  priority_subject_1_id?: string | null;
  priority_subject_2_id?: string | null;
  priority_subject_3_id?: string | null;
}

interface SubjectRequirement {
  subject_id: string;
  subject_code: string;
  subject_name: string;
  lessons_per_week: number;
  allow_double: boolean;
  allow_triple: boolean;
  is_practical: boolean;
  is_optional: boolean;
  optional_group: string | null;
  preferred_room_id: string | null;
  required_room_type: string | null;
  preferred_teacher_id: string | null;
}

interface TimetableSlotInsert {
  class_id: string;
  subject_id: string;
  teacher_id: string | null;
  day_of_week: number;
  period_index: number;
  start_time: string;
  end_time: string;
  room: string | null;
  room_id: string | null;
  lesson_type: "single" | "double" | "triple" | "practical";
  is_optional: boolean;
  optional_group: string | null;
  version_id: string | null;
}

// ─── Room type compatibility matrix ──────────────────────────────────────────

const ROOM_COMPAT: Record<string, string[]> = {
  chemistry_lab:    ["chemistry_lab", "science_lab"],
  biology_lab:      ["biology_lab", "science_lab"],
  physics_lab:      ["physics_lab", "science_lab"],
  science_lab:      ["chemistry_lab", "biology_lab", "physics_lab", "science_lab"],
  computer_lab:     ["computer_lab"],
  music_room:       ["music_room", "hall"],
  agriculture_area: ["agriculture_area"],
  library:          ["library"],
  hall:             ["hall", "music_room"],
  classroom:        ["classroom"],
  art_room:         ["art_room", "classroom"],
  gym:              ["gym", "hall"],
  other:            ["other", "classroom"],
};

function roomFits(room: Room, requiredType: string | null): boolean {
  if (!requiredType) return true;
  const compat = ROOM_COMPAT[requiredType] ?? [requiredType];
  return compat.includes(room.room_type);
}

// ─── Main generate function ───────────────────────────────────────────────────

export const generateTimetable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      classIds: z.array(z.string().uuid()).min(1),
      lessonsPerSubjectPerWeek: z.number().min(1).max(10).default(4),
      replaceExisting: z.boolean().default(true),
      useClassRequirements: z.boolean().default(true),
      generateScope: z.enum(["all", "class", "stream", "department"]).default("all"),
      versionLabel: z.string().optional(),
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
      .from("classes")
      .select("id,name,stream,default_room_id,class_teacher_id")
      .eq("school_id", schoolId)
      .in("id", data.classIds);
    if (clsErr) throw new Error(clsErr.message);
    const classMap = new Map((classRows ?? []).map((r: any) => [r.id, r]));
    const allowed = new Set((classRows ?? []).map((r: any) => r.id));
    const invalid = data.classIds.filter((id) => !allowed.has(id));
    if (invalid.length) throw new Error(`Classes not in your school: ${invalid.join(", ")}`);

    // ── Load period templates (non-break lesson slots only) ───────────────────
    const { data: periodRows = [], error: pErr } = await supabase
      .from("period_templates")
      .select("id,day_of_week,period_index,label,start_time,end_time,is_break,event_type")
      .eq("school_id", schoolId)
      .eq("is_break", false)
      .order("day_of_week")
      .order("period_index");
    if (pErr) throw new Error("Could not load period templates: " + pErr.message);
    if (!(periodRows as any[]).length)
      return { ok: false, error: "No period templates configured. Go to Timetable → Periods tab first.", inserted: 0, conflicts: [] };

    const lessonPeriods = (periodRows as Period[]).filter(
      p => !p.event_type || p.event_type === "lesson"
    );

    // ── Load rooms ────────────────────────────────────────────────────────────
    const { data: roomRows = [], error: rErr } = await supabase
      .from("rooms")
      .select("id,name,room_type,capacity,is_active")
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .order("room_type")
      .order("name");
    if (rErr) throw new Error("Could not load rooms: " + rErr.message);
    const rooms = roomRows as Room[];
    if (!rooms.length)
      return { ok: false, error: "No active rooms configured. Go to Timetable → Rooms tab first.", inserted: 0, conflicts: [] };

    // ── Load staff with V2 workload fields ────────────────────────────────────
    const { data: staffRows = [] } = await supabase
      .from("staff")
      .select("id,role,first_name,last_name,max_lessons_per_day,max_lessons_per_week,preferred_free_day,preferred_free_periods,priority_subject_1_id,priority_subject_2_id,priority_subject_3_id")
      .eq("school_id", schoolId);

    const teacherRoles = new Set(["teacher", "subject_teacher", "class_teacher", "hod", "academic_master"]);
    const teachers = (staffRows as any[]).filter(s => teacherRoles.has(s.role));
    const allStaff = teachers.length ? teachers : (staffRows as any[]);

    // ── Load teacher-subject assignments ──────────────────────────────────────
    const { data: teacherSubjectRows = [] } = await supabase
      .from("teacher_subjects")
      .select("staff_id,subject_id,is_primary")
      .eq("school_id", schoolId);

    const qualifiedFor = new Map<string, string[]>();
    (teacherSubjectRows as any[]).forEach((r) => {
      const arr = qualifiedFor.get(r.subject_id) ?? [];
      arr.push(r.staff_id);
      qualifiedFor.set(r.subject_id, arr);
    });

    // ── Load class subject requirements ───────────────────────────────────────
    const { data: csrRows = [] } = await supabase
      .from("class_subject_requirements")
      .select("class_id,subject_id,lessons_per_week,allow_double,allow_triple,is_practical,is_optional,optional_group,preferred_room_id,required_room_type,preferred_teacher_id")
      .eq("school_id", schoolId)
      .in("class_id", data.classIds);

    const classSubjectReqs = new Map<string, SubjectRequirement[]>();
    (csrRows as any[]).forEach((r: any) => {
      const arr = classSubjectReqs.get(r.class_id) ?? [];
      arr.push(r as SubjectRequirement);
      classSubjectReqs.set(r.class_id, arr);
    });

    // ── Fallback: load all subjects if no per-class requirements ──────────────
    const { data: subjects = [] } = await supabase
      .from("subjects")
      .select("id,code,name,lessons_per_week,allow_double_period")
      .eq("school_id", schoolId);

    // ── Create timetable version ──────────────────────────────────────────────
    const versionLabel = data.versionLabel ?? `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
    const { data: versionRow } = await supabase
      .from("timetable_versions")
      .insert({
        school_id: schoolId,
        label: versionLabel,
        is_active: true,
        generated_by: userId,
        generation_options: {
          classIds: data.classIds,
          lessonsPerSubjectPerWeek: data.lessonsPerSubjectPerWeek,
          useClassRequirements: data.useClassRequirements,
        },
      })
      .select("id")
      .maybeSingle();
    const versionId = versionRow?.id ?? null;

    // ── Clear existing slots if requested ─────────────────────────────────────
    if (data.replaceExisting)
      await supabase.from("timetable_slots").delete().in("class_id", data.classIds);

    // ── Conflict tracking (cross-class, cross-teacher, cross-room) ────────────
    type SlotUsage = {
      teachers: Set<string>;
      rooms: Set<string>;
      classes: Set<string>;
      teacherLessonsDay: Map<string, number>;
    };
    const usage = new Map<string, SlotUsage>();
    const teacherWeeklyCount = new Map<string, number>();
    const slotKey = (day: number, start: string) => `${day}-${start}`;
    const ensureUsage = (k: string): SlotUsage => {
      let u = usage.get(k);
      if (!u) {
        u = { teachers: new Set(), rooms: new Set(), classes: new Set(), teacherLessonsDay: new Map() };
        usage.set(k, u);
      }
      return u;
    };

    const inserts: TimetableSlotInsert[] = [];
    const conflicts: string[] = [];

    // ── Per-class scheduling loop ─────────────────────────────────────────────
    for (const classId of data.classIds) {
      const cls = classMap.get(classId) as any;
      const className = cls?.name ?? classId;

      // Build demand list from class requirements or fallback
      const reqs: SubjectRequirement[] = classSubjectReqs.has(classId) && data.useClassRequirements
        ? classSubjectReqs.get(classId)!
        : (subjects as any[]).map((s: any) => ({
            subject_id: s.id,
            subject_code: s.code,
            subject_name: s.name,
            lessons_per_week: data.lessonsPerSubjectPerWeek,
            allow_double: s.allow_double_period ?? false,
            allow_triple: false,
            is_practical: false,
            is_optional: false,
            optional_group: null,
            preferred_room_id: null,
            required_room_type: null,
            preferred_teacher_id: null,
          }));

      // Separate optional groups — handle concurrently
      const optionalGroups = new Map<string, SubjectRequirement[]>();
      const regularReqs: SubjectRequirement[] = [];
      for (const req of reqs) {
        if (req.is_optional && req.optional_group) {
          const g = optionalGroups.get(req.optional_group) ?? [];
          g.push(req);
          optionalGroups.set(req.optional_group, g);
        } else {
          regularReqs.push(req);
        }
      }

      // Build demand array: expand each subject by lessons_per_week
      // Priority subjects first (teacher priority subjects are handled in teacher selection)
      const demand: Array<{ req: SubjectRequirement; lessonType: "single" | "double" | "triple" | "practical" }> = [];

      for (const req of regularReqs) {
        let count = req.lessons_per_week;
        // Add triple lessons first
        if (req.allow_triple && count >= 3) {
          demand.push({ req, lessonType: req.is_practical ? "practical" : "triple" });
          count -= 3;
        }
        // Add double lessons
        if (req.allow_double && count >= 2) {
          demand.push({ req, lessonType: req.is_practical ? "practical" : "double" });
          count -= 2;
        }
        // Fill rest with singles
        for (let i = 0; i < count; i++) {
          demand.push({ req, lessonType: "single" });
        }
      }

      // Add optional groups (they all share the same time slot)
      for (const [groupName, groupReqs] of optionalGroups) {
        const firstReq = groupReqs[0];
        for (let i = 0; i < firstReq.lessons_per_week; i++) {
          demand.push({ req: { ...firstReq, optional_group: groupName }, lessonType: "single" });
        }
      }

      // Shuffle demand deterministically by classId seed
      let seed = classId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      demand.sort(() => rng() - 0.5);

      // Sticky teacher per subject in this class
      const stickyTeacher = new Map<string, string>();
      let demandIdx = 0;

      for (const period of lessonPeriods) {
        if (demandIdx >= demand.length) break;

        const k = slotKey(period.day_of_week, period.start_time);
        const u = ensureUsage(k);

        // Skip if class already scheduled in this period
        if (u.classes.has(classId)) continue;

        const { req, lessonType } = demand[demandIdx];

        // ── Check for consecutive periods needed for doubles/triples ──────────
        let periodsNeeded = lessonType === "triple" || lessonType === "practical" ? 3
          : lessonType === "double" ? 2 : 1;

        if (periodsNeeded > 1) {
          // Find consecutive available periods starting here
          const pidx = lessonPeriods.indexOf(period);
          let canFit = true;
          for (let offset = 1; offset < periodsNeeded; offset++) {
            const nextP = lessonPeriods[pidx + offset];
            if (!nextP
              || nextP.day_of_week !== period.day_of_week
              || nextP.period_index !== period.period_index + offset) {
              canFit = false; break;
            }
            const nk = slotKey(nextP.day_of_week, nextP.start_time);
            if (ensureUsage(nk).classes.has(classId)) { canFit = false; break; }
          }
          if (!canFit) {
            // Downgrade to single lesson
            periodsNeeded = 1;
          }
        }

        // ── Pick teacher ──────────────────────────────────────────────────────
        const qualifiedIds = qualifiedFor.get(req.subject_id) ?? [];
        let candidatePool = qualifiedIds.length
          ? allStaff.filter(t => qualifiedIds.includes(t.id))
          : allStaff;

        // Prefer preferred_teacher_id
        if (req.preferred_teacher_id) {
          const preferred = candidatePool.find(t => t.id === req.preferred_teacher_id);
          if (preferred) candidatePool = [preferred, ...candidatePool.filter(t => t.id !== preferred.id)];
        }

        // Sort by priority subjects (teachers who have this as priority get precedence)
        candidatePool = [...candidatePool].sort((a, b) => {
          const aPriority = [a.priority_subject_1_id, a.priority_subject_2_id, a.priority_subject_3_id].includes(req.subject_id) ? -1 : 0;
          const bPriority = [b.priority_subject_1_id, b.priority_subject_2_id, b.priority_subject_3_id].includes(req.subject_id) ? -1 : 0;
          return aPriority - bPriority;
        });

        let teacherId: string | null = null;
        const sticky = stickyTeacher.get(req.subject_id);

        if (sticky) {
          const t = allStaff.find(s => s.id === sticky);
          const weekCount = teacherWeeklyCount.get(sticky) ?? 0;
          const dayCount = u.teacherLessonsDay.get(sticky) ?? 0;
          const maxWeek = t?.max_lessons_per_week ?? 40;
          const maxDay = t?.max_lessons_per_day ?? 8;
          if (!u.teachers.has(sticky) && weekCount < maxWeek && dayCount < maxDay) {
            teacherId = sticky;
          }
        }

        if (!teacherId) {
          for (const t of candidatePool) {
            const weekCount = teacherWeeklyCount.get(t.id) ?? 0;
            const dayCount = u.teacherLessonsDay.get(t.id) ?? 0;
            const maxWeek = t.max_lessons_per_week ?? 40;
            const maxDay = t.max_lessons_per_day ?? 8;
            // Skip if teacher prefers this day free
            if (t.preferred_free_day === period.day_of_week) continue;
            if (!u.teachers.has(t.id) && weekCount < maxWeek && dayCount < maxDay) {
              teacherId = t.id;
              if (!stickyTeacher.has(req.subject_id)) stickyTeacher.set(req.subject_id, t.id);
              break;
            }
          }
        }

        if (!teacherId) {
          // Fallback: any free teacher ignoring soft constraints
          const fallback = allStaff.find(t => !u.teachers.has(t.id));
          if (fallback) {
            teacherId = fallback.id;
            conflicts.push(`${className} · ${period.label}: no preferred teacher free — fallback to ${fallback.first_name} ${fallback.last_name}`);
          } else {
            conflicts.push(`${className} · ${period.label}: all teachers busy — slot skipped`);
            demandIdx++;
            continue;
          }
        }

        // ── Pick room ─────────────────────────────────────────────────────────
        let selectedRoom: Room | null = null;

        // Priority 1: subject's preferred room
        if (req.preferred_room_id) {
          const pr = rooms.find(r => r.id === req.preferred_room_id && !u.rooms.has(r.id));
          if (pr) selectedRoom = pr;
        }

        // Priority 2: class home room
        if (!selectedRoom && cls?.default_room_id) {
          const hr = rooms.find(r => r.id === cls.default_room_id && !u.rooms.has(r.id));
          if (hr && roomFits(hr, req.required_room_type)) selectedRoom = hr;
        }

        // Priority 3: matching room type
        if (!selectedRoom && req.required_room_type) {
          const matchingRoom = rooms.find(r =>
            !u.rooms.has(r.id) && roomFits(r, req.required_room_type)
          );
          if (matchingRoom) {
            selectedRoom = matchingRoom;
          } else {
            // No matching specialized room — try any classroom for non-practical
            if (!req.is_practical) {
              const anyRoom = rooms.find(r => !u.rooms.has(r.id) && r.room_type === "classroom");
              if (anyRoom) {
                selectedRoom = anyRoom;
                conflicts.push(`${className} · ${req.subject_code}: preferred room type '${req.required_room_type}' unavailable — using ${anyRoom.name}`);
              }
            } else {
              conflicts.push(`${className} · ${req.subject_code}: practical requires '${req.required_room_type}' but none available — skipping`);
              demandIdx++;
              continue;
            }
          }
        }

        // Priority 4: any available room
        if (!selectedRoom) {
          selectedRoom = rooms.find(r => !u.rooms.has(r.id)) ?? null;
        }

        // ── Commit slot(s) ────────────────────────────────────────────────────
        const pidx = lessonPeriods.indexOf(period);
        const endPeriod = lessonPeriods[pidx + periodsNeeded - 1] ?? period;

        for (let offset = 0; offset < periodsNeeded; offset++) {
          const p = lessonPeriods[pidx + offset] ?? period;
          const pk = slotKey(p.day_of_week, p.start_time);
          const pu = ensureUsage(pk);
          pu.teachers.add(teacherId!);
          pu.classes.add(classId);
          if (selectedRoom) pu.rooms.add(selectedRoom.id);
          pu.teacherLessonsDay.set(teacherId!, (pu.teacherLessonsDay.get(teacherId!) ?? 0) + 1);
        }

        teacherWeeklyCount.set(teacherId!, (teacherWeeklyCount.get(teacherId!) ?? 0) + periodsNeeded);

        inserts.push({
          class_id: classId,
          subject_id: req.subject_id,
          teacher_id: teacherId,
          day_of_week: period.day_of_week,
          period_index: period.period_index,
          start_time: period.start_time,
          end_time: endPeriod.end_time,
          room: selectedRoom?.name ?? null,
          room_id: selectedRoom?.id ?? null,
          lesson_type: periodsNeeded > 2 ? (req.is_practical ? "practical" : "triple") : periodsNeeded === 2 ? "double" : "single",
          is_optional: req.is_optional,
          optional_group: req.optional_group,
          version_id: versionId,
        });

        // If double/triple, skip the consumed periods
        for (let offset = 1; offset < periodsNeeded; offset++) {
          // Mark next period as "used" for this class so we skip it in outer loop
          const nextP = lessonPeriods[pidx + offset];
          if (nextP) {
            const nk = slotKey(nextP.day_of_week, nextP.start_time);
            ensureUsage(nk).classes.add(classId);
          }
        }

        demandIdx++;
      }

      if (demandIdx < demand.length) {
        conflicts.push(`${className}: ${demand.length - demandIdx} lesson(s) could not be scheduled — add more period slots.`);
      }
    }

    // ── Batch insert ──────────────────────────────────────────────────────────
    let inserted = 0;
    for (let i = 0; i < inserts.length; i += 50) {
      const chunk = inserts.slice(i, i + 50);
      const { data: rows, error } = await supabase
        .from("timetable_slots")
        .insert(chunk)
        .select("id");
      if (error) {
        conflicts.push(`DB insert error (batch ${Math.floor(i / 50) + 1}): ${error.message}`);
      } else {
        inserted += rows?.length ?? 0;
      }
    }

    // Update version stats
    if (versionId) {
      await supabase.from("timetable_versions").update({
        stats: { inserted, conflicts: conflicts.length, classes: data.classIds.length }
      }).eq("id", versionId);
    }

    return {
      ok: true,
      inserted,
      totalPlanned: inserts.length,
      conflicts,
      versionId,
      summary: {
        classes: data.classIds.length,
        periodsAvailable: lessonPeriods.length,
        lessonsRequested: inserts.length + (demand?.length ?? 0),
      },
    };
  });

// ─── Swap lesson server function ──────────────────────────────────────────────

export const swapTimetableSlots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      slotAId: z.string().uuid(),
      slotBId: z.string().uuid(),
      swapType: z.enum(["full", "teacher", "room"]).default("full"),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: isAdmin }, { data: isAcademic }] = await Promise.all([
      supabase.rpc("is_admin", { _user_id: userId }),
      supabase.rpc("has_role", { _user_id: userId, _role: "academic_master" }),
    ]);
    if (!isAdmin && !isAcademic) throw new Error("Permission denied");

    const { data: slotA } = await supabase.from("timetable_slots").select("*").eq("id", data.slotAId).maybeSingle();
    const { data: slotB } = await supabase.from("timetable_slots").select("*").eq("id", data.slotBId).maybeSingle();
    if (!slotA || !slotB) throw new Error("Slots not found");

    if (data.swapType === "full") {
      await supabase.from("timetable_slots").update({
        day_of_week: slotB.day_of_week, period_index: slotB.period_index,
        start_time: slotB.start_time, end_time: slotB.end_time,
      }).eq("id", data.slotAId);
      await supabase.from("timetable_slots").update({
        day_of_week: slotA.day_of_week, period_index: slotA.period_index,
        start_time: slotA.start_time, end_time: slotA.end_time,
      }).eq("id", data.slotBId);
    } else if (data.swapType === "teacher") {
      await supabase.from("timetable_slots").update({ teacher_id: slotB.teacher_id }).eq("id", data.slotAId);
      await supabase.from("timetable_slots").update({ teacher_id: slotA.teacher_id }).eq("id", data.slotBId);
    } else if (data.swapType === "room") {
      await supabase.from("timetable_slots").update({ room: slotB.room, room_id: slotB.room_id }).eq("id", data.slotAId);
      await supabase.from("timetable_slots").update({ room: slotA.room, room_id: slotA.room_id }).eq("id", data.slotBId);
    }

    return { ok: true };
  });

// ─── Analytics server function ────────────────────────────────────────────────

export const getTimetableAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: schoolId } = await supabase.rpc("my_school_id");
    if (!schoolId) throw new Error("No school context");

    const [
      { data: healthRows },
      { data: teacherWorkload },
      { data: roomUsage },
      { data: unallocated },
    ] = await Promise.all([
      supabase.rpc("timetable_health_score", { p_school_id: schoolId }),
      supabase.from("teacher_workload").select("*").eq("school_id", schoolId).order("total_lessons_scheduled", { ascending: false }),
      supabase.from("rooms").select("id,name,room_type,capacity").eq("school_id", schoolId).eq("is_active", true),
      supabase.from("class_subject_requirements")
        .select("class_id,subject_id,lessons_per_week,classes(name),subjects(name,code)")
        .eq("school_id", schoolId),
    ]);

    return {
      health: healthRows?.[0] ?? null,
      teacherWorkload: teacherWorkload ?? [],
      rooms: roomUsage ?? [],
      unallocated: unallocated ?? [],
    };
  });
