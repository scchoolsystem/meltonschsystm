// src/routes/api/platform-mpesa-callback.ts
// Safaricom calls this URL after the customer completes (or cancels) the STK push prompt.
// Set this exact URL (with your callback_token) as the CallBackURL — it's generated
// automatically in platform-mpesa-stk.ts, you don't need to register it manually elsewhere
// except in your Daraja app's whitelisted callback domain if required.

import { createServerFileRoute } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";

export const ServerRoute = createServerFileRoute("/api/platform-mpesa-callback").methods({
  POST: async ({ request }) => {
    try {
      const url = new URL(request.url);
      const token = url.searchParams.get("token");

      const supabaseUrl = process.env.SUPABASE_URL!;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const admin = createClient(supabaseUrl, serviceKey);

      // Verify the shared secret matches what's stored, so randoms can't fake callbacks
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

      // Always acknowledge with 200 + ResultCode 0 so Safaricom stops retrying
      return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
    } catch (e: any) {
      console.error("[platform-mpesa-callback] error", e);
      return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }
  },
});
