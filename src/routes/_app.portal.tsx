import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

/**
 * /portal — the single Universal My Portal entry point.
 *
 * There is intentionally only one link anyone needs to remember or click:
 * "My Portal" → /portal. This route reads the signed-in user's roles and
 * silently dispatches to the right underlying experience:
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
 */
export const Route = createFileRoute("/_app/portal")({
  component: UniversalPortal,
});

function UniversalPortal() {
  const { hasRole, rolesLoaded } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!rolesLoaded) return;

    const isStaffLike = hasRole("staff") || hasRole("teacher");
    const isPureStudent = hasRole("student") && !isStaffLike;
    const isPureParent = hasRole("parent") && !isStaffLike;

    const target = isPureStudent ? "/portal/student" : isPureParent ? "/portal/parent" : "/portal/me";

    // Preserve any existing query params (?tab=, ?studentId=, etc.) so every
    // deep link that points at /portal keeps working once dispatched.
    navigate({ to: target, search: (prev) => prev, replace: true });
  }, [rolesLoaded, hasRole, navigate]);

  return (
    <div className="p-6 grid place-items-center">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}
