import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += chars[b % chars.length];
  return out + "!9";
}

export const provisionSchoolAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      school_id: z.string().uuid(),
      email: z.string().email(),
      full_name: z.string().min(1).max(120).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Only platform_owner may provision
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isOwner = (roles ?? []).some((r: any) => r.role === "platform_owner");
    if (!isOwner) throw new Error("Only platform owners may provision school admins");

    const { data: school, error: schErr } = await supabaseAdmin
      .from("schools").select("id, name, slug").eq("id", data.school_id).single();
    if (schErr || !school) throw new Error("School not found");

    // Try to find existing user by email
    let userId: string | null = null;
    const { data: existing } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const match = existing?.users?.find((u: any) => (u.email ?? "").toLowerCase() === data.email.toLowerCase());

    const password = generatePassword();
    let created = false;

    if (match) {
      userId = match.id;
      // Reset password so platform owner can share it
      await supabaseAdmin.auth.admin.updateUserById(userId, { password, email_confirm: true });
    } else {
      const { data: createdUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: data.full_name ?? school.name + " Admin" },
      });
      if (createErr || !createdUser?.user) throw new Error(createErr?.message ?? "Failed to create user");
      userId = createdUser.user.id;
      created = true;
    }

    // Ensure profile row
    await supabaseAdmin.from("profiles").upsert(
      { id: userId!, full_name: data.full_name ?? school.name + " Admin" },
      { onConflict: "id" },
    );

    // Assign super_admin role (idempotent)
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId!, role: "super_admin" }, { onConflict: "user_id,role" });

    // Link to school as default member (idempotent on user_id+school_id)
    const { data: existingMember } = await supabaseAdmin
      .from("school_members")
      .select("id")
      .eq("user_id", userId!).eq("school_id", school.id).maybeSingle();
    if (!existingMember) {
      await supabaseAdmin.from("school_members").insert({
        user_id: userId!, school_id: school.id, is_default: true,
      });
    }

    const portal_url = `https://${school.slug}.smartdev.co.ke`;
    const full_name = data.full_name ?? school.name + " Admin";

    // Send welcome email with credentials (fire-and-forget — never block provisioning).
    let email_sent = false;
    let email_error: string | null = null;
    try {
      const origin =
        process.env.SITE_URL ||
        process.env.PUBLIC_SITE_URL ||
        "https://admin.smartdev.co.ke";
      const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      // Mint a short-lived service-role JWT-free call by using the dedicated send route
      // with a Bearer token issued for the platform owner who's currently authenticated.
      // We piggy-back on the caller's session token, which the route validates.
      const authHeader = (await (async () => {
        // The server-fn middleware already validated the caller, but we don't have the raw token here.
        // Instead, use service-role auth: the send route accepts service-role JWT.
        return serviceKey ? `Bearer ${serviceKey}` : "";
      })());

      const res = await fetch(`${origin}/lovable/email/transactional/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify({
          templateName: "school-admin-credentials",
          recipientEmail: data.email,
          idempotencyKey: `school-admin-${school.id}-${Date.now()}`,
          templateData: {
            schoolName: school.name,
            portalUrl: portal_url,
            loginEmail: data.email,
            password,
            fullName: full_name,
          },
        }),
      });
      email_sent = res.ok;
      if (!res.ok) email_error = await res.text().catch(() => res.statusText);
    } catch (e: any) {
      email_error = e?.message ?? "unknown error";
    }

    return {
      ok: true,
      created,
      email: data.email,
      password,
      portal_url,
      email_sent,
      email_error,
    };
  });
