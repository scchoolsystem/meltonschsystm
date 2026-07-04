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
  elective_group: string | null;
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
      school_id: string; elective_group: string | null;
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
          // A subject is only ever a real "elective option" if it's NOT
          // flagged core — a school marking Physics compulsory for the
          // whole school does that via subjects.is_core (or simply never
          // setting elective_group on it), not by clearing elective_group.
          // is_core always wins so a mis-tagged elective_group on a
          // compulsory subject can't accidentally pull it into a shared block.
          elective_group: subj?.is_core ? null : (cs.elective_group ?? null),
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

      // Same-period-every-day tracker (per class). A subject that always
      // lands on period_index 1 every day it's taught (a common complaint
      // with naive "morning preference" scoring) gets penalized here so the
      // solver actively spreads it across different periods during the week,
      // not just different days.
      const subjectPeriodIndexUsage = new Map<string, Map<number, number>>();
      const bumpPeriodIndexUsage = (subjectId: string, periodIndex: number) => {
        const m = subjectPeriodIndexUsage.get(subjectId) ?? new Map<number, number>();
        m.set(periodIndex, (m.get(periodIndex) ?? 0) + 1);
        subjectPeriodIndexUsage.set(subjectId, m);
      };
      const periodIndexRepeatCount = (subjectId: string, periodIndex: number) =>
        subjectPeriodIndexUsage.get(subjectId)?.get(periodIndex) ?? 0;

      // ---- PHASE 4: core subjects first — one lesson every single day, ----
      // ---- never doubled, never skipped ------------------------------------
      const coreDemand = demand.filter((d) => subjectMap.get(d.subject_id)?.is_core);
      // Elective-group subjects are scheduled together as parallel blocks in
      // PHASE 4.5 (see below) — they must NOT also flow through the regular
      // core/single-lesson pipelines or they'd be double-booked.
      const electiveDemand = demand.filter((d) => !subjectMap.get(d.subject_id)?.is_core && d.elective_group);
      const otherDemand = demand.filter((d) => !subjectMap.get(d.subject_id)?.is_core && !d.elective_group);

      const electiveGroups = new Map<string, ClassSubjectDemand[]>();
      electiveDemand.forEach((d) => {
        const arr = electiveGroups.get(d.elective_group!) ?? [];
        arr.push(d);
        electiveGroups.set(d.elective_group!, arr);
      });

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
            // Anti-repetition: every previous day this subject already sat in
            // this exact period_index makes it score worse, so a core subject
            // like Math doesn't settle into "always period 1" for the whole
            // week just because period 1 wins the morning-preference bonus
            // every single day. Outweighs the morning/afternoon bonus above.
            score -= periodIndexRepeatCount(d.subject_id, period.period_index) * 6;
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
            elective_group: null,
          });
          const dc = daySubjectCount.get(day)!;
          dc.set(d.subject_id, (dc.get(d.subject_id) ?? 0) + 1);
          markSubjectPeriod(day, d.subject_id, period.period_index);
          bumpPeriodIndexUsage(d.subject_id, period.period_index);
          const wdays = weekSubjectDays.get(d.subject_id) ?? new Set<number>();
          wdays.add(day); weekSubjectDays.set(d.subject_id, wdays);
          remaining -= 1;
        }

        if (remaining > 0) {
          conflicts.push(`${classNames.get(classId)}: ${subjectMap.get(d.subject_id)?.name ?? d.subject_id} (core) — only placed ${d.lessons - remaining}/${d.lessons} days, ran out of free slots.`);
        }
      }

      // ---- PHASE 4.5: elective groups — parallel option-subjects sharing ----
      // one class time-slot. e.g. "Form 3 Options": Geography / History /
      // Business are three different class_subjects rows, all tagged with
      // the same elective_group. They are NOT alternatives scheduled one
      // after another — they are taught AT THE SAME TIME, each to a
      // different sub-group of the class, by different teachers, in
      // different rooms. The DB only enforces "no two lessons for the same
      // class at the same time" UNLESS both rows share an elective_group
      // (see migration 20260703120000), so this is the only place that ever
      // sets elective_group on an insert.
      for (const [groupKey, options] of electiveGroups) {
        if (!options.length) continue;

        // All options in one elective_group are taught in parallel, so they
        // must share one weekly lesson-count. If the school configured them
        // inconsistently, take the max and flag it — under-provisioned
        // options just get fewer of their own lessons placed as singles below
        // (their allocateTeacher call already ran with the whole group up top).
        const lessonsNeeded = Math.max(...options.map((o) => o.lessons));
        const distinctCounts = new Set(options.map((o) => o.lessons));
        if (distinctCounts.size > 1) {
          conflicts.push(
            `${classNames.get(classId)}: elective group "${groupKey}" has mismatched lessons_per_week across options (${Array.from(distinctCounts).join("/")}) — using ${lessonsNeeded}.`
          );
        }

        const optionTeachers = options.map((o) => ({
          demand: o,
          teacherId: teacherAllocation.get(`${classId}:${o.subject_id}`) ?? null,
        }));
        const missingTeacher = optionTeachers.find((o) => !o.teacherId);
        if (missingTeacher) {
          conflicts.push(
            `${classNames.get(classId)}: elective group "${groupKey}" — no teacher for ${subjectMap.get(missingTeacher.demand.subject_id)?.name ?? missingTeacher.demand.subject_id}, group unscheduled.`
          );
          continue;
        }

        const groupPseudoId = `elective:${groupKey}`; // its own key in the day/period-repeat trackers
        let placedForGroup = 0;

        // Doubles inside an elective group: options don't have to agree.
        // A "double" and a "single" option can share the exact same two
        // consecutive periods perfectly well — the double option (e.g.
        // Physics) gets one real double lesson (same teacher, both periods);
        // any single-only option (e.g. CRE) just gets two of its ordinary
        // single lessons landing back-to-back at those same two periods.
        // Either way every option is "present" at both periods, so the
        // class stays correctly marked busy the whole time. This only
        // triggers if AT LEAST ONE option actually wants a double — if none
        // do, skip straight to the per-unit single loop below.
        const wantsDouble = optionTeachers.filter((o) => o.demand.allow_double && o.demand.lessons >= 2);

        if (wantsDouble.length > 0) {
          type GroupDoubleCandidate = { day: number; pi: number; score: number };
          let best: GroupDoubleCandidate | null = null;
          let bestNoRepeat: GroupDoubleCandidate | null = null;

          for (const day of allDays) {
            const dayPeriods = periodsByDay.get(day)!;
            const todayCount = daySubjectCount.get(day)!.get(groupPseudoId) ?? 0;
            for (let pi = 0; pi < dayPeriods.length - 1; pi++) {
              const p1 = dayPeriods[pi], p2 = dayPeriods[pi + 1];
              if (!isAdjacent(p1, p2)) continue;
              const k1 = slotKey(p1.day_of_week, p1.start_time), k2 = slotKey(p2.day_of_week, p2.start_time);
              if (!isClassFreeAt(k1) || !isClassFreeAt(k2)) continue;

              // Every option's teacher — double-wanting or single-only —
              // must be free for BOTH periods, since single-only options
              // will teach two separate lessons back-to-back here.
              const allTeachersFreeBoth = optionTeachers.every((o) => {
                const t = o.teacherId!;
                if (!isTeacherFree(t, day, p1.period_index, k1)) return false;
                const u2check = ensureUsage(k2);
                if (u2check.teachers.has(t) || unavailable.get(t)?.has(`${day}-${p2.period_index}`)) return false;
                if (loadOn(t, day) + 2 > data.maxLessonsPerTeacherPerDay) return false;
                return true;
              });
              if (!allTeachersFreeBoth) continue;

              const u1 = ensureUsage(k1), u2 = ensureUsage(k2);
              const freeRoomsBoth = rooms.filter((rm) => !u1.rooms.has(rm.id) && !u2.rooms.has(rm.id)).length;
              if (freeRoomsBoth < options.length) continue;

              let score = 0;
              if (PREFERRED_DOUBLE_STARTS.has(p1.period_index)) score += 10;
              score -= optionTeachers.reduce((sum, o) => sum + loadOn(o.teacherId!, day), 0) * 2;
              score -= periodIndexRepeatCount(groupPseudoId, p1.period_index) * 6;
              const usedDays = weekSubjectDays.get(groupPseudoId);
              if (usedDays?.size) {
                const minGap = Math.min(...Array.from(usedDays).map((ud) => Math.abs(ud - day)));
                score += Math.min(minGap, 3) * 2;
              }

              const cand: GroupDoubleCandidate = { day, pi, score };
              if (!best || cand.score > best.score) best = cand;
              if (todayCount === 0 && (!bestNoRepeat || cand.score > bestNoRepeat.score)) bestNoRepeat = cand;
            }
          }

          const chosen = bestNoRepeat ?? best;
          if (!chosen) {
            conflicts.push(
              `${classNames.get(classId)}: elective group "${groupKey}" — no shared double slot for all options; ${options.filter((o) => o.allow_double).map((o) => subjectMap.get(o.subject_id)?.name ?? o.subject_id).join("/")} will be scheduled as singles instead this run.`
            );
          } else {
            const dayPeriods = periodsByDay.get(chosen.day)!;
            const p1 = dayPeriods[chosen.pi], p2 = dayPeriods[chosen.pi + 1];
            const k1 = slotKey(p1.day_of_week, p1.start_time), k2 = slotKey(p2.day_of_week, p2.start_time);
            const u1 = ensureUsage(k1), u2 = ensureUsage(k2);

            for (const o of optionTeachers) {
              const room1 = pickRoom(o.demand.subject_id, classId, k1, o.demand.preferred_room_id);
              u1.teachers.add(o.teacherId!); u1.classes.add(classId); if (room1.id) u1.rooms.add(room1.id);
              bumpLoad(o.teacherId!, chosen.day);
              inserts.push({
                class_id: classId, subject_id: o.demand.subject_id, teacher_id: o.teacherId,
                day_of_week: p1.day_of_week, start_time: p1.start_time, end_time: p1.end_time,
                room: room1.name, room_id: room1.id, period_template_id: p1.id, school_id: schoolId,
                elective_group: groupKey,
              });

              const room2 = pickRoom(o.demand.subject_id, classId, k2, o.demand.preferred_room_id);
              u2.teachers.add(o.teacherId!); u2.classes.add(classId); if (room2.id) u2.rooms.add(room2.id);
              bumpLoad(o.teacherId!, chosen.day);
              inserts.push({
                class_id: classId, subject_id: o.demand.subject_id, teacher_id: o.teacherId,
                day_of_week: p2.day_of_week, start_time: p2.start_time, end_time: p2.end_time,
                room: room2.name, room_id: room2.id, period_template_id: p2.id, school_id: schoolId,
                elective_group: groupKey,
              });
            }

            markSubjectPeriod(chosen.day, groupPseudoId, p1.period_index);
            markSubjectPeriod(chosen.day, groupPseudoId, p2.period_index);
            bumpPeriodIndexUsage(groupPseudoId, p1.period_index);
            bumpPeriodIndexUsage(groupPseudoId, p2.period_index);
            const dc = daySubjectCount.get(chosen.day)!;
            dc.set(groupPseudoId, (dc.get(groupPseudoId) ?? 0) + 2);
            const wdays = weekSubjectDays.get(groupPseudoId) ?? new Set<number>();
            wdays.add(chosen.day); weekSubjectDays.set(groupPseudoId, wdays);
            placedForGroup += 2;
          }
        }

        for (let unit = placedForGroup; unit < lessonsNeeded; unit++) {
          type GroupCandidate = { day: number; period: Period; score: number };
          let best: GroupCandidate | null = null;
          let bestNoRepeat: GroupCandidate | null = null;

          for (const day of allDays) {
            const dayPeriods = periodsByDay.get(day)!;
            const todayCount = daySubjectCount.get(day)!.get(groupPseudoId) ?? 0;
            for (const period of dayPeriods) {
              const k = slotKey(period.day_of_week, period.start_time);
              if (!isClassFreeAt(k)) continue; // class must be entirely free — nothing else can sit alongside an elective block
              // EVERY option's teacher must be simultaneously free — that's
              // the whole point of "taught in parallel."
              const allTeachersFree = optionTeachers.every(
                (o) => isTeacherFree(o.teacherId!, day, period.period_index, k)
                  && loadOn(o.teacherId!, day) < data.maxLessonsPerTeacherPerDay
              );
              if (!allTeachersFree) continue;
              // Rooms: need at least `options.length` distinct free rooms in this slot.
              const u = ensureUsage(k);
              const freeRoomCount = rooms.filter((rm) => !u.rooms.has(rm.id)).length;
              if (freeRoomCount < options.length) continue;

              let score = 0;
              score -= optionTeachers.reduce((sum, o) => sum + loadOn(o.teacherId!, day), 0);
              score -= periodIndexRepeatCount(groupPseudoId, period.period_index) * 6;
              const usedDays = weekSubjectDays.get(groupPseudoId);
              if (usedDays?.size) {
                const minGap = Math.min(...Array.from(usedDays).map((ud) => Math.abs(ud - day)));
                score += Math.min(minGap, 3) * 2;
              }

              const cand: GroupCandidate = { day, period, score };
              if (!best || cand.score > best.score) best = cand;
              if (todayCount === 0 && (!bestNoRepeat || cand.score > bestNoRepeat.score)) bestNoRepeat = cand;
            }
          }

          const chosen = bestNoRepeat ?? best;
          if (!chosen) {
            conflicts.push(
              `${classNames.get(classId)}: elective group "${groupKey}" — no shared free slot for all options (unit ${unit + 1}/${lessonsNeeded}), unscheduled.`
            );
            break;
          }

          const { day, period } = chosen;
          const k = slotKey(period.day_of_week, period.start_time);
          const u = ensureUsage(k);
          for (const o of optionTeachers) {
            const room = pickRoom(o.demand.subject_id, classId, k, o.demand.preferred_room_id);
            u.teachers.add(o.teacherId!); u.classes.add(classId); if (room.id) u.rooms.add(room.id);
            bumpLoad(o.teacherId!, day);
            inserts.push({
              class_id: classId, subject_id: o.demand.subject_id, teacher_id: o.teacherId,
              day_of_week: period.day_of_week, start_time: period.start_time, end_time: period.end_time,
              room: room.name, room_id: room.id, period_template_id: period.id, school_id: schoolId,
              elective_group: groupKey,
            });
          }
          markSubjectPeriod(day, groupPseudoId, period.period_index);
          bumpPeriodIndexUsage(groupPseudoId, period.period_index);
          const dc = daySubjectCount.get(day)!;
          dc.set(groupPseudoId, (dc.get(groupPseudoId) ?? 0) + 1);
          const wdays = weekSubjectDays.get(groupPseudoId) ?? new Set<number>();
          wdays.add(day); weekSubjectDays.set(groupPseudoId, wdays);
          placedForGroup++;
        }

        if (placedForGroup < lessonsNeeded) {
          conflicts.push(
            `${classNames.get(classId)}: elective group "${groupKey}" — only placed ${placedForGroup}/${lessonsNeeded} shared slots.`
          );
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
          elective_group: null,
        });

        const room2 = pickRoom(d.subject_id, classId, k2, d.preferred_room_id);
        u2.teachers.add(teacherId); u2.classes.add(classId); if (room2.id) u2.rooms.add(room2.id);
        bumpLoad(teacherId, best.day);
        inserts.push({
          class_id: classId, subject_id: d.subject_id, teacher_id: teacherId,
          day_of_week: p2.day_of_week, start_time: p2.start_time, end_time: p2.end_time,
          room: room2.name, room_id: room2.id, period_template_id: p2.id, school_id: schoolId,
          elective_group: null,
        });
        doublesPlacedCount++;

        markSubjectPeriod(best.day, d.subject_id, p1.period_index);
        markSubjectPeriod(best.day, d.subject_id, p2.period_index);
        bumpPeriodIndexUsage(d.subject_id, p1.period_index);
        bumpPeriodIndexUsage(d.subject_id, p2.period_index);
        const chainsFromPrev = lastDoubleEndPI.get(best.day) === p1.period_index - 1;
        doubleChainLen.set(best.day, chainsFromPrev ? (doubleChainLen.get(best.day) ?? 1) + 1 : 1);
        lastDoubleEndPI.set(best.day, p2.period_index);

        d.lessons -= 2;
        const dc = daySubjectCount.get(best.day)!;
        dc.set(d.subject_id, (dc.get(d.subject_id) ?? 0) + 2);
        const wdays = weekSubjectDays.get(d.subject_id) ?? new Set<number>();
        wdays.add(best.day); weekSubjectDays.set(d.subject_id, wdays);
      }

      // ---- Repair pass: min-conflicts relocation ---------------------------
      // The old behaviour when no free slot existed was to just drop the
      // lesson ("no free slot left, lesson unscheduled"). This is a classic
      // greedy-solver dead end: some OTHER already-placed lesson for the same
      // class is sitting in a slot where the target subject's teacher is
      // free, and simply relocating that other lesson elsewhere would open
      // the slot up. This is a bounded, single-level version of what a real
      // backtracking solver (like FET) does automatically. It only ever
      // moves a lesson to a slot that is fully free for its own teacher and
      // class — it never creates a new conflict while resolving one.
      const tryRepairSlot = (
        targetClassId: string, targetSubjectId: string, targetTeacherId: string
      ): { day: number; period: Period } | null => {
        for (const day of allDays) {
          for (const period of periodsByDay.get(day)!) {
            const k = slotKey(period.day_of_week, period.start_time);
            const u = ensureUsage(k);
            // Target's own teacher must actually be free here, or moving
            // the blocker wouldn't help.
            if (u.teachers.has(targetTeacherId)) continue;
            if (unavailable.get(targetTeacherId)?.has(`${day}-${period.period_index}`)) continue;
            if (loadOn(targetTeacherId, day) >= data.maxLessonsPerTeacherPerDay) continue;
            if (!u.classes.has(targetClassId)) continue; // already free — PHASE 6's normal scan would have found it

            const blocking = inserts.find(
              (row) => row.class_id === targetClassId
                && row.day_of_week === period.day_of_week
                && row.start_time === period.start_time
            );
            if (!blocking || !blocking.teacher_id || blocking.elective_group) continue; // never unpick an elective block

            for (const day2 of allDays) {
              for (const period2 of periodsByDay.get(day2)!) {
                if (day2 === day && period2.start_time === period.start_time) continue;
                const k2 = slotKey(period2.day_of_week, period2.start_time);
                const u2 = ensureUsage(k2);
                if (u2.classes.has(targetClassId)) continue;
                if (u2.teachers.has(blocking.teacher_id)) continue;
                if (unavailable.get(blocking.teacher_id)?.has(`${day2}-${period2.period_index}`)) continue;
                if (loadOn(blocking.teacher_id, day2) >= data.maxLessonsPerTeacherPerDay) continue;

                // ---- perform the move: vacate old slot, occupy new one ----
                u.teachers.delete(blocking.teacher_id);
                u.classes.delete(targetClassId);
                if (blocking.room_id) u.rooms.delete(blocking.room_id);

                const room2 = pickRoom(blocking.subject_id, targetClassId, k2, null);
                u2.teachers.add(blocking.teacher_id); u2.classes.add(targetClassId);
                if (room2.id) u2.rooms.add(room2.id);

                const loadMap = teacherDailyLoad.get(blocking.teacher_id);
                if (loadMap) loadMap.set(day, Math.max(0, (loadMap.get(day) ?? 1) - 1));
                bumpLoad(blocking.teacher_id, day2);

                const usage = subjectPeriodIndexUsage.get(blocking.subject_id);
                if (usage) usage.set(period.period_index, Math.max(0, (usage.get(period.period_index) ?? 1) - 1));
                bumpPeriodIndexUsage(blocking.subject_id, period2.period_index);

                blocking.day_of_week = period2.day_of_week;
                blocking.start_time = period2.start_time;
                blocking.end_time = period2.end_time;
                blocking.period_template_id = period2.id;
                blocking.room = room2.name;
                blocking.room_id = room2.id;

                conflicts.push(
                  `${classNames.get(targetClassId)}: auto-repair — moved ${subjectMap.get(blocking.subject_id)?.name ?? blocking.subject_id} to free a slot for ${subjectMap.get(targetSubjectId)?.name ?? targetSubjectId}.`
                );
                return { day, period };
              }
            }
          }
        }
        return null;
      };

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
            // Anti-repetition: penalize landing in a period_index this
            // subject has already used on other days this week, so e.g.
            // Math doesn't settle into "always period 1" all week.
            score -= periodIndexRepeatCount(subjectId, period.period_index) * 6;

            const cand: SlotCandidate = { day, period, score };
            if (!best || cand.score > best.score) best = cand;
            if (todayCount === 0 && (!bestNoRepeat || cand.score > bestNoRepeat.score)) bestNoRepeat = cand;
          }
        }

        let chosen: SlotCandidate | { day: number; period: Period } | null = bestNoRepeat ?? best; // strongly prefer a day this subject hasn't used yet
        if (!chosen) {
          chosen = tryRepairSlot(classId, subjectId, teacherId);
        }
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
          elective_group: null,
        });

        const dc = daySubjectCount.get(day)!;
        dc.set(subjectId, (dc.get(subjectId) ?? 0) + 1);
        markSubjectPeriod(day, subjectId, period.period_index);
        bumpPeriodIndexUsage(subjectId, period.period_index);
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

