// Server-only: sends the "payment received" SMS + emailed receipt for a school fee payment.
// Uses the same Crowdcomm SMS account resolution and the same email queue as Admin → Communications.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveSmsSender, toE164Kenya } from "@/lib/sms.functions";

export type NotifyResult = { sms: number; email: number; skipped?: string };

const kes = (n: number) => `KES ${Number(n).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const maskPhone = (p?: string | null) => {
  const d = String(p ?? "").replace(/\D+/g, "");
  return d.length >= 10 ? `${d.slice(0, 5)}****${d.slice(-3)}` : "";
};
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export async function sendPaymentConfirmation(paymentId: string, opts: { force?: boolean } = {}): Promise<NotifyResult> {
  const db = supabaseAdmin as any;

  const { data: p } = await db
    .from("payments")
    .select("*, invoices(invoice_no, amount, description, student_id, students(first_name, last_name, admission_no, parent_phone, parent_email, parent_name))")
    .eq("id", paymentId)
    .maybeSingle();
  if (!p) return { sms: 0, email: 0, skipped: "payment not found" };
  if (p.receipt_notified_at && !opts.force) return { sms: 0, email: 0, skipped: "already sent" };

  const schoolId: string = p.school_id;

  const { data: school } = await db.from("schools").select("name, phone").eq("id", schoolId).maybeSingle();
  const schoolName: string = school?.name ?? "School";

  const inv = p.invoices;
  const st = inv?.students;
  const studentName = `${st?.first_name ?? ""} ${st?.last_name ?? ""}`.trim() || "your child";
  const amount = Number(p.amount);

  // Balance after this payment = invoice total - everything paid up to and including it.
  const { data: all } = await db.from("payments").select("id, amount, created_at").eq("invoice_id", p.invoice_id);
  const sorted = [...(all ?? [])].sort((a: any, b: any) =>
    a.created_at === b.created_at ? String(a.id).localeCompare(String(b.id)) : a.created_at < b.created_at ? -1 : 1);
  const idx = sorted.findIndex((x: any) => x.id === p.id);
  const paidBefore = sorted.slice(0, Math.max(idx, 0)).reduce((s: number, x: any) => s + Number(x.amount), 0);
  const invoiceTotal = Number(inv?.amount ?? 0);
  const balance = Math.max(invoiceTotal - paidBefore - amount, 0);

  // ── In-app (bell) notification for linked parents / student users ────────
  // Independent of SMS/email success and of the Communications module, and
  // idempotent (unique dedupe_key) so a resend never duplicates it.
  try {
    if (inv?.student_id) {
      const [{ data: pl }, { data: sl }] = await Promise.all([
        db.from("parent_student_links").select("parent_user_id").eq("student_id", inv.student_id),
        db.from("student_user_links").select("user_id").eq("student_id", inv.student_id),
      ]);
      // Parents and students land in their own portal (they can't open /finance pages).
      const targets = new Map<string, string>();
      for (const r of sl ?? []) if (r.user_id) targets.set(r.user_id, "/portal/student");
      for (const r of pl ?? []) if (r.parent_user_id) targets.set(r.parent_user_id, "/portal/parent");
      const userIds: string[] = Array.from(targets.keys());
      if (userIds.length) {
        const title = balance > 0 ? "Payment received" : "Fees fully paid";
        const body =
          `${kes(amount)} received for ${studentName}${inv?.invoice_no ? ` (invoice ${inv.invoice_no})` : ""}. ` +
          `Receipt ${p.receipt_no}. ${balance > 0 ? `Balance ${kes(balance)}.` : "Fully paid."}`;
        const { error: nErr } = await db.from("user_notifications").upsert(
          userIds.map((uid) => ({
            user_id: uid, school_id: schoolId, title, body, kind: "payment",
            link: targets.get(uid), dedupe_key: `payment-${p.id}`,
          })),
          { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
        );
        if (nErr) console.error("[notify] in-app insert", nErr.message);
      }
    }
  } catch (e) {
    console.error("[notify] in-app exception", e);
  }

  // Respect the school's Communications module switch.
  const { data: enabled, error: featErr } = await db.rpc("school_feature_enabled", {
    p_school_id: schoolId,
    p_feature_key: "communications",
  });
  if (!featErr && enabled === false) return { sms: 0, email: 0, skipped: "communications module disabled" };

  const isMpesa = String(p.method).toLowerCase() === "mpesa";
  const refMatch = String(p.reference ?? "").match(/^(\S+)/);
  const code: string | null = p.mpesa_receipt || (isMpesa ? refMatch?.[1] ?? null : null);
  const methodLabel = isMpesa ? "M-Pesa" : String(p.method).replace(/_/g, " ");
  const paidAt = when(p.transaction_at ?? p.created_at);

  let smsCount = 0;
  let emailCount = 0;

  // ── SMS: parent/guardian + whoever paid (if different) ───────────────────
  const numbers = Array.from(
    new Set([st?.parent_phone, p.payer_phone].map((n) => (n ? toE164Kenya(String(n)) : null)).filter((n): n is string => !!n)),
  );
  // Keep it compact: one SMS part is 160 chars; longer messages are split into
  // several parts, cost more units and report delivery less reliably.
  const shortWhen = new Date(p.transaction_at ?? p.created_at).toLocaleString("en-KE", {
    timeZone: "Africa/Nairobi", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const smsText = (
    `${schoolName}: ${kes(amount)} received for ${studentName} (${st?.admission_no ?? ""}) via ${methodLabel}` +
    `${code ? ` ${code}` : ""}, ${shortWhen}. Rcpt ${p.receipt_no}. ` +
    `${balance > 0 ? `Bal ${kes(balance)}.` : "Fully paid."}`
  ).slice(0, 480);

  if (numbers.length) {
    let status = "failed";
    let error: string | null = null;
    try {
      const sender = await resolveSmsSender(schoolId);
      if (!sender) {
        error = "SMS provider not configured";
      } else {
        const res = await fetch("https://sms.crowdcomm.co.ke/sms/v3/sendmultiple", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: sender.apiKey,
            serviceId: sender.serviceId,
            from: sender.senderId,
            messages: numbers.map((n, i) => ({ mobile: n.replace(/^\+/, ""), message: smsText, client_ref: i })),
          }),
        });
        const raw = await res.text().catch(() => "");
        let parsed: any = {};
        try { parsed = JSON.parse(raw); } catch { /* not JSON */ }
        if (res.ok && String(parsed?.status_code) === "1000") {
          const rejected = (parsed?.schedule_details ?? []).filter((r: any) => String(r.schedule_status) !== "1");
          smsCount = numbers.length - rejected.length;
          status = rejected.length === 0 ? "sent" : smsCount > 0 ? "partial" : "failed";
          if (rejected.length) error = rejected.map((r: any) => `${r.mobile}: ${r.schedule_desc}`).slice(0, 3).join("; ");
        } else {
          error = `HTTP ${res.status} code ${parsed?.status_code ?? "?"}: ${parsed?.status_desc ?? raw}`.slice(0, 300);
        }
      }
    } catch (e: any) {
      console.error("[notify] SMS exception", e);
      error = `exception ${e?.name ?? ""}: ${e?.message ?? (typeof e === "string" ? e : JSON.stringify(e))}`.slice(0, 300);
    }
    await db.from("notifications_log").insert({
      school_id: schoolId, channel: "sms", subject: `Receipt ${p.receipt_no}`, body: smsText,
      recipient_count: numbers.length, status, error,
    });
  }

  // ── Email: full receipt to the parent/guardian ───────────────────────────
  const to = String(st?.parent_email ?? "").trim();
  if (to) {
    const row = (l: string, v: string) =>
      `<tr><td style="padding:6px 0;color:#666;font-size:12px;text-transform:uppercase">${l}</td><td style="padding:6px 0;text-align:right;font-size:14px">${v}</td></tr>`;
    const html = `
