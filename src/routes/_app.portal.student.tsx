import { StudentPerformanceCenter } from "@/components/students/StudentPerformanceCenter";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/core/rbac";
import {
  Calendar, Clock, MapPin, User, GraduationCap, Heart, Bed, DoorOpen,
  Video, FileText, ExternalLink, Bus, Utensils, Award, ClipboardList,
  TrendingUp, TrendingDown, Minus, AlertTriangle, Star, Target,
  BarChart3, BookOpen, Zap, Shield, ChevronUp, ChevronDown, Activity,
  CheckCircle, XCircle, AlertCircle, Lightbulb, Trophy, ArrowUp, ArrowDown,
} from "lucide-react";
import { format, startOfWeek, endOfWeek, differenceInDays } from "date-fns";
import { MpesaPayDialog } from "@/components/MpesaPayDialog";
import { AttendanceHeatmap } from "@/components/AttendanceHeatmap";
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from "recharts";

// ─── Security: block access if not student ────────────────────────────────
export const Route = createFileRoute("/_app/portal/student")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: StudentPortalGuard,
});

// ─── Forbidden routes for students (enforced at sidebar & direct nav) ─────
const STUDENT_FORBIDDEN_PATHS = [
  "/academics/results",
  "/academics/report-cards",
  "/admin",
  "/settings",
];

function isStudentForbidden(path: string): boolean {
  return STUDENT_FORBIDDEN_PATHS.some((p) => path.startsWith(p));
}

