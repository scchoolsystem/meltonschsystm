import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function generatePassword(len = 12): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*?";
  const all = upper + lower + digits + symbols;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  const rest = Array.from({ length: len - required.length }, () => pick(all));
  return [...required, ...rest].sort(() => Math.random() - 0.5).join("");
}

async function assertAdmin(context: any) {
  const { data: ok, error } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (error) throw new Error(error.message);
  if (!ok) {
    // Allow admission_officer / deputy_principal as alternates for students; checked per-fn
    return false;
  }
  return true;
}

async function getDomain(): Promise<string> {
  const { data } = await supabaseAdmin.from("school_settings").select("email_domain").maybeSingle();
  return data?.email_domain || "school.erp";
}

async function provisionAccount(opts: {
  category: string;
  role: string;
  fullName: string;
}) {
  const { data: uniqueId, error: idErr } = await supabaseAdmin.rpc("next_unique_id", { _category: opts.category });
  if (idErr || !uniqueId) throw new Error(idErr?.message ?? "ID generation failed");
  const domain = await getDomain();
  const syntheticEmail = `${String(uniqueId).toLowerCase()}@${domain}`;
  const password = generatePassword(12);

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: syntheticEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: opts.fullName, unique_id: uniqueId },
  });
  if (createErr || !created.user) throw new Error(createErr?.message ?? "Failed to create account");
  const userId = created.user.id;

  await supabaseAdmin.from("profiles").upsert({ id: userId, full_name: opts.fullName });
  // replace default 'staff' role from handle_new_user
  await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
  await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: opts.role as never });
  await supabaseAdmin.from("user_credentials").insert({
    user_id: userId,
    unique_id: uniqueId as string,
    category: opts.category,
    synthetic_email: syntheticEmail,
    is_active: true,
  });

  return { userId, uniqueId: uniqueId as string, password, syntheticEmail };
}

// ---------- ADMIT STUDENT ----------
export const admitStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      first_name: z.string().trim().min(1).max(80),
      last_name: z.string().trim().min(1).max(80),
      gender: z.enum(["male", "female", "other"]).optional(),
      date_of_birth: z.string().optional(),
      class_id: z.string().uuid().optional(),
      parent_name: z.string().trim().max(120).optional(),
      parent_phone: z.string().trim().max(40).optional(),
      parent_email: z.string().email().max(255).optional().or(z.literal("")),
      address: z.string().trim().max(500).optional(),
      medical_notes: z.string().trim().max(1000).optional(),
      photo_url: z.string().url().optional().or(z.literal("")),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    // gate
    const isAdmin = await assertAdmin(context);
    if (!isAdmin) {
      const { data: ok1 } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admission_officer" as never });
      const { data: ok2 } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "deputy_principal" as never });
      if (!ok1 && !ok2) throw new Error("Not authorized to admit students");
    }

    const fullName = `${data.first_name} ${data.last_name}`.trim();
    const acct = await provisionAccount({ category: "STU", role: "student", fullName });

    const insertPayload: any = {
      first_name: data.first_name,
      last_name: data.last_name,
      unique_id: acct.uniqueId,
      photo_url: data.photo_url || null,
    };
    if (data.gender) insertPayload.gender = data.gender;
    if (data.date_of_birth) insertPayload.date_of_birth = data.date_of_birth;
    if (data.class_id) insertPayload.class_id = data.class_id;
    if (data.parent_name) insertPayload.parent_name = data.parent_name;
    if (data.parent_phone) insertPayload.parent_phone = data.parent_phone;
    if (data.parent_email) insertPayload.parent_email = data.parent_email;
    if (data.address) insertPayload.address = data.address;
    if (data.medical_notes) insertPayload.medical_notes = data.medical_notes;

    const { data: student, error: stErr } = await supabaseAdmin
      .from("students")
      .insert(insertPayload)
      .select("id, admission_no, unique_id, first_name, last_name")
      .single();
    if (stErr) throw new Error(stErr.message);

    await supabaseAdmin.from("student_user_links").insert({
      user_id: acct.userId,
      student_id: student.id,
    });

    return {
      student,
      uniqueId: acct.uniqueId,
      password: acct.password,
      syntheticEmail: acct.syntheticEmail,
    };
  });

// ---------- CREATE STAFF ----------
export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      first_name: z.string().trim().min(1).max(80),
      last_name: z.string().trim().min(1).max(80),
      email: z.string().email().max(255).optional().or(z.literal("")),
      phone: z.string().trim().max(40).optional(),
      role: z.string().trim().min(2).max(40),
      department: z.string().trim().max(120).optional(),
      photo_url: z.string().url().optional().or(z.literal("")),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const ok = await assertAdmin(context);
    if (!ok) throw new Error("Only super admin can create staff");

    const fullName = `${data.first_name} ${data.last_name}`.trim();
    const acct = await provisionAccount({ category: "STF", role: data.role, fullName });

    const insertPayload: any = {
      first_name: data.first_name,
      last_name: data.last_name,
      role: data.role,
      user_id: acct.userId,
      unique_id: acct.uniqueId,
    };
    if (data.email) insertPayload.email = data.email;
    if (data.phone) insertPayload.phone = data.phone;
    if (data.department) insertPayload.department = data.department;

    const { data: staff, error: sErr } = await supabaseAdmin
      .from("staff")
      .insert(insertPayload)
      .select("id, employee_no, unique_id, first_name, last_name, role")
      .single();
    if (sErr) throw new Error(sErr.message);

    return {
      staff,
      uniqueId: acct.uniqueId,
      password: acct.password,
      syntheticEmail: acct.syntheticEmail,
    };
  });
