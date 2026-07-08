import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, getSessionSafe } from "@/integrations/supabase/client";
import { useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useTeacherScope } from "@/hooks/use-teacher-scope";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, LineChart, Line, AreaChart, Area, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, ScatterChart, Scatter, ZAxis,
  ReferenceLine, ComposedChart,
} from "recharts";
import {
  Plus, Loader2, Star, Pencil, CheckCircle2, UserSearch, TrendingUp, TrendingDown,
  AlertTriangle, BarChart3, BookOpen, Users, Award, Target, Brain, Zap,
  Download, Filter, RefreshCw, ChevronDown, ChevronUp, GraduationCap,
  FlaskConical, TrendingUpIcon, Activity,
} from "lucide-react";
import { StudentRouteGuard } from "@/components/security/StudentRouteGuard";
import { AnimatedNumber, GlassCard } from "@/components/portal-shared";
import { stagger, fadeUp } from "@/components/motion-variants";

export const Route = createFileRoute("/_app/academics/results")({
  beforeLoad: async () => {
    const { data, timedOut } = await getSessionSafe();
    if (timedOut) return; // defer to AppLayout's own client-side session check
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: ResultsGuard,
});

// ── Grade helpers ─────────────────────────────────────────────────────────────

async function resolveGrade(score: number, subjectId: string): Promise<string> {
  try {
    const { data: schoolId } = await supabase.rpc("current_user_school");
    if (!schoolId) return fallbackGrade(score);
    const { data } = await supabase.rpc("grade_for", {
      p_school_id: schoolId as string,
      p_score: score,
      p_subject_id: subjectId,
    });
    return (data as any)?.[0]?.grade ?? fallbackGrade(score);
  } catch {
    return fallbackGrade(score);
  }
}

function fallbackGrade(s: number) {
  if (s >= 80) return "A";  if (s >= 75) return "A-"; if (s >= 70) return "B+";
  if (s >= 65) return "B";  if (s >= 60) return "B-"; if (s >= 55) return "C+";
  if (s >= 50) return "C";  if (s >= 45) return "C-"; if (s >= 40) return "D+";
  if (s >= 35) return "D";  if (s >= 30) return "D-"; return "E";
}

function gradeColor(g: string) {
  if (["A", "A-"].includes(g)) return "text-emerald-600";
  if (["B+", "B", "B-"].includes(g)) return "text-blue-600";
  if (["C+", "C", "C-"].includes(g)) return "text-amber-600";
  return "text-red-600";
}

function gradePoints(g: string) {
  const map: Record<string, number> = {
    "A": 12, "A-": 11, "B+": 10, "B": 9, "B-": 8,
    "C+": 7, "C": 6, "C-": 5, "D+": 4, "D": 3, "D-": 2, "E": 1,
  };
  return map[g] ?? 0;
}

function meanGrade(avgPoints: number): string {
  if (avgPoints >= 11.5) return "A";
  if (avgPoints >= 10.5) return "A-";
  if (avgPoints >= 9.5)  return "B+";
  if (avgPoints >= 8.5)  return "B";
  if (avgPoints >= 7.5)  return "B-";
  if (avgPoints >= 6.5)  return "C+";
  if (avgPoints >= 5.5)  return "C";
  if (avgPoints >= 4.5)  return "C-";
  if (avgPoints >= 3.5)  return "D+";
  if (avgPoints >= 2.5)  return "D";
  if (avgPoints >= 1.5)  return "D-";
  return "E";
}

function classLabel(c?: { name?: string | null; stream?: string | null } | null) {
  if (!c) return "—";
  return `${c.name ?? ""}${c.stream ? " " + c.stream : ""}`.trim() || "—";
}

const GRADE_COLORS: Record<string, string> = {
  "A": "#16a34a", "A-": "#22c55e",
  "B+": "#2563eb", "B": "#3b82f6", "B-": "#60a5fa",
  "C+": "#d97706", "C": "#f59e0b", "C-": "#fbbf24",
  "D+": "#dc2626", "D": "#ef4444", "D-": "#f87171",
  "E": "#7c3aed",
};

const CHART_COLORS = ["#6366f1", "#22c55e", "#f97316", "#06b6d4", "#ec4899", "#eab308", "#8b5cf6", "#14b8a6"];

// ── Motion helpers ────────────────────────────────────────────────────────────

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3 } },
};

const slideIn = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { duration: 0.25 } },
};

// ── Custom Tooltip ────────────────────────────────────────────────────────────

