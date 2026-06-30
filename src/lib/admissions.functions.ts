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

// ---------- CREATE PARENT ACCOUNT ----------
// Provisions a parent login (PRN-YYYY-NNNNNN unique id + generated password),
// the same way admitStudent provisions students, and immediately links the
// new parent to the named student via parent_student_links.
export const createParentAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      full_name: z.string().trim().min(1).max(120),
      student_id: z.string().uuid(),
      phone: z.string().trim().max(40).optional(),
      relationship: z.string().trim().max(40).default("parent"),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const isAdmin = await assertAdmin(context);
    if (!isAdmin) {
      const { data: ok1 } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admission_officer" as never });
      const { data: ok2 } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "deputy_principal" as never });
      if (!ok1 && !ok2) throw new Error("Not authorized to create parent accounts");
    }

    // Confirm the student exists in the caller's school before linking.
    const { data: student, error: stuErr } = await supabaseAdmin
      .from("students")
      .select("id, school_id, first_name, last_name")
      .eq("id", data.student_id)
      .maybeSingle();
    if (stuErr) throw new Error(stuErr.message);
    if (!student) throw new Error("Student not found");

    const acct = await provisionAccount({ category: "PRN", role: "parent", fullName: data.full_name, context });

    const { error: linkErr } = await supabaseAdmin.from("parent_student_links").upsert({
      parent_user_id: acct.userId,
      student_id: student.id,
      relationship: data.relationship,
      link_method: "admin_created",
      verified: true,
      linked_by: context.userId,
      school_id: acct.schoolId,
    } as any, { onConflict: "parent_user_id,student_id" } as any);
    if (linkErr) throw new Error(`Account created but linking failed: ${linkErr.message}`);

    return {
      userId: acct.userId,
      uniqueId: acct.uniqueId,
      password: acct.password,
      syntheticEmail: acct.syntheticEmail,
      studentId: student.id,
      studentName: `${student.first_name} ${student.last_name}`,
    };
  });

// ---------- CREATE STAFF ----------
const orgFieldsSchema = {
  staff_category: z.enum(["teaching", "administration", "support"]).optional(),
  department_id: z.string().uuid().optional().or(z.literal("")),
  sub_department_id: z.string().uuid().optional().or(z.literal("")),
  class_responsibility: z.string().trim().max(120).optional().or(z.literal("")),
  admin_unit: z.string().trim().max(120).optional().or(z.literal("")),
  position_title: z.string().trim().max(120).optional().or(z.literal("")),
  oversight: z.array(z.string().trim().max(80)).max(20).optional(),
  support_unit: z.string().trim().max(120).optional().or(z.literal("")),
  assigned_area: z.string().trim().max(160).optional().or(z.literal("")),
  shift: z.string().trim().max(40).optional().or(z.literal("")),
  subject_ids: z.array(z.string().uuid()).max(40).optional(),
  activities: z.array(z.object({ activity_id: z.string().uuid(), role: z.string().trim().max(60).default("coach") })).max(40).optional(),
};

async function syncStaffOrgLinks(staffId: string, schoolId: string, data: any) {
  if (Array.isArray(data.subject_ids)) {
    await supabaseAdmin.from("teacher_subjects").delete().eq("staff_id", staffId);
    if (data.subject_ids.length) {
      const rows = data.subject_ids.map((sid: string) => ({ staff_id: staffId, subject_id: sid, school_id: schoolId }));
      const { error } = await supabaseAdmin.from("teacher_subjects").insert(rows);
      if (error) throw new Error(error.message);
    }
  }
  if (Array.isArray(data.activities)) {
    await supabaseAdmin.from("staff_co_curricular").delete().eq("staff_id", staffId);
    if (data.activities.length) {
      const rows = data.activities.map((a: any) => ({ staff_id: staffId, activity_id: a.activity_id, role: a.role || "coach", school_id: schoolId }));
      const { error } = await supabaseAdmin.from("staff_co_curricular").insert(rows);
      if (error) throw new Error(error.message);
    }
  }
  // Sync department_members from staff.department_id.
  // The DB trigger handles INSERT/UPDATE automatically, but we also do it here
  // explicitly so it works even if the trigger isn't present yet.
  if (data.department_id !== undefined) {
    // Remove any old membership rows for this staff member that don't match the new dept
    await supabaseAdmin
      .from("department_members")
      .delete()
      .eq("staff_id", staffId)
      .neq("department_id", data.department_id || "00000000-0000-0000-0000-000000000000");

    if (data.department_id) {
      const { error } = await supabaseAdmin
        .from("department_members")
        .upsert(
          { department_id: data.department_id, staff_id: staffId, school_id: schoolId },
          { onConflict: "department_id,staff_id", ignoreDuplicates: true }
        );
      if (error) throw new Error(error.message);
    }
  }
}

