import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Clock, XCircle, ShieldQuestion, CalendarDays, Users, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { startLessonOccurrence, completeLessonOccurrence } from "@/lib/timetable.functions";

export const Route = createFileRoute("/_app/attendance/mark")({
  component: () => (
    <FeatureGate feature="attendance">
      <TeacherAttendanceMark />
    </FeatureGate>
  ),
});

// ─────────────────────────────────────────────────────────────────────────────
// Per-period attendance for a teacher's own timetable slots, reusing the
// SAME attendance_records table the rest of the school uses (no second
// attendance system — see supabase/migrations/20260809120000_..._lesson_operations.sql
// which added timetable_slot_id / subject_id / teacher_id / lesson_occurrence_id
// / marked_at to attendance_records for exactly this purpose).
//
// Column names and the day_of_week convention (1=Mon..7=Sun) match the rest
// of the codebase (src/lib/timetable.functions.ts) exactly — this file
// previously assumed a different, non-existent schema shape.
// ─────────────────────────────────────────────────────────────────────────────

type AttendanceStatus = "present" | "late" | "absent" | "excused";

interface TimetableSlot {
  id: string;
  school_id: string;
  teacher_id: string;
  class_id: string;
  subject_id: string;
  day_of_week: number; // 1=Mon..7=Sun
  start_time: string;
  end_time: string;
  classes?: { name: string } | null;
  subjects?: { name: string } | null;
}

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  admission_no: string | null;
  photo_url: string | null;
}

interface AttendanceRecord {
  id?: string;
  student_id: string;
  status: AttendanceStatus;
}

interface LessonOccurrence {
  id: string;
  status: string;
  actual_start: string | null;
}

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; icon: any; activeClass: string; dotClass: string }> = {
  present: { label: "Present", icon: CheckCircle2, activeClass: "bg-green-600 text-white border-green-600", dotClass: "bg-green-500" },
  late: { label: "Late", icon: Clock, activeClass: "bg-amber-500 text-white border-amber-500", dotClass: "bg-amber-400" },
  absent: { label: "Absent", icon: XCircle, activeClass: "bg-red-600 text-white border-red-600", dotClass: "bg-red-500" },
  excused: { label: "Excused", icon: ShieldQuestion, activeClass: "bg-blue-600 text-white border-blue-600", dotClass: "bg-blue-500" },
};

const STATUS_ORDER: AttendanceStatus[] = ["present", "late", "absent", "excused"];

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

// Matches the DOW() convention in src/lib/timetable.functions.ts exactly.
function dayOfWeekFor(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00").getDay(); // 0=Sun..6=Sat
  return d === 0 ? 7 : d;
}