function SmartTooltip({ active, payload, label, schoolAvg }: any) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  const prev = payload[1]?.value;
  const diff = prev !== undefined ? val - prev : null;
  return (
    <div className="bg-popover border rounded-xl shadow-xl p-3 text-xs min-w-[140px]">
      <p className="font-semibold text-sm mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex justify-between gap-3">
          <span className="text-muted-foreground">{p.name}</span>
          <span className="font-bold" style={{ color: p.color }}>{p.value}{typeof p.value === "number" && p.value <= 100 ? "%" : ""}</span>
        </div>
      ))}
      {diff !== null && (
        <div className={`mt-1 flex items-center gap-1 font-medium ${diff >= 0 ? "text-emerald-600" : "text-red-500"}`}>
          {diff >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {diff >= 0 ? "+" : ""}{diff.toFixed(1)} vs prior
        </div>
      )}
      {schoolAvg !== undefined && (
        <div className="text-muted-foreground mt-1">School avg: <span className="font-semibold">{schoolAvg}%</span></div>
      )}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, sub, color = "indigo", trend, delay = 0,
}: {
  icon: React.ReactNode; label: string; value: number | string; sub?: string;
  color?: string; trend?: number; delay?: number;
}) {
  const colors: Record<string, string> = {
    indigo:  "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400",
    emerald: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400",
    amber:   "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400",
    red:     "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400",
    violet:  "bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400",
    blue:    "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400",
    cyan:    "bg-cyan-50 dark:bg-cyan-950/30 text-cyan-600 dark:text-cyan-400",
    rose:    "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400",
  };
  const cls = colors[color] ?? colors.indigo;
  return (
    <motion.div variants={cardVariants} initial="hidden" animate="show"
      transition={{ delay }} whileHover={{ y: -2, scale: 1.02 }} className="group">
      <Card className="overflow-hidden border-0 shadow-sm ring-1 ring-border/50 hover:shadow-md transition-shadow">
        <CardContent className="p-4 flex items-start gap-3">
          <div className={`p-2.5 rounded-xl shrink-0 ${cls} group-hover:scale-110 transition-transform`}>{icon}</div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-2xl font-bold mt-0.5 leading-none tabular-nums">
              {typeof value === "number" ? <AnimatedNumber value={value} /> : value}
            </p>
            {sub && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {sub}
                {trend !== undefined && trend !== 0 && (
                  <span className={`ml-1 font-medium ${trend > 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {trend > 0 ? "▲" : "▼"}{Math.abs(trend).toFixed(1)}
                  </span>
                )}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Animated chart wrapper ────────────────────────────────────────────────────

function ChartCard({ title, icon, children, className = "" }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show">
      <Card className={`border-0 shadow-sm ring-1 ring-border/50 ${className}`}>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <span className="text-primary">{icon}</span> {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 px-4 pb-4">{children}</CardContent>
      </Card>
    </motion.div>
  );
}

// ── Heatmap ───────────────────────────────────────────────────────────────────

function ScoreHeatmap({ data }: { data: { class: string; subject: string; avg: number }[] }) {
  const subjects = [...new Set(data.map((d) => d.subject))];
  const classes  = [...new Set(data.map((d) => d.class))];
  const lookup   = new Map(data.map((d) => [`${d.class}::${d.subject}`, d.avg]));

  function cellColor(v?: number) {
    if (v === undefined) return "bg-muted/30";
    if (v >= 70) return "bg-emerald-500";
    if (v >= 55) return "bg-blue-500";
    if (v >= 40) return "bg-amber-500";
    return "bg-red-500";
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-[10px] min-w-full border-collapse">
        <thead>
          <tr>
            <th className="p-1 text-left text-muted-foreground w-24">Class</th>
            {subjects.map((s) => (
              <th key={s} className="p-1 text-center text-muted-foreground font-normal max-w-[60px] truncate">{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {classes.map((c) => (
            <tr key={c}>
              <td className="p-1 font-medium text-xs truncate max-w-[96px]">{c}</td>
              {subjects.map((s) => {
                const v = lookup.get(`${c}::${s}`);
                return (
                  <td key={s} className="p-0.5 text-center">
                    <div title={v !== undefined ? `${v}%` : "No data"}
                      className={`rounded text-white font-bold text-[9px] py-1 px-0.5 ${cellColor(v)}`}>
                      {v !== undefined ? v : "—"}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" />≥70%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500 inline-block" />55–69%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500 inline-block" />40–54%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block" />Below 40%</span>
      </div>
    </div>
  );
}

// ── Guard ─────────────────────────────────────────────────────────────────────

function ResultsGuard() {
  const { roles, rolesLoaded } = useAuth();
  if (!rolesLoaded) return null;
  const pureStudent = roles.length === 1 && (roles as any[]).includes("student");
  if (pureStudent) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-6">
        <Card className="max-w-sm w-full">
          <CardContent className="py-10 text-center space-y-4">
            <BarChart3 className="w-10 h-10 mx-auto text-primary opacity-70" />
            <h2 className="font-semibold text-lg">Your Results Are in My Portal</h2>
            <p className="text-sm text-muted-foreground">
              Academic results, analytics, and report cards are available in your personal portal.
            </p>
            <Link to="/portal/student">
              <Button className="mt-2 w-full">Go to My Portal</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }
  return <Page />;
}

// ── Main page ─────────────────────────────────────────────────────────────────

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const { isTeacherScoped, classIds, allSubjectIds } = useTeacherScope();
  const can = isAdmin || hasRole("teacher") || hasRole("exams_admin") || hasRole("academic_master");

  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [filterExam, setFilterExam]         = useState<string>("all");
  const [filterSubject, setFilterSubject]   = useState<string>("all");
  const [filterClass, setFilterClass]       = useState<string>("all");
  const [filterGender, setFilterGender]     = useState<string>("all");
  const [search, setSearch]   = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [compareMode, setCompareMode] = useState<"subject" | "class" | "term">("subject");
  const [showFilters, setShowFilters] = useState(true);

  // ── Scoped student IDs ──────────────────────────────────────────────────
  const { data: scopedStudentIds = [] } = useQuery({
    queryKey: ["results-scope-students", classIds.join(",")],
    enabled: isTeacherScoped,
    queryFn: async () => {
      if (classIds.length === 0) return [];
      const { data } = await supabase.from("students").select("id").in("class_id", classIds);
      return (data ?? []).map((s: any) => s.id);
    },
  });

  // ── Results data ────────────────────────────────────────────────────────
  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["exam_results", isTeacherScoped, scopedStudentIds.length, allSubjectIds.join(",")],
    queryFn: async () => {
      let q = supabase
        .from("exam_results")
        .select(
          "id,score,grade,verified,remarks,exam_id,student_id,subject_id,created_at," +
          "exams(name,term,year),students(first_name,last_name,admission_no,gender,classes(id,name,stream))," +
          "subjects(code,name)"
        )
        .order("created_at", { ascending: false })
        .limit(1000);

      if (isTeacherScoped) {
        if (scopedStudentIds.length === 0) return [];
        q = q.in("student_id", scopedStudentIds).in("subject_id", allSubjectIds);
      }
      return (await q).data ?? [];
    },
  });

  const { data: exams = [] } = useQuery({
    queryKey: ["exams-list"],
    queryFn: async () => (await supabase.from("exams").select("id,name,term,year").order("start_date", { ascending: false })).data ?? [],
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects-list"],
    queryFn: async () => (await supabase.from("subjects").select("id,name,code")).data ?? [],
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["classes-list"],
    queryFn: async () => (await supabase.from("classes").select("id,name,stream")).data ?? [],
  });

  const { data: students = [] } = useQuery({
    queryKey: ["students-lite"],
    queryFn: async () => {
      let q = supabase.from("students").select("id,first_name,last_name,admission_no");
      if (isTeacherScoped && scopedStudentIds.length > 0)
        q = q.in("id", scopedStudentIds);
      return (await q.limit(300)).data ?? [];
    },
  });

  // ── Filtered results ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return (data as any[]).filter((r) => {
      if (filterExam    !== "all" && r.exam_id    !== filterExam)    return false;
      if (filterSubject !== "all" && r.subject_id !== filterSubject) return false;
      if (filterClass   !== "all" && r.students?.classes?.id !== filterClass) return false;
      if (filterGender  !== "all" && (r.students?.gender ?? "").toLowerCase() !== filterGender) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = `${r.students?.first_name ?? ""} ${r.students?.last_name ?? ""}`.toLowerCase();
        const adm  = (r.students?.admission_no ?? "").toLowerCase();
        if (!name.includes(q) && !adm.includes(q)) return false;
      }
      return true;
    });
  }, [data, filterExam, filterSubject, filterClass, filterGender, search]);

  // ── Analytics computations ──────────────────────────────────────────────

  const overallAvg = useMemo(() =>
    filtered.length ? Math.round(filtered.reduce((a, r) => a + Number((r as any).score), 0) / filtered.length) : null,
    [filtered]
  );

  const passRate = useMemo(() => {
    if (!filtered.length) return null;
    return Math.round((filtered.filter((r) => Number((r as any).score) >= 40).length / filtered.length) * 100);
  }, [filtered]);

  const distinctionRate = useMemo(() => {
    if (!filtered.length) return null;
    return Math.round((filtered.filter((r) => Number((r as any).score) >= 75).length / filtered.length) * 100);
  }, [filtered]);

  const failureRate = useMemo(() => {
    if (!filtered.length) return null;
    return Math.round((filtered.filter((r) => Number((r as any).score) < 40).length / filtered.length) * 100);
  }, [filtered]);

  const verifiedCount = useMemo(() =>
    filtered.filter((r) => (r as any).verified).length,
    [filtered]
  );

  const pendingCount = useMemo(() => filtered.length - verifiedCount, [filtered, verifiedCount]);

  const schoolMeanGrade = useMemo(() => {
    if (!filtered.length) return "—";
    const total = filtered.reduce((a, r) => {
      const g = (r as any).grade ?? fallbackGrade(Number((r as any).score));
      return a + gradePoints(g);
    }, 0);
    return meanGrade(total / filtered.length);
  }, [filtered]);

  const gradeDistribution = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (const r of filtered) {
      const g = (r as any).grade ?? fallbackGrade(Number((r as any).score));
      buckets[g] = (buckets[g] ?? 0) + 1;
    }
    return Object.entries(buckets)
      .map(([grade, count]) => ({ grade, count, pct: Math.round((count / filtered.length) * 100) }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  const subjectAnalytics = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number; pass: number; dist: number; high: number; low: number }>();
    for (const r of filtered) {
      const id   = (r as any).subject_id;
      const name = (r as any).subjects?.name ?? id;
      if (!map.has(id)) map.set(id, { name, total: 0, count: 0, pass: 0, dist: 0, high: 0, low: 100 });
      const e = map.get(id)!;
      const score = Number((r as any).score);
      e.total += score;
      e.count++;
      if (score >= 40) e.pass++;
      if (score >= 75) e.dist++;
      if (score > e.high) e.high = score;
      if (score < e.low) e.low = score;
    }
    return Array.from(map.values())
      .map((s) => ({
        name: s.name,
        avg: Math.round(s.total / s.count),
        passRate: Math.round((s.pass / s.count) * 100),
        distRate: Math.round((s.dist / s.count) * 100),
        count: s.count,
        high: s.high,
        low: s.low,
        grade: fallbackGrade(Math.round(s.total / s.count)),
      }))
      .sort((a, b) => b.avg - a.avg);
  }, [filtered]);

  const classAnalytics = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number; pass: number }>();
    for (const r of filtered) {
      const label = classLabel((r as any).students?.classes);
      if (!map.has(label)) map.set(label, { name: label, total: 0, count: 0, pass: 0 });
      const e = map.get(label)!;
      const score = Number((r as any).score);
      e.total += score;
      e.count++;
      if (score >= 40) e.pass++;
    }
    return Array.from(map.values())
      .map((s) => ({ ...s, avg: Math.round(s.total / s.count), passRate: Math.round((s.pass / s.count) * 100) }))
      .filter((c) => c.name !== "—")
      .sort((a, b) => b.avg - a.avg);
  }, [filtered]);

  const riskStudents = useMemo(() => {
    const map = new Map<string, { name: string; adm: string; total: number; count: number; class: string }>();
    for (const r of filtered) {
      const id   = (r as any).student_id;
      const name = `${(r as any).students?.first_name ?? ""} ${(r as any).students?.last_name ?? ""}`.trim();
      const adm  = (r as any).students?.admission_no ?? "";
      const cls  = classLabel((r as any).students?.classes);
      if (!map.has(id)) map.set(id, { name, adm, total: 0, count: 0, class: cls });
      const s = map.get(id)!;
      s.total += Number((r as any).score);
      s.count++;
    }
    return Array.from(map.values())
      .map((s) => ({ ...s, avg: Math.round(s.total / s.count) }))
      .filter((s) => s.avg < 40)
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 15);
  }, [filtered]);

  const giftedStudents = useMemo(() => {
    const map = new Map<string, { name: string; adm: string; total: number; count: number; class: string }>();
    for (const r of filtered) {
      const id   = (r as any).student_id;
      const name = `${(r as any).students?.first_name ?? ""} ${(r as any).students?.last_name ?? ""}`.trim();
      const adm  = (r as any).students?.admission_no ?? "";
      const cls  = classLabel((r as any).students?.classes);
      if (!map.has(id)) map.set(id, { name, adm, total: 0, count: 0, class: cls });
      const s = map.get(id)!;
      s.total += Number((r as any).score);
      s.count++;
    }
    return Array.from(map.values())
      .map((s) => ({ ...s, avg: Math.round(s.total / s.count) }))
      .filter((s) => s.avg >= 75)
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 15);
  }, [filtered]);

  // Scatter data — subject avg vs pass rate
  const scatterData = useMemo(() =>
    subjectAnalytics.map((s) => ({ x: s.avg, y: s.passRate, name: s.name, z: s.count })),
    [subjectAnalytics]
  );

  // Heatmap — class x subject
  const heatmapData = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const r of filtered) {
      const cls = classLabel((r as any).students?.classes);
      const sub = (r as any).subjects?.name ?? (r as any).subject_id;
      const key = `${cls}::${sub}`;
      if (!map.has(key)) map.set(key, { total: 0, count: 0 });
      const e = map.get(key)!;
      e.total += Number((r as any).score);
      e.count++;
    }
    return Array.from(map.entries()).map(([key, v]) => {
      const [cls, subject] = key.split("::");
      return { class: cls, subject, avg: Math.round(v.total / v.count) };
    }).filter((d) => d.class !== "—");
  }, [filtered]);

  // Term trend (group by term+year)
  const termTrend = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const r of filtered) {
      const exam = (r as any).exams;
      if (!exam) continue;
      const key = `${exam.year ?? ""} ${exam.term ?? ""}`.trim();
      if (!map.has(key)) map.set(key, { total: 0, count: 0 });
      const e = map.get(key)!;
      e.total += Number((r as any).score);
      e.count++;
    }
    return Array.from(map.entries())
      .map(([term, v]) => ({ term, avg: Math.round(v.total / v.count) }))
      .sort((a, b) => a.term.localeCompare(b.term));
  }, [filtered]);

  // Radar chart for top subject performance
  const radarData = useMemo(() =>
    subjectAnalytics.slice(0, 8).map((s) => ({ subject: (s.name ?? "").slice(0, 8), avg: s.avg, passRate: s.passRate })),
    [subjectAnalytics]
  );

  // Grade pie data
  const gradePieData = useMemo(() =>
    gradeDistribution.slice(0, 8).map((d) => ({ name: d.grade, value: d.count, color: GRADE_COLORS[d.grade] ?? "#6366f1" })),
    [gradeDistribution]
  );

  // ── Form state ──────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    student_id: "", exam_id: "", subject_id: "",
    score: "", remarks: "", verified: false,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const score = Number(form.score);
      const grade = await resolveGrade(score, form.subject_id);
      const payload = {
        student_id: form.student_id,
        exam_id:    form.exam_id,
        subject_id: form.subject_id,
        score, grade,
        remarks:  form.remarks || null,
        verified: form.verified,
      };
      if (editing) {
        const { error } = await supabase.from("exam_results").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("exam_results").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exam_results"] });
      toast.success(editing ? "Result updated" : "Result saved");
      setOpen(false);
      setEditing(null);
      setForm({ student_id: "", exam_id: "", subject_id: "", score: "", remarks: "", verified: false });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function openEdit(r: any) {
    setEditing(r);
    setForm({
      student_id: r.student_id,
      exam_id:    r.exam_id,
      subject_id: r.subject_id,
      score:    String(r.score),
      remarks:  r.remarks ?? "",
      verified: r.verified ?? false,
    });
    setOpen(true);
  }

  const clearFilters = useCallback(() => {
    setFilterExam("all");
    setFilterSubject("all");
    setFilterClass("all");
    setFilterGender("all");
    setSearch("");
  }, []);

  const hasFilters = filterExam !== "all" || filterSubject !== "all" || filterClass !== "all" || filterGender !== "all" || !!search;

  // ── Export CSV ──────────────────────────────────────────────────────────
  function exportCsv() {
    const rows = [
      ["Student", "Admission No", "Class", "Exam", "Term", "Year", "Subject", "Score", "Grade", "Verified", "Remarks"],
      ...filtered.map((r: any) => [
        `${r.students?.first_name ?? ""} ${r.students?.last_name ?? ""}`.trim(),
        r.students?.admission_no ?? "",
        classLabel(r.students?.classes),
        r.exams?.name ?? "",
        r.exams?.term ?? "",
        r.exams?.year ?? "",
        r.subjects?.name ?? "",
        r.score,
        r.grade ?? fallbackGrade(r.score),
        r.verified ? "Yes" : "No",
        r.remarks ?? "",
      ]),
    ];
    const csv = rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "results.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      <StudentRouteGuard />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-primary" />
            Academic Intelligence Center
          </h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length.toLocaleString()} results · {subjectAnalytics.length} subjects · {classAnalytics.length} classes
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={exportCsv}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>
          {can && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-8 gap-1.5" onClick={() => {
                  setEditing(null);
                  setForm({ student_id: "", exam_id: "", subject_id: "", score: "", remarks: "", verified: false });
                }}>
                  <Plus className="w-4 h-4" /> Add Result
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Result</DialogTitle></DialogHeader>
                <div className="space-y-3 py-2">
                  {[
                    { label: "Student", field: "student_id", items: students, labelFn: (s: any) => `${s.first_name} ${s.last_name} (${s.admission_no})` },
                    { label: "Exam",    field: "exam_id",    items: exams,    labelFn: (e: any) => `${e.name} — ${e.term} ${e.year}` },
                    { label: "Subject", field: "subject_id", items: subjects, labelFn: (s: any) => `${s.name}${s.code ? " (" + s.code + ")" : ""}` },
                  ].map(({ label, field, items, labelFn }) => (
                    <div key={field} className="space-y-1">
                      <Label>{label}</Label>
                      <Select value={(form as any)[field]} onValueChange={(v) => setForm((f) => ({ ...f, [field]: v }))}>
                        <SelectTrigger><SelectValue placeholder={`Select ${label}`} /></SelectTrigger>
                        <SelectContent>
                          {(items as any[]).map((it) => (
                            <SelectItem key={it.id} value={it.id}>{labelFn(it)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  <div className="space-y-1">
                    <Label>Score (0–100)</Label>
                    <Input type="number" min={0} max={100} value={form.score}
                      onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Remarks</Label>
                    <Textarea rows={2} value={form.remarks}
                      onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
                  </div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.verified}
                      onChange={(e) => setForm((f) => ({ ...f, verified: e.target.checked }))} />
                    Mark as verified
                  </label>
                </div>
                <DialogFooter>
                  <Button onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending || !form.student_id || !form.exam_id || !form.subject_id || !form.score}>
                    {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                    {editing ? "Update" : "Save"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3"
      >
        <KpiCard delay={0}    icon={<BarChart3 className="w-4 h-4" />}    label="Total Results"     value={filtered.length}                       sub={`${verifiedCount} verified`}              color="indigo" />
        <KpiCard delay={0.05} icon={<TrendingUp className="w-4 h-4" />}   label="Mean Score"        value={overallAvg !== null ? overallAvg : "—"} sub={`School grade: ${schoolMeanGrade}`}       color="blue" />
        <KpiCard delay={0.1}  icon={<CheckCircle2 className="w-4 h-4" />} label="Pass Rate"         value={passRate !== null ? passRate : "—"}     sub="Score ≥ 40"                               color={passRate !== null && passRate >= 70 ? "emerald" : "amber"} />
        <KpiCard delay={0.15} icon={<Star className="w-4 h-4" />}         label="Distinction Rate"  value={distinctionRate !== null ? distinctionRate : "—"} sub="Score ≥ 75"               color="violet" />
        <KpiCard delay={0.2}  icon={<AlertTriangle className="w-4 h-4" />} label="Failure Rate"     value={failureRate !== null ? failureRate : "—"} sub={`${riskStudents.length} at risk`}      color="red" />
        <KpiCard delay={0.25} icon={<BookOpen className="w-4 h-4" />}     label="Subjects"          value={subjectAnalytics.length}                sub="being tracked"                           color="cyan" />
        <KpiCard delay={0.3}  icon={<Users className="w-4 h-4" />}        label="Classes"           value={classAnalytics.length}                  sub="in filtered set"                         color="blue" />
        <KpiCard delay={0.35} icon={<Award className="w-4 h-4" />}        label="Gifted Students"   value={giftedStudents.length}                  sub="Avg ≥ 75%"                               color="emerald" />
      </motion.div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-muted/20 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            Filters
            {hasFilters && <Badge variant="secondary" className="text-[10px] py-0">{[filterExam !== "all", filterSubject !== "all", filterClass !== "all", filterGender !== "all", !!search].filter(Boolean).length} active</Badge>}
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowFilters((v) => !v)}>
            {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showFilters ? "Hide" : "Show"}
          </Button>
        </div>
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-3 items-end">
                {[
                  { label: "Exam",    value: filterExam,    set: setFilterExam,    items: exams,    labelFn: (e: any) => `${e.name} — ${e.term}`, w: "w-48" },
                  { label: "Subject", value: filterSubject, set: setFilterSubject, items: subjects, labelFn: (s: any) => s.name, w: "w-40" },
                  { label: "Class",   value: filterClass,   set: setFilterClass,   items: classes,  labelFn: (c: any) => `${c.name}${c.stream ? " " + c.stream : ""}`, w: "w-36" },
                ].map(({ label, value, set, items, labelFn, w }) => (
                  <div key={label} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <Select value={value} onValueChange={set}>
                      <SelectTrigger className={`${w} h-8 text-xs`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All {label}s</SelectItem>
                        {(items as any[]).map((it) => (
                          <SelectItem key={it.id} value={it.id}>{labelFn(it)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                <div className="space-y-1">
                  <Label className="text-xs">Gender</Label>
                  <Select value={filterGender} onValueChange={setFilterGender}>
                    <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Search student</Label>
                  <div className="relative">
                    <UserSearch className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-7 h-8 text-xs w-44" placeholder="Name / adm no"
                      value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                </div>
                {hasFilters && (
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={clearFilters}>
                    Clear All
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex w-auto min-w-full sm:min-w-0 h-auto flex-nowrap gap-0.5 p-1">
            <TabsTrigger value="overview"   className="whitespace-nowrap text-xs gap-1.5"><BarChart3 className="w-3.5 h-3.5" /> Overview</TabsTrigger>
            <TabsTrigger value="subjects"   className="whitespace-nowrap text-xs gap-1.5"><BookOpen className="w-3.5 h-3.5" /> Subjects</TabsTrigger>
            <TabsTrigger value="classes"    className="whitespace-nowrap text-xs gap-1.5"><Users className="w-3.5 h-3.5" /> Classes</TabsTrigger>
            <TabsTrigger value="compare"    className="whitespace-nowrap text-xs gap-1.5"><Activity className="w-3.5 h-3.5" /> Compare</TabsTrigger>
            <TabsTrigger value="intelligence" className="whitespace-nowrap text-xs gap-1.5"><Brain className="w-3.5 h-3.5" /> Intelligence</TabsTrigger>
            <TabsTrigger value="results"    className="whitespace-nowrap text-xs gap-1.5"><Target className="w-3.5 h-3.5" /> Results Table</TabsTrigger>
          </TabsList>
        </div>

        {/* ─── OVERVIEW TAB ────────────────────────────────────────────── */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <motion.div variants={stagger} initial="hidden" animate="show"
            className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Grade distribution bar */}
            <ChartCard title="Grade Distribution" icon={<BarChart3 className="w-4 h-4" />}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={gradeDistribution} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}
                  barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                  <XAxis dataKey="grade" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<SmartTooltip />} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Students" isAnimationActive animationDuration={800}>
                    {gradeDistribution.map((d, i) => (
                      <Cell key={i} fill={GRADE_COLORS[d.grade] ?? "#6366f1"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Grade pie */}
            <ChartCard title="Grade Share" icon={<Award className="w-4 h-4" />}>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={gradePieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={80} innerRadius={40} paddingAngle={3} isAnimationActive animationBegin={200} animationDuration={800}>
                    {gradePieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(val: any, name: any) => [`${val} students`, `Grade ${name}`]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Term trend */}
            {termTrend.length > 1 && (
              <ChartCard title="Performance Trend by Term" icon={<TrendingUp className="w-4 h-4" />}>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={termTrend} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="avgGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                    <XAxis dataKey="term" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Tooltip content={<SmartTooltip />} />
                    <ReferenceLine y={40} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "Pass", fontSize: 9, fill: "#ef4444" }} />
                    <Area type="monotone" dataKey="avg" stroke="#6366f1" fill="url(#avgGrad)"
                      strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Mean Score"
                      isAnimationActive animationDuration={900} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* Subject radar */}
            {radarData.length >= 3 && (
              <ChartCard title="Subject Performance Radar" icon={<FlaskConical className="w-4 h-4" />}>
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={radarData}>
                    <PolarGrid strokeOpacity={0.3} />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 8 }} />
                    <Radar name="Avg Score" dataKey="avg" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35}
                      isAnimationActive animationDuration={800} />
                    <Radar name="Pass Rate" dataKey="passRate" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2}
                      isAnimationActive animationDuration={1000} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </motion.div>

          {/* Heatmap */}
          {heatmapData.length > 0 && (
            <ChartCard title="Class × Subject Performance Heatmap" icon={<Activity className="w-4 h-4" />}>
              <ScoreHeatmap data={heatmapData} />
            </ChartCard>
          )}
        </TabsContent>

        {/* ─── SUBJECTS TAB ─────────────────────────────────────────────── */}
        <TabsContent value="subjects" className="mt-4 space-y-4">
          <ChartCard title="Subject Mean Scores" icon={<BarChart3 className="w-4 h-4" />}>
            <ResponsiveContainer width="100%" height={Math.max(220, subjectAnalytics.length * 32)}>
              <BarChart data={subjectAnalytics} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                <Tooltip content={<SmartTooltip />} />
                <ReferenceLine x={40} stroke="#ef4444" strokeDasharray="4 4" />
                <Bar dataKey="avg" radius={[0, 4, 4, 0]} name="Mean Score"
                  isAnimationActive animationDuration={900}>
                  {subjectAnalytics.map((s, i) => (
                    <Cell key={i} fill={s.avg >= 70 ? "#22c55e" : s.avg >= 55 ? "#3b82f6" : s.avg >= 40 ? "#f59e0b" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Pass Rate by Subject" icon={<CheckCircle2 className="w-4 h-4" />}>
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {subjectAnalytics.map((s) => (
                  <div key={s.name} className="flex items-center gap-3 text-sm">
                    <span className="w-28 truncate text-xs text-muted-foreground shrink-0">{s.name}</span>
                    <Progress value={s.passRate} max={100} className="flex-1 h-2" />
                    <span className="w-10 text-right font-semibold text-xs tabular-nums">{s.passRate}%</span>
                    <span className={`w-6 text-xs font-bold ${gradeColor(s.grade)}`}>{s.grade}</span>
                  </div>
                ))}
              </div>
            </ChartCard>

            <ChartCard title="Distinction vs Failure Rate" icon={<Zap className="w-4 h-4" />}>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={subjectAnalytics.slice(0, 10)} margin={{ top: 4, right: 12, left: -20, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 9, angle: -30, textAnchor: "end" }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<SmartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="distRate" fill="#22c55e" radius={[3, 3, 0, 0]} name="Distinction %" isAnimationActive animationDuration={700} />
                  <Line type="monotone" dataKey="passRate" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} name="Pass %" isAnimationActive />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Subject scatter — avg vs pass rate */}
          {scatterData.length > 2 && (
            <ChartCard title="Subject Performance Matrix (Avg Score vs Pass Rate)" icon={<Activity className="w-4 h-4" />}>
              <ResponsiveContainer width="100%" height={280}>
                <ScatterChart margin={{ top: 10, right: 20, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                  <XAxis type="number" dataKey="x" name="Avg Score" domain={[0, 100]} tick={{ fontSize: 10 }}
                    label={{ value: "Mean Score (%)", position: "insideBottom", offset: -10, fontSize: 10 }} />
                  <YAxis type="number" dataKey="y" name="Pass Rate" domain={[0, 100]} tick={{ fontSize: 10 }}
                    label={{ value: "Pass Rate (%)", angle: -90, position: "insideLeft", fontSize: 10 }} />
                  <ZAxis dataKey="z" range={[60, 400]} name="Results" />
                  <ReferenceLine x={40} stroke="#ef4444" strokeDasharray="4 4" />
                  <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="4 4" />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0]?.payload;
                      return (
                        <div className="bg-popover border rounded-xl shadow-lg p-2 text-xs">
                          <p className="font-semibold">{p.name}</p>
                          <p>Avg: <b>{p.x}%</b></p>
                          <p>Pass: <b>{p.y}%</b></p>
                          <p>Results: <b>{p.z}</b></p>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={scatterData} fill="#6366f1" fillOpacity={0.7} isAnimationActive animationDuration={800} />
                </ScatterChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </TabsContent>

        {/* ─── CLASSES TAB ──────────────────────────────────────────────── */}
        <TabsContent value="classes" className="mt-4 space-y-4">
          <motion.div variants={stagger} initial="hidden" animate="show"
            className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            <ChartCard title="Class Mean Scores" icon={<BarChart3 className="w-4 h-4" />}>
              <ResponsiveContainer width="100%" height={Math.max(200, classAnalytics.length * 34)}>
                <BarChart data={classAnalytics} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10 }} />
                  <Tooltip content={<SmartTooltip />} />
                  <ReferenceLine x={overallAvg ?? 50} stroke="#6366f1" strokeDasharray="4 4"
                    label={{ value: "School avg", fontSize: 9, fill: "#6366f1", position: "top" }} />
                  <Bar dataKey="avg" radius={[0, 4, 4, 0]} name="Mean Score"
                    isAnimationActive animationDuration={800}>
                    {classAnalytics.map((c, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Class Pass Rates" icon={<CheckCircle2 className="w-4 h-4" />}>
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {classAnalytics.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-3 text-sm">
                    <span className="w-24 truncate text-xs text-muted-foreground shrink-0">{c.name}</span>
                    <Progress value={c.passRate} max={100} className="flex-1 h-2.5"
                      style={{ "--progress-fill": CHART_COLORS[i % CHART_COLORS.length] } as any} />
                    <span className="w-10 text-right font-semibold text-xs tabular-nums">{c.passRate}%</span>
                    <span className="w-8 text-right font-bold text-xs" style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>
                      {c.avg}%
                    </span>
                  </div>
                ))}
              </div>
            </ChartCard>
          </motion.div>

          {/* Class ranking table */}
          <ChartCard title="Class Rankings" icon={<Award className="w-4 h-4" />}>
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead className="text-right">Mean Score</TableHead>
                    <TableHead className="text-right">Pass Rate</TableHead>
                    <TableHead className="text-right">Results</TableHead>
                    <TableHead>Grade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classAnalytics.map((c, i) => (
                    <TableRow key={c.name} className="text-sm">
                      <TableCell className="font-bold text-muted-foreground">
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                      </TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.avg}%</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className={c.passRate >= 70 ? "text-emerald-600" : c.passRate >= 50 ? "text-amber-600" : "text-red-600"}>
                          {c.passRate}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{c.count}</TableCell>
                      <TableCell>
                        <span className={`font-bold text-sm ${gradeColor(fallbackGrade(c.avg))}`}>
                          {fallbackGrade(c.avg)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ChartCard>
        </TabsContent>

        {/* ─── COMPARE TAB ──────────────────────────────────────────────── */}
        <TabsContent value="compare" className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Compare by:</Label>
            {(["subject", "class", "term"] as const).map((m) => (
              <Button key={m} size="sm" variant={compareMode === m ? "default" : "outline"}
                className="h-7 text-xs capitalize" onClick={() => setCompareMode(m)}>
                {m}
              </Button>
            ))}
          </div>

          {compareMode === "subject" && (
            <ChartCard title="Subject Comparison — Avg Score, Pass Rate & Distinction" icon={<BookOpen className="w-4 h-4" />}>
              <ResponsiveContainer width="100%" height={Math.max(240, subjectAnalytics.length * 28)}>
                <BarChart data={subjectAnalytics} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                  <Tooltip content={<SmartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="avg"      fill="#6366f1" radius={[0, 3, 3, 0]} name="Mean Score"    isAnimationActive animationDuration={700} />
                  <Bar dataKey="passRate" fill="#22c55e" radius={[0, 3, 3, 0]} name="Pass Rate"     isAnimationActive animationDuration={900} />
                  <Bar dataKey="distRate" fill="#f59e0b" radius={[0, 3, 3, 0]} name="Distinction %" isAnimationActive animationDuration={1100} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {compareMode === "class" && (
            <ChartCard title="Class Comparison" icon={<Users className="w-4 h-4" />}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={classAnalytics} margin={{ top: 4, right: 12, left: -20, bottom: 20 }} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 9, angle: -25, textAnchor: "end" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip content={<SmartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="avg"      fill="#6366f1" radius={[4, 4, 0, 0]} name="Mean Score" isAnimationActive animationDuration={800} />
                  <Bar dataKey="passRate" fill="#22c55e" radius={[4, 4, 0, 0]} name="Pass Rate"  isAnimationActive animationDuration={1000} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {compareMode === "term" && termTrend.length > 0 && (
            <ChartCard title="Term-over-Term Performance" icon={<TrendingUp className="w-4 h-4" />}>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={termTrend} margin={{ top: 4, right: 24, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                  <XAxis dataKey="term" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip content={<SmartTooltip />} />
                  <ReferenceLine y={40} stroke="#ef4444" strokeDasharray="4 4" />
                  <ReferenceLine y={overallAvg ?? 50} stroke="#6366f1" strokeDasharray="4 4" strokeOpacity={0.5} />
                  <Line type="monotone" dataKey="avg" stroke="#6366f1" strokeWidth={2.5}
                    dot={{ r: 5, fill: "#6366f1" }} activeDot={{ r: 7 }} name="Mean Score"
                    isAnimationActive animationDuration={1000} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </TabsContent>

        {/* ─── INTELLIGENCE TAB ─────────────────────────────────────────── */}
        <TabsContent value="intelligence" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* At-risk students */}
            <ChartCard title={`Students at Risk (${riskStudents.length})`} icon={<AlertTriangle className="w-4 h-4 text-red-500" />}>
              {riskStudents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No at-risk students in current filter.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {riskStudents.map((s, i) => (
                    <motion.div key={i} variants={slideIn} initial="hidden" animate="show"
                      transition={{ delay: i * 0.04 }}
                      className="flex items-center gap-3 p-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-sm">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{s.name}</p>
                        <p className="text-[10px] text-muted-foreground">{s.class} · {s.adm}</p>
                      </div>
                      <div className="w-20 shrink-0">
                        <Progress value={s.avg} max={100} className="h-1.5" />
                      </div>
                      <span className="font-bold text-red-600 w-10 text-right tabular-nums">{s.avg}%</span>
                    </motion.div>
                  ))}
                </div>
              )}
            </ChartCard>

            {/* Gifted students */}
            <ChartCard title={`Gifted Students (${giftedStudents.length})`} icon={<Star className="w-4 h-4 text-amber-500" />}>
              {giftedStudents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No gifted students in current filter.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {giftedStudents.map((s, i) => (
                    <motion.div key={i} variants={slideIn} initial="hidden" animate="show"
                      transition={{ delay: i * 0.04 }}
                      className="flex items-center gap-3 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 text-sm">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{s.name}</p>
                        <p className="text-[10px] text-muted-foreground">{s.class} · {s.adm}</p>
                      </div>
                      <div className="w-20 shrink-0">
                        <Progress value={s.avg} max={100} className="h-1.5" />
                      </div>
                      <span className="font-bold text-emerald-600 w-10 text-right tabular-nums">{s.avg}%</span>
                    </motion.div>
                  ))}
                </div>
              )}
            </ChartCard>
          </div>

          {/* Academic health summary */}
          <ChartCard title="Academic Health Summary" icon={<Brain className="w-4 h-4" />}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "School Mean Grade",   value: schoolMeanGrade,                     desc: "Overall academic grade" },
                { label: "Pass Rate",           value: `${passRate ?? "—"}%`,               desc: "Students scoring ≥ 40" },
                { label: "Distinction Rate",    value: `${distinctionRate ?? "—"}%`,         desc: "Students scoring ≥ 75" },
                { label: "Failure Rate",        value: `${failureRate ?? "—"}%`,             desc: "Students scoring < 40" },
                { label: "Top Subject",         value: subjectAnalytics[0]?.name?.slice(0, 14) ?? "—", desc: `Avg: ${subjectAnalytics[0]?.avg ?? "—"}%` },
                { label: "Needs Attention",     value: subjectAnalytics[subjectAnalytics.length - 1]?.name?.slice(0, 14) ?? "—", desc: `Avg: ${subjectAnalytics[subjectAnalytics.length - 1]?.avg ?? "—"}%` },
              ].map(({ label, value, desc }) => (
                <div key={label} className="rounded-lg border p-3 space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                  <p className="text-xl font-bold leading-none">{value}</p>
                  <p className="text-[10px] text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          </ChartCard>

          {/* Pending verification alert */}
          {pendingCount > 0 && (
            <motion.div variants={fadeUp} initial="hidden" animate="show">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-sm text-amber-800 dark:text-amber-400">{pendingCount} Results Pending Verification</p>
                  <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">
                    These results have not been verified yet. Use the Results Table tab to review and mark them as verified.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </TabsContent>

        {/* ─── RESULTS TABLE TAB ────────────────────────────────────────── */}
        <TabsContent value="results" className="mt-4">
          {isLoading ? (
            <div className="h-40 grid place-items-center">
              <Loader2 className="animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="h-40 grid place-items-center text-sm text-muted-foreground">No results found.</div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Exam</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-center">Grade</TableHead>
                    <TableHead className="text-center min-w-[80px]">Progress</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    {can && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 300).map((r: any) => {
                    const g  = r.grade ?? fallbackGrade(r.score);
                    const gc = gradeColor(g);
                    return (
                      <TableRow key={r.id} className="text-sm hover:bg-muted/40 transition-colors">
                        <TableCell className="font-medium">
                          {r.students?.first_name} {r.students?.last_name}
                          <br />
                          <span className="text-[10px] text-muted-foreground font-mono">{r.students?.admission_no}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{classLabel(r.students?.classes)}</TableCell>
                        <TableCell className="text-xs">
                          {r.exams?.name}
                          <br />
                          <span className="text-muted-foreground">{r.exams?.term} {r.exams?.year}</span>
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.subjects?.name}
                          <br />
                          <span className="text-muted-foreground font-mono text-[10px]">{r.subjects?.code}</span>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{r.score}</TableCell>
                        <TableCell className="text-center">
                          <span className={`font-bold text-sm ${gc}`}>{g}</span>
                        </TableCell>
                        <TableCell className="min-w-[80px]">
                          <Progress value={r.score} max={100} className="h-1.5" />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{r.remarks || "—"}</TableCell>
                        <TableCell className="text-center">
                          {r.verified
                            ? <Badge className="bg-emerald-600 text-[10px] py-0"><CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />Verified</Badge>
                            : <Badge variant="outline" className="text-[10px] py-0">Pending</Badge>}
                        </TableCell>
                        {can && (
                          <TableCell>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {filtered.length > 300 && (
                <p className="text-xs text-center text-muted-foreground py-2">
                  Showing 300 of {filtered.length}. Use filters to narrow results.
                </p>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
