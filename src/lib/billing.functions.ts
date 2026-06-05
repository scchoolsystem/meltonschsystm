import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Generate platform invoices for all active subscriptions in a given billing period.
 * Skips schools that already have an invoice covering that period.
 * Only callable by platform_owner.
 */
export const generateMonthlyInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      notes: z.string().max(500).optional(),
      amount_override: z.number().positive().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Verify caller is platform_owner
    const { data: roleRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (roleRows ?? []).map((r: any) => r.role);
    if (!roles.includes("platform_owner")) {
      throw new Error("Only platform owners can generate invoices");
    }

    // Load active subscriptions with their plan price
    const { data: subs, error: subsErr } = await supabaseAdmin
      .from("school_subscriptions")
      .select("school_id, plan_id, status, subscription_plans(monthly_fee)")
      .eq("status", "active");
    if (subsErr) throw new Error(subsErr.message);

    let created = 0;
    for (const sub of (subs ?? []) as any[]) {
      // Skip if an invoice already exists for this period
      const { data: existing } = await supabaseAdmin
        .from("platform_invoices")
        .select("id")
        .eq("school_id", sub.school_id)
        .eq("period_start", data.period_start)
        .maybeSingle();
      if (existing) continue;

      const amount = data.amount_override ?? Number(sub.subscription_plans?.monthly_fee ?? 0);
      if (amount <= 0) continue;

      const invoice_no = `INV-${data.period_start.replace(/-/g, "")}-${sub.school_id.slice(0, 8)}`;
      const { error: insErr } = await (supabaseAdmin as any).from("platform_invoices").insert({
        school_id: sub.school_id,
        invoice_no,
        period_start: data.period_start,
        period_end: data.period_end,
        amount,
        paid: 0,
        status: "unpaid",
        notes: data.notes ?? null,
      });
      if (!insErr) created++;
    }

    return { created };
  });
