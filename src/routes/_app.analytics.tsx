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
  Briefcase, MessageSquare, CalendarCheck,
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
  attendance: CalendarCheck,
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
  hr: Briefcase,
  communication: MessageSquare,
};

const TAB_COMPONENTS: Record<AnalyticsModuleKey, React.ComponentType> = {
  overview: OverviewTab,
  academics: AcademicsTab,
  attendance: AttendanceTab,
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
  hr: HrTab,
  communication: CommunicationTab,
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
// ─── Animated number (count-up on scroll into view) ───────────────────────────
function AnimatedNumber({ value, format }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 0.9,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [inView, value]);

  return <span ref={ref}>{format ? format(display) : Math.round(display).toLocaleString()}</span>;
}

// ─── Animated KPI card ──────────────────────────────────────────────────────
function AnimatedKpi({
  icon, label, value, format, sub, tone, delay = 0,
}: {
  icon: React.ReactNode; label: string; value: number; format?: (n: number) => string;
  sub?: string; tone?: "default" | "good" | "warn" | "bad"; delay?: number;
}) {
  const toneClass = tone === "good" ? "text-emerald-600 dark:text-emerald-400"
    : tone === "warn" ? "text-amber-600 dark:text-amber-400"
    : tone === "bad" ? "text-destructive" : "";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      whileHover={{ y: -2 }}
    >
      <Card className="overflow-hidden">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
          <div className={`text-2xl font-bold mt-1 ${toneClass}`}>
            <AnimatedNumber value={value} format={format} />
          </div>
          {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Chart card wrapper (fade + slide in once visible) ─────────────────────────
function ChartCard({ title, icon, children, delay = 0, className = "" }: {
  title: string; icon?: React.ReactNode; children: React.ReactNode; delay?: number; className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.45, delay, ease: "easeOut" }}
      className={className}
    >
      <Card className="h-full">
        <CardHeader><CardTitle className="text-base flex items-center gap-2">{icon}{title}</CardTitle></CardHeader>
        <CardContent className="h-64">{children}</CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────
function OverviewTab() {
  const { data: kpis } = useQuery({
    queryKey: ["analytics-kpis"],
    queryFn: async () => {
      const since30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      const [students, staff, finance, attendance, newAdm, todayAtt, leavers] = await Promise.all([
        supabase.from("students").select("id,gender,class_id", { count: "exact" }).eq("lifecycle_status", "active"),
        supabase.from("staff").select("id", { count: "exact", head: true }).eq("lifecycle_status", "active"),
        (supabase as any).from("v_finance_summary").select("total_invoiced,total_paid,defaulters,collection_pct").maybeSingle(),
        (supabase as any).from("v_attendance_daily").select("date,present,absent,late,total").gte("date", since30).order("date", { ascending: true }),
        supabase.from("students").select("id", { count: "exact", head: true }).eq("lifecycle_status", "active").gte("admission_date", since30),
        supabase.from("attendance_records").select("status", { count: "exact", head: true }).eq("date", today).eq("status", "present"),
        (supabase as any).from("lifecycle_events").select("to_status", { count: "exact", head: true }).in("to_status", ["graduated", "expelled", "transferred", "archived"]).gte("created_at", since30),
      ]);
      const f = (finance.data ?? {}) as any;
      const attRows = (attendance.data ?? []) as any[];
      const todayRow = attRows.find((r) => r.date === today);
      const attRateToday = todayRow && todayRow.total > 0 ? Math.round((todayRow.present / todayRow.total) * 100) : null;
      return {
        students: students.count ?? 0, staff: staff.count ?? 0,
        totalInvoiced: Number(f.total_invoiced ?? 0), totalPaid: Number(f.total_paid ?? 0),
        collection: Number(f.collection_pct ?? 0), defaulters: Number(f.defaulters ?? 0),
        attendance: attRows, genders: students.data ?? [],
        newAdmissions: newAdm.count ?? 0, leaversRecent: leavers.count ?? 0,
        attRateToday,
      };
    },
  });

  // Students per class — replaces the old gender-only pie with something a
  // principal can actually act on (which classes are over/under capacity).
  const { data: classDist = [] } = useQuery({
    queryKey: ["analytics-class-dist"],
    queryFn: async () => {
      const { data } = await supabase.from("students").select("class_id, classes(name, capacity)").eq("lifecycle_status", "active");
      const map = new Map<string, { name: string; count: number; capacity: number }>();
      (data ?? []).forEach((r: any) => {
        const name = r.classes?.name ?? "Unassigned";
        const cur = map.get(name) ?? { name, count: 0, capacity: r.classes?.capacity ?? 0 };
        cur.count++;
        map.set(name, cur);
      });
      return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 12);
    },
  });

  // Admissions trend — last 6 months, shows real growth/shrinkage instead of
  // a single point-in-time count.
  const { data: admissionTrend = [] } = useQuery({
    queryKey: ["analytics-admission-trend"],
    queryFn: async () => {
      const since = new Date(); since.setMonth(since.getMonth() - 5); since.setDate(1);
      const { data } = await supabase.from("students").select("admission_date").gte("admission_date", since.toISOString().slice(0, 10));
      const buckets = new Map<string, number>();
      for (let i = 0; i < 6; i++) {
        const d = new Date(since); d.setMonth(d.getMonth() + i);
        buckets.set(d.toLocaleString("en", { month: "short" }), 0);
      }
      (data ?? []).forEach((r: any) => {
        if (!r.admission_date) return;
        const key = new Date(r.admission_date).toLocaleString("en", { month: "short" });
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
      });
      return Array.from(buckets.entries()).map(([month, count]) => ({ month, count }));
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

  const attTrend = ((kpis?.attendance ?? []) as any[]).map((r) => ({
    date: r.date,
    present: Number(r.present ?? 0),
    absent: Number(r.absent ?? 0),
    rate: (Number(r.present ?? 0) + Number(r.absent ?? 0)) > 0
      ? Math.round((Number(r.present ?? 0) / (Number(r.present ?? 0) + Number(r.absent ?? 0))) * 100)
      : 0,
  }));

  const feeSplit = [
    { name: "Collected", value: kpis?.totalPaid ?? 0 },
    { name: "Outstanding", value: Math.max((kpis?.totalInvoiced ?? 0) - (kpis?.totalPaid ?? 0), 0) },
  ];
  const FEE_COLORS = ["#10b981", "#ef4444"];

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <AnimatedKpi icon={<GraduationCap className="w-4 h-4" />} label="Active students" value={kpis?.students ?? 0} delay={0} />
        <AnimatedKpi icon={<Users className="w-4 h-4" />} label="Staff" value={kpis?.staff ?? 0} delay={0.05} />
        <AnimatedKpi
          icon={<Activity className="w-4 h-4" />} label="Attendance today"
          value={kpis?.attRateToday ?? 0} format={(n) => `${Math.round(n)}%`}
          tone={kpis?.attRateToday !== null && (kpis?.attRateToday ?? 0) < 80 ? "warn" : "good"}
          delay={0.1}
        />
        <AnimatedKpi
          icon={<Wallet className="w-4 h-4" />} label="Fee collection"
          value={kpis?.collection ?? 0} format={(n) => `${n.toFixed(0)}%`}
          sub={`KES ${(kpis?.totalPaid ?? 0).toLocaleString()} / ${(kpis?.totalInvoiced ?? 0).toLocaleString()}`}
          tone={(kpis?.collection ?? 0) < 60 ? "bad" : (kpis?.collection ?? 0) < 85 ? "warn" : "good"}
          delay={0.15}
        />
        <AnimatedKpi icon={<UserPlus className="w-4 h-4" />} label="New admissions" value={kpis?.newAdmissions ?? 0} sub="Last 30 days" tone="good" delay={0.2} />
        <AnimatedKpi icon={<AlertTriangle className="w-4 h-4" />} label="Defaulters" value={kpis?.defaulters ?? 0} tone={(kpis?.defaulters ?? 0) > 0 ? "bad" : "default"} delay={0.25} />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Attendance rate (30 days)" icon={<CalendarCheck className="w-4 h-4" />} delay={0}>
          <ResponsiveContainer>
            <AreaChart data={attTrend}>
              <defs>
                <linearGradient id="attFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
              <Tooltip formatter={(v: any, n: any) => (n === "rate" ? [`${v}%`, "Attendance"] : [v, n])} />
              <Area type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2} fill="url(#attFill)" isAnimationActive animationDuration={900} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Fee collection" icon={<DollarSign className="w-4 h-4" />} delay={0.1}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={feeSplit} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} isAnimationActive animationDuration={800}>
                {feeSplit.map((_, i) => <Cell key={i} fill={FEE_COLORS[i]} />)}
              </Pie>
              <Tooltip formatter={(v: any) => `KES ${Number(v).toLocaleString()}`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Students per class" icon={<Users className="w-4 h-4" />} delay={0.15}>
          <ResponsiveContainer>
            <BarChart data={classDist} layout="vertical" margin={{ left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={64} />
              <Tooltip formatter={(v: any, _n, p: any) => [`${v} students`, p.payload.capacity ? `Capacity ${p.payload.capacity}` : ""]} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive animationDuration={800}>
                {classDist.map((c, i) => (
                  <Cell key={i} fill={c.capacity && c.count > c.capacity ? "#ef4444" : COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Admissions trend (6 months)" icon={<TrendingUp className="w-4 h-4" />} delay={0.2}>
          <ResponsiveContainer>
            <LineChart data={admissionTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="count" name="New admissions" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} isAnimationActive animationDuration={900} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* At-risk students */}
      <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-10% 0px" }} transition={{ duration: 0.45 }}>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4 text-destructive" /> At-risk students</CardTitle></CardHeader>
          <CardContent>
            {atRisk.length === 0 ? <p className="text-sm text-muted-foreground">No at-risk students right now.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Adm No</TableHead><TableHead>Class</TableHead><TableHead>Attendance</TableHead><TableHead>Mean</TableHead><TableHead>Risk</TableHead></TableRow></TableHeader>
                <TableBody>
                  {atRisk.map((s: any, i: number) => (
                    <motion.tr
                      key={s.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.6) }}
                      className="border-b transition-colors hover:bg-muted/50"
                    >
                      <TableCell>{s.name}</TableCell><TableCell>{s.admno}</TableCell><TableCell>{s.className}</TableCell>
                      <TableCell className={s.attendance !== null && s.attendance < 75 ? "text-destructive" : ""}>{s.attendance !== null ? `${s.attendance}%` : "—"}</TableCell>
                      <TableCell className={s.mean !== null && s.mean < 40 ? "text-destructive" : ""}>{s.mean !== null ? s.mean : "—"}</TableCell>
                      <TableCell><Badge variant={s.risk === "Both" ? "destructive" : "secondary"}>{s.risk}</Badge></TableCell>
                    </motion.tr>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </motion.div>
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

  // Grade distribution — uses whatever grade letters are already assigned on
  // exam_results (school's own grading scale), so it stays correct even
  // though the band cutoffs live in a separate school-configured table.
  const { data: gradeDist = [] } = useQuery({
    queryKey: ["analytics-grade-dist"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("exam_results").select("grade").not("grade", "is", null);
      const map = new Map<string, number>();
      (data ?? []).forEach((r: any) => { const g = r.grade || "—"; map.set(g, (map.get(g) ?? 0) + 1); });
      return Array.from(map.entries()).map(([grade, count]) => ({ grade, count })).sort((a, b) => b.count - a.count);
    },
  });

  // Overall KPIs, computed once here instead of duplicated per-chart.
  const { data: academicKpis } = useQuery({
    queryKey: ["analytics-academic-kpis"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("exam_results").select("score");
      const scores = (data ?? []).map((r: any) => Number(r.score ?? 0));
      const mean = scores.length ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
      const passRate = scores.length ? (scores.filter((s: number) => s >= 50).length / scores.length) * 100 : 0;
      return { mean, passRate, totalSat: scores.length };
    },
  });

  // Only surface CURRENTLY ENROLLED students as "at risk" — a student who
  // scored poorly and then graduated/left isn't something a teacher can act
  // on today, and showing them here would be misleading (same class of bug
  // as the students-still-counted-after-graduating issue on Overview).
  const { data: weakStudents = [] } = useQuery({
    queryKey: ["analytics-weak"],
    queryFn: async () => {
      const [weak, active] = await Promise.all([
        (supabase as any).from("v_weak_students").select("student_id,admission_no,first_name,last_name,mean_score").order("mean_score", { ascending: true }).limit(30),
        supabase.from("students").select("id").eq("lifecycle_status", "active"),
      ]);
      const activeIds = new Set((active.data ?? []).map((s: any) => s.id));
      return (weak.data ?? [])
        .filter((r: any) => activeIds.has(r.student_id))
        .slice(0, 10)
        .map((r: any) => ({ id: r.student_id, name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(), admno: r.admission_no ?? "", mean: Number(r.mean_score) }));
    },
  });

  const GRADE_COLORS: Record<string, string> = { A: "#10b981", "A-": "#22c55e", "B+": "#84cc16", B: "#a3e635", "B-": "#eab308", "C+": "#f59e0b", C: "#f97316", "C-": "#fb923c", "D+": "#ef4444", D: "#dc2626", "D-": "#b91c1c", E: "#7f1d1d" };
  const subjectTier = (mean: number) => (mean >= 70 ? "#10b981" : mean >= 50 ? "#f59e0b" : "#ef4444");

  return (
    <div className="space-y-6">
      <AcademicAnalyticsPanel />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AnimatedKpi icon={<BookOpen className="w-4 h-4" />} label="Overall mean score" value={academicKpis?.mean ?? 0} format={(n) => n.toFixed(1)} delay={0} />
        <AnimatedKpi
          icon={<Trophy className="w-4 h-4" />} label="Pass rate (≥50)"
          value={academicKpis?.passRate ?? 0} format={(n) => `${n.toFixed(0)}%`}
          tone={(academicKpis?.passRate ?? 0) < 50 ? "bad" : (academicKpis?.passRate ?? 0) < 75 ? "warn" : "good"}
          delay={0.05}
        />
        <AnimatedKpi icon={<GraduationCap className="w-4 h-4" />} label="Top subject" value={subjectAvg[0] ? subjectAvg[0].mean : 0} format={(n) => subjectAvg[0] ? `${subjectAvg[0].code} · ${n.toFixed(0)}` : "—"} delay={0.1} />
        <AnimatedKpi icon={<AlertTriangle className="w-4 h-4" />} label="At-risk (enrolled)" value={weakStudents.length} tone={weakStudents.length > 0 ? "warn" : "default"} delay={0.15} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Subject performance (avg score)" icon={<BookOpen className="w-4 h-4" />} delay={0} className="lg:col-span-1">
          <ResponsiveContainer>
            <BarChart data={subjectAvg.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="code" tick={{ fontSize: 10 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 10 }} /><Tooltip />
              <Bar dataKey="mean" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={800}>
                {subjectAvg.slice(0, 10).map((s, i) => <Cell key={i} fill={subjectTier(s.mean)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Class performance comparison" icon={<Users className="w-4 h-4" />} delay={0.05}>
          <ResponsiveContainer>
            <BarChart data={classPerf}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="className" tick={{ fontSize: 10 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 10 }} /><Tooltip />
              <Bar dataKey="mean" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={800}>
                {classPerf.map((c, i) => <Cell key={i} fill={subjectTier(c.mean)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Grade distribution" icon={<Trophy className="w-4 h-4" />} delay={0.1} className="w-full">
        <ResponsiveContainer>
          <BarChart data={gradeDist}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="grade" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: any) => [`${v} results`, "Count"]} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={800}>
              {gradeDist.map((g, i) => <Cell key={i} fill={GRADE_COLORS[g.grade] ?? COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-10% 0px" }} transition={{ duration: 0.45 }}>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> AI insights — students at risk (academic)</CardTitle></CardHeader>
          <CardContent>
            {weakStudents.length === 0 ? <p className="text-sm text-muted-foreground">No currently-enrolled students below the risk threshold — great work!</p> : (
              <ul className="text-sm space-y-1.5">
                {weakStudents.map((s: any, i: number) => (
                  <motion.li
                    key={s.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.5) }}
                    className="flex items-center justify-between border-b pb-1.5"
                  >
                    <div><div className="font-medium">{s.name}</div><div className="text-xs text-muted-foreground">{s.admno}</div></div>
                    <Badge variant="destructive">{s.mean.toFixed(1)} avg</Badge>
                  </motion.li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </motion.div>
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

// ─── HR tab ───────────────────────────────────────────────────────────────────
function HrTab() {
  const { data: staff = [] } = useQuery({
    queryKey: ["analytics-hr-staff"],
    queryFn: async () => (await (supabase as any).from("staff").select("id, role, status, department_id, hire_date, departments(name)")).data ?? [],
  });

  const byStatus = (() => {
    const m = new Map<string, number>();
    staff.forEach((s: any) => { const st = s.status ?? "active"; m.set(st, (m.get(st) ?? 0) + 1); });
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  })();
  const byDepartment = (() => {
    const m = new Map<string, number>();
    staff.forEach((s: any) => { const d = s.departments?.name ?? "Unassigned"; m.set(d, (m.get(d) ?? 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value }));
  })();
  const onLeave = staff.filter((s: any) => s.status === "on_leave").length;
  const since90 = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const newHires90 = staff.filter((s: any) => (s.hire_date ?? "") >= since90).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<Briefcase className="w-4 h-4" />} label="Total staff" value={staff.length} />
        <Kpi icon={<Users className="w-4 h-4" />} label="Active" value={staff.filter((s: any) => (s.status ?? "active") === "active").length} />
        <Kpi icon={<AlertTriangle className="w-4 h-4 text-amber-500" />} label="On leave" value={onLeave} />
        <Kpi icon={<Sparkles className="w-4 h-4" />} label="New hires (90 days)" value={newHires90} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Headcount by department</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer>
              <BarChart data={byDepartment} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11 }} /><Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Employment status</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byStatus} dataKey="value" nameKey="name" outerRadius={80} label>
                  {byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
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

// ─── Communication tab ────────────────────────────────────────────────────────
function CommunicationTab() {
  const { data: logs = [] } = useQuery({
    queryKey: ["analytics-notifications-log"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      const { data } = await (supabase as any)
        .from("notifications_log")
        .select("id, channel, status, recipient_count, created_at")
        .gte("created_at", since);
      return data ?? [];
    },
  });

  const totalRecipients = logs.reduce((s: number, l: any) => s + Number(l.recipient_count ?? 0), 0);
  const failed = logs.filter((l: any) => l.status === "failed" || l.status === "error").length;
  const byChannel = (() => {
    const m = new Map<string, number>();
    logs.forEach((l: any) => { const c = l.channel ?? "unknown"; m.set(c, (m.get(c) ?? 0) + 1); });
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  })();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<MessageSquare className="w-4 h-4" />} label="Messages sent (30 days)" value={logs.length} />
        <Kpi icon={<Users className="w-4 h-4" />} label="Total recipients" value={totalRecipients} />
        <Kpi icon={<AlertTriangle className="w-4 h-4 text-destructive" />} label="Failed" value={failed} />
        <Kpi icon={<Activity className="w-4 h-4" />} label="Channels used" value={byChannel.length} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Volume by channel (30 days)</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={byChannel} dataKey="value" nameKey="name" outerRadius={80} label>
                {byChannel.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Attendance tab ───────────────────────────────────────────────────────────
// Deeper than the Overview tab's single 30-day trend line: per-class breakdown
// and day-of-week pattern, school-wide.
function AttendanceTab() {
  const { data: records = [] } = useQuery({
    queryKey: ["analytics-attendance-detailed"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const { data } = await (supabase as any)
        .from("attendance_records")
        .select("id, date, status, class_id, classes(name)")
        .gte("date", since);
      return data ?? [];
    },
  });

  const total = records.length;
  const present = records.filter((r: any) => r.status === "present").length;
  const absent = records.filter((r: any) => r.status === "absent").length;
  const late = records.filter((r: any) => r.status === "late").length;
  const overallPct = total ? Math.round((present / total) * 100) : 0;

  const byClass = (() => {
    const m = new Map<string, { present: number; total: number; name: string }>();
    records.forEach((r: any) => {
      const key = r.class_id ?? "unknown";
      const cur = m.get(key) ?? { present: 0, total: 0, name: r.classes?.name ?? "—" };
      cur.total++; if (r.status === "present") cur.present++;
      m.set(key, cur);
    });
    return [...m.values()]
      .map((c) => ({ name: c.name, pct: c.total ? Math.round((c.present / c.total) * 100) : 0 }))
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 12);
  })();

  const byDayOfWeek = (() => {
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const m = new Map<number, { present: number; total: number }>();
    records.forEach((r: any) => {
      if (!r.date) return;
      const dow = new Date(r.date).getDay();
      const cur = m.get(dow) ?? { present: 0, total: 0 };
      cur.total++; if (r.status === "present") cur.present++;
      m.set(dow, cur);
    });
    return [1, 2, 3, 4, 5].map((d) => {
      const v = m.get(d);
      return { name: DAYS[d], pct: v && v.total ? Math.round((v.present / v.total) * 100) : 0 };
    });
  })();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<CalendarCheck className="w-4 h-4" />} label="Overall (30 days)" value={`${overallPct}%`} />
        <Kpi icon={<Activity className="w-4 h-4" />} label="Present" value={present} />
        <Kpi icon={<AlertTriangle className="w-4 h-4 text-destructive" />} label="Absent" value={absent} />
        <Kpi icon={<AlertTriangle className="w-4 h-4 text-amber-500" />} label="Late" value={late} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Lowest attendance by class (30 days)</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer>
              <BarChart data={byClass} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" /><XAxis type="number" domain={[0, 100]} /><YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 11 }} /><Tooltip />
                <Bar dataKey="pct" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">By day of week (30 days)</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer>
              <BarChart data={byDayOfWeek}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis domain={[0, 100]} /><Tooltip />
                <Bar dataKey="pct" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
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
