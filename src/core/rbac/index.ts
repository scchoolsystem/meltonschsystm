// Centralized RBAC helpers. Additive — does not replace useAuth().hasRole().
import {
  MODULE_PERMISSIONS,
  ADMIN_ROLES,
  PLATFORM_ROLES,
  moduleForPath,
  type AppRole,
} from "./permissions";

export { moduleForPath };
export type { AppRole };

export function hasAnyRole(userRoles: AppRole[], required: AppRole[]): boolean {
  if (!required || required.length === 0) return true;
  return required.some((r) => userRoles.includes(r));
}

export function isAdminRole(userRoles: AppRole[]): boolean {
  return userRoles.some((r) => ADMIN_ROLES.includes(r));
}

export function isPlatformRole(userRoles: AppRole[]): boolean {
  return userRoles.some((r) => PLATFORM_ROLES.includes(r));
}

/** True if the user can access the given module. Admins implicitly allowed. */
export function canAccess(userRoles: AppRole[], moduleKey: string): boolean {
  if (!userRoles || userRoles.length === 0) return false;
  const allowed = MODULE_PERMISSIONS[moduleKey];
  // Unknown module: deny by default (safer than allow).
  if (!allowed) return isAdminRole(userRoles);
  // Empty array means "any authenticated user".
  if (allowed.length === 0) return true;
  if (isAdminRole(userRoles)) return true;
  return hasAnyRole(userRoles, allowed);
}

/** True if the user can navigate to the given route path. */
export function canAccessRoute(userRoles: AppRole[], pathname: string): boolean {
  const mod = moduleForPath(pathname);
  if (!mod) return true;
  return canAccess(userRoles, mod);
}

/**
 * Merge a multi-role user's effective module access into a flat set.
 * Highest privilege wins implicitly because admins short-circuit canAccess.
 */
export function mergeUserPermissions(userRoles: AppRole[]): Set<string> {
  const modules = new Set<string>();
  for (const key of Object.keys(MODULE_PERMISSIONS)) {
    if (canAccess(userRoles, key)) modules.add(key);
  }
  return modules;
}

export type NavItem = {
  module: string;
  label: string;
  to: string;
  group?: string;
};

/** Master navigation registry. Filtered by getNavigationFor(). */
export const NAV_REGISTRY: NavItem[] = [
  { module: "dashboard", label: "Dashboard", to: "/dashboard", group: "Main" },
  { module: "students", label: "Students", to: "/students", group: "People" },
  { module: "staff", label: "Staff", to: "/staff", group: "People" },
  { module: "classes", label: "Classes", to: "/classes", group: "Academics" },
  { module: "subjects", label: "Subjects", to: "/academics/subjects", group: "Academics" },
  { module: "exams", label: "Exams", to: "/academics/exams", group: "Academics" },
  { module: "marks", label: "Marks", to: "/academics/marks", group: "Academics" },
  { module: "results", label: "Results", to: "/academics/results", group: "Academics" },
  { module: "report-cards-admin", label: "Report Cards", to: "/academics/report-cards", group: "Academics" },
  { module: "attendance", label: "Attendance", to: "/attendance", group: "Academics" },
  { module: "timetable", label: "Timetable", to: "/timetable", group: "Academics" },
  { module: "finance", label: "Fees & Finance", to: "/finance/fees", group: "Operations" },
  { module: "library", label: "Library", to: "/library", group: "Operations" },
  { module: "boarding", label: "Boarding", to: "/boarding", group: "Operations" },
  { module: "kitchen", label: "Kitchen", to: "/kitchen", group: "Operations" },
  { module: "clinic", label: "Clinic", to: "/clinic", group: "Operations" },
  { module: "transport", label: "Transport", to: "/transport", group: "Operations" },
  { module: "security", label: "Security", to: "/security", group: "Operations" },
  { module: "discipline", label: "Discipline", to: "/discipline", group: "Operations" },
  { module: "announcements", label: "Announcements", to: "/announcements", group: "Communication" },
  { module: "analytics", label: "Analytics", to: "/analytics", group: "Insights" },
  { module: "portal", label: "My Portal", to: "/portal", group: "Portal" },
];

export function getNavigationFor(userRoles: AppRole[]): NavItem[] {
  return NAV_REGISTRY.filter((item) => canAccess(userRoles, item.module));
}
