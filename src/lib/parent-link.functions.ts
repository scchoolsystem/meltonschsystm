import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Attempt to auto-link a parent user to one or more students by email/phone match. */
export const autoLinkParent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().trim().max(40).optional().or(z.literal("")),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: matches } = await supabaseAdmin.rpc("find_parent_match", {
      _email: data.email || "", _phone: data.phone || "",
    });
    const list = (matches ?? []) as Array<{ student_id: string; method: string }>;
    if (list.length === 0) {
      await supabaseAdmin.from("pending_parent_links").insert({
        parent_user_id: context.userId,
        parent_email: data.email || null,
        parent_phone: data.phone || null,
      });
      return { linked: 0, pending: true };
    }
    let linked = 0;
    for (const m of list) {
      const { error } = await supabaseAdmin.from("parent_student_links").upsert({
        parent_user_id: context.userId,
        student_id: m.student_id,
        link_method: m.method,
        verified: true,
        linked_by: context.userId,
      } as any, { onConflict: "parent_user_id,student_id" } as any);
      if (!error) linked += 1;
    }
    return { linked, pending: false };
  });

export const redeemParentCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    code: z.string().trim().min(6).max(40),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: student } = await supabaseAdmin
      .from("students").select("id, lifecycle_status")
      .eq("parent_auth_code", data.code.toUpperCase()).maybeSingle();
    if (!student) throw new Error("Invalid parent code");
    if (student.lifecycle_status !== "active") throw new Error("Student record is not active");
    const { error } = await supabaseAdmin.from("parent_student_links").upsert({
      parent_user_id: context.userId, student_id: student.id,
      link_method: "parent_code", verified: true, linked_by: context.userId,
    } as any, { onConflict: "parent_user_id,student_id" } as any);
    if (error) throw new Error(error.message);
    return { ok: true, student_id: student.id };
  });

export const adminLinkParent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    parent_user_id: z.string().uuid(),
    student_id: z.string().uuid(),
    reason: z.string().trim().min(3).max(300),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!ok) throw new Error("Admin only");
    const { error } = await supabaseAdmin.from("parent_student_links").upsert({
      parent_user_id: data.parent_user_id, student_id: data.student_id,
      link_method: "admin_override", verified: true, linked_by: context.userId,
    } as any, { onConflict: "parent_user_id,student_id" } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resolvePendingLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    pending_id: z.string().uuid(),
    student_id: z.string().uuid().optional(),
    decision: z.enum(["approve", "reject"]),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!ok) throw new Error("Admin only");
    const { data: row } = await supabaseAdmin.from("pending_parent_links").select("*").eq("id", data.pending_id).maybeSingle();
    if (!row) throw new Error("Request not found");
    if (data.decision === "approve") {
      if (!data.student_id) throw new Error("student_id required to approve");
      await supabaseAdmin.from("parent_student_links").upsert({
        parent_user_id: row.parent_user_id, student_id: data.student_id,
        link_method: "admin_override", verified: true, linked_by: context.userId,
      } as any, { onConflict: "parent_user_id,student_id" } as any);
    }
    await supabaseAdmin.from("pending_parent_links").update({
      status: data.decision === "approve" ? "approved" : "rejected",
      resolved_by: context.userId, resolved_at: new Date().toISOString(),
    }).eq("id", data.pending_id);
    return { ok: true };
  });