<div style="max-width:560px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#111">
  <div style="text-align:center;border-bottom:1px solid #ddd;padding-bottom:12px;margin-bottom:16px">
    <h2 style="margin:0">${esc(schoolName)}</h2>
    <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;margin-top:6px">Payment Receipt</div>
  </div>
  <p style="font-size:14px">Dear ${esc(st?.parent_name || "Parent/Guardian")},<br/>
  We have received your payment for <strong>${esc(studentName)}</strong>${st?.admission_no ? ` (${esc(st.admission_no)})` : ""}. Thank you.</p>
  <table style="width:100%;border-collapse:collapse;border-top:1px solid #eee;border-bottom:1px solid #eee">
    ${row("Receipt no", `<strong>${esc(p.receipt_no)}</strong>`)}
    ${row("Date &amp; time", `${esc(paidAt)} (EAT)`)}
    ${row("Invoice", esc(inv?.invoice_no))}
    ${inv?.description ? row("For", esc(inv.description)) : ""}
    ${row("Method", esc(methodLabel))}
    ${code ? row("M-Pesa code", `<strong>${esc(code)}</strong>`) : ""}
    ${p.payer_phone ? row("Paid from", esc(maskPhone(p.payer_phone))) : ""}
    ${p.paid_to ? row("Paid to", esc(p.paid_to)) : ""}
  </table>
  <table style="width:100%;border-collapse:collapse;margin-top:12px;background:#f7f7f7">
    ${row("Invoice total", esc(kes(invoiceTotal)))}
    ${row("Paid before", esc(kes(paidBefore)))}
    ${row("This payment", `<strong>${esc(kes(amount))}</strong>`)}
    ${row("Balance remaining", `<strong>${esc(kes(balance))}</strong>`)}
  </table>
  <p style="font-size:13px;margin-top:16px">${balance > 0 ? `A balance of ${esc(kes(balance))} remains on this invoice.` : "This invoice is now fully paid."}</p>
  <p style="font-size:11px;color:#888;margin-top:20px">This is an automated receipt from ${esc(schoolName)}${school?.phone ? ` · ${esc(school.phone)}` : ""}. Quote receipt no. ${esc(p.receipt_no)} for any enquiry.</p>
