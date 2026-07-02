import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// =============================================================================
// SMARTDEV ERP TIMETABLE ENGINE v3
// aSc/Zeraki-style solver:
//   1. Lesson demand per class from class_subjects (+ subjects.lessons_per_week)
//   2. Teacher matching: teacher_subjects ∩ teacher_class_assignments ∩ staff_availability
//   3. Room allocation, in priority order:
//        a) class_subjects.preferred_room_id (explicit pin)
//        b) subject-name lab convention: Chemistry → Lab 1, Biology → Lab 2, Physics → Lab 3
//        c) subject_room_requirements room_type
//        d) any "classroom"-type room that fits class capacity
//        e) any free room
//   4. Double periods: class_subjects.requires_double_lesson (falls back to
//      subjects.allow_double_period) → ALWAYS consecutive period pairs, one
//      double block per subject per week, remaining lessons spread as singles
//      across the fewest-repeat days.
//   5. Electives: subjects sharing the same class_subjects.elective_group across
//      2+ selected classes are block-scheduled into the SAME day/period across
//      every class in the group (so students can be regrouped between classes
//      for that slot), before normal per-class scheduling runs. Any lessons
//      that can't find a common free slot fall back to normal per-class
//      scheduling and are reported as a warning.
//   6. Breaks respected via period_templates.is_break = false filter (already excluded)
//   7. Workload balancing: per-teacher per-day cap + gap minimization
//   8. Subject distribution: no subject repeats same day unless it's its double period
//   9. Conflict engine: teacher/room/class usage tracked per (day, start_time) slot
// Storage: timetable_slots (the live table — auto_timetable is unused legacy/drift)
// =============================================================================

type Period = {
  id: string; day_of_week: number; period_index: number;
  label: string; start_time: string; end_time: string; is_break: boolean;
};
type ClassSubjectDemand = {
  subject_id: string; lessons: number; allow_double: boolean;
  preferred_room_type: string | null; preferred_room_id: string | null;
};
type SlotUsage = { teachers: Set<string>; rooms: Set<string>; classes: Set<string> };

