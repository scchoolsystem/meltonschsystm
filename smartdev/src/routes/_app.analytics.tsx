import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import { TrendingUp, AlertTriangle, Users, Wallet, GraduationCap, Sparkles } from "lucide-react";

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

  // Attendance trend (last 30 days) — sourced from v_attendance_daily
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
