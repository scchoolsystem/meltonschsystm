import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ArrowLeft, Check, Clock, X, Search, History, Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_app/live/$sessionId/attendance")({
  component: AttendanceCorrection,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">Couldn't load: {error.message}</div>,
  notFoundComponent: () => <div className="p-6">Session not found</div>,
});

type AttendStatus = "present" | "late" | "absent";

function statusBadge(s: AttendStatus) {
  if (s === "present") return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" variant="outline">Present</Badge>;
  if (s === "late") return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" variant="outline">Late</Badge>;
  return <Badge className="bg-destructive/15 text-destructive border-destructive/30" variant="outline">Absent</Badge>;
}

function AttendanceCorrection() {
  const { sessionId } = useParams({ from: "/_app/live/$sessionId/attendance" });
  const { user, roles, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);

  const canManage = isAdmin || roles.some((r) =>
    ["teacher", "class_teacher", "subject_teacher", "hod", "academic_master"].includes(r as string),
  );

  const { data: session, isLoading: sessLoading } = useQuery({
    queryKey: ["live-session", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_sessions")
        .select("*, classes!inner(id, name)")
        .eq("id", sessionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: roster = [], isLoading: rosterLoading } = useQuery({
    queryKey: ["class-roster", session?.class_id],
    enabled: !!session?.class_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name, unique_id")
        .eq("class_id", session!.class_id)
        .order("last_name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: attendance = [], isLoading: attLoading } = useQuery({
    queryKey: ["live-session-attendance", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_session_attendance")
        .select("id, student_id, joined_at, left_at, duration_seconds, status, marked_by, marked_at")
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
    const { error } = await supabase
      .from("live_session_attendance")
      .upsert({
        ...(existing?.id ? { id: existing.id } : {}),
        session_id: sessionId,
        student_id: studentId,
        status,
        marked_by: user?.id ?? null,
        marked_at: new Date().toISOString(),
        joined_at: existing?.joined_at ?? (status === "absent" ? null : new Date().toISOString()),
      } as any, { onConflict: "session_id,student_id" });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["live-session-attendance", sessionId] });
  };

  const rows = useMemo(() => {
    const all = (roster as any[]).map(s => {
      const a = attMap.get(s.id);
      const derived: AttendStatus = a?.status ?? "absent";
      const changed = !!a?.marked_by;
      return { student: s, att: a, status: derived, changed };
    });
    const f = filter.trim().toLowerCase();
    return all.filter(r => {
      if (onlyChanged && !r.changed) return false;
      if (!f) return true;
      return `${r.student.first_name} ${r.student.last_name} ${r.student.unique_id}`.toLowerCase().includes(f);
    });
  }, [roster, attMap, filter, onlyChanged]);

  const counts = useMemo(() => {
    let present = 0, late = 0, absent = 0;
    for (const r of rows) {
      if (r.status === "present") present++;
      else if (r.status === "late") late++;
      else absent++;
    }
    return { present, late, absent };
  }, [rows]);

  const exportCsv = () => {
    const header = ["Unique ID", "Name", "Joined", "Left", "Minutes", "Status", "Corrected"];
    const lines = [header.join(",")];
    rows.forEach(r => {
      lines.push([
        r.student.unique_id,
        `"${r.student.first_name} ${r.student.last_name}"`,
        r.att?.joined_at ? format(new Date(r.att.joined_at), "yyyy-MM-dd HH:mm") : "",
        r.att?.left_at ? format(new Date(r.att.left_at), "yyyy-MM-dd HH:mm") : "",
        r.att?.duration_seconds ? Math.round(r.att.duration_seconds / 60) : 0,
        r.status,
        r.changed ? "yes" : "no",
      ].join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attendance-${session?.title?.replace(/\s+/g, "-")}-${format(new Date(), "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (sessLoading) return <div className="p-6 grid place-items-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!session) return <div className="p-6">Session not found.</div>;
  if (!canManage) return <div className="p-6 text-muted-foreground">You don't have permission to correct attendance for this session.</div>;

  const loading = rosterLoading || attLoading;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/live/$sessionId" params={{ sessionId }}><ArrowLeft className="w-4 h-4 mr-2" />Back to session</Link>
          </Button>
          <h1 className="text-2xl font-bold mt-2 flex items-center gap-2">
            <History className="w-6 h-6 text-primary" />Correct attendance
          </h1>
          <div className="text-sm text-muted-foreground mt-1 flex gap-2 flex-wrap items-center">
            <span className="font-medium text-foreground">{session.title}</span>
            <Badge variant="outline">{session.classes?.name}</Badge>
            <span>{format(new Date(session.scheduled_start), "PPp")}</span>
            <Badge>{session.status}</Badge>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-2" />Export CSV</Button>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Roster ({rows.length})</CardTitle>
            <div className="text-sm">
              <span className="text-emerald-600">{counts.present} present</span> · <span className="text-amber-600">{counts.late} late</span> · <span className="text-destructive">{counts.absent} absent</span>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search by name or ID" value={filter} onChange={e => setFilter(e.target.value)} className="pl-9" />
            </div>
            <Button variant={onlyChanged ? "default" : "outline"} size="sm" onClick={() => setOnlyChanged(v => !v)}>
              {onlyChanged ? "Showing corrected only" : "Show all"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No students match.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Original join</TableHead>
                  <TableHead>Original leave</TableHead>
                  <TableHead className="text-right">Minutes</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead>Corrected</TableHead>
                  <TableHead className="text-right">Set status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ student: s, att: a, status, changed }) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium">{s.first_name} {s.last_name}</div>
                      <div className="text-xs text-muted-foreground">{s.unique_id}</div>
                    </TableCell>
                    <TableCell className="text-sm">{a?.joined_at ? format(new Date(a.joined_at), "PPp") : <span className="text-muted-foreground">Never joined</span>}</TableCell>
                    <TableCell className="text-sm">{a?.left_at ? format(new Date(a.left_at), "PPp") : "—"}</TableCell>
                    <TableCell className="text-right text-sm">{a?.duration_seconds ? Math.round(a.duration_seconds / 60) : "—"}</TableCell>
                    <TableCell>{a ? statusBadge(status) : <span className="text-xs text-muted-foreground">Unmarked</span>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {changed && a?.marked_at ? format(new Date(a.marked_at), "PP p") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex rounded-md border overflow-hidden">
                        <Button size="sm" variant={status === "present" ? "default" : "ghost"} className="h-8 rounded-none px-2" onClick={() => setStatus(s.id, "present")} title="Present"><Check className="w-4 h-4" /></Button>
                        <Button size="sm" variant={status === "late" ? "default" : "ghost"} className="h-8 rounded-none px-2 border-l" onClick={() => setStatus(s.id, "late")} title="Late"><Clock className="w-4 h-4" /></Button>
                        <Button size="sm" variant={status === "absent" ? "destructive" : "ghost"} className="h-8 rounded-none px-2 border-l" onClick={() => setStatus(s.id, "absent")} title="Absent"><X className="w-4 h-4" /></Button>
                      </div>
                    </TableCell>
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
