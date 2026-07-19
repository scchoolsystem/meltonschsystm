import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PLATFORM_ROLES = ["platform_owner", "platform_support"] as const;
type PlatformRole = (typeof PLATFORM_ROLES)[number];

/**
 * Every function here is service-role (bypasses RLS) on purpose: the
 * "admins manage roles" policy on user_roles intentionally does NOT include
 * platform_owner/platform_support (see 20260614120000_fix_is_admin_...),
 * so granting/revoking platform roles has no client-side RLS path at all.
 * This file is that path, with its own authorization checks instead.
 */

async function requireCaller(
  supabase: any,
  userId: string,
  opts: { ownerOnly?: boolean } = {},
) {
  const { data: roleRows, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (roleRows ?? []).map((r: any) => r.role);
  const isSupport = roles.includes("platform_support");
  const isOwner = roles.includes("platform_owner");
  if (opts.ownerOnly && !isOwner) {
    throw new Error("Only platform owners can do this");
  }
  if (!isOwner && !isSupport) {
    throw new Error("Platform access required");
  }
  return { isOwner, isSupport };
}

async function logAudit(entry: {
  actor_user_id: string;
  actor_email: string | null;
  action: string;
  target_type?: string;
  target_id?: string;
  school_id?: string | null;
  details?: Record<string, unknown>;
}) {
  const { error } = await (supabaseAdmin as any).from("audit_logs").insert({
    actor_user_id: entry.actor_user_id,
    actor_email: entry.actor_email,
    action: entry.action,
    target_type: entry.target_type ?? null,
    target_id: entry.target_id ?? null,
    school_id: entry.school_id ?? null,
    details: entry.details ?? {},
  });
  // Never let a logging failure block the actual action — just surface it
  // server-side so it doesn't vanish silently.
  if (error) console.error("[audit_logs] insert failed:", error);
}

// ---------------------------------------------------------------------------

export const platformListTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireCaller(context.supabase, context.userId);

    const { data: roleRows, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role, created_at")
      .in("role", PLATFORM_ROLES as unknown as string[])
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = roleRows ?? [];
    const members = await Promise.all(
      rows.map(async (r: any) => {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", r.user_id)
          .maybeSingle();
        return {
          user_id: r.user_id,
          role: r.role as PlatformRole,
          granted_at: r.created_at,
          email: authUser?.user?.email ?? "(unknown)",
          full_name: profile?.full_name ?? "",
        };
      }),
    );
    return { members };
  });

export const platformSearchUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ email: z.string().email() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireCaller(context.supabase, context.userId);

    // supabase-js admin API has no direct getUserByEmail, so we page through
    // listUsers and match case-insensitively. Fine at this platform's scale;
    // if the user base grows into the tens of thousands this should move to
    // a SECURITY DEFINER SQL function querying auth.users directly instead.
    const target = data.email.trim().toLowerCase();
    let page = 1;
    const perPage = 1000;
    for (let i = 0; i < 20; i++) {
      const { data: page_, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) throw new Error(error.message);
      const found = page_.users.find((u) => (u.email ?? "").toLowerCase() === target);
      if (found) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", found.id)
          .maybeSingle();
        return { user_id: found.id, email: found.email, full_name: profile?.full_name ?? "" };
      }
      if (page_.users.length < perPage) break;
      page++;
    }
    return null;
  });

export const platformGrantRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      user_id: z.string().uuid(),
      role: z.enum(PLATFORM_ROLES),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Granting platform access is owner-only — support staff can view the
    // team but shouldn't be able to add more people, including themselves.
    await requireCaller(context.supabase, context.userId, { ownerOnly: true });

    const { error: insErr } = await (supabaseAdmin as any)
      .from("user_roles")
      .upsert({ user_id: data.user_id, role: data.role }, { onConflict: "user_id,role" });
    if (insErr) throw new Error(insErr.message);

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    await logAudit({
      actor_user_id: context.userId,
      actor_email: authUser?.user?.email ?? null,
      action: "platform_role_granted",
      target_type: "user",
      target_id: data.user_id,
      details: { role: data.role, target_email: targetUser?.user?.email ?? null },
    });

    return { success: true };
  });

export const platformRevokeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      user_id: z.string().uuid(),
      role: z.enum(PLATFORM_ROLES),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCaller(context.supabase, context.userId, { ownerOnly: true });

    // Safety rail: never allow the last platform_owner to be removed —
    // that would lock everyone out of /platform permanently with no RLS
    // path back in (see the note at the top of this file).
    if (data.role === "platform_owner") {
      const { count, error: cErr } = await supabaseAdmin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "platform_owner");
      if (cErr) throw new Error(cErr.message);
      if ((count ?? 0) <= 1) {
        throw new Error("Can't remove the last platform owner");
      }
    }

    const { error: delErr } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role", data.role);
    if (delErr) throw new Error(delErr.message);

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    await logAudit({
      actor_user_id: context.userId,
      actor_email: authUser?.user?.email ?? null,
      action: "platform_role_revoked",
      target_type: "user",
      target_id: data.user_id,
      details: { role: data.role, target_email: targetUser?.user?.email ?? null },
    });

    return { success: true };
  });

export const platformSetSchoolStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      school_id: z.string().uuid(),
      status: z.enum(["active", "suspended"]),
      reason: z.string().max(500).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCaller(context.supabase, context.userId);

    const { data: school, error: schoolErr } = await supabaseAdmin
      .from("schools")
      .select("name, status")
      .eq("id", data.school_id)
      .maybeSingle();
    if (schoolErr) throw new Error(schoolErr.message);
    if (!school) throw new Error("School not found");

    const { error: updErr } = await (supabaseAdmin as any)
      .from("schools")
      .update({ status: data.status })
      .eq("id", data.school_id);
    if (updErr) throw new Error(updErr.message);

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    await logAudit({
      actor_user_id: context.userId,
      actor_email: authUser?.user?.email ?? null,
      action: data.status === "suspended" ? "school_suspended" : "school_reactivated",
      target_type: "school",
      target_id: data.school_id,
      school_id: data.school_id,
      details: { school_name: school.name, previous_status: school.status, reason: data.reason ?? null },
    });

    return { success: true };
  });

export const platformSetAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      message: z.string().max(500),
      active: z.boolean(),
      severity: z.enum(["info", "warning", "critical"]).default("info"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCaller(context.supabase, context.userId, { ownerOnly: true });

    const { error } = await (supabaseAdmin as any)
      .from("platform_settings")
      .upsert({
        key: "announcement",
        value: { message: data.message, active: data.active, severity: data.severity },
        updated_by: context.userId,
      });
    if (error) throw new Error(error.message);

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    await logAudit({
      actor_user_id: context.userId,
      actor_email: authUser?.user?.email ?? null,
      action: "platform_announcement_updated",
      details: data,
    });

    return { success: true };
  });
