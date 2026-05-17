import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ----- helpers (kept inline; this file MUST only export createServerFn) -----

function generatePassword(len = 14): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*?";
  const all = upper + lower + digits + symbols;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  const rest = Array.from({ length: len - required.length }, () => pick(all));
  return [...required, ...rest]
    .sort(() => Math.random() - 0.5)
    .join("");
}

const CATEGORY_BY_ROLE: Record<string, string> = {
  super_admin: "SUP",
  principal: "SUP",
  school_admin: "SUP",
  deputy_principal: "STF",
  academic_master: "STF",
  class_teacher: "STF",
  subject_teacher: "STF",
  teacher: "STF",
  hod: "STF",
  staff: "STF",
  exams_admin: "EXM",
  exams_user: "EXM",
  finance_admin: "FIN",
  finance_user: "FIN",
  bursar: "FIN",
  boarding_admin: "BRD",
  boarding_user: "BRD",
  boarding: "BRD",
  matron: "BRD",
  kitchen_admin: "KIT",
  kitchen_user: "KIT",
  security_admin: "SEC",
  security_user: "SEC",
  library_admin: "LIB",
  library_user: "LIB",
  librarian: "LIB",
  clinic_admin: "CLN",
  clinic_user: "CLN",
  nurse: "CLN",
  sports_admin: "SPT",
  sports_user: "SPT",
  sports: "SPT",
  store_admin: "STO",
  store_user: "STO",
  transport_admin: "TRP",
  transport_officer: "TRP",
  guidance_admin: "GUI",
  ict_admin: "ICT",
  discipline_admin: "DIS",
  admission_officer: "ADM",
  parent: "PAR",
  student: "STU",
};

// ----- 1. Login lookup: unique_id -> synthetic_email (no auth required) -----

export const lookupLoginEmail = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        uniqueId: z.string().trim().min(3).max(40),
        schoolSlug: z.string().trim().min(1).max(60).optional().nullable(),
      })
      .parse(input)
  )
  .handler(async ({ data }) => {
    const { data: email, error } = await supabaseAdmin.rpc("lookup_login_email", {
      _unique_id: data.uniqueId,
      _school_slug: data.schoolSlug ?? null,
    } as any);
    if (error) throw new Error(error.message);
    if (!email) throw new Error("Account not found in this school portal");
    return { email: email as string };
  });

// ----- 2. Admin create account: generates ID + password -----

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        role: z.string().min(2).max(40),
        full_name: z.string().trim().min(1).max(120),
        email: z.string().email().max(255).optional().or(z.literal("")),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    // gate to admins via existing helper
    const { data: isAdminData, error: adminErr } = await context.supabase.rpc(
      "is_admin",
      { _user_id: context.userId }
    );
    if (adminErr) throw new Error(adminErr.message);
    if (!isAdminData) throw new Error("Only super admin can create accounts");

    const category = CATEGORY_BY_ROLE[data.role] ?? "STF";

    // get unique_id from the database
    const { data: uniqueId, error: idErr } = await supabaseAdmin.rpc(
      "next_unique_id",
      { _category: category }
    );
    if (idErr || !uniqueId) throw new Error(idErr?.message ?? "ID generation failed");

    // school email domain
    const { data: settings } = await supabaseAdmin
      .from("school_settings")
      .select("email_domain")
      .maybeSingle();
    const domain = settings?.email_domain || "school.erp";
    const syntheticEmail = `${String(uniqueId).toLowerCase()}@${domain}`;

    const password = generatePassword(14);

    // create auth user (email confirmed so they can login immediately)
    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: syntheticEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: data.full_name, unique_id: uniqueId },
      });
    if (createErr || !created.user) {
      throw new Error(createErr?.message ?? "Failed to create account");
    }

    const userId = created.user.id;

    // ensure profile exists
    await supabaseAdmin.from("profiles").upsert({ id: userId, full_name: data.full_name });

    // delete the auto-assigned 'staff' role from handle_new_user if it differs
    if (data.role !== "staff") {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: data.role as never });
    }

    // store credentials record
    await supabaseAdmin.from("user_credentials").insert({
      user_id: userId,
      unique_id: uniqueId,
      category,
      synthetic_email: syntheticEmail,
      is_active: true,
    });

    return {
      uniqueId: uniqueId as string,
      password,
      syntheticEmail,
      contactEmail: data.email || null,
    };
  });

// ----- 3. Admin reset password -----

export const resetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { data: isAdminData } = await context.supabase.rpc("is_admin", {
      _user_id: context.userId,
    });
    if (!isAdminData) throw new Error("Only super admin can reset passwords");

    const password = generatePassword(14);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password,
    });
    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from("user_credentials")
      .update({ last_reset_at: new Date().toISOString(), is_active: true })
      .eq("user_id", data.user_id);

    return { password };
  });

// ----- 4. Revoke / restore -----

export const setAccountActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid(), active: z.boolean() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { data: isAdminData } = await context.supabase.rpc("is_admin", {
      _user_id: context.userId,
    });
    if (!isAdminData) throw new Error("Only super admin can change account status");

    const { error } = await supabaseAdmin
      .from("user_credentials")
      .update({ is_active: data.active })
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);

    // also ban the user at auth level when deactivating (1000h ~ permanent until restored)
    await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.active ? "none" : "8760h",
    });

    return { ok: true };
  });
