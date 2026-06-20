import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Safaricom Daraja STK push callback.
//
// Auth: shared-secret passed as the x-callback-token request header.
// Register your callback URL WITHOUT a ?token= query param — the token
// must only travel in a header so it is not logged by Cloudflare, Safaricom
// retry infrastructure, or any HTTP proxy sitting between Safaricom and us.
//
// Example callback URL to register with Daraja:
//   https://app.smartdev.co.ke/api/public/mpesa-callback
//
// Set MPESA_CALLBACK_TOKEN in Cloudflare Worker secrets (wrangler secret put).

export const Route = createFileRoute("/api/public/mpesa-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.MPESA_CALLBACK_TOKEN;
        if (!expected) {
          return new Response("Callback not configured", { status: 503 });
        }

        // Accept the token from the header ONLY.
        // The old ?token= query-string fallback has been removed because
        // query params are recorded in Cloudflare access logs and Safaricom
        // retry logs, leaking the shared secret.
        const provided = request.headers.get("x-callback-token") ?? "";
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
        // unambiguous single match to prevent collision.
        const { data: matches } = await supabaseAdmin
          .from("invoices")
          .select("id")
          .like("id", `${accountRef}%`)
          .limit(2);
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
