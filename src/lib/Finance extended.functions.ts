import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ── helpers ─────────────────────────────────────────────────
async function assertFinance(context: { supabase: any; userId: string }) {
  const { data: admin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (admin) return;
  for (const role of ["bursar", "finance_admin", "finance_user"]) {
    const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: role });
    if (data) return;
  }
  throw new Error("Only finance staff can perform this action");
}

async function assertFinanceWrite(context: { supabase: any; userId: string }) {
  const { data: admin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (admin) return;
  for (const role of ["bursar", "finance_admin"]) {
    const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: role });
    if (data) return;
  }
  throw new Error("Only bursar or finance admin can perform this action");
}

async function getSchoolId(context: { supabase: any }) {
  const { data: schoolId, error } = await context.supabase.rpc("my_school_id");
  if (error) throw new Error(error.message);
  if (!schoolId) throw new Error("No school context");
  return schoolId as string;
}

// ── 1. Bulk invoice generation (already exists, keep) ────────
export { bulkGenerateInvoices, mpesaStkPush } from "./finance.functions";

// ── 2. Finance KPIs ──────────────────────────────────────────
export const getFinanceKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ year: z.number().int().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const schoolId = await getSchoolId(context);
    const { data: kpis, error } = await context.supabase.rpc("get_finance_kpis", {
      p_school_id: schoolId,
      p_year: data.year ?? null,
    });
    if (error) throw new Error(error.message);
    return kpis;
  });

// ── 3. Monthly collections ───────────────────────────────────
export const getMonthlyCollections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ year: z.number().int().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const schoolId = await getSchoolId(context);
    const year = data.year ?? new Date().getFullYear();
    const { data: rows, error } = await context.supabase
      .from("v_monthly_collections")
      .select("*")
      .eq("school_id", schoolId)
      .gte("month", `${year}-01-01`)
      .lte("month", `${year}-12-31`)
      .order("month");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ── 4. Class collection rates ────────────────────────────────
export const getClassCollectionRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinance(context);
    const schoolId = await getSchoolId(context);
    const { data: rows, error } = await context.supabase
      .from("v_class_collection_rate")
      .select("*")
      .eq("school_id", schoolId)
      .order("outstanding", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ── 5. Term financial summary ────────────────────────────────
export const getTermSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ year: z.number().int().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const schoolId = await getSchoolId(context);
    const year = data.year ?? new Date().getFullYear();
    const { data: rows, error } = await context.supabase
      .from("v_term_financial_summary")
      .select("*")
      .eq("school_id", schoolId)
      .eq("year", year)
      .order("term");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ── 6. Fee defaulters ────────────────────────────────────────
export const getFeeDefaulters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinance(context);
    const schoolId = await getSchoolId(context);
    const { data: rows, error } = await context.supabase
      .from("v_fee_defaulters")
      .select("*")
      .eq("school_id", schoolId)
      .order("days_overdue", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ── 7. Budget vs actual ──────────────────────────────────────
export const getBudgetVsActual = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ year: z.number().int().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const schoolId = await getSchoolId(context);
    const year = data.year ?? new Date().getFullYear();
    const { data: rows, error } = await context.supabase
      .from("v_budget_vs_actual")
      .select("*")
      .eq("school_id", schoolId)
      .eq("year", year)
      .order("utilisation_pct", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ── 8. Payment method breakdown ──────────────────────────────
export const getPaymentMethodBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ year: z.number().int().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const schoolId = await getSchoolId(context);
    const year = data.year ?? new Date().getFullYear();
    const { data: rows, error } = await context.supabase
      .from("v_payment_method_breakdown")
      .select("*")
      .eq("school_id", schoolId)
      .eq("year", year)
      .order("month_sort");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ── 9. List expenses ─────────────────────────────────────────
export const listExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      year: z.number().int().optional(),
      term: z.string().optional(),
      status: z.string().optional(),
      page: z.number().int().min(0).default(0),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const schoolId = await getSchoolId(context);
    const PAGE = 50;
    let q = supabaseAdmin
      .from("expenses")
      .select("*, expense_categories(name,code)", { count: "exact" })
      .eq("school_id", schoolId)
      .order("expense_date", { ascending: false })
      .range(data.page * PAGE, data.page * PAGE + PAGE - 1);
    if (data.year) q = q.eq("year", data.year);
    if (data.term) q = q.eq("term", data.term);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], count: count ?? 0 };
  });

