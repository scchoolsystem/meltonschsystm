import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { moduleForPath } from "@/core/rbac";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fires a fire-and-forget `track_module_usage` RPC once per real
 * navigation, so /platform/operations can show genuine "N users actually
 * opened this this month" numbers instead of just role-based eligibility.
 *
 * Deliberately minimal:
 *  - No batching/queueing — one small upsert per nav, server-side
 *    ON CONFLICT collapses same-day repeats into a hit counter, so this
 *    never grows into a per-click event log.
 *  - Never blocks or throws into the render path. A dropped tracking call
 *    (offline, RLS edge case, etc.) should never be visible to the user —
 *    worst case a school's usage numbers are slightly undercounted.
 *  - Skips firing again for the exact same pathname back-to-back (guards
 *    against effect re-runs from unrelated re-renders, e.g. `school`
 *    getting a new object identity), but a real nav away and back fires
 *    again — that's a real second visit.
 */
export function useModuleUsageTracker(schoolId: string | null | undefined) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const lastTrackedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!schoolId) return;
    const key = `${schoolId}:${path}`;
    if (lastTrackedRef.current === key) return;
    lastTrackedRef.current = key;

    const mod = moduleForPath(path);
    if (!mod) return;

    (supabase as any)
      .rpc("track_module_usage", { _school_id: schoolId, _module: mod })
      .then(() => {})
      .catch(() => {
        // Best-effort only — see module doc comment above.
      });
  }, [schoolId, path]);
}