function TeacherAttendanceMark() {
  const { session } = useAuth();
  const authUserId = session?.user?.id;
  const queryClient = useQueryClient();
  const startLesson = useServerFn(startLessonOccurrence);
  const completeLesson = useServerFn(completeLessonOccurrence);

  const [date, setDate] = useState(todayISO());
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});

  const dayOfWeek = useMemo(() => dayOfWeekFor(date), [date]);

  // ── 0. Resolve auth user -> staff.id (timetable_slots.teacher_id is a staff id) ──
  const { data: staffId } = useQuery({
    queryKey: ["my-staff-id", authUserId],
    enabled: !!authUserId,
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("id").eq("user_id", authUserId!).maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
  });

  // ── 1. This teacher's periods for the selected day ──
  const { data: slots, isLoading: slotsLoading } = useQuery({
    queryKey: ["teacher-periods", staffId, dayOfWeek],
    enabled: !!staffId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timetable_slots")
        .select("id, school_id, teacher_id, class_id, subject_id, day_of_week, start_time, end_time, classes(name), subjects(name)")
        .eq("teacher_id", staffId!)
        .eq("day_of_week", dayOfWeek)
        .order("start_time");
      if (error) throw error;
      return (data ?? []) as unknown as TimetableSlot[];
    },
  });

  useEffect(() => {
    if (!slots || slots.length === 0) { setSelectedSlotId(null); return; }
    if (selectedSlotId && slots.some(s => s.id === selectedSlotId)) return;
    const now = new Date();
    const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const current = slots.find(s => s.start_time <= nowHM && nowHM <= s.end_time);
    setSelectedSlotId((current ?? slots[0]).id);
  }, [slots]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedSlot = slots?.find(s => s.id === selectedSlotId) ?? null;

  // ── 2. The dated lesson occurrence for this slot+date, if generated ──
  const { data: occurrence, isLoading: occLoading } = useQuery({
    queryKey: ["lesson-occurrence", selectedSlot?.id, date],
    enabled: !!selectedSlot?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_occurrences")
        .select("id, status, actual_start")
        .eq("timetable_slot_id", selectedSlot!.id)
        .eq("lesson_date", date)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as LessonOccurrence | null;
    },
  });

  // ── 3. Students in the selected class ──
  const { data: students, isLoading: studentsLoading } = useQuery({
    queryKey: ["class-students", selectedSlot?.class_id],
    enabled: !!selectedSlot?.class_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name, admission_no, photo_url")
        .eq("class_id", selectedSlot!.class_id)
        .order("first_name");
      if (error) throw error;
      return (data ?? []) as StudentRow[];
    },
  });

  // ── 4. Existing attendance already marked for this exact period+date ──
  const { data: existing, isLoading: existingLoading } = useQuery({
    queryKey: ["attendance-existing", selectedSlot?.id, date],
    enabled: !!selectedSlot?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("id, student_id, status")
        .eq("timetable_slot_id", selectedSlot!.id)
        .eq("date", date);
      if (error) throw error;
      return (data ?? []) as AttendanceRecord[];
    },
  });

  useEffect(() => {
    if (!students) return;
    const seeded: Record<string, AttendanceStatus> = {};
    for (const s of students) {
      const found = existing?.find(e => e.student_id === s.id);
      seeded[s.id] = found?.status ?? "present";
    }
    setMarks(seeded);
  }, [students, existing]);

  const setMark = (studentId: string, status: AttendanceStatus) => {
    setMarks(prev => ({ ...prev, [studentId]: status }));
  };

  const markAllPresent = () => {
    if (!students) return;
    setMarks(Object.fromEntries(students.map(s => [s.id, "present" as AttendanceStatus])));
  };

  const counts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = { present: 0, late: 0, absent: 0, excused: 0 };
    Object.values(marks).forEach(v => { c[v] = (c[v] ?? 0) + 1; });
    return c;
  }, [marks]);

  // START LESSON → flips the lesson_occurrence to in_progress and records actual_start.
  const startMutation = useMutation({
    mutationFn: async () => {
      if (!occurrence) throw new Error("No lesson occurrence generated for this slot/date yet");
      return startLesson({ data: { occurrenceId: occurrence.id } });
    },
    onSuccess: () => {
      toast.success("Lesson started");
      queryClient.invalidateQueries({ queryKey: ["lesson-occurrence", selectedSlot?.id, date] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Could not start lesson"),
  });

  // COMPLETE LESSON → after attendance is saved, mark the lesson done.
  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!occurrence) throw new Error("No lesson occurrence to complete");
      return completeLesson({ data: { occurrenceId: occurrence.id } });
    },
    onSuccess: () => {
      toast.success("Lesson completed");
      queryClient.invalidateQueries({ queryKey: ["lesson-occurrence", selectedSlot?.id, date] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Could not complete lesson"),
  });

  // ── 5. Save — upsert one row per student for this period+date ──
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSlot || !students) throw new Error("Nothing to save");
      const rows = students.map(s => ({
        school_id: selectedSlot.school_id,
        student_id: s.id,
        class_id: selectedSlot.class_id,
        subject_id: selectedSlot.subject_id,
        timetable_slot_id: selectedSlot.id,
        lesson_occurrence_id: occurrence?.id ?? null,
        teacher_id: staffId,
        recorded_by: authUserId,
        date,
        status: marks[s.id] ?? "present",
        marked_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from("attendance_records")
        .upsert(rows, { onConflict: "timetable_slot_id,student_id,date" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Attendance saved");
      queryClient.invalidateQueries({ queryKey: ["attendance-existing", selectedSlot?.id, date] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Failed to save attendance");
    },
  });

  const loading = slotsLoading || (!!selectedSlot && (studentsLoading || existingLoading || occLoading));
  const lessonStatus = occurrence?.status ?? null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarDays className="w-5 h-5 text-primary" /> Mark Attendance</h1>
        <p className="text-sm text-muted-foreground mt-1">Per-period attendance for your own timetable slots.</p>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">Date</label>
        <input
          type="date"
          value={date}
          max={todayISO()}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border px-3 py-1.5 text-sm bg-background"
        />
      </div>

      {slotsLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading your timetable…</div>
      ) : !slots || slots.length === 0 ? (
        <div className="rounded-xl border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          You have no periods scheduled on this day.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {slots.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedSlotId(s.id)}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${selectedSlotId === s.id ? "border-primary bg-primary/10" : "hover:bg-muted"}`}
            >
              <div className="font-medium">{s.classes?.name ?? "Class"} · {s.subjects?.name ?? "Subject"}</div>
              <div className="text-xs text-muted-foreground">{s.start_time}–{s.end_time}</div>
            </button>
          ))}
        </div>
      )}

      {selectedSlot && (
        <>
          {/* Lesson status / START LESSON bar — only present once occurrences
              have been generated for this slot/date (Timetable → Generate). */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-sm">
              {occLoading ? (
                <span className="text-muted-foreground flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking lesson status…</span>
              ) : !occurrence ? (
                <span className="text-muted-foreground">No dated lesson record yet for this slot — attendance can still be saved.</span>
              ) : (
                <span className="font-medium capitalize">{lessonStatus?.replace("_", " ")}</span>
              )}
            </div>
            {occurrence && lessonStatus === "scheduled" && (
              <Button size="sm" variant="outline" className="gap-1.5" disabled={startMutation.isPending} onClick={() => startMutation.mutate()}>
                {startMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                Start Lesson
              </Button>
            )}
            {occurrence && lessonStatus === "in_progress" && (
              <Button size="sm" className="gap-1.5" disabled={completeMutation.isPending} onClick={() => completeMutation.mutate()}>
                {completeMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Complete Lesson
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{students?.length ?? 0} students</span>
              <span className="text-muted-foreground">·</span>
              {STATUS_ORDER.map((st) => (
                <span key={st} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className={`w-2 h-2 rounded-full ${STATUS_CONFIG[st].dotClass}`} />
                  {counts[st]}
                </span>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={markAllPresent}>Mark all present</Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-2">
              {(students ?? []).map((s) => {
                const status = marks[s.id] ?? "present";
                const fullName = `${s.first_name} ${s.last_name}`;
                return (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center text-xs font-semibold text-muted-foreground">
                        {s.photo_url ? <img src={s.photo_url} alt={fullName} className="w-full h-full object-cover" /> : fullName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{fullName}</div>
                        {s.admission_no && <div className="text-xs text-muted-foreground">{s.admission_no}</div>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {STATUS_ORDER.map((st) => {
                        const cfg = STATUS_CONFIG[st];
                        const active = status === st;
                        return (
                          <button
                            key={st}
                            type="button"
                            title={cfg.label}
                            onClick={() => setMark(s.id, st)}
                            className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors ${active ? cfg.activeClass : "hover:bg-muted"}`}
                          >
                            <cfg.icon className="w-4 h-4" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {students?.length === 0 && (
                <div className="rounded-xl border bg-muted/30 p-6 text-center text-sm text-muted-foreground">No students in this class yet.</div>
              )}
            </div>
          )}

          <div className="sticky bottom-4 flex justify-end">
            <Button
              size="lg"
              className="gap-2 shadow-lg"
              disabled={saveMutation.isPending || !students?.length}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Save Attendance
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default TeacherAttendanceMark;
