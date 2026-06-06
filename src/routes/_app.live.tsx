import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Video, Users, Calendar, Clock } from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_app/live")({
  component: LivePage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">Couldn't load: {error.message}</div>,
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

function LivePage() {
  const { roles, isAdmin } = useAuth();
  const qc = useQueryClient();
  const canManage = isAdmin || roles.some((r) =>
    ["teacher", "class_teacher", "subject_teacher", "hod", "academic_master"].includes(r as string),
  );

  const { data: classes = [] } = useQuery({
    queryKey: ["live-classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["live-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_sessions")
        .select("*, classes!inner(name)")
        .order("scheduled_start", { ascending: false })
        .limit(200);
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
          {canManage && <TabsTrigger value="reports">Attendance reports</TabsTrigger>}
        </TabsList>

        <TabsContent value="upcoming" className="space-y-3 mt-4">
          {isLoading ? <Spinner /> : upcoming.length === 0 ? <Empty msg="No upcoming sessions." /> : upcoming.map(s => <SessionCard key={s.id} s={s} canManage={canManage} onChanged={() => qc.invalidateQueries({ queryKey: ["live-sessions"] })} />)}
        </TabsContent>

        <TabsContent value="past" className="space-y-3 mt-4">
          {isLoading ? <Spinner /> : past.length === 0 ? <Empty msg="No past sessions yet." /> : past.map(s => <SessionCard key={s.id} s={s} canManage={canManage} onChanged={() => qc.invalidateQueries({ queryKey: ["live-sessions"] })} />)}
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
  const isLiveWindow = Date.now() >= start.getTime() - 10 * 60_000 && (s.status === "scheduled" || s.status === "live");
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

  const byStudent = useMemo(() => {
    const m = new Map<string, { name: string; uid: string; present: number; late: number; absent: number; durationMin: number }>();
    (rows as any[]).forEach(r => {
      const k = r.student_id;
      const cur = m.get(k) || { name: `${r.students?.first_name ?? ""} ${r.students?.last_name ?? ""}`.trim(), uid: r.students?.unique_id ?? "", present: 0, late: 0, absent: 0, durationMin: 0 };
      if (r.status === "present") cur.present += 1;
      else if (r.status === "late") cur.late += 1;
      else if (r.status === "absent") cur.absent += 1;
      cur.durationMin += Math.round((r.duration_seconds || 0) / 60);
      m.set(k, cur);
    });
    return Array.from(m.values()).sort((a,b) => (b.present + b.late) - (a.present + a.late));
  }, [rows]);

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
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">By student</CardTitle></CardHeader>
        <CardContent>
          {byStudent.length === 0 ? <p className="text-sm text-muted-foreground">No attendance yet.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Student</TableHead><TableHead className="text-right">Present</TableHead><TableHead className="text-right">Late</TableHead><TableHead className="text-right">Absent</TableHead><TableHead className="text-right">Min</TableHead></TableRow></TableHeader>
              <TableBody>
                {byStudent.map((r, i) => (
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
      <Card>
        <CardHeader><CardTitle className="text-base">By session</CardTitle></CardHeader>
        <CardContent>
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
  );
}

