// Initiates a Lipa Na M-Pesa Online (STK Push) request against the PLATFORM
// owner's own till/paybill, for a school paying a platform_invoice.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

async function getDarajaToken(env: any, consumerKey: string, consumerSecret: string) {
  const base = env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
  const credentials = btoa(`${consumerKey}:${consumerSecret}`);
  const res = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!res.ok) throw new Error("Failed to authenticate with Daraja");
  const json = await res.json();
  return { token: json.access_token as string, base };
}

function timestampNow() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export const Route = createFileRoute("/api/public/platform-mpesa-stk")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { invoice_id, school_id, phone, amount } = body ?? {};
          if (!invoice_id || !school_id || !phone || !amount) {
            return Response.json({ error: "invoice_id, school_id, phone, amount are required" }, { status: 400 });
          }

          const supabaseUrl = process.env.SUPABASE_URL;
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (!supabaseUrl || !serviceKey) {
            return Response.json({ error: "Server payment configuration is missing" }, { status: 500 });
          }

          const admin = createClient(supabaseUrl, serviceKey);

          const { data: cfgRows, error: cfgErr } = await admin.rpc("get_platform_mpesa_config");
          if (cfgErr) throw cfgErr;
          const cfg = Array.isArray(cfgRows) ? cfgRows[0] : cfgRows;
          if (!cfg || !cfg.enabled) {
            return Response.json({ error: "Platform M-Pesa is not configured/enabled" }, { status: 400 });
          }

          const { token, base } = await getDarajaToken(cfg.env, cfg.consumer_key, cfg.consumer_secret);
          const timestamp = timestampNow();
          const password = btoa(`${cfg.shortcode}${cfg.passkey}${timestamp}`);
          const normalizedPhone = String(phone).replace(/^0/, "254").replace(/^\+/, "");
          const callbackUrl = `${new URL(request.url).origin}/api/public/platform-mpesa-callback?token=${encodeURIComponent(cfg.callback_token)}`;

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
              AccountReference: `INV-${String(invoice_id).slice(0, 8)}`,
              TransactionDesc: "SmartDev ERP subscription payment",
            }),
          });
          const stkJson = await stkRes.json();

          if (!stkRes.ok || stkJson.ResponseCode !== "0") {
            return Response.json({ error: stkJson.errorMessage ?? stkJson.ResponseDescription ?? "STK push failed" }, { status: 400 });
          }

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
    },
  },
});
