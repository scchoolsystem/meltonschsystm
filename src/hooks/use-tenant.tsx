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

export function getSubdomainSlug(hostname: string): string | null {
  const host = hostname.toLowerCase().split(":")[0];
  if (host === "admin.smartdev.co.ke" || host === "admin.erp.smartdev.co.ke") return PLATFORM_SLUG;
  if (host === "localhost" || /^[\d.]+$/.test(host)) return null;
  if (host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com")) return null;
  if (host === "smartdev.co.ke" || host === "www.smartdev.co.ke" || host === "erp.smartdev.co.ke") return null;
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

export function TenantProvider({ children }: { children: ReactNode }) {
  const [school, setSchool] = useState<School | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Always derive slug client-side only to avoid SSR mismatch
  const [slug, setSlug] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSlug(getSubdomainSlug(window.location.hostname));
    setMounted(true);
  }, []);

  const isPlatformHost = slug === PLATFORM_SLUG;

  const load = async () => {
    if (!mounted) return;
    setLoading(true);
    setError(null);
    try {
      if (isPlatformHost) {
        setSchool(null);
        setFeatures({});
        return;
      }
      if (!slug) {
        setSchool(null);
        setLoading(false);
        return;
      }
      const { data, error: qErr } = await supabase
        .from("schools")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (qErr) throw qErr;
      if (!data) {
        setError(`School portal "${slug}" not found`);
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

  useEffect(() => {
    if (mounted) void load();
  }, [slug, mounted]);

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
