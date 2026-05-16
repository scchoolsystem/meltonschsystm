import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Default 8 periods Mon–Fri (40-min lessons, 10:20-10:40 break, 12:40-13:30 lunch)
const PERIODS: Array<{ start: string; end: string; type: "lesson" | "break" | "lunch" }> = [
  { start: "08:00", end: "08:40", type: "lesson" },
  { start: "08:40", end: "09:20", type: "lesson" },
  { start: "09:20", end: "10:00", type: "lesson" },
  { start: "10:00", end: "10:20", type: "break" },
  { start: "10:20", end: "11:00", type: "lesson" },
  { start: "11:00", end: "11:40", type: "lesson" },
  { start: "11:40", end: "12:20", type: "lesson" },
  { start: "12:20", end: "13:10", type: "lunch" },
  { start: "13:10", end: "13:50", type: "lesson" },
  { start: "13:50", end: "14:30", type: "lesson" },
];

export const generateTimetable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      classIds: z.array(z.string().uuid()).min(1),
      lessonsPerSubjectPerWeek: z.number().min(1).max(10).default(4),
      replaceExisting: z.boolean().default(true),
      rooms: z.array(z.string()).optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const rooms = data.rooms?.length ? data.rooms : ["R1", "R2", "R3", "R4", "R5", "R6"];

    // Load subjects + staff
    const [{ data: subjects = [] }, { data: staff = [] }] = await Promise.all([
      supabase.from("subjects").select("id,code,level"),
      supabase.from("staff").select("id,role,department"),
    ]);

    // Pick teachers (anyone with role teacher / subject_teacher / hod) — fallback all staff
    const teacherPool = (staff as any[]).filter(s =>
      ["teacher", "subject_teacher", "class_teacher", "hod", "academic_master"].includes(s.role)
    );
    const teachers = teacherPool.length ? teacherPool : (staff as any[]);

    if (!subjects?.length || !teachers.length) {
      return { ok: false, error: "Need at least one subject and one teacher", inserted: 0, conflicts: [] };
    }

    if (data.replaceExisting) {
      await supabase.from("timetable_slots").delete().in("class_id", data.classIds);
    }

    // Track usage: key = `${day}-${start}` => teachers used, rooms used, classes used
    const usage = new Map<string, { teachers: Set<string>; rooms: Set<string>; classes: Set<string> }>();
    const slotKey = (d: number, start: string) => `${d}-${start}`;
    const ensure = (k: string) => {
      let u = usage.get(k);
      if (!u) { u = { teachers: new Set(), rooms: new Set(), classes: new Set() }; usage.set(k, u); }
      return u;
    };

    // Round-robin assignment per class
    type Slot = {
      class_id: string; subject_id: string; teacher_id: string | null;
      day_of_week: number; start_time: string; end_time: string; room: string | null;
    };
    const inserts: Slot[] = [];
    const conflicts: string[] = [];

    for (const classId of data.classIds) {
      // Build demand list: each subject N times per week
      const demand: string[] = [];
      (subjects as any[]).forEach(s => {
        for (let i = 0; i < data.lessonsPerSubjectPerWeek; i++) demand.push(s.id);
      });
      // Shuffle (deterministic seed via classId)
      let seed = classId.charCodeAt(0);
      demand.sort(() => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 - 0.5; });

      let demandIdx = 0;
      const subjectTeacher: Record<string, string> = {};

      outer:
      for (let day = 1; day <= 5; day++) {
        for (const p of PERIODS) {
          if (p.type !== "lesson") continue;
          if (demandIdx >= demand.length) break outer;

          const k = slotKey(day, p.start);
          const u = ensure(k);

          if (u.classes.has(classId)) continue; // class already booked at this time

          const subjectId = demand[demandIdx];
          // Sticky teacher per subject when possible
          let teacherId = subjectTeacher[subjectId];
          if (!teacherId || u.teachers.has(teacherId)) {
            const free = teachers.find(t => !u.teachers.has(t.id));
            if (!free) { conflicts.push(`Day ${day} ${p.start}: no free teacher for class ${classId}`); demandIdx++; continue; }
            teacherId = free.id;
            subjectTeacher[subjectId] ||= teacherId;
          }
          const room = rooms.find(r => !u.rooms.has(r)) || null;
          if (room) u.rooms.add(room);
          u.teachers.add(teacherId);
          u.classes.add(classId);

          inserts.push({
            class_id: classId, subject_id: subjectId, teacher_id: teacherId,
            day_of_week: day, start_time: p.start, end_time: p.end, room,
          });
          demandIdx++;
        }
      }
    }

    // Insert in chunks; trigger enforces clash safety
    let inserted = 0;
    for (let i = 0; i < inserts.length; i += 50) {
      const chunk = inserts.slice(i, i + 50);
      const { error, data: rows } = await supabase.from("timetable_slots").insert(chunk).select("id");
      if (error) conflicts.push(error.message);
      else inserted += rows?.length ?? 0;
    }

    return { ok: true, inserted, conflicts, totalPlanned: inserts.length };
  });
