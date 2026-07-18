import { createFileRoute, useRouter, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTenant } from "@/hooks/use-tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ArrowLeft, Video, Check, Clock, X } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInMinutes } from "date-fns";

export const Route = createFileRoute("/_app/live/$sessionId")({
  component: SessionRoom,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">Couldn't load: {error.message}</div>,
  notFoundComponent: () => <div className="p-6">Session not found</div>,
});

type AttendStatus = "present" | "late" | "absent";

// ---------------------------------------------------------------------------
// JaaS token hook — fetches a signed RS256 JWT from our own API route.
// FIX: attaches Supabase Bearer token manually because this is a plain fetch(),
// not a TanStack serverFn — so the global attachSupabaseAuth middleware does NOT
// run automatically. Without the Authorization header the server middleware throws
// "Unauthorized: No authorization header provided", which surfaces as
// "Could not get meeting token".
// ---------------------------------------------------------------------------
function useJaasToken(roomName: string | undefined, enabled: boolean) {
  const { user, roles, isAdmin } = useAuth();
  const isModerator =
    isAdmin ||
    roles.some((r) =>
      ["teacher", "class_teacher", "subject_teacher", "hod", "academic_master"].includes(r as string),
    );

  return useQuery({
    queryKey: ["jaas-token", roomName, isModerator],
    enabled: !!roomName && enabled,
    // Token is valid 60 min — refetch at 50 min to be safe
    staleTime: 1000 * 60 * 50,
    retry: 2,
    queryFn: async () => {
      // Always get a fresh session token before calling the API
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error("Not authenticated — please log in again");
      }
      const accessToken = sessionData.session.access_token;

      const res = await fetch("/api/jaas-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Required: the server-side requireSupabaseAuth middleware validates this
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ room: roomName }),
      });

      if (!res.ok) {
        let errMsg = res.statusText;
        try {
          const body = await res.json();
          errMsg = body.error ?? errMsg;
        } catch {
          // ignore parse errors — keep statusText
        }
        throw new Error(errMsg);
      }

      const { token } = await res.json();
      if (!token) throw new Error("Server returned empty token");
      return token as string;
    },
  });
}

// ---------------------------------------------------------------------------
// Jitsi External API script loader — cached at module scope so the ~heavy
// 8x8.vc/external_api.js bundle is only ever fetched once per page session,
// even if the user navigates in/out of several live rooms.
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    JitsiMeetExternalAPI?: any;
  }
}

let jitsiScriptPromise: Promise<void> | null = null;

function loadJitsiScript(appId: string): Promise<void> {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  if (jitsiScriptPromise) return jitsiScriptPromise;
  jitsiScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-jitsi-external-api]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load meeting library")));
      return;
    }
    const script = document.createElement("script");
    script.src = `https://8x8.vc/${appId}/external_api.js`;
    script.async = true;
    script.dataset.jitsiExternalApi = "true";
    script.onload = () => resolve();
    script.onerror = () => {
      jitsiScriptPromise = null; // allow retry
      reject(new Error("Failed to load meeting library"));
    };
    document.head.appendChild(script);
  });
  return jitsiScriptPromise;
}

