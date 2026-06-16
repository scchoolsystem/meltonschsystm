import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Users, GraduationCap, BookOpen, TrendingUp, CalendarDays,
  ClipboardList, Wallet, Stethoscope, ShieldAlert, Library,
  BedDouble, ShieldCheck, Building2, Loader2, Bus, Utensils,
  Trophy, AlertTriangle, UserPlus, Settings,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

function MiniLoader() {
  return (
    <div className="grid place-items-center h-24">
      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-muted-foreground py-6 text-center">{children}</div>
  );
}

// ---------- ADMIN ----------
export function AdminKpisWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-admin-kpis"],
    queryFn: async () => {
      const [students, staff, classes] = await Promise.all([
        supabase.from("students").select("id, status", { count: "exact" }),
        supabase.from("staff").select("id, status", { count: "exact" }),
        supabase.from("classes").select("id, level", { count: "exact" }),
      ]);
      return {
        students: students.count ?? 0,
        activeStudents: (students.data ?? []).filter((s: any) => s.status === "active").length,
        staff: staff.count ?? 0,
        classes: classes.count ?? 0,
        primary: (classes.data ?? []).filter((c: any) => c.level === "primary").length,
        secondary: (classes.data ?? []).filter((c: any) => c.level === "secondary").length,
      };
    },
  });
  if (isLoading) return <MiniLoader />;
  const cards = [
    { label: "Total Students", value: data?.students ?? 0, sub: `${data?.activeStudents ?? 0} active`, icon: GraduationCap, accent: "text-chart-1" },
    { label: "Staff Members", value: data?.staff ?? 0, sub: "Across all departments", icon: Users, accent: "text-chart-2" },
    { label: "Classes", value: data?.classes ?? 0, sub: `${data?.primary} primary · ${data?.secondary} secondary`, icon: BookOpen, accent: "text-chart-3" },
    { label: "This Term", value: "On track", sub: "Academic Year " + new Date().getFullYear(), icon: TrendingUp, accent: "text-chart-4" },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
            <c.icon className={`w-4 h-4 ${c.accent}`} />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{c.value}</div>
            <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function AdminStudentsPerClassWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-admin-by-class"],
    queryFn: async () => {
      const res = await supabase.from("classes").select("name, students(count)");
      return (res.data ?? []).map((c: any) => ({ name: c.name, count: c.students?.[0]?.count ?? 0 }));
    },
  });
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Students per Class</CardTitle>
        <CardDescription>Current enrolment distribution</CardDescription>
      </CardHeader>
      <CardContent className="h-72">
        {isLoading ? <MiniLoader /> : data && data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Bar dataKey="count" fill="oklch(0.55 0.13 245)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState>No classes yet — add some to see data.</EmptyState>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminSchoolStructureWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-admin-structure"],
    queryFn: async () => {
      const res = await supabase.from("classes").select("level");
      const rows = res.data ?? [];
      return {
        primary: rows.filter((c: any) => c.level === "primary").length,
        secondary: rows.filter((c: any) => c.level === "secondary").length,
      };
    },
  });
  const pieData = [
    { name: "Primary", value: data?.primary ?? 0 },
    { name: "Secondary", value: data?.secondary ?? 0 },
  ];
  const PIE_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))"];
  const total = (data?.primary ?? 0) + (data?.secondary ?? 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>School Structure</CardTitle>
        <CardDescription>Classes by level</CardDescription>
      </CardHeader>
      <CardContent className="h-72">
        {isLoading ? <MiniLoader /> : total > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={4}>
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        ) : <EmptyState>No data</EmptyState>}
      </CardContent>
    </Card>
  );
}

// ---------- TEACHER ----------
export function TeacherMyClassesWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-teacher-classes"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return [];
      const { data: staff } = await supabase.from("staff").select("id").eq("user_id", uid).maybeSingle();
      if (!staff) return [];
      const { data: classes } = await supabase
        .from("classes")
        .select("id, name, students(count)")
        .eq("class_teacher_id", (staff as any).id);
      return (classes ?? []).map((c: any) => ({ name: c.name, count: c.students?.[0]?.count ?? 0 }));
    },
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">My Classes</CardTitle>
        <BookOpen className="w-4 h-4 text-chart-1" />
      </CardHeader>
      <CardContent>
        {isLoading ? <MiniLoader /> : data && data.length ? (
          <ul className="text-sm space-y-1">
            {data.map((c, i) => (
              <li key={i} className="flex justify-between">
                <span>{c.name}</span>
                <span className="text-muted-foreground">{c.count} students</span>
              </li>
            ))}
          </ul>
        ) : <EmptyState>No classes assigned</EmptyState>}
      </CardContent>
    </Card>
  );
}

