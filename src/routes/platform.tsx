import { createFileRoute, Outlet, Link, redirect, useNavigate, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase, getSessionSafe } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Building2, Receipt, LifeBuoy, Package, LogOut, Loader2, Shield, Globe, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/platform")({
  beforeLoad: async ({ location }) => {
    // Don't guard the login page itself (avoid redirect loop)
    if (location.pathname === "/platform/login") return;
    const { data, timedOut } = await getSessionSafe();
    if (timedOut) return; // defer to client-side check rather than bouncing to login
    if (!data.session) {
      throw redirect({ to: "/platform/login", search: { redirect: location.href } });
    }
  },
  component: PlatformLayout,
});

// `key` drives visibility for a *scoped* platform_support user (see
// filterNav below). platform_owner and unrestricted platform_support
// (zero rows in platform_access_scopes) always see everything regardless
// of key.
const NAV = [
  { to: "/platform/dashboard", label: "Dashboard", icon: LayoutDashboard, key: "dashboard" },
  { to: "/platform/schools", label: "Schools", icon: Building2, key: "school" },
  { to: "/platform/invoices", label: "Billing", icon: Receipt, key: "school" },
  { to: "/platform/support", label: "Support", icon: LifeBuoy, key: "school" },
  { to: "/platform/plans", label: "Plans", icon: Package, key: "dashboard" },
  { to: "/platform/website", label: "Website Content", icon: Globe, key: "section:website_media" },
  { to: "/platform/team", label: "Team & Access", icon: Users, key: "owner" },
] as const;

function filterNav(nav: typeof NAV, roles: string[], scopes: { scope_type: string; section: string | null; school_id: string | null }[]) {
  if (roles.includes("platform_owner")) return nav;
  if (!roles.includes("platform_support")) return [];
  if (scopes.length === 0) return nav.filter((n) => n.key !== "owner"); // unrestricted support: everything but Team & Access

  const hasAnySchool = scopes.some((s) => s.scope_type === "school");
  const sectionKeys = new Set(scopes.filter((s) => s.scope_type === "section").map((s) => s.section));

  return nav.filter((n) => {
    if (n.key === "owner") return false;
    if (n.key === "school") return hasAnySchool;
    if (n.key === "dashboard") return false; // platform-wide numbers - not part of any scoped grant
    if (n.key.startsWith("section:")) return sectionKeys.has(n.key.slice("section:".length));
    return false;
  });
}

function PlatformLayout() {
  const { loading, session, roles, scopes, rolesLoaded, signOut } = useAuth();
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

  const visibleNav = filterNav(NAV, roles, scopes);

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
          {visibleNav.map((n) => {
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