// ---------------------------------------------------------------------------
// Live room embed — uses the Jitsi/JaaS External API (not a bare iframe) so
// we get real lifecycle events instead of guessing:
//   - userInfo.displayName is handed to Jitsi directly at construction time,
//     so nobody ever sees a "what's your name?" prompt — this works even in
//     cases where the URL-hash config flags (prejoinPageEnabled, etc.) get
//     ignored by a Jitsi/JaaS version.
//   - videoConferenceJoined only fires once the person has actually entered
//     the call, so attendance reflects real presence, not just "the page was
//     open". Previously attendance was written as soon as the route mounted,
//     which is also why a join could silently fail to record: any DB error
//     was swallowed with console.warn and never shown to anyone.
//   - videoConferenceLeft / beforeunload close out the attendance row with a
//     real duration.
// ---------------------------------------------------------------------------
function LiveRoom({
  jaasAppId,
  roomName,
  jwt,
  title,
  displayName,
  email,
  isStudent,
  studentId,
  sessionId,
  scheduledStart,
  userId,
}: {
  jaasAppId: string;
  roomName: string;
  jwt: string;
  title: string;
  displayName: string;
  email: string;
  isStudent: boolean;
  studentId: string | null;
  sessionId: string;
  scheduledStart: string;
  userId: string | undefined;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);
  const attendanceRef = useRef<{ id?: string; joinedAt?: number }>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    let api: any;

    const markJoined = async () => {
      if (!isStudent || !studentId) return;
      const joinedAt = Date.now();
      const minsLate = differenceInMinutes(new Date(joinedAt), new Date(scheduledStart));
      const autoStatus: AttendStatus = minsLate > 5 ? "late" : "present";
      const { data, error } = await supabase
        .from("live_session_attendance")
        .upsert(
          {
            session_id: sessionId,
            student_id: studentId,
            user_id: userId ?? null,
            joined_at: new Date(joinedAt).toISOString(),
            left_at: null,
            duration_seconds: null,
            status: autoStatus,
          } as any,
          { onConflict: "session_id,student_id" },
        )
        .select("id")
        .maybeSingle();
      if (error) {
        // FIX: this used to be console.warn-only, so a failed write (e.g. an
        // RLS or network hiccup) was invisible — the roster would just show
        // the student as never having joined, with no signal anything went
        // wrong. Now it surfaces directly.
        console.error("attendance insert failed", error);
        toast.error(`Couldn't record your attendance: ${error.message}`);
        return;
      }
      attendanceRef.current = { id: data?.id, joinedAt };
      qc.invalidateQueries({ queryKey: ["live-session-attendance", sessionId] });
    };

    const markLeft = () => {
      const { id, joinedAt } = attendanceRef.current;
      if (!id || !joinedAt) return;
      const dur = Math.round((Date.now() - joinedAt) / 1000);
      supabase
        .from("live_session_attendance")
        .update({ left_at: new Date().toISOString(), duration_seconds: dur })
        .eq("id", id)
        .then(({ error }) => {
          if (error) console.error("attendance leave-update failed", error);
          qc.invalidateQueries({ queryKey: ["live-session-attendance", sessionId] });
        });
    };

    window.addEventListener("beforeunload", markLeft);

    loadJitsiScript(jaasAppId)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        api = new window.JitsiMeetExternalAPI("8x8.vc", {
          roomName: `${jaasAppId}/${roomName}`,
          jwt,
          parentNode: containerRef.current,
          width: "100%",
          height: "100%",
          configOverwrite: {
            // FIX: newer Jitsi/JaaS releases moved the prejoin ("Join
            // meeting" device-check) screen from this flat legacy flag to
            // the nested one below. Recent versions silently ignore the
            // legacy flag, so it's kept here for older deployments but the
            // nested flag is what actually suppresses the screen now.
            prejoinPageEnabled: false,
            prejoinConfig: { enabled: false },
            disableDeepLinking: true,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            requireDisplayName: false,
            enableWelcomePage: false,
            startAudioOnly: false,
          },
          interfaceConfigOverwrite: {
            MOBILE_APP_PROMO: false,
            SHOW_JITSI_WATERMARK: false,
            HIDE_INVITE_MORE_HEADER: true,
          },
          // This is the actual fix for "why do I have to type my name":
          // handing Jitsi the name up front at construction time means the
          // prejoin/name prompt never appears, regardless of what the
          // config flags above do on any given Jitsi/JaaS release.
          userInfo: {
            displayName: displayName || "User",
            email: email || undefined,
          },
        });
        apiRef.current = api;
        api.addEventListener("videoConferenceJoined", markJoined);
        api.addEventListener("videoConferenceLeft", markLeft);
        api.addEventListener("readyToClose", markLeft);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });

    return () => {
      cancelled = true;
      window.removeEventListener("beforeunload", markLeft);
      markLeft();
      if (api) {
        try {
          api.removeEventListener("videoConferenceJoined", markJoined);
          api.removeEventListener("videoConferenceLeft", markLeft);
          api.removeEventListener("readyToClose", markLeft);
          api.dispose();
        } catch {
          // ignore dispose errors on unmount
        }
      }
    };
    // Intentionally re-run only when the identity of the room/token changes —
    // not on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jaasAppId, roomName, jwt]);

  if (loadError) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <p className="text-destructive text-sm font-medium">{loadError}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div ref={containerRef} title={title} style={{ width: "100%", height: "70vh", minHeight: 480 }} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main room component
