import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { redeemParentCode, autoLinkParent } from "@/lib/parent-link.functions";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { MpesaPayDialog } from "@/components/MpesaPayDialog";
import { AttendanceHeatmap } from "@/components/AttendanceHeatmap";
import {
  LayoutDashboard, Bus, Heart, Bed, DoorOpen, ClipboardList, Award, Trophy,
  CheckCircle, CreditCard, Calendar, Video, Scale, Megaphone, GraduationCap,
  FileText, ExternalLink, Library, Utensils, Clock, User, AlertTriangle,
  TrendingUp, TrendingDown, Activity, BookOpen, Star, Flame, Brain,
  BarChart2, PieChart as PieIcon, Zap, Loader2,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ComposedChart, Line, LineChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  GlassCard, AnimatedNumber, fadeUp, stagger,
  PortalTabBar, PortalTabContent, type PortalTabConfig,
} from "@/components/portal-shared";

const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const C = {
  primary: "#6366f1", green: "#22c55e", yellow: "#f59e0b",
  red: "#ef4444", cyan: "#06b6d4", muted: "#1e293b",
};
const PIE_COLORS = [C.primary, C.green, C.yellow, C.red, C.cyan, "#8b5cf6", "#f97316"];

export const Route = createFileRoute("/_app/portal/parent")({
  component: ParentPortal,
});

// Guards an individual Supabase call so a single slow/hanging query can't
// sink the entire portal — see the identical helper (and full explanation)
// in _app.portal.me.tsx. Without this, a stuck query here has no way to
// ever resolve, and the page just spins forever with no error, no retry,
// and no indication anything is wrong.
function withTimeout<T>(promise: PromiseLike<T>, ms: number, fallback: T, label?: string): Promise<T> {
  let settled = false;
  return Promise.race([
    Promise.resolve(promise)
      .then((v) => { settled = true; return v; })
      .catch(() => { settled = true; return fallback; }),
    new Promise<T>((resolve) => setTimeout(() => {
      if (!settled) console.warn(`[portal/parent] "${label ?? "query"}" exceeded ${ms}ms — using fallback data`);
      resolve(fallback);
    }, ms)),
  ]);
}

function gradeLabel(score: number): { grade: string; color: string } {
  if (score >= 80) return { grade: "A", color: "#22c55e" };
  if (score >= 70) return { grade: "B+", color: "#84cc16" };
  if (score >= 60) return { grade: "B", color: "#eab308" };
  if (score >= 50) return { grade: "C+", color: "#f97316" };
  if (score >= 40) return { grade: "C", color: "#ef4444" };
  return { grade: "D", color: "#dc2626" };
}

const PARENT_TABS: PortalTabConfig[] = [
  { value: "dashboard",    icon: <LayoutDashboard className="w-3.5 h-3.5" />, label: "Dashboard" },
  { value: "results",      icon: <Trophy className="w-3.5 h-3.5" />,          label: "Results" },
  { value: "reportcards",  icon: <ClipboardList className="w-3.5 h-3.5" />,   label: "Report Cards" },
  { value: "attendance",   icon: <CheckCircle className="w-3.5 h-3.5" />,     label: "Attendance" },
  { value: "fees",         icon: <CreditCard className="w-3.5 h-3.5" />,      label: "Fees" },
  { value: "timetable",    icon: <Calendar className="w-3.5 h-3.5" />,        label: "Timetable" },
  { value: "meals",        icon: <Utensils className="w-3.5 h-3.5" />,        label: "Meals" },
  { value: "library",      icon: <Library className="w-3.5 h-3.5" />,         label: "Library" },
  { value: "transport",    icon: <Bus className="w-3.5 h-3.5" />,             label: "Transport" },
  { value: "clinic",       icon: <Heart className="w-3.5 h-3.5" />,           label: "Clinic" },
  { value: "boarding",     icon: <Bed className="w-3.5 h-3.5" />,             label: "Boarding" },
  { value: "gate",         icon: <DoorOpen className="w-3.5 h-3.5" />,        label: "Gate Passes" },
  { value: "cocurricular", icon: <Award className="w-3.5 h-3.5" />,           label: "Co-curricular" },
  { value: "live",         icon: <Video className="w-3.5 h-3.5" />,           label: "Live Classes" },
  { value: "discipline",   icon: <Scale className="w-3.5 h-3.5" />,           label: "Discipline" },
  { value: "documents",    icon: <FileText className="w-3.5 h-3.5" />,        label: "Documents" },
  { value: "news",         icon: <Megaphone className="w-3.5 h-3.5" />,       label: "School News" },
];

// ── Shared mini components ────────────────────────────────────────────────────
function RingGauge({ pct, label, color }: { pct: number; label: string; color: string }) {
  const data = [{ v: pct }, { v: 100 - pct }];
  return (
    <div className="relative w-24 h-24 mx-auto">
      <PieChart width={96} height={96}>
        <Pie data={data} cx={44} cy={44} innerRadius={32} outerRadius={46}
          startAngle={90} endAngle={-270} dataKey="v" strokeWidth={0}>
          <Cell fill={color} />
          <Cell fill={C.muted} />
        </Pie>
      </PieChart>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold leading-none">{pct}%</span>
        <span className="text-[9px] text-muted-foreground text-center leading-tight mt-0.5">{label}</span>
      </div>
    </div>
  );
}

function InsightChip({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border bg-card">
      <div className="shrink-0 p-2 rounded-lg bg-muted" style={{ color }}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="font-semibold text-sm truncate" style={{ color }}>{value}</div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, suffix = "", rawValue, hint }: {
  icon: React.ReactNode; label: string; value?: number; suffix?: string; rawValue?: string; hint?: string;
}) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">{icon} {label}</div>
      <div className="text-2xl font-bold">
        {value !== undefined ? <AnimatedNumber value={value} suffix={suffix} /> : rawValue}
      </div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </GlassCard>
  );
}

