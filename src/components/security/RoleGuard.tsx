import type { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import type { AppRole } from "@/core/rbac";

type Props = {
  /** Required roles (any-of). Ignored if `module` is provided. */
  roles?: AppRole[];
  /** Module key from MODULE_PERMISSIONS (preferred). */
  module?: string;
  /** What to render when blocked. Defaults to null. */
  fallback?: ReactNode;
  children: ReactNode;
};

/**
 * Conditionally renders children based on the current user's roles.
 * Admin roles (super_admin, principal, deputy_principal, school_admin) bypass.
 */
export function RoleGuard({ roles, module, fallback = null, children }: Props) {
  const perms = usePermissions();
  const allowed = module
    ? perms.canAccess(module)
    : roles
      ? perms.hasAnyRole(roles)
      : true;
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
