// src/routes/api/platform-mpesa-stk.ts
// Initiates a Lipa Na M-Pesa Online (STK Push) request against the PLATFORM
// owner's own till/paybill, for a school paying a platform_invoice.
//
// Required Cloudflare Worker secrets (set via `wrangler secret put`):
//   SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_URL
// The actual M-Pesa credentials live encrypted in platform_mpesa_config and are
// fetched server-side only via the SECURITY DEFINER function — never sent to the client.

import { createFileRoute } from "@tanstack/react-router";
import { createServerFileRoute } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";

async function getDarajaToken(env: any, consumerKey: string, consumerSecret: string) {
  const base = env === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
  const creds = btoa(`${consumerKey}:${consumerSecret}`);
  const res = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
  });
  if (!res.ok) throw new Error("Failed to get Daraja access token");
  const json = await res.json();
  return { token: json.access_token as string, base };
}

function timestampNow() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export const ServerRoute = createServerFileRoute("/api/platform-mpesa-stk").methods({
  POST: async ({ request }) => {
    try {
      const body = await request.json();
      const { invoice_id, school_id, phone, amount } = body ?? {};
      if (!invoice_id || !school_id || !phone || !amount) {
        return Response.json({ error: "invoice_id, school_id, phone, amount are required" }, { status: 400 });
      }

      const supabaseUrl = process.env.SUPABASE_URL!;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const admin = createClient(supabaseUrl, serviceKey);

      // 1. Fetch the single platform M-Pesa config (service-role only function)
      const { data: cfgRows, error: cfgErr } = await admin.rpc("get_platform_mpesa_config");
      if (cfgErr) throw cfgErr;
      const cfg = Array.isArray(cfgRows) ? cfgRows[0] : cfgRows;
      if (!cfg || !cfg.enabled) {
        return Response.json({ error: "Platform M-Pesa is not configured/enabled" }, { status: 400 });
      }

      // 2. Get a Daraja OAuth token
      const { token, base } = await getDarajaToken(cfg.env, cfg.consumer_key, cfg.consumer_secret);

      // 3. Build the STK push payload
      const timestamp = timestampNow();
      const password = btoa(`${cfg.shortcode}${cfg.passkey}${timestamp}`);
      const normalizedPhone = String(phone).replace(/^0/, "254").replace(/^\+/, "");

      const callbackUrl = `${new URL(request.url).origin}/api/platform-mpesa-callback?token=${cfg.callback_token}`;

      const stkRes = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          BusinessShortCode: cfg.shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: Math.round(Number(amount)),
          PartyA: normalizedPhone,
          PartyB: cfg.shortcode,
          PhoneNumber: normalizedPhone,
          CallBackURL: callbackUrl,
          AccountReference: `INV-${invoice_id.slice(0, 8)}`,
          TransactionDesc: "SmartDev ERP subscription payment",
        }),
      });
      const stkJson = await stkRes.json();

      if (!stkRes.ok || stkJson.ResponseCode !== "0") {
        return Response.json({ error: stkJson.errorMessage ?? stkJson.ResponseDescription ?? "STK push failed" }, { status: 400 });
      }

      // 4. Record the pending transaction
      const { data: txn, error: insErr } = await admin
        .from("platform_mpesa_transactions")
        .insert({
          invoice_id,
          school_id,
          phone: normalizedPhone,
          amount,
          checkout_request_id: stkJson.CheckoutRequestID,
          merchant_request_id: stkJson.MerchantRequestID,
          status: "pending",
        })
        .select()
        .single();
      if (insErr) throw insErr;

      return Response.json({ ok: true, checkout_request_id: stkJson.CheckoutRequestID, transaction_id: txn.id });
    } catch (e: any) {
      return Response.json({ error: e.message ?? "Unexpected error" }, { status: 500 });
    }
  },
});
