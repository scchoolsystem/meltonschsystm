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

// Africa's Talking expects E.164 (+254...). Numbers stored/entered as local
// Kenyan formats (0712345678, 254712345678, 712345678) get silently
// rejected per-recipient rather than erroring the whole request, which is
// easy to miss. Normalize before sending.
export function toE164Kenya(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+254") && digits.length === 13) return digits;
  if (digits.startsWith("254") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+254${digits.slice(1)}`;
  if (digits.length === 9) return `+254${digits}`; // bare subscriber number
  return null; // unrecognized shape — let it through as-is downstream? no: drop it, it would just fail silently
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
  const raw = Array.from(new Set(rows.map((r) => String(r ?? "").trim()).filter(Boolean)));
  return raw.map(toE164Kenya).filter((n): n is string => n !== null);
}

// ── Save per-school Crowdcomm config ─────────────────────────────────────────
export const saveSmsConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        sender_id: z.string().min(2, "Sender ID / shortcode required"),
        api_key: z.string().optional().default(""),
        service_id: z.string().optional().default("0"),
        enabled: z.boolean(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: schoolIdRaw } = await supabase.rpc("current_user_school");
    const schoolId = schoolIdRaw as unknown as string | null;
    if (!schoolId) throw new Error("No school found for your account");

    // The API key arrives blank when the admin didn't change it (the client
    // never receives the real key back). Keep whatever is already stored
    // instead of overwriting with "".
    const { data: existing } = await (supabase as any)
      .from("school_sms_config")
      .select("api_key")
      .eq("school_id", schoolId)
      .maybeSingle();

    const api_key = data.api_key || existing?.api_key || "";

    if (data.enabled && !api_key) {
      throw new Error("A Crowdcomm API key is required to enable your own SMS account.");
    }

    const { error } = await (supabase as any)
      .from("school_sms_config")
      .upsert(
        {
          school_id: schoolId,
          provider: "crowdcomm",
          sender_id: data.sender_id,
          api_key,
          service_id: data.service_id || "0",
          enabled: data.enabled,
        },
        { onConflict: "school_id" }
      );

    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Load per-school Crowdcomm config (for settings page) ────────────────────
export const loadSmsConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    const { data: schoolIdRaw } = await supabase.rpc("current_user_school");
    const schoolId = schoolIdRaw as unknown as string | null;
    if (!schoolId) return null;

    const { data, error } = await (supabase as any)
      .from("school_sms_config")
      .select("sender_id, service_id, api_key, enabled")
      .eq("school_id", schoolId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    // Never send the raw key to the browser — only whether one is set.
    return {
      sender_id: data.sender_id,
      service_id: data.service_id,
      enabled: data.enabled,
      api_key_set: !!data.api_key,
    };
  });

// ── Resolve which Crowdcomm account sends this school's SMS ────────────────
// Each school can register its own Crowdcomm partner account (its own
// sender_id / api_key) via Admin → Settings → SMS. If a school hasn't
// enabled its own account, we fall back to SmartDev's shared Crowdcomm
// account so SMS keeps working out of the box, just sent "from" SmartDev's
// own approved sender ID instead of the school's name.
async function resolveSmsSender(schoolId: string): Promise<{
  senderId: string;
  apiKey: string;
  serviceId: string;
  ownAccount: boolean;
} | null> {
  const { data: cfg } = await (supabaseAdmin as any)
    .rpc("get_school_sms_config", { p_school_id: schoolId })
    .maybeSingle();

  if (cfg?.enabled && cfg.api_key && cfg.sender_id) {
    return { senderId: cfg.sender_id, apiKey: cfg.api_key, serviceId: cfg.service_id ?? "0", ownAccount: true };
  }

  const fallbackKey = process.env.CROWDCOMM_API_KEY;
  const fallbackSender = process.env.CROWDCOMM_SENDER_ID;
  if (fallbackKey && fallbackSender) {
    return { senderId: fallbackSender, apiKey: fallbackKey, serviceId: process.env.CROWDCOMM_SERVICE_ID ?? "0", ownAccount: false };
  }

  return null;
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
    let sendError: string | null = null;

    const sender = numbers.length > 0 ? await resolveSmsSender(schoolId) : null;

    if (numbers.length === 0) {
      status = "failed";
      sendError = "No recipient phone numbers resolved";
    } else if (sender) {
      try {
        // Crowdcomm expects local/254 formats without the leading "+";
        // toE164Kenya() already normalized to +254XXXXXXXXX.
        const messages = numbers.map((n, i) => ({
          mobile: n.replace(/^\+/, ""),
          message: data.message,
          client_ref: i,
        }));
        const res = await fetch("https://sms.crowdcomm.co.ke/sms/v3/sendmultiple", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: sender.apiKey,
            serviceId: sender.serviceId,
            from: sender.senderId,
            messages,
          }),
        });
        const bodyText = await res.text();
        if (res.ok) {
          try {
            const parsed = JSON.parse(bodyText);
            // status_code "1000" = accepted; per-recipient outcome is in
            // schedule_details, same "2xx but check the body" shape as the
            // Daraja/Africa's Talking integrations elsewhere in this file.
            const schedule = parsed?.schedule_details ?? [];
            const rejected = schedule.filter((r: any) => String(r.schedule_status) !== "1");
            if (String(parsed?.status_code) !== "1000") {
              status = "failed";
              failed = numbers.length;
              sendError = parsed?.status_desc || `Crowdcomm error ${parsed?.status_code}`;
            } else if (rejected.length > 0) {
              status = rejected.length === schedule.length ? "failed" : "partial";
              sent = schedule.length - rejected.length;
              failed = rejected.length;
              sendError = rejected.map((r: any) => `${r.mobile}: ${r.schedule_desc}`).slice(0, 5).join("; ");
            } else {
              status = "sent";
              sent = numbers.length;
            }
          } catch {
            status = "failed";
            failed = numbers.length;
            sendError = `Crowdcomm returned a non-JSON response: ${bodyText.slice(0, 300)}`;
          }
        } else {
          status = "failed";
          failed = numbers.length;
          sendError = `Crowdcomm ${res.status}: ${bodyText.slice(0, 300)}`;
        }
      } catch (e: any) {
        status = "failed";
        failed = numbers.length;
        sendError = e?.message?.slice(0, 300) ?? "Network error calling Crowdcomm";
      }
    } else {
      // No SMS provider configured — nothing was actually sent, and there's
      // no background job that will ever pick this up later (unlike email).
      // Report it honestly as failed rather than claiming sent_count =
      // numbers.length, which made the UI show e.g. "Sent: 120" next to a
      // "queued" badge that would never resolve.
      status = "failed";
      failed = numbers.length;
      sendError = "SMS provider not configured (no school Crowdcomm account and CROWDCOMM_API_KEY missing)";
    }

    await (supabaseAdmin as any).from("sms_queue").insert({
      school_id: schoolId,
      audience: data.audience as any,
      message: data.message,
      status,
      sent_count: sent,
      failed_count: failed,
      created_by: context.userId,
      error: sendError,
    } as any);
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
    let messageIds: string[] = [];

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
          messageIds.push(messageId);
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
      // Lets the email_send_log trigger find this row and flip it from
      // 'queued' to 'sent'/'partial'/'failed' once the queue processor
      // actually sends (or gives up on) each recipient.
      message_ids: messageIds.length > 0 ? messageIds : null,
    });
    return { sent: emails.length, status };
  });
