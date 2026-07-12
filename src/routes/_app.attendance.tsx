import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Clock, XCircle, ShieldQuestion, CalendarDays, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/attendance/mark")({
  component: TeacherAttendanceMark,
});

// ─────────────────────────────────────────────────────────────────────────────
// TYPES / ASSUMED SCHEMA
// Adjust these to match your actual column names if they differ —
// this is the one place that needs to line up with the DB.
// ─────────────────────────────────────────────────────────────────────────────

type AttendanceStatus = "present" | "late" | "absent" | "excused";

interface TimetableSlot {
  id: string;
  school_id: string;
  teacher_id: string;
  class_id: string;
  subject_id: string;
  day_of_week: number; // 0 = Sunday ... 6 = Saturday
  period_number: number;
  start_time: string; // "08:00"
  end_time: string;   // "08:40"
  classes?: { name: string } | null;
  subjects?: { name: string } | null;
}

interface StudentRow {
  id: string;
  full_name: string;
  admission_number: string | null;
  photo_url: string | null;
}

interface AttendanceRecord {
  id?: string;
  student_id: string;
  status: AttendanceStatus;
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

function TeacherAttendanceMark() {
  const { session } = useAuth();
  const teacherId = session?.user?.id;
  const queryClient = useQueryClient();

  const [date, setDate] = useState(todayISO());
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  // Local edit buffer: student_id -> status. Seeded from existing DB rows,
  // then edited freely before a single Save writes it all back.
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});

  const dayOfWeek = useMemo(() => new Date(date + "T00:00:00").getDay(), [date]);

  // ── 1. This teacher's periods for the selected day ──
  const { data: slots, isLoading: slotsLoading } = useQuery({
    queryKey: ["teacher-periods", teacherId, dayOfWeek],
    enabled: !!teacherId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timetable_slots")
        .select("id, school_id, teacher_id, class_id, subject_id, day_of_week, period_number, start_time, end_time, classes(name), subjects(name)")
        .eq("teacher_id", teacherId)
        .eq("day_of_week", dayOfWeek)
        .order("period_number");
      if (error) throw error;
      return (data ?? []) as unknown as TimetableSlot[];
    },
  });

  // Auto-select the first period once slots load, or the period matching
  // the current time of day if marking attendance live during class.
  useEffect(() => {
    if (!slots || slots.length === 0) { setSelectedSlotId(null); return; }
    if (selectedSlotId && slots.some(s => s.id === selectedSlotId)) return;
    const now = new Date();
    const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const current = slots.find(s => s.start_time <= nowHM && nowHM <= s.end_time);
    setSelectedSlotId((current ?? slots[0]).id);
  }, [slots]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedSlot = slots?.find(s => s.id === selectedSlotId) ?? null;

  // ── 2. Students in the selected class ──
  const { data: students, isLoading: studentsLoading } = useQuery({
    queryKey: ["class-students", selectedSlot?.class_id],
    enabled: !!selectedSlot?.class_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, admission_number, photo_url")
        .eq("class_id", selectedSlot!.class_id)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as StudentRow[];
    },
  });

  // ── 3. Existing attendance already marked for this exact period+date ──
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

  // Seed the edit buffer whenever the period/date/roster changes:
  // existing marks win, everyone else defaults to "present" (the fast path
  // for a teacher scanning a mostly-full classroom).
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

  // ── 4. Save — upsert one row per student for this period+date ──
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSlot || !students) throw new Error("Nothing to save");
      const rows = students.map(s => ({
        school_id: selectedSlot.school_id,
        student_id: s.id,
        class_id: selectedSlot.class_id,
        subject_id: selectedSlot.subject_id,
        timetable_slot_id: selectedSlot.id,
        teacher_id: teacherId,
        date,
        status: marks[s.id] ?? "present",
        marked_at: new Date().toISOString(),
      }));
      // Requires a unique constraint on (timetable_slot_id, student_id, date)
      // for the upsert to correctly update rather than duplicate.
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

  const loading = slotsLoading || (!!selectedSlot && (studentsLoading || existingLoading));

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarDays className="w-5 h-5 text-primary" /> Mark Attendance</h1>
        <p className="text-sm text-muted-foreground mt-1">Per-period attendance for your own timetable slots.</p>
      </div>

      {/* Date picker */}
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

      {/* Period picker — only this teacher's own periods for the chosen day */}
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
              <div className="text-xs text-muted-foreground">Period {s.period_number} · {s.start_time}–{s.end_time}</div>
            </button>
          ))}
        </div>
      )}

      {selectedSlot && (
        <>
          {/* Summary bar + bulk action */}
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

          {/* Roster */}
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-2">
              {(students ?? []).map((s) => {
                const status = marks[s.id] ?? "present";
                return (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center text-xs font-semibold text-muted-foreground">
                        {s.photo_url ? <img src={s.photo_url} alt={s.full_name} className="w-full h-full object-cover" /> : s.full_name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{s.full_name}</div>
                        {s.admission_number && <div className="text-xs text-muted-foreground">{s.admission_number}</div>}
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

          {/* Save bar — sticky so it's reachable without scrolling back up on a long roster */}
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
