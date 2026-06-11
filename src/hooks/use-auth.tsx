import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { registerPushNotifications, unregisterPushToken } from "@/lib/push-notifications";
import { useRouter } from "@tanstack/react-router";

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

interface AuthCtx {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  fullName: string;
  loading: boolean;
  rolesLoaded: boolean;
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
  const [rolesLoaded, setRolesLoaded] = useState(false);
  // Safety: never hang on loading state
  useEffect(() => {
    const t = setTimeout(() => setRolesLoaded(true), 6000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => {
          loadProfile(s.user.id).finally(() => setLoading(false));
          registerPushNotifications();
        }, 0);
      } else {
        setRoles([]);
        setFullName("");
        setRolesLoaded(false);
        setLoading(false);
        router.invalidate();
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        loadProfile(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }).catch((err) => {
      console.error("[useAuth] getSession failed:", err);
      setLoading(false);
    });

    // Safety: never leave loading=true forever
    const safetyTimer = setTimeout(() => setLoading(false), 5000);
    return () => {
      subscription.unsubscribe();
      clearTimeout(safetyTimer);
    };
  }, [router]);

  async function loadProfile(uid: string) {
    try {
      const [{ data: rolesData }, { data: prof }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("profiles").select("full_name").eq("id", uid).maybeSingle(),
      ]);
      setRoles((rolesData ?? []).map((r) => r.role as AppRole));
      setFullName(prof?.full_name ?? "");
    } catch (err) {
      console.error("[useAuth] loadProfile failed:", err);
    } finally {
      setRolesLoaded(true);
    }
  }

  const value: AuthCtx = {
    session,
    user: session?.user ?? null,
    roles,
    fullName,
    loading,
    rolesLoaded,
    hasRole: (r) => roles.includes(r),
    isAdmin: roles.includes("super_admin") || roles.includes("principal"),
    signOut: async () => {
      await unregisterPushToken();
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
