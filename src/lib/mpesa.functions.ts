import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Record an M-Pesa STK push intent for an invoice.
 *
 * Credentials are loaded PER-SCHOOL from the `school_mpesa_config` table.
 * If a school has not configured Daraja credentials (or has enabled=false),
 * the intent is recorded in demo mode so the flow can be tested.
 *
 * The actual payment is reconciled by /api/public/mpesa-callback.
 */
export const initiateMpesaPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
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

    // ── Load per-school Daraja credentials ───────────────────────────────────
    // Use supabaseAdmin (service role) so RLS doesn't block the server reading
    // the config — the caller's permission was already verified above via RLS
    // on the invoice. Never expose raw credentials to the client.
    const { data: cfg, error: cfgErr } = await supabaseAdmin
      .rpc("get_school_mpesa_config", { p_school_id: inv.school_id })
      .maybeSingle();

    const consumerKey     = cfg?.consumer_key     ?? process.env.MPESA_CONSUMER_KEY;
    const consumerSecret  = cfg?.consumer_secret  ?? process.env.MPESA_CONSUMER_SECRET;
    const shortcode       = cfg?.shortcode        ?? process.env.MPESA_SHORTCODE;
    const passkey         = cfg?.passkey          ?? process.env.MPESA_PASSKEY;
    const callbackToken   = cfg?.callback_token   ?? process.env.MPESA_CALLBACK_TOKEN;
    const mpesaEnv        = cfg?.env              ?? process.env.MPESA_ENV ?? "sandbox";
    const publicHost      = process.env.PUBLIC_HOST;
    const schoolEnabled   = cfg?.enabled ?? false;

    // Demo mode: no credentials configured OR school has not enabled MPesa yet
    if (!consumerKey || !consumerSecret || !shortcode || !passkey || !callbackToken || !publicHost || (!schoolEnabled && !process.env.MPESA_CONSUMER_KEY)) {
      await supabase
        .from("mpesa_payment_intents")
        .update({ status: "pending", error: "STK push not configured (demo mode)" })
        .eq("id", intent.id);
      return {
        ok: true,
        demo: true,
        message: cfg
          ? "Demo mode: M-Pesa is not enabled for this school yet. Go to Admin → Settings → M-Pesa to enable it."
          : "Demo mode: STK push not configured. The school admin must configure Daraja credentials.",
      };
    }

    // ── Fire real STK push ───────────────────────────────────────────────────
    try {
      const base = mpesaEnv === "production"
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
      const callbackUrl = `${publicHost.replace(/\/$/, "")}/api/public/mpesa-callback?token=${encodeURIComponent(callbackToken)}&school=${inv.school_id}`;

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

// ── Save per-school MPesa config ─────────────────────────────────────────────
export const saveMpesaConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({
      shortcode:       z.string().min(4, "Shortcode required"),
      consumer_key:    z.string().optional().default(""),
      consumer_secret: z.string().optional().default(""),
      passkey:         z.string().optional().default(""),
      callback_token:  z.string().optional().default(""),
      env:             z.enum(["sandbox", "production"]),
      enabled:         z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Get school_id for this admin
    const { data: schoolIdRaw } = await supabase.rpc("current_user_school");
    const schoolId = schoolIdRaw as unknown as string | null;
    if (!schoolId) throw new Error("No school found for your account");

    // Secret fields arrive blank when the admin didn't change them (the
    // client never receives the real secret values back). In that case,
    // keep whatever is already stored instead of overwriting with "".
    const { data: existing } = await supabase
      .from("school_mpesa_config")
      .select("consumer_key, consumer_secret, passkey, callback_token")
      .eq("school_id", schoolId)
      .maybeSingle();

    const consumer_key    = data.consumer_key    || existing?.consumer_key    || "";
    const consumer_secret = data.consumer_secret || existing?.consumer_secret || "";
    const passkey         = data.passkey         || existing?.passkey        || "";
    const callback_token  = data.callback_token  || existing?.callback_token || "";

    if (data.enabled && (!consumer_key || !consumer_secret || !passkey || !callback_token)) {
      throw new Error("All Daraja credentials are required to enable M-Pesa.");
    }

    const { error } = await supabase
      .from("school_mpesa_config")
      .upsert({
        school_id:       schoolId,
        shortcode:       data.shortcode,
        consumer_key,
        consumer_secret,
        passkey,
        callback_token,
        env:             data.env,
        enabled:         data.enabled,
      }, { onConflict: "school_id" });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Load per-school MPesa config (for settings page) ─────────────────────────
export const loadMpesaConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    const { data: schoolIdRaw } = await supabase.rpc("current_user_school");
    const schoolId = schoolIdRaw as unknown as string | null;
    if (!schoolId) return null;

    const { data, error } = await supabase
      .from("school_mpesa_config")
      .select("shortcode, consumer_key, consumer_secret, passkey, callback_token, env, enabled")
      .eq("school_id", schoolId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    // Never send raw secrets to the browser. The settings UI only needs to
    // know whether each credential is already set, plus the non-secret fields.
    return {
      shortcode: data.shortcode,
      env: data.env,
      enabled: data.enabled,
      consumer_key_set: !!data.consumer_key,
      consumer_secret_set: !!data.consumer_secret,
      passkey_set: !!data.passkey,
      callback_token_set: !!data.callback_token,
    };
  });
