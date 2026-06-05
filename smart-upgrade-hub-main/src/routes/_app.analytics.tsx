import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import { TrendingUp, AlertTriangle, Users, Wallet, GraduationCap, Sparkles, Activity } from "lucide-react";

export const Route = createFileRoute("/_app/analytics")({ component: Analytics });

const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "#f59e0b", "#ef4444", "#10b981", "#6366f1"];

function Analytics() {
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
        students: students.count ?? 0,
        staff: staff.count ?? 0,
        totalInvoiced: Number(f.total_invoiced ?? 0),
        totalPaid: Number(f.total_paid ?? 0),
        collection: Number(f.collection_pct ?? 0),
        defaulters: Number(f.defaulters ?? 0),
        attendance: attendance.data ?? [],
        genders: students.data ?? [],
      };
    },
  });

  const { data: subjectAvg = [] } = useQuery({
    queryKey: ["analytics-subject-means"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("v_subject_means")
        .select("subject_code,mean_score").order("mean_score", { ascending: false });
      return (data ?? []).map((r: any) => ({ code: r.subject_code ?? "—", mean: Number(r.mean_score) }));
    },
  });

  const { data: weakStudents = [] } = useQuery({
    queryKey: ["analytics-weak"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("v_weak_students")
        .select("student_id,admission_no,first_name,last_name,mean_score")
        .order("mean_score", { ascending: true }).limit(10);
      return (data ?? []).map((r: any) => ({
        id: r.student_id, name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
        admno: r.admission_no ?? "", mean: Number(r.mean_score),
      }));
    },
  });

  // 4 weeks attendance heatmap data
  const { data: heatmap = [] } = useQuery({
    queryKey: ["analytics-att-heatmap"],
    queryFn: async () => {
      const since = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10);
      const { data } = await (supabase as any).from("v_attendance_daily")
        .select("date,present,total").gte("date", since).order("date");
      return data ?? [];
    },
  });

  // Finance trend - last 6 months payments
  const { data: financeTrend = [] } = useQuery({
    queryKey: ["analytics-finance-trend"],
    queryFn: async () => {
      const since = new Date();
      since.setMonth(since.getMonth() - 6);
      const sinceStr = since.toISOString().slice(0, 10);
      const [pays, invs] = await Promise.all([
        (supabase as any).from("payments").select("amount, created_at").gte("created_at", sinceStr),
        supabase.from("invoices").select("amount, created_at").gte("created_at", sinceStr),
      ]);
      const buckets = new Map<string, { month: string; collected: number; invoiced: number }>();
      const ensureBucket = (k: string) => {
        if (!buckets.has(k)) buckets.set(k, { month: k, collected: 0, invoiced: 0 });
        return buckets.get(k)!;
      };
      (pays.data ?? []).forEach((p: any) => {
        const m = p.created_at?.slice(0, 7); if (!m) return;
        ensureBucket(m).collected += Number(p.amount ?? 0);
      });
      (invs.data ?? []).forEach((i: any) => {
        const m = i.created_at?.slice(0, 7); if (!m) return;
        ensureBucket(m).invoiced += Number(i.amount ?? 0);
      });
      return Array.from(buckets.values()).sort((a, b) => a.month.localeCompare(b.month));
    },
  });

  // Class performance comparison
  const { data: classPerf = [] } = useQuery({
    queryKey: ["analytics-class-perf"],
    queryFn: async () => {
      const { data: results } = await (supabase as any).from("exam_results")
        .select("score, students(class_id, classes(name))");
      const map = new Map<string, { className: string; sum: number; count: number }>();
      (results ?? []).forEach((r: any) => {
        const cls = r.students?.classes?.name ?? "—";
        const cur = map.get(cls) ?? { className: cls, sum: 0, count: 0 };
        cur.sum += Number(r.score ?? 0); cur.count++;
        map.set(cls, cur);
      });
      return Array.from(map.values()).map((c) => ({
        className: c.className, mean: c.count ? Math.round((c.sum / c.count) * 10) / 10 : 0,
      })).sort((a, b) => b.mean - a.mean);
    },
  });

  // At-risk students (low attendance OR low mean)
  const { data: atRisk = [] } = useQuery({
    queryKey: ["analytics-at-risk"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const [att, weak] = await Promise.all([
        (supabase as any).from("attendance_records")
          .select("student_id, status, students(first_name, last_name, admission_no, classes(name))")
          .gte("date", since),
        (supabase as any).from("v_weak_students").select("student_id, admission_no, first_name, last_name, mean_score"),
      ]);
      const attMap = new Map<string, { name: string; admno: string; className: string; total: number; present: number; mean?: number }>();
      (att.data ?? []).forEach((r: any) => {
        const s = r.students; if (!s) return;
        const cur = attMap.get(r.student_id) ?? {
          name: `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim(),
          admno: s.admission_no ?? "", className: s.classes?.name ?? "—",
          total: 0, present: 0,
        };
        cur.total++; if (r.status === "present") cur.present++;
        attMap.set(r.student_id, cur);
      });
      const weakMap = new Map<string, number>();
      (weak.data ?? []).forEach((w: any) => weakMap.set(w.student_id, Number(w.mean_score)));

      const results: any[] = [];
      attMap.forEach((v, id) => {
        const attPct = v.total ? Math.round((v.present / v.total) * 100) : 100;
        const mean = weakMap.get(id);
        const lowAtt = attPct < 75;
        const lowMean = mean !== undefined && mean < 40;
        if (lowAtt || lowMean) {
          results.push({
            id, name: v.name, admno: v.admno, className: v.className,
            attendance: attPct, mean: mean ?? null,
            risk: lowAtt && lowMean ? "Both" : lowAtt ? "Attendance" : "Academic",
          });
        }
      });
      // Also include weak students not in attMap
      weakMap.forEach((mean, id) => {
        if (attMap.has(id)) return;
        if (mean < 40) {
          const w = (weak.data ?? []).find((x: any) => x.student_id === id);
          results.push({
            id, name: `${w?.first_name ?? ""} ${w?.last_name ?? ""}`.trim(),
            admno: w?.admission_no ?? "", className: "—",
            attendance: null, mean, risk: "Academic",
          });
        }
      });
      return results.sort((a, b) => (a.attendance ?? 100) - (b.attendance ?? 100)).slice(0, 20);
    },
  });

  const attTrend = ((kpis?.attendance ?? []) as any[]).map((r) => ({
    date: r.date, present: Number(r.present ?? 0), absent: Number(r.absent ?? 0),
  }));

  const genderMix = (() => {
    const m = new Map<string, number>();
    (kpis?.genders ?? []).forEach((s: any) => { const g = s.gender || "Unknown"; m.set(g, (m.get(g) ?? 0) + 1); });
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  })();

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><TrendingUp className="w-5 h-5" /> Analytics & Intelligence</h1>
          <p className="text-sm text-muted-foreground">Real-time insights across the school</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<GraduationCap className="w-4 h-4" />} label="Students" value={kpis?.students ?? 0} />
        <Kpi icon={<Users className="w-4 h-4" />} label="Staff" value={kpis?.staff ?? 0} />
        <Kpi icon={<Wallet className="w-4 h-4" />} label="Fee Collection"
          value={`${(kpis?.collection ?? 0).toFixed(0)}%`}
          sub={`KES ${(kpis?.totalPaid ?? 0).toLocaleString()} / ${(kpis?.totalInvoiced ?? 0).toLocaleString()}`} />
        <Kpi icon={<AlertTriangle className="w-4 h-4 text-destructive" />} label="Defaulters" value={kpis?.defaulters ?? 0} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Subject performance (avg score)</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <BarChart data={subjectAvg.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="code" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="mean" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Attendance trend (30 days)</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <LineChart data={attTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="present" stroke="#10b981" strokeWidth={2} />
                <Line type="monotone" dataKey="absent" stroke="#ef4444" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Student gender mix</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={genderMix} dataKey="value" nameKey="name" outerRadius={90} label>
                  {genderMix.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> AI insights — students at risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            {weakStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No struggling students detected — great work!</p>
            ) : (
              <ul className="text-sm space-y-1.5">
                {weakStudents.map((s: any) => (
                  <li key={s.id} className="flex items-center justify-between border-b pb-1.5">
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.admno}</div>
                    </div>
                    <Badge variant="destructive">{s.mean.toFixed(1)} avg</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* === NEW: Finance trend === */}
      <Card>
        <CardHeader><CardTitle className="text-base">Finance trend (last 6 months)</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer>
            <LineChart data={financeTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="invoiced" stroke="hsl(var(--primary))" strokeWidth={2} />
              <Line type="monotone" dataKey="collected" stroke="#10b981" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* === NEW: Class performance === */}
      <Card>
        <CardHeader><CardTitle className="text-base">Class performance comparison</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer>
            <BarChart data={classPerf}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="className" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="mean" fill="hsl(var(--accent))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* === NEW: Attendance heatmap === */}
      <Card>
        <CardHeader><CardTitle className="text-base">Attendance heatmap (last 4 weeks)</CardTitle></CardHeader>
        <CardContent>
          <Heatmap data={heatmap} />
        </CardContent>
      </Card>

      {/* === NEW: At-risk panel === */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-destructive" /> At-risk students
          </CardTitle>
        </CardHeader>
        <CardContent>
          {atRisk.length === 0 ? (
            <p className="text-sm text-muted-foreground">No at-risk students right now.</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Adm No</TableHead><TableHead>Class</TableHead>
                <TableHead>Attendance</TableHead><TableHead>Mean</TableHead><TableHead>Risk</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {atRisk.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.name}</TableCell>
                    <TableCell>{s.admno}</TableCell>
                    <TableCell>{s.className}</TableCell>
                    <TableCell className={s.attendance !== null && s.attendance < 75 ? "text-destructive" : ""}>
                      {s.attendance !== null ? `${s.attendance}%` : "—"}
                    </TableCell>
                    <TableCell className={s.mean !== null && s.mean < 40 ? "text-destructive" : ""}>
                      {s.mean !== null ? s.mean : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.risk === "Both" ? "destructive" : "secondary"}>{s.risk}</Badge>
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

function Heatmap({ data }: { data: any[] }) {
  // Build 4×7 grid (4 weeks × Mon-Sun)
  const byDate = new Map<string, { present: number; total: number }>();
  data.forEach((r) => byDate.set(r.date, { present: Number(r.present ?? 0), total: Number(r.total ?? 0) }));

  const today = new Date();
  const cells: Array<{ date: string; pct: number | null; day: string }> = [];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  for (let w = 3; w >= 0; w--) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(today);
      date.setDate(today.getDate() - (w * 7 + (6 - d)));
      const key = date.toISOString().slice(0, 10);
      const rec = byDate.get(key);
      const pct = rec && rec.total > 0 ? Math.round((rec.present / rec.total) * 100) : null;
      cells.push({ date: key, pct, day: days[d] });
    }
  }

  const color = (pct: number | null) => {
    if (pct === null) return "bg-muted/30";
    if (pct >= 95) return "bg-emerald-600";
    if (pct >= 85) return "bg-emerald-500";
    if (pct >= 75) return "bg-yellow-500";
    if (pct >= 60) return "bg-orange-500";
    return "bg-destructive";
  };

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-8 gap-1 text-xs text-muted-foreground mb-1">
        <div></div>{days.map((d) => <div key={d} className="text-center">{d}</div>)}
      </div>
      {[0, 1, 2, 3].map((week) => (
        <div key={week} className="grid grid-cols-8 gap-1">
          <div className="text-xs text-muted-foreground self-center">W{week + 1}</div>
          {cells.slice(week * 7, week * 7 + 7).map((c, i) => (
            <div key={i}
              title={`${c.date}: ${c.pct !== null ? c.pct + "%" : "no data"}`}
              className={`h-10 rounded ${color(c.pct)} text-white text-xs flex items-center justify-center`}>
              {c.pct !== null ? `${c.pct}%` : "—"}
            </div>
          ))}
        </div>
      ))}
      <div className="flex gap-3 text-xs text-muted-foreground mt-2">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-600 inline-block" /> ≥95%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500 inline-block" /> 75–84%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-destructive inline-block" /> &lt;60%</span>
      </div>
    </div>
  );
}

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
