import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPaymentConfirmationSafely } from "@/lib/payment-notify.server";

// Safaricom Daraja STK push callback.
//
// Auth: shared-secret token. Safaricom's Daraja API has NO mechanism to
// attach a custom header to its callback request — CallBackURL is just a
// plain URL that Safaricom's servers POST JSON to. A header-only check was
// briefly tried here for defense-in-depth, but it silently broke every real
// payment: Safaricom never sends x-callback-token, so every genuine
// callback was rejected with 401 and invoices never got marked paid. The
// token MUST travel in the query string (the only channel Safaricom
// actually supports); we also accept it via header so a trusted internal
// caller (e.g. manual reconciliation tooling) can use either.
//
// Register the callback URL WITH the token query param, e.g.:
//   https://app.smartdev.co.ke/api/public/mpesa-callback?token=YOUR_TOKEN
//
// Set MPESA_CALLBACK_TOKEN in Cloudflare Worker secrets (wrangler secret put).

export const Route = createFileRoute("/api/public/mpesa-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const schoolId = url.searchParams.get("school");

        // Per-school token: each school can generate its own Callback Secret
        // Token under Admin → Settings → M-Pesa. Look that up first; only
        // fall back to the single platform-wide MPESA_CALLBACK_TOKEN when a
        // school ID wasn't present (older/manually-registered URLs, or the
        // env-var/platform-shared credential path).
        let expected: string | undefined | null = null;
        let paidTo: string | null = null;
        if (schoolId) {
          const { data: cfg } = await supabaseAdmin
            .rpc("get_school_mpesa_config", { p_school_id: schoolId })
            .maybeSingle();
          expected = cfg?.callback_token ?? process.env.MPESA_CALLBACK_TOKEN;
          paidTo = cfg?.till_number
            ? `Till ${cfg.till_number}`
            : cfg?.shortcode
              ? `Paybill ${cfg.shortcode}`
              : null;
        } else {
          expected = process.env.MPESA_CALLBACK_TOKEN;
        }
        if (!expected) {
          return new Response("Callback not configured", { status: 503 });
        }

        // Accept the token via header OR query string. Query string is the
        // only option Safaricom itself can actually use; header is kept for
        // trusted internal/manual callers.
        const provided =
          request.headers.get("x-callback-token") ?? url.searchParams.get("token") ?? "";
        if (provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let payload: any;
        try {
          payload = await request.json();
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        const stk = payload?.Body?.stkCallback;
        if (!stk) return new Response("ok"); // ignore non-STK shapes

        const resultCode = stk.ResultCode;
        if (resultCode !== 0) {
          await supabaseAdmin.from("activity_logs").insert({
            action: "mpesa.failed",
            entity: "payment",
            metadata: stk,
          } as any);
          return new Response("ok");
        }

        const items: Array<{ Name: string; Value: any }> =
          stk.CallbackMetadata?.Item ?? [];
        const get = (name: string) =>
          items.find((i) => i.Name === name)?.Value;

        const amount = Number(get("Amount") ?? 0);
        const receipt = String(get("MpesaReceiptNumber") ?? "");
        let phone = String(get("PhoneNumber") ?? "");
        // "20261122154617" (Nairobi time) -> real timestamp
        const rawDate = String(get("TransactionDate") ?? "");
        const m = rawDate.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
        const transactionAt = m
          ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+03:00`).toISOString()
          : new Date().toISOString();
        const checkoutRequestId: string = stk.CheckoutRequestID || "";
        const accountRef: string = stk.AccountReference || "";

        if (!receipt || !amount) {
          return new Response("ok");
        }

        // Reconcile primarily via CheckoutRequestID against the intent we
        // recorded when the STK push was sent — this works no matter what
        // human-readable text ended up in AccountReference (student name,
        // invoice number, etc.), unlike the old approach of parsing an
        // invoice ID back out of AccountReference.
        let invoiceId: string | null = null;
        if (checkoutRequestId) {
          const { data: intent } = await supabaseAdmin
            .from("mpesa_payment_intents")
            .select("invoice_id, phone")
            .eq("checkout_request_id", checkoutRequestId)
            .maybeSingle();
          invoiceId = intent?.invoice_id ?? null;
          // Safaricom may mask the number in the callback; the intent holds the number we pushed to.
          if ((!/^\d{9,15}$/.test(phone)) && intent?.phone) phone = String(intent.phone);
        }

        // Fallback for any in-flight transaction that predates recording an
        // intent (or somehow has no CheckoutRequestID match): try the old
        // accountRef-as-invoice-ID-prefix approach, scoped to the school
        // from the callback URL when available to avoid cross-tenant
        // collisions.
        if (!invoiceId && accountRef) {
          let matchQuery = supabaseAdmin
            .from("invoices")
            .select("id")
            .like("id", `${accountRef}%`);
          if (schoolId) matchQuery = matchQuery.eq("school_id", schoolId);
          const { data: matches } = await matchQuery.limit(2);
          if (matches && matches.length === 1) invoiceId = matches[0].id;
        }

        if (!invoiceId) {
          await supabaseAdmin.from("activity_logs").insert({
            action: "mpesa.unmatched_callback",
            entity: "payment",
            metadata: { checkoutRequestId, accountRef, receipt },
          } as any);
          return new Response("ok");
        }

        // Deduplicate by receipt (DB also has a UNIQUE index on
        // split_part(reference,' ',1) WHERE method='mpesa').
        const { data: dup } = await supabaseAdmin
          .from("payments")
          .select("id")
          .eq("method", "mpesa")
          .like("reference", `${receipt}%`)
          .maybeSingle();
        if (dup) return new Response("ok");

        const { data: newPay, error: insErr } = await supabaseAdmin.from("payments").insert({
          invoice_id: invoiceId,
          amount,
          method: "mpesa",
          reference: `${receipt} (${phone})`,
          mpesa_receipt: receipt,
          payer_phone: phone || null,
          transaction_at: transactionAt,
          paid_to: paidTo,
        } as any).select("id").maybeSingle();
        if (insErr && !/duplicate key/i.test(insErr.message)) {
          await supabaseAdmin.from("activity_logs").insert({
            action: "mpesa.insert_failed",
            entity: "payment",
            metadata: { receipt, error: insErr.message },
          } as any);
        }

        if (checkoutRequestId) {
          await supabaseAdmin
            .from("mpesa_payment_intents")
            .update({ status: "completed" })
            .eq("checkout_request_id", checkoutRequestId);
        }

        // SMS + emailed receipt to the parent (never blocks or fails the callback).
        if (newPay?.id) await sendPaymentConfirmationSafely(newPay.id as string);

        return new Response("ok");
      },
    },
  },
});
