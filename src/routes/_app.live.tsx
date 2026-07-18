import { createFileRoute, Link, Outlet, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTeacherScope } from "@/hooks/use-teacher-scope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Video, Users, Calendar, Clock, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_app/live")({
  component: LiveShell,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">Couldn't load: {error.message}</div>,
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

// Shell: if we're on /live/$sessionId (or /live/$sessionId/attendance),
// render the child route via <Outlet />. Otherwise show the listing page.
// This fixes the bug where clicking Join stayed on the listing page.
function LiveShell() {
  const params = useParams({ strict: false }) as { sessionId?: string };
  if (params.sessionId) return <Outlet />;
  return <LivePage />;
}

function LivePage() {
  const { roles, isAdmin } = useAuth();
  const { isTeacherScoped, classIds } = useTeacherScope();
  const qc = useQueryClient();
  const canManage = isAdmin || roles.some((r) =>
    ["teacher", "class_teacher", "subject_teacher", "hod", "academic_master"].includes(r as string),
  );

  const { data: classes = [] } = useQuery({
    queryKey: ["live-classes", isTeacherScoped, classIds.join(",")],
    queryFn: async () => {
      let q = supabase.from("classes").select("id, name").order("name");
      if (isTeacherScoped) {
        if (classIds.length === 0) return [];
        q = q.in("id", classIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["live-sessions", isTeacherScoped, classIds.join(",")],
    queryFn: async () => {
      let q = supabase
        .from("live_sessions")
        .select("*, classes!inner(name)")
        .order("scheduled_start", { ascending: false })
        .limit(200);
      if (isTeacherScoped) {
        if (classIds.length === 0) return [];
        q = q.in("class_id", classIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const now = Date.now();
  const upcoming = useMemo(() => (sessions as any[]).filter(s => s.status !== "ended" && s.status !== "cancelled" && new Date(s.scheduled_start).getTime() > now - 15 * 60_000).sort((a,b)=>+new Date(a.scheduled_start)-+new Date(b.scheduled_start)), [sessions, now]);
  const past = useMemo(() => (sessions as any[]).filter(s => s.status === "ended" || s.status === "cancelled" || new Date(s.scheduled_start).getTime() <= now - 15 * 60_000), [sessions, now]);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Live Classes</h1>
          <p className="text-sm text-muted-foreground mt-1">Scheduled online lessons — join directly in-app.</p>
        </div>
        {canManage && classes.length > 0 && (
          <NewSessionDialog classes={classes as any[]} onCreated={() => qc.invalidateQueries({ queryKey: ["live-sessions"] })} />
        )}
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
          <TabsTrigger value="by-class">By class</TabsTrigger>
          {canManage && <TabsTrigger value="reports">Attendance reports</TabsTrigger>}
        </TabsList>

        <TabsContent value="upcoming" className="space-y-3 mt-4">
          {isLoading ? <Spinner /> : upcoming.length === 0 ? <Empty msg="No upcoming sessions." /> : upcoming.map(s => <SessionCard key={s.id} s={s} canManage={canManage} onChanged={() => qc.invalidateQueries({ queryKey: ["live-sessions"] })} />)}
        </TabsContent>

        <TabsContent value="past" className="space-y-3 mt-4">
          {isLoading ? <Spinner /> : past.length === 0 ? <Empty msg="No past sessions yet." /> : past.map(s => <SessionCard key={s.id} s={s} canManage={canManage} onChanged={() => qc.invalidateQueries({ queryKey: ["live-sessions"] })} />)}
        </TabsContent>

        <TabsContent value="by-class" className="mt-4">
          {isLoading ? (
            <Spinner />
          ) : (
            <ClassRecordsView
              classes={classes as any[]}
              sessions={sessions as any[]}
              canManage={canManage}
              onChanged={() => qc.invalidateQueries({ queryKey: ["live-sessions"] })}
            />
          )}
        </TabsContent>

        {canManage && (
          <TabsContent value="reports" className="mt-4">
            <AttendanceReports sessions={sessions as any[]} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function Spinner() { return <div className="h-32 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>; }
function Empty({ msg }: { msg: string }) { return <Card><CardContent className="py-12 text-center text-muted-foreground">{msg}</CardContent></Card>; }

function SessionDescription({ description }: { description: string }) {
  const [open, setOpen] = useState(false);
  return (
    <CardContent className="pt-0">
      <button onClick={() => setOpen(v => !v)} className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
        {open ? "Hide details" : "Show details"}
      </button>
      {open && <p className="text-sm whitespace-pre-wrap mt-1">{description}</p>}
    </CardContent>
  );
}

function SessionCard({ s, canManage, onChanged }: { s: any; canManage: boolean; onChanged: () => void }) {
  const start = new Date(s.scheduled_start);
  const isLiveWindow = s.status === "live" || s.status === "scheduled";
  const cancel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("live_sessions").update({ status: "cancelled" }).eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cancelled"); onChanged(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Video className="w-4 h-4 text-primary" />{s.title}
            </CardTitle>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1"><Badge variant="outline">{s.classes?.name}</Badge></span>
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{format(start, "PPp")}</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDistanceToNow(start, { addSuffix: true })}</span>
              <StatusPill status={s.status} />
            </div>
          </div>
          <div className="flex gap-2">
            {isLiveWindow && (
              <Button asChild size="sm"><Link to="/live/$sessionId" params={{ sessionId: s.id }}><Video className="w-4 h-4 mr-2" />Join</Link></Button>
            )}
            {canManage && s.status !== "cancelled" && s.status !== "ended" && (
              <Button variant="ghost" size="sm" onClick={() => cancel.mutate()} disabled={cancel.isPending}>Cancel</Button>
            )}
            {canManage && (
              <Button asChild variant="outline" size="sm"><Link to="/live/$sessionId/attendance" params={{ sessionId: s.id }}><Users className="w-4 h-4 mr-2" />Attendance</Link></Button>
            )}
          </div>
        </div>
      </CardHeader>
      {s.description && <SessionDescription description={s.description} />}
    </Card>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    scheduled: "bg-blue-500/10 text-blue-700",
    live: "bg-emerald-500/10 text-emerald-700 animate-pulse",
    ended: "bg-muted text-muted-foreground",
    cancelled: "bg-destructive/10 text-destructive",
  };
  return <span className={`text-[10px] uppercase tracking-wider rounded px-2 py-0.5 ${map[status] || "bg-muted"}`}>{status}</span>;
}

function NewSessionDialog({ classes, onCreated }: { classes: any[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState(() => {
    const d = new Date(Date.now() + 30 * 60_000);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [end, setEnd] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const room = `melton-${classId.slice(0, 8)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("live_sessions").insert({
        class_id: classId,
        title: title.trim(),
        description: description.trim() || null,
        room_name: room,
        scheduled_start: new Date(start).toISOString(),
        scheduled_end: end ? new Date(end).toISOString() : null,
        created_by: user?.id ?? null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Session scheduled"); setOpen(false); setTitle(""); setDescription(""); onCreated(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Schedule live class</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Schedule a live class</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger><SelectValue placeholder="Choose class" /></SelectTrigger>
            <SelectContent>
              {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Title (e.g. Algebra revision)" value={title} onChange={e => setTitle(e.target.value)} />
          <Textarea placeholder="Description (optional)" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Start</label>
              <Input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">End (optional)</label>
              <Input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!classId || !title.trim() || !start || create.isPending}>
            {create.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── BY CLASS: pick a class, see every session for it (upcoming + past,
// newest first) plus a rolled-up attendance record for that class alone. ───
function ClassRecordsView({
  classes,
  sessions,
  canManage,
  onChanged,
}: {
  classes: any[];
  sessions: any[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const [classId, setClassId] = useState<string>(classes[0]?.id ?? "");

  const classSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.class_id === classId)
        .sort((a, b) => +new Date(b.scheduled_start) - +new Date(a.scheduled_start)),
    [sessions, classId],
  );

  const sessionIds = useMemo(() => classSessions.map((s) => s.id), [classSessions]);

  const { data: attendanceRows = [], isLoading: attLoading } = useQuery({
    queryKey: ["live-attendance-by-class", classId, sessionIds.join(",")],
    enabled: canManage && sessionIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_session_attendance")
        .select("session_id, student_id, duration_seconds, status, students!inner(first_name, last_name, unique_id)")
        .in("session_id", sessionIds);
      if (error) throw error;
      return data || [];
    },
  });

  // Roll attendance up per-student across every session of this class.
  const studentRecords = useMemo(() => {
    const m = new Map<string, { name: string; uid: string; present: number; late: number; absent: number; durationMin: number }>();
    (attendanceRows as any[]).forEach((r) => {
      const k = r.student_id;
      const cur = m.get(k) || {
        name: `${r.students?.first_name ?? ""} ${r.students?.last_name ?? ""}`.trim(),
        uid: r.students?.unique_id ?? "",
        present: 0, late: 0, absent: 0, durationMin: 0,
      };
      if (r.status === "present") cur.present += 1;
      else if (r.status === "late") cur.late += 1;
      else if (r.status === "absent") cur.absent += 1;
      cur.durationMin += Math.round((r.duration_seconds || 0) / 60);
      m.set(k, cur);
    });
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [attendanceRows]);

  if (classes.length === 0) {
    return <Empty msg="No classes available." />;
  }

  const selectedClassName = classes.find((c) => c.id === classId)?.name ?? "";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <GraduationCap className="w-4 h-4 text-muted-foreground shrink-0" />
        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger className="w-[240px]"><SelectValue placeholder="Choose class" /></SelectTrigger>
          <SelectContent>
            {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {classSessions.length} session{classSessions.length === 1 ? "" : "s"} for {selectedClassName || "this class"}
        </span>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2">Sessions</h3>
        {classSessions.length === 0 ? (
          <Empty msg="No sessions for this class yet." />
        ) : (
          <div className="space-y-3">
            {classSessions.map((s) => <SessionCard key={s.id} s={s} canManage={canManage} onChanged={onChanged} />)}
          </div>
        )}
      </div>

      {canManage && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">Attendance record — {selectedClassName || "class"}</h3>
          <Card>
            <CardContent className="pt-4">
              {attLoading ? (
                <Spinner />
              ) : studentRecords.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No attendance recorded for this class yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead className="text-right">Present</TableHead>
                      <TableHead className="text-right">Late</TableHead>
                      <TableHead className="text-right">Absent</TableHead>
                      <TableHead className="text-right">Min</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {studentRecords.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground">{r.uid}</div></TableCell>
                        <TableCell className="text-right text-emerald-600">{r.present}</TableCell>
                        <TableCell className="text-right text-amber-600">{r.late}</TableCell>
                        <TableCell className="text-right text-destructive">{r.absent}</TableCell>
                        <TableCell className="text-right">{r.durationMin}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function AttendanceReports({ sessions }: { sessions: any[] }) {
  const sessionIds = sessions.map(s => s.id);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["live-attendance-all", sessionIds.length],
    enabled: sessionIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_session_attendance")
        .select("session_id, student_id, joined_at, left_at, duration_seconds, status, students!inner(first_name, last_name, unique_id, class_id)")
        .in("session_id", sessionIds);
      if (error) throw error;
      return data || [];
    },
  });

  // Which class a given session belongs to. We key off the *session's* class
  // (not the student's current class_id) so a student who's since moved
  // classes still shows up under the class the lesson was actually taught to.
  const sessionClassMap = useMemo(() => {
    const m = new Map<string, { classId: string; className: string }>();
    for (const s of sessions) {
      m.set(s.id, { classId: s.class_id ?? "unassigned", className: s.classes?.name ?? "Unassigned" });
    }
    return m;
  }, [sessions]);

  // class_id -> { className, students: [...] }, classes and students both
  // alphabetically sorted so the report reads the same way every time.
  const byClass = useMemo(() => {
    const classes = new Map<string, { className: string; students: Map<string, any> }>();
    (rows as any[]).forEach(r => {
      const sessInfo = sessionClassMap.get(r.session_id);
      const classId = sessInfo?.classId ?? "unassigned";
      const className = sessInfo?.className ?? "Unassigned";
      if (!classes.has(classId)) classes.set(classId, { className, students: new Map() });
      const classEntry = classes.get(classId)!;

      const k = r.student_id;
      const cur = classEntry.students.get(k) || {
        name: `${r.students?.first_name ?? ""} ${r.students?.last_name ?? ""}`.trim(),
        uid: r.students?.unique_id ?? "",
        present: 0, late: 0, absent: 0, durationMin: 0,
      };
      if (r.status === "present") cur.present += 1;
      else if (r.status === "late") cur.late += 1;
      else if (r.status === "absent") cur.absent += 1;
      cur.durationMin += Math.round((r.duration_seconds || 0) / 60);
      classEntry.students.set(k, cur);
    });
    return Array.from(classes.entries())
      .map(([classId, v]) => ({
        classId,
        className: v.className,
        students: Array.from(v.students.values()).sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.className.localeCompare(b.className));
  }, [rows, sessionClassMap]);

  const bySession = useMemo(() => {
    const m = new Map<string, { present: number; late: number; absent: number }>();
    (rows as any[]).forEach(r => {
      const cur = m.get(r.session_id) || { present: 0, late: 0, absent: 0 };
      if (r.status === "present") cur.present++;
      else if (r.status === "late") cur.late++;
      else if (r.status === "absent") cur.absent++;
      m.set(r.session_id, cur);
    });
    return sessions.map(s => ({ ...s, stats: m.get(s.id) || { present: 0, late: 0, absent: 0 } }));
  }, [rows, sessions]);

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2">By class, then student</h3>
        {byClass.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No attendance yet.</CardContent></Card>
        ) : (
          <div className="space-y-4">
            {byClass.map(({ classId, className, students }) => (
              <Card key={classId}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>{className}</span>
                    <span className="text-xs font-normal text-muted-foreground">{students.length} student{students.length === 1 ? "" : "s"}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead className="text-right">Present</TableHead>
                        <TableHead className="text-right">Late</TableHead>
                        <TableHead className="text-right">Absent</TableHead>
                        <TableHead className="text-right">Min</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {students.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground">{r.uid}</div></TableCell>
                          <TableCell className="text-right text-emerald-600">{r.present}</TableCell>
                          <TableCell className="text-right text-amber-600">{r.late}</TableCell>
                          <TableCell className="text-right text-destructive">{r.absent}</TableCell>
                          <TableCell className="text-right">{r.durationMin}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2">By session</h3>
        <Card>
          <CardContent className="pt-4">
            {bySession.length === 0 ? <p className="text-sm text-muted-foreground">No sessions.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Session</TableHead><TableHead className="text-right">P / L / A</TableHead></TableRow></TableHeader>
                <TableBody>
                  {bySession.slice(0, 50).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell><div className="font-medium truncate max-w-[220px]">{s.title}</div><div className="text-xs text-muted-foreground">{s.classes?.name} • {format(new Date(s.scheduled_start), "PP")}</div></TableCell>
                      <TableCell className="text-right text-sm"><span className="text-emerald-600">{s.stats.present}</span> / <span className="text-amber-600">{s.stats.late}</span> / <span className="text-destructive">{s.stats.absent}</span></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