// ── 10. Record expense ───────────────────────────────────────
export const recordExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      category_id: z.string().uuid().optional(),
      title: z.string().min(1),
      description: z.string().optional(),
      amount: z.number().positive(),
      expense_date: z.string(),
      payment_method: z.enum(["cash", "cheque", "bank_transfer", "mpesa", "card", "other"]),
      reference: z.string().optional(),
      payee: z.string().optional(),
      term: z.string().optional(),
      year: z.number().int(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const schoolId = await getSchoolId(context);
    const { error } = await supabaseAdmin.from("expenses").insert({
      ...data,
      school_id: schoolId,
      recorded_by: context.userId,
      status: "pending",
    } as any);
    if (error) throw new Error(error.message);
  });

// ── 11. Approve expense ──────────────────────────────────────
export const approveExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ expense_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertFinanceWrite(context);
    const { error } = await context.supabase.rpc("approve_expense", { p_expense_id: data.expense_id });
    if (error) throw new Error(error.message);
  });

// ── 12. Upsert budget ────────────────────────────────────────
export const upsertBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid().optional(),
      category_id: z.string().uuid().optional(),
      name: z.string().min(1),
      term: z.string().optional(),
      year: z.number().int(),
      allocated: z.number().min(0),
      notes: z.string().optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertFinanceWrite(context);
    const schoolId = await getSchoolId(context);
    const payload = { ...data, school_id: schoolId, created_by: context.userId };
    if (data.id) {
      const { error } = await supabaseAdmin.from("budgets").update(payload as any).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("budgets").insert(payload as any);
      if (error) throw new Error(error.message);
    }
  });

// ── 13. Record payment (manual) ──────────────────────────────
export const recordPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      invoice_id: z.string().uuid(),
      amount: z.number().positive(),
      method: z.enum(["cash", "cheque", "bank_transfer", "mpesa", "card", "other"]),
      reference: z.string().optional(),
      paid_on: z.string().optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertFinanceWrite(context);
    const schoolId = await getSchoolId(context);
    // Verify invoice belongs to school
    const { data: inv, error: invErr } = await supabaseAdmin
      .from("invoices")
      .select("id, amount, paid, status, school_id")
      .eq("id", data.invoice_id)
      .eq("school_id", schoolId)
      .single();
    if (invErr || !inv) throw new Error("Invoice not found");
    if (inv.status === "paid") throw new Error("Invoice is already fully paid");
    const balance = Number(inv.amount) - Number(inv.paid);
    if (data.amount > balance + 0.01) throw new Error(`Payment exceeds balance of KES ${balance.toLocaleString()}`);

    // Insert payment (receipt_no set by trigger)
    const { error } = await supabaseAdmin.from("payments").insert({
      invoice_id: data.invoice_id,
      amount: data.amount,
      method: data.method,
      reference: data.reference ?? null,
      paid_on: data.paid_on ?? new Date().toISOString().slice(0, 10),
    } as any);
    if (error) throw new Error(error.message);

    // Update invoice paid / status
    const newPaid = Number(inv.paid) + data.amount;
    const newStatus = newPaid >= Number(inv.amount) - 0.01 ? "paid" : "partial";
    await supabaseAdmin
      .from("invoices")
      .update({ paid: newPaid, status: newStatus } as any)
      .eq("id", data.invoice_id);
  });

// ── 14. Write-off invoice balance ────────────────────────────
export const writeOffInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ invoice_id: z.string().uuid(), amount: z.number().positive(), reason: z.string().min(1) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertFinanceWrite(context);
    const { error } = await context.supabase.rpc("write_off_invoice", {
      p_invoice_id: data.invoice_id,
      p_amount: data.amount,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
  });

// ── 15. Petty cash ───────────────────────────────────────────
export const recordPettyCash = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      type: z.enum(["top_up", "disbursement"]),
      amount: z.number().positive(),
      description: z.string().min(1),
      voucher_no: z.string().optional(),
      transaction_date: z.string().optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const schoolId = await getSchoolId(context);
    const { error } = await supabaseAdmin.from("petty_cash").insert({
      ...data,
      school_id: schoolId,
      recorded_by: context.userId,
    } as any);
    if (error) throw new Error(error.message);
  });

// ── 16. Seed expense categories ──────────────────────────────
export const seedExpenseCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinanceWrite(context);
    const schoolId = await getSchoolId(context);
    const { error } = await context.supabase.rpc("seed_expense_categories", { p_school_id: schoolId });
    if (error) throw new Error(error.message);
  });
