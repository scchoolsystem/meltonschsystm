import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendPaymentConfirmation } from "@/lib/payment-notify.server";

// Staff-only: (re)send the SMS + email receipt for one payment.
export const sendReceiptNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ payment_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let allowed = false;
    const { data: admin } = await supabase.rpc("is_admin", { _user_id: userId });
    if (admin) allowed = true;
    if (!allowed) {
      for (const role of ["bursar", "finance_admin", "finance_user"]) {
        const { data: has } = await supabase.rpc("has_role", { _user_id: userId, _role: role });
        if (has) { allowed = true; break; }
      }
    }
    if (!allowed) throw new Error("Only admin or finance staff can send receipts.");

    // RLS: the caller can only see payments of their own school.
    const { data: pay } = await (supabase as any).from("payments").select("id").eq("id", data.payment_id).maybeSingle();
    if (!pay) throw new Error("Payment not found");

    return await sendPaymentConfirmation(data.payment_id, { force: true });
  });
