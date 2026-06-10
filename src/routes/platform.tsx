import { createFileRoute, Outlet, Link, redirect, useNavigate, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Building2, Receipt, LifeBuoy, Package, LogOut, Loader2, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/platform")({
  beforeLoad: async ({ location }) => {
    // Don't guard the login page itself (avoid redirect loop)
    if (location.pathname === "/platform/login") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/platform/login", search: { redirect: location.href } });
    }
  },
  component: PlatformLayout,
});

const NAV = [
  { to: "/platform/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/platform/schools", label: "Schools", icon: Building2 },
  { to: "/platform/invoices", label: "Billing", icon: Receipt },
  { to: "/platform/support", label: "Support", icon: LifeBuoy },
  { to: "/platform/plans", label: "Plans", icon: Package },
] as const;

function PlatformLayout() {
  const { loading, session, roles, rolesLoaded, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Login page renders standalone (no sidebar / no auth chrome)
  if (location.pathname === "/platform/login") {
    return <Outlet />;
  }

  if (loading || !session || !rolesLoaded) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isPlatform = roles.includes("platform_owner") || roles.includes("platform_support");
  if (!isPlatform) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="max-w-md text-center space-y-4">
          <Shield className="w-10 h-10 mx-auto text-destructive" />
          <h1 className="text-2xl font-semibold">Not authorised</h1>
          <p className="text-sm text-muted-foreground">
            This portal is for platform administrators only. Your account does not have access.
          </p>
          <Button variant="outline" onClick={async () => { await signOut(); navigate({ to: "/platform/login" }); }}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex w-full bg-background">
      <aside className="w-60 border-r bg-card/40 flex flex-col">
        <div className="h-14 px-4 flex items-center gap-2 border-b">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground grid place-items-center">
            <Shield className="w-4 h-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Platform Admin</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">SmartDev ERP</div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV.map((n) => {
            const active = location.pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                  active ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <n.icon className="w-4 h-4" /> {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={async () => { await signOut(); navigate({ to: "/platform/login" }); }}
          >
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
