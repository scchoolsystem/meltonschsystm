import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getFinanceKpis,
  getMonthlyCollections,
  getClassCollectionRates,
  getTermSummary,
  getFeeDefaulters,
  getPaymentMethodBreakdown,
  getBudgetVsActual,
  listExpenses,
} from "@/lib/finance-extended.functions";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  Loader2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  Clock, DollarSign, Wallet, BarChart2, PieChart as PieIcon,
  Activity, CreditCard, BookOpen, Users, Flame,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

export const Route = createFileRoute("/_app/finance/analytics")({
  component: () => (
    <FeatureGate feature="finance">
      <Page />
    </FeatureGate>
  ),
});

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  primary: "#6366f1",
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  cyan: "#06b6d4",
  orange: "#f97316",
  purple: "#8b5cf6",
  lime: "#84cc16",
  muted: "#1e293b",
};
const PIE_COLORS = [C.primary, C.green, C.yellow, C.red, C.cyan, C.orange, C.purple, C.lime];
const TERM_COLORS: Record<string, string> = { "Term 1": C.primary, "Term 2": C.green, "Term 3": C.yellow };

const CUR = (n: number | null | undefined) =>
  "KES " + Number(n ?? 0).toLocaleString("en-KE", { minimumFractionDigits: 0 });

const pct = (num: number, den: number) =>
  den > 0 ? Math.min(100, Math.round((num / den) * 100)) : 0;

// ── Tab definitions ───────────────────────────────────────────────────────────
const TABS = [
  { key: "overview",   label: "Overview",        icon: TrendingUp },
  { key: "cashflow",   label: "Cash Flow",       icon: Activity },
  { key: "budget",     label: "Budget Intel",    icon: BarChart2 },
  { key: "classes",    label: "By Class",        icon: Users },
  { key: "terms",      label: "Term P&L",        icon: BookOpen },
  { key: "methods",    label: "Payment Methods", icon: CreditCard },
  { key: "defaulters", label: "Defaulters",      icon: Flame },
];

// ── Shared helpers ────────────────────────────────────────────────────────────
function Kpi({
  icon: Icon, label, value, sub, color = "", trend,
}: {
  icon: React.ElementType; label: string; value: any; sub?: string;
  color?: string; trend?: "up" | "down" | "neutral";
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-4 pb-4 relative">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground truncate">{label}</p>
            <p className={`text-2xl font-bold font-mono mt-0.5 ${color}`}>{value}</p>
            {sub && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
          </div>
          <div className={`p-2 rounded-xl bg-muted shrink-0 ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
        {trend && (
          <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${trend === "up" ? "bg-green-500" : trend === "down" ? "bg-red-500" : "bg-muted"}`} />
        )}
      </CardContent>
    </Card>
  );
}

function RingGauge({ pct: p, label, color }: { pct: number; label: string; color: string }) {
  const data = [{ v: p }, { v: 100 - p }];
  return (
    <div className="relative w-28 h-28 mx-auto">
      <PieChart width={112} height={112}>
        <Pie data={data} cx={52} cy={52} innerRadius={38} outerRadius={52}
          startAngle={90} endAngle={-270} dataKey="v" strokeWidth={0}>
          <Cell fill={color} />
          <Cell fill={C.muted} />
        </Pie>
      </PieChart>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold">{p}%</span>
        <span className="text-[10px] text-muted-foreground text-center leading-tight">{label}</span>
      </div>
    </div>
  );
}

function Spinner() {
  return <div className="h-48 grid place-items-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;
}

function Empty({ msg = "No data yet" }: { msg?: string }) {
  return <p className="text-sm text-muted-foreground text-center py-10">{msg}</p>;
}

// ── Page shell ────────────────────────────────────────────────────────────────
function Page() {
  const YEAR = new Date().getFullYear();
  const [year, setYear] = useState(YEAR);
  const [tab, setTab] = useState("overview");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <DollarSign className="w-7 h-7 text-primary" /> Finance Intelligence
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Full financial picture — collections, budgets, cash flow & risk</p>
        </div>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[YEAR - 1, YEAR, YEAR + 1].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tab bar — same style as /analytics */}
      <div className="flex gap-1 overflow-x-auto pb-1 border-b">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-t whitespace-nowrap transition-colors ${
                tab === t.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "overview"   && <OverviewTab year={year} />}
      {tab === "cashflow"   && <CashFlowTab year={year} />}
      {tab === "budget"     && <BudgetTab year={year} />}
      {tab === "classes"    && <ClassesTab />}
      {tab === "terms"      && <TermsTab year={year} />}
      {tab === "methods"    && <MethodsTab year={year} />}
      {tab === "defaulters" && <DefaultersTab />}
    </div>
  );
}

