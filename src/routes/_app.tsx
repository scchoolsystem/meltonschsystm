import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useTenant } from "@/hooks/use-tenant";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Loader2, ShieldOff } from "lucide-react";
import { GlobalSearch } from "@/components/GlobalSearch";
import { NotificationsBell } from "@/components/NotificationsBell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

function AppLayout() {
  const { loading, session, signOut } = useAuth();
  const { school, error: tenantError, loading: tenantLoading, isPlatformHost } = useTenant();

  // Still resolving auth or tenant
  if (loading || tenantLoading || !session) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // School is suspended or not found — block access even with a valid session
  // Platform host users bypass this (they have no school context)
  if (!isPlatformHost && (tenantError || !school)) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="max-w-md text-center space-y-4">
          <ShieldOff className="w-10 h-10 mx-auto text-destructive" />
          <h1 className="text-2xl font-semibold">Portal Unavailable</h1>
          <p className="text-sm text-muted-foreground">
            {tenantError ?? "This school portal is not currently available."}
          </p>
          <button
            onClick={() => signOut()}
            className="mt-2 text-sm underline text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
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

