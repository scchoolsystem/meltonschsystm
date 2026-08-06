import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { toE164Kenya } from "@/lib/sms.functions";

async function resolveSchoolId(ctx: { supabase: any }) {
  const { data: schoolId, error } = await ctx.supabase.rpc("my_school_id");
  if (error) throw new Error(error.message);
  if (!schoolId) throw new Error("No school context for this user");
  return schoolId as string;
}

// The student ID card's QR encodes a verify URL (`${origin}/verify?code=X`),
// not the bare code — a USB scanner or camera will hand back that full
// string. Pull `code` out if it's URL-shaped; otherwise treat the scanned
// value itself as the code (manual typing, or a plain-text code card).
function extractCode(raw: string): string {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    const code = url.searchParams.get("code");
    if (code) return code;
  } catch {
    // not a URL — fall through
  }
  return trimmed;
}

export const logStudentGateScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ scannedCode: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const schoolId = await resolveSchoolId(context);
    const code = extractCode(data.scannedCode);

    const { data: student, error: sErr } = await supabaseAdmin
      .from("students")
      .select("id, first_name, last_name, admission_no, unique_id, parent_name, parent_phone, classes(name)")
      .eq("school_id", schoolId)
      .or(`admission_no.eq.${code},unique_id.eq.${code}`)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!student) {
      return { found: false as const };
    }

    const { data: lastScan } = await supabaseAdmin
      .from("student_gate_scans")
      .select("direction")
      .eq("student_id", student.id)
      .order("scanned_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const direction: "in" | "out" = lastScan?.direction === "in" ? "out" : "in";

    let notified = false;
    let notifyError: string | null = null;
    const phone = student.parent_phone ? toE164Kenya(String(student.parent_phone)) : null;

    if (!phone) {
      notifyError = "No valid parent phone number on file";
    } else if (!process.env.AFRICAS_TALKING_API_KEY || !process.env.AFRICAS_TALKING_USERNAME) {
      notifyError = "SMS provider not configured (AFRICAS_TALKING_API_KEY missing)";
    } else {
      try {
        const time = new Date().toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });
        const message = `${student.first_name} ${student.last_name} has ${direction === "in" ? "arrived at" : "left"} school at ${time}.`;
        const params = new URLSearchParams({
          username: process.env.AFRICAS_TALKING_USERNAME,
          to: phone,
          message,
        });
        if (process.env.AFRICAS_TALKING_SENDER_ID) params.append("from", process.env.AFRICAS_TALKING_SENDER_ID);

        const res = await fetch("https://api.africastalking.com/version1/messaging", {
          method: "POST",
          headers: {
            apiKey: process.env.AFRICAS_TALKING_API_KEY,
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        });
        const bodyText = await res.text();
        if (res.ok) {
          // Africa's Talking returns 200/201 even for per-recipient
          // rejections — the real outcome is nested in the body.
          try {
            const parsed = JSON.parse(bodyText);
            const recipients = parsed?.SMSMessageData?.Recipients ?? [];
            const rejected = recipients.filter((r: any) => r.status !== "Success");
            notified = recipients.length > 0 && rejected.length === 0;
            if (!notified) notifyError = rejected.map((r: any) => r.status).slice(0, 3).join("; ") || "Delivery status unknown";
          } catch {
            notified = true;
          }
        } else {
          notifyError = `Africa's Talking ${res.status}: ${bodyText.slice(0, 200)}`;
        }
      } catch (e: any) {
        notifyError = e?.message?.slice(0, 200) ?? "Network error sending SMS";
      }
    }

    const { error: insErr } = await (supabaseAdmin as any).from("student_gate_scans").insert({
      school_id: schoolId,
      student_id: student.id,
      direction,
      scanned_by: context.userId,
      notified,
      notify_error: notifyError,
    });
    if (insErr) throw new Error(insErr.message);

    return {
      found: true as const,
      student: {
        id: student.id,
        name: `${student.first_name} ${student.last_name}`,
        admissionNo: student.admission_no,
        className: (student as any).classes?.name ?? null,
      },
      direction,
      notified,
      notifyError,
    };
  });