export function TeacherTodayTimetableWidget() {
  const dow = new Date().getDay();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-teacher-tt", dow],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return [];
      const { data: staff } = await supabase.from("staff").select("id").eq("user_id", uid).maybeSingle();
      if (!staff) return [];
      const { data: slots } = await supabase
        .from("timetable_slots")
        .select("start_time, end_time, room, classes(name), subjects(name)")
        .eq("teacher_id", (staff as any).id)
        .eq("day_of_week", dow)
        .order("start_time");
      return slots ?? [];
    },
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Today's Schedule</CardTitle>
        <CalendarDays className="w-4 h-4 text-chart-2" />
      </CardHeader>
      <CardContent>
        {isLoading ? <MiniLoader /> : data && data.length ? (
          <ul className="text-sm space-y-1">
            {data.map((s: any, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">{s.start_time?.slice(0, 5)}</span>
                <span className="flex-1 truncate">{s.subjects?.name ?? "—"} · {s.classes?.name ?? "—"}</span>
                <span className="text-xs text-muted-foreground">{s.room ?? ""}</span>
              </li>
            ))}
          </ul>
        ) : <EmptyState>No lessons today</EmptyState>}
      </CardContent>
    </Card>
  );
}

export function TeacherPendingMarksWidget() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Marks Entry</CardTitle>
        <ClipboardList className="w-4 h-4 text-chart-3" />
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Open <a href="/academics/marks" className="text-primary underline">Marks</a> to enter or update scores.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------- STUDENT ----------
export function StudentSummaryWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-student-summary"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return null;
      const { data: link } = await supabase.from("student_user_links").select("student_id").eq("user_id", uid).maybeSingle();
      if (!link) return null;
      const { data: student } = await supabase
        .from("students")
        .select("full_name, admission_no, classes(name)")
        .eq("id", (link as any).student_id)
        .maybeSingle();
      return student;
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle>My Profile</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <MiniLoader /> : data ? (
          <div className="text-sm space-y-1">
            <div className="font-medium text-lg">{(data as any).full_name}</div>
            <div className="text-muted-foreground">Admission #{(data as any).admission_no}</div>
            <div className="text-muted-foreground">Class: {(data as any).classes?.name ?? "—"}</div>
          </div>
        ) : <EmptyState>Profile not linked yet</EmptyState>}
      </CardContent>
    </Card>
  );
}

export function StudentUpcomingExamsWidget() {
  return (
    <Card>
      <CardHeader><CardTitle>Upcoming Exams</CardTitle></CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          View your schedule in the <a href="/portal/student" className="text-primary underline">Student Portal</a>.
        </p>
      </CardContent>
    </Card>
  );
}

export function StudentRecentResultsWidget() {
  return (
    <Card>
      <CardHeader><CardTitle>Recent Results</CardTitle></CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Open <a href="/portal/student" className="text-primary underline">My Portal</a> to view your latest marks.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------- PARENT ----------
export function ParentChildrenWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-parent-children"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return [];
      const { data: links } = await supabase
        .from("parent_student_links")
        .select("students(id, full_name, admission_no, classes(name))")
        .eq("parent_user_id", uid);
      return (links ?? []).map((l: any) => l.students).filter(Boolean);
    },
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">My Children</CardTitle>
        <GraduationCap className="w-4 h-4 text-chart-1" />
      </CardHeader>
      <CardContent>
        {isLoading ? <MiniLoader /> : data && data.length ? (
          <ul className="text-sm space-y-2">
            {data.map((c: any) => (
              <li key={c.id} className="flex justify-between">
                <span className="font-medium">{c.full_name}</span>
                <span className="text-muted-foreground">{c.classes?.name ?? "—"}</span>
              </li>
            ))}
          </ul>
        ) : <EmptyState>No children linked</EmptyState>}
      </CardContent>
    </Card>
  );
}

