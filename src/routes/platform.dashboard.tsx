import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Receipt, LifeBuoy, DollarSign } from "lucide-react";

export const Route = createFileRoute("/platform/dashboard")({
  component: PlatformDashboard,
});

function PlatformDashboard() {
  const { data } = useQuery({
    queryKey: ["platform-stats"],
    queryFn: async () => {
      const [schoolsRes, subsRes, invRes, ticketsRes] = await Promise.all([
        supabase.from("schools").select("id,status"),
        supabase.from("school_subscriptions").select("plan_id,status, subscription_plans(monthly_fee)"),
        supabase.from("platform_invoices").select("amount,paid,status"),
        supabase.from("support_tickets").select("status"),
      ]);
      const schools = schoolsRes.data ?? [];
      const subs = (subsRes.data ?? []) as any[];
      const invoices = invRes.data ?? [];
      const tickets = ticketsRes.data ?? [];

      const mrr = subs
        .filter((s) => s.status === "active")
        .reduce((sum, s) => sum + Number(s.subscription_plans?.monthly_fee ?? 0), 0);

      return {
        totalSchools: schools.length,
        activeSchools: schools.filter((s) => s.status === "active").length,
        suspendedSchools: schools.filter((s) => s.status === "suspended").length,
        mrr,
        outstanding: invoices.reduce((s, i: any) => s + (Number(i.amount) - Number(i.paid)), 0),
        openTickets: tickets.filter((t: any) => t.status === "open" || t.status === "in_progress").length,
      };
    },
  });

  const stats = [
    { label: "Total schools", value: data?.totalSchools ?? "—", sub: `${data?.activeSchools ?? 0} active`, icon: Building2, link: "/platform/schools" },
    { label: "Monthly recurring", value: data ? `KES ${data.mrr.toLocaleString()}` : "—", sub: "from active plans", icon: DollarSign, link: "/platform/plans" },
    { label: "Outstanding billing", value: data ? `KES ${data.outstanding.toLocaleString()}` : "—", sub: "unpaid + partial", icon: Receipt, link: "/platform/invoices" },
    { label: "Open tickets", value: data?.openTickets ?? "—", sub: "needs attention", icon: LifeBuoy, link: "/platform/support" },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Cross-tenant overview of all schools on the platform.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

      <Card>
        <CardHeader><CardTitle>Quick links</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>• <Link to="/platform/schools" className="text-primary hover:underline">Add a new school</Link> to onboard a customer.</p>
          <p>• <Link to="/platform/plans" className="text-primary hover:underline">Manage subscription plans</Link> and pricing.</p>
          <p>• <Link to="/platform/invoices" className="text-primary hover:underline">Issue an invoice</Link> for the current billing period.</p>
        </CardContent>
      </Card>
    </div>
  );
}
