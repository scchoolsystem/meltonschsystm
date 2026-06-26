import { createFileRoute, useRouter, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
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
// Main room component
// ---------------------------------------------------------------------------
function SessionRoom() {
  const { sessionId } = useParams({ from: "/_app/live/$sessionId" });
  const { user, roles, isAdmin } = useAuth();
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
  }, [session?.id, session?.status, canManage]);

  // Auto-track attendance on join/leave; auto-derive present vs late
  const attendanceRef = useRef<{ id?: string; joinedAt?: number }>({});
  useEffect(() => {
    if (!session || !isStudent || !myStudent) return;
    let active = true;
    (async () => {
      const joinedAt = Date.now();
      const minsLate = differenceInMinutes(new Date(joinedAt), new Date(session.scheduled_start));
      const autoStatus: AttendStatus = minsLate > 5 ? "late" : "present";
      const { data, error } = await supabase
        .from("live_session_attendance")
        .upsert(
          {
            session_id: sessionId,
            student_id: myStudent,
            user_id: user?.id ?? null,
            joined_at: new Date(joinedAt).toISOString(),
            left_at: null,
            duration_seconds: null,
            status: autoStatus,
          } as any,
          { onConflict: "session_id,student_id" },
        )
        .select("id")
        .maybeSingle();
      if (error) { console.warn("attendance insert", error); return; }
      if (active && data) attendanceRef.current = { id: data.id, joinedAt };
    })();
    const markLeft = () => {
      const { id, joinedAt } = attendanceRef.current;
      if (!id || !joinedAt) return;
      const dur = Math.round((Date.now() - joinedAt) / 1000);
      supabase
        .from("live_session_attendance")
        .update({ left_at: new Date().toISOString(), duration_seconds: dur })
        .eq("id", id)
        .then(() => {});
    };
    window.addEventListener("beforeunload", markLeft);
    return () => {
      active = false;
      markLeft();
      window.removeEventListener("beforeunload", markLeft);
    };
  }, [session, isStudent, myStudent, sessionId, user?.id]);

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

  // Build JaaS iframe URL once token is ready
  const jitsiIframeSrc =
    jaasToken && jaasAppId
      ? [
          `https://8x8.vc/${jaasAppId}/${session.room_name}`,
          `#jwt=${jaasToken}`,
          `&config.prejoinPageEnabled=false`,
          `&config.disableDeepLinking=true`,
          `&config.startWithAudioMuted=false`,
          `&config.startWithVideoMuted=false`,
          `&config.requireDisplayName=false`,
          `&config.enableWelcomePage=false`,
          `&config.disableModeratorIndicator=false`,
          `&config.startAudioOnly=false`,
          `&interfaceConfig.MOBILE_APP_PROMO=false`,
          `&interfaceConfig.SHOW_JITSI_WATERMARK=false`,
          `&interfaceConfig.HIDE_INVITE_MORE_HEADER=true`,
        ].join("")
      : null;

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
      ) : tokenError || !jitsiIframeSrc ? (
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
        <Card className="overflow-hidden">
          <iframe
            key={jitsiIframeSrc} // remount if token changes
            title={session.title}
            src={jitsiIframeSrc}
            allow="camera *; microphone *; fullscreen *; display-capture *; autoplay *; clipboard-write *"
            allowFullScreen
            className="w-full"
            style={{ height: "70vh", minHeight: 480, border: 0 }}
          />
        </Card>
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
    refetchInterval: sessionEnded ? false : 15_000,
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
