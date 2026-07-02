import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ----- helpers (kept inline; this file MUST only export createServerFn) -----

// CSPRNG-backed picker (uses Web Crypto; works in Node and Workers).
function randInt(maxExclusive: number): number {
  // Rejection sampling to avoid modulo bias.
  const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limit);
  return n % maxExclusive;
}

function generatePassword(len = 14): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*?";
  const all = upper + lower + digits + symbols;
  const pick = (s: string) => s[randInt(s.length)];
  const out = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (out.length < len) out.push(pick(all));
  // Fisher–Yates shuffle
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
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

    // Resolve via caller's authenticated client (SECURITY DEFINER reads auth.uid()).
    const { data: uniqueId, error: idErr } = await context.supabase.rpc(
      "next_unique_id",
      { _category: category }
    );
    if (idErr || !uniqueId) throw new Error(idErr?.message ?? "ID generation failed");

    const { data: domainResp } = await context.supabase.rpc("current_school_email_domain");
    const domain = (domainResp as string) || "school.erp";
    const syntheticEmail = `${String(uniqueId).toLowerCase()}@${domain}`;

    // Caller's school (for explicit school_id on admin inserts).
    const { data: member } = await supabaseAdmin
      .from("school_members").select("school_id")
      .eq("user_id", context.userId).order("is_default", { ascending: false }).limit(1).maybeSingle();
    const schoolId = (member as any)?.school_id as string | undefined;
    if (!schoolId) throw new Error("No school context for current user");

    const password = generatePassword(14);

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

    await supabaseAdmin.from("profiles").upsert({ id: userId, full_name: data.full_name });

    if (data.role !== "staff") {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: data.role as never, school_id: schoolId });
    }

    await supabaseAdmin.from("user_credentials").insert({
      user_id: userId,
      unique_id: uniqueId,
      category,
      synthetic_email: syntheticEmail,
      is_active: true,
      school_id: schoolId,
    } as any);

    await supabaseAdmin.from("school_members").upsert(
      { user_id: userId, school_id: schoolId, is_default: true },
      { onConflict: "user_id,school_id" }
    );

    return {
      uniqueId: uniqueId as string,
      password,
      syntheticEmail,
      contactEmail: data.email || null,
    };
  });

// ----- 2b. Bulk create accounts (used by CSV import) -----
// Same logic as createAccount, run per-row for a batch of already-inserted
// staff rows. Looks each row up by employee_no, skips rows that already have
// a linked login, and links the new auth user back onto public.staff.

export const bulkCreateStaffAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        items: z
          .array(
            z.object({
              employee_no: z.string().trim().min(1).max(60),
              full_name: z.string().trim().min(1).max(120),
              role: z.string().trim().min(1).max(40),
              email: z.string().email().max(255).optional().or(z.literal("")),
            })
          )
          .min(1)
          .max(500),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { data: isAdminData, error: adminErr } = await context.supabase.rpc(
      "is_admin",
      { _user_id: context.userId }
    );
    if (adminErr) throw new Error(adminErr.message);
    if (!isAdminData) throw new Error("Only super admin can create accounts");

    const { data: domainResp } = await context.supabase.rpc("current_school_email_domain");
    const domain = (domainResp as string) || "school.erp";

    const { data: member } = await supabaseAdmin
      .from("school_members").select("school_id")
      .eq("user_id", context.userId).order("is_default", { ascending: false }).limit(1).maybeSingle();
    const schoolId = (member as any)?.school_id as string | undefined;
    if (!schoolId) throw new Error("No school context for current user");

    const created: { employee_no: string; full_name: string; uniqueId: string; password: string }[] = [];
    const skipped: { employee_no: string; reason: string }[] = [];
    const errors: { employee_no: string; error: string }[] = [];

    // Sequential on purpose: next_unique_id increments a per-school counter,
    // and auth.admin.createUser calls shouldn't be fired in a burst.
    for (const item of data.items) {
      try {
        const { data: staffRow, error: staffErr } = await supabaseAdmin
          .from("staff")
          .select("id, user_id")
          .eq("employee_no", item.employee_no)
          .eq("school_id", schoolId)
          .maybeSingle();
        if (staffErr) throw new Error(staffErr.message);
        if (!staffRow) {
          skipped.push({ employee_no: item.employee_no, reason: "No matching staff record — import staff first" });
          continue;
        }
        if (staffRow.user_id) {
          skipped.push({ employee_no: item.employee_no, reason: "Already has a login" });
          continue;
        }

        const category = CATEGORY_BY_ROLE[item.role] ?? "STF";

        const { data: uniqueId, error: idErr } = await context.supabase.rpc(
          "next_unique_id",
          { _category: category }
        );
        if (idErr || !uniqueId) throw new Error(idErr?.message ?? "ID generation failed");

        const syntheticEmail = `${String(uniqueId).toLowerCase()}@${domain}`;
        const password = generatePassword(14);

        const { data: createdUser, error: createErr } =
          await supabaseAdmin.auth.admin.createUser({
            email: syntheticEmail,
            password,
            email_confirm: true,
            user_metadata: { full_name: item.full_name, unique_id: uniqueId },
          });
        if (createErr || !createdUser.user) {
          throw new Error(createErr?.message ?? "Failed to create account");
        }

        const userId = createdUser.user.id;

        await supabaseAdmin.from("profiles").upsert({ id: userId, full_name: item.full_name });

        if (item.role !== "staff") {
          await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
          await supabaseAdmin
            .from("user_roles")
            .insert({ user_id: userId, role: item.role as never, school_id: schoolId });
        }

        await supabaseAdmin.from("user_credentials").insert({
          user_id: userId,
          unique_id: uniqueId,
          category,
          synthetic_email: syntheticEmail,
          is_active: true,
          school_id: schoolId,
        } as any);

        await supabaseAdmin.from("school_members").upsert(
          { user_id: userId, school_id: schoolId, is_default: true },
          { onConflict: "user_id,school_id" }
        );

        // Link the new login back onto the staff row the CSV import created.
        const { error: linkErr } = await supabaseAdmin
          .from("staff")
          .update({ user_id: userId, unique_id: uniqueId, role: item.role as never })
          .eq("id", staffRow.id);
        if (linkErr) throw new Error(`Account created but failed to link to staff row: ${linkErr.message}`);

        created.push({ employee_no: item.employee_no, full_name: item.full_name, uniqueId: uniqueId as string, password });
      } catch (e: any) {
        errors.push({ employee_no: item.employee_no, error: e.message ?? String(e) });
      }
    }

    return { created, skipped, errors };
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

    // Cross-tenant guard: target user must belong to caller's school.
    const { data: callerSchool } = await context.supabase.rpc("my_school_id");
    if (!callerSchool) throw new Error("No school context for current user");
    const { data: target } = await supabaseAdmin
      .from("user_credentials").select("school_id")
      .eq("user_id", data.user_id).maybeSingle();
    if (!target || target.school_id !== callerSchool) {
      throw new Error("User not found in your school");
    }

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

    // Cross-tenant guard
    const { data: callerSchool } = await context.supabase.rpc("my_school_id");
    if (!callerSchool) throw new Error("No school context for current user");
    const { data: target } = await supabaseAdmin
      .from("user_credentials").select("school_id")
      .eq("user_id", data.user_id).maybeSingle();
    if (!target || target.school_id !== callerSchool) {
      throw new Error("User not found in your school");
    }

    const { error } = await supabaseAdmin
      .from("user_credentials")
      .update({ is_active: data.active })
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.active ? "none" : "8760h",
    });

    return { ok: true };
  });
