// Server-only: tells a SCHOOL that its SmartDev subscription payment was received (SMS + emailed receipt).
// Sent from SmartDev's own sender (CROWDCOMM_* secrets) and noreply@smartdev.co.ke.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { toE164Kenya } from "@/lib/sms.functions";

export type PlatformNotifyResult = { sms: number; email: number; owner?: number; skipped?: string };

const kes = (n: number) => `KES ${Number(n).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const maskPhone = (p?: string | null) => {
  const d = String(p ?? "").replace(/\D+/g, "");
  return d.length >= 10 ? `${d.slice(0, 5)}****${d.slice(-3)}` : "";
};
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export async function sendPlatformPaymentConfirmation(paymentId: string, opts: { force?: boolean } = {}): Promise<PlatformNotifyResult> {
  const db = supabaseAdmin as any;

  const { data: p } = await db.from("platform_payments").select("*").eq("id", paymentId).maybeSingle();
  if (!p) return { sms: 0, email: 0, skipped: "payment not found" };
  if (p.receipt_notified_at && !opts.force) return { sms: 0, email: 0, skipped: "already sent" };

  const { data: inv } = await db
    .from("platform_invoices")
    .select("invoice_no, amount, period_start, period_end, school_id")
    .eq("id", p.invoice_id)
    .maybeSingle();
  if (!inv) return { sms: 0, email: 0, skipped: "invoice not found" };
  const { data: school } = await db.from("schools").select("name, phone, email").eq("id", inv.school_id).maybeSingle();
  const schoolName: string = school?.name ?? "School";

  // Balance after this payment.
  const { data: all } = await db.from("platform_payments").select("id, amount, created_at").eq("invoice_id", p.invoice_id);
  const sorted = [...(all ?? [])].sort((a: any, b: any) =>
    a.created_at === b.created_at ? String(a.id).localeCompare(String(b.id)) : a.created_at < b.created_at ? -1 : 1);
  const idx = sorted.findIndex((x: any) => x.id === p.id);
  const paidBefore = sorted.slice(0, Math.max(idx, 0)).reduce((s: number, x: any) => s + Number(x.amount), 0);
  const invoiceTotal = Number(inv.amount ?? 0);
  const amount = Number(p.amount);
  const balance = Math.max(invoiceTotal - paidBefore - amount, 0);

  const isMpesa = String(p.method).toLowerCase() === "mpesa";
  const methodLabel = isMpesa ? "M-Pesa" : String(p.method).replace(/_/g, " ");
  const paidAt = when(p.transaction_at ?? p.created_at);

  let smsCount = 0;
  let emailCount = 0;

  // ── SMS: the school's phone + the number that paid ───────────────────────
  const numbers = Array.from(
    new Set([school?.phone, p.payer_phone].map((n) => (n ? toE164Kenya(String(n)) : null)).filter((n): n is string => !!n)),
  );
  const smsText = (
    `SmartDev ERP: Received ${kes(amount)} from ${schoolName} for invoice ${inv.invoice_no} via ${methodLabel}` +
    `${p.reference && isMpesa ? ` ref ${p.reference}` : ""} on ${paidAt}. Receipt ${p.receipt_no}. ` +
    `${balance > 0 ? `Balance ${kes(balance)}.` : "Invoice fully paid."} Thank you.`
  ).slice(0, 480);

  if (numbers.length) {
    let status = "failed";
    let error: string | null = null;
    try {
      const apiKey = process.env.CROWDCOMM_API_KEY;
      const senderId = process.env.CROWDCOMM_SENDER_ID;
      if (!apiKey || !senderId) {
        error = "SmartDev SMS sender not configured (CROWDCOMM_API_KEY / CROWDCOMM_SENDER_ID)";
      } else {
        const res = await fetch("https://sms.crowdcomm.co.ke/sms/v3/sendmultiple", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            serviceId: process.env.CROWDCOMM_SERVICE_ID ?? "0",
            from: senderId,
            messages: numbers.map((n, i) => ({ mobile: n.replace(/^\+/, ""), message: smsText, client_ref: i })),
          }),
        });
        const parsed: any = await res.json().catch(() => ({}));
        if (res.ok && String(parsed?.status_code) === "1000") {
          const rejected = (parsed?.schedule_details ?? []).filter((r: any) => String(r.schedule_status) !== "1");
          smsCount = numbers.length - rejected.length;
          status = rejected.length === 0 ? "sent" : smsCount > 0 ? "partial" : "failed";
          if (rejected.length) error = rejected.map((r: any) => `${r.mobile}: ${r.schedule_desc}`).slice(0, 3).join("; ");
        } else {
          error = parsed?.status_desc || `Crowdcomm ${res.status}`;
        }
      }
    } catch (e: any) {
      error = String(e?.message ?? e).slice(0, 300);
    }
    await db.from("notifications_log").insert({
      school_id: inv.school_id, channel: "sms", subject: `Platform receipt ${p.receipt_no}`, body: smsText,
      recipient_count: numbers.length, status, error,
    });
  }

  // ── Email: the school's address + the account that paid ─────────────────
  const recipients = new Set<string>();
  if (school?.email) recipients.add(String(school.email).trim().toLowerCase());
  if (p.recorded_by) {
    try {
      const { data: u } = await (supabaseAdmin as any).auth.admin.getUserById(p.recorded_by);
      if (u?.user?.email) recipients.add(String(u.user.email).trim().toLowerCase());
    } catch { /* ignore */ }
  }

  if (recipients.size) {
    const row = (l: string, v: string) =>
      `<tr><td style="padding:6px 0;color:#666;font-size:12px;text-transform:uppercase">${l}</td><td style="padding:6px 0;text-align:right;font-size:14px">${v}</td></tr>`;
    const html = `
