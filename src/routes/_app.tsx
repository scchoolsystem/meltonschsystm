import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalSearch } from "@/components/GlobalSearch";
import { NotificationsBell } from "@/components/NotificationsBell";
import { SchoolSplashScreen } from "@/components/SchoolSplashScreen";
import { supabase } from "@/integrations/supabase/client";
import { canAccessRoute, type AppRole } from "@/core/rbac";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    // Sessions live in localStorage, which only exists in the browser.
    // On the server (e.g. the very first render of a hard refresh) there is
    // no localStorage, so this check would always look "logged out" and
    // bounce the user to /login even when they have a valid session. Skip
    // it on the server and let the client (AppLayout below) verify the real
    // session once it hydrates and shows a branded loading screen instead.
    if (typeof window === "undefined") return;

    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      // Save the current path so login can redirect back after auth
      throw redirect({
        to: "/login",
        search: { redirect: location.pathname },
      });
    }
  },
  component: AppLayout,
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
  const navigate = useNavigate();

  // Once auth has finished loading client-side and there is genuinely no
  // session, send the user to login (this replaces the old server-side
  // redirect, which couldn't see the real session during SSR on refresh).
  useEffect(() => {
    if (!loading && !session) {
      navigate({ to: "/login", search: { redirect: path }, replace: true });
    }
  }, [loading, session, path, navigate]);

  if (loading || !session || !rolesLoaded) {
    return <SchoolSplashScreen />;
  }

  const appRoles = roles as AppRole[];

  // Only block access once roles are loaded AND user has roles assigned.
  // Never block while still loading (empty appRoles during load would deny everything).
  if (rolesLoaded && appRoles.length > 0 && path !== "/dashboard" && !canAccessRoute(appRoles, path)) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="max-w-md text-center space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Access denied</h2>
          <p className="text-sm text-muted-foreground">You do not have permission to view this page.</p>
          <a href="/dashboard" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground mt-2">Go to Dashboard</a>
        </div>
      </div>
    );
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
