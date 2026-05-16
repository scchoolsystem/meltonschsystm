import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Safaricom Daraja STK callback. Requires a shared-secret token in the URL
// (configured when registering the callback URL with Safaricom) to prevent
// unauthenticated payment injection.
export const Route = createFileRoute("/api/public/mpesa-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.MPESA_CALLBACK_TOKEN;
        if (!expected) {
          return new Response("Callback not configured", { status: 503 });
        }
        const url = new URL(request.url);
        const provided =
          url.searchParams.get("token") ||
          request.headers.get("x-callback-token") ||
          "";
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
        if (!stk) return new Response("ok"); // ignore

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

        // accountRef is first 12 chars of invoice uuid
        const { data: inv } = await supabaseAdmin
          .from("invoices")
          .select("id")
          .like("id", `${accountRef}%`)
          .maybeSingle();
        if (!inv) return new Response("ok");

        await supabaseAdmin.from("payments").insert({
          invoice_id: inv.id,
          amount,
          method: "mpesa",
          reference: `${receipt} (${phone})`,
        } as any);

        return new Response("ok");
      },
    },
  },
});
