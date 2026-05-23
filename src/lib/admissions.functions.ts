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
  await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: opts.role as never, school_id: schoolId });
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

  return { userId, uniqueId: uniqueId as string, password, syntheticEmail, schoolId };
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
      level: z.string().trim().max(40).optional(), // e.g. "Form 1" — auto-pick stream by capacity
      parent_name: z.string().trim().max(120).optional(),
      parent_phone: z.string().trim().max(40).optional(),
      parent_email: z.string().email().max(255).optional().or(z.literal("")),
      address: z.string().trim().max(500).optional(),
      medical_notes: z.string().trim().max(1000).optional(),
      photo_url: z.string().url().optional().or(z.literal("")),
      national_id: z.string().trim().max(40).optional(),
      documents: z.array(z.object({
        doc_type: z.enum([
          "birth_certificate","report_form","passport_photo",
          "medical_records","transfer_letter","national_id",
          "parent_id","other",
        ]),
        file_path: z.string().min(1).max(500),
        file_name: z.string().max(255).optional(),
        mime_type: z.string().max(120).optional(),
        size_bytes: z.number().int().nonnegative().optional(),
        notes: z.string().max(500).optional(),
      })).max(20).optional(),
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

    // Auto-pick a stream when only level is provided.
    let chosenClassId = data.class_id ?? null;
    if (!chosenClassId && data.level) {
      const { data: picked } = await context.supabase.rpc("pick_class_for_level", { _level: data.level } as any);
      if (picked) chosenClassId = picked as string;
    }

    const insertPayload: any = {
      first_name: data.first_name,
      last_name: data.last_name,
      unique_id: acct.uniqueId,
      photo_url: data.photo_url || null,
      school_id: acct.schoolId,
    };
    if (data.gender) insertPayload.gender = data.gender;
    if (data.date_of_birth) insertPayload.date_of_birth = data.date_of_birth;
    if (chosenClassId) insertPayload.class_id = chosenClassId;
    if (data.parent_name) insertPayload.parent_name = data.parent_name;
    if (data.parent_phone) insertPayload.parent_phone = data.parent_phone;
    if (data.parent_email) insertPayload.parent_email = data.parent_email;
    if (data.address) insertPayload.address = data.address;
    if (data.medical_notes) insertPayload.medical_notes = data.medical_notes;
    if (data.national_id) insertPayload.national_id = data.national_id;

    const { data: student, error: stErr } = await supabaseAdmin
      .from("students")
      .insert(insertPayload)
      .select("id, admission_no, unique_id, first_name, last_name, class_id")
      .single();
    if (stErr) throw new Error(stErr.message);

    const { error: linkErr } = await supabaseAdmin.from("student_user_links").insert({
      user_id: acct.userId,
      student_id: student.id,
      school_id: acct.schoolId,
    } as any);
    if (linkErr) throw new Error(`Failed to link student to portal account: ${linkErr.message}`);

    // Persist uploaded documents (files already in storage, we record the rows).
    if (data.documents?.length) {
      const docRows = data.documents.map((d) => ({
        student_id: student.id,
        doc_type: d.doc_type,
        file_path: d.file_path,
        file_name: d.file_name ?? null,
        mime_type: d.mime_type ?? null,
        size_bytes: d.size_bytes ?? null,
        notes: d.notes ?? null,
        uploaded_by: context.userId,
        school_id: acct.schoolId,
      }));
      const { error: docErr } = await supabaseAdmin.from("student_documents").insert(docRows as any);
      if (docErr) console.error("student_documents insert failed:", docErr.message);
    }

    // Auto-assign class-based fee invoices for the current term
    if (chosenClassId) {
      try { await supabaseAdmin.rpc("assign_class_fees", { _student: student.id } as any); } catch {}
    }

    // Auto-assign dorm if school has dormitories matching the student's gender (boarding schools).
    let assignedDorm: { id: string; name: string } | null = null;
    if (data.gender) {
      try {
        const { data: dormId } = await context.supabase.rpc("pick_dorm_for_gender", { _gender: data.gender } as any);
        if (dormId) {
          const { error: daErr } = await supabaseAdmin.from("dorm_assignments").insert({
            student_id: student.id, dormitory_id: dormId, school_id: acct.schoolId,
          } as any);
          if (!daErr) {
            const { data: d } = await supabaseAdmin.from("dormitories").select("id,name").eq("id", dormId).maybeSingle();
            if (d) assignedDorm = d as any;
          }
        }
      } catch (e) { console.error("auto-dorm failed:", (e as Error).message); }
    }

    // Auto-enroll in default insurance policy (if any).
    let insuranceEnrolled = false;
    try {
      const { data: defaultPolicy } = await supabaseAdmin.from("insurance_policies")
        .select("id").eq("school_id", acct.schoolId).eq("is_default", true).maybeSingle();
      if (defaultPolicy?.id) {
        const { error: insErr } = await supabaseAdmin.from("student_insurance").insert({
          student_id: student.id, policy_id: defaultPolicy.id, school_id: acct.schoolId,
        } as any);
        if (!insErr) insuranceEnrolled = true;
      }
    } catch (e) { console.error("auto-insurance failed:", (e as Error).message); }



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
              school_id: acct.schoolId,
            } as any, { onConflict: "parent_user_id,student_id" } as any);

          }
        }
      }
    } catch {}

    // Generate parent auth code in-app, store only the SHA-256 hash; return plaintext once.
    const codeBytes = new Uint8Array(5);
    crypto.getRandomValues(codeBytes);
    const codeHex = Array.from(codeBytes).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase().slice(0, 5);
    const parentAuthCode = `PRN-${new Date().getFullYear()}-${codeHex}`;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parentAuthCode.toUpperCase()));
    const codeHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    await supabaseAdmin.from("students").update({ parent_auth_code_hash: codeHash } as any).eq("id", student.id);

    return {
      student,
      uniqueId: acct.uniqueId,
      password: acct.password,
      syntheticEmail: acct.syntheticEmail,
      parentAuthCode,
      assignedClassId: chosenClassId,
      assignedDorm,
      insuranceEnrolled,
      documentsSaved: data.documents?.length ?? 0,
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
      school_id: acct.schoolId,
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
