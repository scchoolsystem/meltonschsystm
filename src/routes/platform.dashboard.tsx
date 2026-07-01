import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Receipt, LifeBuoy, DollarSign, TrendingUp, Filter, ShieldAlert, ShieldCheck } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/platform/dashboard")({
  component: PlatformDashboard,
});

function PlatformDashboard() {
  const { data } = useQuery({
    queryKey: ["platform-stats"],
    queryFn: async () => {
      const [schoolsRes, subsRes, invRes, ticketsRes] = await Promise.all([
        supabase.from("schools").select("id,name,status,created_at").order("created_at", { ascending: false }),
        supabase.from("school_subscriptions").select("plan_id,status, subscription_plans(monthly_fee)"),
        supabase.from("platform_invoices").select("amount,paid,status,created_at"),
        supabase.from("support_tickets").select("status,subject,created_at").order("created_at", { ascending: false }),
      ]);
      const schools = schoolsRes.data ?? [];
      const subs = (subsRes.data ?? []) as any[];
      const invoices = (invRes.data ?? []) as any[];
      const tickets = (ticketsRes.data ?? []) as any[];

      const mrr = subs
        .filter((s) => s.status === "active")
        .reduce((sum, s) => sum + Number(s.subscription_plans?.monthly_fee ?? 0), 0);

      // 6-month new-school trend
      const now = new Date();
      const trend: { month: string; schools: number; revenue: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toISOString().slice(0, 7);
        const label = d.toLocaleDateString("en", { month: "short" });
        const newSchools = schools.filter((s: any) => s.created_at?.startsWith(key)).length;
        const revenue = invoices.filter((i: any) => i.created_at?.startsWith(key)).reduce((sum, i: any) => sum + Number(i.paid ?? 0), 0);
        trend.push({ month: label, schools: newSchools, revenue });
      }

      const totalInvoiced = invoices.reduce((s, i: any) => s + Number(i.amount ?? 0), 0);
      const totalPaid = invoices.reduce((s, i: any) => s + Number(i.paid ?? 0), 0);
      const outstanding = totalInvoiced - totalPaid;
      const funnel = [
        { stage: "Invoiced", value: totalInvoiced },
        { stage: "Paid", value: totalPaid },
        { stage: "Outstanding", value: Math.max(0, outstanding) },
      ];

      return {
        totalSchools: schools.length,
        activeSchools: schools.filter((s: any) => s.status === "active").length,
        suspendedSchools: schools.filter((s: any) => s.status === "suspended").length,
        mrr,
        outstanding,
        openTickets: tickets.filter((t: any) => t.status === "open" || t.status === "in_progress").length,
        recentSchools: schools.slice(0, 5),
        recentTickets: tickets.slice(0, 5),
        trend,
        funnel,
        allSchools: schools,
      };
    },
  });

  const { data: schoolHealth = [] } = useQuery({
    queryKey: ["platform-school-health"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("v_school_health").select("*").limit(50);
      if (data && data.length) return data;
      // Fallback: derive from schools + invoices if view not present
      const { data: schools } = await supabase.from("schools").select("id,name,status,created_at").order("created_at", { ascending: false }).limit(50);
      return (schools ?? []).map((s: any) => ({ school_id: s.id, name: s.name, status: s.status, students: null, outstanding: null, last_login: null }));
    },
  });

  const { data: compliance = [] } = useQuery({
    queryKey: ["platform-compliance-summary"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("platform_compliance_summary");
      if (error) return [];
      return data ?? [];
    },
  });

  const complianceStats = {
    verified: compliance.filter((c: any) => c.legal_status === "verified").length,
    needsAttention: compliance.filter((c: any) => c.legal_status !== "verified" || c.documents_expired > 0).length,
    expiringDocs: compliance.reduce((s: number, c: any) => s + (c.documents_expiring ?? 0), 0),
    expiredDocs: compliance.reduce((s: number, c: any) => s + (c.documents_expired ?? 0), 0),
  };

  const stats = [
    { label: "Total schools", value: data?.totalSchools ?? "—", sub: `${data?.activeSchools ?? 0} active`, icon: Building2, link: "/platform/schools" },
    { label: "Monthly recurring", value: data ? `KES ${data.mrr.toLocaleString()}` : "—", sub: "from active plans", icon: DollarSign, link: "/platform/plans" },
    { label: "Outstanding billing", value: data ? `KES ${data.outstanding.toLocaleString()}` : "—", sub: "unpaid + partial", icon: Receipt, link: "/platform/invoices" },
    { label: "Open tickets", value: data?.openTickets ?? "—", sub: "needs attention", icon: LifeBuoy, link: "/platform/support" },
    { label: "Compliance", value: `${complianceStats.needsAttention}`, sub: "schools need attention", icon: ShieldAlert, link: "/platform/schools" },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Cross-tenant overview of all schools on the platform.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.link}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <s.icon className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{s.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4" />6-month growth</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.trend ?? []}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis yAxisId="left" fontSize={12} />
                  <YAxis yAxisId="right" orientation="right" fontSize={12} />
                  <Tooltip />
                  <Line yAxisId="left" type="monotone" dataKey="schools" stroke="hsl(var(--primary))" name="New schools" strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="hsl(var(--chart-2, 142 76% 36%))" name="Revenue collected" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent schools</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(data?.recentSchools ?? []).length === 0 && <p className="text-muted-foreground">No schools yet.</p>}
            {(data?.recentSchools ?? []).map((s: any) => (
              <Link key={s.id} to="/platform/schools/$id" params={{ id: s.id }} className="flex justify-between items-center p-2 -mx-2 rounded hover:bg-muted">
                <span className="truncate">{s.name}</span>
                <Badge variant="outline" className="text-[10px] capitalize">{s.status}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent support tickets</CardTitle></CardHeader>
        <CardContent>
          {(data?.recentTickets ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent tickets.</p>
          ) : (
            <ul className="divide-y text-sm">
              {data!.recentTickets.map((t: any, i: number) => (
                <li key={i} className="py-2 flex justify-between items-center gap-2">
                  <span className="truncate">{t.subject ?? "(no subject)"}</span>
                  <Badge variant="outline" className="text-[10px] capitalize">{t.status?.replace(/_/g, " ")}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Filter className="w-4 h-4" />Collection funnel</CardTitle></CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.funnel ?? []} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" fontSize={11} />
                  <YAxis type="category" dataKey="stage" fontSize={12} width={90} />
                  <Tooltip formatter={(v: any) => `KES ${Number(v).toLocaleString()}`} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">School health</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="max-h-72 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>School</TableHead>
                    <TableHead className="text-right">Students</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schoolHealth.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">No schools yet.</TableCell></TableRow>
                  )}
                  {schoolHealth.map((s: any) => (
                    <TableRow key={s.school_id ?? s.id}>
                      <TableCell className="font-medium truncate max-w-[200px]">{s.name}</TableCell>
                      <TableCell className="text-right text-xs">{s.students ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs">{s.outstanding != null ? `KES ${Number(s.outstanding).toLocaleString()}` : "—"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px] capitalize">{s.status ?? "—"}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="w-4 h-4" />Legal &amp; compliance</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-80 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Docs verified</TableHead>
                  <TableHead className="text-right">Expiring</TableHead>
                  <TableHead className="text-right">Expired</TableHead>
                  <TableHead>Missing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {compliance.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">No compliance data yet.</TableCell></TableRow>
                )}
                {compliance.map((c: any) => (
                  <TableRow key={c.school_id}>
                    <TableCell>
                      <Link to="/platform/schools/$id" params={{ id: c.school_id }} className="font-medium hover:underline truncate max-w-[180px] block">
                        {c.school_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.legal_status === "verified" ? "default" : c.legal_status === "rejected" ? "destructive" : "secondary"} className="text-[10px] capitalize inline-flex items-center gap-1">
                        {c.legal_status === "verified" ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                        {String(c.legal_status).replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs">{c.documents_verified}/{c.documents_uploaded}</TableCell>
                    <TableCell className="text-right text-xs">
                      {c.documents_expiring > 0 ? <span className="text-amber-600 font-medium">{c.documents_expiring}</span> : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {c.documents_expired > 0 ? <span className="text-destructive font-medium">{c.documents_expired}</span> : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {[c.missing_kra_pin && "KRA PIN", c.missing_registration && "Registration no."].filter(Boolean).join(", ") || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader><CardTitle className="text-base">Quick links</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>• <Link to="/platform/schools" className="text-primary hover:underline">Add a new school</Link> to onboard a customer.</p>
          <p>• <Link to="/platform/plans" className="text-primary hover:underline">Manage subscription plans</Link> and pricing.</p>
          <p>• <Link to="/platform/invoices" className="text-primary hover:underline">Issue an invoice</Link> for the current billing period.</p>
        </CardContent>
      </Card>
    </div>
  );
}