</div>`;
    const text =
      `${schoolName} - Payment Receipt\nReceipt: ${p.receipt_no}\nStudent: ${studentName} (${st?.admission_no ?? ""})\n` +
      `Invoice: ${inv?.invoice_no}\nAmount: ${kes(amount)}\nMethod: ${methodLabel}${code ? ` (${code})` : ""}\nDate: ${paidAt} EAT\n` +
      `Balance: ${kes(balance)}`;
    const messageId = crypto.randomUUID();
    let status = "queued";
    let error: string | null = null;
    try {
      const { error: qErr } = await db.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          to,
          from: `${schoolName} <noreply@smartdev.co.ke>`,
          subject: `Payment receipt ${p.receipt_no} - ${schoolName}`,
          html,
          text,
          purpose: "receipt",
          label: "payment-receipt",
          idempotency_key: `receipt-${p.id}-${to}`,
          queued_at: new Date().toISOString(),
        },
      });
      if (qErr) throw qErr;
      emailCount = 1;
    } catch (e: any) {
      status = "failed";
      console.error("[notify] SMS exception", e);
      error = `exception ${e?.name ?? ""}: ${e?.message ?? (typeof e === "string" ? e : JSON.stringify(e))}`.slice(0, 300);
    }
    await db.from("notifications_log").insert({
      school_id: schoolId, channel: "email", subject: `Receipt ${p.receipt_no}`, body: text,
      recipient_count: 1, status, error, message_ids: emailCount ? [messageId] : null,
    });
  }

  // Only mark as notified when nothing was left unsent: if there were phone
  // numbers but the SMS failed, leave it unmarked so it can be retried.
  const smsFailed = numbers.length > 0 && smsCount === 0;
  if ((smsCount > 0 || emailCount > 0) && !smsFailed) {
    await db.from("payments").update({ receipt_notified_at: new Date().toISOString() }).eq("id", p.id);
  }
  const skipped = !numbers.length && !to ? "no parent phone or email on file" : undefined;
  return { sms: smsCount, email: emailCount, skipped };
}

// Never let a notification problem break payment recording; never hang the caller for long.
export async function sendPaymentConfirmationSafely(paymentId: string, timeoutMs = 5000) {
  try {
    await Promise.race([
      sendPaymentConfirmation(paymentId).catch((e) => console.error("[payment-notify]", e)),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch (e) {
    console.error("[payment-notify]", e);
  }
}
