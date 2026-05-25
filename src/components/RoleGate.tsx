import type { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { isAdminRole } from "@/lib/role-experience";

/**
 * RoleGate — permission-based component visibility.
 * Unauthorized users see `fallback` (default: nothing).
 *
 * <RoleGate roles={["bursar", "finance_admin"]}> ... </RoleGate>
 * <RoleGate any={["class_teacher","subject_teacher"]}> ... </RoleGate>
 * <RoleGate adminOnly> ... </RoleGate>
 */
export function RoleGate({
  roles,
  any,
  adminOnly,
  children,
  fallback = null,
}: {
  roles?: string[];
  any?: string[];
  adminOnly?: boolean;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { roles: userRoles } = useAuth();
  const r = userRoles as string[];

  if (isAdminRole(r)) return <>{children}</>;
  if (adminOnly) return <>{fallback}</>;

  const required = roles ?? any ?? [];
  if (!required.length) return <>{children}</>;

  const ok = required.some((role) => r.includes(role));
  return <>{ok ? children : fallback}</>;
}
