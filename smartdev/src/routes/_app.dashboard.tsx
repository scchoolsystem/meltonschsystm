import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, GraduationCap, BookOpen, TrendingUp, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { fullName, roles } = useAuth();
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [students, staff, classes, byClass] = await Promise.all([
        supabase.from("students").select("id, status", { count: "exact" }),
        supabase.from("staff").select("id, status", { count: "exact" }),
        supabase.from("classes").select("id, level", { count: "exact" }),
        supabase.from("classes").select("name, students(count)"),
      ]);
      return {
        students: students.count ?? 0,
        activeStudents: (students.data ?? []).filter((s) => s.status === "active").length,
        staff: staff.count ?? 0,
        classes: classes.count ?? 0,
        primary: (classes.data ?? []).filter((c) => c.level === "primary").length,
        secondary: (classes.data ?? []).filter((c) => c.level === "secondary").length,
        byClass: (byClass.data ?? []).map((c: any) => ({
          name: c.name, count: c.students?.[0]?.count ?? 0,
        })),
      };
    },
  });

  if (isLoading) {
    return <div className="grid place-items-center h-96"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const cards = [
    { label: "Total Students", value: stats?.students ?? 0, sub: `${stats?.activeStudents ?? 0} active`, icon: GraduationCap, accent: "text-chart-1" },
    { label: "Staff Members", value: stats?.staff ?? 0, sub: "Across all departments", icon: Users, accent: "text-chart-2" },
    { label: "Classes", value: stats?.classes ?? 0, sub: `${stats?.primary} primary · ${stats?.secondary} secondary`, icon: BookOpen, accent: "text-chart-3" },
    { label: "This Term", value: "On track", sub: "Academic Year " + new Date().getFullYear(), icon: TrendingUp, accent: "text-chart-4" },
  ];

  const pieData = [
    { name: "Primary", value: stats?.primary ?? 0 },
    { name: "Secondary", value: stats?.secondary ?? 0 },
  ];
  const PIE_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))"];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Welcome back, {fullName?.split(" ")[0] || "there"}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Signed in as <span className="font-medium text-foreground">{roles.join(", ") || "user"}</span>
        </p>
      </div>

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Students per Class</CardTitle>
            <CardDescription>Current enrolment distribution</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {stats?.byClass.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.byClass}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="count" fill="oklch(0.55 0.13 245)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">No classes yet — add some to see data.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>School Structure</CardTitle>
            <CardDescription>Classes by level</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {(stats?.primary ?? 0) + (stats?.secondary ?? 0) > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={4}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">No data</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
