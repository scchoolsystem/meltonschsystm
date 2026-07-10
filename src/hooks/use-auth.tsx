import { createContext, useContext, useEffect, useState, useMemo, useCallback, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase, getSessionSafe } from "@/integrations/supabase/client";
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
  // True only once we have a *confirmed* answer to "is there a session or
  // not" — from getSessionSafe() actually resolving (not timing out) or
  // onAuthStateChange firing. Deliberately NOT set by the blind `loading`
  // safety timer below, because that timer fires on a fixed clock whether
  // the real check is hung or just slow — and "just slow" is common with
  // the documented supabase-js lock contention. Route guards must check
  // this (not just `!loading`) before concluding "no session, go to
  // /login" — otherwise a slow-but-working auth check gets misread as a
  // logged-out user and force-redirects them away mid-check.
  sessionChecked: boolean;
  hasRole: (r: AppRole) => boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

// Guards an individual Supabase call so a slow/hanging roles or profile
// query can't silently ride along until the unrelated blanket 6s
// `rolesLoaded` failsafe (below) fires. Without this, the only thing
// preventing a hang was that global timer — which meant a merely-slow (not
// hung) query could resolve *after* the UI already moved on with an empty
// roles array, causing a visible "pop in" of the sidebar/permissions a few
// seconds late instead of failing fast to a known state. Mirrors the
// `withTimeout()` pattern already used in `_app.portal.me.tsx`.
function withTimeout<T>(promise: PromiseLike<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(true);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  // Safety: never hang on loading state
  useEffect(() => {
    const t = setTimeout(() => setRolesLoaded(true), 6000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setSessionChecked(true);
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

    // Unlike a plain `supabase.auth.getSession()`, this is immune to the
    // supabase-js internal-lock hang documented in client.ts — it always
    // settles within `timeoutMs` even if the underlying call never returns
    // (worse with multiple tabs of this app open against the same
    // storageKey). Without this guard, a stuck lock here left `session`
    // at its initial `null` forever: `loading` still flips false via the
    // safety timer below, but the outer /_app gate checks `!session` too,
    // so the app would sit on the splash screen (or, if a stray
    // `onAuthStateChange` INITIAL_SESSION event happened to populate
    // `session` independently, leave a dangling locked promise that could
    // then block every *other* Supabase call sharing this client for the
    // rest of the session) — either way, zero network requests and zero
    // console output, since nothing ever throws or times out on its own.
    getSessionSafe().then(({ data: { session: s }, timedOut }) => {
      if (timedOut) {
        console.warn("[useAuth] getSession() timed out — deferring to onAuthStateChange");
        return;
      }
      setSession(s);
      setSessionChecked(true);
      if (s?.user) {
        loadProfile(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }).catch((err) => {
      console.error("[useAuth] getSession failed:", err);
      setLoading(false);
    });

    // Safety: never leave `loading` visually stuck forever — but this must
    // NOT be treated as "we know there's no session" (see sessionChecked
    // above). A slow-but-working auth check taking longer than 5s here is
    // expected under lock contention, not proof of logged-out. Route
    // guards that redirect to /login on "no session" must gate on
    // sessionChecked, not on `!loading` alone, or they will yank a
    // legitimately-logged-in user to /login mid-check purely because this
    // clock ran out first — a false-positive logout, not a real one.
    const safetyTimer = setTimeout(() => setLoading(false), 5000);
    return () => {
      subscription.unsubscribe();
      clearTimeout(safetyTimer);
    };
  }, [router]);

  async function loadProfile(uid: string) {
    // Kick off both queries and let them run to completion regardless of
    // how long they take — timing them out early would mean a merely-slow
    // (not hung) query's real roles/name are thrown away instead of just
    // arriving late. Each one updates state whenever it actually resolves.
    const rolesPromise = supabase.from("user_roles").select("role").eq("user_id", uid)
      .then(({ data }) => setRoles((data ?? []).map((r) => r.role as AppRole)))
      .catch((err) => console.error("[useAuth] roles query failed:", err));
    const profilePromise = supabase.from("profiles").select("full_name").eq("id", uid).maybeSingle()
      .then(({ data }) => setFullName(data?.full_name ?? ""))
      .catch((err) => console.error("[useAuth] profile query failed:", err));

    // But don't block the UI on them past 4s — `rolesLoaded` flips to true
    // (with whatever roles have arrived so far, possibly still empty) so
    // _app.tsx's splash screen doesn't sit there waiting on a slow network
    // when the failsafe below would otherwise be the only thing unblocking
    // it 2+ seconds later. Whichever query is still in flight keeps running
    // in the background and updates state the moment it resolves.
    await withTimeout(Promise.all([rolesPromise, profilePromise]), 4000, undefined);
    setRolesLoaded(true);
  }

  // Memoized deliberately. Every consumer that puts hasRole (or isAdmin,
  // or this whole context value) in a useEffect/useMemo dependency array is
  // trusting it to only change when roles/session actually change. Before
  // this fix, `value` (and hasRole inside it) was a brand-new object/
  // function on every single AuthProvider render — including renders
  // triggered by ordinary navigation, which re-renders the root layout.
  // The one place that mattered: /portal's dispatcher (_app.portal.tsx)
  // has `hasRole` in its effect deps, so on the OLD code every navigation
  // re-ran that effect and called navigate() again, which triggered
  // another render, another new hasRole, another navigate() — an
  // unconditional re-render/re-navigate loop. That's the "click My
  // Workspace and everything freezes" bug: pegged CPU, and each cycle
  // re-firing the beforeLoad auth check hundreds of times a second.
  const hasRole = useCallback((r: AppRole) => roles.includes(r), [roles]);
  const isAdmin = useMemo(
    () => roles.includes("super_admin") || roles.includes("principal") || roles.includes("platform_owner"),
    [roles],
  );
  const signOut = useCallback(async () => {
    await unregisterPushToken();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, []);

  const value: AuthCtx = useMemo(() => ({
    session,
    user: session?.user ?? null,
    roles,
    fullName,
    loading,
    rolesLoaded,
    sessionChecked,
    hasRole,
    isAdmin,
    signOut,
  }), [session, roles, fullName, loading, rolesLoaded, sessionChecked, hasRole, isAdmin, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
