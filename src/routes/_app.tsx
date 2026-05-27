import { createFileRoute, Outlet, redirect, useRouterState, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Loader2 } from "lucide-react";
import { GlobalSearch } from "@/components/GlobalSearch";
import { NotificationsBell } from "@/components/NotificationsBell";
import { supabase } from "@/integrations/supabase/client";
import { canAccessRoute, type AppRole } from "@/core/rbac";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

function AppLayout() {
  const { loading, session, roles } = useAuth();
  const path = useRouterState({ select: (r) => r.location.pathname });

  if (loading || !session) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Centralized route guard: block direct-URL access to unauthorized modules.
  // Admins bypass implicitly inside canAccessRoute(). Dashboard is always allowed.
  const appRoles = roles as AppRole[];
  if (path !== "/dashboard" && !canAccessRoute(appRoles, path)) {
    return <Navigate to="/dashboard" />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b flex items-center px-4 gap-3 bg-card/60 backdrop-blur sticky top-0 z-10">
            <SidebarTrigger />
            <div className="hidden md:block"><GlobalSearch /></div>
            <div className="ml-auto flex items-center gap-1">
              <NotificationsBell />
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

