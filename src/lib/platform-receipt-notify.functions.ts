import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendPlatformPaymentConfirmation } from "@/lib/platform-payment-notify.server";

// (Re)send the SMS + email receipt of a SmartDev subscription payment to the school.
// Allowed for platform staff and for admins of the school that owns the payment.
export const sendPlatformReceiptNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ payment_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // RLS: only payments the caller can see (platform staff, or members of the paying school).
    const { data: pay } = await (supabase as any).from("platform_payments").select("id").eq("id", data.payment_id).maybeSingle();
    if (!pay) throw new Error("Payment not found");

    const { data: isPlatform } = await supabase.rpc("is_platform");
    const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: userId });
    if (!isPlatform && !isAdmin) throw new Error("Only an admin can send receipts.");

    return await sendPlatformPaymentConfirmation(data.payment_id, { force: true });
  });
