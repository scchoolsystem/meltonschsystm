import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, BookOpen, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useTeacherScope } from "@/hooks/use-teacher-scope";
import { useActiveStudents } from "@/lib/students.functions";

export const Route = createFileRoute("/_app/attendance")({ component: Page });

// JS Date#getDay() is 0=Sun..6=Sat; timetable_slots.day_of_week is 1=Mon..7=Sun
// (see src/lib/timetable.functions.ts) — convert so "today's lessons" lines up.
function isoDayOfWeek(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00`).getDay();
  return d === 0 ? 7 : d;
}

const STATUS_OPTIONS = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "excused", label: "Excused" },
];

function Page() {
  const { isAdmin, hasRole, user } = useAuth();
  const { isTeacherScoped, staffId } = useTeacherScope();
  // "Manual entry" (edit the overall record for any class directly) stays
  // admin/deputy_principal territory — regular teaching staff mark
  // attendance per-lesson instead (see MyLessonsPanel below), which then
  // rolls up into the same overall record automatically.
  const canManualOverride = isAdmin || hasRole("deputy_principal");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const defaultTab = staffId ? "lessons" : "manual";

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Attendance</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {staffId
              ? "Mark attendance for each of your lessons — it rolls up into the student's overall daily record automatically."
              : "Mark daily attendance per class."}
          </p>
        </div>
        <div><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-44" /></div>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {staffId && (
            <TabsTrigger value="lessons"><BookOpen className="w-4 h-4 mr-2" />My Lessons</TabsTrigger>
          )}
          {canManualOverride && (
            <TabsTrigger value="manual"><ClipboardList className="w-4 h-4 mr-2" />Manual Entry (All Classes)</TabsTrigger>
          )}
        </TabsList>

        {staffId && (
          <TabsContent value="lessons" className="mt-4">
            <MyLessonsPanel staffId={staffId} date={date} userId={user?.id ?? null} />
          </TabsContent>
        )}

        {canManualOverride && (
          <TabsContent value="manual" className="mt-4">
            <ManualOverridePanel date={date} />
          </TabsContent>
        )}
      </Tabs>

      {!staffId && !canManualOverride && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          You don't have a staff record linked to your account, so there's no class attendance to mark here.
        </CardContent></Card>
      )}
    </div>
  );
}

// ── Per-lesson marking: "each teacher marks their individual attendance" ───
function MyLessonsPanel({ staffId, date, userId }: { staffId: string; date: string; userId: string | null }) {
  const qc = useQueryClient();
  const dow = isoDayOfWeek(date);

  const { data: lessons = [], isLoading: lessonsLoading } = useQuery({
    queryKey: ["my-lessons", staffId, dow],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timetable_slots")
        .select("id,class_id,subject_id,start_time,end_time,classes(name),subjects(name,code)")
        .eq("teacher_id", staffId)
        .eq("day_of_week", dow)
        .order("start_time");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [selectedSlotId, setSelectedSlotId] = useState<string>("");

  // Auto-select the first lesson whenever the day's list loads/changes.
  useEffect(() => {
    setSelectedSlotId((lessons as any[])[0]?.id ?? "");
  }, [lessons]);

  const slot = useMemo(() => (lessons as any[]).find(l => l.id === selectedSlotId) ?? null, [lessons, selectedSlotId]);

  const { data: students = [] } = useActiveStudents({ classId: slot?.class_id, enabled: !!slot });

  const { data: existing = [] } = useQuery({
    queryKey: ["lesson-att", selectedSlotId, date],
    enabled: !!selectedSlotId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_attendance")
        .select("student_id,status,remarks")
        .eq("timetable_slot_id", selectedSlotId)
        .eq("date", date);
      if (error) throw error;
      return data ?? [];
    },
  });

  const map = useMemo(() => {
    const m: Record<string, string> = {};
    (existing as any[]).forEach(r => { m[r.student_id] = r.status; });
    return m;
  }, [existing]);
  const remarksMap = useMemo(() => {
    const m: Record<string, string> = {};
    (existing as any[]).forEach(r => { if (r.remarks) m[r.student_id] = r.remarks; });
    return m;
  }, [existing]);

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [remarksDraft, setRemarksDraft] = useState<Record<string, string>>({});
  const get = (id: string) => draft[id] ?? map[id] ?? "present";
  const getRemarks = (id: string) => remarksDraft[id] ?? remarksMap[id] ?? "";

  const save = useMutation({
    mutationFn: async () => {
      if (!slot) throw new Error("Select a lesson first");
      const rows = (students as any[]).map(s => ({
        timetable_slot_id: selectedSlotId,
        class_id: slot.class_id,
        subject_id: slot.subject_id,
        teacher_id: staffId,
        student_id: s.id,
        date,
        status: get(s.id),
        remarks: getRemarks(s.id) || null,
        marked_by: userId,
      }));
      const { error } = await supabase.from("lesson_attendance").upsert(rows, { onConflict: "timetable_slot_id,student_id,date" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lesson attendance saved — overall record updated");
      qc.invalidateQueries({ queryKey: ["lesson-att", selectedSlotId, date] });
      setDraft({}); setRemarksDraft({});
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (lessonsLoading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading your lessons…</p>;

  if ((lessons as any[]).length === 0) {
    return (
      <Card><CardContent className="py-8 text-center text-muted-foreground">
        You have no lessons scheduled on {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" })} ({date}). Check the timetable, or ask the academic master if this looks wrong.
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[260px]">
            <Label>Lesson</Label>
            <Select value={selectedSlotId} onValueChange={setSelectedSlotId}>
              <SelectTrigger><SelectValue placeholder="Choose a lesson" /></SelectTrigger>
              <SelectContent>
                {(lessons as any[]).map(l => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.start_time?.slice(0, 5)}–{l.end_time?.slice(0, 5)} · {l.classes?.name} · {l.subjects?.name ?? l.subjects?.code ?? "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {slot && <Button onClick={() => save.mutate()} disabled={save.isPending}><Save className="w-4 h-4 mr-2" />{save.isPending ? "Saving…" : "Save"}</Button>}
        </div>
      </CardHeader>
      <CardContent>
        {!slot ? <p className="text-center text-muted-foreground py-8">Choose a lesson above.</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>Adm No</TableHead><TableHead>Name</TableHead><TableHead>Status</TableHead><TableHead>Remarks</TableHead></TableRow></TableHeader>
            <TableBody>
              {(students as any[]).length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No students in this class.</TableCell></TableRow>}
              {(students as any[]).map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.admission_no}</TableCell>
                  <TableCell className="font-medium">{s.first_name} {s.last_name}</TableCell>
                  <TableCell>
                    <Select value={get(s.id)} onValueChange={v => setDraft({ ...draft, [s.id]: v })}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input value={getRemarks(s.id)} onChange={e => setRemarksDraft({ ...remarksDraft, [s.id]: e.target.value })} placeholder="—" className="h-8 text-sm" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── Manual override: admins/deputy_principal editing the OVERALL record for
// any class directly (corrections, or classes with no timetable slot yet).
function ManualOverridePanel({ date }: { date: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [classId, setClassId] = useState<string>("");

  const { data: classes = [] } = useQuery({
    queryKey: ["classes-att-manual"],
    queryFn: async () => (await supabase.from("classes").select("id,name").order("name")).data ?? [],
  });

  const { data: students = [] } = useActiveStudents({ classId, enabled: !!classId });
  const { data: existing = [] } = useQuery({
    queryKey: ["att-manual", classId, date],
    enabled: !!classId,
    queryFn: async () => (await supabase.from("attendance_records").select("*").eq("date", date).in("student_id", (students as any[]).map(s => s.id))).data ?? [],
  });

  const map = useMemo(() => {
    const m: Record<string, string> = {};
    (existing as any[]).forEach(r => { m[r.student_id] = r.status; });
    return m;
  }, [existing]);
  const remarksMap = useMemo(() => {
    const m: Record<string, string> = {};
    (existing as any[]).forEach(r => { if (r.remarks) m[r.student_id] = r.remarks; });
    return m;
  }, [existing]);

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [remarksDraft, setRemarksDraft] = useState<Record<string, string>>({});
  const get = (id: string) => draft[id] ?? map[id] ?? "present";
  const getRemarks = (id: string) => remarksDraft[id] ?? remarksMap[id] ?? "";

  const save = useMutation({
    mutationFn: async () => {
      const rows = (students as any[]).map(s => ({
        student_id: s.id, class_id: classId, date, status: get(s.id),
        remarks: getRemarks(s.id) || null, recorded_by: user?.id,
      }));
      const { error } = await supabase.from("attendance_records").upsert(rows, { onConflict: "student_id,date" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Attendance saved"); qc.invalidateQueries({ queryKey: ["att-manual", classId, date] }); setDraft({}); setRemarksDraft({}); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]"><Label>Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder="Choose class" /></SelectTrigger>
              <SelectContent>{(classes as any[]).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {classId && <Button onClick={() => save.mutate()} disabled={save.isPending}><Save className="w-4 h-4 mr-2" />{save.isPending ? "Saving…" : "Save"}</Button>}
        </div>
        <p className="text-xs text-muted-foreground pt-1">
          This edits the overall daily record directly and will be overwritten the next time any of this class's lessons are marked for {date}.
        </p>
      </CardHeader>
      <CardContent>
        {!classId ? <p className="text-center text-muted-foreground py-8">Select a class to begin.</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>Adm No</TableHead><TableHead>Name</TableHead><TableHead>Status</TableHead><TableHead>Remarks</TableHead></TableRow></TableHeader>
            <TableBody>
              {(students as any[]).length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No students in this class.</TableCell></TableRow>}
              {(students as any[]).map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.admission_no}</TableCell>
                  <TableCell className="font-medium">{s.first_name} {s.last_name}</TableCell>
                  <TableCell>
                    <Select value={get(s.id)} onValueChange={v => setDraft({ ...draft, [s.id]: v })}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input value={getRemarks(s.id)} onChange={e => setRemarksDraft({ ...remarksDraft, [s.id]: e.target.value })} placeholder="—" className="h-8 text-sm" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
