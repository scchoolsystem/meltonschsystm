import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { computeSchoolBrain } from "@/lib/brain.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import {
  Loader2, Brain, TrendingUp, AlertTriangle, ShieldCheck, Lock, Unlock,
  History, Users, GraduationCap, Wallet, CalendarCheck, HeartPulse,
  BookOpen, Utensils, Bus, ShieldAlert, Bed, Activity, ArrowUp, ArrowDown,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/admin/brain")({ component: BrainPage });

const COLORS = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#ef4444", "#6366f1", "#ec4899"];

const sev: Record<string, string> = {
  info: "bg-muted text-muted-foreground",
  warn: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  high: "bg-destructive/15 text-destructive border-destructive/30",
  critical: "bg-destructive text-destructive-foreground",
};

function HealthRing({ value, label, color }: { value: number; label: string; color?: string }) {
  const c = value >= 80 ? "text-emerald-500" : value >= 60 ? "text-amber-500" : "text-destructive";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`text-3xl font-black tabular-nums ${c}`}>{value}</div>
      <div className="text-xs text-muted-foreground text-center leading-tight">{label}</div>
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="border rounded-lg p-3 space-y-1">
      <div className="text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function CollectionBar({ pct, label }: { pct: number; label: string }) {
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-destructive";
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="truncate max-w-[120px]">{label}</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function BrainPage() {
  const { isAdmin } = useAuth();
  const fn = useServerFn(computeSchoolBrain);
  const { data, isLoading } = useQuery({
    queryKey: ["school-brain-v2"],
    queryFn: () => fn({} as any),
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  if (!isAdmin) return <div className="p-6 text-muted-foreground">Admin only.</div>;
  if (isLoading || !data) return (
    <div className="h-96 grid place-items-center gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Computing school intelligence…</p>
    </div>
  );

  const d = data as any;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10">
          <Brain className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">School Brain</h1>
          <p className="text-sm text-muted-foreground">All-round intelligence — live school health across every module</p>
        </div>
        <Badge variant="outline" className="ml-auto text-xs">
          {d.counts.activeStudents} active students · {d.counts.activeStaff} staff
        </Badge>
      </div>

      {/* Master health strip */}
      <Card className="bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="pt-6">
          <div className="grid grid-cols-4 md:grid-cols-9 gap-4 items-center">
            <div className="col-span-1 flex flex-col items-center">
              <div className={`text-4xl font-black tabular-nums ${d.indices.schoolHealth >= 80 ? "text-emerald-500" : d.indices.schoolHealth >= 60 ? "text-amber-500" : "text-destructive"}`}>
                {d.indices.schoolHealth}
              </div>
              <div className="text-xs font-semibold text-muted-foreground text-center">Overall Health</div>
            </div>
            <div className="col-span-3 md:col-span-8 grid grid-cols-4 md:grid-cols-8 gap-3">
              {[
                ["Academic", d.indices.academicHealth],
                ["Finance", d.indices.financeStability],
                ["Attendance", d.indices.attendanceStability],
                ["Discipline", d.indices.disciplineRisk],
                ["Boarding", d.indices.boardingWellness],
                ["Clinic", d.indices.clinicLoad],
                ["Library", d.indices.libraryEngagement],
                ["Transport", d.indices.transportHealth],
              ].map(([l, v]) => (
                <HealthRing key={String(l)} value={v as number} label={String(l)} />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick counts */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat icon={<Users className="w-3 h-3" />} label="Active Students" value={d.counts.activeStudents} sub={`+${d.counts.newStudentsThisMonth} this month`} />
        <Stat icon={<AlertTriangle className="w-3 h-3" />} label="Overdue Invoices" value={d.counts.overdueInvoices} />
        <Stat icon={<CalendarCheck className="w-3 h-3" />} label="Chronic Absentees" value={d.counts.chronicAbsentees} />
        <Stat icon={<ShieldAlert className="w-3 h-3" />} label="Discipline Risks" value={d.counts.disciplineRisks} sub="last 60 days" />
        <Stat icon={<ShieldCheck className="w-3 h-3" />} label="Open Gate Passes" value={d.counts.openGatePasses} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="academic"><GraduationCap className="w-3 h-3 mr-1" />Academic</TabsTrigger>
          <TabsTrigger value="finance"><Wallet className="w-3 h-3 mr-1" />Finance</TabsTrigger>
          <TabsTrigger value="attendance"><CalendarCheck className="w-3 h-3 mr-1" />Attendance</TabsTrigger>
          <TabsTrigger value="welfare"><HeartPulse className="w-3 h-3 mr-1" />Welfare</TabsTrigger>
          <TabsTrigger value="operations"><Bus className="w-3 h-3 mr-1" />Operations</TabsTrigger>
          <TabsTrigger value="governance"><ShieldCheck className="w-3 h-3 mr-1" />Governance</TabsTrigger>
          <TabsTrigger value="alerts"><AlertTriangle className="w-3 h-3 mr-1" />Alerts ({d.alerts.length})</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW ────────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Attendance trend */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Attendance Trend (7 days)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={d.attendance.dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                    <Tooltip formatter={(v: number) => [`${v}%`, "Present"]} />
                    <Line type="monotone" dataKey="pct" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Finance trend */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Fee Collection Trend (3 months)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={d.finance.trend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => [`KES ${v.toLocaleString()}`, "Collected"]} />
                    <Bar dataKey="collected" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Exam trend */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Exam Mean Score Trend</CardTitle></CardHeader>
              <CardContent>
                {d.academics.examTrend.length === 0
                  ? <p className="text-xs text-muted-foreground py-4">No exam data yet.</p>
                  : <ResponsiveContainer width="100%" height={120}>
                      <LineChart data={d.academics.examTrend}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="exam" tick={{ fontSize: 10 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="mean" stroke="#10b981" strokeWidth={2} dot />
                      </LineChart>
                    </ResponsiveContainer>
                }
              </CardContent>
            </Card>

            {/* Gender split */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Student Gender Distribution</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-center gap-6">
                <PieChart width={120} height={120}>
                  <Pie
                    data={Object.entries(d.gender).map(([name, value]) => ({ name, value }))}
                    cx={55} cy={55} innerRadius={35} outerRadius={55}
                    dataKey="value"
                  >
                    {Object.keys(d.gender).map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
                <div className="space-y-2">
                  {Object.entries(d.gender).map(([g, n], i) => (
                    <div key={g} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="capitalize">{g}</span>
                      <span className="font-semibold ml-auto">{n as number}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── ACADEMIC ────────────────────────────────────────────────────── */}
        <TabsContent value="academic" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat icon={<GraduationCap className="w-3 h-3" />} label="Mean Score" value={`${d.academics.meanScore}%`} sub={d.academics.latestExam ?? "all time"} />
            <Stat icon={<TrendingUp className="w-3 h-3" />} label="Pass Rate" value={`${d.academics.passRate}%`} sub="≥ 50%" />
            <Stat icon={<Activity className="w-3 h-3" />} label="Total Results" value={d.academics.totalExamResults} />
            <Stat icon={<GraduationCap className="w-3 h-3" />} label="Academic Index" value={d.indices.academicHealth} sub="out of 100" />
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Class Performance — {d.academics.latestExam ?? "Latest Exam"}</CardTitle></CardHeader>
            <CardContent>
              {d.academics.classMeans.length === 0
                ? <p className="text-xs text-muted-foreground py-4">No class data for latest exam.</p>
                : <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={d.academics.classMeans} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <YAxis dataKey="class" type="category" tick={{ fontSize: 11 }} width={80} />
                      <Tooltip formatter={(v: number) => [`${v}%`, "Mean"]} />
                      <Bar dataKey="mean" radius={[0, 3, 3, 0]}>
                        {d.academics.classMeans.map((_: any, i: number) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
              }
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Exam Trend</CardTitle></CardHeader>
            <CardContent>
              {d.academics.examTrend.length === 0
                ? <p className="text-xs text-muted-foreground py-4">Need at least 2 exams for trend.</p>
                : <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={d.academics.examTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="exam" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="mean" stroke="#10b981" strokeWidth={2} dot />
                    </LineChart>
                  </ResponsiveContainer>
              }
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── FINANCE ─────────────────────────────────────────────────────── */}
        <TabsContent value="finance" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat icon={<Wallet className="w-3 h-3" />} label="Total Invoiced" value={`KES ${(d.finance.totalInvoiced / 1000).toFixed(1)}k`} />
            <Stat icon={<Wallet className="w-3 h-3" />} label="Collected" value={`KES ${(d.finance.totalPaid / 1000).toFixed(1)}k`} />
            <Stat icon={<TrendingUp className="w-3 h-3" />} label="Collection Rate" value={`${d.finance.collectionRate}%`} />
            <Stat icon={<AlertTriangle className="w-3 h-3" />} label="Overdue Invoices" value={d.finance.overdueCount} />
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Fee Collection by Class</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {d.finance.feeByClass.length === 0
                ? <p className="text-xs text-muted-foreground">No per-class data yet.</p>
                : d.finance.feeByClass.map((c: any) => (
                    <CollectionBar key={c.class} pct={c.collection} label={c.class} />
                  ))
              }
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly Collections (last 3 months)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={d.finance.trend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [`KES ${v.toLocaleString()}`, "Collected"]} />
                  <Bar dataKey="collected" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ATTENDANCE ──────────────────────────────────────────────────── */}
        <TabsContent value="attendance" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat icon={<CalendarCheck className="w-3 h-3" />} label="30-day Att. Rate" value={`${d.attendance.rate}%`} />
            <Stat icon={<AlertTriangle className="w-3 h-3" />} label="Chronic Absentees" value={d.attendance.chronicAbsenteeCount} sub="<60% in 30 days" />
            <Stat icon={<TrendingUp className="w-3 h-3" />} label="Att. Index" value={d.indices.attendanceStability} sub="out of 100" />
            <Stat icon={<Users className="w-3 h-3" />} label="Active Students" value={d.counts.activeStudents} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Daily Attendance (7 days)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={d.attendance.dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                    <Tooltip formatter={(v: number) => [`${v}%`, "Present"]} />
                    <Bar dataKey="pct" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Top Chronic Absentees</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {d.attendance.topAbsentees.length === 0
                  ? <p className="text-xs text-muted-foreground py-4 text-center">No chronic absentees. ✓</p>
                  : d.attendance.topAbsentees.map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between text-sm border rounded px-2 py-1">
                        <span className="font-mono">{a.id}</span>
                        <span className="text-muted-foreground text-xs">{a.days} days tracked</span>
                        <Badge variant="outline" className={`text-xs ${a.pct < 40 ? "bg-destructive/15 text-destructive" : "bg-amber-500/15 text-amber-600"}`}>
                          {a.pct}%
                        </Badge>
                      </div>
                    ))
                }
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── WELFARE ─────────────────────────────────────────────────────── */}
        <TabsContent value="welfare" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {/* Clinic */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><HeartPulse className="w-4 h-4" />Clinic (30 days)</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Stat icon={null} label="Total Visits" value={d.welfare.clinicVisits30d} />
                <Stat icon={null} label="Admitted" value={d.welfare.admitted} />
                <Stat icon={null} label="Chronic Conditions" value={d.welfare.chronicConditions} />
              </CardContent>
            </Card>

            {/* Kitchen */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><Utensils className="w-4 h-4" />Kitchen</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Stat icon={null} label="Meal Plan Students" value={d.welfare.mealPlanStudents} />
                <Stat icon={null} label="Low Stock Items" value={d.welfare.lowStockItems} sub={d.welfare.lowStockNames.join(", ") || "—"} />
              </CardContent>
            </Card>

            {/* Library */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><BookOpen className="w-4 h-4" />Library (30 days)</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Stat icon={null} label="Active Loans" value={d.welfare.activeLoans} />
                <Stat icon={null} label="Overdue Returns" value={d.welfare.overdueBooks} />
                <Stat icon={null} label="Utilisation" value={`${d.welfare.libraryUtilisation}%`} />
              </CardContent>
            </Card>
          </div>

          {/* Boarding */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><Bed className="w-4 h-4" />Boarding</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Stat icon={null} label="Boarders" value={d.boarding.boarders} />
                <Stat icon={null} label="Capacity" value={d.boarding.capacity} />
                <Stat icon={null} label="Occupancy" value={`${d.boarding.occupancyPct}%`} />
                <Stat icon={null} label="Roll Compliance (7d)" value={`${d.boarding.rollCompliancePct}%`} />
                <Stat icon={null} label="Dorms" value={d.boarding.dormCount} />
              </div>
              <div className="mt-3">
                <div className="text-xs text-muted-foreground mb-1">Occupancy</div>
                <Progress value={d.boarding.occupancyPct} className="h-2" />
              </div>
            </CardContent>
          </Card>

          {/* Discipline breakdown */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><AlertTriangle className="w-4 h-4" />Discipline Breakdown (60 days)</CardTitle></CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">By category</div>
                  {d.discipline.topCategories.length === 0
                    ? <p className="text-xs text-muted-foreground">No incidents recorded.</p>
                    : d.discipline.topCategories.map((c: any) => (
                        <div key={c.cat} className="flex justify-between text-sm border rounded px-2 py-1">
                          <span className="capitalize">{c.cat}</span>
                          <Badge variant="secondary">{c.count}</Badge>
                        </div>
                      ))
                  }
                </div>
                <div className="flex flex-col gap-2">
                  <Stat icon={null} label="Total Incidents" value={d.discipline.totalIncidents} />
                  <Stat icon={null} label="At-Risk Students" value={d.discipline.riskCount} sub="≥4 severity pts" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── OPERATIONS ──────────────────────────────────────────────────── */}
        <TabsContent value="operations" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Transport */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><Bus className="w-4 h-4" />Transport</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Stat icon={null} label="Routes" value={d.transport.routeCount} />
                  <Stat icon={null} label="Assigned Students" value={d.transport.assignedStudents} />
                  <Stat icon={null} label="Total Capacity" value={d.transport.capacity} />
                  <Stat icon={null} label="Utilisation" value={`${d.transport.utilisationPct}%`} />
                </div>
                <Progress value={Math.min(d.transport.utilisationPct, 100)} className="h-2" />
              </CardContent>
            </Card>

            {/* Security */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><ShieldAlert className="w-4 h-4" />Security & Gate</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Stat icon={null} label="Open Gate Passes" value={d.security.openGatePasses} sub="unresolved" />
                  <Stat icon={null} label="Total Passes (7d)" value={d.security.totalPassesWeek} />
                </div>
                {d.security.openGatePasses > 5 && (
                  <div className="text-xs text-amber-600 bg-amber-500/10 rounded p-2">
                    {d.security.openGatePasses} open passes — review outstanding authorisations
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── GOVERNANCE ──────────────────────────────────────────────────── */}
        <TabsContent value="governance" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat icon={<Lock className="w-3 h-3" />} label="Locked fields" value={d.governance.locked} />
            <Stat icon={<ShieldCheck className="w-3 h-3" />} label="Restricted fields" value={d.governance.restricted} />
            <Stat icon={<Unlock className="w-3 h-3" />} label="Editable fields" value={d.governance.editable} />
            <Stat icon={<History className="w-3 h-3" />} label="Overrides (7d)" value={d.governance.overrides7d} />
            <Stat icon={<TrendingUp className="w-3 h-3" />} label="Field edits (30d)" value={d.governance.edits30d} />
            <Stat icon={<Users className="w-3 h-3" />} label="Pending parent links" value={d.governance.pendingParentLinks} />
            <Stat icon={<History className="w-3 h-3" />} label="Lifecycle changes (30d)" value={d.governance.lifecycleChanges30d} />
            <Stat icon={<ShieldCheck className="w-3 h-3" />} label="Total policies" value={d.governance.totalPolicies} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Top Override Actors (7d)</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {(d.topOverrideActors ?? []).length === 0
                  ? <div className="text-xs text-muted-foreground py-4 text-center">No overrides recorded.</div>
                  : (d.topOverrideActors ?? []).map((a: any) => (
                      <div key={a.actor} className="flex justify-between text-sm border rounded px-2 py-1">
                        <span className="font-mono">{a.actor}</span>
                        <Badge variant="secondary">{a.count}</Badge>
                      </div>
                    ))
                }
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Recent Overrides</CardTitle></CardHeader>
              <CardContent className="space-y-1 max-h-64 overflow-auto">
                {(d.recentOverrides ?? []).length === 0
                  ? <div className="text-xs text-muted-foreground py-4 text-center">None.</div>
                  : (d.recentOverrides ?? []).map((o: any, i: number) => (
                      <div key={i} className="text-xs border rounded px-2 py-1">
                        <div className="flex justify-between">
                          <span className="font-mono">{o.actor}</span>
                          <span className="text-muted-foreground">{new Date(o.at).toLocaleString()}</span>
                        </div>
                        <div className="text-muted-foreground truncate">{o.resource}.{o.field} — {o.reason}</div>
                      </div>
                    ))
                }
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── ALERTS ──────────────────────────────────────────────────────── */}
        <TabsContent value="alerts" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />Smart Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {d.alerts.length === 0 && (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  No alerts. School operating in normal range.
                </div>
              )}
              {d.alerts.map((a: any, i: number) => (
                <div key={i} className="flex items-start justify-between gap-4 p-3 rounded-md border">
                  <div>
                    <div className="font-medium text-sm">{a.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{a.body}</div>
                  </div>
                  <Badge variant="outline" className={`shrink-0 ${sev[a.severity] ?? ""}`}>{a.category}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
