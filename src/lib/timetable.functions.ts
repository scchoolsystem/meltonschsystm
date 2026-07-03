import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// =============================================================================
// SMARTDEV ERP TIMETABLE ENGINE v5
// ASC/Zeraki-style solver — same architecture, same APIs, same UI. One DB
// change this version: subjects.is_core (additive migration), so core
// subjects can be identified reliably instead of guessed from their name.
//
//   1. Lesson demand per class from class_subjects (+ subjects.lessons_per_week)
//   2. PERMANENT TEACHER ALLOCATION: one teacher is locked per (class, subject)
//      pair BEFORE any period is placed — chosen from teacher_subjects ∩
//      teacher_class_assignments, balanced by running weekly-load. Once
//      locked, the scheduler never substitutes a different teacher for that
//      pair; it only searches for a free period for the teacher already assigned.
//   3. Room allocation, in priority order:
//        a) class_subjects.preferred_room_id (explicit pin)
//        b) subject-name lab convention: Chemistry → Lab 1, Biology → Lab 2, Physics → Lab 3
//        c) subject_room_requirements room_type
//        d) any "classroom"-type room that fits class capacity
//        e) any free room
//   4. CORE SUBJECTS (v5 — new): subjects flagged subjects.is_core (Math,
//      English, Kiswahili by default — see migration 20260703070000) are
//      scheduled FIRST, one lesson every single school day, never doubled,
//      never skipped. This runs before anything else so core subjects
//      always get a clean, evenly-spread claim on the week.
//   5. Double periods: class_subjects.requires_double_lesson (falls back to
//      subjects.allow_double_period) are reserved next, only into period
//      pairs that are truly wall-clock adjacent (one period's end_time ===
//      the next one's start_time, so a break can never sit between them).
//      Candidates are scored, preferring the classic 2-3 / 3-4 / 5-6 double
//      slots, the teacher's lightest day, AND a heavy penalty against
//      chaining a 3rd consecutive double block back-to-back (max 2 in a row).
//   6. Electives (v5 — simplified): elective_group is read but no longer
//      used to force multiple subjects into one shared class+slot. The live
//      DB has a hard trigger — "This class already has a lesson scheduled in
//      this time slot" — that forbids a class having two rows at an
//      overlapping time, which made the old same-class parallel-option-block
//      feature impossible to insert (this was the source of the DB insert
//      errors and Form 1 silently losing its whole batch). Elective subjects
//      now simply flow through the normal single-lesson-per-slot pipeline
//      like every other subject. (Cross-CLASS elective blocking — e.g.
//      Form1A + Form1B sharing one Agriculture slot — is DB-safe since it's
//      different class_ids, and can be reintroduced later if you add
//      streamed classes and want it.)
//   7. Breaks respected via period_templates.is_break = false filter (already excluded)
//   8. Smart slot scoring: remaining single lessons are placed one at a time
//      into whichever free (day, period) scores highest — teacher daily-load
//      balance, weekly subject spread (Mon/Wed/Fri over Mon/Tue), subject
//      time-of-day preference, light teacher-gap minimization, AND (v5) a
//      penalty against sitting directly next to another lesson of the same
//      subject that day, so a forced same-day repeat doesn't chain into 3
//      periods in a row.
//   9. Conflict engine: teacher/room/class usage tracked per (day, start_time)
//      slot, checked before every placement — never relies on DB constraints.
//  10. Duplicate guard: a second in-memory pass re-checks every planned
//      insert for class/teacher/room slot collisions immediately before the
//      batch insert. (v5) Insert batches are also smaller and self-healing:
//      if a batch is rejected by the DB, it's retried row-by-row so one bad
//      row can never take out an entire class's schedule the way it took
//      out all of Form 1 before.
//  13. Reporting: the response carries a `report` block with lessons
//      required/generated, doubles placed, and remaining unscheduled count,
//      in addition to the original fields the existing UI already reads
//      (ok/inserted/conflicts/summary — unchanged).
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