// ── Main portal ───────────────────────────────────────────────────────────────
function ParentPortal() {
  const { user, fullName } = useAuth();
  const { tab: tabFromUrl } = Route.useSearch() as { tab?: string };
  const [children, setChildren] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [data, setData] = useState<any>({
    attendance: [], results: [], invoices: [], liveUpcoming: [], liveAttendance: [],
    discipline: [], transport: null, clinic: [], dorm: null, gatePasses: [],
    coCurricular: [], timetable: [], loans: [], documents: [], weekMeals: [],
  });
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [childLoading, setChildLoading] = useState(true);
  // Sidebar links land here as e.g. /portal/parent?tab=attendance — honor it.
  const [activeTab, setActiveTab] = useState(tabFromUrl || "dashboard");

  // Independent, mount-tied failsafes for each loading phase below — not
  // driven by the queries themselves, so they fire no matter *why* a query
  // never settles (hang, dropped connection, etc). Mirrors the identical
  // pattern in _app.portal.me.tsx, added after that page's freeze bug;
  // this page never got the same protection until now.
  const [stalled, setStalled] = useState(false);
  const [childStalled, setChildStalled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStalled(true), 15000);
    return () => clearTimeout(t);
  }, []);

  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data: links, error: linksErr } = await withTimeout(
          supabase
            .from("parent_student_links")
            .select("student_id, relationship, students(id, first_name, last_name, admission_no, unique_id, classes(name, id))")
            .eq("parent_user_id", user.id),
          8000,
          { data: null, error: new Error("Loading your linked children timed out") } as any,
          "parent_student_links",
        );
        if (linksErr) throw linksErr;
        const kids = (links ?? []).map((l: any) => l.students).filter(Boolean);
        setChildren(kids);
        if (kids[0]) setActiveId(kids[0].id);
        const { data: an } = await withTimeout(
          supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(10),
          8000,
          { data: [] as any[], error: null } as any,
          "announcements",
        );
        setAnnouncements(an ?? []);
      } catch (e: any) {
        console.error("Parent portal failed to load:", e);
        toast.error(e?.message ?? "Couldn't load your portal. Please refresh.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  useEffect(() => {
    if (!activeId) return;
    setChildLoading(true);
    setChildStalled(false);
    // Independent 15s failsafe for this child's data batch, tied to this
    // effect run (not to the queries) so it fires regardless of *why* the
    // batch below never resolves. See withTimeout() above for the
    // per-query 8s guard — this is the outer, belt-and-suspenders timer.
    const stallTimer = setTimeout(() => setChildStalled(true), 15000);
    (async () => {
      try {
        const stu = children.find(c => c.id === activeId);
      const classId = stu?.classes?.id ?? null;
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const until = new Date(Date.now() + 14 * 864e5).toISOString();
      const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");

      const EMPTY = { data: [] as any[], error: null } as any;
      const EMPTY_SINGLE = { data: null, error: null } as any;

      const [a, r, i, lu, la, dr, tr, cv, da, gp, cc, tt, loans, docs, meals] = await Promise.all([
        withTimeout(supabase.from("attendance_records").select("*").eq("student_id", activeId).order("date", { ascending: false }).limit(90), 8000, EMPTY, "attendance"),
        withTimeout(supabase.from("exam_results").select("*, subjects(name), exams(name, term, year)").eq("student_id", activeId).order("created_at", { ascending: false }).limit(100), 8000, EMPTY, "results"),
        withTimeout(supabase.from("invoices").select("*").eq("student_id", activeId).order("created_at", { ascending: false }), 8000, EMPTY, "invoices"),
        classId
          ? withTimeout((supabase as any).from("live_sessions").select("id, title, scheduled_start, status").eq("class_id", classId).gte("scheduled_start", since).lte("scheduled_start", until).order("scheduled_start"), 8000, EMPTY, "liveUpcoming")
          : Promise.resolve(EMPTY),
        withTimeout((supabase as any).from("live_session_attendance").select("id, status, duration_seconds, live_sessions(title, scheduled_start)").eq("student_id", activeId).order("created_at", { ascending: false }).limit(30), 8000, EMPTY, "liveAttendance"),
        withTimeout(supabase.from("discipline_records").select("*").eq("student_id", activeId).order("incident_date", { ascending: false }).limit(20), 8000, EMPTY, "discipline"),
        withTimeout((supabase as any).from("transport_assignments").select("*, pickup_point, transport_routes(name, vehicle_reg, driver_name, driver_phone, monthly_fee, dropoff_point)").eq("student_id", activeId).order("assigned_on", { ascending: false }).limit(1).maybeSingle(), 8000, EMPTY_SINGLE, "transport"),
        withTimeout(supabase.from("clinic_visits").select("*").eq("student_id", activeId).order("visit_date", { ascending: false }).limit(20), 8000, EMPTY, "clinic"),
        withTimeout(supabase.from("dorm_assignments").select("*, dormitories(name, gender)").eq("student_id", activeId).order("assigned_on", { ascending: false }).limit(1).maybeSingle(), 8000, EMPTY_SINGLE, "dorm"),
        withTimeout(supabase.from("gate_passes").select("*").eq("student_id", activeId).order("exit_time", { ascending: false }).limit(20), 8000, EMPTY, "gatePasses"),
        withTimeout((supabase as any).from("student_co_curricular").select("*, co_curricular_activities(id, name, category, schedule_day, schedule_time)").eq("student_id", activeId), 8000, EMPTY, "coCurricular"),
        classId
          ? withTimeout(supabase.from("timetable_slots").select("*, subjects(name, code), staff(first_name, last_name)").eq("class_id", classId).order("day_of_week").order("start_time"), 8000, EMPTY, "timetable")
          : Promise.resolve(EMPTY),
        withTimeout(supabase.from("book_loans").select("*, books(title, author)").eq("student_id", activeId).order("borrowed_on", { ascending: false }).limit(20), 8000, EMPTY, "loans"),
        withTimeout((supabase as any).from("student_documents").select("*").eq("student_id", activeId).order("created_at", { ascending: false }), 8000, EMPTY, "documents"),
        withTimeout(supabase.from("meal_plans").select("*").gte("meal_date", weekStart).lte("meal_date", weekEnd).order("meal_date").order("meal_type"), 8000, EMPTY, "weekMeals"),
      ]);

      setData({
        attendance: a.data ?? [],
        results: r.data ?? [],
        invoices: i.data ?? [],
        liveUpcoming: lu.data ?? [],
        liveAttendance: la.data ?? [],
        discipline: dr.data ?? [],
        transport: (tr as any).data ?? null,
        clinic: cv.data ?? [],
        dorm: (da as any).data ?? null,
        gatePasses: gp.data ?? [],
        coCurricular: (cc as any).data ?? [],
        timetable: (tt as any).data ?? [],
        loans: loans.data ?? [],
        documents: docs.data ?? [],
        weekMeals: meals.data ?? [],
      });
      } catch (e: any) {
        console.error("Parent portal child data failed to load:", e);
        toast.error(e?.message ?? "Some data for this child couldn't load. Please refresh.");
      } finally {
        clearTimeout(stallTimer);
        setChildLoading(false);
      }
    })();
    return () => clearTimeout(stallTimer);
  }, [activeId, children]);

  const active = children.find(c => c.id === activeId);
  const totalDue = data.invoices.reduce((s: number, i: any) => s + Number(i.amount) - Number(i.paid), 0);
  const totalFees = data.invoices.reduce((s: number, i: any) => s + Number(i.amount), 0);
  const totalPaid = totalFees - totalDue;
  const present = data.attendance.filter((a: any) => a.status === "present").length;
  const absent = data.attendance.filter((a: any) => a.status === "absent").length;
  const late = data.attendance.filter((a: any) => a.status === "late").length;
  const attRate = data.attendance.length ? Math.round((present / data.attendance.length) * 100) : 0;

  const avgScore = useMemo(() =>
    data.results.length ? Math.round(data.results.reduce((a: number, r: any) => a + Number(r.score || 0), 0) / data.results.length) : null,
    [data.results]
  );

  // Exam trend for chart
  const examTrend = useMemo(() => {
    const map = new Map<string, { name: string; scores: number[]; term: string; year: number }>();
    for (const r of data.results) {
      const key = r.exam_id;
      if (!key) continue;
      if (!map.has(key)) map.set(key, { name: r.exams?.name ?? "Exam", scores: [], term: r.exams?.term ?? "", year: r.exams?.year ?? 0 });
      map.get(key)!.scores.push(Number(r.score || 0));
    }
    return Array.from(map.values())
      .sort((a, b) => a.year - b.year || a.term.localeCompare(b.term))
      .map(e => ({ name: e.name.slice(0, 14), avg: Math.round(e.scores.reduce((s, v) => s + v, 0) / e.scores.length) }));
  }, [data.results]);

  // Subject breakdown for radar
  const subjectRadar = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const r of data.results) {
      const sub = r.subjects?.name ?? "Unknown";
      if (!map.has(sub)) map.set(sub, []);
      map.get(sub)!.push(Number(r.score || 0));
    }
    return Array.from(map.entries()).slice(0, 7).map(([subject, scores]) => ({
      subject: subject.slice(0, 10),
      score: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
    }));
  }, [data.results]);

  // Monthly attendance trend
  const attTrend = useMemo(() => {
    const map = new Map<string, { present: number; absent: number; late: number }>();
    for (const a of data.attendance) {
      const m = (a.date ?? "").slice(0, 7);
      if (!m) continue;
      if (!map.has(m)) map.set(m, { present: 0, absent: 0, late: 0 });
      const b = map.get(m)!;
      if (a.status === "present") b.present++;
      else if (a.status === "absent") b.absent++;
      else b.late++;
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => {
      const total = v.present + v.absent + v.late;
      return { month: month.slice(5), rate: total ? Math.round((v.present / total) * 100) : 0, ...v };
    });
  }, [data.attendance]);

  // Fee timeline
  const feeTimeline = useMemo(() => {
    return data.invoices.map((inv: any) => ({
      invoice: inv.invoice_no,
      billed: Number(inv.amount),
      paid: Number(inv.paid),
      outstanding: Number(inv.amount) - Number(inv.paid),
    }));
  }, [data.invoices]);

  const reportCardExams = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of (data.results ?? [])) {
      if (r.exams && r.exam_id) map.set(r.exam_id, r.exams);
    }
    return Array.from(map.entries()).map(([id, exam]) => ({ id, ...exam }));
  }, [data.results]);

  const todayMeals = useMemo(() => (data.weekMeals ?? []).filter((m: any) => m.meal_date === todayStr), [data.weekMeals, todayStr]);

  const feeCompliance = totalFees > 0 ? Math.round((totalPaid / totalFees) * 100) : 100;
  const disciplineCount = (data.discipline ?? []).length;
  const majorDiscipline = (data.discipline ?? []).filter((d: any) => d.severity === "major").length;

  if (loading && !stalled) {
    return <div className="p-6 text-muted-foreground flex items-center gap-2"><div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" /> Loading…</div>;
  }
  if (loading && stalled) {
    console.error("[portal/parent] initial load stalled past 15s for user", user?.id);
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="max-w-md text-center space-y-3">
          <h2 className="text-lg font-semibold">This is taking longer than expected</h2>
          <p className="text-sm text-muted-foreground">
            Something is stuck loading your portal. Check the browser console for which
            request stalled, or try again below.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (children.length === 0) return <LinkChildPanel onLinked={() => window.location.reload()} />;

  const docLabels: Record<string, string> = {
    birth_certificate: "Birth Certificate", report_form: "Previous Report Form",
    passport_photo: "Passport Photo", medical_records: "Medical Records",
    transfer_letter: "Transfer Letter", national_id: "National ID",
    parent_id: "Parent/Guardian ID", other: "Other",
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div initial="hidden" animate="show" variants={fadeUp}
        className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Hello, {fullName || "Parent"}</h1>
          <p className="text-sm text-muted-foreground">
            {active?.first_name} {active?.last_name} · {active?.classes?.name ?? "—"} · {active?.admission_no}
          </p>
        </div>
        {children.length > 1 && (
          <Select value={activeId} onValueChange={setActiveId}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              {children.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name} ({c.admission_no})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </motion.div>

      {/* Per-child data status — the header/nav above render as soon as
          `children` resolves, but attendance/results/fees/etc. for the
          selected child load separately (see the activeId effect above)
          and used to fail completely silently: empty arrays, zero
          indication anything was wrong or even still loading. Surface it. */}
      {childLoading && !childStalled && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading {active?.first_name}'s details…
        </div>
      )}
      {childLoading && childStalled && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-amber-400 bg-amber-50 dark:bg-amber-950/20 text-sm">
          <span>
            Some of {active?.first_name}'s details are taking longer than expected to load.
          </span>
          <button
            onClick={() => window.location.reload()}
            className="shrink-0 inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            Try again
          </button>
        </div>
      )}

      {/* Outstanding alert */}
      {totalDue > 0 && (
        <motion.div initial="hidden" animate="show" variants={fadeUp}
          className="flex items-center gap-3 p-4 rounded-xl border border-amber-400 bg-amber-50 dark:bg-amber-950/20">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="text-sm">
            <span className="font-semibold">Outstanding: KES {totalDue.toLocaleString()}</span>
            <span className="text-muted-foreground ml-2">across {data.invoices.filter((i: any) => i.status !== "paid").length} unpaid invoice(s)</span>
          </div>
        </motion.div>
      )}

      <PortalTabBar tabs={PARENT_TABS} activeTab={activeTab} onTabChange={setActiveTab}>

        {/* ══ DASHBOARD ══════════════════════════════════════════════════════ */}
        <PortalTabContent value="dashboard">
          <div className="space-y-6">
            {/* KPI cards */}
            <motion.div initial="hidden" animate="show" variants={stagger}
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { icon: <GraduationCap className="w-4 h-4" />, label: "Class", rawValue: active?.classes?.name ?? "—" },
                { icon: <Trophy className="w-4 h-4" />, label: "Academic Avg", value: avgScore ?? 0, suffix: "%", hint: avgScore ? `Grade ${gradeLabel(avgScore).grade}` : "No results" },
                { icon: <CheckCircle className="w-4 h-4" />, label: "Attendance", value: attRate, suffix: "%", hint: `${present}/${data.attendance.length} days` },
                { icon: <CreditCard className="w-4 h-4" />, label: "Fee Compliance", value: feeCompliance, suffix: "%", hint: totalDue > 0 ? `KES ${totalDue.toLocaleString()} due` : "Fully paid" },
                { icon: <Scale className="w-4 h-4" />, label: "Discipline", rawValue: disciplineCount === 0 ? "Clean" : `${disciplineCount} record(s)`, hint: majorDiscipline > 0 ? `${majorDiscipline} major` : undefined },
                { icon: data.dorm ? <Bed className="w-4 h-4" /> : <Bus className="w-4 h-4" />, label: data.dorm ? "Dormitory" : "Transport", rawValue: data.dorm?.dormitories?.name ?? data.transport?.transport_routes?.name ?? "—" },
              ].map((c, i) => (
                <motion.div key={i} variants={fadeUp}>
                  <StatCard {...c} />
                </motion.div>
              ))}
            </motion.div>

            {/* Charts row */}
            <motion.div initial="hidden" animate="show" variants={stagger}
              className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Academic trend */}
              <motion.div variants={fadeUp}>
                <GlassCard>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" /> Academic Performance Trend
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {examTrend.length < 2 ? (
                      <div className="h-48 grid place-items-center text-sm text-muted-foreground">Not enough exam data yet</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={200}>
                        <ComposedChart data={examTrend}>
                          <defs>
                            <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={C.primary} stopOpacity={0.3} />
                              <stop offset="95%" stopColor={C.primary} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke={C.muted} />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v: any) => `${v}%`} />
                          <ReferenceLine y={50} stroke={C.red} strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: "Pass", fontSize: 9, fill: C.red }} />
                          <Area type="monotone" dataKey="avg" stroke={C.primary} fill="url(#perfGrad)"
                            strokeWidth={2.5} name="Average" dot={{ r: 4, fill: C.primary, strokeWidth: 0 }} animationDuration={1200} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </GlassCard>
              </motion.div>

              {/* Attendance trend */}
              <motion.div variants={fadeUp}>
                <GlassCard>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Activity className="w-4 h-4 text-green-500" /> Attendance Trend
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {attTrend.length === 0 ? (
                      <div className="h-48 grid place-items-center text-sm text-muted-foreground">No attendance data</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={attTrend} margin={{ left: 4, right: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={C.muted} />
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                          <Tooltip formatter={(v: any) => `${v}%`} />
                          <ReferenceLine y={75} stroke={C.yellow} strokeDasharray="4 2" label={{ value: "75%", fontSize: 9 }} />
                          <Bar dataKey="rate" name="Attendance %" radius={[4, 4, 0, 0]} animationDuration={1200}>
                            {attTrend.map((e, i) => <Cell key={i} fill={e.rate >= 90 ? C.green : e.rate >= 75 ? C.yellow : C.red} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </GlassCard>
              </motion.div>
            </motion.div>

            {/* Gauges row */}
            <motion.div initial="hidden" animate="show" variants={stagger}
              className="grid grid-cols-1 md:grid-cols-3 gap-4">

              <motion.div variants={fadeUp}>
                <GlassCard className="p-4 text-center space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Academic Score</div>
                  <RingGauge pct={avgScore ?? 0} label="average" color={avgScore ? gradeLabel(avgScore).color : C.muted} />
                  {avgScore !== null && (
                    <Badge style={{ background: gradeLabel(avgScore).color + "20", color: gradeLabel(avgScore).color }}>
                      Grade {gradeLabel(avgScore).grade}
                    </Badge>
                  )}
                </GlassCard>
              </motion.div>

              <motion.div variants={fadeUp}>
                <GlassCard className="p-4 text-center space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Attendance Rate</div>
                  <RingGauge pct={attRate} label="present" color={attRate >= 90 ? C.green : attRate >= 75 ? C.yellow : C.red} />
                  <div className="grid grid-cols-3 gap-1 text-xs">
                    <div><div className="font-bold text-green-500">{present}</div><div className="text-muted-foreground">Present</div></div>
                    <div><div className="font-bold text-yellow-500">{late}</div><div className="text-muted-foreground">Late</div></div>
                    <div><div className="font-bold text-red-500">{absent}</div><div className="text-muted-foreground">Absent</div></div>
                  </div>
                </GlassCard>
              </motion.div>

              <motion.div variants={fadeUp}>
                <GlassCard className="p-4 text-center space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Fee Compliance</div>
                  <RingGauge pct={feeCompliance} label="paid" color={feeCompliance >= 100 ? C.green : feeCompliance >= 50 ? C.yellow : C.red} />
                  <div className="text-xs space-y-0.5">
                    <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="font-mono text-green-500">KES {totalPaid.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Due</span><span className="font-mono text-red-500">KES {totalDue.toLocaleString()}</span></div>
                  </div>
                </GlassCard>
              </motion.div>
            </motion.div>

            {/* Subject radar + insights */}
            <motion.div initial="hidden" animate="show" variants={stagger}
              className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              <motion.div variants={fadeUp}>
                <GlassCard>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <BarChart2 className="w-4 h-4 text-primary" /> Subject Performance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {subjectRadar.length < 3 ? (
                      <div className="h-48 grid place-items-center text-sm text-muted-foreground">Not enough subject data</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <RadarChart data={subjectRadar}>
                          <PolarGrid stroke={C.muted} />
                          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                          <Radar dataKey="score" stroke={C.primary} fill={C.primary} fillOpacity={0.25} name="Score" />
                          <Tooltip formatter={(v: any) => `${v}%`} />
                        </RadarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </GlassCard>
              </motion.div>

              <motion.div variants={fadeUp} className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-1">Quick Insights</div>
                {avgScore !== null && (
                  <InsightChip icon={<Trophy className="w-4 h-4" />} label="Overall Grade"
                    value={`${avgScore}% — ${gradeLabel(avgScore).grade}`} color={gradeLabel(avgScore).color} />
                )}
                <InsightChip icon={<CheckCircle className="w-4 h-4" />} label="Attendance Status"
                  value={attRate >= 90 ? "Excellent attendance" : attRate >= 75 ? "Acceptable — can improve" : "⚠ Below 75% — at risk"}
                  color={attRate >= 90 ? C.green : attRate >= 75 ? C.yellow : C.red} />
                <InsightChip icon={<CreditCard className="w-4 h-4" />} label="Fee Status"
                  value={totalDue === 0 ? "All fees cleared ✓" : `KES ${totalDue.toLocaleString()} outstanding`}
                  color={totalDue === 0 ? C.green : C.red} />
                {disciplineCount > 0 && (
                  <InsightChip icon={<Scale className="w-4 h-4" />} label="Discipline"
                    value={`${disciplineCount} record(s)${majorDiscipline > 0 ? ` · ${majorDiscipline} major` : ""}`}
                    color={majorDiscipline > 0 ? C.red : C.yellow} />
                )}
                {data.loans.filter((l: any) => l.status === "active").length > 0 && (
                  <InsightChip icon={<Library className="w-4 h-4" />} label="Library"
                    value={`${data.loans.filter((l: any) => l.status === "active").length} book(s) borrowed`}
                    color={C.cyan} />
                )}
                {todayMeals.length > 0 && (
                  <InsightChip icon={<Utensils className="w-4 h-4" />} label="Today's Meals"
                    value={todayMeals.map((m: any) => m.meal_type).join(" · ")} color={C.yellow} />
                )}
              </motion.div>
            </motion.div>

            {/* Announcements preview */}
            {announcements.length > 0 && (
              <motion.div variants={fadeUp}>
                <GlassCard>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Megaphone className="w-4 h-4 text-primary" /> Latest from School
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {announcements.slice(0, 3).map(a => (
                      <div key={a.id} className="border-b pb-2 last:border-0">
                        <div className="flex items-center gap-2 text-sm font-medium">{a.title} {a.pinned && <Badge variant="secondary" className="text-[10px]">Pinned</Badge>}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.body}</div>
                      </div>
                    ))}
                    {announcements.length > 3 && (
                      <button onClick={() => setActiveTab("news")} className="text-xs text-primary hover:underline">
                        View all {announcements.length} announcements →
                      </button>
                    )}
                  </CardContent>
                </GlassCard>
              </motion.div>
            )}
          </div>
        </PortalTabContent>

        {/* ══ RESULTS ══════════════════════════════════════════════════════ */}
        <PortalTabContent value="results">
          <div className="space-y-4">
            {/* Per-subject bar chart */}
            {subjectRadar.length > 0 && (
              <GlassCard>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Subject Averages</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={subjectRadar} margin={{ left: 4, right: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.muted} />
                      <XAxis dataKey="subject" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: any) => `${v}%`} />
                      <ReferenceLine y={50} stroke={C.red} strokeDasharray="3 3" strokeOpacity={0.5} />
                      <Bar dataKey="score" name="Average %" radius={[4, 4, 0, 0]} animationDuration={1000}>
                        {subjectRadar.map((s, i) => <Cell key={i} fill={s.score >= 60 ? C.green : s.score >= 40 ? C.yellow : C.red} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </GlassCard>
            )}

            <GlassCard className="p-6 space-y-2">
              {data.results.length === 0 && <p className="text-sm text-muted-foreground">No results yet.</p>}
              {reportCardExams.map((exam: any) => {
                const examResults = data.results.filter((r: any) => r.exam_id === exam.id);
                const examAvg = examResults.length
                  ? Math.round(examResults.reduce((a: number, r: any) => a + Number(r.score || 0), 0) / examResults.length)
                  : null;
                return (
                  <div key={exam.id} className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-semibold">{exam.name}</div>
                        <div className="text-xs text-muted-foreground">{exam.term} {exam.year}</div>
                      </div>
                      {examAvg !== null && (
                        <div className="text-right">
                          <div className="text-xl font-bold" style={{ color: gradeLabel(examAvg).color }}>{examAvg}%</div>
                          <Badge style={{ backgroundColor: gradeLabel(examAvg).color + "20", color: gradeLabel(examAvg).color }}>{gradeLabel(examAvg).grade}</Badge>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5 pl-2 border-l-2 border-muted">
                      {examResults.map((r: any) => (
                        <div key={r.id} className="flex justify-between border-b py-1.5 text-sm">
                          <span className="font-medium">{r.subjects?.name}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-20">
                              <Progress value={Number(r.score)} className="h-1.5" />
                            </div>
                            <span className="font-bold w-10 text-right" style={{ color: gradeLabel(Number(r.score || 0)).color }}>{r.score}%</span>
                            {r.grade && <Badge variant="secondary" className="text-xs">{r.grade}</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </GlassCard>
          </div>
        </PortalTabContent>

        {/* ══ REPORT CARDS ════════════════════════════════════════════════ */}
        <PortalTabContent value="reportcards">
          <GlassCard className="p-6 space-y-2">
            {reportCardExams.length === 0 && <p className="text-sm text-muted-foreground">No report cards available yet.</p>}
            {reportCardExams.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between border-b py-2">
                <div>
                  <div className="font-medium">{e.name}</div>
                  <div className="text-xs text-muted-foreground">{e.term} {e.year}</div>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to="/academics/report-card/$studentId/$examId" params={{ studentId: activeId, examId: e.id }}>
                    <ClipboardList className="w-4 h-4 mr-1" /> Open Report Card
                  </Link>
                </Button>
              </div>
            ))}
          </GlassCard>
        </PortalTabContent>

        {/* ══ ATTENDANCE ══════════════════════════════════════════════════ */}
        <PortalTabContent value="attendance">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <GlassCard className="text-center p-4">
                <div className="text-2xl font-bold text-emerald-600"><AnimatedNumber value={present} /></div>
                <div className="text-xs text-muted-foreground">Present</div>
              </GlassCard>
              <GlassCard className="text-center p-4">
                <div className="text-2xl font-bold text-red-500"><AnimatedNumber value={absent} /></div>
                <div className="text-xs text-muted-foreground">Absent</div>
              </GlassCard>
              <GlassCard className="text-center p-4">
                <div className="text-2xl font-bold text-amber-500"><AnimatedNumber value={late} /></div>
                <div className="text-xs text-muted-foreground">Late</div>
              </GlassCard>
            </div>

            {/* Monthly rate chart */}
            {attTrend.length > 0 && (
              <GlassCard>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly Attendance Rate</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <ComposedChart data={attTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.muted} />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                      <Tooltip formatter={(v: any) => `${v}%`} />
                      <ReferenceLine y={75} stroke={C.red} strokeDasharray="4 2" label={{ value: "Min 75%", fontSize: 9, fill: C.red }} />
                      <Bar dataKey="rate" name="Rate %" radius={[4, 4, 0, 0]}>
                        {attTrend.map((e, i) => <Cell key={i} fill={e.rate >= 90 ? C.green : e.rate >= 75 ? C.yellow : C.red} />)}
                      </Bar>
                      <Line type="monotone" dataKey="rate" stroke={C.primary} strokeWidth={1.5} dot={false} name="Trend" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </GlassCard>
            )}

            <GlassCard className="p-6">
              {data.attendance.length === 0 ? (
                <p className="text-sm text-muted-foreground">No records.</p>
              ) : (
                <>
                  <AttendanceHeatmap records={data.attendance} />
                  <div className="space-y-1 mt-4 max-h-64 overflow-y-auto">
                    {data.attendance.map((a: any) => (
                      <div key={a.id} className="flex justify-between py-1 border-b text-sm">
                        <span>{a.date}</span>
                        <Badge variant={a.status === "present" ? "default" : a.status === "absent" ? "destructive" : "secondary"}>{a.status}</Badge>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </GlassCard>
          </div>
        </PortalTabContent>

        {/* ══ FEES ════════════════════════════════════════════════════════ */}
        <PortalTabContent value="fees">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <GlassCard className="text-center p-4">
                <div className="text-lg font-bold text-indigo-600">KES <AnimatedNumber value={totalFees / 1000} decimals={1} suffix="k" /></div>
                <div className="text-xs text-muted-foreground">Total Billed</div>
              </GlassCard>
              <GlassCard className="text-center p-4">
                <div className="text-lg font-bold text-emerald-600">KES <AnimatedNumber value={totalPaid / 1000} decimals={1} suffix="k" /></div>
                <div className="text-xs text-muted-foreground">Amount Paid</div>
              </GlassCard>
              <GlassCard className="text-center p-4">
                <div className="text-lg font-bold" style={{ color: totalDue > 0 ? "#ef4444" : "#22c55e" }}>
                  {totalDue > 0 ? <>KES <AnimatedNumber value={totalDue / 1000} decimals={1} suffix="k" /></> : "Clear"}
                </div>
                <div className="text-xs text-muted-foreground">Outstanding</div>
              </GlassCard>
            </div>

            {/* Fee breakdown bar */}
            {feeTimeline.length > 0 && (
              <GlassCard>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Invoice Breakdown</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={feeTimeline} margin={{ left: 4, right: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.muted} />
                      <XAxis dataKey="invoice" tick={{ fontSize: 9 }} />
                      <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: any) => `KES ${Number(v).toLocaleString()}`} />
                      <Legend />
                      <Bar dataKey="paid" fill={C.green} stackId="a" name="Paid" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="outstanding" fill={C.red} stackId="a" name="Outstanding" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </GlassCard>
            )}

            <GlassCard className="p-6 space-y-3">
              {data.invoices.length === 0 && <p className="text-sm text-muted-foreground">No invoices.</p>}
              {data.invoices.map((i: any) => {
                const outstanding = Number(i.amount) - Number(i.paid);
                const paidPct = Number(i.amount) > 0 ? Math.round((Number(i.paid) / Number(i.amount)) * 100) : 0;
                return (
                  <div key={i.id} className="border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{i.description || i.invoice_no}</div>
                        <div className="text-xs text-muted-foreground">{i.invoice_no} · Due: {i.due_date ?? "—"}</div>
                      </div>
                      <Badge variant={i.status === "paid" ? "default" : i.status === "partial" ? "secondary" : "destructive"}>{i.status}</Badge>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>KES {Number(i.paid).toLocaleString()} paid</span>
                        <span className="font-semibold">{paidPct}%</span>
                        <span>KES {Number(i.amount).toLocaleString()} total</span>
                      </div>
                      <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${paidPct}%` }} />
                      </div>
                    </div>
                    {outstanding > 0 && (
                      <div className="flex justify-end">
                        <MpesaPayDialog invoiceId={i.id} outstanding={outstanding} defaultPhone={active?.parent_phone ?? ""} />
                      </div>
                    )}
                  </div>
                );
              })}
            </GlassCard>
          </div>
        </PortalTabContent>

        {/* ══ TIMETABLE ═══════════════════════════════════════════════════ */}
        <PortalTabContent value="timetable">
          <GlassCard className="p-6">
            {(data.timetable ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No timetable published for this class yet.</p>
            ) : (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((dow) => {
                  const slots = (data.timetable ?? []).filter((s: any) => s.day_of_week === dow);
                  if (slots.length === 0) return null;
                  return (
                    <div key={dow}>
                      <div className="text-sm font-semibold mb-1 text-primary">{DAYS[dow]}</div>
                      <div className="space-y-1">
                        {slots.map((s: any) => (
                          <div key={s.id} className="flex justify-between border-b py-1.5 text-sm">
                            <span className="font-mono text-xs text-muted-foreground w-24">{s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</span>
                            <span className="flex-1 font-medium">{s.subjects?.name}</span>
                            <span className="text-xs text-muted-foreground">{s.staff ? `${s.staff.first_name} ${s.staff.last_name}` : ""}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </GlassCard>
        </PortalTabContent>

        {/* ══ MEALS ═══════════════════════════════════════════════════════ */}
        <PortalTabContent value="meals">
          <GlassCard className="p-6">
            {(data.weekMeals ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No meal plans posted for this week.</p>
            ) : (
              <div className="space-y-4">
                {Array.from(new Set((data.weekMeals ?? []).map((m: any) => m.meal_date))).map((date: any) => (
                  <div key={date}>
                    <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                      {date}
                      {date === todayStr && <Badge variant="secondary">Today</Badge>}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(data.weekMeals ?? []).filter((m: any) => m.meal_date === date).map((m: any) => (
                        <div key={m.id} className="border rounded-lg p-3 text-sm">
                          <div className="text-xs text-muted-foreground capitalize font-medium">{m.meal_type}</div>
                          <div className="mt-1">{m.menu}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </PortalTabContent>

        {/* ══ LIBRARY ═════════════════════════════════════════════════════ */}
        <PortalTabContent value="library">
          <GlassCard className="p-6 space-y-2">
            {(data.loans ?? []).length === 0 && <p className="text-sm text-muted-foreground">No book loans on record.</p>}
            {(data.loans ?? []).map((l: any) => (
              <div key={l.id} className="flex items-center justify-between border rounded-lg p-3 text-sm">
                <div>
                  <div className="font-medium">{l.books?.title}</div>
                  <div className="text-xs text-muted-foreground">{l.books?.author} · borrowed {l.borrowed_on}</div>
                </div>
                <Badge variant={l.status === "active" ? "default" : "secondary"}>{l.status}</Badge>
              </div>
            ))}
          </GlassCard>
        </PortalTabContent>

        {/* ══ TRANSPORT ═══════════════════════════════════════════════════ */}
        <PortalTabContent value="transport">
          <GlassCard className="p-6">
            {!data.transport ? (
              <p className="text-sm text-muted-foreground inline-flex items-center gap-2"><Bus className="w-4 h-4" /> No transport route assigned.</p>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-base font-medium"><Bus className="w-5 h-5 text-primary" /> {data.transport.transport_routes?.name ?? "Route"}</div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Pickup point", value: data.transport.pickup_point ?? data.transport.transport_routes?.pickup_point ?? "—" },
                    { label: "Drop-off", value: data.transport.transport_routes?.dropoff_point ?? "—" },
                    { label: "Driver", value: data.transport.transport_routes?.driver_name ?? "—", sub: data.transport.transport_routes?.driver_phone },
                    { label: "Monthly fee", value: `KES ${Number(data.transport.transport_routes?.monthly_fee ?? 0).toLocaleString()}` },
                  ].map((f) => (
                    <div key={f.label} className="border rounded-lg p-3">
                      <div className="text-xs text-muted-foreground">{f.label}</div>
                      <div className="font-medium">{f.value}</div>
                      {f.sub && <div className="text-xs text-muted-foreground">{f.sub}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </GlassCard>
        </PortalTabContent>

        {/* ══ CLINIC ══════════════════════════════════════════════════════ */}
        <PortalTabContent value="clinic">
          <GlassCard className="p-6 space-y-2">
            {(data.clinic ?? []).length === 0 && <p className="text-sm text-muted-foreground">No clinic visits.</p>}
            {(data.clinic ?? []).map((c: any) => (
              <div key={c.id} className="border-b py-2">
                <div className="flex justify-between">
                  <div className="font-medium inline-flex items-center gap-1"><Heart className="w-3 h-3 text-red-400" /> {c.visit_date}</div>
                  {c.referred_to && <Badge variant="outline">Referred: {c.referred_to}</Badge>}
                </div>
                <div className="text-sm mt-1"><span className="text-muted-foreground">Symptoms:</span> {c.symptoms}</div>
                {c.diagnosis && <div className="text-sm"><span className="text-muted-foreground">Diagnosis:</span> {c.diagnosis}</div>}
                {c.treatment && <div className="text-sm"><span className="text-muted-foreground">Treatment:</span> {c.treatment}</div>}
              </div>
            ))}
          </GlassCard>
        </PortalTabContent>

        {/* ══ BOARDING ════════════════════════════════════════════════════ */}
        <PortalTabContent value="boarding">
          <GlassCard className="p-6">
            {!data.dorm ? (
              <p className="text-sm text-muted-foreground inline-flex items-center gap-2"><Bed className="w-4 h-4" /> Not assigned to a dormitory.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-base font-medium"><Bed className="w-5 h-5 text-primary" /> {data.dorm.dormitories?.name ?? "Dorm"}</div>
                <div><span className="text-muted-foreground">Bed number:</span> {data.dorm.bed_no ?? "—"}</div>
                <div><span className="text-muted-foreground">Gender:</span> {data.dorm.dormitories?.gender ?? "—"}</div>
                <div><span className="text-muted-foreground">Assigned on:</span> {data.dorm.assigned_on ?? "—"}</div>
              </div>
            )}
          </GlassCard>
        </PortalTabContent>

        {/* ══ GATE PASSES ═════════════════════════════════════════════════ */}
        <PortalTabContent value="gate">
          <GlassCard className="p-6 space-y-2">
            {(data.gatePasses ?? []).length === 0 && <p className="text-sm text-muted-foreground">No gate passes on record.</p>}
            {(data.gatePasses ?? []).map((g: any) => (
              <div key={g.id} className="border-b py-2">
                <div className="flex justify-between">
                  <div className="font-medium inline-flex items-center gap-1"><DoorOpen className="w-3 h-3" /> {g.reason}</div>
                  <Badge variant={g.status === "out" ? "destructive" : "default"}>{g.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Out: {g.exit_time ? new Date(g.exit_time).toLocaleString() : "—"}
                  {g.actual_return && ` · Back: ${new Date(g.actual_return).toLocaleString()}`}
                </div>
              </div>
            ))}
          </GlassCard>
        </PortalTabContent>

        {/* ══ CO-CURRICULAR ════════════════════════════════════════════════ */}
        <PortalTabContent value="cocurricular">
          <GlassCard className="p-6 space-y-2">
            {(data.coCurricular ?? []).length === 0 && <p className="text-sm text-muted-foreground">Not enrolled in any co-curricular activities.</p>}
            {(data.coCurricular ?? []).map((c: any) => {
              const a = c.co_curricular_activities;
              return (
                <div key={c.id} className="border-b py-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium inline-flex items-center gap-1"><Award className="w-3 h-3" /> {a?.name ?? "—"}</div>
                    {a?.category && <Badge variant="outline">{a.category}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {a?.schedule_day != null ? `${DAYS[a.schedule_day]} ` : ""}{a?.schedule_time ?? ""}
                  </div>
                </div>
              );
            })}
          </GlassCard>
        </PortalTabContent>

        {/* ══ LIVE CLASSES ════════════════════════════════════════════════ */}
        <PortalTabContent value="live">
          <div className="space-y-4">
            <GlassCard className="p-0">
              <CardHeader><CardTitle className="text-base">Upcoming live classes</CardTitle><CardDescription>Online sessions for {active?.first_name}'s class.</CardDescription></CardHeader>
              <CardContent className="space-y-2">
                {(data.liveUpcoming ?? []).length === 0 && <p className="text-sm text-muted-foreground">No live classes scheduled.</p>}
                {(data.liveUpcoming ?? []).map((s: any) => (
                  <div key={s.id} className="flex justify-between items-center border-b py-2 text-sm">
                    <div>
                      <div className="font-medium">{s.title}</div>
                      <div className="text-xs text-muted-foreground">{new Date(s.scheduled_start).toLocaleString()}</div>
                    </div>
                    <Badge variant={s.status === "live" ? "default" : s.status === "ended" ? "secondary" : "outline"}>{s.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </GlassCard>
            <GlassCard className="p-0">
              <CardHeader><CardTitle className="text-base">Live class attendance</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {(data.liveAttendance ?? []).length === 0 && <p className="text-sm text-muted-foreground">No live attendance records.</p>}
                {(data.liveAttendance ?? []).map((a: any) => (
                  <div key={a.id} className="flex justify-between items-center border-b py-2 text-sm">
                    <div>
                      <div className="font-medium">{a.live_sessions?.title ?? "Session"}</div>
                      <div className="text-xs text-muted-foreground">
                        {a.live_sessions?.scheduled_start ? new Date(a.live_sessions.scheduled_start).toLocaleString() : ""}
                        {a.duration_seconds ? ` · ${Math.round(a.duration_seconds / 60)} min` : ""}
                      </div>
                    </div>
                    <Badge variant={a.status === "present" ? "default" : a.status === "late" ? "secondary" : "destructive"}>{a.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </GlassCard>
          </div>
        </PortalTabContent>

        {/* ══ DISCIPLINE ══════════════════════════════════════════════════ */}
        <PortalTabContent value="discipline">
          <GlassCard className="p-6 space-y-2">
            {(data.discipline ?? []).length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <CheckCircle className="w-10 h-10 mx-auto text-emerald-500 opacity-60" />
                <p className="text-sm text-muted-foreground">No discipline records — great conduct!</p>
              </div>
            ) : (
              (data.discipline ?? []).map((d: any) => (
                <div key={d.id} className="border-b py-2">
                  <div className="flex justify-between">
                    <div className="font-medium">{d.category}</div>
                    <Badge variant={d.severity === "major" ? "destructive" : "secondary"}>{d.severity}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{d.incident_date}</div>
                  <div className="text-sm mt-1">{d.description}</div>
                  {d.action_taken && <div className="text-xs text-muted-foreground mt-1">Action: {d.action_taken}</div>}
                </div>
              ))
            )}
          </GlassCard>
        </PortalTabContent>

        {/* ══ DOCUMENTS ═══════════════════════════════════════════════════ */}
        <PortalTabContent value="documents">
          <GlassCard className="p-6">
            {(data.documents ?? []).length === 0 ? (
              <div className="text-center text-muted-foreground py-12 space-y-2">
                <FileText className="w-10 h-10 mx-auto opacity-30" />
                <p>No documents uploaded yet</p>
                <p className="text-xs">Contact the school office to upload documents</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(data.documents ?? []).map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between border rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">{docLabels[d.document_type] ?? d.document_type}</div>
                        <div className="text-xs text-muted-foreground">{d.created_at ? format(new Date(d.created_at), "dd/MM/yyyy") : ""}</div>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={async () => {
                      const { data: urlData } = await supabase.storage.from("student-documents").createSignedUrl(d.file_path, 60);
                      if (urlData?.signedUrl) window.open(urlData.signedUrl, "_blank");
                    }}>
                      <ExternalLink className="w-4 h-4 mr-1" /> Open
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </PortalTabContent>

        {/* ══ NEWS ════════════════════════════════════════════════════════ */}
        <PortalTabContent value="news">
          <GlassCard className="p-6 space-y-3">
            {announcements.length === 0 && <p className="text-sm text-muted-foreground">No announcements.</p>}
            {announcements.map(a => (
              <div key={a.id} className="border-b pb-3">
                <div className="flex items-center gap-2">
                  <div className="font-medium">{a.title}</div>
                  {a.pinned && <Badge variant="secondary">Pinned</Badge>}
                </div>
                <div className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{a.body}</div>
              </div>
            ))}
          </GlassCard>
        </PortalTabContent>

      </PortalTabBar>
    </div>
  );
}

// ── Link child panel ──────────────────────────────────────────────────────────
function LinkChildPanel({ onLinked }: { onLinked: () => void }) {
  const redeem = useServerFn(redeemParentCode);
  const auto = useServerFn(autoLinkParent);
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  async function tryAuto() {
    setBusy(true);
    try {
      const r = await auto({ data: { email, phone } });
      if (r.linked > 0) { toast.success(`Linked to ${r.linked} child(ren)`); onLinked(); }
      else toast.message("No automatic match found. Submitted request to school admin for review.");
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function tryCode() {
    if (!code.trim()) return;
    setBusy(true);
    try {
      await redeem({ data: { code: code.trim() } });
      toast.success("Linked successfully");
      onLinked();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Link your child</h1>
        <p className="text-sm text-muted-foreground mt-1">Connect your account to your child's school record.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Option 1 — Auto-match by contact</CardTitle><CardDescription>We'll check if your email or phone matches a registered parent contact.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Your email" value={email} onChange={e => setEmail(e.target.value)} />
          <Input placeholder="Your phone (as on school record)" value={phone} onChange={e => setPhone(e.target.value)} />
          <Button onClick={tryAuto} disabled={busy}>Find my child</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Option 2 — Parent code (PRN-…)</CardTitle><CardDescription>Enter the code printed on the admission slip.</CardDescription></CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="PRN-2026-XXXXX" value={code} onChange={e => setCode(e.target.value.toUpperCase())} className="font-mono" />
          <Button onClick={tryCode} disabled={busy}>Link</Button>
        </CardContent>
      </Card>
    </div>
  );
}
