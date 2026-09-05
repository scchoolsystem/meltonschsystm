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
      .eq("status", "active")
      .eq("lifecycle_status", "active"); // canonical active check — status alone can still be 'active' for a suspended/expelled/transferred student
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
      .eq("status", "active")
      .eq("lifecycle_status", "active"); // canonical active check — matches isStudentActive()
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

    // Resolve caller's school and confirm the invoice actually belongs to
    // it (previously this pushed a payment for any invoice_id supplied by
    // the client with no ownership or balance check at all).
    const { data: schoolId, error: schErr } = await context.supabase.rpc("my_school_id");
    if (schErr) throw new Error(schErr.message);
    if (!schoolId) throw new Error("No school context");

    const { data: inv, error: invErr } = await supabaseAdmin
      .from("invoices")
      .select("id, invoice_no, amount, paid, status, school_id, student_id")
      .eq("id", data.invoice_id)
      .eq("school_id", schoolId)
      .single();
    if (invErr || !inv) throw new Error("Invoice not found in this school");
    if (inv.status === "paid") throw new Error("Invoice is already fully paid");
    const outstanding = Number(inv.amount) - Number(inv.paid);
    if (data.amount > outstanding + 0.01) {
      throw new Error(`Amount exceeds outstanding balance of KES ${outstanding.toLocaleString()}`);
    }

    // Same 12/13-char Safaricom limits as initiateMpesaPayment — see the
    // comment there for why the school name can't also be fit in.
    const { data: student } = await supabaseAdmin
      .from("students")
      .select("first_name, last_name")
      .eq("id", inv.student_id)
      .maybeSingle();
    const studentName = student ? `${student.first_name} ${student.last_name}`.trim() : "";
    const accountReference = (studentName || inv.invoice_no || inv.id).slice(0, 12);
    const transactionDesc = (inv.invoice_no || "School Fees").slice(0, 13);

    // Load this school's own Daraja credentials first — each school has
    // (or should have) its own Paybill/Till configured under Admin →
    // Settings → M-Pesa. Falling back to the platform-wide env vars only
    // when a school hasn't configured its own, so this doesn't silently
    // route every school's fee collections through one shared shortcode.
    const { data: cfg } = await supabaseAdmin
      .rpc("get_school_mpesa_config", { p_school_id: schoolId })
      .maybeSingle();

    const consumerKey = cfg?.enabled ? cfg.consumer_key : process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = cfg?.enabled ? cfg.consumer_secret : process.env.MPESA_CONSUMER_SECRET;
    const shortcode = cfg?.enabled ? cfg.shortcode : process.env.MPESA_SHORTCODE;
    const passkey = cfg?.enabled ? cfg.passkey : process.env.MPESA_PASSKEY;
    const callbackToken = cfg?.enabled ? cfg.callback_token : process.env.MPESA_CALLBACK_TOKEN;
    const env = cfg?.enabled ? cfg.env : process.env.MPESA_ENV || "sandbox";
    const callbackBase = process.env.MPESA_CALLBACK_URL; // e.g. https://app.smartdev.co.ke

    if (!consumerKey || !consumerSecret || !shortcode || !passkey || !callbackBase || !callbackToken) {
      let reason: string;
      if (!callbackBase) {
        reason = "M-Pesa is not fully configured on the server: MPESA_CALLBACK_URL is not set. Ask your platform administrator to configure it.";
      } else if (!cfg) {
        reason = "M-Pesa not configured. Add MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY, MPESA_CALLBACK_URL, MPESA_CALLBACK_TOKEN secrets, or configure this school's own credentials under Admin → Settings → M-Pesa.";
      } else if (!cfg.enabled) {
        reason = "M-Pesa is not enabled for this school yet. Go to Admin → Settings → M-Pesa to enable it.";
      } else {
        const missing = [
          !consumerKey && "Consumer Key",
          !consumerSecret && "Consumer Secret",
          !shortcode && "Paybill/Till Number",
          !passkey && "Passkey",
          !callbackToken && "Callback Secret Token",
        ].filter(Boolean).join(", ");
        reason = `Missing Daraja field(s): ${missing}. Go to Admin → Settings → M-Pesa to complete them.`;
      }
      throw new Error(reason);
    }

    const base = env === "live" || env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";

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
        CallBackURL: `${callbackBase}/api/public/mpesa-callback?token=${encodeURIComponent(callbackToken)}&school=${schoolId}`,
        AccountReference: accountReference,
        TransactionDesc: transactionDesc,
      }),
    });
    const stk = await stkRes.json();
    if (!stkRes.ok) throw new Error(`STK push failed: ${JSON.stringify(stk)}`);

    // Record the intent so the callback can reconcile via CheckoutRequestID
    // instead of parsing AccountReference (which is now a name, not an
    // invoice ID prefix).
    if (stk.CheckoutRequestID) {
      await supabaseAdmin.from("mpesa_payment_intents").insert({
        school_id: schoolId,
        invoice_id: inv.id,
        phone,
        amount: data.amount,
        status: "sent",
        checkout_request_id: stk.CheckoutRequestID,
        initiated_by: context.userId,
      } as any);
    }
    return stk;
  });
