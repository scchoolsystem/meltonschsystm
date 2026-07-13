import { createContext, useContext, useEffect, useState, useMemo, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

// Capacitor Preferences is only available inside the Android/iOS native shell.
// Importing it statically crashes the Tauri desktop build because the
// Capacitor bridge doesn't exist there. Load it lazily instead.
async function getCapacitorPreferences() {
  const { Preferences } = await import("@capacitor/preferences");
  return Preferences;
}

export type School = {
  id: string;
  slug: string;
  name: string;
  motto: string | null;
  primary_color: string | null;
  logo_url: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  academic_year: number | null;
  current_term: string | null;
  status: string;
};

export const PLATFORM_SLUG = "__platform__";
const STORAGE_KEY = "smartdev_school_slug";

export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  if ((window as any).__TAURI__ !== undefined) return true;
  if ((window as any).__TAURI_INTERNALS__ !== undefined) return true;
  const proto = window.location.protocol;
  return proto === "tauri:" || proto === "https:" && window.location.hostname === "tauri.localhost";
}

export function isCapacitor(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as any)?.Capacitor?.isNativePlatform?.() === true
  );
}

export function isNativeApp(): boolean {
  return isTauri() || isCapacitor();
}

async function storageGet(key: string): Promise<string | null> {
  if (isTauri()) return localStorage.getItem(key);
  if (isCapacitor()) {
    const Preferences = await getCapacitorPreferences();
    const { value } = await Preferences.get({ key });
    return value;
  }
  return null;
}

async function storageSet(key: string, value: string): Promise<void> {
  if (isTauri()) { localStorage.setItem(key, value); return; }
  if (isCapacitor()) {
    const Preferences = await getCapacitorPreferences();
    await Preferences.set({ key, value });
  }
}

async function storageRemove(key: string): Promise<void> {
  if (isTauri()) { localStorage.removeItem(key); return; }
  if (isCapacitor()) {
    const Preferences = await getCapacitorPreferences();
    await Preferences.remove({ key });
  }
}

// Diagnostic helper: races `promise` against a per-step timeout so we can
// tell the caller exactly *which* step got stuck, instead of one generic
// "timed out" message covering several sequential operations. This is a
// temporary instrumentation aid — see SchoolPicker.tsx for where the
// resulting stage/error text gets shown to the user.
function stageTimeout<T>(label: string, promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => {
        const err: any = new Error(`Stuck at: ${label} (exceeded ${Math.round(ms / 1000)}s)`);
        err.name = "StageTimeout";
        err.stage = label;
        reject(err);
      }, ms)
    ),
  ]);
}

type TenantState = {
  school: School | null;
  slug: string | null;
  isPlatformHost: boolean;
  features: Record<string, boolean>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setSchoolSlug: (slug: string, onStage?: (stage: string) => void) => Promise<void>;
  clearSchoolSlug: () => Promise<void>;
};

const TenantContext = createContext<TenantState>({
  school: null, slug: null, isPlatformHost: false, features: {},
  loading: true, error: null,
  refresh: async () => {}, setSchoolSlug: async () => {}, clearSchoolSlug: async () => {},
});

