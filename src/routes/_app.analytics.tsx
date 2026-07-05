import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  TrendingUp, AlertTriangle, Users, Wallet, GraduationCap, Sparkles,
  Activity, Library, Utensils, Package, Bus, Stethoscope, ShieldCheck,
  Trophy, BookOpen, DollarSign, ShieldAlert, Building2,
} from "lucide-react";
import { AcademicAnalyticsPanel } from "@/components/dashboard/AcademicAnalyticsPanel";
import type { AppRole } from "@/core/rbac";
import { ANALYTICS_MODULES, getVisibleAnalyticsModules, type AnalyticsModuleKey } from "@/core/rbac/analytics";

export const Route = createFileRoute("/_app/analytics")({ component: Analytics });

const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "#f59e0b", "#ef4444", "#10b981", "#6366f1"];

// ─── Tab definitions ──────────────────────────────────────────────────────────
// Visibility now comes from the ANALYTICS_MODULES registry (core/rbac/analytics.ts),
// which checks a dedicated "analytics.<module>" permission per module instead of
// hardcoded role arrays here. Icons and rendered components still live with the
// route since they're presentation, not access-control, concerns.
const TAB_ICONS: Record<AnalyticsModuleKey, React.ComponentType<{ className?: string }>> = {
  overview: TrendingUp,
  academics: GraduationCap,
  finance: DollarSign,
  library: Library,
  kitchen: Utensils,
  store: Package,
  transport: Bus,
  clinic: Stethoscope,
  security: ShieldCheck,
  sports: Trophy,
  discipline: ShieldAlert,
  boarding: Building2,
};

const TAB_COMPONENTS: Record<AnalyticsModuleKey, React.ComponentType> = {
  overview: OverviewTab,
  academics: AcademicsTab,
  finance: FinanceTab,
  library: LibraryTab,
  kitchen: KitchenTab,
  store: StoreTab,
  transport: TransportTab,
  clinic: ClinicTab,
  security: SecurityTab,
  sports: SportsTab,
  discipline: DisciplineTab,
  boarding: BoardingTab,
};

