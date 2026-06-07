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
    const [{ data: isAdmin }, { data: isAcademic }] = await Promise.all([
      supabase.rpc("is_admin", { _user_id: userId }),
      supabase.rpc("has_role", { _user_id: userId, _role: "academic_master" }),
    ]);
    if (!isAdmin && !isAcademic) throw new Error("Only admins or academic master can generate timetables");
    const { data: schoolId } = await supabase.rpc("my_school_id");
    if (!schoolId) throw new Error("No school context");
    const { data: classRows, error: clsErr } = await supabase.from("classes").select("id").eq("school_id", schoolId).in("id", data.classIds);
    if (clsErr) throw new Error(clsErr.message);
    const allowed = new Set((classRows ?? []).map((r: any) => r.id));
    const invalid = data.classIds.filter((id) => !allowed.has(id));
    if (invalid.length) throw new Error(`Classes not in your school: ${invalid.join(", ")}`);
    const { data: periodRows = [], error: pErr } = await supabase
      .from("period_templates").select("id,day_of_week,period_index,label,start_time,end_time,is_break")
      .eq("school_id", schoolId).eq("is_break", false).order("day_of_week").order("period_index");
    if (pErr) throw new Error("Could not load period templates: " + pErr.message);
    const { data: roomRows = [], error: rErr } = await supabase
      .from("rooms").select("id,name").eq("school_id", schoolId).eq("is_active", true).order("name");
    if (rErr) throw new Error("Could not load rooms: " + rErr.message);
    if (!(periodRows as any[]).length)
      return { ok: false, error: "No period templates configured. Go to Timetable → Periods tab first.", inserted: 0, conflicts: [] };
    const roomNames = (roomRows as any[]).map((r: any) => r.name);
    if (!roomNames.length)
      return { ok: false, error: "No active rooms configured. Go to Timetable → Rooms tab first.", inserted: 0, conflicts: [] };
    const [{ data: subjects = [] }, { data: staff = [] }] = await Promise.all([
      supabase.from("subjects").select("id,code,level").eq("school_id", schoolId),
      supabase.from("staff").select("id,role").eq("school_id", schoolId),
    ]);
    const teacherPool = (staff as any[]).filter((s) =>
      ["teacher", "subject_teacher", "class_teacher", "hod", "academic_master"].includes(s.role));
    const teachers = teacherPool.length ? teacherPool : (staff as any[]);
    if (!(subjects as any[]).length || !teachers.length)
      return { ok: false, error: "Need at least one subject and one teacher before generating.", inserted: 0, conflicts: [] };
    if (data.replaceExisting) await supabase.from("timetable_slots").delete().in("class_id", data.classIds);
    const usage = new Map<string, { teachers: Set<string>; rooms: Set<string>; classes: Set<string> }>();
    const slotKey = (d: number, start: string) => `${d}-${start}`;
    const ensure = (k: string) => { let u = usage.get(k); if (!u) { u = { teachers: new Set(), rooms: new Set(), classes: new Set() }; usage.set(k, u); } return u; };
    type Slot = { class_id: string; subject_id: string; teacher_id: string | null; day_of_week: number; start_time: string; end_time: string; room: string | null; };
    const inserts: Slot[] = [];
    const conflicts: string[] = [];
    for (const classId of data.classIds) {
      const demand: string[] = [];
      (subjects as any[]).forEach((s) => { for (let i = 0; i < data.lessonsPerSubjectPerWeek; i++) demand.push(s.id); });
      let seed = classId.charCodeAt(0);
      demand.sort(() => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 - 0.5; });
      let demandIdx = 0;
      const subjectTeacher: Record<string, string> = {};
      outer: for (const period of periodRows as any[]) {
        if (demandIdx >= demand.length) break outer;
        const k = slotKey(period.day_of_week, period.start_time);
        const u = ensure(k);
        if (u.classes.has(classId)) continue;
        const subjectId = demand[demandIdx];
        let teacherId = subjectTeacher[subjectId];
        if (!teacherId || u.teachers.has(teacherId)) {
          const free = teachers.find((t) => !u.teachers.has(t.id));
          if (!free) { conflicts.push(`${period.label ?? `Day ${period.day_of_week} ${period.start_time}`}: no free teacher`); demandIdx++; continue; }
          teacherId = free.id;
          subjectTeacher[subjectId] ||= teacherId;
        }
        const room = roomNames.find((r) => !u.rooms.has(r)) || null;
        if (room) u.rooms.add(room);
        u.teachers.add(teacherId);
        u.classes.add(classId);
        inserts.push({ class_id: classId, subject_id: subjectId, teacher_id: teacherId, day_of_week: period.day_of_week, start_time: period.start_time, end_time: period.end_time, room });
        demandIdx++;
      }
    }
    let inserted = 0;
    for (let i = 0; i < inserts.length; i += 50) {
      const chunk = inserts.slice(i, i + 50);
      const { error, data: rows } = await supabase.from("timetable_slots").insert(chunk).select("id");
      if (error) conflicts.push(error.message); else inserted += rows?.length ?? 0;
    }
    return { ok: true, inserted, conflicts, totalPlanned: inserts.length };
  });
