// Server-side enrolment for elective choices. Validates every choice against the
// option groups so a student can't be put in a subject their class isn't offered,
// or take more than the group allows. Runs on the caller's RLS-scoped client.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertCan(ctx: { supabase: any }) {
  const { data, error } = await ctx.supabase.rpc("can_manage_subject_options");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Only admin or exams/academic staff can manage subject options.");
}

async function groupRules(supabase: any, groupIds: string[]) {
  const [{ data: groups }, { data: gc }, { data: gs }] = await Promise.all([
    supabase.from("subject_option_groups").select("id,name,pick_count").in("id", groupIds),
    supabase.from("subject_option_group_classes").select("group_id,class_id").in("group_id", groupIds),
    supabase.from("subject_option_group_subjects").select("group_id,subject_id").in("group_id", groupIds),
  ]);
  const byId = new Map<string, any>((groups ?? []).map((g: any) => [g.id, g]));
  return { byId, gc: gc ?? [], gs: gs ?? [] };
}

// One student: set their choices for one or more groups (replaces earlier choices in those groups).
export const saveStudentOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      studentId: z.string().uuid(),
      academicYear: z.number().int().min(2000).max(2100),
      choices: z.array(z.object({ groupId: z.string().uuid(), subjectIds: z.array(z.string().uuid()).max(20) })).min(1),
    }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCan(context);
    const { supabase, userId } = context as any;
    const { data: st } = await supabase.from("students").select("id, class_id").eq("id", data.studentId).maybeSingle();
    if (!st) throw new Error("Student not found");
    if (!st.class_id) throw new Error("Student has no class");

    const { byId, gc, gs } = await groupRules(supabase, data.choices.map((c) => c.groupId));
    const rows: any[] = [];
    for (const c of data.choices) {
      const g = byId.get(c.groupId);
      if (!g) throw new Error("Option group not found");
      if (!gc.some((x: any) => x.group_id === g.id && x.class_id === st.class_id)) throw new Error(`"${g.name}" is not offered to this student's class.`);
      const uniq = Array.from(new Set(c.subjectIds));
      if (uniq.length > g.pick_count) throw new Error(`"${g.name}": choose at most ${g.pick_count}.`);
      for (const sid of uniq) {
        if (!gs.some((x: any) => x.group_id === g.id && x.subject_id === sid)) throw new Error(`A chosen subject is not part of "${g.name}".`);
        rows.push({ student_id: st.id, subject_id: sid, group_id: g.id, academic_year: data.academicYear, created_by: userId });
      }
    }
    const { error: dErr } = await supabase.from("student_subjects").delete()
      .eq("student_id", st.id).eq("academic_year", data.academicYear).in("group_id", data.choices.map((c) => c.groupId));
    if (dErr) throw new Error(dErr.message);
    if (rows.length) {
      const { error } = await supabase.from("student_subjects").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { saved: rows.length };
  });

// Whole class: everyone takes this subject from the group (e.g. "all of Form 3A take Music").
// Single-pick groups are replaced; multi-pick groups add the subject for students who still have room.
export const bulkAssignOption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      classId: z.string().uuid(), groupId: z.string().uuid(), subjectId: z.string().uuid(),
      academicYear: z.number().int().min(2000).max(2100),
    }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCan(context);
    const { supabase, userId } = context as any;
    const { byId, gc, gs } = await groupRules(supabase, [data.groupId]);
    const g = byId.get(data.groupId);
    if (!g) throw new Error("Option group not found");
    if (!gc.some((x: any) => x.class_id === data.classId)) throw new Error(`"${g.name}" is not offered to this class.`);
    if (!gs.some((x: any) => x.subject_id === data.subjectId)) throw new Error(`That subject is not part of "${g.name}".`);

    const { data: studs } = await supabase.from("students").select("id").eq("class_id", data.classId).eq("status", "active");
    const ids: string[] = (studs ?? []).map((s: any) => s.id);
    if (!ids.length) return { assigned: 0, skipped: 0 };
    const { data: existing } = await supabase.from("student_subjects")
      .select("student_id, subject_id").eq("group_id", data.groupId).eq("academic_year", data.academicYear).in("student_id", ids);
    const have = new Map<string, string[]>();
    for (const e of existing ?? []) have.set(e.student_id, [...(have.get(e.student_id) ?? []), e.subject_id]);

    let skipped = 0;
    const toAdd: string[] = [], toReplace: string[] = [];
    for (const id of ids) {
      const cur = have.get(id) ?? [];
      if (cur.includes(data.subjectId)) continue;
      if (g.pick_count === 1) toReplace.push(id);
      else if (cur.length < g.pick_count) toAdd.push(id);
      else skipped++;
    }
    if (toReplace.length) {
      const { error } = await supabase.from("student_subjects").delete()
        .eq("group_id", data.groupId).eq("academic_year", data.academicYear).in("student_id", toReplace);
      if (error) throw new Error(error.message);
    }
    const rows = [...toReplace, ...toAdd].map((student_id) => ({
      student_id, subject_id: data.subjectId, group_id: data.groupId, academic_year: data.academicYear, created_by: userId,
    }));
    if (rows.length) {
      const { error } = await supabase.from("student_subjects").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { assigned: rows.length, skipped };
  });