// Subject-name → lab convention. First matching hint whose room regex finds a
// free room wins; falls through to the generic room-type/capacity logic below.
const SUBJECT_LAB_HINTS: { subject: RegExp; room: RegExp }[] = [
  { subject: /chem/i, room: /lab\s*1\b|chem/i },
  { subject: /bio/i, room: /lab\s*2\b|bio/i },
  { subject: /phys/i, room: /lab\s*3\b|phys/i },
];

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
      .from("class_subjects")
      .select("class_id,subject_id,lessons_per_week,requires_double_lesson,elective_group,preferred_room_id")
      .in("class_id", data.classIds);
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
    const allDays = Array.from(periodsByDay.keys()).sort((a, b) => a - b);

    const isTeacherFree = (staffId: string, day: number, periodIndex: number, k: string) => {
      const u = ensureUsage(k);
      if (u.teachers.has(staffId)) return false;
      if (unavailable.get(staffId)?.has(`${day}-${periodIndex}`)) return false;
      return true;
    };

    const pickRoom = (
      subjectId: string, classId: string, k: string, preferredRoomId?: string | null
    ): { id: string | null; name: string | null } => {
      const u = ensureUsage(k);

      // 1) Explicit room pin from class_subjects.preferred_room_id
      if (preferredRoomId) {
        const pinned = rooms.find((rm) => rm.id === preferredRoomId && !u.rooms.has(rm.id));
        if (pinned) return { id: pinned.id, name: pinned.name };
      }

      // 2) Subject-name lab convention (Chemistry → Lab 1, Biology → Lab 2, Physics → Lab 3)
      const subj = subjectMap.get(subjectId);
      const label = `${subj?.name ?? ""} ${subj?.code ?? ""}`;
      for (const hint of SUBJECT_LAB_HINTS) {
        if (hint.subject.test(label)) {
          const labRoom = rooms.find((rm) => hint.room.test(rm.name) && !u.rooms.has(rm.id));
          if (labRoom) return { id: labRoom.id, name: labRoom.name };
        }
      }

      // 3) subject_room_requirements room_type
      const requiredType = roomReqFor.get(subjectId);
      const cap = classCapacity.get(classId) ?? 0;
      if (requiredType) {
        const r = rooms.find((rm) => rm.room_type === requiredType && !u.rooms.has(rm.id));
        if (r) return { id: r.id, name: r.name };
      }

      // 4) Any classroom that fits the class
      const fit = rooms.find((rm) => rm.room_type === "classroom" && rm.capacity >= cap && !u.rooms.has(rm.id));
      if (fit) return { id: fit.id, name: fit.name };

      // 5) Any free room at all
      const any = rooms.find((rm) => !u.rooms.has(rm.id));
      if (any) return { id: any.id, name: any.name };

      return { id: null, name: null };
    };

    // ── Phase 0: Elective group blocking (aSc-style option block) ─────────
    // Subjects sharing the same elective_group across 2+ selected classes get
    // the SAME day/period across every class in the group, so students can be
    // regrouped between classes for that slot. Leftover (unplaced) lessons
    // fall through to normal per-class scheduling below.
    type ElectiveMember = {
      classId: string; subjectId: string; lessons: number; allowDouble: boolean; preferredRoomId: string | null;
    };
    const electiveGroups = new Map<string, ElectiveMember[]>();
    (classSubjectRows as any[]).forEach((cs) => {
      if (!cs.elective_group) return;
      const subj = subjectMap.get(cs.subject_id);
      const member: ElectiveMember = {
        classId: cs.class_id,
        subjectId: cs.subject_id,
        lessons: cs.lessons_per_week ?? subj?.lessons_per_week ?? 4,
        allowDouble: !!(cs.requires_double_lesson ?? subj?.allow_double_period),
        preferredRoomId: cs.preferred_room_id ?? null,
      };
      const arr = electiveGroups.get(cs.elective_group) ?? [];
      arr.push(member);
      electiveGroups.set(cs.elective_group, arr);
    });

    // `${classId}:${subjectId}` -> lessons already placed via an elective block
    const electivePlacedCount = new Map<string, number>();

    for (const [groupName, members] of electiveGroups) {
      if (members.length < 2) continue; // not shared across classes — treat as a normal subject
      const targetLessons = Math.max(...members.map((m) => m.lessons));
      let attemptDouble = members.every((m) => m.allowDouble);
      let lessonsPlaced = 0;

      while (lessonsPlaced < targetLessons) {
        const need = attemptDouble && targetLessons - lessonsPlaced >= 2 ? 2 : 1;
        let placedThisRound = false;

        for (const day of allDays) {
          if (placedThisRound) break;
          const dayPeriods = periodsByDay.get(day)!;

          for (let pi = 0; pi < dayPeriods.length; pi++) {
            if (placedThisRound) break;
            const period = dayPeriods[pi];
            const nextPeriod = need === 2 ? dayPeriods[pi + 1] : null;
            if (need === 2 && !nextPeriod) continue;

            const k = slotKey(period.day_of_week, period.start_time);
            const u = ensureUsage(k);
            if (members.some((m) => u.classes.has(m.classId))) continue;

            let u2: SlotUsage | null = null;
            if (nextPeriod) {
              u2 = ensureUsage(slotKey(nextPeriod.day_of_week, nextPeriod.start_time));
              if (members.some((m) => u2!.classes.has(m.classId))) continue;
            }

            // Find a distinct free qualified teacher for every member at this slot
            const chosenTeachers = new Map<string, string>(); // classId:subjectId -> staffId
            let allTeachersOk = true;
            for (const m of members) {
              const qualifiedIds = qualifiedFor.get(m.subjectId);
              const pool = qualifiedIds && qualifiedIds.length ? qualifiedIds : Array.from(staffById.keys());
              const used = new Set(chosenTeachers.values());
              const teacherId = pool.find((id) =>
                !used.has(id) &&
                isTeacherFree(id, day, period.period_index, k) &&
                (!nextPeriod || (!u2!.teachers.has(id) && !unavailable.get(id)?.has(`${day}-${nextPeriod.period_index}`)))
              );
              if (!teacherId) { allTeachersOk = false; break; }
              chosenTeachers.set(`${m.classId}:${m.subjectId}`, teacherId);
            }
            if (!allTeachersOk) continue;

            // Commit this slot for every class in the group
            for (const m of members) {
              const teacherId = chosenTeachers.get(`${m.classId}:${m.subjectId}`)!;
              const room = pickRoom(m.subjectId, m.classId, k, m.preferredRoomId);
              u.teachers.add(teacherId); u.classes.add(m.classId);
              if (room.id) u.rooms.add(room.id);
              bumpLoad(teacherId, day);
              inserts.push({
                class_id: m.classId, subject_id: m.subjectId, teacher_id: teacherId,
                day_of_week: period.day_of_week, start_time: period.start_time, end_time: period.end_time,
                room: room.name, room_id: room.id, period_template_id: period.id, school_id: schoolId,
              });
              const key = `${m.classId}:${m.subjectId}`;
              electivePlacedCount.set(key, (electivePlacedCount.get(key) ?? 0) + 1);

              if (nextPeriod && u2) {
                const k2 = slotKey(nextPeriod.day_of_week, nextPeriod.start_time);
                const room2 = pickRoom(m.subjectId, m.classId, k2, m.preferredRoomId);
                u2.teachers.add(teacherId); u2.classes.add(m.classId);
                if (room2.id) u2.rooms.add(room2.id);
                bumpLoad(teacherId, day);
                inserts.push({
                  class_id: m.classId, subject_id: m.subjectId, teacher_id: teacherId,
                  day_of_week: nextPeriod.day_of_week, start_time: nextPeriod.start_time, end_time: nextPeriod.end_time,
                  room: room2.name, room_id: room2.id, period_template_id: nextPeriod.id, school_id: schoolId,
                });
                electivePlacedCount.set(key, (electivePlacedCount.get(key) ?? 0) + 1);
              }
            }

            lessonsPlaced += need;
            placedThisRound = true;
          }
        }

        if (!placedThisRound) {
          if (attemptDouble) { attemptDouble = false; continue; } // retry as singles
          if (lessonsPlaced < targetLessons) {
            conflicts.push(
              `Elective group "${groupName}": placed ${lessonsPlaced}/${targetLessons} shared lesson(s) — no common free slot across all ${members.length} classes. Remainder scheduled per-class where possible.`
            );
          }
          break;
        }
      }
    }

    // ── Main scheduling loop ──────────────────────────────────────────────
    for (const classId of data.classIds) {
      const csForClass = (classSubjectRows as any[]).filter((cs) => cs.class_id === classId);
      if (!csForClass.length) {
        conflicts.push(`${classNames.get(classId)}: no subjects configured in class_subjects — skipped.`);
        continue;
      }

      const demand: ClassSubjectDemand[] = csForClass
        .map((cs) => {
          const subj = subjectMap.get(cs.subject_id);
          const total = cs.lessons_per_week ?? subj?.lessons_per_week ?? 4;
          const key = `${cs.class_id}:${cs.subject_id}`;
          const placedViaElective = electivePlacedCount.get(key) ?? 0;
          return {
            subject_id: cs.subject_id,
            lessons: total - placedViaElective,
            allow_double: !!(cs.requires_double_lesson ?? subj?.allow_double_period),
            preferred_room_type: roomReqFor.get(cs.subject_id) ?? null,
            preferred_room_id: cs.preferred_room_id ?? null,
          };
        })
        .filter((d) => d.lessons > 0);

      const preferredRoomBySubject = new Map(demand.map((d) => [d.subject_id, d.preferred_room_id]));

      if (!demand.length) continue; // fully covered by elective blocks

      const days = allDays;
      const numDays = days.length || 1;

      type Unit = { subject_id: string; periodsNeeded: 1 | 2 };
      const dayUnits = new Map<number, Unit[]>();
      days.forEach((d) => dayUnits.set(d, []));

      // Respect each day's real period count (Friday is shorter than Mon–Thu),
      // and give every double-lesson subject exactly ONE back-to-back block per week
      // (e.g. lab practicals), with remaining lessons spread as singles.
      const dayCapacity = new Map<number, number>();
      days.forEach((d) => dayCapacity.set(d, (periodsByDay.get(d) ?? []).length));
      const dayLoad = new Map<number, number>();
      days.forEach((d) => dayLoad.set(d, 0));
      const daySubjects = new Map<number, Set<string>>();
      days.forEach((d) => daySubjects.set(d, new Set<string>()));

      const pickDay = (need: number, subjectId: string, avoidRepeat: boolean): number | null => {
        const candidates = days
          .filter((d) => dayCapacity.get(d)! - dayLoad.get(d)! >= need)
          .filter((d) => !avoidRepeat || !daySubjects.get(d)!.has(subjectId));
        if (!candidates.length) return null;
        candidates.sort((a, b) => (dayCapacity.get(b)! - dayLoad.get(b)!) - (dayCapacity.get(a)! - dayLoad.get(a)!));
        return candidates[0];
      };

      demand.forEach((d) => {
        let remaining = d.lessons;

        // Phase 1: single double block per week, back-to-back, for subjects that need it
        if (d.allow_double && remaining >= 2) {
          const day = pickDay(2, d.subject_id, true) ?? pickDay(2, d.subject_id, false);
          if (day !== null) {
            dayUnits.get(day)!.push({ subject_id: d.subject_id, periodsNeeded: 2 });
            dayLoad.set(day, dayLoad.get(day)! + 2);
            daySubjects.get(day)!.add(d.subject_id);
            remaining -= 2;
          }
        }

        // Phase 2: remaining lessons placed as singles, spread across different days first
        while (remaining > 0) {
          const day = pickDay(1, d.subject_id, true) ?? pickDay(1, d.subject_id, false);
          if (day === null) break; // no capacity left anywhere — will surface as "unscheduled"
          dayUnits.get(day)!.push({ subject_id: d.subject_id, periodsNeeded: 1 });
          dayLoad.set(day, dayLoad.get(day)! + 1);
          daySubjects.get(day)!.add(d.subject_id);
          remaining -= 1;
        }
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

          const preferredRoomId = preferredRoomBySubject.get(unit.subject_id) ?? null;
          const room = pickRoom(unit.subject_id, classId, k, preferredRoomId);

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
            const room2 = pickRoom(unit.subject_id, classId, k2, preferredRoomId);
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
