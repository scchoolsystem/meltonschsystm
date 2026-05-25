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
  | "leaving_certs";

export function useFeatureGate(): { isEnabled: (k: FeatureKey) => boolean; features: Record<string, boolean> } {
  const { features } = useTenant();
  const isEnabled = (k: FeatureKey) => features[k] !== false; // default-on
  return { isEnabled, features };
}
