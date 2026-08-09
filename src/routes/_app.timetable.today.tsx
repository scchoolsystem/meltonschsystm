import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Loader2, PlayCircle, CheckCircle2, Clock, AlertTriangle, XCircle, Repeat, CalendarDays,
} from "lucide-react";
import { toast } from "sonner";
import { FeatureGate } from "@/components/FeatureGate";
import {
  startLessonOccurrence, completeLessonOccurrence, getLessonOperationsBoard,
} from "@/lib/timetable.functions";

export const Route = createFileRoute("/_app/timetable/today")({
  component: () => (
    <FeatureGate feature="timetable">
      <Page />
    </FeatureGate>
  ),
});

type Occurrence = {
  id: string;
  status: string;
  lesson_date: string;
  scheduled_start: string;
  scheduled_end: string;
  teacher_id: string | null;
  substitute_teacher_id: string | null;
  topic_covered: string | null;
  homework: string | null;
  completion_notes: string | null;
  classes?: { name: string } | null;
  subjects?: { name: string } | null;
};

const STATUS_META: Record<string, { label: string; className: string; icon: any }> = {
  scheduled: { label: "Scheduled", className: "bg-muted text-foreground", icon: Clock },
  in_progress: { label: "In progress", className: "bg-blue-100 text-blue-800", icon: PlayCircle },
  completed: { label: "Completed", className: "bg-green-100 text-green-800", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", className: "bg-zinc-200 text-zinc-700", icon: XCircle },
  teacher_absent: { label: "Teacher absent", className: "bg-red-100 text-red-800", icon: AlertTriangle },
  substituted: { label: "Substituted", className: "bg-amber-100 text-amber-800", icon: Repeat },
  rescheduled: { label: "Rescheduled", className: "bg-purple-100 text-purple-800", icon: CalendarDays },
};

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function Page() {
  const { session, isAdmin, roles } = useAuth();
  const authUserId = session?.user?.id;
  const canManage = isAdmin || (roles ?? []).some((r) => ["deputy_principal", "school_admin", "academic_master", "admission_officer"].includes(r as string));
  const qc = useQueryClient();
  const [date] = useState(todayISO());
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [homework, setHomework] = useState("");
  const [notes, setNotes] = useState("");

  const startLesson = useServerFn(startLessonOccurrence);
  const completeLesson = useServerFn(completeLessonOccurrence);
  const getBoard = useServerFn(getLessonOperationsBoard);

  const { data: staffId } = useQuery({
    queryKey: ["my-staff-id", authUserId],
    enabled: !!authUserId,
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("id").eq("user_id", authUserId!).maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
  });

  // ── My lessons today (as scheduled teacher OR assigned substitute) ──────
  const { data: myLessons, isLoading: myLoading } = useQuery({
    queryKey: ["my-today-lessons", staffId, date],
    enabled: !!staffId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_occurrences")
        .select("id,status,lesson_date,scheduled_start,scheduled_end,teacher_id,substitute_teacher_id,topic_covered,homework,completion_notes,classes(name),subjects(name)")
        .eq("lesson_date", date)
        .or(`teacher_id.eq.${staffId},substitute_teacher_id.eq.${staffId}`)
        .order("scheduled_start");
      if (error) throw error;
      return (data ?? []) as unknown as Occurrence[];
    },
  });

  // ── School-wide live ops board (admins / academic master only) ──────────
  const { data: board, isLoading: boardLoading } = useQuery({
    queryKey: ["lesson-ops-board", date],
    enabled: canManage,
    queryFn: () => getBoard({ data: { date } }),
  });

  const startMutation = useMutation({
    mutationFn: (occurrenceId: string) => startLesson({ data: { occurrenceId } }),
    onSuccess: () => {
      toast.success("Lesson started");
      qc.invalidateQueries({ queryKey: ["my-today-lessons"] });
      qc.invalidateQueries({ queryKey: ["lesson-ops-board"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not start lesson"),
  });

  const completeMutation = useMutation({
    mutationFn: (occurrenceId: string) => completeLesson({ data: { occurrenceId, topicCovered: topic || undefined, homework: homework || undefined, completionNotes: notes || undefined } }),
    onSuccess: () => {
      toast.success("Lesson completed");
      setCompletingId(null);
      setTopic(""); setHomework(""); setNotes("");
      qc.invalidateQueries({ queryKey: ["my-today-lessons"] });
      qc.invalidateQueries({ queryKey: ["lesson-ops-board"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not complete lesson"),
  });

  const totals = board?.totals;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarDays className="w-5 h-5 text-primary" /> Today's Lessons</h1>
        <p className="text-sm text-muted-foreground mt-1">{new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
      </div>

      {canManage && (
        <Card>
          <CardHeader><CardTitle className="text-base">School-wide today</CardTitle></CardHeader>
          <CardContent>
            {boardLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
            ) : totals ? (
              <div className="grid grid-cols-3 sm:grid-cols-7 gap-3">
                {(["scheduled", "completed", "in_progress", "teacher_absent", "substituted", "cancelled", "rescheduled"] as const).map((k) => (
                  <div key={k} className="rounded-lg border p-3 text-center">
                    <div className="text-2xl font-bold">{totals[k] ?? 0}</div>
                    <div className="text-xs text-muted-foreground capitalize">{k.replace("_", " ")}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No lesson occurrences generated for today yet. Generate them from the Timetable page.</div>
            )}
            {board && board.attentionRequired.uncoveredLessons.length > 0 && (
              <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="font-medium flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Attention required</div>
                <div className="mt-1">{board.attentionRequired.uncoveredLessons.length} lesson(s) with an absent teacher and no substitute assigned yet.</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">My lessons</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {myLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : !myLessons || myLessons.length === 0 ? (
            <div className="rounded-xl border bg-muted/30 p-6 text-center text-sm text-muted-foreground">No lessons scheduled for you today.</div>
          ) : (
            myLessons.map((l) => {
              const meta = STATUS_META[l.status] ?? STATUS_META.scheduled;
              const Icon = meta.icon;
              const isSub = l.substitute_teacher_id === staffId;
              return (
                <div key={l.id} className="rounded-xl border bg-card p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {l.scheduled_start}–{l.scheduled_end} · {l.subjects?.name ?? "Subject"} · {l.classes?.name ?? "Class"}
                      {isSub && <Badge variant="outline" className="text-xs">Covering</Badge>}
                    </div>
                    <Badge className={`mt-1 gap-1 ${meta.className}`} variant="outline">
                      <Icon className="w-3 h-3" /> {meta.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {l.status === "scheduled" && (
                      <Button size="sm" variant="outline" className="gap-1.5" disabled={startMutation.isPending} onClick={() => startMutation.mutate(l.id)}>
                        <PlayCircle className="w-3.5 h-3.5" /> Start
                      </Button>
                    )}
                    {(l.status === "in_progress" || l.status === "substituted") && (
                      <Dialog open={completingId === l.id} onOpenChange={(o) => setCompletingId(o ? l.id : null)}>
                        <DialogTrigger asChild>
                          <Button size="sm" className="gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Complete
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>Complete lesson</DialogTitle></DialogHeader>
                          <div className="space-y-3">
                            <div>
                              <label className="text-sm font-medium">Topic covered (optional)</label>
                              <Textarea value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Quadratic equations — factoring" />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Homework (optional)</label>
                              <Textarea value={homework} onChange={(e) => setHomework(e.target.value)} placeholder="e.g. Exercise 4.2, Q1–10" />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Notes (optional)</label>
                              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button disabled={completeMutation.isPending} onClick={() => completeMutation.mutate(l.id)}>
                              {completeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Mark complete"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                    {l.status === "completed" && l.topic_covered && (
                      <span className="text-xs text-muted-foreground max-w-[220px] truncate">{l.topic_covered}</span>
                    )}
                    {l.status !== "cancelled" && (
                      <Link to="/attendance/mark" className="text-xs text-primary underline underline-offset-2">Mark attendance</Link>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default Page;
