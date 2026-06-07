import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureSports(context: any) {
  const { data: ok } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (ok) return;
  const { data: sa } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "sports_admin" as never });
  const { data: su } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "sports_user" as never });
  const { data: sp } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "sports" as never });
  if (!sa && !su && !sp) throw new Error("Only sports admin or school admin can manage co-curricular activities");
}

async function ensureSportsAdmin(context: any) {
  const { data: ok } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (ok) return;
  const { data: sa } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "sports_admin" as never });
  if (!sa) throw new Error("Only sports admin or school admin can perform this action");
}

async function resolveSchoolId(ctx: { supabase: any }) {
  const { data: schoolId, error } = await ctx.supabase.rpc("my_school_id");
  if (error) throw new Error(error.message);
  if (!schoolId) throw new Error("No school context for this user");
  return schoolId as string;
}

// ---- 1. List activities ----
export const listActivities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureSports(context);
    const schoolId = await resolveSchoolId(context);

    const { data, error } = await supabaseAdmin
      .from("co_curricular_activities")
      .select("id, name, department_id, created_at, departments(name)")
      .eq("school_id", schoolId)
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---- 2. Create activity ----
export const createActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      name: z.string().trim().min(1).max(120),
      department_id: z.string().uuid().optional().or(z.literal("")),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await ensureSportsAdmin(context);
    const schoolId = await resolveSchoolId(context);

    const { data: row, error } = await supabaseAdmin
      .from("co_curricular_activities")
      .insert({
        name: data.name,
        school_id: schoolId,
        department_id: (data.department_id === "none" || !data.department_id) ? null : data.department_id,
      })
      .select("id, name")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---- 3. Update activity ----
export const updateActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
      department_id: z.string().uuid().optional().or(z.literal("")),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await ensureSportsAdmin(context);
    const schoolId = await resolveSchoolId(context);

    const { error } = await supabaseAdmin
      .from("co_curricular_activities")
      .update({ name: data.name, department_id: (data.department_id === "none" || !data.department_id) ? null : data.department_id })
      .eq("id", data.id)
      .eq("school_id", schoolId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- 4. Delete activity ----
export const deleteActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await ensureSportsAdmin(context);
    const schoolId = await resolveSchoolId(context);

    // Remove coach assignments first
    await supabaseAdmin.from("staff_co_curricular").delete().eq("activity_id", data.id);

    const { error } = await supabaseAdmin
      .from("co_curricular_activities")
      .delete()
      .eq("id", data.id)
      .eq("school_id", schoolId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- 5. List coaches for an activity ----
export const listActivityCoaches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ activity_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await ensureSports(context);
    const { data: rows, error } = await supabaseAdmin
      .from("staff_co_curricular")
      .select("id, role, staff_id, staff(first_name, last_name, employee_no, role)")
      .eq("activity_id", data.activity_id);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---- 6. Assign coach to activity ----
export const assignCoach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      activity_id: z.string().uuid(),
      staff_id: z.string().uuid(),
      role: z.string().trim().max(60).default("coach"),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await ensureSportsAdmin(context);
    const schoolId = await resolveSchoolId(context);

    // Verify activity belongs to school
    const { data: act } = await supabaseAdmin
      .from("co_curricular_activities")
      .select("id")
      .eq("id", data.activity_id)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (!act) throw new Error("Activity not found in your school");

    const { error } = await supabaseAdmin
      .from("staff_co_curricular")
      .upsert(
        { activity_id: data.activity_id, staff_id: data.staff_id, role: data.role || "coach", school_id: schoolId },
        { onConflict: "activity_id,staff_id" } as any
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- 7. Remove coach from activity ----
export const removeCoach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      activity_id: z.string().uuid(),
      staff_id: z.string().uuid(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await ensureSportsAdmin(context);
    const { error } = await supabaseAdmin
      .from("staff_co_curricular")
      .delete()
      .eq("activity_id", data.activity_id)
      .eq("staff_id", data.staff_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- 8. List students enrolled in an activity ----
// Uses a join via student_co_curricular if the table exists; falls back gracefully.
export const listActivityStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ activity_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await ensureSports(context);
    // Query student_co_curricular join table (may not exist — handle gracefully)
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("student_co_curricular")
      .select("id, enrolled_on, student_id, students(first_name, last_name, admission_no, class_id, classes(name))")
      .eq("activity_id", data.activity_id);
    if (error) {
      // Table may not yet exist in older schema versions
      if (error.code === "42P01") return [];
      throw new Error(error.message);
    }
    return rows ?? [];
  });

// ---- 9. Enroll student in activity ----
export const enrollStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      activity_id: z.string().uuid(),
      student_id: z.string().uuid(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await ensureSports(context);
    const schoolId = await resolveSchoolId(context);

    // Verify activity belongs to school
    const { data: act } = await supabaseAdmin
      .from("co_curricular_activities")
      .select("id")
      .eq("id", data.activity_id)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (!act) throw new Error("Activity not found in your school");

    const { error } = await (supabaseAdmin as any)
      .from("student_co_curricular")
      .upsert(
        { activity_id: data.activity_id, student_id: data.student_id, school_id: schoolId, enrolled_on: new Date().toISOString().slice(0, 10) },
        { onConflict: "activity_id,student_id" } as any
      );
    if (error) {
      if (error.code === "42P01") throw new Error("student_co_curricular table is not yet created in this project's database. Run the migration first.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

// ---- 10. Remove student from activity ----
export const unenrollStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      activity_id: z.string().uuid(),
      student_id: z.string().uuid(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await ensureSports(context);
    const { error } = await (supabaseAdmin as any)
      .from("student_co_curricular")
      .delete()
      .eq("activity_id", data.activity_id)
      .eq("student_id", data.student_id);
    if (error && error.code !== "42P01") throw new Error(error.message);
    return { ok: true };
  });
