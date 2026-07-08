import { useCallback, useMemo } from "react";
import { useTenant } from "@/hooks/use-tenant";

/**
 * Feature keys correspond to optional modules a school may enable/disable.
 * Default = enabled (true) when no explicit row exists in `school_features`.
 */
export type FeatureKey =
  | "library"
  | "boarding"
  | "kitchen"
  | "transport"
  | "clinic"
  | "security"
  | "finance"
  | "discipline"
  | "timetable"
  | "announcements"
  | "id_cards"
  | "leaving_certs"
  | "classroom"
  | "live_classes"
  | "communications";

export function useFeatureGate(): { isEnabled: (k: FeatureKey) => boolean; features: Record<string, boolean> } {
  const { features } = useTenant();
  // Memoized so consumers can safely put `isEnabled` or the returned object
  // in a useEffect/useMemo dependency array without it changing on every
  // render (same reasoning as the AuthProvider/TenantProvider context values).
  const isEnabled = useCallback((k: FeatureKey) => features[k] !== false, [features]); // default-on
  return useMemo(() => ({ isEnabled, features }), [isEnabled, features]);
}