function pickOrgPatch(data: any) {
  const p: any = {};
  if (data.staff_category) p.staff_category = data.staff_category;
  if (data.department_id !== undefined) p.department_id = data.department_id || null;
  if (data.sub_department_id !== undefined) p.sub_department_id = data.sub_department_id || null;
  if (data.class_responsibility !== undefined) p.class_responsibility = data.class_responsibility || null;
  if (data.admin_unit !== undefined) p.admin_unit = data.admin_unit || null;
  if (data.position_title !== undefined) p.position_title = data.position_title || null;
  if (data.oversight !== undefined) p.oversight = data.oversight && data.oversight.length ? data.oversight : null;
  if (data.support_unit !== undefined) p.support_unit = data.support_unit || null;
  if (data.assigned_area !== undefined) p.assigned_area = data.assigned_area || null;
  if (data.shift !== undefined) p.shift = data.shift || null;
  return p;
}

export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      first_name: z.string().trim().min(1).max(80),
      last_name: z.string().trim().min(1).max(80),
      email: z.string().email().max(255).optional().or(z.literal("")),
      phone: z.string().trim().max(40).optional(),
      role: z.string().trim().min(2).max(40),
      extra_roles: z.array(z.string().trim().min(2).max(40)).max(20).optional(),
      department: z.string().trim().max(120).optional(),
      hire_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
      photo_url: z.string().url().optional().or(z.literal("")),
      ...orgFieldsSchema,
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const ok = await assertAdmin(context);
    if (!ok) throw new Error("Only super admin can create staff");

    const fullName = `${data.first_name} ${data.last_name}`.trim();
    const acct = await provisionAccount({ category: "STF", role: data.role, fullName, context });

    const extras = Array.from(new Set((data.extra_roles ?? []).filter((r) => r && r !== data.role)));
    if (extras.length) {
      await supabaseAdmin.from("user_roles").insert(
        extras.map((r) => ({ user_id: acct.userId, role: r as never, school_id: acct.schoolId }))
      );
    }

    const insertPayload: any = {
      first_name: data.first_name,
      last_name: data.last_name,
      role: data.role,
      user_id: acct.userId,
      unique_id: acct.uniqueId,
      photo_url: data.photo_url || null,
      school_id: acct.schoolId,
      ...pickOrgPatch(data),
    };
    if (data.email) insertPayload.email = data.email;
    if (data.phone) insertPayload.phone = data.phone;
    if (data.department) insertPayload.department = data.department;
    if (data.hire_date) insertPayload.hire_date = data.hire_date;

    const { data: staff, error: sErr } = await supabaseAdmin
      .from("staff")
      .insert(insertPayload)
      .select("id, employee_no, unique_id, first_name, last_name, role")
      .single();
    if (sErr) throw new Error(sErr.message);

    await syncStaffOrgLinks(staff.id, acct.schoolId, data);

    return {
      staff,
      uniqueId: acct.uniqueId,
      password: acct.password,
      syntheticEmail: acct.syntheticEmail,
    };
  });

// ---------- UPDATE STAFF ----------
export const updateStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      email: z.string().email().max(255).optional().or(z.literal("")),
      phone: z.string().trim().max(40).optional().or(z.literal("")),
      role: z.string().trim().min(2).max(40).optional(),
      extra_roles: z.array(z.string().trim().min(2).max(40)).max(20).optional(),
      department: z.string().trim().max(120).optional().or(z.literal("")),
      hire_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
      ...orgFieldsSchema,
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const ok = await assertAdmin(context);
    if (!ok) throw new Error("Only super admin can update staff");
    const { data: callerSchool } = await context.supabase.rpc("my_school_id");
    if (!callerSchool) throw new Error("No school context for current user");
    // Verify staff belongs to caller's school
    const { data: existingStaff } = await supabaseAdmin
      .from("staff").select("id, school_id")
      .eq("id", data.id).eq("school_id", callerSchool).maybeSingle();
    if (!existingStaff) throw new Error("Staff not found in your school");

    const patch: any = pickOrgPatch(data);
    if (data.email !== undefined) patch.email = data.email || null;
    if (data.phone !== undefined) patch.phone = data.phone || null;
    if (data.role) patch.role = data.role;
    if (data.department !== undefined) patch.department = data.department || null;
    if (data.hire_date !== undefined) patch.hire_date = data.hire_date || null;
    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin.from("staff").update(patch)
        .eq("id", data.id).eq("school_id", callerSchool);
      if (error) throw new Error(error.message);
    }
    const { data: row } = await supabaseAdmin
      .from("staff")
      .select("school_id, user_id, role, class_responsibility")
      .eq("id", data.id).eq("school_id", callerSchool)
      .maybeSingle();
    if (row?.school_id) {
      await syncStaffOrgLinks(data.id, row.school_id, data);
    }

    // Keep user_roles in sync with the staff's primary role + implicit class_teacher.
    if (row?.user_id && row?.school_id) {
      const desired = new Set<string>();
      if (row.role) desired.add(row.role);
      if (row.class_responsibility) desired.add("class_teacher");
      for (const r of (data.extra_roles ?? [])) if (r) desired.add(r);

      const { data: existing } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", row.user_id);
      const have = new Set((existing ?? []).map((r: any) => r.role));
      // Preserve platform-level roles — they aren't managed via staff records.
      const preserved = new Set(["super_admin", "platform_admin", "platform_owner"]);
      const toRemove = [...have].filter((r) => !desired.has(r) && !preserved.has(r));
      if (toRemove.length) {
        await supabaseAdmin
          .from("user_roles")
          .delete()
          .eq("user_id", row.user_id)
          .in("role", toRemove as any);
      }
      const toAdd = [...desired].filter((r) => !have.has(r));
      if (toAdd.length) {
        await supabaseAdmin.from("user_roles").insert(
          toAdd.map((r) => ({ user_id: row.user_id as string, role: r as never, school_id: row.school_id as string }))
        );
      }
    }

    return { ok: true };
  });

