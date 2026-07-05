// Analytics module registry.
// Mirrors the pattern in ./dashboard.ts: a declarative list the route reads
// from, rather than each module hand-rolling its own role.includes(...) check.
// To add a new analytics module in future: add one entry here, add its
// permission key to permissions.ts, and add one tab component. Nothing else
// in the app needs to change.
import { canAccess, type AppRole } from "./index";

export type AnalyticsModuleKey =
  | "overview" | "academics" | "finance" | "library" | "kitchen" | "store"
  | "transport" | "clinic" | "security" | "sports" | "discipline" | "boarding";

export interface AnalyticsModuleDef {
  key: AnalyticsModuleKey;
  label: string;
  /** Permission key checked via canAccess(). null = visible to anyone who can open the page. */
  permission: string | null;
}

export const ANALYTICS_MODULES: AnalyticsModuleDef[] = [
  { key: "overview", label: "Overview", permission: null },
  { key: "academics", label: "Academics", permission: "analytics.academics" },
  { key: "finance", label: "Finance", permission: "analytics.finance" },
  { key: "library", label: "Library", permission: "analytics.library" },
  { key: "kitchen", label: "Kitchen", permission: "analytics.kitchen" },
  { key: "store", label: "Store", permission: "analytics.store" },
  { key: "transport", label: "Transport", permission: "analytics.transport" },
  { key: "clinic", label: "Clinic", permission: "analytics.clinic" },
  { key: "security", label: "Security", permission: "analytics.security" },
  { key: "sports", label: "Sports", permission: "analytics.sports" },
  { key: "discipline", label: "Discipline", permission: "analytics.discipline" },
  { key: "boarding", label: "Boarding", permission: "analytics.boarding" },
];

/** Returns the analytics module keys the given roles are allowed to see. */
export function getVisibleAnalyticsModules(userRoles: AppRole[]): AnalyticsModuleKey[] {
  return ANALYTICS_MODULES
    .filter((m) => m.permission === null || canAccess(userRoles, m.permission))
    .map((m) => m.key);
}
