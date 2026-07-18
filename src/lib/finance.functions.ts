import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---- helpers ----
// Same reasoning as finance-extended.functions.ts: these calls go through
// supabaseAdmin (service role), so RLS module-toggle policies never see
// them. Check the toggle explicitly, via the caller's RLS-scoped client.
async function assertFinance(context: { supabase: any; userId: string }) {
  const { data: schoolId, error: schErr } = await context.supabase.rpc("my_school_id");
  if (schErr) throw new Error(schErr.message);
  if (!schoolId) throw new Error("No school context");
  const { data: enabled, error: featErr } = await context.supabase.rpc("school_feature_enabled", {
    p_school_id: schoolId,
    p_feature_key: "finance",
  });
  if (featErr) throw new Error(featErr.message);
  if (!enabled) throw new Error("The finance module is disabled for this school.");

  const { data: admin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (admin) return;
  const { data: bursar } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "bursar",
  });
  if (!bursar) throw new Error("Only finance staff can perform this action");
}

// ---- 1. Bulk invoice generation from a fee structure ----
export const bulkGenerateInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        fee_structure_id: z.string().uuid(),
        class_id: z.string().uuid().optional(),
        due_date: z.string().optional(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertFinance(context);

    // Resolve caller's school for tenant scoping (admin client bypasses RLS)
    const { data: schoolId, error: schErr } = await context.supabase.rpc("my_school_id");
    if (schErr) throw new Error(schErr.message);
    if (!schoolId) throw new Error("No school context for this user");

    const { data: fee, error: feeErr } = await supabaseAdmin
      .from("fee_structures")
      .select("id, amount, level, name, term, year, school_id")
      .eq("id", data.fee_structure_id)
      .eq("school_id", schoolId)
      .single();
    if (feeErr || !fee) throw new Error(feeErr?.message ?? "Fee structure not found in this school");

    let q = supabaseAdmin
      .from("students")
      .select("id")
      .eq("school_id", schoolId)
      .eq("status", "active");
    if (data.class_id) q = q.eq("class_id", data.class_id);
    const { data: students, error: stuErr } = await q;
    if (stuErr) throw new Error(stuErr.message);
    if (!students?.length) return { created: 0, skipped: 0 };

    const ids = students.map((s) => s.id);
    const { data: existing } = await supabaseAdmin
      .from("invoices")
      .select("student_id")
      .eq("school_id", schoolId)
      .eq("fee_structure_id", data.fee_structure_id)
      .in("student_id", ids);
    const existingSet = new Set((existing ?? []).map((e: any) => e.student_id));

    const toInsert = students
      .filter((s) => !existingSet.has(s.id))
      .map((s) => ({
        student_id: s.id,
        fee_structure_id: fee.id,
        amount: fee.amount,
        due_date: data.due_date || null,
        school_id: schoolId,
        description: `${fee.name} - ${fee.term} ${fee.year}`,
      }));

    if (toInsert.length === 0) return { created: 0, skipped: students.length };

    const { error: insErr } = await supabaseAdmin.from("invoices").insert(toInsert as any);
    if (insErr) throw new Error(insErr.message);

    return { created: toInsert.length, skipped: students.length - toInsert.length };
  });

// ---- 1b. Bulk invoice generation from a single class fee component ----
export const bulkGenerateComponentInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        class_fee_component_id: z.string().uuid(),
        due_date: z.string().optional(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertFinance(context);

    const { data: schoolId, error: schErr } = await context.supabase.rpc("my_school_id");
    if (schErr) throw new Error(schErr.message);
    if (!schoolId) throw new Error("No school context for this user");

    const { data: comp, error: compErr } = await supabaseAdmin
      .from("class_fee_components")
      .select("id, class_id, component, amount, term, year, school_id")
      .eq("id", data.class_fee_component_id)
      .eq("school_id", schoolId)
      .single();
    if (compErr || !comp) throw new Error(compErr?.message ?? "Fee component not found in this school");

    const { data: students, error: stuErr } = await supabaseAdmin
      .from("students")
      .select("id")
      .eq("school_id", schoolId)
      .eq("class_id", comp.class_id)
      .eq("status", "active");
    if (stuErr) throw new Error(stuErr.message);
    if (!students?.length) return { created: 0, skipped: 0 };

    const ids = students.map((s) => s.id);
    const { data: existing } = await supabaseAdmin
      .from("invoices")
      .select("student_id")
      .eq("school_id", schoolId)
      .eq("class_fee_component_id", data.class_fee_component_id)
      .in("student_id", ids);
    const existingSet = new Set((existing ?? []).map((e: any) => e.student_id));

    const toInsert = students
      .filter((s) => !existingSet.has(s.id))
      .map((s) => ({
        student_id: s.id,
        class_fee_component_id: comp.id,
        amount: comp.amount,
        due_date: data.due_date || null,
        school_id: schoolId,
        description: `${comp.component.charAt(0).toUpperCase()}${comp.component.slice(1)} - ${comp.term} ${comp.year}`,
      }));

    if (toInsert.length === 0) return { created: 0, skipped: students.length };

    const { error: insErr } = await supabaseAdmin.from("invoices").insert(toInsert as any);
    if (insErr) throw new Error(insErr.message);

    return { created: toInsert.length, skipped: students.length - toInsert.length };
  });

// ---- 2. M-Pesa STK Push (Daraja) ----
export const mpesaStkPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        invoice_id: z.string().uuid(),
        phone: z.string().min(9).max(15),
        amount: z.number().int().positive(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertFinance(context);

    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    const callbackBase = process.env.MPESA_CALLBACK_URL; // e.g. https://project--xxx.lovable.app
    const callbackToken = process.env.MPESA_CALLBACK_TOKEN;
    const env = process.env.MPESA_ENV || "sandbox";

    if (!consumerKey || !consumerSecret || !shortcode || !passkey || !callbackBase || !callbackToken) {
      throw new Error(
        "M-Pesa not configured. Add MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY, MPESA_CALLBACK_URL, MPESA_CALLBACK_TOKEN secrets."
      );
    }

    const base = env === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";

    // 1. OAuth token
    const tokenRes = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${btoa(`${consumerKey}:${consumerSecret}`)}` },
    });
    if (!tokenRes.ok) throw new Error(`M-Pesa auth failed: ${tokenRes.status}`);
    const { access_token } = (await tokenRes.json()) as { access_token: string };

    // 2. STK push
    const ts = new Date()
      .toISOString()
      .replace(/[-T:.Z]/g, "")
      .slice(0, 14);
    const password = btoa(`${shortcode}${passkey}${ts}`);
    const phone = data.phone.replace(/^\+/, "").replace(/^0/, "254");

    const stkRes = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: ts,
        TransactionType: "CustomerPayBillOnline",
        Amount: data.amount,
        PartyA: phone,
        PartyB: shortcode,
        PhoneNumber: phone,
        CallBackURL: `${callbackBase}/api/public/mpesa-callback?token=${encodeURIComponent(callbackToken)}`,
        AccountReference: data.invoice_id.slice(0, 12),
        TransactionDesc: "School fees",
      }),
    });
    const stk = await stkRes.json();
    if (!stkRes.ok) throw new Error(`STK push failed: ${JSON.stringify(stk)}`);
    return stk;
  });
