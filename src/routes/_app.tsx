import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalSearch } from "@/components/GlobalSearch";
import { NotificationsBell } from "@/components/NotificationsBell";
import { SchoolSplashScreen } from "@/components/SchoolSplashScreen";
import { getSessionSafe } from "@/integrations/supabase/client";
import { canAccessRoute, type AppRole } from "@/core/rbac";

// beforeLoad re-runs on EVERY navigation under /_app (every tab click:
// timetable -> analytics -> finance...), and previously did a full awaited
// getSessionSafe() call each time before the router would swap the UI —
// the URL updates instantly, but the new page sits frozen until this
// resolves. AuthProvider (use-auth.tsx) already tracks the session
// reactively via onAuthStateChange and calls router.invalidate() the
// moment a user signs out, so re-verifying from scratch on every click is
// redundant. Cache a "verified recently" flag with a short TTL: first
// load / hard refresh still does the real check, but rapid tab switching
// within that window skips straight through instead of re-awaiting
// Supabase each time.
const SESSION_CACHE_MS = 60_000;
let lastVerifiedAt = 0;

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    // Sessions live in localStorage, which only exists in the browser.
    // On the server (e.g. the very first render of a hard refresh) there is
    // no localStorage, so this check would always look "logged out" and
    // bounce the user to /login even when they have a valid session. Skip
    // it on the server and let the client (AppLayout below) verify the real
    // session once it hydrates and shows a branded loading screen instead.
    if (typeof window === "undefined") return;

    // Within the cache window, trust the last confirmed check instead of
    // re-awaiting Supabase on every nav. A genuine sign-out is still caught
    // immediately because AuthProvider's onAuthStateChange handler calls
    // router.invalidate() on logout, which re-runs beforeLoad regardless of
    // this cache.
    if (Date.now() - lastVerifiedAt < SESSION_CACHE_MS) return;

    // See getSessionSafe() for why this must be timeout-guarded — an
    // unguarded hang here blocks the entire route transition forever: no
    // paint, no CPU usage, just a permanently pending navigation. That's
    // the "click My Workspace and everything freezes" bug — it's not a
    // render-time freeze, it's a stuck nav guard.
    const { data, error, timedOut } = await getSessionSafe();
    if (timedOut) return; // defer to AppLayout's client-side check below
    if (error || !data.session) {
      // Save the current path so login can redirect back after auth
      throw redirect({
        to: "/login",
        search: { redirect: location.pathname },
      });
    }
    lastVerifiedAt = Date.now();
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
  const { loading, session, roles, rolesLoaded, sessionChecked } = useAuth();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();

  // Once auth has finished loading client-side and there is genuinely no
  // session, send the user to login (this replaces the old server-side
  // redirect, which couldn't see the real session during SSR on refresh).
  //
  // Gated on `sessionChecked`, not just `!loading` — `loading` can flip
  // false purely because AuthProvider's 5s safety timer ran out, which
  // happens on a fixed clock regardless of whether the real session check
  // is hung or just slow (expected under the documented supabase-js lock
  // contention). Redirecting on `!loading && !session` alone force-logs-out
  // a legitimately-authenticated user mid-check: they get bounced to
  // /login, and only get bounced back once the real check finally
  // resolves seconds later — a jarring false-positive logout, not a real
  // one. Waiting for `sessionChecked` means we only ever redirect once we
  // have a confirmed "no session" answer, never a merely-timed-out one.
  useEffect(() => {
    if (!loading && !session && sessionChecked) {
      navigate({ to: "/login", search: { redirect: path }, replace: true });
    }
  }, [loading, session, sessionChecked, path, navigate]);

  // If we still don't have a confirmed answer after a generous grace
  // period, don't spin forever either — offer a manual way out instead of
  // silently waiting or (worse) guessing and redirecting incorrectly.
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (sessionChecked) { setStalled(false); return; }
    const t = setTimeout(() => setStalled(true), 15000);
    return () => clearTimeout(t);
  }, [sessionChecked]);

  if (stalled && !sessionChecked) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="max-w-md text-center space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Still checking your session</h2>
          <p className="text-sm text-muted-foreground">This is taking longer than usual. Your session may still be valid — try refreshing rather than logging in again.</p>
          <button onClick={() => window.location.reload()} className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Refresh</button>
        </div>
      </div>
    );
  }

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
