import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
        if (schoolId) {
          const { data: cfg } = await supabaseAdmin
            .rpc("get_school_mpesa_config", { p_school_id: schoolId })
            .maybeSingle();
          expected = cfg?.callback_token ?? process.env.MPESA_CALLBACK_TOKEN;
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
        const phone = String(get("PhoneNumber") ?? "");
        const accountRef: string = stk.AccountReference || "";

        if (!receipt || !amount || !accountRef) {
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

        // accountRef is the first 12 chars of an invoice UUID — require an
        // unambiguous single match to prevent collision. Scope to the
        // school from the callback URL when we have one, since two schools
        // could otherwise share a 12-char UUID prefix.
        let matchQuery = supabaseAdmin
          .from("invoices")
          .select("id")
          .like("id", `${accountRef}%`);
        if (schoolId) matchQuery = matchQuery.eq("school_id", schoolId);
        const { data: matches } = await matchQuery.limit(2);
        if (!matches || matches.length !== 1) {
          await supabaseAdmin.from("activity_logs").insert({
            action: "mpesa.ambiguous_ref",
            entity: "payment",
            metadata: { accountRef, receipt, matchCount: matches?.length ?? 0 },
          } as any);
          return new Response("ok");
        }
        const inv = matches[0];

        const { error: insErr } = await supabaseAdmin.from("payments").insert({
          invoice_id: inv.id,
          amount,
          method: "mpesa",
          reference: `${receipt} (${phone})`,
        } as any);
        if (insErr && !/duplicate key/i.test(insErr.message)) {
          await supabaseAdmin.from("activity_logs").insert({
            action: "mpesa.insert_failed",
            entity: "payment",
            metadata: { receipt, error: insErr.message },
          } as any);
        }

        return new Response("ok");
      },
    },
  },
});
