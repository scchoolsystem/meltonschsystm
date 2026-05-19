import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// CSPRNG-backed picker (uses Web Crypto; works in Node and Workers).
function randInt(maxExclusive: number): number {
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
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
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

async function provisionAccount(opts: {
  category: string;
  role: string;
  fullName: string;
  context: { supabase: any; userId: string };
}) {
  // Use the caller's authenticated client so current_user_school() resolves.
  const { data: uniqueId, error: idErr } = await opts.context.supabase.rpc("next_unique_id", { _category: opts.category });
  if (idErr || !uniqueId) throw new Error(idErr?.message ?? "ID generation failed");
  const { data: domain } = await opts.context.supabase.rpc("current_school_email_domain");
  const emailDomain = (domain as string) || "school.erp";
  const syntheticEmail = `${String(uniqueId).toLowerCase()}@${emailDomain}`;
  const password = generatePassword(14);

  // Resolve caller's school explicitly so admin inserts include school_id.
  const { data: member } = await supabaseAdmin
    .from("school_members").select("school_id")
    .eq("user_id", opts.context.userId).order("is_default", { ascending: false }).limit(1).maybeSingle();
  const schoolId = (member as any)?.school_id as string | undefined;
  if (!schoolId) throw new Error("No school context for current user");

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: syntheticEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: opts.fullName, unique_id: uniqueId },
  });
  if (createErr || !created.user) throw new Error(createErr?.message ?? "Failed to create account");
  const userId = created.user.id;

  await supabaseAdmin.from("profiles").upsert({ id: userId, full_name: opts.fullName });
  await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
  await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: opts.role as never });
  await supabaseAdmin.from("user_credentials").insert({
    user_id: userId,
    unique_id: uniqueId as string,
    category: opts.category,
    synthetic_email: syntheticEmail,
    is_active: true,
    school_id: schoolId,
  } as any);
  await supabaseAdmin.from("school_members").upsert(
    { user_id: userId, school_id: schoolId, is_default: true },
    { onConflict: "user_id,school_id" }
  );

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
    const acct = await provisionAccount({ category: "STU", role: "student", fullName, context });

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

    // Auto-assign class-based fee invoices for the current term
    if (data.class_id) {
      try { await supabaseAdmin.rpc("assign_class_fees", { _student: student.id } as any); } catch {}
    }

    // Auto-link parent by email/phone match (if any existing parent account matches)
    try {
      if (data.parent_email || data.parent_phone) {
        const { data: matches } = await supabaseAdmin.rpc("find_parent_match", {
          _email: data.parent_email || "", _phone: data.parent_phone || "",
        });
        const list = (matches ?? []) as Array<{ student_id: string; method: string }>;
        // find any parent user already linked to a matching student record (cross-link to this new student)
        for (const m of list) {
          const { data: existing } = await supabaseAdmin
            .from("parent_student_links").select("parent_user_id")
            .eq("student_id", m.student_id).limit(1).maybeSingle();
          if (existing?.parent_user_id) {
            await supabaseAdmin.from("parent_student_links").upsert({
              parent_user_id: existing.parent_user_id,
              student_id: student.id, link_method: m.method, verified: true,
              linked_by: context.userId,
            } as any, { onConflict: "parent_user_id,student_id" } as any);
          }
        }
      }
    } catch {}

    // re-fetch to surface the auto-generated parent_auth_code
    const { data: full } = await supabaseAdmin
      .from("students").select("id, admission_no, unique_id, first_name, last_name, parent_auth_code")
      .eq("id", student.id).maybeSingle();

    return {
      student: full ?? student,
      uniqueId: acct.uniqueId,
      password: acct.password,
      syntheticEmail: acct.syntheticEmail,
      parentAuthCode: (full as any)?.parent_auth_code ?? null,
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
    const acct = await provisionAccount({ category: "STF", role: data.role, fullName, context });

    const insertPayload: any = {
      first_name: data.first_name,
      last_name: data.last_name,
      role: data.role,
      user_id: acct.userId,
      unique_id: acct.uniqueId,
      photo_url: data.photo_url || null,
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
