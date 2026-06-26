import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download } from "lucide-react";
import { AnimatedNumber } from "@/components/portal-shared";
import { fadeUp, stagger } from "@/components/motion-variants";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell, Legend,
} from "recharts";

export interface AcademicAnalyticsPanelProps {
  /** Restrict results to these student IDs (teacher scope). Omit for full-school view. */
  studentIds?: string[];
  /** Restrict results to these subject IDs (teacher scope). Omit for full-school view. */
  subjectIds?: string[];
  /** When true, scope is applied even if the ID arrays are empty (means "no access"). */
  scoped?: boolean;
}

const GRADE_COLORS: Record<string, string> = {
  "A": "#16a34a", "A-": "#22c55e",
  "B+": "#2563eb", "B": "#3b82f6",
  "C+": "#d97706", "C": "#f59e0b",
  "D+": "#dc2626", "D": "#ef4444",
  "E": "#7c3aed",
};

function fallbackGrade(s: number) {
  if (s >= 80) return "A";  if (s >= 75) return "A-"; if (s >= 70) return "B+";
  if (s >= 65) return "B";  if (s >= 60) return "B-"; if (s >= 55) return "C+";
  if (s >= 50) return "C";  if (s >= 45) return "C-"; if (s >= 40) return "D+";
  if (s >= 35) return "D";  if (s >= 30) return "D-"; return "E";
}

