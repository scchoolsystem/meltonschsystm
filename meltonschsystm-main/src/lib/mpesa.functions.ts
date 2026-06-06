import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Record an M-Pesa STK push intent for an invoice.
 *
 * If MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET / MPESA_SHORTCODE /
 * MPESA_PASSKEY are configured, this performs a real Daraja STK push;
 * otherwise it just records the intent so the school can demo the flow.
 * The actual payment is reconciled by /api/public/mpesa-callback.
 */
export const initiateMpesaPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        invoice_id: z.string().uuid(),
        phone: z
          .string()
          .regex(/^(?:\+?254|0)?7\d{8}$/, "Enter a valid Safaricom number"),
        amount: z.number().positive().max(1_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Normalise phone to 2547XXXXXXXX
    let phone = data.phone.replace(/\D+/g, "");
    if (phone.startsWith("0")) phone = "254" + phone.slice(1);
    if (phone.startsWith("7")) phone = "254" + phone;
    if (!/^254\d{9}$/.test(phone)) throw new Error("Invalid phone number");

    // Confirm the invoice exists and the caller can see it (RLS enforced).
    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .select("id, amount, paid, status, school_id")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (invErr || !inv) throw new Error("Invoice not found");
    if (inv.status === "paid") throw new Error("Invoice is already paid");

    const outstanding = Number(inv.amount) - Number(inv.paid);
    if (data.amount > outstanding + 0.001) {
      throw new Error(`Amount exceeds outstanding balance KES ${outstanding}`);
    }

    // Insert the intent (RLS allows the student/parent to insert for their invoice).
    const { data: intent, error: insErr } = await supabase
      .from("mpesa_payment_intents")
      .insert({
        invoice_id: inv.id,
        phone,
        amount: data.amount,
        initiated_by: userId,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    const callbackToken = process.env.MPESA_CALLBACK_TOKEN;
    const publicHost = process.env.PUBLIC_HOST;

    if (!consumerKey || !consumerSecret || !shortcode || !passkey || !callbackToken || !publicHost) {
      // Demo / sandbox mode — intent recorded only.
      await supabase
        .from("mpesa_payment_intents")
        .update({ status: "pending", error: "STK push not configured (demo mode)" })
        .eq("id", intent.id);
      return {
        ok: true,
        demo: true,
        message:
          "Demo mode: STK push not configured. The school admin must configure Daraja credentials.",
      };
    }

    try {
      const base = process.env.MPESA_ENV === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";
      const tokenRes = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: { Authorization: `Basic ${btoa(`${consumerKey}:${consumerSecret}`)}` },
      });
      const tokenJson: any = await tokenRes.json();
      const accessToken = tokenJson.access_token;
      if (!accessToken) throw new Error("Could not get Daraja token");

      const ts = new Date()
        .toISOString()
        .replace(/[^0-9]/g, "")
        .slice(0, 14);
      const password = btoa(`${shortcode}${passkey}${ts}`);
      const callbackUrl = `${publicHost.replace(/\/$/, "")}/api/public/mpesa-callback?token=${encodeURIComponent(callbackToken)}`;

      const stkRes = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          BusinessShortCode: shortcode,
          Password: password,
          Timestamp: ts,
          TransactionType: "CustomerPayBillOnline",
          Amount: Math.round(data.amount),
          PartyA: phone,
          PartyB: shortcode,
          PhoneNumber: phone,
          CallBackURL: callbackUrl,
          AccountReference: inv.id.slice(0, 12),
          TransactionDesc: `Fee invoice ${inv.id.slice(0, 8)}`,
        }),
      });
      const stkJson: any = await stkRes.json();
      if (stkJson.ResponseCode !== "0") {
        await supabase
          .from("mpesa_payment_intents")
          .update({ status: "failed", error: stkJson.errorMessage || stkJson.ResponseDescription || "STK push failed" })
          .eq("id", intent.id);
        throw new Error(stkJson.errorMessage || "STK push failed");
      }
      await supabase
        .from("mpesa_payment_intents")
        .update({ status: "sent", checkout_request_id: stkJson.CheckoutRequestID })
        .eq("id", intent.id);
      return { ok: true, demo: false, message: "Check your phone to approve the M-Pesa payment." };
    } catch (e: any) {
      await supabase
        .from("mpesa_payment_intents")
        .update({ status: "failed", error: e?.message ?? String(e) })
        .eq("id", intent.id);
      throw e;
    }
  });