// ─── OVERVIEW tab ─────────────────────────────────────────────────────────────
function OverviewTab({ year }: { year: number }) {
  const kpiFn = useServerFn(getFinanceKpis);
  const monthlyFn = useServerFn(getMonthlyCollections);
  const defaulterFn = useServerFn(getFeeDefaulters);

  const { data: kpis, isLoading: kL } = useQuery({
    queryKey: ["fin-kpis", year],
    queryFn: () => kpiFn({ data: { year } }),
  });
  const { data: monthly = [], isLoading: mL } = useQuery({
    queryKey: ["fin-monthly", year],
    queryFn: () => monthlyFn({ data: { year } }),
  });
  const { data: defaulters = [] } = useQuery({
    queryKey: ["fin-defaulters"],
    queryFn: () => defaulterFn({}),
  });

  const k = kpis as any;
  const collRate = Number(k?.collection_rate ?? 0);
  const outstanding = Number(k?.total_outstanding ?? 0);
  const billed = Number(k?.total_billed ?? 0);

  const monthlyAgg = Object.values(
    (monthly as any[]).reduce<Record<string, any>>((acc, r) => {
      const key = r.month_label ?? r.month?.slice(0, 7);
      if (!acc[key]) acc[key] = { label: key, collected: 0, month: r.month };
      acc[key].collected += Number(r.total_collected ?? 0);
      return acc;
    }, {})
  ).sort((a: any, b: any) => a.month?.localeCompare?.(b.month));

  const gaugeColor = collRate >= 80 ? C.green : collRate >= 50 ? C.yellow : C.red;

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      {kL ? <Spinner /> : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Kpi icon={DollarSign} label="Total Billed" value={CUR(k?.total_billed)} color="" />
          <Kpi icon={TrendingUp} label="Collected" value={CUR(k?.total_collected)} color="text-green-500" trend="up" />
          <Kpi icon={AlertTriangle} label="Outstanding" value={CUR(outstanding)} color="text-red-500" trend="down" sub={`${pct(outstanding, billed)}% of billed`} />
          <Kpi icon={CheckCircle} label="Paid Invoices" value={k?.paid_count ?? 0} sub={`of ${k?.invoice_count ?? 0} total`} />
          <Kpi icon={Clock} label="Partial" value={k?.partial_count ?? 0} color="text-yellow-500" />
          <Kpi icon={Flame} label="Defaulters" value={(defaulters as any[]).length} color="text-red-500" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly area chart */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Monthly Collections — {year}</CardTitle></CardHeader>
          <CardContent>
            {mL ? <Spinner /> : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={monthlyAgg} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
                  <defs>
                    <linearGradient id="cg1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.primary} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={C.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.muted} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => CUR(v)} />
                  <Area type="monotone" dataKey="collected" stroke={C.primary} fill="url(#cg1)" name="Collected" strokeWidth={2} dot={{ r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Collection ring + invoice status */}
        <Card>
          <CardHeader><CardTitle className="text-base">Collection Rate</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <RingGauge pct={Math.round(collRate)} label="collected" color={gaugeColor} />
            <div className="grid grid-cols-3 text-center text-xs gap-2">
              <div><div className="text-xl font-bold text-green-500">{k?.paid_count ?? 0}</div><div className="text-muted-foreground">Paid</div></div>
              <div><div className="text-xl font-bold text-yellow-500">{k?.partial_count ?? 0}</div><div className="text-muted-foreground">Partial</div></div>
              <div><div className="text-xl font-bold text-red-500">{k?.unpaid_count ?? 0}</div><div className="text-muted-foreground">Unpaid</div></div>
            </div>
            <div className="space-y-2 pt-2 border-t">
              <div className="flex justify-between text-xs"><span>Collected</span><span className="font-mono text-green-500">{CUR(k?.total_collected)}</span></div>
              <div className="flex justify-between text-xs"><span>Outstanding</span><span className="font-mono text-red-500">{CUR(k?.total_outstanding)}</span></div>
              <div className="flex justify-between text-xs font-semibold border-t pt-2"><span>Total Billed</span><span className="font-mono">{CUR(k?.total_billed)}</span></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── CASH FLOW tab ────────────────────────────────────────────────────────────
function CashFlowTab({ year }: { year: number }) {
  const monthlyFn = useServerFn(getMonthlyCollections);
  const expFn = useServerFn(listExpenses);

  const { data: monthly = [], isLoading: mL } = useQuery({
    queryKey: ["fin-monthly", year],
    queryFn: () => monthlyFn({ data: { year } }),
  });
  const { data: expData, isLoading: eL } = useQuery({
    queryKey: ["fin-expenses-list", year],
    queryFn: () => expFn({ data: { year, page: 0 } }),
  });

  // Build monthly income
  const incomeMap = (monthly as any[]).reduce<Record<string, number>>((acc, r) => {
    const k = r.month?.slice(0, 7) ?? "";
    acc[k] = (acc[k] ?? 0) + Number(r.total_collected ?? 0);
    return acc;
  }, {});

  // Build monthly expenses
  const expenseMap = ((expData as any)?.rows ?? []).reduce<Record<string, number>>((acc: any, r: any) => {
    const k = (r.expense_date ?? "").slice(0, 7);
    if (k) acc[k] = (acc[k] ?? 0) + Number(r.amount ?? 0);
    return acc;
  }, {});

  const allMonths = [...new Set([...Object.keys(incomeMap), ...Object.keys(expenseMap)])].sort();
  const cashflow = allMonths.map((m) => {
    const income = incomeMap[m] ?? 0;
    const expenses = expenseMap[m] ?? 0;
    return {
      month: m.slice(5), // MM
      income,
      expenses,
      net: income - expenses,
    };
  });

  const totalIncome = cashflow.reduce((s, r) => s + r.income, 0);
  const totalExpenses = cashflow.reduce((s, r) => s + r.expenses, 0);
  const netCash = totalIncome - totalExpenses;

  // Expense category breakdown
  const catMap = ((expData as any)?.rows ?? []).reduce<Record<string, number>>((acc: any, r: any) => {
    const cat = r.expense_categories?.name ?? "Uncategorised";
    acc[cat] = (acc[cat] ?? 0) + Number(r.amount ?? 0);
    return acc;
  }, {});
  const catPie = Object.entries(catMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Kpi icon={TrendingUp} label="Total Income" value={CUR(totalIncome)} color="text-green-500" />
        <Kpi icon={TrendingDown} label="Total Expenses" value={CUR(totalExpenses)} color="text-red-500" />
        <Kpi icon={Activity} label="Net Cash Flow" value={CUR(netCash)} color={netCash >= 0 ? "text-green-500" : "text-red-500"} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Income vs Expenses vs Net — {year}</CardTitle></CardHeader>
        <CardContent>
          {mL || eL ? <Spinner /> : cashflow.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={cashflow} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.muted} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => CUR(v)} />
                <Legend />
                <Bar dataKey="income" fill={C.green} name="Income" radius={[4, 4, 0, 0]} opacity={0.85} />
                <Bar dataKey="expenses" fill={C.red} name="Expenses" radius={[4, 4, 0, 0]} opacity={0.85} />
                <Line type="monotone" dataKey="net" stroke={C.primary} name="Net" strokeWidth={2} dot={{ r: 3 }} />
                <ReferenceLine y={0} stroke={C.yellow} strokeDasharray="4 4" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Expense by Category</CardTitle></CardHeader>
          <CardContent>
            {eL ? <Spinner /> : catPie.length === 0 ? <Empty msg="No expenses recorded" /> : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={catPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                      label={({ name, percent }: any) => `${name.slice(0, 12)} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}>
                      {catPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => CUR(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-3 space-y-1.5">
                  {catPie.map((c, i) => (
                    <div key={c.name} className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="font-mono text-muted-foreground">{CUR(c.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Monthly Net Cash Position</CardTitle></CardHeader>
          <CardContent>
            {mL || eL ? <Spinner /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={cashflow} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.muted} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => CUR(v)} />
                  <ReferenceLine y={0} stroke={C.yellow} strokeDasharray="4 4" />
                  <Bar dataKey="net" name="Net" radius={[4, 4, 0, 0]}>
                    {cashflow.map((r, i) => <Cell key={i} fill={r.net >= 0 ? C.green : C.red} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── BUDGET INTELLIGENCE tab ──────────────────────────────────────────────────
function BudgetTab({ year }: { year: number }) {
  const bvaFn = useServerFn(getBudgetVsActual);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["fin-bva", year],
    queryFn: () => bvaFn({ data: { year } }),
  });

  const r = rows as any[];
  const totalAlloc = r.reduce((s, x) => s + Number(x.allocated), 0);
  const totalSpent = r.reduce((s, x) => s + Number(x.actual_spent), 0);
  const totalVariance = totalAlloc - totalSpent;
  const overBudget = r.filter((x) => Number(x.utilisation_pct) > 100);
  const critical = r.filter((x) => Number(x.utilisation_pct) >= 80 && Number(x.utilisation_pct) <= 100);

  const chartData = [...r]
    .sort((a, b) => Number(b.allocated) - Number(a.allocated))
    .slice(0, 12)
    .map((x) => ({
      name: (x.category_name ?? x.budget_name ?? "—").slice(0, 14),
      Allocated: Number(x.allocated),
      Spent: Number(x.actual_spent),
      pct: Number(x.utilisation_pct),
    }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={Wallet} label="Total Budget" value={CUR(totalAlloc)} sub={`${r.length} lines`} />
        <Kpi icon={TrendingDown} label="Total Spent" value={CUR(totalSpent)} color="text-red-500" sub={`${pct(totalSpent, totalAlloc)}% utilised`} />
        <Kpi icon={totalVariance >= 0 ? CheckCircle : AlertTriangle} label="Variance"
          value={CUR(Math.abs(totalVariance))} color={totalVariance >= 0 ? "text-green-500" : "text-red-500"}
          sub={totalVariance >= 0 ? "under budget" : "OVER BUDGET"} />
        <Kpi icon={Flame} label="Over Budget" value={overBudget.length} color="text-red-500" sub={`${critical.length} approaching`} />
      </div>

      {isLoading ? <Spinner /> : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Budget vs Actual by Line</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.muted} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => CUR(v)} />
                  <Legend />
                  <Bar dataKey="Allocated" fill={C.primary} radius={[4, 4, 0, 0]} opacity={0.8} />
                  <Bar dataKey="Spent" fill={C.red} radius={[4, 4, 0, 0]} opacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {overBudget.length > 0 && (
            <Card className="border-red-500/40">
              <CardHeader>
                <CardTitle className="text-base text-red-500 flex items-center gap-2">
                  <Flame className="w-4 h-4" /> Over-Budget Lines ({overBudget.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Line</TableHead>
                      <TableHead className="text-right">Allocated</TableHead>
                      <TableHead className="text-right">Spent</TableHead>
                      <TableHead className="text-right">Overrun</TableHead>
                      <TableHead className="text-right">Utilisation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overBudget.map((x, i) => (
                      <TableRow key={i} className="bg-red-500/5">
                        <TableCell className="font-medium">{x.budget_name}<div className="text-xs text-muted-foreground">{x.category_name}</div></TableCell>
                        <TableCell className="text-right font-mono">{CUR(x.allocated)}</TableCell>
                        <TableCell className="text-right font-mono text-red-500">{CUR(x.actual_spent)}</TableCell>
                        <TableCell className="text-right font-mono text-red-500 font-bold">{CUR(Number(x.actual_spent) - Number(x.allocated))}</TableCell>
                        <TableCell className="text-right"><Badge variant="destructive">{x.utilisation_pct}%</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">All Budget Lines</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Budget / Category</TableHead>
                    <TableHead>Term</TableHead>
                    <TableHead className="text-right">Allocated</TableHead>
                    <TableHead className="text-right">Spent</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead>Utilisation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">No budget lines for {year}</TableCell></TableRow>
                  )}
                  {r.map((x, i) => {
                    const variance = Number(x.allocated) - Number(x.actual_spent);
                    const u = Number(x.utilisation_pct);
                    return (
                      <TableRow key={i}>
                        <TableCell><div className="font-medium">{x.budget_name}</div>{x.category_name && <div className="text-xs text-muted-foreground">{x.category_name}</div>}</TableCell>
                        <TableCell className="text-xs">{x.term || "All"}</TableCell>
                        <TableCell className="text-right font-mono">{CUR(x.allocated)}</TableCell>
                        <TableCell className="text-right font-mono">{CUR(x.actual_spent)}</TableCell>
                        <TableCell className={`text-right font-mono ${variance >= 0 ? "text-green-500" : "text-red-500 font-bold"}`}>
                          {variance >= 0 ? "+" : ""}{CUR(Math.abs(variance))}
                        </TableCell>
                        <TableCell className="min-w-[120px]">
                          <div className="flex items-center gap-2">
                            <div className="flex-1"><Progress value={Math.min(100, u)} className="h-1.5" /></div>
                            <Badge variant="outline" className={u >= 100 ? "border-red-500 text-red-500 text-xs" : u >= 80 ? "border-yellow-500 text-yellow-500 text-xs" : "border-green-500 text-green-500 text-xs"}>
                              {u}%
                            </Badge>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── BY CLASS tab ─────────────────────────────────────────────────────────────
function ClassesTab() {
  const classFn = useServerFn(getClassCollectionRates);
  const { data: classes = [], isLoading } = useQuery({
    queryKey: ["fin-classes"],
    queryFn: () => classFn({}),
  });

  const cls = classes as any[];
  const radarData = cls.slice(0, 8).map((c) => ({ class: c.class_name, "Rate %": Number(c.collection_pct) }));

  return (
    <div className="space-y-6">
      {isLoading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Collection Rate Radar</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke={C.muted} />
                    <PolarAngleAxis dataKey="class" tick={{ fontSize: 10 }} />
                    <Radar dataKey="Rate %" stroke={C.primary} fill={C.primary} fillOpacity={0.25} />
                    <Tooltip formatter={(v: any) => `${v}%`} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Outstanding by Class</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={cls.slice(0, 10)} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.muted} />
                    <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="class_name" width={80} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: any) => CUR(v)} />
                    <Bar dataKey="outstanding" fill={C.red} radius={[0, 4, 4, 0]} name="Outstanding">
                      {cls.slice(0, 10).map((c, i) => (
                        <Cell key={i} fill={Number(c.collection_pct) >= 80 ? C.green : Number(c.collection_pct) >= 50 ? C.yellow : C.red} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Class Fee Summary</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead className="text-right">Students</TableHead>
                    <TableHead className="text-right">Billed</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cls.map((c) => {
                    const rate = Number(c.collection_pct);
                    return (
                      <TableRow key={c.class_id}>
                        <TableCell className="font-medium">{c.class_name}</TableCell>
                        <TableCell className="text-right">{c.students_invoiced}</TableCell>
                        <TableCell className="text-right font-mono">{CUR(c.total_billed)}</TableCell>
                        <TableCell className="text-right font-mono text-green-500">{CUR(c.total_paid)}</TableCell>
                        <TableCell className="text-right font-mono text-red-500">{CUR(c.outstanding)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[100px]">
                            <div className="flex-1"><Progress value={rate} className="h-1.5" /></div>
                            <Badge variant="outline" className={rate >= 80 ? "border-green-500 text-green-500 text-xs" : rate >= 50 ? "border-yellow-500 text-yellow-500 text-xs" : "border-red-500 text-red-500 text-xs"}>
                              {rate}%
                            </Badge>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── TERM P&L tab ─────────────────────────────────────────────────────────────
function TermsTab({ year }: { year: number }) {
  const termFn = useServerFn(getTermSummary);
  const { data: termRows = [], isLoading } = useQuery({
    queryKey: ["fin-term", year],
    queryFn: () => termFn({ data: { year } }),
  });

  const tr = termRows as any[];
  const termChart = tr.map((r) => ({
    term: r.term,
    Collected: Number(r.total_collected),
    Expenses: Number(r.total_expenses),
    Outstanding: Number(r.outstanding),
  }));

  return (
    <div className="space-y-6">
      {isLoading ? <Spinner /> : (
        <>
          {/* Term rings */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {tr.map((r) => {
              const rate = r.total_billed ? Math.round((r.total_collected / r.total_billed) * 100) : 0;
              const color = TERM_COLORS[r.term] ?? C.primary;
              return (
                <Card key={r.term}>
                  <CardHeader><CardTitle className="text-sm font-semibold" style={{ color }}>{r.term}</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <RingGauge pct={rate} label="collected" color={color} />
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">Billed</span><span className="font-mono">{CUR(r.total_billed)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Collected</span><span className="font-mono text-green-500">{CUR(r.total_collected)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Expenses</span><span className="font-mono text-red-500">{CUR(r.total_expenses)}</span></div>
                      <div className="flex justify-between border-t pt-1.5 font-semibold"><span>Net Surplus</span>
                        <span className={`font-mono ${Number(r.net_surplus) >= 0 ? "text-green-500" : "text-red-500"}`}>{CUR(r.net_surplus)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Term Comparison — Collected vs Expenses vs Outstanding</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={termChart} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.muted} />
                  <XAxis dataKey="term" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => CUR(v)} />
                  <Legend />
                  <Bar dataKey="Collected" fill={C.green} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Expenses" fill={C.red} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Outstanding" fill={C.yellow} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Term P&L Summary</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Term</TableHead>
                    <TableHead className="text-right">Billed</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Net Surplus</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tr.map((r) => (
                    <TableRow key={r.term}>
                      <TableCell className="font-semibold" style={{ color: TERM_COLORS[r.term] }}>{r.term}</TableCell>
                      <TableCell className="text-right font-mono">{CUR(r.total_billed)}</TableCell>
                      <TableCell className="text-right font-mono text-green-500">{CUR(r.total_collected)}</TableCell>
                      <TableCell className="text-right font-mono text-red-500">{CUR(r.total_expenses)}</TableCell>
                      <TableCell className="text-right font-mono text-yellow-500">{CUR(r.outstanding)}</TableCell>
                      <TableCell className={`text-right font-mono font-bold ${Number(r.net_surplus) >= 0 ? "text-green-500" : "text-red-500"}`}>
                        {CUR(r.net_surplus)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── PAYMENT METHODS tab ──────────────────────────────────────────────────────
function MethodsTab({ year }: { year: number }) {
  const methodFn = useServerFn(getPaymentMethodBreakdown);
  const { data: methods = [] } = useQuery({
    queryKey: ["fin-methods", year],
    queryFn: () => methodFn({ data: { year } }),
  });

  const m = methods as any[];
  const methodPie = Object.values(
    m.reduce<Record<string, any>>((acc, r) => {
      const k = r.method;
      if (!acc[k]) acc[k] = { method: k, total: 0 };
      acc[k].total += Number(r.total);
      return acc;
    }, {})
  ).sort((a: any, b: any) => b.total - a.total);

  const grandTotal = methodPie.reduce((s: number, x: any) => s + x.total, 0);

  const monthlyStacked = Object.values(
    m.reduce<Record<string, any>>((acc, r) => {
      const k = (r.month_short ?? "") + " " + (r.year ?? "");
      if (!acc[k]) acc[k] = { label: r.month_short, sort: r.month_sort };
      acc[k][r.method] = (acc[k][r.method] ?? 0) + Number(r.total);
      return acc;
    }, {})
  ).sort((a: any, b: any) => a.sort?.localeCompare?.(b.sort));

  const METHOD_KEYS = ["cash", "mpesa", "bank_transfer", "cheque", "card", "other"];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Payment Method Mix</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={methodPie} dataKey="total" nameKey="method" cx="50%" cy="50%" outerRadius={100} innerRadius={50}>
                  {methodPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => CUR(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-3 space-y-2">
              {(methodPie as any[]).map((mp: any, i: number) => (
                <div key={mp.method} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="capitalize flex-1">{mp.method.replace(/_/g, " ")}</span>
                  <span className="font-mono text-xs text-muted-foreground">{grandTotal > 0 ? Math.round((mp.total / grandTotal) * 100) : 0}%</span>
                  <span className="font-mono text-xs">{CUR(mp.total)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Monthly Method Breakdown</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyStacked} margin={{ left: 4, right: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.muted} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => CUR(v)} />
                <Legend />
                {METHOD_KEYS.map((key, i) => (
                  <Bar key={key} dataKey={key} stackId="a" fill={PIE_COLORS[i % PIE_COLORS.length]} name={key.replace(/_/g, " ")} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── DEFAULTERS tab ───────────────────────────────────────────────────────────
function DefaultersTab() {
  const defaulterFn = useServerFn(getFeeDefaulters);
  const { data: defaulters = [], isLoading } = useQuery({
    queryKey: ["fin-defaulters"],
    queryFn: () => defaulterFn({}),
  });

  const d = defaulters as any[];
  const totalOwed = d.reduce((s, x) => s + Number(x.balance), 0);
  const critical = d.filter((x) => x.days_overdue > 90).length;
  const serious = d.filter((x) => x.days_overdue > 30 && x.days_overdue <= 90).length;

  // By class breakdown
  const byClass = Object.values(
    d.reduce<Record<string, any>>((acc, r) => {
      const k = r.class_name ?? "Unknown";
      if (!acc[k]) acc[k] = { class: k, count: 0, owed: 0 };
      acc[k].count++;
      acc[k].owed += Number(r.balance);
      return acc;
    }, {})
  ).sort((a: any, b: any) => b.owed - a.owed);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={Flame} label="Total Defaulters" value={d.length} color="text-red-500" />
        <Kpi icon={AlertTriangle} label="Total Owed" value={CUR(totalOwed)} color="text-red-500" />
        <Kpi icon={Flame} label="Critical (>90d)" value={critical} color="text-red-500" sub="needs urgent action" />
        <Kpi icon={Clock} label="Serious (>30d)" value={serious} color="text-yellow-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Defaulters by Class</CardTitle></CardHeader>
          <CardContent>
            {byClass.length === 0 ? <Empty msg="🎉 No defaulters" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byClass.slice(0, 10)} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.muted} />
                  <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="class" width={70} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any, name: any) => name === "owed" ? CUR(v) : v} />
                  <Bar dataKey="owed" fill={C.red} radius={[0, 4, 4, 0]} name="Owed" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Overdue Age Distribution</CardTitle></CardHeader>
          <CardContent>
            {(() => {
              const buckets = [
                { label: "1–30d", count: d.filter((x) => x.days_overdue <= 30).length, color: C.yellow },
                { label: "31–60d", count: d.filter((x) => x.days_overdue > 30 && x.days_overdue <= 60).length, color: C.orange },
                { label: "61–90d", count: d.filter((x) => x.days_overdue > 60 && x.days_overdue <= 90).length, color: C.red },
                { label: ">90d", count: d.filter((x) => x.days_overdue > 90).length, color: "#7f1d1d" },
              ];
              return (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={buckets} margin={{ left: 8, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.muted} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Students" radius={[4, 4, 0, 0]}>
                        {buckets.map((b, i) => <Cell key={i} fill={b.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {buckets.map((b) => (
                      <div key={b.label} className="text-center">
                        <div className="text-lg font-bold" style={{ color: b.color }}>{b.count}</div>
                        <div className="text-[10px] text-muted-foreground">{b.label}</div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Defaulter List</CardTitle>
            <Badge variant="destructive">{d.length} students</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <Spinner /> : d.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">🎉 No defaulters — all invoices within due date</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Adm No</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.slice(0, 100).map((x) => (
                  <TableRow key={x.invoice_no} className={x.days_overdue > 90 ? "bg-red-500/5" : x.days_overdue > 30 ? "bg-yellow-500/5" : ""}>
                    <TableCell className="font-medium">{x.student_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{x.admission_no}</TableCell>
                    <TableCell>{x.class_name}</TableCell>
                    <TableCell className="text-right font-mono text-red-500">{CUR(x.balance)}</TableCell>
                    <TableCell className="text-xs">{x.due_date}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={x.days_overdue > 90 ? "destructive" : "outline"}
                        className={x.days_overdue > 30 && x.days_overdue <= 90 ? "border-orange-500 text-orange-500" : ""}>
                        {x.days_overdue}d
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
