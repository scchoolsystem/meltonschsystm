import { createFileRoute, Outlet, Link, redirect, useNavigate, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase, getSessionSafe } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  LayoutDashboard, Building2, Receipt, LifeBuoy, Package, LogOut, Loader2, Shield, Globe, Users, Menu, Activity, GraduationCap,
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
// of key. Every page below is independently grantable as its own
// "section:*" scope — see PLATFORM_SECTIONS in Platform.team.tsx.
const NAV = [
  { to: "/platform/dashboard", label: "Dashboard", icon: LayoutDashboard, key: "section:dashboard" },
  { to: "/platform/operations", label: "Operations & Usage", icon: Activity, key: "section:operations" },
  { to: "/platform/schools", label: "Schools", icon: Building2, key: "section:schools" },
  { to: "/platform/invoices", label: "Billing", icon: Receipt, key: "section:invoices" },
  { to: "/platform/support", label: "Support", icon: LifeBuoy, key: "section:support" },
  { to: "/platform/plans", label: "Plans", icon: Package, key: "section:plans" },
  { to: "/platform/website", label: "Website Content", icon: Globe, key: "section:website_media" },
  { to: "/platform/learning", label: "SmartDev Learning", icon: GraduationCap, key: "section:learning" },
  { to: "/platform/team", label: "Team & Access", icon: Users, key: "owner" },
] as const;

function filterNav(nav: typeof NAV, roles: string[], scopes: { scope_type: string; section: string | null; school_id: string | null }[]) {
  if (roles.includes("platform_owner")) return nav;
  if (!roles.includes("platform_support")) return [];
  if (scopes.length === 0) return nav.filter((n) => n.key !== "owner"); // unrestricted support: everything but Team & Access

  const sectionKeys = new Set(scopes.filter((s) => s.scope_type === "section").map((s) => s.section));

  return nav.filter((n) => {
    if (n.key === "owner") return false;
    if (n.key.startsWith("section:")) return sectionKeys.has(n.key.slice("section:".length));
    return false;

  });
}

// The page a person should land on right after login, or when a
// PlatformScopeGuard sends them "back" from a page they can't see — the
// first thing in their own filtered nav, not a hardcoded /platform/dashboard
// that a restricted person might not even be able to open.
export function getDefaultPlatformRoute(
  roles: string[],
  scopes: { scope_type: string; section: string | null; school_id: string | null }[],
): string {
  const visible = filterNav(NAV, roles, scopes);
  return visible[0]?.to ?? "/platform/dashboard";
}

function PlatformLayout() {
  const { loading, session, roles, scopes, rolesLoaded, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/platform/login" });
  };

  const brand = (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground grid place-items-center shrink-0">
        <Shield className="w-4 h-4" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold">Platform Admin</div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">SmartDev ERP</div>
      </div>
    </div>
  );

  const navLinks = (onNavigate?: () => void) => (
    <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
      {visibleNav.map((n) => {
        const active = location.pathname.startsWith(n.to);
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <n.icon className="w-4 h-4 shrink-0" />
            <span className="truncate">{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Desktop sidebar — hidden below md, where the mobile top bar + drawer take over */}
      <aside className="hidden md:flex w-60 shrink-0 border-r bg-card/40 flex-col">
        <div className="h-14 px-4 flex items-center border-b">{brand}</div>
        {navLinks()}
        <div className="p-3 border-t">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden h-14 px-3 flex items-center justify-between border-b bg-card/60 sticky top-0 z-30">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setMobileNavOpen(true)} aria-label="Open menu">
              <Menu className="w-5 h-5" />
            </Button>
            <div className="w-7 h-7 rounded-md bg-primary text-primary-foreground grid place-items-center shrink-0">
              <Shield className="w-3.5 h-3.5" />
            </div>
            <span className="text-sm font-semibold truncate">Platform Admin</span>
          </div>
          <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Sign out">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>

        {/* Mobile nav drawer */}
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="p-0 flex flex-col w-72 max-w-[85vw]">
            <div className="h-14 px-4 flex items-center border-b">{brand}</div>
            {navLinks(() => setMobileNavOpen(false))}
            <div className="p-3 border-t">
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSignOut}>
                <LogOut className="w-4 h-4 mr-2" /> Sign out
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <main className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