function Analytics() {
  const { roles } = useAuth();
  const userRoles = (roles ?? []) as AppRole[];

  const visibleKeys = getVisibleAnalyticsModules(userRoles);
  const visibleTabs = ANALYTICS_MODULES.filter((m) => visibleKeys.includes(m.key));
  const [activeTab, setActiveTab] = useState<AnalyticsModuleKey>(visibleTabs[0]?.key ?? "overview");

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="w-5 h-5" /> Analytics & Intelligence
        </h1>
        <p className="text-sm text-muted-foreground">Real-time insights across all departments</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto pb-1 border-b">
        {visibleTabs.map((t) => {
          const Icon = TAB_ICONS[t.key];
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-t whitespace-nowrap transition-colors ${
                activeTab === t.key
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

      {(() => {
        const ActiveComponent = TAB_COMPONENTS[activeTab];
        return <ActiveComponent />;
      })()}
    </div>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────
function OverviewTab() {
  const { data: kpis } = useQuery({
    queryKey: ["analytics-kpis"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const [students, staff, finance, attendance] = await Promise.all([
        supabase.from("students").select("id,gender", { count: "exact" }),
        supabase.from("staff").select("id", { count: "exact", head: true }),
        (supabase as any).from("v_finance_summary").select("total_invoiced,total_paid,defaulters,collection_pct").maybeSingle(),
        (supabase as any).from("v_attendance_daily").select("date,present,absent").gte("date", since).order("date", { ascending: true }),
      ]);
      const f = (finance.data ?? {}) as any;
      return {
        students: students.count ?? 0, staff: staff.count ?? 0,
        totalInvoiced: Number(f.total_invoiced ?? 0), totalPaid: Number(f.total_paid ?? 0),
        collection: Number(f.collection_pct ?? 0), defaulters: Number(f.defaulters ?? 0),
        attendance: attendance.data ?? [], genders: students.data ?? [],
      };
    },
  });

  const { data: atRisk = [] } = useQuery({
    queryKey: ["analytics-at-risk"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const [att, weak] = await Promise.all([
        (supabase as any).from("attendance_records").select("student_id, status, students(first_name, last_name, admission_no, classes(name))").gte("date", since),
        (supabase as any).from("v_weak_students").select("student_id, admission_no, first_name, last_name, mean_score"),
      ]);
      const attMap = new Map<string, any>();
      (att.data ?? []).forEach((r: any) => {
        const s = r.students; if (!s) return;
        const cur = attMap.get(r.student_id) ?? { name: `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim(), admno: s.admission_no ?? "", className: s.classes?.name ?? "—", total: 0, present: 0 };
        cur.total++; if (r.status === "present") cur.present++;
        attMap.set(r.student_id, cur);
      });
      const weakMap = new Map<string, number>();
      (weak.data ?? []).forEach((w: any) => weakMap.set(w.student_id, Number(w.mean_score)));
      const results: any[] = [];
      attMap.forEach((v, id) => {
        const attPct = v.total ? Math.round((v.present / v.total) * 100) : 100;
        const mean = weakMap.get(id);
        const lowAtt = attPct < 75, lowMean = mean !== undefined && mean < 40;
        if (lowAtt || lowMean) results.push({ id, ...v, attendance: attPct, mean: mean ?? null, risk: lowAtt && lowMean ? "Both" : lowAtt ? "Attendance" : "Academic" });
      });
      return results.sort((a, b) => (a.attendance ?? 100) - (b.attendance ?? 100)).slice(0, 20);
    },
  });

  const attTrend = ((kpis?.attendance ?? []) as any[]).map((r) => ({ date: r.date, present: Number(r.present ?? 0), absent: Number(r.absent ?? 0) }));
  const genderMix = (() => {
    const m = new Map<string, number>();
    (kpis?.genders ?? []).forEach((s: any) => { const g = s.gender || "Unknown"; m.set(g, (m.get(g) ?? 0) + 1); });
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  })();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<GraduationCap className="w-4 h-4" />} label="Students" value={kpis?.students ?? 0} />
        <Kpi icon={<Users className="w-4 h-4" />} label="Staff" value={kpis?.staff ?? 0} />
        <Kpi icon={<Wallet className="w-4 h-4" />} label="Fee Collection" value={`${(kpis?.collection ?? 0).toFixed(0)}%`} sub={`KES ${(kpis?.totalPaid ?? 0).toLocaleString()} / ${(kpis?.totalInvoiced ?? 0).toLocaleString()}`} />
        <Kpi icon={<AlertTriangle className="w-4 h-4 text-destructive" />} label="Defaulters" value={kpis?.defaulters ?? 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Attendance trend (30 days)</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer>
              <LineChart data={attTrend}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis /><Tooltip /><Legend />
                <Line type="monotone" dataKey="present" stroke="#10b981" strokeWidth={2} />
                <Line type="monotone" dataKey="absent" stroke="#ef4444" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Student gender mix</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={genderMix} dataKey="value" nameKey="name" outerRadius={90} label>
                  {genderMix.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4 text-destructive" /> At-risk students</CardTitle></CardHeader>
        <CardContent>
          {atRisk.length === 0 ? <p className="text-sm text-muted-foreground">No at-risk students right now.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Adm No</TableHead><TableHead>Class</TableHead><TableHead>Attendance</TableHead><TableHead>Mean</TableHead><TableHead>Risk</TableHead></TableRow></TableHeader>
              <TableBody>
                {atRisk.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.name}</TableCell><TableCell>{s.admno}</TableCell><TableCell>{s.className}</TableCell>
                    <TableCell className={s.attendance !== null && s.attendance < 75 ? "text-destructive" : ""}>{s.attendance !== null ? `${s.attendance}%` : "—"}</TableCell>
                    <TableCell className={s.mean !== null && s.mean < 40 ? "text-destructive" : ""}>{s.mean !== null ? s.mean : "—"}</TableCell>
                    <TableCell><Badge variant={s.risk === "Both" ? "destructive" : "secondary"}>{s.risk}</Badge></TableCell>
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

// ─── Academics tab ────────────────────────────────────────────────────────────
function AcademicsTab() {
  const { data: subjectAvg = [] } = useQuery({
    queryKey: ["analytics-subject-means"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("v_subject_means").select("subject_code,mean_score").order("mean_score", { ascending: false });
      return (data ?? []).map((r: any) => ({ code: r.subject_code ?? "—", mean: Number(r.mean_score) }));
    },
  });

  const { data: classPerf = [] } = useQuery({
    queryKey: ["analytics-class-perf"],
    queryFn: async () => {
      const { data: results } = await (supabase as any).from("exam_results").select("score, students(class_id, classes(name))");
      const map = new Map<string, { className: string; sum: number; count: number }>();
      (results ?? []).forEach((r: any) => {
        const cls = r.students?.classes?.name ?? "—";
        const cur = map.get(cls) ?? { className: cls, sum: 0, count: 0 };
        cur.sum += Number(r.score ?? 0); cur.count++;
        map.set(cls, cur);
      });
      return Array.from(map.values()).map((c) => ({ className: c.className, mean: c.count ? Math.round((c.sum / c.count) * 10) / 10 : 0 })).sort((a, b) => b.mean - a.mean);
    },
  });

  const { data: weakStudents = [] } = useQuery({
    queryKey: ["analytics-weak"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("v_weak_students").select("student_id,admission_no,first_name,last_name,mean_score").order("mean_score", { ascending: true }).limit(10);
      return (data ?? []).map((r: any) => ({ id: r.student_id, name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(), admno: r.admission_no ?? "", mean: Number(r.mean_score) }));
    },
  });

  return (
    <div className="space-y-6">
      <AcademicAnalyticsPanel />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Subject performance (avg score)</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <BarChart data={subjectAvg.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="code" /><YAxis domain={[0, 100]} /><Tooltip />
                <Bar dataKey="mean" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Class performance comparison</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <BarChart data={classPerf}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="className" /><YAxis domain={[0, 100]} /><Tooltip />
                <Bar dataKey="mean" fill="hsl(var(--accent))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> AI insights — students at risk (academic)</CardTitle></CardHeader>
        <CardContent>
          {weakStudents.length === 0 ? <p className="text-sm text-muted-foreground">No struggling students detected — great work!</p> : (
            <ul className="text-sm space-y-1.5">
              {weakStudents.map((s: any) => (
                <li key={s.id} className="flex items-center justify-between border-b pb-1.5">
                  <div><div className="font-medium">{s.name}</div><div className="text-xs text-muted-foreground">{s.admno}</div></div>
                  <Badge variant="destructive">{s.mean.toFixed(1)} avg</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Finance tab ──────────────────────────────────────────────────────────────
function FinanceTab() {
  const { data: financeTrend = [] } = useQuery({
    queryKey: ["analytics-finance-trend"],
    queryFn: async () => {
      const since = new Date(); since.setMonth(since.getMonth() - 6);
      const sinceStr = since.toISOString().slice(0, 10);
      const [pays, invs] = await Promise.all([
        (supabase as any).from("payments").select("amount, created_at").gte("created_at", sinceStr),
        supabase.from("invoices").select("amount, created_at").gte("created_at", sinceStr),
      ]);
      const buckets = new Map<string, { month: string; collected: number; invoiced: number }>();
      const ensure = (k: string) => { if (!buckets.has(k)) buckets.set(k, { month: k, collected: 0, invoiced: 0 }); return buckets.get(k)!; };
      (pays.data ?? []).forEach((p: any) => { const m = p.created_at?.slice(0, 7); if (m) ensure(m).collected += Number(p.amount ?? 0); });
      (invs.data ?? []).forEach((i: any) => { const m = i.created_at?.slice(0, 7); if (m) ensure(m).invoiced += Number(i.amount ?? 0); });
      return Array.from(buckets.values()).sort((a, b) => a.month.localeCompare(b.month));
    },
  });

  const { data: summary } = useQuery({
    queryKey: ["analytics-finance-summary"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("v_finance_summary").select("*").maybeSingle();
      return data ?? {};
    },
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<Wallet className="w-4 h-4" />} label="Total Invoiced" value={`KES ${Number(summary?.total_invoiced ?? 0).toLocaleString()}`} />
        <Kpi icon={<TrendingUp className="w-4 h-4 text-green-500" />} label="Total Collected" value={`KES ${Number(summary?.total_paid ?? 0).toLocaleString()}`} />
        <Kpi icon={<Activity className="w-4 h-4" />} label="Collection Rate" value={`${Number(summary?.collection_pct ?? 0).toFixed(1)}%`} />
        <Kpi icon={<AlertTriangle className="w-4 h-4 text-destructive" />} label="Defaulters" value={summary?.defaulters ?? 0} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Revenue trend (last 6 months)</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer>
            <LineChart data={financeTrend}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Legend />
              <Line type="monotone" dataKey="invoiced" stroke="hsl(var(--primary))" strokeWidth={2} />
              <Line type="monotone" dataKey="collected" stroke="#10b981" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Library tab ──────────────────────────────────────────────────────────────
function LibraryTab() {
  const { data: loans = [] } = useQuery({
    queryKey: ["analytics-library-loans"],
    queryFn: async () => {
      const { data } = await supabase.from("library_loans").select("id, returned, due_date, created_at, book_id, student_id");
      return data ?? [];
    },
  });

  const active = loans.filter((l: any) => !l.returned).length;
  const overdue = loans.filter((l: any) => !l.returned && l.due_date && new Date(l.due_date) < new Date()).length;
  const returned = loans.filter((l: any) => l.returned).length;

  const monthly = (() => {
    const m = new Map<string, number>();
    loans.forEach((l: any) => { const k = (l.created_at ?? "").slice(0, 7); if (k) m.set(k, (m.get(k) ?? 0) + 1); });
    return Array.from(m.entries()).sort().map(([month, count]) => ({ month, count }));
  })();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Kpi icon={<BookOpen className="w-4 h-4" />} label="Active Loans" value={active} />
        <Kpi icon={<AlertTriangle className="w-4 h-4 text-destructive" />} label="Overdue" value={overdue} />
        <Kpi icon={<TrendingUp className="w-4 h-4 text-green-500" />} label="Returned" value={returned} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Monthly loan activity</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Kitchen tab ──────────────────────────────────────────────────────────────
function KitchenTab() {
  const { data: meals = [] } = useQuery({
    queryKey: ["analytics-kitchen-meals"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const { data } = await (supabase as any).from("kitchen_meals").select("id, meal_type, date, servings").gte("date", since).order("date");
      return data ?? [];
    },
  });

  const totalServings = meals.reduce((s: number, m: any) => s + Number(m.servings ?? 0), 0);
  const byType = (() => {
    const m = new Map<string, number>();
    meals.forEach((meal: any) => { const t = meal.meal_type ?? "Other"; m.set(t, (m.get(t) ?? 0) + Number(meal.servings ?? 1)); });
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  })();
  const daily = (() => {
    const m = new Map<string, number>();
    meals.forEach((meal: any) => { const d = meal.date ?? ""; if (d) m.set(d, (m.get(d) ?? 0) + Number(meal.servings ?? 1)); });
    return Array.from(m.entries()).sort().map(([date, servings]) => ({ date, servings }));
  })();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <Kpi icon={<Utensils className="w-4 h-4" />} label="Meals (30 days)" value={meals.length} />
        <Kpi icon={<Users className="w-4 h-4" />} label="Total Servings" value={totalServings} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Servings by meal type</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byType} dataKey="value" nameKey="name" outerRadius={80} label>
                  {byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Daily servings trend</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer>
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis /><Tooltip />
                <Line type="monotone" dataKey="servings" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Store / Inventory tab ────────────────────────────────────────────────────
function StoreTab() {
  const { data: items = [] } = useQuery({
    queryKey: ["analytics-inventory"],
    queryFn: async () => {
      const { data } = await supabase.from("inventory_items").select("id, name, quantity, unit, category, reorder_level");
      return data ?? [];
    },
  });

  const lowStock = items.filter((i: any) => Number(i.quantity ?? 0) <= Number(i.reorder_level ?? 0));
  const byCategory = (() => {
    const m = new Map<string, number>();
    items.forEach((i: any) => { const c = i.category ?? "General"; m.set(c, (m.get(c) ?? 0) + 1); });
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  })();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Kpi icon={<Package className="w-4 h-4" />} label="Total Items" value={items.length} />
        <Kpi icon={<AlertTriangle className="w-4 h-4 text-destructive" />} label="Low Stock" value={lowStock.length} />
        <Kpi icon={<TrendingUp className="w-4 h-4" />} label="Categories" value={byCategory.length} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Items by category</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer>
              <BarChart data={byCategory}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-destructive" /> Low stock items</CardTitle></CardHeader>
          <CardContent>
            {lowStock.length === 0 ? <p className="text-sm text-muted-foreground">All items are sufficiently stocked.</p> : (
              <ul className="text-sm space-y-1.5">
                {lowStock.map((i: any) => (
                  <li key={i.id} className="flex items-center justify-between border-b pb-1.5">
                    <div><div className="font-medium">{i.name}</div><div className="text-xs text-muted-foreground">{i.category}</div></div>
                    <Badge variant="destructive">{i.quantity} {i.unit}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Transport tab ────────────────────────────────────────────────────────────
function TransportTab() {
  const { data: routes = [] } = useQuery({
    queryKey: ["analytics-transport-routes"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("transport_routes").select("id, name, capacity, assigned_students");
      return data ?? [];
    },
  });

  const totalCapacity = routes.reduce((s: number, r: any) => s + Number(r.capacity ?? 0), 0);
  const totalAssigned = routes.reduce((s: number, r: any) => s + Number(r.assigned_students ?? 0), 0);
  const utilisation = totalCapacity > 0 ? Math.round((totalAssigned / totalCapacity) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Kpi icon={<Bus className="w-4 h-4" />} label="Routes" value={routes.length} />
        <Kpi icon={<Users className="w-4 h-4" />} label="Students Assigned" value={totalAssigned} />
        <Kpi icon={<Activity className="w-4 h-4" />} label="Utilisation" value={`${utilisation}%`} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Route capacity vs assigned</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer>
            <BarChart data={routes.map((r: any) => ({ name: r.name, capacity: Number(r.capacity ?? 0), assigned: Number(r.assigned_students ?? 0) }))}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend />
              <Bar dataKey="capacity" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="assigned" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Clinic tab ───────────────────────────────────────────────────────────────
function ClinicTab() {
  const { data: visits = [] } = useQuery({
    queryKey: ["analytics-clinic-visits"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const { data } = await supabase.from("clinic_visits").select("id, visit_date, complaint, student_id").gte("visit_date", since);
      return data ?? [];
    },
  });

  const byComplaint = (() => {
    const m = new Map<string, number>();
    visits.forEach((v: any) => { const c = v.complaint ?? "General"; m.set(c, (m.get(c) ?? 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }));
  })();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <Kpi icon={<Stethoscope className="w-4 h-4" />} label="Visits (30 days)" value={visits.length} />
        <Kpi icon={<Activity className="w-4 h-4" />} label="Unique Complaints" value={byComplaint.length} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Top complaints (30 days)</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer>
            <BarChart data={byComplaint} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} /><Tooltip />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Security tab ─────────────────────────────────────────────────────────────
function SecurityTab() {
  const { data: logs = [] } = useQuery({
    queryKey: ["analytics-security-logs"],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
      const { data } = await supabase.from("security_logs").select("id, event_type, created_at").gte("created_at", since);
      return data ?? [];
    },
  });

  const byType = (() => {
    const m = new Map<string, number>();
    logs.forEach((l: any) => { const t = l.event_type ?? "Unknown"; m.set(t, (m.get(t) ?? 0) + 1); });
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  })();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <Kpi icon={<ShieldCheck className="w-4 h-4" />} label="Events (7 days)" value={logs.length} />
        <Kpi icon={<Activity className="w-4 h-4" />} label="Event Types" value={byType.length} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Events by type (7 days)</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={byType} dataKey="value" nameKey="name" outerRadius={80} label>
                {byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sports tab ───────────────────────────────────────────────────────────────
function SportsTab() {
  const { data: activities = [] } = useQuery({
    queryKey: ["analytics-cocurricular"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("cocurricular_activities").select("id, name, category, enrolled_count");
      return data ?? [];
    },
  });

  const totalEnrolled = activities.reduce((s: number, a: any) => s + Number(a.enrolled_count ?? 0), 0);
  const byCategory = (() => {
    const m = new Map<string, number>();
    activities.forEach((a: any) => { const c = a.category ?? "General"; m.set(c, (m.get(c) ?? 0) + 1); });
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  })();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Kpi icon={<Trophy className="w-4 h-4" />} label="Activities" value={activities.length} />
        <Kpi icon={<Users className="w-4 h-4" />} label="Total Enrolled" value={totalEnrolled} />
        <Kpi icon={<Activity className="w-4 h-4" />} label="Categories" value={byCategory.length} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Activities by category</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer>
            <BarChart data={byCategory}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Discipline tab ───────────────────────────────────────────────────────────
function DisciplineTab() {
  const { data: incidents = [] } = useQuery({
    queryKey: ["analytics-discipline-incidents"],
    queryFn: async () => {
      const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
      const { data } = await (supabase as any)
        .from("discipline_records")
        .select("id, incident_date, category, severity, student_id")
        .gte("incident_date", since);
      return data ?? [];
    },
  });
  const { data: counselling = [] } = useQuery({
    queryKey: ["analytics-counselling-sessions"],
    queryFn: async () => {
      const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
      const { data } = await (supabase as any)
        .from("counselling_sessions")
        .select("id, session_date")
        .gte("session_date", since);
      return data ?? [];
    },
  });

  const byCategory = (() => {
    const m = new Map<string, number>();
    incidents.forEach((i: any) => { const c = i.category ?? "Uncategorized"; m.set(c, (m.get(c) ?? 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }));
  })();
  const bySeverity = (() => {
    const m = new Map<string, number>();
    incidents.forEach((i: any) => { const s = i.severity ?? "Unspecified"; m.set(s, (m.get(s) ?? 0) + 1); });
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  })();
  const repeatOffenderCount = (() => {
    const m = new Map<string, number>();
    incidents.forEach((i: any) => { if (i.student_id) m.set(i.student_id, (m.get(i.student_id) ?? 0) + 1); });
    return [...m.values()].filter((n) => n > 1).length;
  })();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<ShieldAlert className="w-4 h-4" />} label="Incidents (90 days)" value={incidents.length} />
        <Kpi icon={<AlertTriangle className="w-4 h-4 text-destructive" />} label="Repeat cases" value={repeatOffenderCount} />
        <Kpi icon={<Activity className="w-4 h-4" />} label="Counselling sessions" value={counselling.length} />
        <Kpi icon={<Activity className="w-4 h-4" />} label="Categories" value={byCategory.length} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Top incident categories (90 days)</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer>
              <BarChart data={byCategory} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} /><Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">By severity (90 days)</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={bySeverity} dataKey="value" nameKey="name" outerRadius={80} label>
                  {bySeverity.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Boarding tab ─────────────────────────────────────────────────────────────
function BoardingTab() {
  const today = new Date().toISOString().slice(0, 10);
  const { data: dorms = [] } = useQuery({
    queryKey: ["analytics-dormitories"],
    queryFn: async () => (await (supabase as any).from("dormitories").select("id, name, gender, capacity")).data ?? [],
  });
  const { data: assignments = [] } = useQuery({
    queryKey: ["analytics-dorm-assignments"],
    queryFn: async () => (await (supabase as any).from("dorm_assignments").select("id, dorm_id, active").eq("active", true)).data ?? [],
  });
  const { data: rollCall = [] } = useQuery({
    queryKey: ["analytics-boarding-roll-call", today],
    queryFn: async () => (await (supabase as any).from("boarding_roll_call").select("status").eq("roll_date", today)).data ?? [],
  });
  const { data: maintenance = [] } = useQuery({
    queryKey: ["analytics-dorm-maintenance-open"],
    queryFn: async () => (await (supabase as any).from("dorm_maintenance").select("id").neq("status", "resolved")).data ?? [],
  });

  const totalCapacity = dorms.reduce((s: number, d: any) => s + Number(d.capacity ?? 0), 0);
  const occupied = assignments.length;
  const occupancyPct = totalCapacity ? Math.round((occupied / totalCapacity) * 100) : 0;
  const presentTonight = rollCall.filter((r: any) => r.status === "present").length;

  const byDorm = (() => {
    const counts = new Map<string, number>();
    assignments.forEach((a: any) => { if (a.dorm_id) counts.set(a.dorm_id, (counts.get(a.dorm_id) ?? 0) + 1); });
    return dorms.map((d: any) => ({ name: d.name, occupied: counts.get(d.id) ?? 0, capacity: Number(d.capacity ?? 0) }));
  })();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<Building2 className="w-4 h-4" />} label="Dormitories" value={dorms.length} />
        <Kpi icon={<Users className="w-4 h-4" />} label="Occupancy" value={`${occupancyPct}%`} sub={`${occupied} / ${totalCapacity} beds`} />
        <Kpi icon={<Activity className="w-4 h-4" />} label="Present tonight" value={presentTonight} />
        <Kpi icon={<AlertTriangle className="w-4 h-4 text-destructive" />} label="Open maintenance" value={maintenance.length} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Occupancy by dormitory</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer>
            <BarChart data={byDorm}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis /><Tooltip /><Legend />
              <Bar dataKey="occupied" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              <Bar dataKey="capacity" fill="hsl(var(--muted))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: any; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}
