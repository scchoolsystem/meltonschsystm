import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  ReferenceLine,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExamResult {
  id: string;
  score: number;
  grade?: string | null;
  remarks?: string | null;
  verified?: boolean;
  exam_id: string;
  subject_id: string;
  subjects?: { name: string; code?: string | null } | null;
  exams?: { name: string; term?: string | null; year?: string | null } | null;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  status: "present" | "absent" | "late" | string;
}

export interface PerformanceCenterProps {
  results: ExamResult[];
  attendance: AttendanceRecord[];
  /** Subject class averages keyed by subjectId */
  classAverages?: Record<string, number>;
  schoolName?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function gradeLabel(score: number): { grade: string; color: string } {
  if (score >= 80) return { grade: "A",  color: "#22c55e" };
  if (score >= 70) return { grade: "B+", color: "#84cc16" };
  if (score >= 60) return { grade: "B",  color: "#eab308" };
  if (score >= 50) return { grade: "C+", color: "#f97316" };
  if (score >= 40) return { grade: "C",  color: "#ef4444" };
  return              { grade: "D",  color: "#dc2626" };
}

function ordinal(n: number) {
  const s = ["th","st","nd","rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

const CHART_COLORS = ["#6366f1","#22c55e","#f97316","#06b6d4","#ec4899","#eab308","#8b5cf6","#14b8a6"];

// ── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  icon, label, value, sub, color = "indigo", trend,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  color?: string; trend?: number;
}) {
  const colors: Record<string, string> = {
    indigo: "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400",
    emerald: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400",
    amber:   "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400",
    red:     "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400",
    violet:  "bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400",
    blue:    "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400",
  };
  const cls = colors[color] ?? colors.indigo;
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`p-2 rounded-lg shrink-0 ${cls}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-xl font-bold mt-0.5 leading-none">{value}</p>
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
  );
}

function TrendIndicator({ value }: { value: number }) {
  if (value > 2)  return <span className="text-emerald-600 text-xs font-semibold flex items-center gap-0.5"><i className="fa-solid fa-arrow-trend-up" /> +{value.toFixed(1)}</span>;
  if (value < -2) return <span className="text-red-500 text-xs font-semibold flex items-center gap-0.5"><i className="fa-solid fa-arrow-trend-down" /> {value.toFixed(1)}</span>;
  return <span className="text-muted-foreground text-xs"><i className="fa-solid fa-minus" /> Stable</span>;
}

// ── Main export ──────────────────────────────────────────────────────────────

export function StudentPerformanceCenter({
  results,
  attendance,
  classAverages = {},
}: PerformanceCenterProps) {

  // ── Attendance stats ────────────────────────────────────────────────────
  const present = useMemo(() => attendance.filter((a) => a.status === "present").length, [attendance]);
  const attRate = useMemo(() => attendance.length ? Math.round((present / attendance.length) * 100) : 0, [attendance, present]);

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
      .map(([month, v]) => ({ month: month.slice(5), rate: Math.round((v.present / v.total) * 100) }));
  }, [attendance]);

  // ── Per-subject analytics ───────────────────────────────────────────────
  const subjectAnalytics = useMemo(() => {
    const map = new Map<string, {
      id: string; name: string; code?: string | null;
      scores: number[]; exams: string[];
    }>();
    for (const r of [...results].reverse()) {          // oldest first so index 0 = oldest
      const id = r.subject_id ?? r.subjects?.name ?? "unknown";
      if (!map.has(id)) map.set(id, { id, name: r.subjects?.name ?? "Unknown", code: r.subjects?.code, scores: [], exams: [] });
      map.get(id)!.scores.push(Number(r.score || 0));
      map.get(id)!.exams.push(r.exams?.name ?? "");
    }
    return Array.from(map.values()).map((s) => {
      const latest  = s.scores[s.scores.length - 1] ?? 0;
      const prev    = s.scores.length >= 2 ? s.scores[s.scores.length - 2] : null;
      const avg     = Math.round(s.scores.reduce((a, b) => a + b, 0) / (s.scores.length || 1));
      const diff    = prev !== null ? latest - prev : 0;
      const trend   = diff > 2 ? "up" : diff < -2 ? "down" : "stable";
      const classAvg = classAverages[s.id] ?? null;
      const vsClass  = classAvg !== null ? latest - classAvg : null;
      const impPct   = prev !== null && prev > 0 ? Math.round(((latest - prev) / prev) * 100) : 0;
      return { ...s, latest, prev, avg, diff, trend, classAvg, vsClass, impPct };
    }).sort((a, b) => b.latest - a.latest);
  }, [results, classAverages]);

  const bestSubject    = subjectAnalytics[0] ?? null;
  const weakestSubject = subjectAnalytics[subjectAnalytics.length - 1] ?? null;
  const mostImproved   = useMemo(() =>
    [...subjectAnalytics].sort((a, b) => b.diff - a.diff)[0] ?? null,
    [subjectAnalytics]
  );

  // ── Exam trend (overall avg per exam) ──────────────────────────────────
  const examTrend = useMemo(() => {
    const examMap = new Map<string, { name: string; total: number; count: number }>();
    for (const r of results) {
      const key = r.exam_id ?? r.exams?.name;
      if (!key) continue;
      if (!examMap.has(key)) examMap.set(key, { name: r.exams?.name ?? "Exam", total: 0, count: 0 });
      const e = examMap.get(key)!;
      e.total += Number(r.score || 0);
      e.count++;
    }
    return Array.from(examMap.values())
      .map((e) => ({ name: e.name, avg: Math.round(e.total / e.count) }))
      .slice(-8);
  }, [results]);

  const currentAvg  = examTrend.length ? examTrend[examTrend.length - 1].avg : null;
  const previousAvg = examTrend.length >= 2 ? examTrend[examTrend.length - 2].avg : null;
  const perfChange  = currentAvg !== null && previousAvg !== null ? currentAvg - previousAvg : 0;

  // ── Exam readiness ─────────────────────────────────────────────────────
  const readiness = currentAvg !== null
    ? Math.round(
        Math.min(currentAvg / 100, 1) * 50 +
        Math.min(attRate / 100, 1) * 30 +
        Math.min(Math.max((perfChange + 20) / 40, 0), 1) * 20
      )
    : null;

  // ── Radar chart data (subject performance) ─────────────────────────────
  const radarData = subjectAnalytics.slice(0, 8).map((s) => ({
    subject: s.name.length > 10 ? s.name.slice(0, 10) + "…" : s.name,
    score: s.latest,
    classAvg: s.classAvg ?? undefined,
  }));

  if (!results.length) {
    return (
      <div className="rounded-xl border p-10 text-center text-muted-foreground text-sm">
        <i className="fa-solid fa-chart-line text-3xl mb-3 block opacity-30" />
        No results recorded yet. Check back after exam marks are entered.
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Top KPI cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          icon={<i className="fa-solid fa-percent" />}
          label="Current Average"
          value={currentAvg !== null ? `${currentAvg}%` : "—"}
          sub={`Previously ${previousAvg ?? "—"}%`}
          color="indigo"
          trend={perfChange}
        />
        <MetricCard
          icon={<i className="fa-solid fa-graduation-cap" />}
          label="Current Grade"
          value={currentAvg !== null ? gradeLabel(currentAvg).grade : "—"}
          sub="Overall grade"
          color="violet"
        />
        <MetricCard
          icon={<i className="fa-solid fa-person-chalkboard" />}
          label="Attendance Rate"
          value={`${attRate}%`}
          sub={`${present} / ${attendance.length} days`}
          color={attRate >= 90 ? "emerald" : attRate >= 75 ? "amber" : "red"}
        />
        <MetricCard
          icon={<i className="fa-solid fa-bolt" />}
          label="Exam Readiness"
          value={readiness !== null ? `${readiness}/100` : "—"}
          sub="Composite score"
          color={readiness && readiness >= 70 ? "emerald" : readiness && readiness >= 50 ? "amber" : "red"}
        />
      </div>

      {/* ── Highlights row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {bestSubject && (
          <div className="rounded-xl border p-4 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
            <div className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold uppercase tracking-wide flex items-center gap-1.5">
              <i className="fa-solid fa-star" /> Best Subject
            </div>
            <div className="font-bold text-lg mt-1 text-emerald-800 dark:text-emerald-200">{bestSubject.name}</div>
            <div className="text-sm text-emerald-700 dark:text-emerald-400">{bestSubject.latest}% — {gradeLabel(bestSubject.latest).grade}</div>
          </div>
        )}
        {weakestSubject && weakestSubject.id !== bestSubject?.id && (
          <div className="rounded-xl border p-4 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800">
            <div className="text-xs text-red-700 dark:text-red-400 font-semibold uppercase tracking-wide flex items-center gap-1.5">
              <i className="fa-solid fa-circle-exclamation" /> Needs Attention
            </div>
            <div className="font-bold text-lg mt-1 text-red-800 dark:text-red-200">{weakestSubject.name}</div>
            <div className="text-sm text-red-700 dark:text-red-400">{weakestSubject.latest}% — {gradeLabel(weakestSubject.latest).grade}</div>
          </div>
        )}
        {mostImproved && mostImproved.diff > 0 && (
          <div className="rounded-xl border p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
            <div className="text-xs text-blue-700 dark:text-blue-400 font-semibold uppercase tracking-wide flex items-center gap-1.5">
              <i className="fa-solid fa-arrow-trend-up" /> Most Improved
            </div>
            <div className="font-bold text-lg mt-1 text-blue-800 dark:text-blue-200">{mostImproved.name}</div>
            <div className="text-sm text-blue-700 dark:text-blue-400">+{mostImproved.diff.toFixed(1)} pts from last exam</div>
          </div>
        )}
      </div>

      {/* ── Charts row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Performance timeline */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <i className="fa-solid fa-chart-line text-primary" /> Performance Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {examTrend.length >= 2 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={examTrend} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => [`${v}%`, "Average"]} />
                  <ReferenceLine y={50} stroke="#ef4444" strokeDasharray="4 2" strokeOpacity={0.5} label={{ value: "50%", fontSize: 9, fill: "#ef4444" }} />
                  <Line type="monotone" dataKey="avg" stroke="#6366f1" strokeWidth={2.5}
                    dot={{ r: 4, fill: "#6366f1" }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground py-8 text-center">Need at least 2 exams for a trend line.</p>
            )}
          </CardContent>
        </Card>

        {/* Subject radar */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <i className="fa-solid fa-spider text-primary" /> Subject Radar
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {radarData.length >= 3 ? (
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={radarData} margin={{ top: 8, right: 24, left: 24, bottom: 0 }}>
                  <PolarGrid strokeOpacity={0.3} />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 8 }} />
                  <Radar name="Score" dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} />
                  {radarData.some((d) => d.classAvg !== undefined) && (
                    <Radar name="Class Avg" dataKey="classAvg" stroke="#f97316" fill="#f97316" fillOpacity={0.1} strokeDasharray="4 2" />
                  )}
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground py-8 text-center">Need at least 3 subjects for a radar chart.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Subject breakdown table ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <i className="fa-solid fa-table-list text-primary" /> Subject-by-Subject Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
                <th className="text-left py-2 pr-4">Subject</th>
                <th className="text-right py-2 px-3">Latest</th>
                <th className="text-right py-2 px-3">Previous</th>
                <th className="text-center py-2 px-3">Change</th>
                {Object.keys(classAverages).length > 0 && <th className="text-right py-2 px-3">Class Avg</th>}
                <th className="text-center py-2 px-3">Grade</th>
                <th className="text-left py-2 pl-3">Progress</th>
              </tr>
            </thead>
            <tbody>
              {subjectAnalytics.map((s, i) => {
                const { grade, color } = gradeLabel(s.latest);
                return (
                  <tr key={s.id} className={`border-b last:border-0 ${i % 2 === 0 ? "bg-muted/20" : ""}`}>
                    <td className="py-2 pr-4 font-medium">
                      {s.name}
                      {s.code && <span className="ml-1.5 text-xs text-muted-foreground">{s.code}</span>}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold">{s.latest}%</td>
                    <td className="py-2 px-3 text-right text-muted-foreground">{s.prev !== null ? `${s.prev}%` : "—"}</td>
                    <td className="py-2 px-3 text-center"><TrendIndicator value={s.diff} /></td>
                    {Object.keys(classAverages).length > 0 && (
                      <td className="py-2 px-3 text-right">
                        {s.classAvg !== null ? (
                          <span>
                            {s.classAvg?.toFixed(0)}%
                            {s.vsClass !== null && (
                              <span className={`ml-1 text-xs ${s.vsClass! >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                ({s.vsClass! >= 0 ? "+" : ""}{s.vsClass!.toFixed(1)})
                              </span>
                            )}
                          </span>
                        ) : "—"}
                      </td>
                    )}
                    <td className="py-2 px-3 text-center">
                      <span className="font-bold text-base" style={{ color }}>{grade}</span>
                    </td>
                    <td className="py-2 pl-3 w-28">
                      <Progress value={s.latest} max={100} className="h-1.5" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ── Attendance trend ─────────────────────────────────────────────── */}
      {attendanceTrend.length >= 2 && (
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <i className="fa-solid fa-calendar-check text-primary" /> Attendance Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={attendanceTrend} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => [`${v}%`, "Attendance"]} />
                <ReferenceLine y={75} stroke="#f97316" strokeDasharray="4 2" strokeOpacity={0.6} />
                {attendanceTrend.map((_, i) => null)}
                <Bar dataKey="rate" radius={[3, 3, 0, 0]}>
                  {attendanceTrend.map((entry, i) => (
                    <Cell key={i} fill={entry.rate >= 90 ? "#22c55e" : entry.rate >= 75 ? "#eab308" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
