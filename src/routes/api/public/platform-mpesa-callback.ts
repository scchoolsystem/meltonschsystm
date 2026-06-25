// Safaricom calls this URL after the customer completes (or cancels) the STK push prompt.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/platform-mpesa-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const token = url.searchParams.get("token");

          const supabaseUrl = process.env.SUPABASE_URL;
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (!supabaseUrl || !serviceKey) {
            return Response.json({ ResultCode: 1, ResultDesc: "Server configuration missing" }, { status: 500 });
          }

          const admin = createClient(supabaseUrl, serviceKey);
          const { data: cfgRows } = await admin.rpc("get_platform_mpesa_config");
          const cfg = Array.isArray(cfgRows) ? cfgRows[0] : cfgRows;
          if (!cfg || cfg.callback_token !== token) {
            return Response.json({ ResultCode: 1, ResultDesc: "Invalid callback token" }, { status: 401 });
          }

          const body = await request.json();
          const stkCallback = body?.Body?.stkCallback;
          if (!stkCallback) {
            return Response.json({ ResultCode: 1, ResultDesc: "Malformed callback" }, { status: 400 });
          }

          const checkoutRequestId = stkCallback.CheckoutRequestID;
          const resultCode = stkCallback.ResultCode;
          const resultDesc = stkCallback.ResultDesc;

          let mpesaReceipt: string | null = null;
          if (resultCode === 0) {
            const items = stkCallback.CallbackMetadata?.Item ?? [];
            const receiptItem = items.find((i: any) => i.Name === "MpesaReceiptNumber");
            mpesaReceipt = receiptItem?.Value ?? null;
          }

          const newStatus = resultCode === 0 ? "success" : resultCode === 1032 ? "cancelled" : "failed";

          const { error } = await admin
            .from("platform_mpesa_transactions")
            .update({
              status: newStatus,
              result_code: String(resultCode),
              result_desc: resultDesc,
              mpesa_receipt: mpesaReceipt,
              raw_callback: body,
            })
            .eq("checkout_request_id", checkoutRequestId);

          if (error) console.error("[platform-mpesa-callback] update error", error);
          return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
        } catch (e: any) {
          console.error("[platform-mpesa-callback] error", e);
          return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
        }
      },
    },
  },
});
