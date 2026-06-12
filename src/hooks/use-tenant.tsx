import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Preferences } from "@capacitor/preferences";

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

// Detect if running inside Capacitor (Android/iOS native shell)
export function isNativeApp(): boolean {
  return typeof window !== "undefined" &&
    (window as any)?.Capacitor?.isNativePlatform?.() === true;
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
  school: null,
  slug: null,
  isPlatformHost: false,
  features: {},
  loading: true,
  error: null,
  refresh: async () => {},
  setSchoolSlug: async () => {},
  clearSchoolSlug: async () => {},
});

/**
 * Extract the school slug from the current hostname (web only).
 */
export function getSubdomainSlug(hostname: string): string | null {
  const host = hostname.toLowerCase().split(":")[0];

  if (host === "admin.smartdev.co.ke" || host === "admin.erp.smartdev.co.ke") {
    return PLATFORM_SLUG;
  }

  if (host === "localhost" || /^[\d.]+$/.test(host)) return null;
  if (host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com")) return null;

  if (
    host === "smartdev.co.ke" ||
    host === "www.smartdev.co.ke" ||
    host === "app.smartdev.co.ke" ||
    host === "erp.smartdev.co.ke"
  ) {
    return null;
  }

  const LEGACY_ROOT = "erp.smartdev.co.ke";
  if (host.endsWith("." + LEGACY_ROOT)) {
    const sub = host.slice(0, host.length - LEGACY_ROOT.length - 1);
    return sub || null;
  }

  const ROOT = "smartdev.co.ke";
  if (host.endsWith("." + ROOT)) {
    const sub = host.slice(0, host.length - ROOT.length - 1);
    return sub || null;
  }

  const parts = host.split(".");
  if (parts.length >= 3) return parts[0];
  return null;
}

/**
 * Resolve the active school slug.
 * Priority:
 *   1. Native app  -> read from @capacitor/preferences
 *   2. Web         -> read from subdomain hostname
 *   3. Dev/unknown -> null (will show school picker or fallback)
 */
async function resolveSlug(): Promise<string | null> {
  if (isNativeApp()) {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    return value ?? null;
  }
  if (typeof window !== "undefined") {
    return getSubdomainSlug(window.location.hostname);
  }
  return null;
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [school, setSchool] = useState<School | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);

  const isPlatformHost = slug === PLATFORM_SLUG;

  // Redirect school subdomains to app.smartdev.co.ke
  useEffect(() => {
    if (isNativeApp()) return;
    if (typeof window === "undefined") return;
    const host = window.location.hostname.toLowerCase().split(":")[0];
    const allowed = [
      "smartdev.co.ke",
      "www.smartdev.co.ke",
      "app.smartdev.co.ke",
      "admin.smartdev.co.ke",
      "localhost",
    ];
    const isSchoolSubdomain =
      host.endsWith(".smartdev.co.ke") && !allowed.includes(host);
    if (isSchoolSubdomain) {
      window.location.href = "https://app.smartdev.co.ke";
    }
  }, []);

  const loadSchool = async (targetSlug: string | null) => {
    setLoading(true);
    setError(null);
    try {
      if (!targetSlug || targetSlug === PLATFORM_SLUG) {
        setSchool(null);
        setFeatures({});
        setLoading(false);
        return;
      }
      const { data, error: qErr } = await supabase
        .from("schools")
        .select("*")
        .eq("slug", targetSlug)
        .maybeSingle();
      if (qErr) throw qErr;
      if (!data) {
        setError(`School "${targetSlug}" not found`);
        setSchool(null);
      } else {
        setSchool(data as School);
        const { data: flags } = await supabase
          .from("school_features")
          .select("feature_key,enabled")
          .eq("school_id", data.id);
        const map: Record<string, boolean> = {};
        (flags ?? []).forEach((f: any) => { map[f.feature_key] = f.enabled; });
        setFeatures(map);
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to load school");
      setSchool(null);
    } finally {
      setLoading(false);
    }
  };

  // On mount: resolve slug from native storage or subdomain
  useEffect(() => {
    resolveSlug().then((resolved) => {
      setSlug(resolved);
      void loadSchool(resolved);
    });
    // Safety timeout — never hang forever
    const timer = setTimeout(() => {
      setLoading(false);
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  // Apply brand colour + document title
  useEffect(() => {
    if (school?.primary_color && typeof document !== "undefined") {
      document.documentElement.style.setProperty("--brand-primary", school.primary_color);
    }
    if (typeof document !== "undefined") {
      document.title = isPlatformHost
        ? "Platform Admin — SmartDev ERP"
        : school?.name
        ? `${school.name} — ERP`
        : "SmartDev ERP";
    }
  }, [school, isPlatformHost]);

  // Called from SchoolPicker screen (mobile/desktop)
  const setSchoolSlug = async (newSlug: string) => {
    if (isNativeApp()) {
      await Preferences.set({ key: STORAGE_KEY, value: newSlug });
    }
    setSlug(newSlug);
    await loadSchool(newSlug);
  };

  // Called on sign-out (mobile/desktop)
  const clearSchoolSlug = async () => {
    if (isNativeApp()) {
      await Preferences.remove({ key: STORAGE_KEY });
    }
    setSlug(null);
    setSchool(null);
    setFeatures({});
  };

  return (
    <TenantContext.Provider
      value={{
        school,
        slug,
        isPlatformHost,
        features,
        loading,
        error,
        refresh: () => loadSchool(slug),
        setSchoolSlug,
        clearSchoolSlug,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