// =============================================================================
// TEACHER ABSENCE → AUTO-SUBSTITUTION
// A teacher is marked absent for a specific date. Every one of their
// timetable_slots lessons that lands on that weekday gets a substitute
// candidate: another teacher qualified for the same subject (teacher_subjects)
// who has no lesson of their own in that exact period on that weekday, and
// isn't already covering something else that period from an earlier
// substitution this same call. Results are written to
// timetable_substitutions so portal/timetable views can show "covered by X"
// or "uncovered" without touching the base weekly timetable at all.
// =============================================================================
export const reportTeacherAbsenceAndSubstitute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      staffId: z.string().uuid(),
      absenceDate: z.string(), // YYYY-MM-DD
      reason: z.string().optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [{ data: isAdmin }, { data: isAcademic }] = await Promise.all([
      supabase.rpc("is_admin", { _user_id: userId }),
      supabase.rpc("has_role", { _user_id: userId, _role: "academic_master" }),
    ]);
    if (!isAdmin && !isAcademic)
      throw new Error("Only admins or academic master can record teacher absences");

    const { data: schoolId } = await supabase.rpc("my_school_id");
    if (!schoolId) throw new Error("No school context");

    // day_of_week convention already used elsewhere in this file: 1=Mon..7=Sun
    const dow = new Date(`${data.absenceDate}T00:00:00`).getDay(); // 0=Sun..6=Sat
    const dayOfWeek = dow === 0 ? 7 : dow;

    // ── Record the absence (idempotent per staff/date) ──────────────────────
    const { error: absErr } = await supabase
      .from("teacher_absences")
      .upsert(
        { school_id: schoolId, staff_id: data.staffId, absence_date: data.absenceDate, reason: data.reason ?? null, reported_by: userId },
        { onConflict: "school_id,staff_id,absence_date" }
      );
    if (absErr) throw new Error("Could not record absence: " + absErr.message);

    // ── Load the absent teacher's lessons that day ───────────────────────────
    const { data: slots = [], error: slotsErr } = await supabase
      .from("timetable_slots")
      .select("id,class_id,subject_id,teacher_id,day_of_week,start_time,end_time,room,room_id,elective_group")
      .eq("school_id", schoolId).eq("teacher_id", data.staffId).eq("day_of_week", dayOfWeek);
    if (slotsErr) throw new Error(slotsErr.message);
    if (!slots.length) {
      return { ok: true, absenceRecorded: true, affectedLessons: 0, covered: 0, uncovered: 0, results: [] };
    }

    // ── Load candidate substitutes: everyone qualified for each subject ─────
    const subjectIds = Array.from(new Set((slots as any[]).map((s) => s.subject_id)));
    const { data: teacherSubjectRows = [] } = await supabase
      .from("teacher_subjects").select("staff_id,subject_id").eq("school_id", schoolId).in("subject_id", subjectIds);
    const qualifiedFor = new Map<string, string[]>();
    (teacherSubjectRows as any[]).forEach((r) => {
      const arr = qualifiedFor.get(r.subject_id) ?? [];
      arr.push(r.staff_id);
      qualifiedFor.set(r.subject_id, arr);
    });

    // ── Everyone else's timetable that same day, to know who's already busy ─
    const candidateIds = Array.from(new Set(Array.from(qualifiedFor.values()).flat())).filter((id) => id !== data.staffId);
    const { data: busyRows = [] } = candidateIds.length
      ? await supabase
          .from("timetable_slots")
          .select("teacher_id,start_time,end_time")
          .eq("school_id", schoolId).eq("day_of_week", dayOfWeek).in("teacher_id", candidateIds)
      : { data: [] as any[] };
    const busyAt = new Map<string, Set<string>>(); // staffId -> set of start_time strings already teaching
    (busyRows as any[]).forEach((r) => {
      const set = busyAt.get(r.teacher_id) ?? new Set<string>();
      set.add(r.start_time);
      busyAt.set(r.teacher_id, set);
    });

    // ── Also check for absences among candidates that same day ──────────────
    const { data: absentRows = [] } = candidateIds.length
      ? await supabase.from("teacher_absences").select("staff_id").eq("school_id", schoolId).eq("absence_date", data.absenceDate).in("staff_id", candidateIds)
      : { data: [] as any[] };
    const alsoAbsent = new Set((absentRows as any[]).map((r) => r.staff_id));

    // ── Assign, preferring the least-loaded-today candidate, and never ──────
    // double-booking a substitute across two lessons in this same run.
    const usedThisRun = new Map<string, Set<string>>(); // staffId -> start_times just assigned
    const results: { slotId: string; subjectId: string; classId: string; startTime: string; substituteTeacherId: string | null; status: "covered" | "uncovered" }[] = [];

    for (const slot of slots as any[]) {
      const pool = (qualifiedFor.get(slot.subject_id) ?? []).filter((id) => !alsoAbsent.has(id));
      const free = pool.filter((id) => {
        if (busyAt.get(id)?.has(slot.start_time)) return false;
        if (usedThisRun.get(id)?.has(slot.start_time)) return false;
        return true;
      });
      // Prefer whoever has fewest lessons already assigned in this run today.
      free.sort((a, b) => (usedThisRun.get(a)?.size ?? 0) - (usedThisRun.get(b)?.size ?? 0));
      const substitute = free[0] ?? null;

      if (substitute) {
        const set = usedThisRun.get(substitute) ?? new Set<string>();
        set.add(slot.start_time);
        usedThisRun.set(substitute, set);
      }

      results.push({
        slotId: slot.id, subjectId: slot.subject_id, classId: slot.class_id,
        startTime: slot.start_time, substituteTeacherId: substitute, status: substitute ? "covered" : "uncovered",
      });
    }

    // ── Persist ───────────────────────────────────────────────────────────
    const rows = results.map((r) => ({
      school_id: schoolId, timetable_slot_id: r.slotId, absence_date: data.absenceDate,
      original_teacher_id: data.staffId, substitute_teacher_id: r.substituteTeacherId, status: r.status,
    }));
    const { error: upsertErr } = await supabase
      .from("timetable_substitutions")
      .upsert(rows, { onConflict: "timetable_slot_id,absence_date" });
    if (upsertErr) throw new Error("Could not save substitutions: " + upsertErr.message);

    return {
      ok: true,
      absenceRecorded: true,
      affectedLessons: results.length,
      covered: results.filter((r) => r.status === "covered").length,
      uncovered: results.filter((r) => r.status === "uncovered").length,
      results,
    };
  });

