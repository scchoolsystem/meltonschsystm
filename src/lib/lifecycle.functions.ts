import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STUDENT_STATES = ["active", "suspended", "expelled", "transferred", "archived"] as const;
const STAFF_STATES = ["active", "suspended", "transferred", "archived"] as const;

async function ensureAdmin(context: any) {
  const { data: ok } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (!ok) throw new Error("Only super admin / principal can change lifecycle status");
}

async function logEvent(actor: string, target_type: string, target_id: string, from: string | null, to: string, reason: string) {
  await supabaseAdmin.from("lifecycle_events").insert({
    actor_id: actor, target_type, target_id, from_status: from, to_status: to, reason,
  });
}

async function deactivateCredentials(user_id: string | null | undefined, active: boolean) {
  if (!user_id) return;
  await supabaseAdmin.from("user_credentials").update({ is_active: active }).eq("user_id", user_id);
  await supabaseAdmin.from("profiles").update({ status: active ? "active" : "suspended" }).eq("id", user_id);
}

export const setStudentLifecycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    student_id: z.string().uuid(),
    to_status: z.enum(STUDENT_STATES),
    reason: z.string().trim().min(3).max(500),
    transferred_to: z.string().trim().max(200).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { data: cur } = await supabaseAdmin.from("students").select("id, lifecycle_status").eq("id", data.student_id).maybeSingle();
    if (!cur) throw new Error("Student not found");
    const { error } = await supabaseAdmin.from("students").update({
      lifecycle_status: data.to_status,
      lifecycle_reason: data.reason,
      lifecycle_changed_by: context.userId,
      lifecycle_changed_at: new Date().toISOString(),
      transferred_to: data.to_status === "transferred" ? (data.transferred_to ?? null) : null,
      status: data.to_status === "archived" ? "archived" : "active",
    }).eq("id", data.student_id);
    if (error) throw new Error(error.message);

    const { data: link } = await supabaseAdmin.from("student_user_links").select("user_id").eq("student_id", data.student_id).maybeSingle();
    if (link?.user_id) {
      await deactivateCredentials(link.user_id, data.to_status === "active");
    }
    await logEvent(context.userId, "student", data.student_id, cur.lifecycle_status, data.to_status, data.reason);
    return { ok: true };
  });

export const setStaffLifecycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    staff_id: z.string().uuid(),
    to_status: z.enum(STAFF_STATES),
    reason: z.string().trim().min(3).max(500),
    transferred_to: z.string().trim().max(200).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { data: cur } = await supabaseAdmin.from("staff").select("id, user_id, lifecycle_status").eq("id", data.staff_id).maybeSingle();
    if (!cur) throw new Error("Staff not found");
    const { error } = await supabaseAdmin.from("staff").update({
      lifecycle_status: data.to_status,
      lifecycle_reason: data.reason,
      lifecycle_changed_by: context.userId,
      lifecycle_changed_at: new Date().toISOString(),
      transferred_to: data.to_status === "transferred" ? (data.transferred_to ?? null) : null,
      status: data.to_status === "archived" ? "archived" : "active",
    }).eq("id", data.staff_id);
    if (error) throw new Error(error.message);
    await deactivateCredentials(cur.user_id, data.to_status === "active");
    await logEvent(context.userId, "staff", data.staff_id, cur.lifecycle_status, data.to_status, data.reason);
    return { ok: true };
  });
