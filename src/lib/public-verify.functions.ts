import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ── Public ID verification ──────────────────────────────────────────────
// Unlike /_app/ids/verify, this has NO auth middleware — it's meant to be
// hit straight from a QR code by anyone's camera, no login required.
//
// This intentionally returns full identity + emergency-relevant details
// (medical notes, guardian contact, gender/DOB for students; phone/email
// for staff) so that if a student is lost or hurt, whoever finds them can
// act on it immediately without needing an account. Because this is
// reachable by anyone with the QR code, this data is effectively public —
// that's a deliberate tradeoff for the "lost/injured child" use case, not
// an oversight.

const inputSchema = z.object({
  code: z.string().trim().min(3).max(40),
});

export const publicVerifyId = createServerFn({ method: "GET" })
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const code = data.code.trim().toUpperCase();
    const verifiedAt = new Date().toISOString();

    // ── Try student first ──
    const { data: stu, error: stuErr } = await supabaseAdmin
      .from("students")
      .select(
        `
        full_name,
        unique_id,
        admission_no,
        status,
        photo_url,
        gender,
        date_of_birth,
        admitted_on,
        medical_notes,
        address,
        parent_name,
        parent_phone,
        parent_email,
        school_id,
        classes:class_id(name, stream, level, year),
        schools:school_id(name, logo_url, motto, phone, email, address, academic_year, current_term)
      `
      )
      .eq("unique_id", code)
      .maybeSingle();
    if (stuErr) throw new Error(stuErr.message);

    if (stu) {
      const school = stu.schools as any;
      const cls = stu.classes as any;
      return {
        kind: "student" as const,
        name: stu.full_name,
        uniqueId: stu.unique_id,
        admissionNo: stu.admission_no,
        photo: stu.photo_url ?? null,
        gender: stu.gender ?? null,
        dob: stu.date_of_birth ?? null,
        admittedOn: stu.admitted_on ?? null,
        status: stu.status,
        className: cls?.name ?? null,
        stream: cls?.stream ?? null,
        level: cls?.level ?? null,
        classYear: cls?.year ?? null,
        active: stu.status === "active",
        medicalNotes: stu.medical_notes ?? null,
        address: stu.address ?? null,
        guardian: stu.parent_name
          ? { name: stu.parent_name, phone: stu.parent_phone ?? null, email: stu.parent_email ?? null }
          : null,
        school: school
          ? {
              name: school.name,
              logo: school.logo_url ?? null,
              motto: school.motto ?? null,
              phone: school.phone ?? null,
              email: school.email ?? null,
              address: school.address ?? null,
              academicYear: school.academic_year ?? null,
              currentTerm: school.current_term ?? null,
            }
          : null,
        verifiedAt,
      };
    }

    // ── Fall back to staff ──
    const { data: staff, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select(
        `
        first_name,
        last_name,
        unique_id,
        employee_no,
        status,
        photo_url,
        role,
        department,
        phone,
        email,
        gender,
        hire_date,
        school_id,
        schools:school_id(name, logo_url, motto, phone, email, address, academic_year, current_term)
      `
      )
      .eq("unique_id", code)
      .maybeSingle();
    if (staffErr) throw new Error(staffErr.message);

    if (staff) {
      const school = staff.schools as any;
      return {
        kind: "staff" as const,
        name: `${staff.first_name ?? ""} ${staff.last_name ?? ""}`.trim(),
        uniqueId: staff.unique_id,
        employeeNo: staff.employee_no,
        photo: staff.photo_url ?? null,
        gender: staff.gender ?? null,
        role: staff.role ?? null,
        department: staff.department ?? null,
        phone: staff.phone ?? null,
        email: staff.email ?? null,
        hireDate: staff.hire_date ?? null,
        status: staff.status,
        active: staff.status === "active",
        school: school
          ? {
              name: school.name,
              logo: school.logo_url ?? null,
              motto: school.motto ?? null,
              phone: school.phone ?? null,
              email: school.email ?? null,
              address: school.address ?? null,
              academicYear: school.academic_year ?? null,
              currentTerm: school.current_term ?? null,
            }
          : null,
        verifiedAt,
      };
    }

    throw new Error("No student or staff found with that ID");
  });
