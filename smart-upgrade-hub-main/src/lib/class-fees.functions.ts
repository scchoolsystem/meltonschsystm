import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureBursar(context: any) {
  const { data: ok } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (ok) return;
  const { data: b } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "bursar" as never });
  const { data: f } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "finance_admin" as never });
  if (!b && !f) throw new Error("Only bursar / finance admin can manage class fees");
}

export const upsertClassFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    class_id: z.string().uuid(),
    component: z.enum(["tuition", "boarding", "transport", "meals"]),
    amount: z.number().min(0).max(10_000_000),
    term: z.string().min(1).max(20),
    year: z.number().int().min(2000).max(2100),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureBursar(context);
    const { data: callerSchool } = await context.supabase.rpc("my_school_id");
    if (!callerSchool) throw new Error("No school context for current user");
    // Verify the class belongs to the caller's school.
    const { data: cls } = await supabaseAdmin
      .from("classes").select("id, school_id")
      .eq("id", data.class_id).eq("school_id", callerSchool).maybeSingle();
    if (!cls) throw new Error("Class not found in your school");
    const payload = { ...data, school_id: callerSchool };
    const { error } = await supabaseAdmin.from("class_fee_components")
      .upsert(payload as any, { onConflict: "class_id,component,term,year" } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const generateTermInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    class_id: z.string().uuid().optional(),
    term: z.string().optional(),
    year: z.number().int().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureBursar(context);
    const { data: schoolId, error: schErr } = await context.supabase.rpc("my_school_id");
    if (schErr) throw new Error(schErr.message);
    if (!schoolId) throw new Error("No school context for this user");
    let q = supabaseAdmin
      .from("students")
      .select("id, class_id")
      .eq("school_id", schoolId)
      .eq("lifecycle_status", "active");
    if (data.class_id) q = q.eq("class_id", data.class_id);
    const { data: students, error } = await q;
    if (error) throw new Error(error.message);
    let total = 0;
    for (const s of students ?? []) {
      if (!s.class_id) continue;
      const { data: count } = await supabaseAdmin.rpc("assign_class_fees", {
        _student: s.id, _term: data.term ?? null, _year: data.year ?? null,
      } as any);
      total += Number(count ?? 0);
    }
    return { studentsProcessed: students?.length ?? 0, componentsConsidered: total };
  });
