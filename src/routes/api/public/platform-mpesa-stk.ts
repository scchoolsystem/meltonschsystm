// Initiates a Lipa Na M-Pesa Online (STK Push) request against the PLATFORM
// owner's own till/paybill, for a school paying a platform_invoice.
//
// Security: the caller must be signed in (Bearer token). The amount is NEVER taken from the request:
// it is the invoice's outstanding balance. Row-level security decides who may pay which invoice
// (the pending transaction is inserted as the signed-in user, so only an admin of that school can).
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { stkTarget } from "@/lib/daraja";

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

function normalizePhone(p: unknown): string | null {
  let s = String(p ?? "").replace(/[\s\-+]/g, "");
  if (/^0[17]\d{8}$/.test(s)) s = "254" + s.slice(1);
  else if (/^[17]\d{8}$/.test(s)) s = "254" + s;
  return /^254[17]\d{8}$/.test(s) ? s : null;
}

export const Route = createFileRoute("/api/public/platform-mpesa-stk")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const g = globalThis as any;
          const supabaseUrl = process.env.SUPABASE_URL ?? g.__env__?.SUPABASE_URL;
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? g.__env__?.SUPABASE_SERVICE_ROLE_KEY;
          const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? g.__env__?.SUPABASE_PUBLISHABLE_KEY;
          if (!supabaseUrl || !serviceKey || !publishableKey) {
            return Response.json({ error: "Server payment configuration is missing" }, { status: 500 });
          }

          // 1. Must be signed in
          const authHeader = request.headers.get("authorization") ?? "";
          if (!authHeader.startsWith("Bearer ")) {
            return Response.json({ error: "Please sign in to pay." }, { status: 401 });
          }
          const jwt = authHeader.slice(7);
          const userClient = createClient(supabaseUrl, publishableKey, {
            global: { headers: { Authorization: `Bearer ${jwt}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: userRes, error: userErr } = await userClient.auth.getUser(jwt);
          if (userErr || !userRes?.user) {
            return Response.json({ error: "Please sign in to pay." }, { status: 401 });
          }
          const userId = userRes.user.id;

          // 2. Input: only the invoice and the phone. No amount from the browser.
          const body = await request.json().catch(() => ({}));
          const invoiceId = String(body?.invoice_id ?? "");
          const phone = normalizePhone(body?.phone);
          if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) return Response.json({ error: "Invalid invoice" }, { status: 400 });
          if (!phone) return Response.json({ error: "Enter a valid Safaricom number, e.g. 0712 345 678" }, { status: 400 });

          // 3. Invoice is read as the user (row-level security): they can only see their own school's invoices.
          const { data: inv } = await userClient
            .from("platform_invoices")
            .select("id, school_id, amount, paid, status")
            .eq("id", invoiceId)
            .maybeSingle();
          if (!inv) return Response.json({ error: "Invoice not found" }, { status: 404 });
          const amount = Math.round(Number(inv.amount) - Number(inv.paid));
          if (inv.status === "paid" || !(amount >= 1)) {
            return Response.json({ error: "This invoice has nothing left to pay." }, { status: 400 });
          }

          const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

          // 4. Don't spam prompts: one prompt per invoice per 45 seconds.
          const since = new Date(Date.now() - 45_000).toISOString();
          const { data: recent } = await admin
            .from("platform_mpesa_transactions")
            .select("id")
            .eq("invoice_id", invoiceId)
            .eq("status", "pending")
            .gte("created_at", since)
            .limit(1);
          if (recent && recent.length) {
            return Response.json({ error: "A payment prompt was just sent. Check your phone, or wait a minute and try again." }, { status: 429 });
          }

          const { data: cfgRows, error: cfgErr } = await admin.rpc("get_platform_mpesa_config");
          if (cfgErr) throw cfgErr;
          const cfg: any = Array.isArray(cfgRows) ? cfgRows[0] : cfgRows;
          if (!cfg || !cfg.enabled) {
            return Response.json({ error: "Platform M-Pesa is not configured/enabled" }, { status: 400 });
          }

          // 5. Record the attempt AS THE USER. The table's insert policy only lets an admin of that school do this.
          const { data: txn, error: insErr } = await userClient
            .from("platform_mpesa_transactions")
            .insert({ invoice_id: invoiceId, school_id: inv.school_id, initiated_by: userId, phone, amount, status: "pending" })
            .select("id")
            .single();
          if (insErr || !txn) {
            return Response.json({ error: "You are not allowed to pay this invoice." }, { status: 403 });
          }

          // 6. Send the prompt to Safaricom
          const { token, base } = await getDarajaToken(cfg.env, cfg.consumer_key, cfg.consumer_secret);
          const timestamp = timestampNow();
          const password = btoa(`${cfg.shortcode}${cfg.passkey}${timestamp}`);
          const target = stkTarget(cfg.shortcode, cfg.till_number);
          const callbackUrl = `${new URL(request.url).origin}/api/public/platform-mpesa-callback?token=${encodeURIComponent(cfg.callback_token)}`;

          const stkRes = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              BusinessShortCode: cfg.shortcode,
              Password: password,
              Timestamp: timestamp,
              TransactionType: target.TransactionType,
              Amount: amount,
              PartyA: phone,
              PartyB: target.PartyB,
              PhoneNumber: phone,
              CallBackURL: callbackUrl,
              AccountReference: `INV-${invoiceId.slice(0, 8)}`,
              TransactionDesc: "SmartDev ERP",
            }),
          });
          const stkJson: any = await stkRes.json().catch(() => ({}));

          if (!stkRes.ok || stkJson.ResponseCode !== "0") {
            const why = String(stkJson.errorMessage ?? stkJson.ResponseDescription ?? "STK push failed");
            await admin.from("platform_mpesa_transactions").update({ status: "failed", result_desc: why.slice(0, 200) }).eq("id", txn.id);
            return Response.json({ error: why }, { status: 400 });
          }

          await admin
            .from("platform_mpesa_transactions")
            .update({ checkout_request_id: stkJson.CheckoutRequestID, merchant_request_id: stkJson.MerchantRequestID })
            .eq("id", txn.id);

          return Response.json({ ok: true, transaction_id: txn.id, amount });
        } catch (e: any) {
          return Response.json({ error: e.message ?? "Unexpected error" }, { status: 500 });
        }
      },
    },
  },
});