export function AcademicAnalyticsPanel({ studentIds, subjectIds, scoped = false }: AcademicAnalyticsPanelProps = {}) {
  // Load exam results with class + subject join (latest 2000), optionally scoped to a teacher's classes/subjects
  const { data: results = [], isLoading } = useQuery({
    queryKey: ["academic-analytics-results", scoped, studentIds?.join(","), subjectIds?.join(",")],
    enabled: !scoped || (!!studentIds && !!subjectIds),
    queryFn: async () => {
      if (scoped && (studentIds?.length === 0 || subjectIds?.length === 0)) return [];
      let q = supabase
        .from("exam_results")
        .select(
          "score,grade,student_id,subject_id,exam_id," +
          "subjects(name,code)," +
          "students(first_name,last_name,class_id,classes(name,stream))," +
          "exams(name,term,year)"
        )
        .order("created_at", { ascending: false })
        .limit(2000);
      if (scoped && studentIds && subjectIds) {
        q = q.in("student_id", studentIds).in("subject_id", subjectIds);
      }
      const { data } = await q;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  // ── Filters (computed from what's actually in the loaded data) ─────────
  const [filterExam, setFilterExam] = useState("all");
  const [filterClass, setFilterClass] = useState("all");
  const [filterSubject, setFilterSubject] = useState("all");
  const [filterGender, setFilterGender] = useState("all");

  const examOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of results as any[]) {
      const key = `${r.exams?.term ?? ""} ${r.exams?.year ?? ""}`.trim();
      if (key && key !== "") map.set(key, key);
    }
    return Array.from(map.keys()).sort();
  }, [results]);

  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of results as any[]) {
      const cid = (r.students as any)?.class_id;
      if (!cid) continue;
      const name = (r.students as any)?.classes?.name
        ? `${(r.students as any).classes.name}${(r.students as any).classes.stream ? " " + (r.students as any).classes.stream : ""}`
        : "Unknown";
      map.set(cid, name);
    }
    return Array.from(map.entries());
  }, [results]);

  const subjectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of results as any[]) {
      if (r.subject_id) map.set(r.subject_id, r.subjects?.name ?? r.subject_id);
    }
    return Array.from(map.entries());
  }, [results]);

  const filtered = useMemo(() => {
    return (results as any[]).filter((r) => {
      if (filterExam !== "all") {
        const key = `${r.exams?.term ?? ""} ${r.exams?.year ?? ""}`.trim();
        if (key !== filterExam) return false;
      }
      if (filterClass !== "all" && (r.students as any)?.class_id !== filterClass) return false;
      if (filterSubject !== "all" && r.subject_id !== filterSubject) return false;
      if (filterGender !== "all" && (r.students as any)?.gender !== filterGender) return false;
      return true;
    });
  }, [results, filterExam, filterClass, filterSubject, filterGender]);

  const hasActiveFilters = filterExam !== "all" || filterClass !== "all" || filterSubject !== "all" || filterGender !== "all";

  // ── CSV export of the currently filtered results ───────────────────────
  function exportCsv() {
    const headers = ["Student", "Admission No", "Class", "Exam", "Subject", "Score", "Grade"];
    const rows = filtered.map((r: any) => [
      `${r.students?.first_name ?? ""} ${r.students?.last_name ?? ""}`.trim(),
      r.students?.admission_no ?? "",
      (r.students as any)?.classes?.name
        ? `${(r.students as any).classes.name}${(r.students as any).classes.stream ? " " + (r.students as any).classes.stream : ""}`
        : "",
      `${r.exams?.name ?? ""} ${r.exams?.term ?? ""} ${r.exams?.year ?? ""}`.trim(),
      r.subjects?.name ?? "",
      r.score,
      r.grade ?? fallbackGrade(Number(r.score)),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `academic-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Subject averages ─────────────────────────────────────────────────
  const subjectAverages = useMemo(() => {
    const map = new Map<string, { id: string; name: string; total: number; count: number }>();
    for (const r of filtered as any[]) {
      const id   = r.subject_id;
      const name = r.subjects?.name ?? id;
      if (!map.has(id)) map.set(id, { id, name, total: 0, count: 0 });
      const e = map.get(id)!;
      e.total += Number(r.score);
      e.count++;
    }
    return Array.from(map.values())
      .map((s) => ({ id: s.id, fullName: s.name, name: s.name.length > 14 ? s.name.slice(0, 14) + "…" : s.name, avg: Math.round(s.total / s.count), count: s.count }))
      .sort((a, b) => b.avg - a.avg);
  }, [filtered]);

  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);

  // ── Selected subject drill-down ────────────────────────────────────────
  const subjectDetail = useMemo(() => {
    if (!selectedSubjectId) return null;
    const rows = (filtered as any[]).filter((r) => r.subject_id === selectedSubjectId);
    if (!rows.length) return null;

    const meta = subjectAverages.find((s) => s.id === selectedSubjectId);

    // Trend by exam (chronological by exam name/term/year as they appear, best-effort)
    const examMap = new Map<string, { total: number; count: number }>();
    for (const r of rows) {
      const key = `${r.exams?.term ?? ""} ${r.exams?.year ?? ""}`.trim() || r.exams?.name || "Exam";
      if (!examMap.has(key)) examMap.set(key, { total: 0, count: 0 });
      const e = examMap.get(key)!;
      e.total += Number(r.score);
      e.count++;
    }
    const trend = Array.from(examMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([exam, v]) => ({ exam, avg: Math.round(v.total / v.count) }));

    // Grade distribution for this subject
    const gradeBuckets: Record<string, number> = {};
    for (const r of rows) {
      const g = r.grade ?? fallbackGrade(Number(r.score));
      gradeBuckets[g] = (gradeBuckets[g] ?? 0) + 1;
    }
    const gradeDist = Object.entries(gradeBuckets)
      .map(([grade, count]) => ({ grade, count }))
      .sort((a, b) => b.count - a.count);

    // Highest / lowest students for this subject
    const byScore = [...rows].sort((a, b) => Number(b.score) - Number(a.score));
    const top = byScore[0];
    const bottom = byScore[byScore.length - 1];
    const nameOf = (r: any) => `${r.students?.first_name ?? ""} ${r.students?.last_name ?? ""}`.trim() || "—";

    const avg = Math.round(rows.reduce((a, r) => a + Number(r.score), 0) / rows.length);
    const passRate = Math.round(rows.filter((r) => Number(r.score) >= 40).length / rows.length * 100);

    return {
      name: meta?.fullName ?? "Subject",
      avg, passRate, count: rows.length,
      trend, gradeDist,
      topName: nameOf(top), topScore: Number(top.score),
      bottomName: nameOf(bottom), bottomScore: Number(bottom.score),
    };
  }, [selectedSubjectId, results, subjectAverages]);

  // ── Class rankings ────────────────────────────────────────────────────
  const classRankings = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    for (const r of results as any[]) {
      const cid  = (r.students as any)?.class_id ?? "unknown";
      const name = (r.students as any)?.classes?.name
        ? `${(r.students as any).classes.name}${(r.students as any).classes.stream ? " " + (r.students as any).classes.stream : ""}`
        : "Unknown";
      if (!map.has(cid)) map.set(cid, { name, total: 0, count: 0 });
      const e = map.get(cid)!;
      e.total += Number(r.score);
      e.count++;
    }
    return Array.from(map.values())
      .map((c) => ({ name: c.name, avg: Math.round(c.total / c.count) }))
      .sort((a, b) => b.avg - a.avg);
  }, [results]);

  // ── Academic health score (school-wide) ──────────────────────────────
  const healthScore = useMemo(() => {
    if (!results.length) return null;
    const overall = results.reduce((a, r) => a + Number((r as any).score), 0) / results.length;
    const passRate = results.filter((r) => Number((r as any).score) >= 40).length / results.length;
    const aRate    = results.filter((r) => Number((r as any).score) >= 70).length / results.length;
    return Math.round(overall * 0.5 + passRate * 100 * 0.3 + aRate * 100 * 0.2);
  }, [results]);

  // ── At-risk students ──────────────────────────────────────────────────
  const atRiskStudents = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    for (const r of results as any[]) {
      const id   = r.student_id;
      const name = `${r.students?.first_name ?? ""} ${r.students?.last_name ?? ""}`.trim();
      if (!map.has(id)) map.set(id, { name, total: 0, count: 0 });
      const s = map.get(id)!;
      s.total += Number(r.score);
      s.count++;
    }
    return Array.from(map.values())
      .map((s) => ({ ...s, avg: Math.round(s.total / s.count) }))
      .filter((s) => s.avg < 40)
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 12);
  }, [results]);

  // ── Term trend (school-wide avg by term) ─────────────────────────────
  const termTrend = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const r of results as any[]) {
      const key = `${r.exams?.year ?? ""} ${r.exams?.term ?? ""}`.trim();
      if (!key || key === " ") continue;
      if (!map.has(key)) map.set(key, { total: 0, count: 0 });
      const e = map.get(key)!;
      e.total += Number(r.score);
      e.count++;
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([term, v]) => ({ term, avg: Math.round(v.total / v.count) }));
  }, [results]);

  const overallAvg = useMemo(() =>
    results.length ? Math.round(results.reduce((a, r) => a + Number((r as any).score), 0) / results.length) : null,
    [results]
  );
  const passRate = useMemo(() =>
    results.length ? Math.round(results.filter((r) => Number((r as any).score) >= 40).length / results.length * 100) : null,
    [results]
  );

  if (isLoading) return <div className="h-48 grid place-items-center text-sm text-muted-foreground">Loading analytics...</div>;
  if (!results.length) return <div className="h-48 grid place-items-center text-sm text-muted-foreground">No results data yet.</div>;

  return (
    <div className="space-y-6">

      {/* KPI row */}
      <motion.div
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        {[
          { label: "School Average",    num: overallAvg,             suffix: "%",     icon: "fa-chart-simple",          color: "text-indigo-600" },
          { label: "School Health",     num: healthScore,            suffix: "/100",  icon: "fa-heart-pulse",           color: "text-emerald-600" },
          { label: "Pass Rate",         num: passRate,                suffix: "%",     icon: "fa-circle-check",          color: passRate !== null && passRate >= 70 ? "text-emerald-600" : "text-amber-600" },
          { label: "At-Risk Students",  num: atRiskStudents.length,  suffix: "",      icon: "fa-triangle-exclamation",  color: "text-red-500" },
        ].map(({ label, num, suffix, icon, color }) => (
          <motion.div key={label} variants={fadeUp} whileHover={{ y: -2 }}>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-muted/50 ${color}`}>
                  <i className={`fa-solid ${icon}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-bold">
                    {num !== null ? <AnimatedNumber value={num} /> : "—"}{num !== null ? suffix : ""}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Subject performance */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm flex items-center gap-2">
              <i className="fa-solid fa-book text-primary" /> Subject Performance
              <span className="ml-auto text-[10px] font-normal text-muted-foreground">Click a bar to drill in</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={subjectAverages.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={90} />
                <Tooltip formatter={(v: any) => [`${v}%`, "Average"]} />
                <Bar
                  dataKey="avg" radius={[0, 3, 3, 0]} fill="#6366f1" cursor="pointer"
                  label={{ position: "right", fontSize: 9, formatter: (v: any) => `${v}%` }}
                  onClick={(d: any) => setSelectedSubjectId(d.id === selectedSubjectId ? null : d.id)}
                >
                  {subjectAverages.slice(0, 10).map((s) => (
                    <Cell key={s.id} fill={s.id === selectedSubjectId ? "#4338ca" : "#6366f1"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Class rankings */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm flex items-center gap-2">
              <i className="fa-solid fa-ranking-star text-primary" /> Class Rankings
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {classRankings.slice(0, 8).map((c, i) => (
              <div key={c.name} className="flex items-center gap-3 text-sm">
                <span className={`text-xs font-bold w-5 text-center ${i === 0 ? "text-amber-500" : i === 1 ? "text-gray-400" : i === 2 ? "text-amber-700" : "text-muted-foreground"}`}>
                  {i + 1}
                </span>
                <span className="flex-1 text-xs truncate">{c.name}</span>
                <Progress value={c.avg} max={100} className="w-24 h-2" />
                <span className="w-10 text-right text-xs font-semibold">{c.avg}%</span>
                <span className={`text-xs font-bold w-6 ${c.avg >= 70 ? "text-emerald-600" : c.avg >= 50 ? "text-amber-600" : "text-red-500"}`}>
                  {fallbackGrade(c.avg)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Subject drill-down */}
      {subjectDetail && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.25 }}>
          <Card className="border-primary/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <i className="fa-solid fa-magnifying-glass-chart text-primary" /> {subjectDetail.name} — Deep Dive
                <button
                  className="ml-auto text-[10px] text-muted-foreground hover:text-foreground underline"
                  onClick={() => setSelectedSubjectId(null)}
                >
                  Close
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Average", value: `${subjectDetail.avg}%` },
                  { label: "Pass Rate", value: `${subjectDetail.passRate}%` },
                  { label: "Entries", value: String(subjectDetail.count) },
                  { label: "Grade", value: fallbackGrade(subjectDetail.avg) },
                ].map((k) => (
                  <div key={k.label} className="rounded-lg bg-muted/40 p-2.5 text-center">
                    <p className="text-[10px] text-muted-foreground">{k.label}</p>
                    <p className="text-base font-bold">{k.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                  <i className="fa-solid fa-trophy text-emerald-600" />
                  <span className="flex-1 truncate text-xs">{subjectDetail.topName}</span>
                  <span className="font-bold text-emerald-600 text-xs">{subjectDetail.topScore}%</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                  <i className="fa-solid fa-triangle-exclamation text-amber-600" />
                  <span className="flex-1 truncate text-xs">{subjectDetail.bottomName}</span>
                  <span className="font-bold text-amber-600 text-xs">{subjectDetail.bottomScore}%</span>
                </div>
              </div>

              {subjectDetail.trend.length >= 2 && (
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={subjectDetail.trend} margin={{ top: 4, right: 20, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                    <XAxis dataKey="exam" tick={{ fontSize: 9 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                    <Tooltip formatter={(v: any) => [`${v}%`, "Average"]} />
                    <Line type="monotone" dataKey="avg" stroke="#4338ca" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}

              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={subjectDetail.gradeDist} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                  <XAxis dataKey="grade" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]} name="Students">
                    {subjectDetail.gradeDist.map((d, i) => (
                      <Cell key={i} fill={GRADE_COLORS[d.grade] ?? "#6366f1"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Term trend */}
      {termTrend.length >= 2 && (
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm flex items-center gap-2">
              <i className="fa-solid fa-chart-line text-primary" /> School Performance Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={termTrend} margin={{ top: 4, right: 20, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="term" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => [`${v}%`, "School Average"]} />
                <Line type="monotone" dataKey="avg" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* At-risk students */}
      {atRiskStudents.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-destructive">
              <i className="fa-solid fa-triangle-exclamation" /> Students Requiring Intervention
              <Badge variant="destructive" className="ml-auto">{atRiskStudents.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {atRiskStudents.map((s, i) => (
              <div key={i} className="flex items-center gap-3 text-sm p-2 rounded bg-destructive/5 border border-destructive/10">
                <span className="flex-1 font-medium text-xs">{s.name}</span>
                <Progress value={s.avg} max={100} className="w-20 h-1.5" />
                <span className="font-bold text-destructive text-xs w-8 text-right">{s.avg}%</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