export function ParentOutstandingFeesWidget() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding Fees</CardTitle>
        <Wallet className="w-4 h-4 text-chart-4" />
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          View invoices in the <a href="/portal/parent" className="text-primary underline">Parent Portal</a>.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------- FINANCE ----------
export function FinanceCollectionsWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-finance-collections"],
    queryFn: async () => {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const { data } = await supabase
        .from("payments")
        .select("amount")
        .gte("created_at", since.toISOString());
      const total = (data ?? []).reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
      return { total, count: data?.length ?? 0 };
    },
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Collections (30d)</CardTitle>
        <Wallet className="w-4 h-4 text-chart-2" />
      </CardHeader>
      <CardContent>
        {isLoading ? <MiniLoader /> : (
          <>
            <div className="text-2xl font-bold">{data?.total.toLocaleString() ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">{data?.count ?? 0} payments</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function FinanceOutstandingWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-finance-outstanding"],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("amount, paid, status")
        .in("status", ["unpaid", "partial"]);
      const total = (data ?? []).reduce(
        (s: number, i: any) => s + Math.max(0, Number(i.amount ?? 0) - Number(i.paid ?? 0)),
        0,
      );
      return { total, count: data?.length ?? 0 };
    },
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding Invoices</CardTitle>
        <TrendingUp className="w-4 h-4 text-chart-4" />
      </CardHeader>
      <CardContent>
        {isLoading ? <MiniLoader /> : (
          <>
            <div className="text-2xl font-bold">{data?.total.toLocaleString() ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">{data?.count ?? 0} unpaid / partial</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- CLINIC / DISCIPLINE / LIBRARY / BOARDING / SECURITY ----------
function SimpleCountWidget({
  title, table, filter, icon: Icon, hint,
}: {
  title: string;
  table: string;
  filter?: (q: any) => any;
  icon: any;
  hint?: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-count", table, title],
    queryFn: async () => {
      let q: any = supabase.from(table as any).select("id", { count: "exact", head: true });
      if (filter) q = filter(q);
      const { count } = await q;
      return count ?? 0;
    },
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="w-4 h-4 text-chart-3" />
      </CardHeader>
      <CardContent>
        {isLoading ? <MiniLoader /> : <div className="text-2xl font-bold">{data}</div>}
        {hint ? <p className="text-xs text-muted-foreground mt-1">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function ClinicTodayVisitsWidget() {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <SimpleCountWidget
      title="Clinic Visits Today"
      table="clinic_visits"
      filter={(q) => q.gte("created_at", today)}
      icon={Stethoscope}
      hint="Last 24 hours"
    />
  );
}

export function DisciplineRecentIncidentsWidget() {
  const since = new Date(); since.setDate(since.getDate() - 7);
  return (
    <SimpleCountWidget
      title="Incidents (7d)"
      table="discipline_records"
      filter={(q) => q.gte("created_at", since.toISOString())}
      icon={ShieldAlert}
      hint="Last 7 days"
    />
  );
}

export function LibraryActiveLoansWidget() {
  return (
    <SimpleCountWidget
      title="Active Loans"
      table="book_loans"
      filter={(q) => q.eq("status", "active")}
      icon={Library}
    />
  );
}

export function BoardingOccupancyWidget() {
  return (
    <SimpleCountWidget
      title="Boarders Assigned"
      table="dorm_assignments"
      icon={BedDouble}
    />
  );
}

export function SecurityRecentLogsWidget() {
  const since = new Date(); since.setDate(since.getDate() - 1);
  return (
    <SimpleCountWidget
      title="Gate Logs (24h)"
      table="gate_passes"
      filter={(q) => q.gte("created_at", since.toISOString())}
      icon={ShieldCheck}
    />
  );
}

// ---------- PLATFORM ----------
export function PlatformTenantsWidget() {
  return (
    <SimpleCountWidget
      title="Tenants"
      table="schools"
      icon={Building2}
      hint="All registered schools"
    />
  );
}

// ---------- ADMIN: attendance / pending actions / new students / fees ----------
export function AdminAttendanceTodayWidget() {
  const today = new Date().toISOString().slice(0, 10);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-admin-attendance-today", today],
    queryFn: async () => {
      const { data } = await supabase.from("attendance_records").select("status").eq("date", today);
      const rows = data ?? [];
      const present = rows.filter((r: any) => r.status === "present").length;
      const absent = rows.filter((r: any) => r.status === "absent").length;
      const late = rows.filter((r: any) => r.status === "late").length;
      const total = rows.length;
      return { present, absent, late, total, pct: total ? Math.round((present / total) * 100) : 0 };
    },
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Attendance Today</CardTitle>
        <CalendarDays className="w-4 h-4 text-chart-2" />
      </CardHeader>
      <CardContent>
        {isLoading ? <MiniLoader /> : data?.total ? (
          <>
            <div className="text-2xl font-bold">{data.pct}% present</div>
            <div className="w-full bg-muted rounded-full h-2 mt-2 overflow-hidden">
              <div className="h-2 bg-chart-1 rounded-full" style={{ width: `${data.pct}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-2">{data.present} present · {data.absent} absent · {data.late} late</p>
          </>
        ) : <EmptyState>No attendance recorded today.</EmptyState>}
      </CardContent>
    </Card>
  );
}

export function AdminPendingActionsWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-admin-pending-actions"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [gp, tickets, disc, loans] = await Promise.all([
        supabase.from("gate_passes").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("support_tickets").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
        supabase.from("discipline_records").select("id", { count: "exact", head: true }).eq("parent_notified", false),
        supabase.from("book_loans").select("id", { count: "exact", head: true }).eq("status", "active").lt("due_date", today),
      ]);
      return {
        gatePasses: gp.count ?? 0,
        tickets: tickets.count ?? 0,
        discipline: disc.count ?? 0,
        loans: loans.count ?? 0,
      };
    },
  });
  const items = data ? [
    { label: "Pending gate passes", value: data.gatePasses },
    { label: "Open support tickets", value: data.tickets },
    { label: "Unnotified discipline cases", value: data.discipline },
    { label: "Overdue library loans", value: data.loans },
  ] : [];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Pending Actions</CardTitle>
        <ClipboardList className="w-4 h-4 text-chart-4" />
      </CardHeader>
      <CardContent>
        {isLoading ? <MiniLoader /> : (
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{it.label}</span>
                <span className={`font-semibold px-2 py-0.5 rounded-full text-xs ${it.value > 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>{it.value}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminNewStudentsThisWeekWidget() {
  const since = new Date(); since.setDate(since.getDate() - 7);
  return (
    <SimpleCountWidget
      title="New Students (7d)"
      table="students"
      filter={(q) => q.gte("created_at", since.toISOString())}
      icon={UserPlus}
    />
  );
}

export function AdminOverdueFeesWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-admin-overdue-fees"],
    queryFn: async () => {
      const { data } = await supabase.from("invoices").select("amount, paid").neq("status", "paid");
      const total = (data ?? []).reduce((sum: number, inv: any) => sum + ((inv.amount ?? 0) - (inv.paid ?? 0)), 0);
      return total;
    },
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding Fees</CardTitle>
        <Wallet className="w-4 h-4 text-chart-1" />
      </CardHeader>
      <CardContent>
        {isLoading ? <MiniLoader /> : <div className="text-2xl font-bold">KES {Math.round(data ?? 0).toLocaleString()}</div>}
        <p className="text-xs text-muted-foreground mt-1">Across all unpaid invoices</p>
      </CardContent>
    </Card>
  );
}

// ---------- TRANSPORT ----------
export function TransportRouteSummaryWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-transport-summary"],
    queryFn: async () => {
      const [routes, assignments] = await Promise.all([
        supabase.from("transport_routes").select("id, capacity"),
        supabase.from("transport_assignments").select("route_id"),
      ]);
      const routeList = routes.data ?? [];
      const assignList = assignments.data ?? [];
      const atCapacity = routeList.filter((r: any) => {
        const used = assignList.filter((a: any) => a.route_id === r.id).length;
        return r.capacity && used >= r.capacity;
      }).length;
      return { totalRoutes: routeList.length, totalAssigned: assignList.length, atCapacity };
    },
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Transport Summary</CardTitle>
        <Bus className="w-4 h-4 text-chart-2" />
      </CardHeader>
      <CardContent>
        {isLoading ? <MiniLoader /> : (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Routes</span><span className="font-semibold">{data?.totalRoutes}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Students assigned</span><span className="font-semibold">{data?.totalAssigned}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Routes at capacity</span><span className="font-semibold">{data?.atCapacity}</span></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- KITCHEN ----------
export function KitchenTodaySummaryWidget() {
  const today = new Date().toISOString().slice(0, 10);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-kitchen-today", today],
    queryFn: async () => {
      const [meals, stock] = await Promise.all([
        supabase.from("meal_plans").select("meal_type, menu, served_count").eq("meal_date", today),
        supabase.from("kitchen_stock").select("quantity, reorder_level"),
      ]);
      const mealRows = meals.data ?? [];
      const totalServed = mealRows.reduce((s: number, m: any) => s + (m.served_count ?? 0), 0);
      const lowStock = (stock.data ?? []).filter((s: any) => s.quantity <= s.reorder_level).length;
      return { meals: mealRows, totalServed, lowStock };
    },
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Kitchen Today</CardTitle>
        <Utensils className="w-4 h-4 text-chart-3" />
      </CardHeader>
      <CardContent>
        {isLoading ? <MiniLoader /> : (
          <div className="space-y-1 text-sm">
            {(["breakfast", "lunch", "dinner"] as const).map((t) => {
              const m = data?.meals.find((x: any) => x.meal_type === t);
              return <div key={t} className="flex justify-between"><span className="capitalize text-muted-foreground">{t}</span><span className="font-medium">{m?.menu ?? "—"}</span></div>;
            })}
            <div className="flex justify-between pt-1 border-t mt-1"><span className="text-muted-foreground">Served today</span><span className="font-semibold">{data?.totalServed}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Low stock items</span><span className={`font-semibold ${data?.lowStock ? "text-destructive" : ""}`}>{data?.lowStock}</span></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- SPORTS ----------
export function SportsSummaryWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-sports-summary"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [activities, enrolled, fixtures] = await Promise.all([
        supabase.from("co_curricular_activities").select("id", { count: "exact", head: true }),
        supabase.from("student_co_curricular").select("id", { count: "exact", head: true }),
        supabase.from("sports_fixtures").select("id", { count: "exact", head: true }).gte("fixture_date", today),
      ]);
      return { activities: activities.count ?? 0, enrolled: enrolled.count ?? 0, fixtures: fixtures.count ?? 0 };
    },
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Sports Summary</CardTitle>
        <Trophy className="w-4 h-4 text-chart-4" />
      </CardHeader>
      <CardContent>
        {isLoading ? <MiniLoader /> : (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Activities</span><span className="font-semibold">{data?.activities}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Enrolled students</span><span className="font-semibold">{data?.enrolled}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Upcoming fixtures</span><span className="font-semibold">{data?.fixtures}</span></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- ICT ADMIN ----------
export function IctFeatureFlagsWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-ict-features"],
    queryFn: async () => (await supabase.from("school_features").select("feature, enabled")).data ?? [],
  });
  const enabled = (data ?? []).filter((f: any) => f.enabled).length;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Feature Flags</CardTitle>
        <Settings className="w-4 h-4 text-chart-2" />
      </CardHeader>
      <CardContent>
        {isLoading ? <MiniLoader /> : <div className="text-2xl font-bold">{enabled}/{(data ?? []).length} enabled</div>}
        <p className="text-xs text-muted-foreground mt-1">Read-only — managed by Admin</p>
      </CardContent>
    </Card>
  );
}

export function IctActiveUsersWidget() {
  return (
    <SimpleCountWidget
      title="Active Users"
      table="school_members"
      icon={Users}
      hint="school_members for this school"
    />
  );
}

export function IctSupportTicketsWidget() {
  return (
    <SimpleCountWidget
      title="Open Support Tickets"
      table="support_tickets"
      filter={(q) => q.in("status", ["open", "in_progress"])}
      icon={AlertTriangle}
    />
  );
}
