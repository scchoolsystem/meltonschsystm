import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Resend } from "resend";

const AudienceSchema = z.object({
  type: z.enum(["all_students", "all_parents", "class", "custom"]),
  classId: z.string().uuid().optional(),
  phones: z.array(z.string()).optional(),
});

async function resolveSchoolId(ctx: { supabase: any }) {
  const { data: schoolId, error } = await ctx.supabase.rpc("my_school_id");
  if (error) throw new Error(error.message);
  if (!schoolId) throw new Error("No school context for this user");
  return schoolId as string;
}

async function resolvePhones(
  schoolId: string,
  audience: z.infer<typeof AudienceSchema>
): Promise<string[]> {
  let rows: any[] = [];
  if (audience.type === "all_students") {
    const { data } = await supabaseAdmin
      .from("students")
      .select("parent_phone")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .not("phone", "is", null);
    rows = (data ?? []).map((r) => r.parent_phone);
  } else if (audience.type === "all_parents") {
    const { data } = await supabaseAdmin
      .from("students")
      .select("parent_phone")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .not("parent_phone", "is", null);
    rows = (data ?? []).map((r) => r.parent_phone);
  } else if (audience.type === "class" && audience.classId) {
    const { data } = await supabaseAdmin
      .from("students")
      .select("parent_phone")
      .eq("school_id", schoolId)
      .eq("class_id", audience.classId)
      .not("phone", "is", null);
    rows = (data ?? []).map((r) => r.parent_phone);
  } else if (audience.type === "custom") {
    rows = audience.phones ?? [];
  }
  return Array.from(new Set(rows.map((r) => String(r ?? "").trim()).filter(Boolean)));
}

export const sendBulkSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        audience: AudienceSchema,
        message: z.string().min(1).max(480),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const schoolId = await resolveSchoolId(context);
    const numbers = await resolvePhones(schoolId, data.audience);

    let status = "queued";
    let sent = 0;
    let failed = 0;

    if (numbers.length === 0) {
      status = "failed";
    } else if (process.env.AFRICAS_TALKING_API_KEY && process.env.AFRICAS_TALKING_USERNAME) {
      try {
        const params = new URLSearchParams({
          username: process.env.AFRICAS_TALKING_USERNAME,
          to: numbers.join(","),
          message: data.message,
        });
        if (process.env.AFRICAS_TALKING_SENDER_ID) {
          params.append("from", process.env.AFRICAS_TALKING_SENDER_ID);
        }
        const res = await fetch("https://api.africastalking.com/version1/messaging", {
          method: "POST",
          headers: {
            apiKey: process.env.AFRICAS_TALKING_API_KEY,
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        });
        if (res.ok) {
          status = "sent";
          sent = numbers.length;
        } else {
          status = "failed";
          failed = numbers.length;
        }
      } catch {
        status = "failed";
        failed = numbers.length;
      }
    } else {
      // No SMS provider configured — mark as queued so admin can see intent
      status = "queued";
      sent = numbers.length;
    }

    await (supabaseAdmin as any).from("sms_queue").insert({
      school_id: schoolId,
      audience: data.audience as any,
      message: data.message,
      status,
      sent_count: sent,
      failed_count: failed,
      created_by: context.userId,
    });
    await (supabaseAdmin as any).from("notifications_log").insert({
      school_id: schoolId,
      channel: "sms",
      subject: data.message.slice(0, 80),
      body: data.message,
      recipient_count: numbers.length,
      status,
    });

    return { sent: numbers.length, status };
  });

async function resolveEmails(
  schoolId: string,
  audience: z.infer<typeof AudienceSchema>
): Promise<string[]> {
  let rows: any[] = [];
  if (audience.type === "all_students" || audience.type === "all_parents") {
    const { data } = await supabaseAdmin
      .from("students")
      .select("parent_email")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .not("parent_email", "is", null);
    rows = (data ?? []).map((r) => r.parent_email);
  } else if (audience.type === "class" && audience.classId) {
    const { data } = await supabaseAdmin
      .from("students")
      .select("parent_email")
      .eq("school_id", schoolId)
      .eq("class_id", audience.classId)
      .not("parent_email", "is", null);
    rows = (data ?? []).map((r) => r.parent_email);
  } else if (audience.type === "custom") {
    rows = audience.phones ?? [];
  }
  return Array.from(new Set(rows.map((r) => String(r ?? "").trim()).filter(Boolean)));
}

export const sendEmailBlast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        audience: AudienceSchema,
        subject: z.string().min(1).max(200),
        body: z.string().min(1),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const schoolId = await resolveSchoolId(context);
    const emails = await resolveEmails(schoolId, data.audience);

    let status = "sent";
    let errorMsg: string | null = null;

    if (emails.length === 0) {
      status = "failed";
      errorMsg = "No recipients";
    } else if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const from = process.env.RESEND_FROM_EMAIL || "SmartDev <onboarding@resend.dev>";
        for (let i = 0; i < emails.length; i += 50) {
          const batch = emails.slice(i, i + 50);
          await resend.emails.send({
            from,
            to: batch,
            subject: data.subject,
            html: `<div>${data.body.replace(/\n/g, "<br/>")}</div>`,
          });
        }
      } catch (e: any) {
        status = "failed";
        errorMsg = e?.message ?? "Send failed";
      }
    } else {
      status = "queued";
    }

    await (supabaseAdmin as any).from("notifications_log").insert({
      school_id: schoolId,
      channel: "email",
      subject: data.subject,
      body: data.body,
      recipient_count: emails.length,
      status,
      error: errorMsg,
    });
    return { sent: emails.length, status };
  });
