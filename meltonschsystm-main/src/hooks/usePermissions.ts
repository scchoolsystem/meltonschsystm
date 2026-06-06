// Thin client-side hook wrapping the RBAC helpers. Use alongside useAuth().
import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  canAccess,
  canAccessRoute,
  getNavigationFor,
  hasAnyRole,
  isAdminRole,
  isPlatformRole,
  mergeUserPermissions,
  type AppRole,
} from "@/core/rbac";

export function usePermissions() {
  const { roles } = useAuth();
  const appRoles = roles as AppRole[];

  return useMemo(() => ({
    roles: appRoles,
    isAdmin: isAdminRole(appRoles),
    isPlatform: isPlatformRole(appRoles),
    canAccess: (moduleKey: string) => canAccess(appRoles, moduleKey),
    canAccessRoute: (pathname: string) => canAccessRoute(appRoles, pathname),
    hasAnyRole: (required: AppRole[]) => hasAnyRole(appRoles, required),
    navigation: getNavigationFor(appRoles),
    allowedModules: mergeUserPermissions(appRoles),
  }), [appRoles]);
}
