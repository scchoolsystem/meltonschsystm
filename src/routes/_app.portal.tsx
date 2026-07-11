import { useEffect, useRef, useState } from "react";
import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getSessionSafe, supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/with-timeout";

/**
 * /portal — the single Universal My Portal entry point.
 *
 * There is intentionally only one link anyone needs to remember or click:
 * "My Portal" → /portal. This route reads the signed-in user's roles and
 * dispatches to the right underlying experience:
 *
 *   - pure student            → /portal/student
 *   - pure parent             → /portal/parent
 *   - everyone else           → /portal/me (staff/teacher/admin workspace,
 *                                 which already personalizes itself further
 *                                 by role — see MyWorkspace in _app.portal.me.tsx)
 *
 * Multi-role users (e.g. a teacher who is also a parent) land on the richer
 * /portal/me workspace, which surfaces a card linking to their parent view
 * when applicable — see the "alsoHasOtherPortals" block in _app.portal.me.tsx.
 *
 * Any `?tab=...`, `?studentId=...` etc. query params are preserved, so every
 * existing deep link (emails, notifications, result/report-card links,
 * dashboard quick links) keeps working exactly as before, whether it points
 * at /portal or at the specific /portal/student|parent|me URL.
 *
 * WHY beforeLoad INSTEAD OF a client useEffect + navigate():
 * The previous version dispatched from inside the mounted component via a
 * client-side useEffect calling navigate(). That raced against the parent
 * `/_app` route's own beforeLoad, which re-runs its own session check on
 * EVERY navigation (see _app.tsx). Symptom in production: the URL bar would
 * update to e.g. /portal/student (history.replaceState fires client-side),
 * but the actual component never swapped in — the page stayed frozen on
 * this route's spinner forever, with zero console errors and zero network
 * requests for the target page's data, because the transition never
 * actually completed. Doing the redirect INSIDE beforeLoad instead makes it
 * part of the same atomic route-resolution pass as the parent's session
 * check (exactly how /login redirects already work in _app.tsx), instead of
 * a separate post-mount client navigation that can race and silently stall.
 */
export const Route = createFileRoute("/_app/portal")({
  beforeLoad: async ({ search, location }) => {
    // No window on the server — defer entirely to the client-side fallback
    // below (mirrors the identical guard in _app.tsx's beforeLoad).
    if (typeof window === "undefined") return;

    // Defense-in-depth: /portal/student, /portal/parent, /portal/me are no
    // longer nested under this route (see the trailing-underscore filenames
    // — _app.portal_.student.tsx etc. — which keep the same URLs but make
    // them siblings of /portal under /_app instead of children of it).
    // That's what actually stops the redirect loop this route used to
    // cause: this beforeLoad no longer re-runs on every navigation to a
    // child. This check just makes sure that stays true even if someone
    // re-nests a future route under here without realizing why it matters.
    if (location.pathname !== "/portal") return;

    const { data, timedOut } = await getSessionSafe();
    if (timedOut || !data.session?.user) {
      // Not a confirmed "no session" — just unresolved in time. Let the
      // component's own client-side fallback (which has its own timeout +
      // manual escape hatch) handle it instead of guessing here.
      return;
    }

    const { data: roleRows } = await withTimeout(
      supabase.from("user_roles").select("role").eq("user_id", data.session.user.id),
      4000,
      { data: [] as { role: string }[] } as any,
      "portal_dispatch_roles",
    );
    const roles = (roleRows ?? []).map((r: any) => r.role as string);
    if (roles.length === 0) return; // couldn't confirm roles in time — fall back to client-side

    const isStaffLike = roles.includes("staff") || roles.includes("teacher");
    const isPureStudent = roles.includes("student") && !isStaffLike;
    const isPureParent = roles.includes("parent") && !isStaffLike;
    const target = isPureStudent ? "/portal/student" : isPureParent ? "/portal/parent" : "/portal/me";

    throw redirect({ to: target, search: search as any, replace: true });
  },
  component: UniversalPortal,
});

function UniversalPortal() {
  const { hasRole, rolesLoaded } = useAuth();
  const navigate = useNavigate();
  // Fallback path — only reached if beforeLoad above couldn't confirm
  // session/roles in time (server render, or a timed-out check) and
  // deferred here instead. Defense in depth on top of the hasRole
  // memoization fix in use-auth.tsx: dispatch exactly once per mount
  // instead of re-running whenever hasRole's reference changes.
  const dispatched = useRef(false);
  const [failed, setFailed] = useState(false);
  // Same "stalled" pattern used throughout this app (_app.tsx,
  // _app.portal.student.tsx, etc.) — never leave a spinner with no way
  // out. If we're still here after 8s, something's wrong; show a manual
  // link instead of spinning forever.
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStalled(true), 8000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!rolesLoaded || dispatched.current) return;
    dispatched.current = true;

    const isStaffLike = hasRole("staff") || hasRole("teacher");
    const isPureStudent = hasRole("student") && !isStaffLike;
    const isPureParent = hasRole("parent") && !isStaffLike;

    const target = isPureStudent ? "/portal/student" : isPureParent ? "/portal/parent" : "/portal/me";

    // Preserve any existing query params (?tab=, ?studentId=, etc.) so every
    // existing deep link that points at /portal keeps working once dispatched.
    // .catch here is the fix for the silent-freeze bug: previously a failed
    // navigate() had nowhere to go, and the spinner just stayed up forever
    // with nothing in the console. Now it surfaces as a visible error state.
    navigate({ to: target, search: (prev) => prev, replace: true }).catch((err) => {
      console.error("[UniversalPortal] navigate() failed:", err);
      setFailed(true);
    });
  }, [rolesLoaded, hasRole, navigate]);

  if (failed || stalled) {
    return (
      <div className="p-6 grid place-items-center min-h-[50vh]">
        <div className="max-w-md text-center space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Taking longer than expected</h2>
          <p className="text-sm text-muted-foreground">
            We couldn't automatically open your portal. Pick where you'd like to go:
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/portal/student" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Student Portal</Link>
            <Link to="/portal/parent" className="inline-flex items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium">Parent Portal</Link>
            <Link to="/portal/me" className="inline-flex items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium">My Workspace</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 grid place-items-center">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}