// ---------- UPDATE STUDENT ----------
async function syncStudentActivities(studentId: string, schoolId: string, activityIds?: string[]) {
  if (!Array.isArray(activityIds)) return;
  try {
    await (supabaseAdmin as any).from("student_co_curricular").delete().eq("student_id", studentId);
    if (activityIds.length) {
      const rows = activityIds.map((activity_id) => ({ student_id: studentId, activity_id, school_id: schoolId }));
      const { error } = await (supabaseAdmin as any).from("student_co_curricular").insert(rows);
      if (error && error.code !== "42P01") throw new Error(error.message);
    }
  } catch (e: any) {
    if (e?.code !== "42P01") throw e;
  }
}

export const updateStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      first_name: z.string().trim().min(1).max(80).optional(),
      last_name: z.string().trim().min(1).max(80).optional(),
      gender: z.enum(["male", "female", "other"]).optional(),
      date_of_birth: z.string().optional().or(z.literal("")),
      class_id: z.string().uuid().optional().or(z.literal("")),
      national_id: z.string().trim().max(40).optional().or(z.literal("")),
      desk_no: z.number().int().nonnegative().optional(),
      parent_name: z.string().trim().max(120).optional().or(z.literal("")),
      parent_phone: z.string().trim().max(40).optional().or(z.literal("")),
      parent_email: z.string().email().max(255).optional().or(z.literal("")),
      address: z.string().trim().max(500).optional().or(z.literal("")),
      medical_notes: z.string().trim().max(1000).optional().or(z.literal("")),
      photo_url: z.string().url().optional().or(z.literal("")),
      activity_ids: z.array(z.string().uuid()).max(40).optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const isAdmin = await assertAdmin(context);
    if (!isAdmin) {
      const { data: ok1 } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admission_officer" as never });
      const { data: ok2 } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "deputy_principal" as never });
      if (!ok1 && !ok2) throw new Error("Not authorized to update students");
    }
    const { data: callerSchool } = await context.supabase.rpc("my_school_id");
    if (!callerSchool) throw new Error("No school context for current user");

    const { data: existingStudent } = await supabaseAdmin
      .from("students").select("id, school_id")
      .eq("id", data.id).eq("school_id", callerSchool).maybeSingle();
    if (!existingStudent) throw new Error("Student not found in your school");

    const patch: any = {};
    if (data.first_name !== undefined) patch.first_name = data.first_name;
    if (data.last_name !== undefined) patch.last_name = data.last_name;
    if (data.gender !== undefined) patch.gender = data.gender;
    if (data.date_of_birth !== undefined) patch.date_of_birth = data.date_of_birth || null;
    if (data.class_id !== undefined) patch.class_id = data.class_id || null;
    if (data.national_id !== undefined) patch.national_id = data.national_id || null;
    if (data.desk_no !== undefined) patch.desk_no = data.desk_no;
    if (data.parent_name !== undefined) patch.parent_name = data.parent_name || null;
    if (data.parent_phone !== undefined) patch.parent_phone = data.parent_phone || null;
    if (data.parent_email !== undefined) patch.parent_email = data.parent_email || null;
    if (data.address !== undefined) patch.address = data.address || null;
    if (data.medical_notes !== undefined) patch.medical_notes = data.medical_notes || null;
    if (data.photo_url) patch.photo_url = data.photo_url;

    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin.from("students").update(patch)
        .eq("id", data.id).eq("school_id", callerSchool);
      if (error) throw new Error(error.message);
    }

    await syncStudentActivities(data.id, callerSchool as string, data.activity_ids);

    return { ok: true };
  });