<div style="max-width:560px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#111">
  <div style="text-align:center;border-bottom:1px solid #ddd;padding-bottom:12px;margin-bottom:16px">
    <h2 style="margin:0">SmartDev ERP</h2>
    <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;margin-top:6px">Payment Receipt</div>
  </div>
  <p style="font-size:14px">Hello ${esc(schoolName)},<br/>We have received your subscription payment. Thank you.</p>
  <table style="width:100%;border-collapse:collapse;border-top:1px solid #eee;border-bottom:1px solid #eee">
    ${row("Receipt no", `<strong>${esc(p.receipt_no)}</strong>`)}
    ${row("Date &amp; time", `${esc(paidAt)} (EAT)`)}
    ${row("Invoice", esc(inv.invoice_no))}
    ${inv.period_start ? row("Billing period", `${esc(inv.period_start)} → ${esc(inv.period_end)}`) : ""}
    ${row("Method", esc(methodLabel))}
    ${p.reference ? row(isMpesa ? "M-Pesa code" : "Reference", `<strong>${esc(p.reference)}</strong>`) : ""}
    ${p.payer_phone ? row("Paid from", esc(maskPhone(p.payer_phone))) : ""}
    ${p.paid_to ? row("Paid to", esc(p.paid_to)) : ""}
  </table>
  <table style="width:100%;border-collapse:collapse;margin-top:12px;background:#f7f7f7">
    ${row("Invoice total", esc(kes(invoiceTotal)))}
    ${row("Paid before", esc(kes(paidBefore)))}
    ${row("This payment", `<strong>${esc(kes(amount))}</strong>`)}
    ${row("Balance remaining", `<strong>${esc(kes(balance))}</strong>`)}
  </table>
  <p style="font-size:13px;margin-top:16px">${balance > 0 ? `A balance of ${esc(kes(balance))} remains on this invoice.` : "This invoice is now fully paid."} You can view and print this receipt any time under Admin → Billing.</p>
  <p style="font-size:11px;color:#888;margin-top:20px">Automated receipt from SmartDev ERP · app.smartdev.co.ke. Quote receipt no. ${esc(p.receipt_no)} for any enquiry.</p>
