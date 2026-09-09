import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

// Mirrors filterNav() in platform.tsx. That function only controls whether
// a sidebar link is *shown* — it never stopped someone from typing the URL
// directly, and the page components underneath it fetched + rendered their
// data unconditionally regardless of scope. This guard closes that gap: it
// runs before the page's own hooks/queries do (because it lives in a
// separate wrapper component — see usage below), so a scoped-out user gets
// a blocked screen instead of the page's data ever being requested.
export type PlatformScopeRequirement =
  | "owner"          // platform_owner only
  | "dashboard"      // owner, or fully-unrestricted platform_support
  | "school"         // owner, unrestricted support, or support with any school scope
  | { section: string }; // owner, unrestricted support, or support scoped to this section

function isAllowed(
  requirement: PlatformScopeRequirement,
  roles: string[],
  scopes: { scope_type: string; section: string | null; school_id: string | null }[],
): boolean {
  if (roles.includes("platform_owner")) return true;
  if (!roles.includes("platform_support")) return false;

  const unrestricted = scopes.length === 0;
  if (requirement === "owner") return false;
  if (requirement === "dashboard") return unrestricted;
  if (requirement === "school") return unrestricted || scopes.some((s) => s.scope_type === "school");
  return unrestricted || scopes.some((s) => s.scope_type === "section" && s.section === requirement.section);
}

export function PlatformScopeGuard({
  requirement,
  children,
}: {
  requirement: PlatformScopeRequirement;
  children: React.ReactNode;
}) {
  const { roles, scopes, rolesLoaded } = useAuth();

  // Parent /platform route already redirects unauthenticated users and
  // waits for rolesLoaded, but guard against a direct-render edge case.
  if (!rolesLoaded) return null;

  if (!isAllowed(requirement, roles as any, scopes)) {
    return (
      <div className="min-h-[60vh] grid place-items-center p-6">
        <div className="max-w-md text-center space-y-4">
          <ShieldAlert className="w-10 h-10 mx-auto text-destructive" />
          <h1 className="text-xl font-semibold">You don't have access to this section</h1>
          <p className="text-sm text-muted-foreground">
            Your platform access is restricted. If you need this, ask a platform owner to grant it from Team &amp; Access.
          </p>
          <Button asChild variant="outline">
            <Link to="/platform/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