// ─── Guard wrapper ─────────────────────────────────────────────────────────
function StudentPortalGuard() {
  const { roles, rolesLoaded } = useAuth();

  if (!rolesLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const isStudent = roles.includes("student" as any);
  const isAdminOrStaff =
    roles.some((r) =>
      ["super_admin", "principal", "deputy_principal", "school_admin",
       "class_teacher", "subject_teacher", "teacher", "hod", "academic_master",
       "exams_admin", "exams_user"].includes(r)
    );

  // Admins / staff can preview the portal; pure student role required for actual student
  if (!isStudent && !isAdminOrStaff) {
    return (
      <div className="flex items-center justify-center h-64 p-6">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-3">
            <Shield className="w-12 h-12 mx-auto text-destructive opacity-60" />
            <h2 className="font-semibold text-lg">Access Denied</h2>
            <p className="text-sm text-muted-foreground">
              This portal is only available to students.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <StudentPortal />;
}

// ─── Helpers ──────────────────────────────────────────────────────────────
const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function gradeLabel(score: number): { grade: string; color: string } {
  if (score >= 80) return { grade: "A", color: "#22c55e" };
  if (score >= 70) return { grade: "B+", color: "#84cc16" };
  if (score >= 60) return { grade: "B", color: "#eab308" };
  if (score >= 50) return { grade: "C+", color: "#f97316" };
  if (score >= 40) return { grade: "C", color: "#ef4444" };
  return { grade: "D", color: "#dc2626" };
}

function examReadinessScore(
  avgScore: number,
  attRate: number,
  trend: number,
): number {
  const academic = Math.min(avgScore / 100, 1) * 50;
  const attendance = Math.min(attRate / 100, 1) * 30;
  const momentum = Math.min(Math.max((trend + 20) / 40, 0), 1) * 20;
  return Math.round(academic + attendance + momentum);
}

function ProgressRing({
  value,
  max = 100,
  size = 80,
  stroke = 8,
  color = "#6366f1",
  label,
  sublabel,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  color?: string;
  label: string;
  sublabel?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  const dash = circ * pct;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor"
          strokeWidth={stroke} className="text-muted/20" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
          strokeWidth={stroke} strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round" style={{ transition: "stroke-dasharray 1s ease" }} />
      </svg>
      <div className="text-center -mt-1">
        <div className="text-sm font-bold" style={{ color }}>{label}</div>
        {sublabel && <div className="text-xs text-muted-foreground">{sublabel}</div>}
      </div>
    </div>
  );
}

function TrendBadge({ diff }: { diff: number }) {
  if (diff > 0) return (
    <span className="inline-flex items-center gap-0.5 text-xs text-emerald-600 font-medium">
      <ArrowUp className="w-3 h-3" />+{diff.toFixed(1)}
    </span>
  );
  if (diff < 0) return (
    <span className="inline-flex items-center gap-0.5 text-xs text-red-500 font-medium">
      <ArrowDown className="w-3 h-3" />{diff.toFixed(1)}
    </span>
  );
  return <span className="text-xs text-muted-foreground">—</span>;
}

// ─── Main Portal ───────────────────────────────────────────────────────────
function StudentPortal() {
  const { user, fullName, roles } = useAuth();
  const [student, setStudent] = useState<any>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [timetable, setTimetable] = useState<any[]>([]);
  const [discipline, setDiscipline] = useState<any[]>([]);
  const [clinic, setClinic] = useState<any[]>([]);
  const [dorm, setDorm] = useState<any | null>(null);
  const [gatePasses, setGatePasses] = useState<any[]>([]);
  const [liveUpcoming, setLiveUpcoming] = useState<any[]>([]);
  const [liveAttendance, setLiveAttendance] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [transport, setTransport] = useState<any | null>(null);
  const [weekMeals, setWeekMeals] = useState<any[]>([]);
  const [coCurricular, setCoCurricular] = useState<any[]>([]);
  const [nextExam, setNextExam] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");

  // ─── Security: verify student identity server-side ─────────────────────
  const [securityVerified, setSecurityVerified] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Double-check via RLS that this user has a student link
      const { data: link, error } = await supabase
        .from("student_user_links")
        .select("student_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error || !link) {
        // Not linked — check if admin/staff previewing
        const isStaff = roles.some((r: any) =>
          ["super_admin", "principal", "deputy_principal", "school_admin",
           "class_teacher", "subject_teacher", "teacher", "hod",
           "academic_master", "exams_admin"].includes(r)
        );
        if (!isStaff) {
          setLoading(false);
          return;
        }
        // Staff preview mode — load first available student
        setSecurityVerified(true);
        setLoading(false);
        return;
      }

      setSecurityVerified(true);
      const sid = link.student_id;
      await loadStudentData(sid);
      setLoading(false);
    })();
  }, [user]);

  const loadStudentData = async (sid: string) => {
    const sRes = await supabase
      .from("students")
      .select("*, classes(id, name, level, stream)")
      .eq("id", sid)
      .maybeSingle();
    const stu = sRes.data;
    setStudent(stu);

    const classId = stu?.classes?.id;

    const [a, r, i, l, an, tt, dr, cv, da, gp] = await Promise.all([
      supabase.from("attendance_records").select("*").eq("student_id", sid).order("date", { ascending: false }).limit(90),
      supabase.from("exam_results").select("*, subjects(name, code), exams(name, term, year)").eq("student_id", sid).order("created_at", { ascending: false }).limit(100),
      supabase.from("invoices").select("*").eq("student_id", sid).order("created_at", { ascending: false }),
      supabase.from("book_loans").select("*, books(title, author)").eq("student_id", sid).order("borrowed_on", { ascending: false }).limit(20),
      supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(10),
      classId
        ? supabase.from("timetable_slots").select("*, subjects(name, code), staff(first_name, last_name)").eq("class_id", classId).order("day_of_week").order("start_time")
        : Promise.resolve({ data: [] } as any),
      supabase.from("discipline_records").select("*").eq("student_id", sid).order("incident_date", { ascending: false }).limit(20),
      supabase.from("clinic_visits").select("*").eq("student_id", sid).order("visit_date", { ascending: false }).limit(20),
      supabase.from("dorm_assignments").select("*, dormitories(name, gender)").eq("student_id", sid).order("assigned_on", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("gate_passes").select("*").eq("student_id", sid).order("exit_time", { ascending: false }).limit(20),
    ]);
    setAttendance(a.data ?? []);
    setResults(r.data ?? []);
    setInvoices(i.data ?? []);
    setLoans(l.data ?? []);
    setAnnouncements(an.data ?? []);
    setTimetable((tt as any).data ?? []);
    setDiscipline(dr.data ?? []);
    setClinic(cv.data ?? []);
    setDorm((da as any).data ?? null);
    setGatePasses(gp.data ?? []);

    if (classId) {
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const until = new Date(Date.now() + 14 * 864e5).toISOString();
      const { data: ls } = await (supabase as any)
        .from("live_sessions")
        .select("id, title, scheduled_start, scheduled_end, status, room_name, classes(name)")
        .eq("class_id", classId)
        .gte("scheduled_start", since)
        .lte("scheduled_start", until)
        .order("scheduled_start", { ascending: true });
      setLiveUpcoming(ls ?? []);
    }

    const { data: la } = await (supabase as any)
      .from("live_session_attendance")
      .select("id, status, joined_at, left_at, duration_seconds, live_sessions(title, scheduled_start)")
      .eq("student_id", sid)
      .order("created_at", { ascending: false })
      .limit(30);
    setLiveAttendance(la ?? []);

    const { data: docs } = await (supabase as any)
      .from("student_documents")
      .select("*")
      .eq("student_id", sid)
      .order("created_at", { ascending: false });
    setDocuments(docs ?? []);

    const { data: tr } = await (supabase as any)
      .from("transport_assignments")
      .select("*, pickup_point, transport_routes(name, dropoff_point, driver_name, driver_phone, vehicle_reg, pickup_point)")
      .eq("student_id", sid)
      .order("assigned_on", { ascending: false })
      .limit(1)
      .maybeSingle();
    setTransport(tr ?? null);

    const today0 = new Date();
    const weekStart = format(startOfWeek(today0, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const weekEnd = format(endOfWeek(today0, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const { data: meals } = await supabase
      .from("meal_plans")
      .select("*")
      .gte("meal_date", weekStart)
      .lte("meal_date", weekEnd)
      .order("meal_date")
      .order("meal_type");
    setWeekMeals(meals ?? []);

    const { data: cc } = await (supabase as any)
      .from("student_co_curricular")
      .select("*, co_curricular_activities(id, name, category, schedule_day, schedule_time)")
      .eq("student_id", sid);
    const ccList = cc ?? [];
    const activityIds = ccList.map((c: any) => c.co_curricular_activities?.id).filter(Boolean);
    let coaches: any[] = [];
    if (activityIds.length) {
      const { data: cd } = await (supabase as any)
        .from("staff_co_curricular")
        .select("activity_id, role, staff(first_name, last_name)")
        .in("activity_id", activityIds);
      coaches = cd ?? [];
    }
    setCoCurricular(ccList.map((c: any) => ({
      ...c,
      coach: coaches.find((co: any) => co.activity_id === c.co_curricular_activities?.id),
    })));

    const { data: ne } = await supabase
      .from("exams")
      .select("*")
      .gte("start_date", format(today0, "yyyy-MM-dd"))
      .order("start_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    setNextExam(ne ?? null);
  };

  // ─── Derived analytics ─────────────────────────────────────────────────
  const today = new Date();
  const todayDow = ((today.getDay() + 6) % 7) + 1;
  const todaySlots = useMemo(
    () => timetable.filter((s) => s.day_of_week === todayDow),
    [timetable, todayDow]
  );
  const nowMin = today.getHours() * 60 + today.getMinutes();
  const nextSlot = useMemo(() => {
    const toMin = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    return todaySlots.find((s) => toMin(s.end_time) > nowMin) ?? null;
  }, [todaySlots, nowMin]);
  const currentSlot = useMemo(() => {
    const toMin = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    return todaySlots.find((s) => toMin(s.start_time) <= nowMin && toMin(s.end_time) > nowMin) ?? null;
  }, [todaySlots, nowMin]);

  const todayStr = format(today, "yyyy-MM-dd");
  const todayMeals = useMemo(() => weekMeals.filter((m) => m.meal_date === todayStr), [weekMeals, todayStr]);
  const mealFor = (type: string) => todayMeals.find((m) => m.meal_type === type);

  const reportCardExams = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of results) {
      if (r.exams && r.exam_id) map.set(r.exam_id, r.exams);
    }
    return Array.from(map.entries()).map(([id, exam]) => ({ id, ...exam }));
  }, [results]);

  // Analytics calculations
  const avgScore = useMemo(() =>
    results.length ? Math.round(results.reduce((a, r) => a + Number(r.score || 0), 0) / results.length) : null,
    [results]
  );

  const present = useMemo(() => attendance.filter((a) => a.status === "present").length, [attendance]);
  const attRate = useMemo(() => attendance.length ? Math.round((present / attendance.length) * 100) : 0, [attendance, present]);

  const totalDue = useMemo(() => invoices.reduce((s, i) => s + Number(i.amount) - Number(i.paid), 0), [invoices]);

  // Per-subject analytics
  const subjectAnalytics = useMemo(() => {
    const map = new Map<string, { name: string; scores: number[]; exams: string[] }>();
    for (const r of results) {
      const name = r.subjects?.name ?? "Unknown";
      const id = r.subject_id ?? name;
      if (!map.has(id)) map.set(id, { name, scores: [], exams: [] });
      map.get(id)!.scores.push(Number(r.score || 0));
      map.get(id)!.exams.push(r.exams?.name ?? "");
    }
    return Array.from(map.values()).map((s) => {
      const sorted = [...s.scores];
      const current = sorted[0] ?? 0;
      const previous = sorted[1] ?? null;
      const avg = Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length);
      const diff = previous !== null ? current - previous : 0;
      const trend = diff > 2 ? "up" : diff < -2 ? "down" : "stable";
      return { ...s, current, previous, avg, diff, trend };
    }).sort((a, b) => b.current - a.current);
  }, [results]);

  // Best / weakest subject
  const bestSubject = subjectAnalytics[0] ?? null;
  const weakestSubject = subjectAnalytics[subjectAnalytics.length - 1] ?? null;
  const mostImproved = useMemo(() =>
    [...subjectAnalytics].sort((a, b) => b.diff - a.diff)[0] ?? null,
    [subjectAnalytics]
  );

  // Trend over last 5 exams (by exam name/date)
  const examTrend = useMemo(() => {
    const examMap = new Map<string, { name: string; total: number; count: number; term: string; year: string }>();
    for (const r of [...results].reverse()) {
      const key = r.exam_id ?? r.exams?.name;
      if (!key) continue;
      if (!examMap.has(key)) examMap.set(key, { name: r.exams?.name ?? "Exam", total: 0, count: 0, term: r.exams?.term ?? "", year: r.exams?.year ?? "" });
      const e = examMap.get(key)!;
      e.total += Number(r.score || 0);
      e.count++;
    }
    return Array.from(examMap.values()).map((e) => ({
      name: `${e.name}`,
      avg: Math.round(e.total / e.count),
      term: e.term,
    })).slice(-6);
  }, [results]);

  // Performance trend (last score vs prev)
  const perfTrend = examTrend.length >= 2
    ? examTrend[examTrend.length - 1].avg - examTrend[examTrend.length - 2].avg
    : 0;

  const readiness = avgScore !== null ? examReadinessScore(avgScore, attRate, perfTrend) : null;

  // Grade distribution for pie chart
  const gradeDistribution = useMemo(() => {
    const buckets: Record<string, number> = { A: 0, "B+": 0, B: 0, "C+": 0, C: 0, D: 0 };
    for (const r of results) {
      const { grade } = gradeLabel(Number(r.score || 0));
      buckets[grade] = (buckets[grade] ?? 0) + 1;
    }
    return Object.entries(buckets)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [results]);

  // Attendance monthly trend
  const attendanceTrend = useMemo(() => {
    const monthly = new Map<string, { present: number; total: number }>();
    for (const a of attendance) {
      const month = a.date?.slice(0, 7) ?? "";
      if (!monthly.has(month)) monthly.set(month, { present: 0, total: 0 });
      const m = monthly.get(month)!;
      m.total++;
      if (a.status === "present") m.present++;
    }
    return Array.from(monthly.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, rate: Math.round((v.present / v.total) * 100) }));
  }, [attendance]);

  const daysToExam = nextExam?.start_date
    ? differenceInDays(new Date(nextExam.start_date), today)
    : null;

  const initials = `${student?.first_name?.[0] ?? ""}${student?.last_name?.[0] ?? ""}`.toUpperCase();

  // ─── Loading ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="h-32 bg-muted rounded-xl" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-muted rounded-xl" />)}
          </div>
          <div className="h-64 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <User className="w-12 h-12 mx-auto text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">
              Your account is not linked to a student record yet. Please contact the school admin.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { grade: currentGrade, color: gradeColor } = gradeLabel(avgScore ?? 0);

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Hero Identity Header ───────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="relative">
            <Avatar className="h-20 w-20 ring-4 ring-background shadow-lg">
              <AvatarImage src={student.photo_url ?? undefined} alt={fullName ?? student.first_name} />
              <AvatarFallback className="text-xl font-bold bg-primary/10">{initials}</AvatarFallback>
            </Avatar>
            {attRate >= 90 && (
              <div className="absolute -bottom-1 -right-1 bg-emerald-500 rounded-full p-1">
                <CheckCircle className="w-3 h-3 text-white" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight truncate">
              {fullName || `${student.first_name} ${student.last_name}`}
            </h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />{student.unique_id ?? student.admission_no}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5" />{student.classes?.name ?? "No class"}
              </span>
              {student.classes?.stream && (
                <span className="inline-flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" />{student.classes.stream}
                </span>
              )}
              {dorm?.dormitories?.name && (
                <span className="inline-flex items-center gap-1.5">
                  <Bed className="w-3.5 h-3.5" />{dorm.dormitories.name}{dorm.bed_no ? ` · Bed ${dorm.bed_no}` : ""}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {currentSlot && (
              <div className="rounded-xl border bg-primary/10 px-4 py-3 text-sm min-w-[160px]">
                <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live now
                </div>
                <div className="font-semibold">{currentSlot.subjects?.name ?? "Lesson"}</div>
                <div className="text-xs text-muted-foreground">
                  {currentSlot.start_time?.slice(0, 5)}–{currentSlot.end_time?.slice(0, 5)}
                  {currentSlot.room ? ` · ${currentSlot.room}` : ""}
                </div>
              </div>
            )}
            {!currentSlot && nextSlot && (
              <div className="rounded-xl border px-4 py-3 text-sm min-w-[160px]">
                <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <Clock className="w-3 h-3" /> Up next
                </div>
                <div className="font-semibold">{nextSlot.subjects?.name ?? "Lesson"}</div>
                <div className="text-xs text-muted-foreground">
                  {nextSlot.start_time?.slice(0, 5)}–{nextSlot.end_time?.slice(0, 5)}
                  {nextSlot.room ? ` · ${nextSlot.room}` : ""}
                </div>
              </div>
            )}
            {nextExam && daysToExam !== null && (
              <div className={`rounded-xl border px-4 py-3 text-sm min-w-[160px] ${daysToExam <= 7 ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : ""}`}>
                <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <ClipboardList className="w-3 h-3" /> Next exam
                </div>
                <div className="font-semibold">{nextExam.name}</div>
                <div className="text-xs text-muted-foreground">
                  {daysToExam === 0 ? "Today!" : daysToExam === 1 ? "Tomorrow" : `In ${daysToExam} days`}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI Ring Row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="flex flex-col items-center justify-center py-5 gap-2">
          <ProgressRing
            value={avgScore ?? 0} size={80} stroke={7}
            color={gradeColor}
            label={`${avgScore ?? "—"}%`}
            sublabel="Average"
          />
          <div className="text-xs text-muted-foreground text-center">
            Grade <span className="font-bold" style={{ color: gradeColor }}>{avgScore !== null ? currentGrade : "—"}</span>
            {perfTrend !== 0 && <TrendBadge diff={perfTrend} />}
          </div>
        </Card>
        <Card className="flex flex-col items-center justify-center py-5 gap-2">
          <ProgressRing
            value={attRate} size={80} stroke={7}
            color={attRate >= 90 ? "#22c55e" : attRate >= 75 ? "#eab308" : "#ef4444"}
            label={`${attRate}%`}
            sublabel="Attendance"
          />
          <div className="text-xs text-muted-foreground text-center">
            {present}/{attendance.length} days
          </div>
        </Card>
        <Card className="flex flex-col items-center justify-center py-5 gap-2">
          <ProgressRing
            value={readiness ?? 0} size={80} stroke={7}
            color={readiness && readiness >= 70 ? "#6366f1" : readiness && readiness >= 50 ? "#f97316" : "#ef4444"}
            label={`${readiness ?? "—"}`}
            sublabel="Readiness"
          />
          <div className="text-xs text-muted-foreground text-center">Exam score</div>
        </Card>
        <Card className="flex flex-col items-center justify-center py-5 gap-2">
          <div className="w-20 h-20 rounded-full flex items-center justify-center bg-muted/30 text-2xl font-bold">
            {totalDue > 0 ? (
              <span className="text-destructive text-lg">KES {(totalDue / 1000).toFixed(0)}k</span>
            ) : (
              <CheckCircle className="w-8 h-8 text-emerald-500" />
            )}
          </div>
          <div className="text-xs text-muted-foreground text-center">
            {totalDue > 0 ? "Outstanding fees" : "Fees clear"}
          </div>
        </Card>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex w-auto min-w-full sm:min-w-0 h-auto flex-nowrap gap-0.5 p-1">
            <TabsTrigger value="dashboard" className="whitespace-nowrap text-xs sm:text-sm">📊 Dashboard</TabsTrigger>
            <TabsTrigger value="analytics" className="whitespace-nowrap text-xs sm:text-sm">📈 Analytics</TabsTrigger>
            <TabsTrigger value="subjects" className="whitespace-nowrap text-xs sm:text-sm">📚 Subjects</TabsTrigger>
            <TabsTrigger value="results" className="whitespace-nowrap text-xs sm:text-sm">🏆 Results</TabsTrigger>
            <TabsTrigger value="reportcards" className="whitespace-nowrap text-xs sm:text-sm">📋 Reports</TabsTrigger>
            <TabsTrigger value="timetable" className="whitespace-nowrap text-xs sm:text-sm">🗓 Timetable</TabsTrigger>
            <TabsTrigger value="attendance" className="whitespace-nowrap text-xs sm:text-sm">✅ Attendance</TabsTrigger>
            <TabsTrigger value="fees" className="whitespace-nowrap text-xs sm:text-sm">💳 Fees</TabsTrigger>
            <TabsTrigger value="today" className="whitespace-nowrap text-xs sm:text-sm">☀️ My Day</TabsTrigger>
            <TabsTrigger value="meals" className="whitespace-nowrap text-xs sm:text-sm">🍽 Meals</TabsTrigger>
            <TabsTrigger value="cocurricular" className="whitespace-nowrap text-xs sm:text-sm">🏅 Activities</TabsTrigger>
            <TabsTrigger value="library" className="whitespace-nowrap text-xs sm:text-sm">📖 Library</TabsTrigger>
            <TabsTrigger value="live" className="whitespace-nowrap text-xs sm:text-sm">🎥 Live</TabsTrigger>
            <TabsTrigger value="discipline" className="whitespace-nowrap text-xs sm:text-sm">⚖️ Discipline</TabsTrigger>
            <TabsTrigger value="clinic" className="whitespace-nowrap text-xs sm:text-sm">🏥 Clinic</TabsTrigger>
            <TabsTrigger value="gate" className="whitespace-nowrap text-xs sm:text-sm">🚪 Gate</TabsTrigger>
            <TabsTrigger value="transport" className="whitespace-nowrap text-xs sm:text-sm">🚌 Transport</TabsTrigger>
            <TabsTrigger value="news" className="whitespace-nowrap text-xs sm:text-sm">📣 News</TabsTrigger>
            <TabsTrigger value="documents" className="whitespace-nowrap text-xs sm:text-sm">📁 Docs</TabsTrigger>
          </TabsList>
        </div>

        {/* ── DASHBOARD TAB ──────────────────────────────────────────── */}
        <TabsContent value="dashboard" className="mt-4 space-y-6">
          {/* Academic Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              icon={<BarChart3 className="w-5 h-5" />}
              label="Current Average"
              value={avgScore !== null ? `${avgScore}%` : "—"}
              sub={`${results.length} result(s)`}
              color="indigo"
              trend={perfTrend}
            />
            <SummaryCard
              icon={<Star className="w-5 h-5" />}
              label="Current Grade"
              value={avgScore !== null ? currentGrade : "—"}
              sub="Overall grade"
              color="violet"
            />
            <SummaryCard
              icon={<Activity className="w-5 h-5" />}
              label="Attendance Rate"
              value={`${attRate}%`}
              sub={`${present} of ${attendance.length} days`}
              color={attRate >= 90 ? "emerald" : attRate >= 75 ? "amber" : "red"}
            />
            <SummaryCard
              icon={<Zap className="w-5 h-5" />}
              label="Exam Readiness"
              value={readiness !== null ? `${readiness}/100` : "—"}
              sub="Combined score"
              color="blue"
            />
          </div>

          {/* Performance Trend Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" /> Performance Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                {examTrend.length < 2 ? (
                  <EmptyChart message="Need at least 2 exams to show trend" />
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={examTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: any) => [`${v}%`, "Average"]} />
                      <Line type="monotone" dataKey="avg" stroke="#6366f1" strokeWidth={2.5}
                        dot={{ fill: "#6366f1", r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-500" /> Attendance Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                {attendanceTrend.length < 2 ? (
                  <EmptyChart message="Not enough attendance data yet" />
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={attendanceTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: any) => [`${v}%`, "Attendance"]} />
                      <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                        {attendanceTrend.map((entry, i) => (
                          <Cell key={i} fill={entry.rate >= 90 ? "#22c55e" : entry.rate >= 75 ? "#eab308" : "#ef4444"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Insights Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {bestSubject && (
              <InsightCard
                icon={<Trophy className="w-5 h-5 text-amber-500" />}
                title="Best Subject"
                value={bestSubject.name}
                detail={`${bestSubject.current}% average`}
                color="amber"
              />
            )}
            {mostImproved && mostImproved.diff > 0 && (
              <InsightCard
                icon={<TrendingUp className="w-5 h-5 text-emerald-500" />}
                title="Most Improved"
                value={mostImproved.name}
                detail={`+${mostImproved.diff.toFixed(1)} points`}
                color="emerald"
              />
            )}
            {weakestSubject && weakestSubject !== bestSubject && (
              <InsightCard
                icon={<AlertCircle className="w-5 h-5 text-orange-500" />}
                title="Needs Attention"
                value={weakestSubject.name}
                detail={`${weakestSubject.current}% — focus here`}
                color="orange"
              />
            )}
            {attRate < 85 && (
              <InsightCard
                icon={<AlertTriangle className="w-5 h-5 text-red-500" />}
                title="Attendance Risk"
                value={`${attRate}% rate`}
                detail="Below 85% — attend more classes"
                color="red"
              />
            )}
            {nextExam && daysToExam !== null && daysToExam <= 14 && (
              <InsightCard
                icon={<Lightbulb className="w-5 h-5 text-blue-500" />}
                title="Study Reminder"
                value={nextExam.name}
                detail={daysToExam <= 0 ? "Exam is today!" : `${daysToExam} days to prepare`}
                color="blue"
              />
            )}
            {totalDue > 0 && (
              <InsightCard
                icon={<AlertCircle className="w-5 h-5 text-destructive" />}
                title="Outstanding Fees"
                value={`KES ${totalDue.toLocaleString()}`}
                detail="Contact bursar to clear"
                color="red"
              />
            )}
          </div>
        </TabsContent>

        {/* ── ANALYTICS TAB ──────────────────────────────────────────── */}
        <TabsContent value="analytics" className="mt-4 space-y-4">
          <StudentPerformanceCenter
            results={results}
            attendance={attendance}
          />
        </TabsContent>

        {/* ── SUBJECTS TAB ──────────────────────────────────────────── */}
        <TabsContent value="subjects" className="mt-4 space-y-4">
          {subjectAnalytics.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No subject results yet.</CardContent></Card>
          ) : (
            subjectAnalytics.map((s) => (
              <Card key={s.name} className="overflow-hidden">
                <div className="flex flex-col sm:flex-row">
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{s.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {s.scores.length} exam(s) recorded
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-2xl font-bold"
                          style={{ color: gradeLabel(s.current).color }}
                        >
                          {s.current}%
                        </span>
                        <Badge variant="secondary" style={{ color: gradeLabel(s.current).color, borderColor: gradeLabel(s.current).color }} className="border">
                          {gradeLabel(s.current).grade}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Progress value={s.current} className="h-2" />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <div>
                        <div className="font-medium text-foreground">{s.avg}%</div>
                        <div>Your avg</div>
                      </div>
                      {s.previous !== null && (
                        <div>
                          <div className="font-medium text-foreground flex items-center gap-1">
                            {s.previous}% <TrendBadge diff={s.diff} />
                          </div>
                          <div>Previous</div>
                        </div>
                      )}
                      <div>
                        <div className={`font-medium ${s.trend === "up" ? "text-emerald-600" : s.trend === "down" ? "text-red-500" : "text-foreground"} flex items-center gap-1`}>
                          {s.trend === "up" ? <TrendingUp className="w-3 h-3" /> : s.trend === "down" ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                          {s.trend === "up" ? "Improving" : s.trend === "down" ? "Declining" : "Stable"}
                        </div>
                        <div>Trend</div>
                      </div>
                    </div>
                  </div>
                  {s.scores.length >= 2 && (
                    <div className="w-full sm:w-40 p-2 border-t sm:border-t-0 sm:border-l">
                      <ResponsiveContainer width="100%" height={80}>
                        <LineChart data={s.scores.slice().reverse().map((v, i) => ({ i, v }))}>
                          <Line type="monotone" dataKey="v" stroke={gradeLabel(s.current).color}
                            strokeWidth={2} dot={false} />
                          <YAxis domain={[0, 100]} hide />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── RESULTS TAB ──────────────────────────────────────────── */}
        <TabsContent value="results" className="mt-4 space-y-4">
          {/* By exam */}
          {reportCardExams.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No results yet.</CardContent></Card>
          ) : (
            reportCardExams.map((exam) => {
              const examResults = results.filter((r) => r.exam_id === exam.id);
              const examAvg = examResults.length
                ? Math.round(examResults.reduce((a, r) => a + Number(r.score || 0), 0) / examResults.length)
                : null;
              return (
                <Card key={exam.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">{exam.name}</CardTitle>
                        <CardDescription>{exam.term} {exam.year}</CardDescription>
                      </div>
                      <div className="text-right">
                        {examAvg !== null && (
                          <div className="text-2xl font-bold" style={{ color: gradeLabel(examAvg).color }}>
                            {examAvg}%
                          </div>
                        )}
                        {examAvg !== null && (
                          <Badge style={{ backgroundColor: gradeLabel(examAvg).color + "20", color: gradeLabel(examAvg).color }}>
                            {gradeLabel(examAvg).grade}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {examResults.map((r) => (
                        <div key={r.id} className="flex items-center gap-3">
                          <div className="flex-1 text-sm font-medium">{r.subjects?.name}</div>
                          <div className="w-24">
                            <Progress value={Number(r.score || 0)} className="h-1.5" />
                          </div>
                          <div className="w-16 text-right">
                            <span className="text-sm font-bold" style={{ color: gradeLabel(Number(r.score || 0)).color }}>
                              {r.score}%
                            </span>
                          </div>
                          <Badge variant="outline" className="w-8 text-center text-xs">
                            {r.grade ?? gradeLabel(Number(r.score || 0)).grade}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* ── REPORT CARDS TAB ─────────────────────────────────────── */}
        <TabsContent value="reportcards" className="mt-4 space-y-3">
          {reportCardExams.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No report cards available yet.</CardContent></Card>
          ) : (
            reportCardExams.map((e) => {
              const examResults = results.filter((r) => r.exam_id === e.id);
              const examAvg = examResults.length
                ? Math.round(examResults.reduce((a, r) => a + Number(r.score || 0), 0) / examResults.length)
                : null;
              return (
                <Card key={e.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold"
                          style={{ backgroundColor: examAvg ? gradeLabel(examAvg).color + "15" : undefined, color: examAvg ? gradeLabel(examAvg).color : undefined }}>
                          {examAvg !== null ? gradeLabel(examAvg).grade : "—"}
                        </div>
                        <div>
                          <div className="font-semibold">{e.name}</div>
                          <div className="text-sm text-muted-foreground">{e.term} {e.year}</div>
                          {examAvg !== null && (
                            <div className="text-xs text-muted-foreground">{examAvg}% average · {examResults.length} subjects</div>
                          )}
                        </div>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link to="/academics/report-card/$studentId/$examId" params={{ studentId: student.id, examId: e.id }}>
                          <ClipboardList className="w-4 h-4 mr-1" /> View Full Report
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* ── TIMETABLE TAB ────────────────────────────────────────── */}
        <TabsContent value="timetable" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Weekly Timetable</CardTitle>
              <CardDescription>{student.classes?.name}</CardDescription>
            </CardHeader>
            <CardContent>
              {timetable.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No timetable published for your class yet.</p>
              ) : (
                <div className="space-y-5">
                  {[1, 2, 3, 4, 5].map((dow) => {
                    const slots = timetable.filter((s) => s.day_of_week === dow);
                    if (slots.length === 0) return null;
                    const isToday = dow === todayDow;
                    return (
                      <div key={dow}>
                        <div className={`text-sm font-semibold mb-2 flex items-center gap-2 ${isToday ? "text-primary" : ""}`}>
                          {DAYS[dow]}
                          {isToday && <Badge className="text-xs">Today</Badge>}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {slots.map((s) => {
                            const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
                            const isNow = isToday && toMin(s.start_time) <= nowMin && toMin(s.end_time) > nowMin;
                            return (
                              <div key={s.id}
                                className={`rounded-lg border p-3 text-sm transition-colors ${isNow ? "border-primary bg-primary/5 shadow-sm" : "hover:bg-muted/30"}`}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-medium">{s.subjects?.name ?? "—"}</span>
                                  {isNow && <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
                                </div>
                                <div className="text-xs text-muted-foreground space-y-0.5">
                                  <div className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}
                                  </div>
                                  {s.staff && (
                                    <div className="flex items-center gap-1">
                                      <User className="w-3 h-3" />
                                      {s.staff.first_name} {s.staff.last_name}
                                    </div>
                                  )}
                                  {s.room && (
                                    <div className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3" />{s.room}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ATTENDANCE TAB ───────────────────────────────────────── */}
        <TabsContent value="attendance" className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card className="text-center p-4">
              <div className="text-2xl font-bold text-emerald-600">{present}</div>
              <div className="text-xs text-muted-foreground">Present</div>
            </Card>
            <Card className="text-center p-4">
              <div className="text-2xl font-bold text-red-500">{attendance.filter(a => a.status === "absent").length}</div>
              <div className="text-xs text-muted-foreground">Absent</div>
            </Card>
            <Card className="text-center p-4">
              <div className="text-2xl font-bold text-amber-500">{attendance.filter(a => a.status === "late").length}</div>
              <div className="text-xs text-muted-foreground">Late</div>
            </Card>
          </div>
          <Card>
            <CardContent className="pt-6 space-y-4">
              {attendance.length === 0 ? (
                <p className="text-sm text-muted-foreground">No attendance records.</p>
              ) : (
                <>
                  <AttendanceHeatmap records={attendance} />
                  <div className="space-y-1 mt-4">
                    {attendance.map((a) => (
                      <div key={a.id} className="flex justify-between py-1.5 border-b text-sm">
                        <span>{a.date}</span>
                        <Badge variant={a.status === "present" ? "default" : a.status === "absent" ? "destructive" : "secondary"}>
                          {a.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── FEES TAB ─────────────────────────────────────────────── */}
        <TabsContent value="fees" className="mt-4 space-y-4">
          {totalDue > 0 && (
            <Card className="border-amber-400 bg-amber-50 dark:bg-amber-950/20">
              <CardContent className="pt-4 pb-3 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                <div className="text-sm">
                  <span className="font-semibold">Outstanding balance: KES {totalDue.toLocaleString()}</span>
                  <span className="text-muted-foreground ml-2">across {invoices.filter(i => i.status !== "paid").length} invoice(s)</span>
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="pt-6 space-y-3">
              {invoices.length === 0 && <p className="text-sm text-muted-foreground">No invoices.</p>}
              {invoices.map((i) => {
                const outstanding = Number(i.amount) - Number(i.paid);
                const paidPct = Math.round((Number(i.paid) / Number(i.amount)) * 100);
                return (
                  <div key={i.id} className="border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{i.invoice_no}</div>
                        <div className="text-xs text-muted-foreground">Due: {i.due_date ?? "—"}</div>
                      </div>
                      <Badge variant={i.status === "paid" ? "default" : i.status === "partial" ? "secondary" : "destructive"}>
                        {i.status}
                      </Badge>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>KES {Number(i.paid).toLocaleString()} paid</span>
                        <span>KES {Number(i.amount).toLocaleString()} total</span>
                      </div>
                      <Progress value={paidPct} className="h-1.5" />
                    </div>
                    {outstanding > 0 && (
                      <div className="flex justify-end">
                        <MpesaPayDialog
                          invoiceId={i.id}
                          outstanding={outstanding}
                          defaultPhone={student?.parent_phone ?? ""}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── MY DAY TAB ───────────────────────────────────────────── */}
        <TabsContent value="today" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="w-4 h-4" /> {DAYS[todayDow]}, today
              </CardTitle>
              <CardDescription>Your lessons for today</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {todaySlots.length === 0 && <p className="text-sm text-muted-foreground">No lessons scheduled today.</p>}
              {todaySlots.map((s) => {
                const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
                const isNow = toMin(s.start_time) <= nowMin && toMin(s.end_time) > nowMin;
                const isDone = toMin(s.end_time) <= nowMin;
                return (
                  <div key={s.id} className={`flex items-center justify-between border rounded-lg p-3 ${isNow ? "border-primary bg-primary/5" : isDone ? "opacity-50" : ""}`}>
                    <div>
                      <div className="font-medium">{s.subjects?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.staff ? `${s.staff.first_name} ${s.staff.last_name}` : "TBA"}
                        {s.room ? ` · ${s.room}` : ""}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-mono">{s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</div>
                      {isNow && <Badge className="mt-1 text-xs">Live now</Badge>}
                      {isDone && <span className="text-xs text-muted-foreground">Done</span>}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Utensils className="w-4 h-4" /> Today's meals</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(["breakfast", "lunch", "dinner"] as const).map((type) => {
                const m = mealFor(type);
                return (
                  <div key={type} className="border rounded-lg p-3">
                    <div className="text-xs uppercase text-muted-foreground font-medium">{type}</div>
                    <div className="text-sm mt-1">{m?.menu ?? "Not posted yet"}</div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          {nextExam && (
            <Card>
              <CardContent className="pt-5 pb-4 flex items-center gap-3">
                <ClipboardList className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <div className="font-medium">{nextExam.name}</div>
                  <div className="text-xs text-muted-foreground">{nextExam.term} {nextExam.year} · starts {nextExam.start_date}</div>
                </div>
                {daysToExam !== null && (
                  <Badge className="ml-auto" variant={daysToExam <= 3 ? "destructive" : "secondary"}>
                    {daysToExam === 0 ? "Today" : `${daysToExam}d`}
                  </Badge>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── MEALS TAB ────────────────────────────────────────────── */}
        <TabsContent value="meals" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {weekMeals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No meal plans posted for this week.</p>
              ) : (
                <div className="space-y-4">
                  {Array.from(new Set(weekMeals.map((m) => m.meal_date))).map((date) => (
                    <div key={date}>
                      <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                        {date}
                        {date === todayStr && <Badge variant="secondary">Today</Badge>}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {weekMeals.filter((m) => m.meal_date === date).map((m) => (
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CO-CURRICULAR TAB ────────────────────────────────────── */}
        <TabsContent value="cocurricular" className="mt-4">
          <Card>
            <CardContent className="pt-6 space-y-3">
              {coCurricular.length === 0 && (
                <p className="text-sm text-muted-foreground">Not enrolled in any co-curricular activities.</p>
              )}
              {coCurricular.map((c: any) => {
                const a = c.co_curricular_activities;
                const coach = c.coach?.staff;
                return (
                  <div key={c.id} className="border rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="font-medium flex items-center gap-2">
                        <Award className="w-4 h-4 text-amber-500" /> {a?.name ?? "—"}
                      </div>
                      {a?.category && <Badge variant="outline">{a.category}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-2 space-y-1">
                      {a?.schedule_day != null && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />{DAYS[a.schedule_day]} {a?.schedule_time ?? ""}
                        </div>
                      )}
                      {coach && (
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3" />Coach: {coach.first_name} {coach.last_name}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── LIBRARY TAB ──────────────────────────────────────────── */}
        <TabsContent value="library" className="mt-4">
          <Card>
            <CardContent className="pt-6 space-y-2">
              {loans.length === 0 && <p className="text-sm text-muted-foreground">No book loans.</p>}
              {loans.map((l) => (
                <div key={l.id} className="flex items-center justify-between border rounded-lg p-3 text-sm">
                  <div>
                    <div className="font-medium">{l.books?.title}</div>
                    <div className="text-xs text-muted-foreground">{l.books?.author} · borrowed {l.borrowed_on}</div>
                  </div>
                  <Badge variant={l.status === "active" ? "default" : "secondary"}>{l.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── LIVE CLASSES TAB ─────────────────────────────────────── */}
        <TabsContent value="live" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Video className="w-4 h-4" /> Upcoming & live sessions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {liveUpcoming.length === 0 && <p className="text-sm text-muted-foreground">No live classes scheduled.</p>}
              {liveUpcoming.map((s: any) => {
                const start = new Date(s.scheduled_start);
                const now = Date.now();
                const canJoin = s.status === "live" || (start.getTime() - now < 15 * 60_000 && s.status !== "ended" && s.status !== "cancelled");
                return (
                  <div key={s.id} className="flex items-center justify-between border rounded-lg p-3">
                    <div>
                      <div className="font-medium">{s.title}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {start.toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={s.status === "live" ? "default" : s.status === "ended" ? "secondary" : "outline"}>{s.status}</Badge>
                      {canJoin && (
                        <Button asChild size="sm">
                          <Link to="/live/$sessionId" params={{ sessionId: s.id }}>Join</Link>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">My attendance (recent)</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {liveAttendance.length === 0 && <p className="text-sm text-muted-foreground">No attendance yet.</p>}
              {liveAttendance.map((a: any) => (
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
          </Card>
        </TabsContent>

        {/* ── DISCIPLINE TAB ───────────────────────────────────────── */}
        <TabsContent value="discipline" className="mt-4">
          <Card>
            <CardContent className="pt-6 space-y-3">
              {discipline.length === 0 && (
                <div className="text-center py-8 space-y-2">
                  <CheckCircle className="w-10 h-10 mx-auto text-emerald-500 opacity-60" />
                  <p className="text-sm text-muted-foreground">No discipline records — keep it up!</p>
                </div>
              )}
              {discipline.map((d) => (
                <div key={d.id} className="border rounded-xl p-4">
                  <div className="flex justify-between items-start">
                    <div className="font-medium">{d.category}</div>
                    <Badge variant={d.severity === "major" ? "destructive" : "secondary"}>{d.severity}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{d.incident_date}</div>
                  <div className="text-sm mt-2">{d.description}</div>
                  {d.action_taken && <div className="text-xs text-muted-foreground mt-1 border-t pt-1">Action: {d.action_taken}</div>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CLINIC TAB ───────────────────────────────────────────── */}
        <TabsContent value="clinic" className="mt-4">
          <Card>
            <CardContent className="pt-6 space-y-3">
              {clinic.length === 0 && <p className="text-sm text-muted-foreground">No clinic visits.</p>}
              {clinic.map((c) => (
                <div key={c.id} className="border rounded-xl p-4">
                  <div className="flex justify-between items-start">
                    <div className="font-medium flex items-center gap-2">
                      <Heart className="w-4 h-4 text-red-400" /> {c.visit_date}
                    </div>
                    {c.referred_to && <Badge variant="outline">Referred: {c.referred_to}</Badge>}
                  </div>
                  <div className="text-sm mt-2 space-y-1">
                    {c.symptoms && <div><span className="text-muted-foreground text-xs">Symptoms:</span> {c.symptoms}</div>}
                    {c.diagnosis && <div><span className="text-muted-foreground text-xs">Diagnosis:</span> {c.diagnosis}</div>}
                    {c.treatment && <div><span className="text-muted-foreground text-xs">Treatment:</span> {c.treatment}</div>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── GATE PASSES TAB ──────────────────────────────────────── */}
        <TabsContent value="gate" className="mt-4">
          <Card>
            <CardContent className="pt-6 space-y-3">
              {gatePasses.length === 0 && <p className="text-sm text-muted-foreground">No gate passes on record.</p>}
              {gatePasses.map((g) => (
                <div key={g.id} className="border rounded-xl p-4">
                  <div className="flex justify-between items-start">
                    <div className="font-medium flex items-center gap-2">
                      <DoorOpen className="w-4 h-4" /> {g.reason}
                    </div>
                    <Badge variant={g.status === "out" ? "destructive" : "default"}>{g.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Out: {new Date(g.exit_time).toLocaleString()}
                    {g.actual_return && ` · Back: ${new Date(g.actual_return).toLocaleString()}`}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TRANSPORT TAB ────────────────────────────────────────── */}
        <TabsContent value="transport" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {!transport ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2"><Bus className="w-4 h-4" /> No transport route assigned.</p>
              ) : (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2 text-base font-semibold"><Bus className="w-5 h-5 text-primary" />{transport.transport_routes?.name ?? "Route"}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border rounded-lg p-3">
                      <div className="text-xs text-muted-foreground">Pickup</div>
                      <div className="font-medium">{transport.pickup_point ?? transport.transport_routes?.pickup_point ?? "—"}</div>
                    </div>
                    <div className="border rounded-lg p-3">
                      <div className="text-xs text-muted-foreground">Drop-off</div>
                      <div className="font-medium">{transport.transport_routes?.dropoff_point ?? "—"}</div>
                    </div>
                    <div className="border rounded-lg p-3">
                      <div className="text-xs text-muted-foreground">Vehicle</div>
                      <div className="font-medium">{transport.transport_routes?.vehicle_reg ?? "—"}</div>
                    </div>
                    <div className="border rounded-lg p-3">
                      <div className="text-xs text-muted-foreground">Driver</div>
                      <div className="font-medium">{transport.transport_routes?.driver_name ?? "—"}</div>
                      {transport.transport_routes?.driver_phone && (
                        <div className="text-xs text-muted-foreground">{transport.transport_routes.driver_phone}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── NEWS TAB ─────────────────────────────────────────────── */}
        <TabsContent value="news" className="mt-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              {announcements.length === 0 && <p className="text-sm text-muted-foreground">No announcements.</p>}
              {announcements.map((a) => (
                <div key={a.id} className="border rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="font-semibold">{a.title}</div>
                    {a.pinned && <Badge variant="secondary">Pinned</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">{a.body}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── DOCUMENTS TAB ────────────────────────────────────────── */}
        <TabsContent value="documents" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {documents.length === 0 ? (
                <div className="text-center text-muted-foreground py-12 space-y-2">
                  <FileText className="w-10 h-10 mx-auto opacity-30" />
                  <p>No documents uploaded yet</p>
                  <p className="text-xs">Ask your school admin to upload your documents</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((d: any) => {
                    const labels: Record<string, string> = {
                      birth_certificate: "Birth Certificate",
                      report_form: "Previous Report Form",
                      passport_photo: "Passport Photo",
                      medical_records: "Medical Records",
                      transfer_letter: "Transfer Letter",
                      national_id: "National ID",
                      parent_id: "Parent/Guardian ID",
                      other: "Other",
                    };
                    return (
                      <div key={d.id} className="flex items-center justify-between border rounded-lg p-3">
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-muted-foreground" />
                          <div>
                            <div className="text-sm font-medium">{labels[d.document_type] ?? d.document_type}</div>
                            <div className="text-xs text-muted-foreground">{d.created_at ? format(new Date(d.created_at), "dd/MM/yyyy") : ""}</div>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={async () => {
                          const { data } = await supabase.storage.from("student-documents").createSignedUrl(d.file_path, 60);
                          if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                        }}>
                          <ExternalLink className="w-4 h-4 mr-1" /> Open
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function SummaryCard({
  icon, label, value, sub, color, trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: "indigo" | "violet" | "emerald" | "amber" | "red" | "blue";
  trend?: number;
}) {
  const colorMap = {
    indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/30",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/30",
    red: "bg-red-50 text-red-600 dark:bg-red-950/30",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/30",
  };
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className={`p-2 rounded-lg ${colorMap[color]}`}>{icon}</div>
          {trend !== undefined && trend !== 0 && <TrendBadge diff={trend} />}
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold tracking-tight">{value}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
          {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function InsightCard({
  icon, title, value, detail, color,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  detail: string;
  color: string;
}) {
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="pt-4 pb-4 flex items-start gap-3">
        <div className="shrink-0 mt-0.5">{icon}</div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{title}</div>
          <div className="font-semibold text-sm mt-0.5 truncate">{value}</div>
          <div className="text-xs text-muted-foreground">{detail}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function RecommendationItem({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border">
      <div className="shrink-0 mt-0.5 text-muted-foreground">{icon}</div>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