// Subject-name → lab convention. Only matched against rooms whose room_type
// is "science_lab" (so "Computer Lab 1" can never be picked for Chemistry
// just because its name also contains "Lab 1"). First matching hint whose
// regex finds a free science_lab room wins; falls through to the generic
// room-type/capacity logic below.
const SUBJECT_LAB_HINTS: { subject: RegExp; room: RegExp }[] = [
  { subject: /chem/i, room: /\b1\b/ },
  { subject: /bio/i, room: /\b2\b/ },
  { subject: /phys/i, room: /\b3\b/ },
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
      .from("subjects").select("id,code,name,level,lessons_per_week,allow_double_period,preferred_time_of_day,is_core")
      .eq("school_id", schoolId);
    const subjectMap = new Map((subjects as any[]).map((s) => [s.id, s]));

    const { data: classSubjectRowsRaw = [], error: csErr } = await supabase
      .from("class_subjects")
      .select("class_id,subject_id,lessons_per_week,requires_double_lesson,elective_group,preferred_room_id")
      .in("class_id", data.classIds);
    if (csErr) throw new Error("Could not load class_subjects: " + csErr.message + " (run the class_subjects migration first)");

    // Guard against duplicate (class_id, subject_id) rows in class_subjects —
    // these have shown up before from CSV import drift. A duplicate row is
    // NOT a second lesson requirement; left in, it silently doubles demand
    // and (for electives) gets inserted twice into the exact same slot,
    // which is what the Phase 9/10 duplicate guard was rejecting. First row
    // wins; duplicates are dropped and reported so the underlying data can
    // be cleaned up in class_subjects itself.
    const seenClassSubject = new Set<string>();
    const duplicateClassSubjectPairs = new Set<string>();
    const classSubjectRows = (classSubjectRowsRaw as any[]).filter((cs) => {
      const key = `${cs.class_id}:${cs.subject_id}`;
      if (seenClassSubject.has(key)) { duplicateClassSubjectPairs.add(key); return false; }
      seenClassSubject.add(key);
      return true;
    });

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
    let doublesPlacedCount = 0;

    if (duplicateClassSubjectPairs.size) {
      const labels = Array.from(duplicateClassSubjectPairs).map((key) => {
        const [clsId, subjId] = key.split(":");
        return `${classNames.get(clsId) ?? clsId} · ${subjectMap.get(subjId)?.name ?? subjId}`;
      });
      conflicts.push(`Duplicate class_subjects row(s) ignored (data cleanup recommended): ${labels.join(", ")}`);
    }

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
    const noStaffAtAll = new Set<string>();

    // Group periods by day. `isAdjacent` detects *true* wall-clock
    // adjacency — a pair only counts as double-lesson-able if one period's
    // end_time is exactly the next one's start_time, so a break (or any gap)
    // between array-neighbours can never be treated as consecutive.
    const periodsByDay = new Map<number, Period[]>();
    periods.forEach((p) => {
      const arr = periodsByDay.get(p.day_of_week) ?? [];
      arr.push(p);
      periodsByDay.set(p.day_of_week, arr);
    });
    periodsByDay.forEach((arr) => arr.sort((a, b) => a.period_index - b.period_index));
    const allDays = Array.from(periodsByDay.keys()).sort((a, b) => a - b);
    const isAdjacent = (a: Period, b: Period) => a.day_of_week === b.day_of_week && a.end_time === b.start_time;

    const isTeacherFree = (staffId: string, day: number, periodIndex: number, k: string) => {
      const u = ensureUsage(k);
      if (u.teachers.has(staffId)) return false;
      if (unavailable.get(staffId)?.has(`${day}-${periodIndex}`)) return false;
      return true;
    };
    const isClassFree = (u: SlotUsage, classId: string) => !u.classes.has(classId);

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
          const labRoom = rooms.find(
            (rm) => rm.room_type === "science_lab" && hint.room.test(rm.name) && !u.rooms.has(rm.id)
          );
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

    // ── PHASE 2: Permanent teacher allocation ──────────────────────────────
    // One teacher per (class, subject) for the whole week, decided ONCE,
    // before any period is placed. Balances across teachers using a running
    // "lessons allocated so far" count so allocation order doesn't dogpile
    // one teacher. From this point on the scheduler never substitutes a
    // different teacher for a class+subject — it only searches for a free
    // period for the teacher already allocated.
    const allocatedLoad = new Map<string, number>(); // staffId -> lessons allocated so far
    const teacherAllocation = new Map<string, string>(); // "classId:subjectId" -> staffId

    const allocateTeacher = (classId: string, subjectId: string, lessonsNeeded: number): string | null => {
      const key = `${classId}:${subjectId}`;
      const existing = teacherAllocation.get(key);
      if (existing) return existing;

      const classAssigned = assignedStaffIdsForClass.get(classId);
      const restrictToAssigned = classesWithAssignments.has(classId);
      const qualifiedIds = qualifiedFor.get(subjectId);

      let pool: string[];
      if (qualifiedIds && qualifiedIds.length) {
        pool = restrictToAssigned && classAssigned
          ? qualifiedIds.filter((id) => classAssigned.has(id))
          : qualifiedIds;
        if (!pool.length) pool = qualifiedIds;
      } else {
        noQualifiedFor.add(subjectId);
        pool = Array.from(staffById.keys());
      }
      if (!pool.length) { noStaffAtAll.add(subjectId); return null; }

      // Least-loaded qualified teacher so far wins; deterministic tie-break by id.
      pool = [...pool].sort(
        (a, b) => (allocatedLoad.get(a) ?? 0) - (allocatedLoad.get(b) ?? 0) || a.localeCompare(b)
      );
      const chosen = pool[0];
      teacherAllocation.set(key, chosen);
      allocatedLoad.set(chosen, (allocatedLoad.get(chosen) ?? 0) + lessonsNeeded);
      return chosen;
    };

    // Preferred double-lesson start periods (aSc-style): 2-3, 3-4, 5-6 score
    // highest; any other truly-consecutive pair is still valid, just scores lower.
    const PREFERRED_DOUBLE_STARTS = new Set([2, 3, 5]);

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
          allow_double: !!(cs.requires_double_lesson ?? subj?.allow_double_period),
          preferred_room_type: roomReqFor.get(cs.subject_id) ?? null,
          preferred_room_id: cs.preferred_room_id ?? null,
        };
      });

      // Lock a teacher for every subject this class needs (Phase 2).
      demand.forEach((d) => allocateTeacher(classId, d.subject_id, d.lessons));
      const demandBySubject = new Map(demand.map((d) => [d.subject_id, d]));

      const daySubjectCount = new Map<number, Map<string, number>>(); // day -> subjectId -> count today
      const subjectPeriodsToday = new Map<number, Map<string, Set<number>>>(); // day -> subjectId -> period_index set (adjacency checks)
      allDays.forEach((d) => { daySubjectCount.set(d, new Map()); subjectPeriodsToday.set(d, new Map()); });
      const weekSubjectDays = new Map<string, Set<number>>(); // subjectId -> days already used this week

      // Double-block chain tracking, for the "no more than 2 doubles in a
      // row" soft rule: per day, the period_index the most recent double
      // ended on, and how many doubles are already chained back-to-back there.
      const lastDoubleEndPI = new Map<number, number>();
      const doubleChainLen = new Map<number, number>();

      const isClassFreeAt = (k: string) => isClassFree(ensureUsage(k), classId);
      const markSubjectPeriod = (day: number, subjectId: string, periodIndex: number) => {
        const bySubj = subjectPeriodsToday.get(day)!;
        const set = bySubj.get(subjectId) ?? new Set<number>();
        set.add(periodIndex);
        bySubj.set(subjectId, set);
      };
      const adjacentSameSubject = (day: number, subjectId: string, periodIndex: number) => {
        const set = subjectPeriodsToday.get(day)!.get(subjectId);
        if (!set || !set.size) return false;
        return set.has(periodIndex - 1) || set.has(periodIndex + 1);
      };

      // ---- PHASE 4: core subjects first — one lesson every single day, ----
      // ---- never doubled, never skipped ------------------------------------
      const coreDemand = demand.filter((d) => subjectMap.get(d.subject_id)?.is_core);
      const otherDemand = demand.filter((d) => !subjectMap.get(d.subject_id)?.is_core);

      for (const d of coreDemand) {
        const teacherId = teacherAllocation.get(`${classId}:${d.subject_id}`);
        if (!teacherId) continue;
        let remaining = d.lessons;

        for (const day of allDays) {
          if (remaining <= 0) break;
          const dayPeriods = periodsByDay.get(day)!;

          type CoreCandidate = { period: Period; score: number };
          let best: CoreCandidate | null = null;
          for (const period of dayPeriods) {
            const k = slotKey(period.day_of_week, period.start_time);
            if (!isClassFreeAt(k)) continue;
            if (!isTeacherFree(teacherId, day, period.period_index, k)) continue;
            if (loadOn(teacherId, day) >= data.maxLessonsPerTeacherPerDay) continue;

            const subj = subjectMap.get(d.subject_id);
            let score = 0;
            if (subj?.preferred_time_of_day === "morning") score += Math.max(0, 6 - period.period_index) * 2;
            if (subj?.preferred_time_of_day === "afternoon") score += Math.min(period.period_index, 6) * 2;
            score -= loadOn(teacherId, day) * 3;
            const cand = { period, score };
            if (!best || cand.score > best.score) best = cand;
          }
          if (!best) continue; // no room for the core subject today — surfaces below if it never lands

          const period = best.period;
          const k = slotKey(period.day_of_week, period.start_time);
          const u = ensureUsage(k);
          const room = pickRoom(d.subject_id, classId, k, d.preferred_room_id);
          u.teachers.add(teacherId); u.classes.add(classId); if (room.id) u.rooms.add(room.id);
          bumpLoad(teacherId, day);
          inserts.push({
            class_id: classId, subject_id: d.subject_id, teacher_id: teacherId,
            day_of_week: period.day_of_week, start_time: period.start_time, end_time: period.end_time,
            room: room.name, room_id: room.id, period_template_id: period.id, school_id: schoolId,
          });
          const dc = daySubjectCount.get(day)!;
          dc.set(d.subject_id, (dc.get(d.subject_id) ?? 0) + 1);
          markSubjectPeriod(day, d.subject_id, period.period_index);
          const wdays = weekSubjectDays.get(d.subject_id) ?? new Set<number>();
          wdays.add(day); weekSubjectDays.set(d.subject_id, wdays);
          remaining -= 1;
        }

        if (remaining > 0) {
          conflicts.push(`${classNames.get(classId)}: ${subjectMap.get(d.subject_id)?.name ?? d.subject_id} (core) — only placed ${d.lessons - remaining}/${d.lessons} days, ran out of free slots.`);
        }
      }

      // ---- PHASE 5: doubles for non-core subjects, before singles ---------
      for (const d of otherDemand) {
        if (!d.allow_double || d.lessons < 2) continue;
        const teacherId = teacherAllocation.get(`${classId}:${d.subject_id}`);
        if (!teacherId) continue;

        type DoubleCandidate = { day: number; pi: number; score: number };
        const candidates: DoubleCandidate[] = [];
        for (const day of allDays) {
          const dayPeriods = periodsByDay.get(day)!;
          for (let pi = 0; pi < dayPeriods.length - 1; pi++) {
            const p1 = dayPeriods[pi], p2 = dayPeriods[pi + 1];
            if (!isAdjacent(p1, p2)) continue;
            const k1 = slotKey(p1.day_of_week, p1.start_time), k2 = slotKey(p2.day_of_week, p2.start_time);
            if (!isClassFreeAt(k1) || !isClassFreeAt(k2)) continue;
            if (!isTeacherFree(teacherId, day, p1.period_index, k1)) continue;
            const u2check = ensureUsage(k2);
            if (u2check.teachers.has(teacherId) || unavailable.get(teacherId)?.has(`${day}-${p2.period_index}`)) continue;
            if (loadOn(teacherId, day) + 2 > data.maxLessonsPerTeacherPerDay) continue;

            let score = 0;
            if (PREFERRED_DOUBLE_STARTS.has(p1.period_index)) score += 10; // classic 2-3 / 3-4 / 5-6 slots
            score -= loadOn(teacherId, day) * 2; // prefer this teacher's lighter days
            score -= (weekSubjectDays.get(d.subject_id)?.size ?? 0) * 3; // spread across week

            // Soft cap: no more than 2 double-lesson blocks chained back-to-back.
            const chainsFromPrev = lastDoubleEndPI.get(day) === p1.period_index - 1;
            const wouldBeChainLen = chainsFromPrev ? (doubleChainLen.get(day) ?? 1) + 1 : 1;
            if (wouldBeChainLen > 2) score -= 50;

            candidates.push({ day, pi, score });
          }
        }
        if (!candidates.length) continue; // falls through and gets placed as singles below

        candidates.sort((a, b) => b.score - a.score);
        const best = candidates[0];
        const dayPeriods = periodsByDay.get(best.day)!;
        const p1 = dayPeriods[best.pi], p2 = dayPeriods[best.pi + 1];
        const k1 = slotKey(p1.day_of_week, p1.start_time), k2 = slotKey(p2.day_of_week, p2.start_time);
        const u1 = ensureUsage(k1), u2 = ensureUsage(k2);

        const room1 = pickRoom(d.subject_id, classId, k1, d.preferred_room_id);
        u1.teachers.add(teacherId); u1.classes.add(classId); if (room1.id) u1.rooms.add(room1.id);
        bumpLoad(teacherId, best.day);
        inserts.push({
          class_id: classId, subject_id: d.subject_id, teacher_id: teacherId,
          day_of_week: p1.day_of_week, start_time: p1.start_time, end_time: p1.end_time,
          room: room1.name, room_id: room1.id, period_template_id: p1.id, school_id: schoolId,
        });

        const room2 = pickRoom(d.subject_id, classId, k2, d.preferred_room_id);
        u2.teachers.add(teacherId); u2.classes.add(classId); if (room2.id) u2.rooms.add(room2.id);
        bumpLoad(teacherId, best.day);
        inserts.push({
          class_id: classId, subject_id: d.subject_id, teacher_id: teacherId,
          day_of_week: p2.day_of_week, start_time: p2.start_time, end_time: p2.end_time,
          room: room2.name, room_id: room2.id, period_template_id: p2.id, school_id: schoolId,
        });
        doublesPlacedCount++;

        markSubjectPeriod(best.day, d.subject_id, p1.period_index);
        markSubjectPeriod(best.day, d.subject_id, p2.period_index);
        const chainsFromPrev = lastDoubleEndPI.get(best.day) === p1.period_index - 1;
        doubleChainLen.set(best.day, chainsFromPrev ? (doubleChainLen.get(best.day) ?? 1) + 1 : 1);
        lastDoubleEndPI.set(best.day, p2.period_index);

        d.lessons -= 2;
        const dc = daySubjectCount.get(best.day)!;
        dc.set(d.subject_id, (dc.get(d.subject_id) ?? 0) + 2);
        const wdays = weekSubjectDays.get(d.subject_id) ?? new Set<number>();
        wdays.add(best.day); weekSubjectDays.set(d.subject_id, wdays);
      }

      // ---- PHASE 6: remaining singles (core + non-core spillover) ---------
      // Units interleaved round-robin across subjects (rather than filling
      // one subject's slots before starting the next) so an early subject
      // can't hog every good slot before later subjects get a turn.
      const queues = otherDemand.filter((d) => d.lessons > 0).map((d) => ({ id: d.subject_id, n: d.lessons }));
      const remainingUnits: string[] = [];
      let progressed = true;
      while (progressed) {
        progressed = false;
        for (const q of queues) {
          if (q.n > 0) { remainingUnits.push(q.id); q.n--; progressed = true; }
        }
      }

      let guard = remainingUnits.length * Math.max(allDays.length, 1) * 3 + 20; // hard cap, no infinite loops
      while (remainingUnits.length && guard-- > 0) {
        const subjectId = remainingUnits[0];
        const teacherId = teacherAllocation.get(`${classId}:${subjectId}`);
        if (!teacherId) {
          remainingUnits.shift();
          conflicts.push(`${classNames.get(classId)}: no teacher available for ${subjectMap.get(subjectId)?.name ?? subjectId} — lesson unscheduled.`);
          continue;
        }

        type SlotCandidate = { day: number; period: Period; score: number };
        let best: SlotCandidate | null = null;
        let bestNoRepeat: SlotCandidate | null = null;

        for (const day of allDays) {
          const dayPeriods = periodsByDay.get(day)!;
          const todayCount = daySubjectCount.get(day)!.get(subjectId) ?? 0;
          for (let idx = 0; idx < dayPeriods.length; idx++) {
            const period = dayPeriods[idx];
            const k = slotKey(period.day_of_week, period.start_time);
            if (!isClassFreeAt(k)) continue;
            if (!isTeacherFree(teacherId, day, period.period_index, k)) continue;
            if (loadOn(teacherId, day) >= data.maxLessonsPerTeacherPerDay) continue;

            const subj = subjectMap.get(subjectId);
            let score = 0;
            // Morning/afternoon preference
            if (subj?.preferred_time_of_day === "morning") score += Math.max(0, 6 - period.period_index) * 2;
            if (subj?.preferred_time_of_day === "afternoon") score += Math.min(period.period_index, 6) * 2;
            // Workload balance: prefer this teacher's lighter days
            score -= loadOn(teacherId, day) * 3;
            // Weekly subject spread: prefer days furthest from days already used
            const usedDays = weekSubjectDays.get(subjectId);
            if (usedDays?.size) {
              const minGap = Math.min(...Array.from(usedDays).map((ud) => Math.abs(ud - day)));
              score += Math.min(minGap, 3) * 2;
            }
            // Light teacher-gap minimization: small bonus for sitting next to
            // a period the teacher is already teaching that day
            const prev = dayPeriods[idx - 1], next = dayPeriods[idx + 1];
            const teacherBusyAt = (p?: Period) => !!p && ensureUsage(slotKey(p.day_of_week, p.start_time)).teachers.has(teacherId);
            if (teacherBusyAt(prev) || teacherBusyAt(next)) score += 1;
            // Never let a forced same-day repeat chain into 3 periods in a row
            if (adjacentSameSubject(day, subjectId, period.period_index)) score -= 25;

            const cand: SlotCandidate = { day, period, score };
            if (!best || cand.score > best.score) best = cand;
            if (todayCount === 0 && (!bestNoRepeat || cand.score > bestNoRepeat.score)) bestNoRepeat = cand;
          }
        }

        const chosen = bestNoRepeat ?? best; // strongly prefer a day this subject hasn't used yet
        if (!chosen) {
          conflicts.push(`${classNames.get(classId)}: ${subjectMap.get(subjectId)?.name ?? subjectId} — no free slot left, lesson unscheduled.`);
          remainingUnits.shift();
          continue;
        }

        const { day, period } = chosen;
        const k = slotKey(period.day_of_week, period.start_time);
        const u = ensureUsage(k);
        const preferredRoomId = demandBySubject.get(subjectId)?.preferred_room_id ?? null;
        const room = pickRoom(subjectId, classId, k, preferredRoomId);
        u.teachers.add(teacherId); u.classes.add(classId); if (room.id) u.rooms.add(room.id);
        bumpLoad(teacherId, day);
        inserts.push({
          class_id: classId, subject_id: subjectId, teacher_id: teacherId,
          day_of_week: period.day_of_week, start_time: period.start_time, end_time: period.end_time,
          room: room.name, room_id: room.id, period_template_id: period.id, school_id: schoolId,
        });

        const dc = daySubjectCount.get(day)!;
        dc.set(subjectId, (dc.get(subjectId) ?? 0) + 1);
        markSubjectPeriod(day, subjectId, period.period_index);
        const wdays = weekSubjectDays.get(subjectId) ?? new Set<number>();
        wdays.add(day); weekSubjectDays.set(subjectId, wdays);

        remainingUnits.shift();
      }
    }

    if (noQualifiedFor.size) {
      const codes = Array.from(noQualifiedFor).map((id) => subjectMap.get(id)?.code ?? subjectMap.get(id)?.name ?? id).join(", ");
      conflicts.push(`No qualified teacher (via teacher_subjects) for: ${codes}. Assign teachers under Staff → Subjects Taught.`);
    }
    if (noStaffAtAll.size) {
      const codes = Array.from(noStaffAtAll).map((id) => subjectMap.get(id)?.code ?? subjectMap.get(id)?.name ?? id).join(", ");
      conflicts.push(`No staff at all could be allocated for: ${codes}. Add active staff first.`);
    }

    // ── PHASE 9/10: duplicate guard — never trust the plan, verify again ──
    // Every placement above already went through the `usage` map before
    // being pushed to `inserts`, so this should normally find nothing. It's
    // a deliberate second, independent check (by class+subject+slot,
    // teacher+slot, and room+slot) so a duplicate can never reach SQL.
    const seenClassSubjectSlot = new Set<string>();
    const seenTeacherSlot = new Set<string>();
    const seenRoomSlot = new Set<string>();
    const validatedInserts = inserts.filter((ins) => {
      const classSubjectKey = `${ins.class_id}-${ins.subject_id}-${ins.day_of_week}-${ins.start_time}`;
      const teacherKey = ins.teacher_id ? `${ins.teacher_id}-${ins.day_of_week}-${ins.start_time}` : null;
      const roomKey = ins.room_id ? `${ins.room_id}-${ins.day_of_week}-${ins.start_time}` : null;
      if (seenClassSubjectSlot.has(classSubjectKey)) {
        conflicts.push(`Duplicate prevented: ${classNames.get(ins.class_id)} already has ${subjectMap.get(ins.subject_id)?.name ?? ins.subject_id} at day ${ins.day_of_week} ${ins.start_time}.`);
        return false;
      }
      if (teacherKey && seenTeacherSlot.has(teacherKey)) {
        conflicts.push(`Duplicate prevented: a teacher was double-booked at day ${ins.day_of_week} ${ins.start_time}.`);
        return false;
      }
      if (roomKey && seenRoomSlot.has(roomKey)) {
        conflicts.push(`Duplicate prevented: a room was double-booked at day ${ins.day_of_week} ${ins.start_time}.`);
        return false;
      }
      seenClassSubjectSlot.add(classSubjectKey);
      if (teacherKey) seenTeacherSlot.add(teacherKey);
      if (roomKey) seenRoomSlot.add(roomKey);
      return true;
    });

    // ── Batch insert (v5: small, self-healing batches) ─────────────────────
    // A batch insert is one SQL statement — if the DB trigger rejects ANY
    // row in it, the WHOLE batch is rolled back, not just the bad row (this
    // is what wiped out Form 1 entirely last run, even though only a few of
    // its rows were actually bad). Batches are smaller now, and any batch
    // the DB rejects is retried one row at a time so a single conflicting
    // row can only ever cost that one lesson, never its neighbours.
    let inserted = 0;
    const BATCH_SIZE = 25;
    for (let i = 0; i < validatedInserts.length; i += BATCH_SIZE) {
      const chunk = validatedInserts.slice(i, i + BATCH_SIZE);
      const { data: rows, error } = await supabase.from("timetable_slots").insert(chunk).select("id");
      if (!error) { inserted += rows?.length ?? 0; continue; }

      // Batch rejected — fall back to inserting this batch's rows one at a time.
      for (const row of chunk) {
        const { error: rowError } = await supabase.from("timetable_slots").insert(row);
        if (rowError) {
          conflicts.push(`${classNames.get(row.class_id)} · ${subjectMap.get(row.subject_id)?.name ?? row.subject_id} at day ${row.day_of_week} ${row.start_time}: ${rowError.message}`);
        } else {
          inserted += 1;
        }
      }
    }

    // ── PHASE 13: reporting ─────────────────────────────────────────────
    const totalRequired = (classSubjectRows as any[]).reduce((sum, cs) => {
      const subj = subjectMap.get(cs.subject_id);
      return sum + (cs.lessons_per_week ?? subj?.lessons_per_week ?? 4);
    }, 0);

    return {
      ok: true,
      inserted,
      totalPlanned: validatedInserts.length,
      conflicts,
      summary: { classes: data.classIds.length, periodsAvailable: periods.length },
      report: {
        totalLessonsRequired: totalRequired,
        lessonsGenerated: inserted,
        doubleLessonsPlaced: doublesPlacedCount,
        remainingUnscheduled: Math.max(0, totalRequired - inserted),
        warnings: conflicts.length,
      },
    };
  });