// ---------------------------------------------------------------------------
function SessionRoom() {
  const { sessionId } = useParams({ from: "/_app/live/$sessionId" });
  const { user, roles, isAdmin, fullName } = useAuth();
  const qc = useQueryClient();
  const isStudent = roles.includes("student" as any);
  const canManage =
    isAdmin ||
    roles.some((r) =>
      ["teacher", "class_teacher", "subject_teacher", "hod", "academic_master"].includes(r as string),
    );

  const router = useRouter();
  const { school } = useTenant();

  const { data: session, isLoading } = useQuery({
    queryKey: ["live-session", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_sessions")
        .select("*, classes!inner(name)")
        .eq("id", sessionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: myStudent } = useQuery({
    queryKey: ["my-student-link", user?.id],
    enabled: !!user?.id && isStudent,
    queryFn: async () => {
      const { data } = await supabase
        .from("student_user_links")
        .select("student_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data?.student_id ?? null;
    },
  });

  // Auto-start if teacher/admin opens room at or after scheduled start time
  // FIX: depend on primitive fields, not the `session` object reference —
  // react-query hands back a new object on every refetch, which was
  // re-running this (and the old attendance effect) far more than intended.
  useEffect(() => {
    if (!session || !canManage) return;
    if (
      session.status === "scheduled" &&
      Date.now() >= new Date(session.scheduled_start).getTime()
    ) {
      supabase
        .from("live_sessions")
        .update({ status: "live", started_at: new Date().toISOString() })
        .eq("id", sessionId)
        .then(() => qc.invalidateQueries({ queryKey: ["live-session", sessionId] }));
    }
  }, [session?.id, session?.status, session?.scheduled_start, canManage, sessionId, qc]);

  // Warn (once) if a student's account isn't linked, since attendance can
  // never be recorded for them regardless of whether the meeting itself works.
  useEffect(() => {
    if (isStudent && myStudent === null && user?.id) {
      toast.warning("Your account isn't linked to a student record — your attendance won't be tracked automatically.");
    }
  }, [isStudent, myStudent, user?.id]);

  const startSession = async () => {
    await supabase
      .from("live_sessions")
      .update({ status: "live", started_at: new Date().toISOString() })
      .eq("id", sessionId);
    qc.invalidateQueries({ queryKey: ["live-session", sessionId] });
    toast.success("Session started");
  };

  const endSession = async () => {
    await supabase
      .from("live_sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", sessionId);
    toast.success("Session ended");
    qc.invalidateQueries({ queryKey: ["live-session", sessionId] });
    router.navigate({ to: "/live" });
  };

  // JaaS token — only fetch when session is actually live
  const isLive = session?.status === "live";
  const {
    data: jaasToken,
    isLoading: tokenLoading,
    error: tokenError,
  } = useJaasToken(session?.room_name, isLive);

  // JaaS App ID from env (VITE_JAAS_APP_ID in .env / Cloudflare Pages vars)
  const jaasAppId = import.meta.env.VITE_JAAS_APP_ID as string | undefined;

  if (isLoading)
    return (
      <div className="p-6 grid place-items-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (!session) return <div className="p-6">Session not found.</div>;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/live">
              <ArrowLeft className="w-4 h-4 mr-2" />All sessions
            </Link>
          </Button>
          <h1 className="text-2xl font-bold mt-2 flex items-center gap-2">
            <Video className="w-6 h-6 text-primary" />
            {session.title}
          </h1>
          <div className="text-sm text-muted-foreground mt-1 flex gap-2 flex-wrap items-center">
            <Badge variant="outline">{(session as any).classes?.name}</Badge>
            <span>{format(new Date(session.scheduled_start), "PPp")}</span>
            <Badge>{session.status}</Badge>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canManage && (
            <Button asChild variant="outline">
              <Link to="/live/$sessionId/attendance" params={{ sessionId }}>
                Correct attendance
              </Link>
            </Button>
          )}
          {canManage && session.status !== "ended" && (
            <Button variant="destructive" onClick={endSession}>
              End session
            </Button>
          )}
        </div>
      </div>

      {/* Student not linked warning */}
      {isStudent && myStudent === null && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-700 p-3 text-sm text-amber-800 dark:text-amber-300">
          ⚠ Your account is not linked to a student record — your attendance will not be tracked
          automatically. Contact your administrator.
        </div>
      )}

      {/* Main content area */}
      {session.status === "cancelled" || session.status === "ended" ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            This session has {session.status}. You can still adjust attendance below.
          </CardContent>
        </Card>
      ) : session.status === "scheduled" ? (
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <p className="text-muted-foreground">Session not started yet.</p>
            <p className="text-sm text-muted-foreground">
              Scheduled: {format(new Date(session.scheduled_start), "PPp")}
            </p>
            {canManage && (
              <Button onClick={startSession} size="lg">
                <Video className="w-4 h-4 mr-2" />Start session
              </Button>
            )}
            {!canManage && (
              <p className="text-sm text-muted-foreground">
                Waiting for teacher to start the session.
              </p>
            )}
          </CardContent>
        </Card>
      ) : /* status === "live" */ tokenLoading ? (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Connecting to live class…</p>
          </CardContent>
        </Card>
      ) : tokenError || !jaasAppId || !jaasToken ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <p className="text-destructive text-sm font-medium">
              {tokenError
                ? `Could not get meeting token: ${(tokenError as Error).message}`
                : "JaaS App ID not configured. Set VITE_JAAS_APP_ID in your environment."}
            </p>
            {!jaasAppId && (
              <p className="text-xs text-muted-foreground">
                Add <code className="bg-muted px-1 rounded">VITE_JAAS_APP_ID</code> to your Cloudflare environment variables.
              </p>
            )}
            <Button
              variant="outline"
              onClick={() => qc.invalidateQueries({ queryKey: ["jaas-token"] })}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <LiveRoom
          key={session.room_name}
          jaasAppId={jaasAppId}
          roomName={session.room_name}
          jwt={jaasToken}
          title={session.title}
          displayName={fullName || user?.email || "User"}
          email={user?.email ?? ""}
          isStudent={isStudent}
          studentId={myStudent ?? null}
          sessionId={sessionId}
          scheduledStart={session.scheduled_start}
          userId={user?.id}
        />
      )}

      {canManage && (
        <AttendanceRoster
          sessionId={sessionId}
          classId={session.class_id}
          sessionEnded={session.status === "ended"}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------
function statusBadge(s: AttendStatus) {
  if (s === "present")
    return (
      <Badge
        className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
        variant="outline"
      >
        Present
      </Badge>
    );
  if (s === "late")
    return (
      <Badge
        className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
        variant="outline"
      >
        Late
      </Badge>
    );
  return (
    <Badge className="bg-destructive/15 text-destructive border-destructive/30" variant="outline">
      Absent
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Attendance roster
// ---------------------------------------------------------------------------
function AttendanceRoster({
  sessionId,
  classId,
  sessionEnded,
}: {
  sessionId: string;
  classId: string;
  sessionEnded: boolean;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: roster = [], isLoading: rosterLoading } = useQuery({
    queryKey: ["class-roster", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name, unique_id, photo_url")
        .eq("class_id", classId)
        .order("last_name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: attendance = [], isLoading: attLoading } = useQuery({
    queryKey: ["live-session-attendance", sessionId],
    // FIX: was 15s only; drop to 5s so a join shows up on the teacher's
    // roster promptly instead of looking like it "didn't register".
    refetchInterval: sessionEnded ? false : 5_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_session_attendance")
        .select("id, student_id, joined_at, left_at, duration_seconds, status")
        .eq("session_id", sessionId);
      if (error) throw error;
      return data || [];
    },
  });

  const attMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const a of attendance as any[]) m.set(a.student_id, a);
    return m;
  }, [attendance]);

  const setStatus = async (studentId: string, status: AttendStatus) => {
    const existing = attMap.get(studentId);
    const payload: any = {
      session_id: sessionId,
      student_id: studentId,
      status,
      marked_by: user?.id ?? null,
      marked_at: new Date().toISOString(),
    };
    if (status === "absent" && !existing) {
      payload.joined_at = null;
    }
    const { error } = await supabase
      .from("live_session_attendance")
      .upsert(payload, { onConflict: "session_id,student_id" });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["live-session-attendance", sessionId] });
  };

  const markAllUnjoined = async (status: AttendStatus) => {
    const targets = (roster as any[]).filter((s) => !attMap.has(s.id));
    if (!targets.length) { toast.info("Everyone is already marked"); return; }
    const rows = targets.map((s) => ({
      session_id: sessionId,
      student_id: s.id,
      status,
      marked_by: user?.id ?? null,
      marked_at: new Date().toISOString(),
      joined_at: status === "absent" ? null : new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("live_session_attendance")
      .upsert(rows as any, { onConflict: "session_id,student_id" });
    if (error) { toast.error(error.message); return; }
    toast.success(`Marked ${rows.length} as ${status}`);
    qc.invalidateQueries({ queryKey: ["live-session-attendance", sessionId] });
  };

  const counts = useMemo(() => {
    let present = 0, late = 0, absent = 0, unmarked = 0;
    for (const s of roster as any[]) {
      const a = attMap.get(s.id);
      if (!a) { unmarked++; continue; }
      if (a.status === "present") present++;
      else if (a.status === "late") late++;
      else if (a.status === "absent") absent++;
    }
    return { present, late, absent, unmarked, total: (roster as any[]).length };
  }, [roster, attMap]);

  const loading = rosterLoading || attLoading;

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">Attendance roster</CardTitle>
          <button
            onClick={() => {
              const rows = [["Student Name", "Unique ID", "Status", "Joined At", "Left At", "Duration (min)"]];
              for (const s of roster as any[]) {
                const att = attMap.get(s.id);
                rows.push([
                  `${s.first_name} ${s.last_name}`,
                  s.unique_id ?? "",
                  att?.status ?? "absent",
                  att?.joined_at ? new Date(att.joined_at).toLocaleString() : "",
                  att?.left_at ? new Date(att.left_at).toLocaleString() : "",
                  att?.duration_seconds ? String(Math.round(att.duration_seconds / 60)) : "",
                ]);
              }
              const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `attendance-${sessionId}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="text-xs border rounded px-2 py-1 hover:bg-muted"
          >
            Export CSV
          </button>
          <p className="text-xs text-muted-foreground mt-1">
            {counts.total} students ·{" "}
            <span className="text-emerald-600">{counts.present} present</span> ·{" "}
            <span className="text-amber-600">{counts.late} late</span> ·{" "}
            <span className="text-destructive">{counts.absent} absent</span> · {counts.unmarked}{" "}
            unmarked
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => markAllUnjoined("absent")}>
            Mark remaining absent
          </Button>
          <Button size="sm" variant="outline" onClick={() => markAllUnjoined("present")}>
            Mark remaining present
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : (roster as any[]).length === 0 ? (
          <p className="text-sm text-muted-foreground">No students in this class yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Left</TableHead>
                <TableHead>Minutes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Mark</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(roster as any[]).map((s) => {
                const a = attMap.get(s.id);
                const status: AttendStatus = (a?.status as AttendStatus) ?? "absent";
                const hasRecord = !!a;
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {s.photo_url ? (
                          <img src={s.photo_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                            {s.first_name?.[0]}{s.last_name?.[0]}
                          </div>
                        )}
                        <div>
                          <div className="font-medium">{s.first_name} {s.last_name}</div>
                          <div className="text-xs text-muted-foreground">{s.unique_id}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {a?.joined_at ? format(new Date(a.joined_at), "p") : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {a?.left_at ? (
                        format(new Date(a.left_at), "p")
                      ) : hasRecord && status !== "absent" ? (
                        <Badge variant="secondary">In room</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {a?.duration_seconds ? Math.round(a.duration_seconds / 60) : "—"}
                    </TableCell>
                    <TableCell>
                      {hasRecord ? (
                        statusBadge(status)
                      ) : (
                        <span className="text-xs text-muted-foreground">Unmarked</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex rounded-md border overflow-hidden">
                        <Button
                          size="sm"
                          variant={status === "present" ? "default" : "ghost"}
                          className="h-8 rounded-none px-2"
                          onClick={() => setStatus(s.id, "present")}
                          title="Present"
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant={status === "late" ? "default" : "ghost"}
                          className="h-8 rounded-none px-2 border-l"
                          onClick={() => setStatus(s.id, "late")}
                          title="Late"
                        >
                          <Clock className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant={status === "absent" ? "destructive" : "ghost"}
                          className="h-8 rounded-none px-2 border-l"
                          onClick={() => setStatus(s.id, "absent")}
                          title="Absent"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {sessionEnded && (
          <p className="text-xs text-muted-foreground mt-3">
            Session has ended — corrections made here are saved immediately.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
