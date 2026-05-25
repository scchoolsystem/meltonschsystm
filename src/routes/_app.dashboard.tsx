import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { buildDashboard, buildNavigation } from "@/lib/role-experience";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { fullName, roles } = useAuth();
  const { widgets, showAdminCharts, primaryPersona } = buildDashboard(roles as string[]);
  const quickActions = buildNavigation(roles as string[])
    .flatMap((g) => g.items)
    .filter((i) => i.url !== "/dashboard")
    .slice(0, 6);

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats", showAdminCharts],
    enabled: showAdminCharts,
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

  if (showAdminCharts && isLoading) {
    return (
      <div className="grid place-items-center h-96">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Friendly values for personal widgets (placeholders that don't make stuff up)
  const widgetValue = (k: string): { value: string; sub: string } => {
    if (showAdminCharts) {
      switch (k) {
        case "total_students": return { value: String(stats?.students ?? 0), sub: `${stats?.activeStudents ?? 0} active` };
        case "total_staff":    return { value: String(stats?.staff ?? 0),    sub: "Across departments" };
        case "total_classes":  return { value: String(stats?.classes ?? 0),  sub: `${stats?.primary} primary · ${stats?.secondary} secondary` };
        case "term_status":    return { value: "On track", sub: `AY ${new Date().getFullYear()}` };
      }
    }
    return { value: "—", sub: "Live data coming soon" };
  };

  const pieData = [
    { name: "Primary", value: stats?.primary ?? 0 },
    { name: "Secondary", value: stats?.secondary ?? 0 },
  ];
  const PIE_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))"];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">
          Welcome back, {fullName?.split(" ")[0] || "there"}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Signed in as{" "}
          <span className="font-medium text-foreground capitalize">{primaryPersona}</span>
          {roles.length > 1 && (
            <span className="text-muted-foreground"> · {roles.join(", ")}</span>
          )}
        </p>
      </div>

      {/* Role-aware widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {widgets.map((w) => {
          const v = widgetValue(w.key);
          return (
            <Card key={w.key}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {w.title}
                </CardTitle>
                <w.icon className={`w-4 h-4 ${w.accent ?? "text-muted-foreground"}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{v.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{v.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick actions tailored to the user */}
      {quickActions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            <CardDescription>Jump straight to what you do most</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {quickActions.map((a) => (
                <Link
                  key={a.url + a.title}
                  to={a.url}
                  className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition"
                >
                  <a.icon className="w-4 h-4 text-muted-foreground" />
                  <span className="truncate">{a.title}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Admin-only analytics charts */}
      {showAdminCharts && (
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
                <div className="h-full grid place-items-center text-sm text-muted-foreground">
                  No classes yet — add some to see data.
                </div>
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
      )}
    </div>
  );
}
