import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Star, Pencil, CheckCircle2, UserSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useTeacherScope } from "@/hooks/use-teacher-scope";

export const Route = createFileRoute("/_app/academics/results")({ component: Page });

// ── Resolve grade from DB scale for a given subject + score ─────────────────
async function resolveGrade(score: number, subjectId: string): Promise<string> {
  try {
    const { data: schoolId } = await supabase.rpc("current_user_school");
    if (!schoolId) return fallbackGrade(score);
    const { data } = await supabase.rpc("grade_for", {
      p_school_id: schoolId as string,
      p_score: score,
      p_subject_id: subjectId,
    });
    return (data as any)?.[0]?.grade ?? fallbackGrade(score);
  } catch {
    return fallbackGrade(score);
  }
}

// Fallback if DB call fails — Kenya 8-4-4 defaults
function fallbackGrade(s: number) {
  if (s >= 80) return "A"; if (s >= 75) return "A-"; if (s >= 70) return "B+";
  if (s >= 65) return "B"; if (s >= 60) return "B-"; if (s >= 55) return "C+";
  if (s >= 50) return "C"; if (s >= 45) return "C-"; if (s >= 40) return "D+";
  if (s >= 35) return "D"; if (s >= 30) return "D-"; return "E";
}

function classLabel(c?: { name?: string | null; stream?: string | null } | null) {
  if (!c) return "—";
  return `${c.name ?? ""}${c.stream ? " " + c.stream : ""}`.trim() || "—";
}

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const { isTeacherScoped, classIds, allSubjectIds } = useTeacherScope();
  const can = isAdmin || hasRole("teacher") || hasRole("exams_admin") || hasRole("academic_master");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const { data: scopedStudentIds = [] } = useQuery({
    queryKey: ["results-scope-students", classIds.join(",")],
    enabled: isTeacherScoped,
    queryFn: async () => {
      if (classIds.length === 0) return [];
      const { data } = await supabase.from("students").select("id").in("class_id", classIds);
      return (data ?? []).map((s: any) => s.id);
    },
  });

  const { data = [], isLoading } = useQuery({
    queryKey: ["exam_results", isTeacherScoped, scopedStudentIds.length, allSubjectIds.join(",")],
    queryFn: async () => {
      let q = supabase
        .from("exam_results")
        .select("id, score, grade, verified, remarks, exam_id, student_id, subject_id, exams(name), students(first_name,last_name,admission_no), subjects(code,name)")
        .order("created_at", { ascending: false }).limit(200);
      if (isTeacherScoped) {
        if (scopedStudentIds.length === 0) return [];
        q = q.in("student_id", scopedStudentIds);
        if (allSubjectIds.length > 0) q = q.in("subject_id", allSubjectIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("exam_results").update({ verified: true, verified_by: u.user?.id, verified_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exam_results"] }); toast.success("Result verified"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold">Exam Results</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isTeacherScoped ? "Your classes only" : "All results"}
            {" · "}Grades calculated from each subject's assigned grading scale.
          </p>
        </div>
        {can && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Record Result</Button></DialogTrigger>
            <AddDialog onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["exam_results"] }); }} />
          </Dialog>
        )}
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All Results</TabsTrigger>
          <TabsTrigger value="student">By Student</TabsTrigger>
          <TabsTrigger value="class">Class Performance</TabsTrigger>
          <TabsTrigger value="subject">Subject Performance</TabsTrigger>
        </TabsList>

        {/* ───────────────────────── ALL RESULTS ───────────────────────── */}
        <TabsContent value="all">
          <Card>
            <CardHeader />
            <CardContent>
              {isLoading ? <div className="h-40 grid place-items-center"><Loader2 className="animate-spin" /></div> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Adm No</TableHead>
                      <TableHead>Exam</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Status</TableHead>
                      {can && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.length === 0 && (
                      <TableRow><TableCell colSpan={can ? 8 : 7} className="text-center text-muted-foreground py-8">No results yet.</TableCell></TableRow>
                    )}
                    {data.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.students?.first_name} {r.students?.last_name}</TableCell>
                        <TableCell className="font-mono text-xs">{r.students?.admission_no}</TableCell>
                        <TableCell>{r.exams?.name}</TableCell>
                        <TableCell>{r.subjects?.code}</TableCell>
                        <TableCell>{r.score}</TableCell>
                        <TableCell className="font-bold text-base">{r.grade}</TableCell>
                        <TableCell>
                          {r.verified
                            ? <Badge className="bg-green-600">Verified</Badge>
                            : <Badge variant="outline">Pending</Badge>}
                        </TableCell>
                        {can && (
                          <TableCell className="text-right space-x-1">
                            {!r.verified && (
                              <Button size="sm" variant="ghost" className="h-8" onClick={() => verifyMutation.mutate(r.id)}>
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Verify
                              </Button>
                            )}
                            <Button size="sm" variant="outline" className="h-8" onClick={() => setEditing(r)}>
                              <Pencil className="w-3.5 h-3.5 mr-1" />Edit
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───────────────────────── BY STUDENT ───────────────────────── */}
        <TabsContent value="student">
          <StudentResultsPanel isTeacherScoped={isTeacherScoped} classIds={classIds} />
        </TabsContent>

        {/* ───────────────────────── CLASS PERFORMANCE ───────────────────────── */}
        <TabsContent value="class">
          <PerformancePanel mode="class" />
        </TabsContent>

        {/* ───────────────────────── SUBJECT PERFORMANCE ───────────────────────── */}
        <TabsContent value="subject">
          <PerformancePanel mode="subject" />
        </TabsContent>
      </Tabs>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        {editing && (
          <EditResultDialog
            result={editing}
            onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["exam_results"] }); }}
          />
        )}
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Record Result (insert)
// ─────────────────────────────────────────────────────────────────────────
function AddDialog({ onDone }: { onDone: () => void }) {
  const { isTeacherScoped, classIds, subjectIdsByClass, allSubjectIds } = useTeacherScope();
  const [f, setF] = useState({ exam_id: "", student_id: "", subject_id: "", score: "" as string | number, remarks: "" });
  const [previewGrade, setPreviewGrade] = useState<string | null>(null);
  const [loadingGrade, setLoadingGrade] = useState(false);

  const { data: exams = [] } = useQuery({
    queryKey: ["exams-min"],
    queryFn: async () => (await supabase.from("exams").select("id,name").order("created_at", { ascending: false })).data ?? [],
  });

  const { data: students = [] } = useQuery({
    queryKey: ["students-min", isTeacherScoped, classIds.join(",")],
    queryFn: async () => {
      let q = supabase.from("students").select("id,admission_no,first_name,last_name,class_id").order("admission_no", { ascending: false }).limit(500);
      if (isTeacherScoped) {
        if (classIds.length === 0) return [];
        q = q.in("class_id", classIds);
      }
      return (await q).data ?? [];
    },
  });

  // Subjects with their scale info
  const studentClassId = useMemo(() => (students as any[]).find(s => s.id === f.student_id)?.class_id ?? "", [students, f.student_id]);
  const subjectFilter = useMemo(() => {
    if (!isTeacherScoped) return null;
    if (studentClassId && subjectIdsByClass[studentClassId]?.length) return subjectIdsByClass[studentClassId];
    return allSubjectIds;
  }, [isTeacherScoped, studentClassId, subjectIdsByClass, allSubjectIds]);

  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects-with-scale-min", isTeacherScoped, (subjectFilter ?? []).join(",")],
    queryFn: async () => {
      let q = supabase.from("subjects").select("id,code,name,scale_id").order("code");
      if (isTeacherScoped) {
        if (!subjectFilter || subjectFilter.length === 0) return [];
        q = q.in("id", subjectFilter);
      }
      return (await q).data ?? [];
    },
  });

  // Subject's scale name for display
  const { data: scales = [] } = useQuery({
    queryKey: ["grading-scales"],
    queryFn: async () => (await supabase.from("grading_scales").select("id,name,is_default")).data ?? [],
  });

  const selectedSubject = (subjects as any[]).find(s => s.id === f.subject_id);
  const selectedSubjectScale = selectedSubject?.scale_id
    ? (scales as any[]).find(s => s.id === selectedSubject.scale_id)?.name
    : (scales as any[]).find((s: any) => s.is_default)?.name ?? "School default";

  // Preview grade when score + subject both set
  async function updatePreview(score: number | string, subjectId: string) {
    const n = Number(score);
    if (!subjectId || isNaN(n) || n < 0 || n > 100) { setPreviewGrade(null); return; }
    setLoadingGrade(true);
    const g = await resolveGrade(n, subjectId);
    setPreviewGrade(g);
    setLoadingGrade(false);
  }

  const m = useMutation({
    mutationFn: async () => {
      const score = Number(f.score);
      const grade = await resolveGrade(score, f.subject_id);
      const { error } = await supabase.from("exam_results").insert({
        exam_id: f.exam_id,
        student_id: f.student_id,
        subject_id: f.subject_id,
        score,
        grade,
        remarks: f.remarks.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Result recorded"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Record Result</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Exam</Label>
          <Select value={f.exam_id} onValueChange={v => setF({ ...f, exam_id: v })}>
            <SelectTrigger><SelectValue placeholder="Choose exam" /></SelectTrigger>
            <SelectContent>{(exams as any[]).map(x => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Student</Label>
          <Select value={f.student_id} onValueChange={v => setF({ ...f, student_id: v, subject_id: "" })}>
            <SelectTrigger><SelectValue placeholder="Choose student" /></SelectTrigger>
            <SelectContent>{(students as any[]).map(s => <SelectItem key={s.id} value={s.id}>{s.admission_no} – {s.first_name} {s.last_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Subject</Label>
          <Select value={f.subject_id} onValueChange={v => { setF({ ...f, subject_id: v }); updatePreview(f.score, v); }}>
            <SelectTrigger><SelectValue placeholder="Choose subject" /></SelectTrigger>
            <SelectContent>{(subjects as any[]).map(s => <SelectItem key={s.id} value={s.id}>{s.code} – {s.name}</SelectItem>)}</SelectContent>
          </Select>
          {f.subject_id && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Star className="w-3 h-3" /> Using scale: <span className="font-medium">{selectedSubjectScale}</span>
            </p>
          )}
        </div>
        <div>
          <Label>Score (0–100)</Label>
          <Input
            type="number" min={0} max={100} step="0.01"
            value={f.score}
            onChange={e => { setF({ ...f, score: e.target.value }); updatePreview(e.target.value, f.subject_id); }}
            required
          />
          {/* Live grade preview */}
          {f.subject_id && f.score !== "" && (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Grade preview:</span>
              {loadingGrade
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <span className="text-sm font-bold">{previewGrade ?? "—"}</span>
              }
            </div>
          )}
        </div>
        <div>
          <Label>Remarks (optional)</Label>
          <Textarea rows={2} value={f.remarks} onChange={e => setF({ ...f, remarks: e.target.value })} placeholder="Teacher's comment…" />
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() => m.mutate()}
          disabled={m.isPending || !f.exam_id || !f.student_id || !f.subject_id || f.score === ""}
        >
          {m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Edit / verify an existing result
// ─────────────────────────────────────────────────────────────────────────
function EditResultDialog({ result, onDone }: { result: any; onDone: () => void }) {
  const [score, setScore] = useState<string | number>(result.score);
  const [remarks, setRemarks] = useState(result.remarks ?? "");
  const [verified, setVerified] = useState<boolean>(!!result.verified);
  const [previewGrade, setPreviewGrade] = useState<string | null>(result.grade ?? null);
  const [loadingGrade, setLoadingGrade] = useState(false);

  async function updatePreview(s: number | string) {
    const n = Number(s);
    if (isNaN(n) || n < 0 || n > 100) { setPreviewGrade(null); return; }
    setLoadingGrade(true);
    const g = await resolveGrade(n, result.subject_id);
    setPreviewGrade(g);
    setLoadingGrade(false);
  }

  const m = useMutation({
    mutationFn: async () => {
      const n = Number(score);
      const grade = await resolveGrade(n, result.subject_id);
      const { data: u } = await supabase.auth.getUser();
      const payload: any = { score: n, grade, remarks: remarks.trim() || null, verified };
      if (verified && !result.verified) { payload.verified_by = u.user?.id; payload.verified_at = new Date().toISOString(); }
      const { error } = await supabase.from("exam_results").update(payload).eq("id", result.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Result updated"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          Edit Result — {result.students?.first_name} {result.students?.last_name} · {result.subjects?.code}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="text-xs text-muted-foreground">{result.exams?.name}</div>
        <div>
          <Label>Score (0–100)</Label>
          <Input type="number" min={0} max={100} step="0.01" value={score} onChange={e => { setScore(e.target.value); updatePreview(e.target.value); }} />
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Grade preview:</span>
            {loadingGrade ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="text-sm font-bold">{previewGrade ?? "—"}</span>}
          </div>
        </div>
        <div>
          <Label>Remarks</Label>
          <Textarea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} className="w-4 h-4" />
          Mark as verified
        </label>
      </div>
      <DialogFooter>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>
          {m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save Changes
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// By Student — pick a student, see every subject result for them
// ─────────────────────────────────────────────────────────────────────────
function StudentResultsPanel({ isTeacherScoped, classIds }: { isTeacherScoped: boolean; classIds: string[] }) {
  const [examId, setExamId] = useState<string>("all");
  const [studentId, setStudentId] = useState<string>("");

  const { data: exams = [] } = useQuery({
    queryKey: ["exams-min"],
    queryFn: async () => (await supabase.from("exams").select("id,name").order("created_at", { ascending: false })).data ?? [],
  });

  const { data: students = [] } = useQuery({
    queryKey: ["students-min", isTeacherScoped, classIds.join(",")],
    queryFn: async () => {
      let q = supabase.from("students").select("id,admission_no,first_name,last_name,class_id, classes(name,stream)").order("first_name").limit(1000);
      if (isTeacherScoped) {
        if (classIds.length === 0) return [];
        q = q.in("class_id", classIds);
      }
      return (await q).data ?? [];
    },
  });

  const selectedStudent = (students as any[]).find(s => s.id === studentId);

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["results-by-student", studentId, examId],
    enabled: !!studentId,
    queryFn: async () => {
      let q = supabase.from("exam_results")
        .select("id, score, grade, verified, remarks, exams(id,name,term,year), subjects(code,name)")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false });
      if (examId !== "all") q = q.eq("exam_id", examId);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const meanScore = useMemo(() => results.length ? results.reduce((s: number, r: any) => s + Number(r.score), 0) / results.length : null, [results]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 flex-wrap">
        <UserSearch className="w-4 h-4 text-muted-foreground" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
          <div>
            <Label className="text-xs">Student</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger><SelectValue placeholder="Choose a student to view their results" /></SelectTrigger>
              <SelectContent>
                {(students as any[]).map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.admission_no} – {s.first_name} {s.last_name} {s.classes ? `(${classLabel(s.classes)})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Exam</Label>
            <Select value={examId} onValueChange={setExamId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All exams</SelectItem>
                {(exams as any[]).map(x => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!studentId ? (
          <p className="text-sm text-muted-foreground text-center py-10">Select a student above to see their results — only that student's subjects will be shown, not the whole school.</p>
        ) : isLoading ? (
          <div className="h-32 grid place-items-center"><Loader2 className="animate-spin" /></div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="text-sm">
                <span className="font-semibold">{selectedStudent?.first_name} {selectedStudent?.last_name}</span>
                <span className="text-muted-foreground"> · {selectedStudent?.admission_no} · {classLabel(selectedStudent?.classes)}</span>
              </div>
              {meanScore != null && <Badge variant="outline">Mean score: {meanScore.toFixed(1)}</Badge>}
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Exam</TableHead><TableHead>Subject</TableHead><TableHead>Score</TableHead><TableHead>Grade</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {results.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No results recorded for this student yet.</TableCell></TableRow>}
                {results.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.exams?.name}</TableCell>
                    <TableCell>{r.subjects?.code} – {r.subjects?.name}</TableCell>
                    <TableCell>{r.score}</TableCell>
                    <TableCell className="font-bold">{r.grade}</TableCell>
                    <TableCell>{r.verified ? <Badge className="bg-green-600">Verified</Badge> : <Badge variant="outline">Pending</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Class / Subject performance breakdowns for a chosen exam
// ─────────────────────────────────────────────────────────────────────────
function PerformancePanel({ mode }: { mode: "class" | "subject" }) {
  const [examId, setExamId] = useState<string>("");

  const { data: exams = [] } = useQuery({
    queryKey: ["exams-min"],
    queryFn: async () => (await supabase.from("exams").select("id,name").order("created_at", { ascending: false })).data ?? [],
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["results-for-exam", examId],
    enabled: !!examId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_results")
        .select("id, score, student_id, subject_id, students(class_id, classes(name,stream)), subjects(code,name)")
        .eq("exam_id", examId)
        .limit(5000);
      if (error) throw error;
      return data as any[];
    },
  });

  const classRows = useMemo(() => {
    const map = new Map<string, { label: string; students: Set<string>; entries: number; total: number }>();
    for (const r of rows as any[]) {
      const classId = r.students?.class_id ?? "unassigned";
      const label = classLabel(r.students?.classes);
      if (!map.has(classId)) map.set(classId, { label, students: new Set(), entries: 0, total: 0 });
      const bucket = map.get(classId)!;
      bucket.students.add(r.student_id);
      bucket.entries += 1;
      bucket.total += Number(r.score);
    }
    return Array.from(map.values())
      .map(b => ({ label: b.label, studentCount: b.students.size, entries: b.entries, mean: b.entries ? b.total / b.entries : 0 }))
      .sort((a, b) => b.mean - a.mean);
  }, [rows]);

  const subjectRows = useMemo(() => {
    const map = new Map<string, { classLabel: string; subjectLabel: string; entries: number; total: number }>();
    for (const r of rows as any[]) {
      const classId = r.students?.class_id ?? "unassigned";
      const subjId = r.subject_id ?? "unknown";
      const key = `${classId}__${subjId}`;
      if (!map.has(key)) {
        map.set(key, {
          classLabel: classLabel(r.students?.classes),
          subjectLabel: r.subjects ? `${r.subjects.code} – ${r.subjects.name}` : "—",
          entries: 0, total: 0,
        });
      }
      const bucket = map.get(key)!;
      bucket.entries += 1;
      bucket.total += Number(r.score);
    }
    return Array.from(map.values())
      .map(b => ({ ...b, mean: b.entries ? b.total / b.entries : 0 }))
      .sort((a, b) => a.classLabel.localeCompare(b.classLabel) || a.subjectLabel.localeCompare(b.subjectLabel));
  }, [rows]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 flex-wrap">
        <div className="flex-1 max-w-xs">
          <Label className="text-xs">Exam</Label>
          <Select value={examId} onValueChange={setExamId}>
            <SelectTrigger><SelectValue placeholder="Choose an exam to see breakdowns" /></SelectTrigger>
            <SelectContent>{(exams as any[]).map(x => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {!examId ? (
          <p className="text-sm text-muted-foreground text-center py-10">Choose an exam above to see {mode === "class" ? "per-class" : "per-subject, per-class"} performance — e.g. Form 3 Blue vs Form 3 Red.</p>
        ) : isLoading ? (
          <div className="h-32 grid place-items-center"><Loader2 className="animate-spin" /></div>
        ) : mode === "class" ? (
          <Table>
            <TableHeader><TableRow><TableHead>Class</TableHead><TableHead className="text-right">Students</TableHead><TableHead className="text-right">Entries</TableHead><TableHead className="text-right">Mean Score</TableHead><TableHead className="text-right">Approx. Mean Grade</TableHead></TableRow></TableHeader>
            <TableBody>
              {classRows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No results recorded for this exam yet.</TableCell></TableRow>}
              {classRows.map(c => (
                <TableRow key={c.label}>
                  <TableCell className="font-medium">{c.label}</TableCell>
                  <TableCell className="text-right">{c.studentCount}</TableCell>
                  <TableCell className="text-right">{c.entries}</TableCell>
                  <TableCell className="text-right font-mono">{c.mean.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-bold">{fallbackGrade(c.mean)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Class</TableHead><TableHead>Subject</TableHead><TableHead className="text-right">Entries</TableHead><TableHead className="text-right">Mean Score</TableHead><TableHead className="text-right">Approx. Mean Grade</TableHead></TableRow></TableHeader>
            <TableBody>
              {subjectRows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No results recorded for this exam yet.</TableCell></TableRow>}
              {subjectRows.map((s, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{s.classLabel}</TableCell>
                  <TableCell>{s.subjectLabel}</TableCell>
                  <TableCell className="text-right">{s.entries}</TableCell>
                  <TableCell className="text-right font-mono">{s.mean.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-bold">{fallbackGrade(s.mean)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          "Approx. Mean Grade" is computed from the mean score using the school's default grading bands. Individual results use each subject's own grading scale.
        </p>
      </CardContent>
    </Card>
  );
}
