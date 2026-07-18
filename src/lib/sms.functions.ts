import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

// sendBulkSms / sendEmailBlast write to sms_queue / notifications_log via
// supabaseAdmin (service role), which bypasses the module_toggle_sms_queue
// / module_toggle_notifications_log RESTRICTIVE policies entirely. Check
// the toggle here, through the caller's RLS-scoped client, so disabling
// Communications actually stops the send rather than just hiding the page.
async function assertCommunicationsEnabled(ctx: { supabase: any }, schoolId: string) {
  const { data: enabled, error } = await ctx.supabase.rpc("school_feature_enabled", {
    p_school_id: schoolId,
    p_feature_key: "communications",
  });
  if (error) throw new Error(error.message);
  if (!enabled) throw new Error("The communications module is disabled for this school.");
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
    await assertCommunicationsEnabled(context, schoolId);
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

async function resolveSchoolName(schoolId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("schools")
    .select("name")
    .eq("id", schoolId)
    .single();
  return data?.name ?? "SmartDev ERP";
}

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
    await assertCommunicationsEnabled(context, schoolId);
    const [emails, schoolName] = await Promise.all([
      resolveEmails(schoolId, data.audience),
      resolveSchoolName(schoolId),
    ]);

    let status = "sent";
    let errorMsg: string | null = null;

    if (emails.length === 0) {
      status = "failed";
      errorMsg = "No recipients";
    } else {
      try {
        const domain = "smartdev.co.ke";
        const from = `${schoolName} <noreply@${domain}>`;
        const htmlBody = `<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0">${schoolName} — important notice for your child</div><div>${data.body.replace(/\n/g, "<br/>")}</div>`;

        // Enqueue each recipient through the same queue the transactional emails use
        for (const email of emails) {
          const messageId = crypto.randomUUID();
          const { error: enqueueError } = await (supabaseAdmin as any).rpc("enqueue_email", {
            queue_name: "transactional_emails",
            payload: {
              message_id: messageId,
              to: email,
              from,
              subject: data.subject,
              html: htmlBody,
              text: data.body,
              purpose: "blast",
              label: "email-blast",
              idempotency_key: `blast-${schoolId}-${messageId}`,
              queued_at: new Date().toISOString(),
            },
          });
          if (enqueueError) throw enqueueError;
        }
        status = "queued";
      } catch (e: any) {
        status = "failed";
        errorMsg = e?.message ?? "Enqueue failed";
      }
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
