/**
 * src/routes/_app.academics.entry.tsx
 *
 * SmartDev ERP V3 — Marks & Remarks (unified entry grid)
 *
 * The day-to-day mark-entry screen: pick exam + class + subject, then get
 * one row per student with an editable score, an auto-computed grade, and
 * an editable remark — all auto-saved (debounced) to exam_results
 * (score, grade, remarks columns), which already carries a UNIQUE
 * (exam_id, student_id, subject_id) constraint that upsert relies on.
 *
 * This replaces the old class+subject markbook that used to live at
 * /academics/marks. That route is now a flat, filterable log; this page is
 * where actual entry happens.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, getSessionSafe } from "@/integrations/supabase/client";
import { useActiveStudents } from "@/lib/students.functions";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Check, CloudUpload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useTeacherScope } from "@/hooks/use-teacher-scope";
import { fallbackGrade, gradeColor } from "@/lib/grade-utils";

export const Route = createFileRoute("/_app/academics/entry")({
  beforeLoad: async () => {
    const { data, timedOut } = await getSessionSafe();
    if (timedOut) return; // defer to AppLayout's own client-side session check
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: () => (
    <FeatureGate feature="academics">
      <EntryPage />
    </FeatureGate>
  ),
});

// ── Row save status ───────────────────────────────────────────────────────────

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

// Debounces per-key (first argument doubles as the key, e.g. student_id) so
// edits to one student's row don't reset the timer for another's.
function useDebouncedCallback<T extends [string, ...any[]]>(fn: (...args: T) => void, delay: number) {
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  return useMemo(() => {
    return (...args: T) => {
      const key = args[0];
      const existing = timers.current.get(key);
      if (existing) clearTimeout(existing);
      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key);
          fn(...args);
        }, delay)
      );
    };
  }, [fn, delay]);
}

// ── Main page ─────────────────────────────────────────────────────────────────

function EntryPage() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const { isTeacherScoped, classIds, subjectIdsByClass, allSubjectIds } = useTeacherScope();
  const can = isAdmin || hasRole("teacher") || hasRole("class_teacher") || hasRole("subject_teacher") ||
    hasRole("hod") || hasRole("exams_admin") || hasRole("academic_master");

  const [examId, setExamId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const { data: exams = [] } = useQuery({
    queryKey: ["entry-exams"],
    queryFn: async () =>
      (await supabase.from("exams").select("id,name,term,year").order("year", { ascending: false })).data ?? [],
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["entry-classes", isTeacherScoped, classIds.join(",")],
    queryFn: async () => {
      let q = supabase.from("classes").select("id,name,stream").order("name");
      if (isTeacherScoped) {
        if (classIds.length === 0) return [];
        q = q.in("id", classIds);
      }
      return (await q).data ?? [];
    },
  });

  const subjectFilter = useMemo(() => {
    if (!isTeacherScoped) return null;
    if (classId && subjectIdsByClass[classId]?.length) return subjectIdsByClass[classId];
    return allSubjectIds;
  }, [isTeacherScoped, classId, subjectIdsByClass, allSubjectIds]);

  const { data: subjects = [] } = useQuery({
    queryKey: ["entry-subjects", isTeacherScoped, classId, (subjectFilter ?? []).join(",")],
    queryFn: async () => {
      let q = supabase.from("subjects").select("id,code,name").order("name");
      if (isTeacherScoped) {
        if (!subjectFilter || subjectFilter.length === 0) return [];
        q = q.in("id", subjectFilter);
      }
      return (await q).data ?? [];
    },
  });

  // Reset downstream selections when an upstream one changes to something
  // that no longer contains it.
  useEffect(() => { setSubjectId(""); }, [classId]);

  const { data: students = [], isLoading: studentsLoading } = useActiveStudents({
    classId: classId || null,
    enabled: !!classId,
  });

  const { data: existing = [], isLoading: resultsLoading } = useQuery({
    queryKey: ["entry-results", examId, subjectId, (students as any[]).map((s: any) => s.id).join(",")],
    enabled: !!(examId && subjectId && (students as any[]).length > 0),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_results")
        .select("id,student_id,score,grade,remarks,verified")
        .eq("exam_id", examId)
        .eq("subject_id", subjectId)
        .in("student_id", (students as any[]).map((s: any) => s.id));
      if (error) throw error;
      return data ?? [];
    },
  });

  const existingMap = useMemo(
    () => Object.fromEntries((existing as any[]).map((r: any) => [r.student_id, r])),
    [existing]
  );

  // Local edit buffer: student_id -> { score, remarks }
  const [drafts, setDrafts] = useState<Record<string, { score: string; remarks: string }>>({});
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});

  // Drafts reset whenever the exam/class/subject selection changes, so stale
  // edits from a previous grid don't bleed into a new one.
  useEffect(() => { setDrafts({}); setSaveState({}); }, [examId, subjectId, classId]);

  function getScore(studentId: string): string {
    if (drafts[studentId]?.score !== undefined) return drafts[studentId].score;
    const v = existingMap[studentId]?.score;
    return v === null || v === undefined ? "" : String(v);
  }
  function getRemarks(studentId: string): string {
    if (drafts[studentId]?.remarks !== undefined) return drafts[studentId].remarks;
    return existingMap[studentId]?.remarks ?? "";
  }

  const saveMutation = useMutation({
    mutationFn: async (vars: { studentId: string; score: number; remarks: string }) => {
      const { studentId, score, remarks } = vars;
      const { error } = await supabase.from("exam_results").upsert(
        {
          exam_id: examId,
          student_id: studentId,
          subject_id: subjectId,
          score,
          grade: fallbackGrade(score),
          remarks: remarks || null,
        },
        { onConflict: "exam_id,student_id,subject_id" }
      );
      if (error) throw error;
    },
  });

  const debouncedSave = useDebouncedCallback((studentId: string, score: string, remarks: string) => {
    const n = Number(score);
    if (score === "" || Number.isNaN(n) || n < 0 || n > 100) return;
    setSaveState((s) => ({ ...s, [studentId]: "saving" }));
    saveMutation.mutate(
      { studentId, score: n, remarks },
      {
        onSuccess: () => {
          setSaveState((s) => ({ ...s, [studentId]: "saved" }));
          qc.invalidateQueries({ queryKey: ["entry-results", examId, subjectId] });
        },
        onError: (e: any) => {
          setSaveState((s) => ({ ...s, [studentId]: "error" }));
          toast.error(e.message ?? "Save failed");
        },
      }
    );
  }, 900);

  function onScoreChange(studentId: string, score: string) {
    const remarks = getRemarks(studentId);
    setDrafts((d) => ({ ...d, [studentId]: { score, remarks } }));
    setSaveState((s) => ({ ...s, [studentId]: "pending" }));
    debouncedSave(studentId, score, remarks);
  }
  function onRemarksChange(studentId: string, remarks: string) {
    const score = getScore(studentId);
    setDrafts((d) => ({ ...d, [studentId]: { score, remarks } }));
    setSaveState((s) => ({ ...s, [studentId]: "pending" }));
    debouncedSave(studentId, score, remarks);
  }

  const ready = !!(examId && classId && subjectId);

  if (!can) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <p className="text-sm text-muted-foreground">You don't have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Marks &amp; Remarks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Score, grade, and remark in one grid. Changes save automatically a moment after you stop typing.
        </p>
      </div>

      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs font-medium mb-1 block text-muted-foreground">Exam</label>
              <Select value={examId} onValueChange={setExamId}>
                <SelectTrigger><SelectValue placeholder="Select exam" /></SelectTrigger>
                <SelectContent>
                  {(exams as any[]).map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.name} · {e.term} {e.year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs font-medium mb-1 block text-muted-foreground">Class</label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger>
                  <SelectValue placeholder={isTeacherScoped && (classes as any[]).length === 0 ? "No classes assigned" : "Select class"} />
                </SelectTrigger>
                <SelectContent>
                  {(classes as any[]).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}{c.stream ? ` ${c.stream}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs font-medium mb-1 block text-muted-foreground">Subject</label>
              <Select value={subjectId} onValueChange={setSubjectId} disabled={!classId}>
                <SelectTrigger>
                  <SelectValue placeholder={isTeacherScoped && (subjects as any[]).length === 0 ? "No subjects assigned" : "Select subject"} />
                </SelectTrigger>
                <SelectContent>
                  {(subjects as any[]).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {!ready ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Pick an exam, class, and subject to start entering marks.
        </CardContent></Card>
      ) : studentsLoading || resultsLoading ? (
        <div className="h-40 grid place-items-center"><Loader2 className="animate-spin" /></div>
      ) : (students as any[]).length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          No active students in this class.
        </CardContent></Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{(students as any[]).length} students</CardTitle>
            <CardDescription>Enter a score (0–100); grade fills in automatically.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Adm No</TableHead>
                  <TableHead className="w-28">Score</TableHead>
                  <TableHead className="w-20">Grade</TableHead>
                  <TableHead>Remark</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(students as any[]).map((student: any) => {
                  const score = getScore(student.id);
                  const n = Number(score);
                  const grade = score !== "" && !Number.isNaN(n) ? fallbackGrade(n) : "";
                  const state = saveState[student.id] ?? "idle";
                  const verified = existingMap[student.id]?.verified;
                  return (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">{student.first_name} {student.last_name}</TableCell>
                      <TableCell className="font-mono text-xs">{student.admission_no}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          value={score}
                          onChange={(e) => onScoreChange(student.id, e.target.value)}
                          className="h-8"
                          disabled={!!verified && !isAdmin}
                        />
                      </TableCell>
                      <TableCell>
                        {grade ? <span className={`font-bold ${gradeColor(grade)}`}>{grade}</span> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Textarea
                          rows={1}
                          placeholder="Optional remark…"
                          value={getRemarks(student.id)}
                          onChange={(e) => onRemarksChange(student.id, e.target.value)}
                          className="resize-none text-sm min-h-[32px] py-1.5"
                          disabled={!!verified && !isAdmin}
                        />
                      </TableCell>
                      <TableCell>
                        {state === "saving" && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                        {state === "pending" && <CloudUpload className="w-3.5 h-3.5 text-muted-foreground" />}
                        {state === "saved" && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                        {state === "error" && <Badge variant="outline" className="text-xs text-red-600 border-red-500/30">error</Badge>}
                        {verified && <Badge variant="outline" className="text-xs ml-1">verified</Badge>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
