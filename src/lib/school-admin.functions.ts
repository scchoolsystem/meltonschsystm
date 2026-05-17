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

    return {
      ok: true,
      created,
      email: data.email,
      password,
      portal_url: `https://${school.slug}.erp.smartdev.co.ke`,
    };
  });
