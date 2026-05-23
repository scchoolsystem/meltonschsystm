import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

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

type TenantState = {
  school: School | null;
  slug: string | null;
  isPlatformHost: boolean;
  features: Record<string, boolean>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const TenantContext = createContext<TenantState>({
  school: null,
  slug: null,
  isPlatformHost: false,
  features: {},
  loading: true,
  error: null,
  refresh: async () => {},
});

/**
 * Extract the school slug from the current hostname.
 * Rules:
 *   smartdev.co.ke              -> null  (root / marketing)
 *   admin.smartdev.co.ke        -> "__platform__" (platform admin portal)
 *   greenfield.smartdev.co.ke   -> "greenfield"
 *   (legacy) admin.erp.smartdev.co.ke / *.erp.smartdev.co.ke still supported
 *   *.lovable.app / localhost   -> null  (dev / preview)
 */
export function getSubdomainSlug(hostname: string): string | null {
  const host = hostname.toLowerCase().split(":")[0];

  // Platform admin host
  if (host === "admin.smartdev.co.ke" || host === "admin.erp.smartdev.co.ke") {
    return PLATFORM_SLUG;
  }

  if (host === "localhost" || /^[\d.]+$/.test(host)) return null;
  if (host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com")) return null;

  // Root domains — no school context
  if (host === "smartdev.co.ke" || host === "www.smartdev.co.ke" || host === "erp.smartdev.co.ke") {
    return null;
  }

  // Legacy *.erp.smartdev.co.ke still resolves to its slug
  const LEGACY_ROOT = "erp.smartdev.co.ke";
  if (host.endsWith("." + LEGACY_ROOT)) {
    const sub = host.slice(0, host.length - LEGACY_ROOT.length - 1);
    return sub || null;
  }

  // New scheme: <slug>.smartdev.co.ke
  const ROOT = "smartdev.co.ke";
  if (host.endsWith("." + ROOT)) {
    const sub = host.slice(0, host.length - ROOT.length - 1);
    return sub || null;
  }

  const parts = host.split(".");
  if (parts.length >= 3) return parts[0];
  return null;
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [school, setSchool] = useState<School | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const slug = typeof window !== "undefined" ? getSubdomainSlug(window.location.hostname) : null;
  const isPlatformHost = slug === PLATFORM_SLUG;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // Platform host has no school context — short-circuit
      if (isPlatformHost) {
        setSchool(null);
        setFeatures({});
        return;
      }
      const targetSlug = slug ?? "school-1";
      const { data, error: qErr } = await supabase
        .from("schools")
        .select("*")
        .eq("slug", targetSlug)
        .maybeSingle();
      if (qErr) throw qErr;
      if (!data) {
        setError(`School portal "${targetSlug}" not found`);
        setSchool(null);
      } else if (data.status !== "active") {
        // School exists but is suspended or otherwise inactive — treat as blocked
        setError(
          data.status === "suspended"
            ? `This school portal has been suspended. Please contact SmartDev support.`
            : `This school portal is not available (status: ${data.status}).`
        );
        setSchool(null);
      } else {
        setSchool(data as School);
        // Load feature flags for this school (best-effort; default to enabled)
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

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (school?.primary_color && typeof document !== "undefined") {
      document.documentElement.style.setProperty("--brand-primary", school.primary_color);
    }
    if (typeof document !== "undefined") {
      document.title = isPlatformHost
        ? "Platform Admin — SmartDev ERP"
        : school?.name ? `${school.name} — ERP` : "School ERP";
    }
  }, [school, isPlatformHost]);

  return (
    <TenantContext.Provider value={{ school, slug, isPlatformHost, features, loading, error, refresh: load }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
