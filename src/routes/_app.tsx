import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Loader2 } from "lucide-react";
import { GlobalSearch } from "@/components/GlobalSearch";
import { NotificationsBell } from "@/components/NotificationsBell";
import { supabase } from "@/integrations/supabase/client";
import { canAccessRoute, type AppRole } from "@/core/rbac";

export const Route = createFileRoute("/_app")({
  // Wave 1, Fix C-3: use getUser() (re-validates with Auth server) instead of
  // getSession() (reads local storage only). Avoids double-bounce on hard
  // refresh when local session is stale or absent.
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
  },
  component: AppLayout,
  // Wave 3: authenticated-area boundaries (root cascades, these keep chrome).
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <button onClick={() => reset()} className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Try again</button>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="max-w-md text-center space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Page not found</h2>
        <p className="text-sm text-muted-foreground">The page you are looking for does not exist.</p>
      </div>
    </div>
  ),
});

function AppLayout() {
  const { loading, session, roles, rolesLoaded } = useAuth();
  const path = useRouterState({ select: (r) => r.location.pathname });

  if (loading || !session || !rolesLoaded) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Wave 1, Fix C-3: drop the client-side <Navigate /> fallback. beforeLoad
  // already guarantees a user; for unauthorized routes throw a router
  // redirect so the URL bar stays consistent and no second render flashes.
  const appRoles = roles as AppRole[];
  if (path !== "/dashboard" && !canAccessRoute(appRoles, path)) {
    throw redirect({ to: "/dashboard" });
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
