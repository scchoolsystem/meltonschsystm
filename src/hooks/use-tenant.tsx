import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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

type TenantState = {
  school: School | null;
  slug: string | null;
  isPlatformHost: boolean;
  features: Record<string, boolean>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setSchoolSlug: (slug: string) => Promise<void>;
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

  const loadSchool = async (targetSlug: string | null) => {
    setLoading(true); setError(null);
    try {
      if (!targetSlug || targetSlug === PLATFORM_SLUG) {
        setSchool(null); setFeatures({}); setLoading(false); return;
      }
      const { data, error: qErr } = await supabase.from("schools").select("*").eq("slug", targetSlug).maybeSingle();
      if (qErr) throw qErr;
      if (!data) { setError(`School "${targetSlug}" not found`); setSchool(null); }
      else {
        setSchool(data as School);
        const { data: flags } = await supabase.from("school_features").select("feature_key,enabled").eq("school_id", data.id);
        const map: Record<string, boolean> = {};
        (flags ?? []).forEach((f: any) => { map[f.feature_key] = f.enabled; });
        setFeatures(map);
      }
    } catch (e: any) { setError(e.message ?? "Failed to load school"); setSchool(null); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 5000);
    resolveSlug().then((resolved) => { setSlug(resolved); return loadSchool(resolved); })
      .catch(() => setLoading(false))
      .finally(() => clearTimeout(timer));
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (school?.primary_color && typeof document !== "undefined")
      document.documentElement.style.setProperty("--brand-primary", school.primary_color);
    if (typeof document !== "undefined")
      document.title = isPlatformHost ? "Platform Admin — SmartDev ERP" : school?.name ? `${school.name} — ERP` : "SmartDev ERP";
  }, [school, isPlatformHost]);

  const setSchoolSlug = async (newSlug: string) => {
    await storageSet(STORAGE_KEY, newSlug); setSlug(newSlug); await loadSchool(newSlug);
  };

  const clearSchoolSlug = async () => {
    await storageRemove(STORAGE_KEY); setSlug(null); setSchool(null); setFeatures({});
  };

  return (
    <TenantContext.Provider value={{ school, slug, isPlatformHost, features, loading, error, refresh: () => loadSchool(slug), setSchoolSlug, clearSchoolSlug }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