export function getSubdomainSlug(hostname: string): string | null {
  const host = hostname.toLowerCase().split(":")[0];
  if (host === "admin.smartdev.co.ke" || host === "admin.erp.smartdev.co.ke") return PLATFORM_SLUG;
  if (host === "localhost" || /^[\d.]+$/.test(host)) return null;
  if (host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com")) return null;
  if (["smartdev.co.ke","www.smartdev.co.ke","app.smartdev.co.ke","erp.smartdev.co.ke"].includes(host)) return null;
  const LEGACY_ROOT = "erp.smartdev.co.ke";
  if (host.endsWith("." + LEGACY_ROOT)) return host.slice(0, host.length - LEGACY_ROOT.length - 1) || null;
  const ROOT = "smartdev.co.ke";
  if (host.endsWith("." + ROOT)) return host.slice(0, host.length - ROOT.length - 1) || null;
  const parts = host.split(".");
  if (parts.length >= 3) return parts[0];
  return null;
}

async function resolveSlug(): Promise<string | null> {
  if (isNativeApp()) return storageGet(STORAGE_KEY);
  if (typeof window !== "undefined") return getSubdomainSlug(window.location.hostname);
  return null;
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [school, setSchool] = useState<School | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);

  const isPlatformHost = slug === PLATFORM_SLUG;

  useEffect(() => {
    if (isNativeApp()) return;
    if (typeof window === "undefined") return;
    const host = window.location.hostname.toLowerCase().split(":")[0];
    const allowed = ["smartdev.co.ke","www.smartdev.co.ke","app.smartdev.co.ke","admin.smartdev.co.ke","localhost"];
    if (host.endsWith(".smartdev.co.ke") && !allowed.includes(host)) {
      window.location.href = "https://app.smartdev.co.ke";
    }
  }, []);

  // Memoized: `refresh`/`setSchoolSlug` below close over this function, and
  // both end up in the provider's memoized context value (see the note on
  // AuthProvider in use-auth.tsx for why an unstable context value/closure
  // at this level of the tree is dangerous — any consumer that puts
  // `refresh` in a useEffect/useMemo dependency array needs it to only
  // change when it actually needs to re-run, not on every render).
  const loadSchool = useCallback(async (targetSlug: string | null, onStage?: (stage: string) => void) => {
    setLoading(true); setError(null);
    try {
      if (!targetSlug || targetSlug === PLATFORM_SLUG) {
        setSchool(null); setFeatures({}); setLoading(false); return;
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      try {
        onStage?.("Looking up your school...");
        const { data, error: qErr } = await stageTimeout(
          "looking up your school (schools table)",
          supabase.from("schools").select("*").eq("slug", targetSlug).maybeSingle().abortSignal(controller.signal),
          18000
        );
        if (qErr) throw qErr;
        if (!data) { setError(`School "${targetSlug}" not found`); setSchool(null); return; }
        setSchool(data as School);

        onStage?.("Loading school settings...");
        const { data: flags } = await stageTimeout(
          "loading school settings (school_features table)",
          supabase.from("school_features").select("feature_key,enabled").eq("school_id", data.id).abortSignal(controller.signal),
          18000
        );
        const map: Record<string, boolean> = {};
        (flags ?? []).forEach((f: any) => { map[f.feature_key] = f.enabled; });
        setFeatures(map);
        onStage?.("Done");
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (e: any) {
      if (e?.name === "StageTimeout") {
        setError(`${e.stage.charAt(0).toUpperCase() + e.stage.slice(1)} timed out. Check your internet connection and try again.`);
      } else {
        setError(e?.name === "AbortError" ? "Loading the school timed out. Check your internet connection and try again." : (e.message ?? "Failed to load school"));
      }
      setSchool(null);
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 5000);
    resolveSlug().then((resolved) => { setSlug(resolved); return loadSchool(resolved); })
      .catch(() => setLoading(false))
      .finally(() => clearTimeout(timer));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, []);

  useEffect(() => {
    if (school?.primary_color && typeof document !== "undefined")
      document.documentElement.style.setProperty("--brand-primary", school.primary_color);
    if (typeof document !== "undefined")
      document.title = isPlatformHost ? "Platform Admin — SmartDev ERP" : school?.name ? `${school.name} — ERP` : "SmartDev ERP";
  }, [school, isPlatformHost]);

  const setSchoolSlug = useCallback(async (newSlug: string, onStage?: (stage: string) => void) => {
    onStage?.("Saving your selection...");
    // Previously this awaited storageSet() before ever starting loadSchool().
    // Supabase logs confirmed zero requests to `schools`/`school_features`
    // during a failed selection — meaning if the native Preferences bridge
    // call hangs, the school query never even fires. Fix: run the storage
    // write and the school lookup in PARALLEL. storageSet keeps its own
    // timeout so a hang there is logged and swallowed instead of blocking
    // anything or crashing the app.
    const savePromise = stageTimeout(
      "saving your selection to device storage",
      storageSet(STORAGE_KEY, newSlug),
      8000
    ).catch((e) => {
      console.warn("[setSchoolSlug] storageSet failed or timed out:", e?.message ?? e);
    });
    setSlug(newSlug);
    await Promise.all([savePromise, loadSchool(newSlug, onStage)]);
  }, [loadSchool]);

  const clearSchoolSlug = useCallback(async () => {
    await storageRemove(STORAGE_KEY); setSlug(null); setSchool(null); setFeatures({});
  }, []);

  const refresh = useCallback(() => loadSchool(slug), [loadSchool, slug]);

  // Memoized deliberately — see the comment above `loadSchool`. Without this,
  // `value` (and the `refresh` closure inside it) was a brand-new object on
  // every render of TenantProvider, which sits near the root of the tree and
  // re-renders on essentially every navigation. Any future consumer that put
  // `refresh` (or the tenant object itself) in an effect's dependency array
  // would re-run that effect on every render, not just when the school
  // actually changes — the same bug class already fixed in AuthProvider.
  const value = useMemo(() => ({
    school, slug, isPlatformHost, features, loading, error, refresh, setSchoolSlug, clearSchoolSlug,
  }), [school, slug, isPlatformHost, features, loading, error, refresh, setSchoolSlug, clearSchoolSlug]);

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
