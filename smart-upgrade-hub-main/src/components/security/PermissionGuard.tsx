import type { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";

type Props = {
  /** Module key to check (e.g. "finance", "admin.users"). */
  permission: string;
  fallback?: ReactNode;
  children: ReactNode;
};

/**
 * Fine-grained permission gate. Wraps any UI element (button, widget, table
 * column, form field). Renders `fallback` (default: null) when denied.
 *
 * Example: <PermissionGuard permission="finance"><FeesWidget /></PermissionGuard>
 */
export function PermissionGuard({ permission, fallback = null, children }: Props) {
  const { canAccess } = usePermissions();
  if (!canAccess(permission)) return <>{fallback}</>;
  return <>{children}</>;
}
