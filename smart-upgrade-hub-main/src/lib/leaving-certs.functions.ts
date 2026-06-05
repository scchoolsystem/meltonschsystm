import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Issue a leaving certificate for a student. Admin-only.
 * Generates a serial number scoped to the school.
 */
export const issueLeavingCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        student_id: z.string().uuid(),
        leaving_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reason: z.enum(["completion", "transfer", "withdrawal", "expulsion", "other"]),
        conduct: z.enum(["excellent", "good", "satisfactory", "poor"]),
        achievements: z.string().max(2000).optional(),
        signed_by_name: z.string().max(120).optional(),
        signed_by_title: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: userId });
    if (!isAdmin) throw new Error("Only school admins can issue certificates");

    // Verify the student belongs to caller's school
    const { data: schoolId } = await supabase.rpc("my_school_id");
    if (!schoolId) throw new Error("No school context for this user");
    const { data: stu } = await supabase
      .from("students")
      .select("id")
      .eq("id", data.student_id)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (!stu) throw new Error("Student not found in your school");

    // Generate serial: LC-<year>-<5digit> scoped to this school
    const year = new Date().getFullYear();
    const { count } = await supabase
      .from("leaving_certificates")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId);
    const serial = `LC-${year}-${String((count ?? 0) + 1).padStart(5, "0")}`;

    const { data: row, error } = await supabase
      .from("leaving_certificates")
      .insert({
        student_id: data.student_id,
        serial_no: serial,
        leaving_date: data.leaving_date,
        reason: data.reason,
        conduct: data.conduct,
        achievements: data.achievements ?? null,
        signed_by_name: data.signed_by_name ?? null,
        signed_by_title: data.signed_by_title ?? null,
        issued_by: userId,
      })
      .select("id, serial_no")
      .single();
    if (error) throw new Error(error.message);

    // Mark student lifecycle if appropriate
    if (data.reason === "completion" || data.reason === "transfer") {
      await supabase
        .from("students")
        .update({
          lifecycle_status: data.reason === "completion" ? "graduated" : "transferred_out",
          lifecycle_reason: `Leaving certificate ${serial}`,
          lifecycle_changed_by: userId,
          lifecycle_changed_at: new Date().toISOString(),
        })
        .eq("id", data.student_id);
    }

    return row;
  });
