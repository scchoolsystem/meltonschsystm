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
          let paidAmount = NaN;
          let payerPhone: string | null = null;
          let transactionAt: string | null = null;
          if (resultCode === 0) {
            const items = stkCallback.CallbackMetadata?.Item ?? [];
            const receiptItem = items.find((i: any) => i.Name === "MpesaReceiptNumber");
            mpesaReceipt = receiptItem?.Value ? String(receiptItem.Value) : null;
            paidAmount = Number(items.find((i: any) => i.Name === "Amount")?.Value);
            const ph = items.find((i: any) => i.Name === "PhoneNumber")?.Value;
            payerPhone = ph ? String(ph) : null;
            const rawDate = String(items.find((i: any) => i.Name === "TransactionDate")?.Value ?? "");
            const d = rawDate.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
            transactionAt = d
              ? new Date(`${d[1]}-${d[2]}-${d[3]}T${d[4]}:${d[5]}:${d[6]}+03:00`).toISOString()
              : new Date().toISOString();
          }

          // Only mark the invoice paid when the full amount AND a real M-Pesa receipt arrived.
          let newStatus: string = resultCode === 0 ? "success" : resultCode === 1032 ? "cancelled" : "failed";
          let note: string | null = resultDesc;
          if (resultCode === 0) {
            const { data: txn } = await admin
              .from("platform_mpesa_transactions")
              .select("amount, status, phone")
              .eq("checkout_request_id", checkoutRequestId)
              .maybeSingle();
            if (!txn || txn.status === "success") return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
            // Safaricom may mask the number in the callback; keep the number we pushed to instead.
            if (!payerPhone || !/^\d{9,15}$/.test(payerPhone)) payerPhone = txn.phone ?? null;
            if (!mpesaReceipt || !(paidAmount >= Number(txn.amount))) {
              newStatus = "review";
              note = !mpesaReceipt ? "No M-Pesa receipt received" : `Amount paid ${paidAmount} is less than ${txn.amount}`;
            }
          }

          const { error } = await admin
            .from("platform_mpesa_transactions")
            .update({
              status: newStatus,
              result_code: String(resultCode),
              result_desc: note,
              mpesa_receipt: mpesaReceipt,
              payer_phone: payerPhone,
              transaction_at: transactionAt,
              paid_to: resultCode === 0
                ? (cfg.till_number ? `Till ${cfg.till_number}` : `Paybill ${cfg.shortcode}`)
                : null,
              raw_callback: body,
            })
            .eq("checkout_request_id", checkoutRequestId)
            .neq("status", "success");

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
