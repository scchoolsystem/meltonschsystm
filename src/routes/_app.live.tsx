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
import { Loader2, Plus, Video, Users, Calendar, Clock, GraduationCap, Pencil, Download, Search, X } from "lucide-react";
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

// ─── CSV EXPORT HELPER ───
function downloadCSV(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
    // Session status (scheduled/live/ended) can flip from another client
    // (the session page's auto-start/auto-end effects, or another admin
    // clicking Cancel/End) — without polling, cards here would keep showing
    // a stale "live" pill and an active Join button after a class ended.
    refetchInterval: 15_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["live-sessions"] });

  // ─── SEARCH & FILTER (applies to Upcoming / Past / Reports; By-class has
  // its own dedicated class picker so only the text search applies there) ───
  const [searchTerm, setSearchTerm] = useState("");
  const [filterClassId, setFilterClassId] = useState<string>("all");

  const matchesSearch = (s: any, term: string) => {
    const t = term.trim().toLowerCase();
    if (!t) return true;
    return (
      (s.title || "").toLowerCase().includes(t) ||
      (s.description || "").toLowerCase().includes(t) ||
      (s.classes?.name || "").toLowerCase().includes(t)
    );
  };

  const filteredSessions = useMemo(
    () =>
      (sessions as any[]).filter(
        (s) => (filterClassId === "all" || s.class_id === filterClassId) && matchesSearch(s, searchTerm),
      ),
    [sessions, filterClassId, searchTerm],
  );

  const now = Date.now();
  const upcoming = useMemo(() => filteredSessions.filter(s => s.status !== "ended" && s.status !== "cancelled" && new Date(s.scheduled_start).getTime() > now - 15 * 60_000).sort((a,b)=>+new Date(a.scheduled_start)-+new Date(b.scheduled_start)), [filteredSessions, now]);
  const past = useMemo(() => filteredSessions.filter(s => s.status === "ended" || s.status === "cancelled" || new Date(s.scheduled_start).getTime() <= now - 15 * 60_000), [filteredSessions, now]);

  const hasActiveFilters = searchTerm.trim() !== "" || filterClassId !== "all";
  const clearFilters = () => { setSearchTerm(""); setFilterClassId("all"); };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Live Classes</h1>
          <p className="text-sm text-muted-foreground mt-1">Scheduled online lessons — join directly in-app.</p>
        </div>
        {canManage && classes.length > 0 && (
          <SessionFormDialog classes={classes as any[]} onSaved={invalidate} />
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search title, description, class…"
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={filterClassId} onValueChange={setFilterClassId}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="All classes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {(classes as any[]).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="w-4 h-4 mr-1" />Clear
          </Button>
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
          {isLoading ? <Spinner /> : upcoming.length === 0 ? <Empty msg={hasActiveFilters ? "No sessions match your search." : "No upcoming sessions."} /> : upcoming.map(s => <SessionCard key={s.id} s={s} classes={classes as any[]} canManage={canManage} onChanged={invalidate} />)}
        </TabsContent>

        <TabsContent value="past" className="space-y-3 mt-4">
          {isLoading ? <Spinner /> : past.length === 0 ? <Empty msg={hasActiveFilters ? "No sessions match your search." : "No past sessions yet."} /> : past.map(s => <SessionCard key={s.id} s={s} classes={classes as any[]} canManage={canManage} onChanged={invalidate} />)}
        </TabsContent>

        <TabsContent value="by-class" className="mt-4">
          {isLoading ? (
            <Spinner />
          ) : (
            <ClassRecordsView
              classes={classes as any[]}
              sessions={sessions as any[]}
              searchTerm={searchTerm}
              canManage={canManage}
              onChanged={invalidate}
            />
          )}
        </TabsContent>

        {canManage && (
          <TabsContent value="reports" className="mt-4">
            <AttendanceReports sessions={filteredSessions} />
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

function SessionCard({ s, classes, canManage, onChanged }: { s: any; classes: any[]; canManage: boolean; onChanged: () => void }) {
  const start = new Date(s.scheduled_start);
  const isLiveWindow = s.status === "live" || s.status === "scheduled";
  const canEdit = canManage && s.status === "scheduled";
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
            {canEdit && (
              <SessionFormDialog classes={classes} session={s} onSaved={onChanged} />
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

// ─── CREATE / EDIT dialog. Pass `session` to edit an existing scheduled
// session in place; omit it to create a new one. Editing keeps the original
// class + room_name fixed (join links already shared shouldn't break) and
// only lets you change title, description, start and end time. ───
function SessionFormDialog({ classes, session, onSaved }: { classes: any[]; session?: any; onSaved: () => void }) {
  const isEdit = !!session;
  const [open, setOpen] = useState(false);
  const [classId, setClassId] = useState(session?.class_id ?? classes[0]?.id ?? "");
  const [title, setTitle] = useState(session?.title ?? "");
  const [description, setDescription] = useState(session?.description ?? "");
  const toLocalInput = (iso: string) => {
    const d = new Date(iso);
    d.setSeconds(0, 0);
    const tzOffset = d.getTimezoneOffset() * 60_000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  };
  const [start, setStart] = useState(() => {
    if (session?.scheduled_start) return toLocalInput(session.scheduled_start);
    const d = new Date(Date.now() + 30 * 60_000);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [end, setEnd] = useState(() => (session?.scheduled_end ? toLocalInput(session.scheduled_end) : ""));

  const timeInvalid = end !== "" && new Date(end) <= new Date(start);

  const resetForCreate = () => {
    setClassId(classes[0]?.id ?? "");
    setTitle("");
    setDescription("");
    const d = new Date(Date.now() + 30 * 60_000);
    d.setSeconds(0, 0);
    setStart(d.toISOString().slice(0, 16));
    setEnd("");
  };

  const save = useMutation({
    mutationFn: async () => {
      if (timeInvalid) throw new Error("End time must be after the start time.");
      if (isEdit) {
        const { error } = await supabase
          .from("live_sessions")
          .update({
            title: title.trim(),
            description: description.trim() || null,
            scheduled_start: new Date(start).toISOString(),
            scheduled_end: end ? new Date(end).toISOString() : null,
          } as any)
          .eq("id", session.id);
        if (error) throw error;
      } else {
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
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Session updated" : "Session scheduled");
      setOpen(false);
      if (!isEdit) resetForCreate();
      onSaved();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="outline" size="sm"><Pencil className="w-4 h-4 mr-2" />Edit</Button>
        ) : (
          <Button><Plus className="w-4 h-4 mr-2" />Schedule live class</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{isEdit ? "Edit live class" : "Schedule a live class"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {isEdit ? (
            <div className="text-sm text-muted-foreground">
              Class: <Badge variant="outline">{session.classes?.name}</Badge>
              <span className="block text-xs mt-1">Class can't be changed after a session is created.</span>
            </div>
          ) : (
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder="Choose class" /></SelectTrigger>
              <SelectContent>
                {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
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
          {timeInvalid && <p className="text-xs text-destructive">End time must be after the start time.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!classId || !title.trim() || !start || timeInvalid || save.isPending}>
            {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{isEdit ? "Save changes" : "Schedule"}
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
  searchTerm,
  canManage,
  onChanged,
}: {
  classes: any[];
  sessions: any[];
  searchTerm: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [classId, setClassId] = useState<string>(classes[0]?.id ?? "");

  const classSessions = useMemo(() => {
    const t = searchTerm.trim().toLowerCase();
    return sessions
      .filter((s) => s.class_id === classId)
      .filter((s) => !t || (s.title || "").toLowerCase().includes(t) || (s.description || "").toLowerCase().includes(t))
      .sort((a, b) => +new Date(b.scheduled_start) - +new Date(a.scheduled_start));
  }, [sessions, classId, searchTerm]);

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

  const exportClassCSV = () => {
    downloadCSV(
      `attendance-${selectedClassName || "class"}`,
      ["Student", "Unique ID", "Present", "Late", "Absent", "Minutes"],
      studentRecords.map((r) => [r.name, r.uid, r.present, r.late, r.absent, r.durationMin]),
    );
  };

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
            {classSessions.map((s) => <SessionCard key={s.id} s={s} classes={classes} canManage={canManage} onChanged={onChanged} />)}
          </div>
        )}
      </div>

      {canManage && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Attendance record — {selectedClassName || "class"}</h3>
            {studentRecords.length > 0 && (
              <Button variant="outline" size="sm" onClick={exportClassCSV}>
                <Download className="w-4 h-4 mr-2" />Export CSV
              </Button>
            )}
          </div>
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
    queryKey: ["live-attendance-all", sessionIds.join(",")],
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

  const exportFullCSV = () => {
    const rowsOut: (string | number)[][] = [];
    byClass.forEach(({ className, students }) => {
      students.forEach((r: any) => {
        rowsOut.push([className, r.name, r.uid, r.present, r.late, r.absent, r.durationMin]);
      });
    });
    downloadCSV("attendance-report-all-classes", ["Class", "Student", "Unique ID", "Present", "Late", "Absent", "Minutes"], rowsOut);
  };

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-muted-foreground">By class, then student</h3>
          {byClass.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportFullCSV}>
              <Download className="w-4 h-4 mr-2" />Export CSV
            </Button>
          )}
        </div>
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
