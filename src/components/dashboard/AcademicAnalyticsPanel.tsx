import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell, Legend,
} from "recharts";

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

export function AcademicAnalyticsPanel() {
  // Load all exam results with class + subject join (latest 2000)
  const { data: results = [], isLoading } = useQuery({
    queryKey: ["academic-analytics-results"],
    queryFn: async () => {
      const { data } = await supabase
        .from("exam_results")
        .select(
          "score,grade,student_id,subject_id,exam_id," +
          "subjects(name,code)," +
          "students(first_name,last_name,class_id,classes(name,stream))," +
          "exams(name,term,year)"
        )
        .order("created_at", { ascending: false })
        .limit(2000);
      return data ?? [];
    },
    staleTime: 60_000,
  });

  // ── Subject averages ─────────────────────────────────────────────────
  const subjectAverages = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    for (const r of results as any[]) {
      const id   = r.subject_id;
      const name = r.subjects?.name ?? id;
      if (!map.has(id)) map.set(id, { name, total: 0, count: 0 });
      const e = map.get(id)!;
      e.total += Number(r.score);
      e.count++;
    }
    return Array.from(map.values())
      .map((s) => ({ name: s.name.length > 14 ? s.name.slice(0, 14) + "…" : s.name, avg: Math.round(s.total / s.count), count: s.count }))
      .sort((a, b) => b.avg - a.avg);
  }, [results]);

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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "School Average",    value: overallAvg !== null ? `${overallAvg}%` : "—", icon: "fa-chart-simple",    color: "text-indigo-600" },
          { label: "School Health",     value: healthScore !== null ? `${healthScore}/100` : "—", icon: "fa-heart-pulse", color: "text-emerald-600" },
          { label: "Pass Rate",         value: passRate !== null ? `${passRate}%` : "—", icon: "fa-circle-check",         color: passRate !== null && passRate >= 70 ? "text-emerald-600" : "text-amber-600" },
          { label: "At-Risk Students",  value: String(atRiskStudents.length), icon: "fa-triangle-exclamation",            color: "text-red-500" },
        ].map(({ label, value, icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted/50 ${color}`}>
                <i className={`fa-solid ${icon}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-bold">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Subject performance */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm flex items-center gap-2">
              <i className="fa-solid fa-book text-primary" /> Subject Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={subjectAverages.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={90} />
                <Tooltip formatter={(v: any) => [`${v}%`, "Average"]} />
                <Bar dataKey="avg" radius={[0, 3, 3, 0]} fill="#6366f1" label={{ position: "right", fontSize: 9, formatter: (v: any) => `${v}%` }} />
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
