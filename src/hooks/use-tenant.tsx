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

type TenantState = {
  school: School | null;
  slug: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const TenantContext = createContext<TenantState>({
  school: null,
  slug: null,
  loading: true,
  error: null,
  refresh: async () => {},
});

/**
 * Extract the school slug from the current hostname.
 * Rules:
 *   greenfield.erp.smartdev.co.ke  -> "greenfield"
 *   erp.smartdev.co.ke             -> null  (root, shows school picker / default)
 *   *.lovable.app / localhost      -> null  (dev / preview)
 */
export function getSubdomainSlug(hostname: string): string | null {
  const host = hostname.toLowerCase().split(":")[0];
  if (host === "localhost" || /^[\\d.]+$/.test(host)) return null;
  if (host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com")) return null;

  const ROOT = "erp.smartdev.co.ke";
  if (host === ROOT) return null;
  if (host.endsWith("." + ROOT)) {
    const sub = host.slice(0, host.length - ROOT.length - 1);
    return sub || null;
  }
  // Unknown host - fall back to first label if it has 3+ parts
  const parts = host.split(".");
  if (parts.length >= 3) return parts[0];
  return null;
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const slug = typeof window !== "undefined" ? getSubdomainSlug(window.location.hostname) : null;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // No subdomain → load default "school-1" so existing single-tenant flows keep working
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
      } else {
        setSchool(data as School);
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

  // Apply branding (primary color CSS variable)
  useEffect(() => {
    if (school?.primary_color && typeof document !== "undefined") {
      document.documentElement.style.setProperty("--brand-primary", school.primary_color);
    }
    if (school?.name && typeof document !== "undefined") {
      document.title = `${school.name} — ERP`;
    }
  }, [school]);

  return (
    <TenantContext.Provider value={{ school, slug, loading, error, refresh: load }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