</div>`;
    const text =
      `SmartDev ERP - Payment Receipt\nReceipt: ${p.receipt_no}\nSchool: ${schoolName}\nInvoice: ${inv.invoice_no}\n` +
      `Amount: ${kes(amount)}\nMethod: ${methodLabel}${p.reference ? ` (${p.reference})` : ""}\nDate: ${paidAt} EAT\nBalance: ${kes(balance)}`;
    const ids: string[] = [];
    let error: string | null = null;
    for (const to of recipients) {
      const messageId = crypto.randomUUID();
      try {
        const { error: qErr } = await db.rpc("enqueue_email", {
          queue_name: "transactional_emails",
          payload: {
            message_id: messageId,
            to,
            from: "SmartDev ERP <noreply@smartdev.co.ke>",
            subject: `Payment receipt ${p.receipt_no} - SmartDev ERP`,
            html,
            text,
            purpose: "receipt",
            label: "platform-payment-receipt",
            idempotency_key: `platform-receipt-${p.id}-${to}`,
            queued_at: new Date().toISOString(),
          },
        });
        if (qErr) throw qErr;
        ids.push(messageId);
        emailCount++;
      } catch (e: any) {
        error = String(e?.message ?? e).slice(0, 300);
      }
    }
    await db.from("notifications_log").insert({
      school_id: inv.school_id, channel: "email", subject: `Platform receipt ${p.receipt_no}`, body: text,
      recipient_count: recipients.size, status: emailCount ? "queued" : "failed", error,
      message_ids: ids.length ? ids : null,
    });
  }

  // ── Alert SmartDev platform owners that a school has paid ─────────────
  let ownerCount = 0;
  try {
    const { data: ownerRoles } = await db.from("user_roles").select("user_id").eq("role", "platform_owner");
    const ownerEmails = new Set<string>();
    for (const r of ownerRoles ?? []) {
      const { data: u } = await (supabaseAdmin as any).auth.admin.getUserById(r.user_id);
      if (u?.user?.email) ownerEmails.add(String(u.user.email).trim().toLowerCase());
    }
    const ownerText =
      `${schoolName} paid ${kes(amount)} via ${methodLabel}${p.reference ? ` (${p.reference})` : ""} on ${paidAt} EAT.\n` +
      `Invoice ${inv.invoice_no} | Receipt ${p.receipt_no ?? "-"} | ${balance > 0 ? `Balance ${kes(balance)}` : "Fully paid"}`;
    const ownerHtml = `<div style="font-family:Arial,sans-serif;max-width:520px"><h3>Payment received</h3><p>${esc(ownerText).replace(/\n/g, "<br/>")}</p></div>`;
    const ownerIds: string[] = [];
    for (const to of ownerEmails) {
      const messageId = crypto.randomUUID();
      const { error: qErr } = await db.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId, to, from: "SmartDev ERP <noreply@smartdev.co.ke>",
          subject: `Payment received: ${schoolName} - ${kes(amount)}`,
          html: ownerHtml, text: ownerText, purpose: "receipt", label: "platform-owner-payment-alert",
          idempotency_key: `platform-owner-alert-${p.id}-${to}`, queued_at: new Date().toISOString(),
        },
      });
      if (!qErr) { ownerIds.push(messageId); ownerCount++; }
    }
    if (ownerEmails.size) {
      await db.from("notifications_log").insert({
        school_id: inv.school_id, channel: "email", subject: `Platform payment alert ${p.receipt_no ?? ""}`, body: ownerText,
        recipient_count: ownerEmails.size, status: ownerCount ? "queued" : "failed", message_ids: ownerIds.length ? ownerIds : null,
      });
    }
  } catch (e) {
    console.error("[platform-payment-notify] owner alert", e);
  }

  if (smsCount > 0 || emailCount > 0 || ownerCount > 0) {
    await db.from("platform_payments").update({ receipt_notified_at: new Date().toISOString() }).eq("id", p.id);
  }
  const skipped = !numbers.length && !recipients.size ? "the school has no phone or email on file" : undefined;
  return { sms: smsCount, email: emailCount, owner: ownerCount, skipped };
}

export async function sendPlatformPaymentConfirmationSafely(paymentId: string, timeoutMs = 5000) {
  try {
    await Promise.race([
      sendPlatformPaymentConfirmation(paymentId).catch((e) => console.error("[platform-payment-notify]", e)),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch (e) {
    console.error("[platform-payment-notify]", e);
  }
}
