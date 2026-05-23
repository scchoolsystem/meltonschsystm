import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useRouter } from "@tanstack/react-router";
import { getSubdomainSlug, PLATFORM_SLUG } from "@/hooks/use-tenant";

type AppRole =
  | "super_admin" | "principal" | "deputy_principal" | "class_teacher"
  | "subject_teacher" | "hod" | "admission_officer" | "bursar"
  | "librarian" | "sports" | "boarding" | "parent" | "student" | "staff"
  | "teacher" | "nurse" | "matron" | "transport_officer"
  | "school_admin" | "academic_master"
  | "exams_admin" | "exams_user" | "finance_admin" | "finance_user"
  | "boarding_admin" | "boarding_user" | "kitchen_admin" | "kitchen_user"
  | "security_admin" | "security_user" | "library_admin" | "library_user"
  | "clinic_admin" | "clinic_user" | "sports_admin" | "sports_user"
  | "store_admin" | "store_user" | "transport_admin" | "guidance_admin"
  | "ict_admin" | "discipline_admin"
  | "platform_owner" | "platform_support";

// Platform-level roles that are not scoped to any school
const PLATFORM_ROLES: AppRole[] = ["platform_owner", "platform_support"];

interface AuthCtx {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  fullName: string;
  loading: boolean;
  hasRole: (r: AppRole) => boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(true);

  // Determine current school slug from hostname once (stable for session lifetime)
  const slug = typeof window !== "undefined"
    ? getSubdomainSlug(window.location.hostname)
    : null;
  const isPlatformHost = slug === PLATFORM_SLUG;

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        // Use setTimeout to avoid Supabase auth state deadlock
        setTimeout(() => {
          loadProfile(s.user.id).catch(console.error);
        }, 0);
      } else {
        setRoles([]);
        setFullName("");
      }
      router.invalidate();
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        loadProfile(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadProfile(uid: string) {
    // --- 1. Fetch profile; check account status ---
    const { data: prof } = await supabase
      .from("profiles")
      .select("full_name, status")
      .eq("id", uid)
      .maybeSingle();

    // If the account has been explicitly deactivated, sign out immediately
    if (prof?.status && prof.status !== "active") {
      await supabase.auth.signOut();
      window.location.href = "/login";
      return;
    }

    setFullName(prof?.full_name ?? "");

    // --- 2. Load roles scoped to the current school ---
    if (isPlatformHost) {
      // On the platform host, only load platform-level roles (no school_id filter)
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .in("role", PLATFORM_ROLES as string[]);
      setRoles((rolesData ?? []).map((r) => r.role as AppRole));
      return;
    }

    if (!slug) {
      // Root host or unrecognised — no school context, no roles
      setRoles([]);
      return;
    }

    // Resolve this user's school_id for the current subdomain
    // Use a simple join — the school status is already enforced by
    // current_user_school() at the DB level via RLS
    const { data: memberRow } = await supabase
      .from("school_members")
      .select("school_id, schools!inner(slug, status)")
      .eq("user_id", uid)
      .eq("schools.slug", slug)
      .maybeSingle();

    // School not found, not active, or user has no membership here
    if (!memberRow) {
      setRoles([]);
      return;
    }

    const schoolStatus = (memberRow as any).schools?.status;
    if (schoolStatus && schoolStatus !== "active") {
      setRoles([]);
      return;
    }

    const schoolId = (memberRow as any).school_id as string;

    // Load roles scoped to this specific school only
    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .eq("school_id", schoolId);

    setRoles((rolesData ?? []).map((r) => r.role as AppRole));
  }

  const value: AuthCtx = {
    session,
    user: session?.user ?? null,
    roles,
    fullName,
    loading,
    hasRole: (r) => roles.includes(r),
    isAdmin: roles.includes("super_admin") || roles.includes("principal"),
    signOut: async () => {
      await supabase.auth.signOut();
      window.location.href = "/login";
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}