// Manually override a substitute (admin picks someone specific, or marks a
// lesson cancelled instead of covered) after reviewing reportTeacherAbsenceAndSubstitute's suggestions.
export const setSubstitute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      timetableSlotId: z.string().uuid(),
      absenceDate: z.string(),
      substituteTeacherId: z.string().uuid().nullable(),
      status: z.enum(["covered", "uncovered", "cancelled"]),
      notes: z.string().optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: isAdmin }, { data: isAcademic }] = await Promise.all([
      supabase.rpc("is_admin", { _user_id: userId }),
      supabase.rpc("has_role", { _user_id: userId, _role: "academic_master" }),
    ]);
    if (!isAdmin && !isAcademic) throw new Error("Only admins or academic master can set substitutes");

    const { data: schoolId } = await supabase.rpc("my_school_id");
    if (!schoolId) throw new Error("No school context");

    const { data: slot } = await supabase.from("timetable_slots").select("teacher_id").eq("id", data.timetableSlotId).single();

    const { error } = await supabase.from("timetable_substitutions").upsert(
      {
        school_id: schoolId, timetable_slot_id: data.timetableSlotId, absence_date: data.absenceDate,
        original_teacher_id: (slot as any)?.teacher_id ?? null,
        substitute_teacher_id: data.substituteTeacherId, status: data.status, notes: data.notes ?? null,
      },
      { onConflict: "timetable_slot_id,absence_date" }
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
