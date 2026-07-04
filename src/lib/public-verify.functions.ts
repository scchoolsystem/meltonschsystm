import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ── Public ID verification ──────────────────────────────────────────────
// Unlike /_app/ids/verify, this has NO auth middleware — it's meant to be
// hit straight from a QR code by anyone's camera, no login required.
//
// Because of that, it deliberately returns a SMALLER set of fields than
// the logged-in verify page: enough to confirm identity + eligibility
// (name, photo, class/stream, admission/employee no, active status), but
// NOT medical notes, parent contact info, home address, or staff phone/
// email — those stay behind login since this endpoint is open to the
// public internet.

const inputSchema = z.object({
  code: z.string().trim().min(3).max(40),
});

export const publicVerifyId = createServerFn({ method: "GET" })
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const code = data.code.trim().toUpperCase();

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
        classes:class_id(name, stream)
      `
      )
      .eq("unique_id", code)
      .maybeSingle();
    if (stuErr) throw new Error(stuErr.message);

    if (stu) {
      return {
        kind: "student" as const,
        name: stu.full_name,
        uniqueId: stu.unique_id,
        admissionNo: stu.admission_no,
        photo: stu.photo_url ?? null,
        className: (stu.classes as any)?.name ?? null,
        stream: (stu.classes as any)?.stream ?? null,
        active: stu.status === "active",
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
        department
      `
      )
      .eq("unique_id", code)
      .maybeSingle();
    if (staffErr) throw new Error(staffErr.message);

    if (staff) {
      return {
        kind: "staff" as const,
        name: `${staff.first_name ?? ""} ${staff.last_name ?? ""}`.trim(),
        uniqueId: staff.unique_id,
        employeeNo: staff.employee_no,
        photo: staff.photo_url ?? null,
        role: staff.role ?? null,
        department: staff.department ?? null,
        active: staff.status === "active",
      };
    }

    throw new Error("No student or staff found with that ID");
  });
