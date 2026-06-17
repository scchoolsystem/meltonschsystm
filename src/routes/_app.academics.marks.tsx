import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, Save, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useTeacherScope } from "@/hooks/use-teacher-scope";

export const Route = createFileRoute("/_app/academics/results")({ component: RootPage });

function gradeFor(s: number) {
  if (s >= 80) return "A"; if (s >= 70) return "B"; if (s >= 60) return "C"; if (s >= 50) return "D"; return "E";
}

function RootPage() {
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("teacher") || hasRole("exams_admin") || hasRole("academic_master");
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div><h1 className="text-3xl font-bold">Marks &amp; Results</h1><p className="text-sm text-muted-foreground mt-1">Enter marks by class and subject, or browse recorded results.</p></div>
      <Tabs defaultValue={can ? "markbook" : "results"}>
        <TabsList>
          {can && <TabsTrigger value="markbook">Markbook (Class + Subject)</TabsTrigger>}
          <TabsTrigger value="results">Results List</TabsTrigger>
        </TabsList>
        {can && <TabsContent value="markbook" className="mt-4"><MarksGrid /></TabsContent>}
        <TabsContent value="results" className="mt-4"><Page /></TabsContent>
      </Tabs>
    </div>
  );
}

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const { isTeacherScoped, classIds, allSubjectIds } = useTeacherScope();
  const can = isAdmin || hasRole("teacher") || hasRole("exams_admin") || hasRole("academic_master");
  const [open, setOpen] = useState(false);

  // Resolve student_ids for the teacher's classes (used to scope the results list)
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
        .select("id, score, grade, verified, exams(name), students(first_name,last_name,admission_no), subjects(code)")
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

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">Exam Results</h1><p className="text-sm text-muted-foreground mt-1">Latest 200 entries{isTeacherScoped ? " — your classes only" : ""}</p></div>
        {can && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Record Result</Button></DialogTrigger>
            <AddDialog onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["exam_results"] }); }} />
          </Dialog>
        )}
      </div>
      <Card>
        <CardHeader />
        <CardContent>
          {isLoading ? <div className="h-40 grid place-items-center"><Loader2 className="animate-spin" /></div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Adm No</TableHead><TableHead>Exam</TableHead><TableHead>Subject</TableHead><TableHead>Score</TableHead><TableHead>Grade</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No results yet.</TableCell></TableRow>}
                {data.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.students?.first_name} {r.students?.last_name}</TableCell>
                    <TableCell className="font-mono text-xs">{r.students?.admission_no}</TableCell>
                    <TableCell>{r.exams?.name}</TableCell>
                    <TableCell>{r.subjects?.code}</TableCell>
                    <TableCell>{r.score}</TableCell>
                    <TableCell className="font-bold">{r.grade}</TableCell>
                    <TableCell>{r.verified ? <Badge className="bg-green-600">Verified</Badge> : <Badge variant="outline">Pending</Badge>}</TableCell>
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

function AddDialog({ onDone }: { onDone: () => void }) {
  const { isTeacherScoped, classIds, subjectIdsByClass, allSubjectIds } = useTeacherScope();
  const [f, setF] = useState({ exam_id: "", student_id: "", subject_id: "", score: 0, remarks: "" });

  const { data: exams = [] } = useQuery({ queryKey: ["exams-min"], queryFn: async () => (await supabase.from("exams").select("id,name").order("created_at", { ascending: false })).data ?? [] });

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

  // Subjects scoped to teacher's allowed list, narrowed by student's class when known
  const studentClassId = useMemo(() => (students as any[]).find(s => s.id === f.student_id)?.class_id ?? "", [students, f.student_id]);
  const subjectFilter = useMemo(() => {
    if (!isTeacherScoped) return null;
    if (studentClassId && subjectIdsByClass[studentClassId]?.length) return subjectIdsByClass[studentClassId];
    return allSubjectIds;
  }, [isTeacherScoped, studentClassId, subjectIdsByClass, allSubjectIds]);

  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects-min", isTeacherScoped, (subjectFilter ?? []).join(",")],
    queryFn: async () => {
      let q = supabase.from("subjects").select("id,code,name").order("code");
      if (isTeacherScoped) {
        if (!subjectFilter || subjectFilter.length === 0) return [];
        q = q.in("id", subjectFilter);
      }
      return (await q).data ?? [];
    },
  });

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("exam_results").insert({ ...f, grade: gradeFor(f.score) });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Result recorded"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Record Result</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Exam</Label>
          <Select value={f.exam_id} onValueChange={v => setF({ ...f, exam_id: v })}>
            <SelectTrigger><SelectValue placeholder="Choose exam" /></SelectTrigger>
            <SelectContent>{(exams as any[]).map(x => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Student</Label>
          <Select value={f.student_id} onValueChange={v => setF({ ...f, student_id: v, subject_id: "" })}>
            <SelectTrigger><SelectValue placeholder={isTeacherScoped && (students as any[]).length === 0 ? "No students in your classes" : "Choose student"} /></SelectTrigger>
            <SelectContent>{(students as any[]).map(s => <SelectItem key={s.id} value={s.id}>{s.admission_no} – {s.first_name} {s.last_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Subject</Label>
          <Select value={f.subject_id} onValueChange={v => setF({ ...f, subject_id: v })}>
            <SelectTrigger><SelectValue placeholder={isTeacherScoped && (subjects as any[]).length === 0 ? "No subjects assigned" : "Choose subject"} /></SelectTrigger>
            <SelectContent>{(subjects as any[]).map(s => <SelectItem key={s.id} value={s.id}>{s.code} – {s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Score (0–100)</Label><Input type="number" min={0} max={100} step="0.01" value={f.score} onChange={e => setF({ ...f, score: +e.target.value })} required /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending || !f.exam_id || !f.student_id || !f.subject_id}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

// ─── Class + Subject markbook grid ──────────────────────────────────────────
// Pick an exam, a class, and a subject; enter every student's score in one
// table and save the whole roster in a single batch (upsert on the existing
// exam_id/student_id/subject_id unique constraint).
function MarksGrid() {
  const qc = useQueryClient();
  const { isTeacherScoped, classIds, subjectIdsByClass, allSubjectIds } = useTeacherScope();
  const [examId, setExamId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [scores, setScores] = useState<Record<string, string>>({});

  const { data: exams = [] } = useQuery({
    queryKey: ["exams-min-grid"],
    queryFn: async () => (await supabase.from("exams").select("id,name,status").order("created_at", { ascending: false })).data ?? [],
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["classes-min-grid", isTeacherScoped, classIds.join(",")],
    queryFn: async () => {
      let q = supabase.from("classes").select("id,name").order("name");
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
    queryKey: ["subjects-min-grid", isTeacherScoped, (subjectFilter ?? []).join(",")],
    enabled: !!classId,
    queryFn: async () => {
      let q = supabase.from("subjects").select("id,code,name").order("code");
      if (isTeacherScoped) {
        if (!subjectFilter || subjectFilter.length === 0) return [];
        q = q.in("id", subjectFilter);
      }
      return (await q).data ?? [];
    },
  });

  const { data: roster = [], isLoading: rosterLoading } = useQuery({
    queryKey: ["markbook-roster", classId],
    enabled: !!classId,
    queryFn: async () =>
      (await supabase.from("students").select("id,admission_no,first_name,last_name").eq("class_id", classId).order("first_name")).data ?? [],
  });

  // Existing scores for this exam+class+subject, to prefill the grid
  const { data: existing = [], isLoading: existingLoading } = useQuery({
    queryKey: ["markbook-existing", examId, classId, subjectId],
    enabled: !!examId && !!classId && !!subjectId && roster.length > 0,
    queryFn: async () => {
      const studentIds = (roster as any[]).map(s => s.id);
      const { data, error } = await supabase
        .from("exam_results")
        .select("student_id,score")
        .eq("exam_id", examId).eq("subject_id", subjectId).in("student_id", studentIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Prefill the input map whenever the roster's existing scores load
  useMemo(() => {
    if (!existing.length) return;
    setScores(prev => {
      const next = { ...prev };
      for (const r of existing as any[]) {
        if (next[r.student_id] === undefined) next[r.student_id] = String(r.score);
      }
      return next;
    });
  }, [existing]);

  const setScore = (studentId: string, val: string) => setScores(prev => ({ ...prev, [studentId]: val }));

  const filledCount = (roster as any[]).filter(s => scores[s.id] !== undefined && scores[s.id] !== "").length;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const rows = (roster as any[])
        .filter(s => scores[s.id] !== undefined && scores[s.id] !== "")
        .map(s => {
          const score = Number(scores[s.id]);
          return { exam_id: examId, student_id: s.id, subject_id: subjectId, score, grade: gradeFor(score) };
        });
      if (rows.length === 0) throw new Error("Enter at least one score before saving.");
      const { error } = await supabase.from("exam_results").upsert(rows, { onConflict: "exam_id,student_id,subject_id" });
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count) => {
      toast.success(`Saved ${count} score${count === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["exam_results"] });
      qc.invalidateQueries({ queryKey: ["markbook-existing", examId, classId, subjectId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const ready = !!examId && !!classId && !!subjectId;
  const loadingRoster = rosterLoading || existingLoading;

  return (
    <Card>
      <CardHeader>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>Exam</Label>
            <Select value={examId} onValueChange={v => { setExamId(v); setScores({}); }}>
              <SelectTrigger><SelectValue placeholder="Choose exam" /></SelectTrigger>
              <SelectContent>{(exams as any[]).map(x => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Class</Label>
            <Select value={classId} onValueChange={v => { setClassId(v); setSubjectId(""); setScores({}); }}>
              <SelectTrigger><SelectValue placeholder={isTeacherScoped && (classes as any[]).length === 0 ? "No classes assigned" : "Choose class"} /></SelectTrigger>
              <SelectContent>{(classes as any[]).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Subject</Label>
            <Select value={subjectId} onValueChange={v => { setSubjectId(v); setScores({}); }} disabled={!classId}>
              <SelectTrigger><SelectValue placeholder={!classId ? "Choose a class first" : (isTeacherScoped && (subjects as any[]).length === 0 ? "No subjects assigned" : "Choose subject")} /></SelectTrigger>
              <SelectContent>{(subjects as any[]).map(s => <SelectItem key={s.id} value={s.id}>{s.code} – {s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!ready ? (
          <div className="text-center text-sm text-muted-foreground py-10">Pick an exam, class, and subject to load the roster.</div>
        ) : loadingRoster ? (
          <div className="h-40 grid place-items-center"><Loader2 className="animate-spin" /></div>
        ) : roster.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-10">No students found in this class.</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{filledCount} of {roster.length} students scored</p>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || filledCount === 0}>
                {saveMutation.isPending ? <Loader2 className="mr-2 w-4 h-4 animate-spin" /> : <Save className="mr-2 w-4 h-4" />}
                Save Marks
              </Button>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Adm No</TableHead><TableHead>Student</TableHead><TableHead className="w-40">Score (0–100)</TableHead><TableHead className="w-20">Grade</TableHead></TableRow></TableHeader>
              <TableBody>
                {(roster as any[]).map(s => {
                  const raw = scores[s.id] ?? "";
                  const num = raw === "" ? null : Number(raw);
                  const valid = num !== null && !Number.isNaN(num) && num >= 0 && num <= 100;
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.admission_no}</TableCell>
                      <TableCell className="font-medium">{s.first_name} {s.last_name}</TableCell>
                      <TableCell>
                        <Input
                          type="number" min={0} max={100} step="0.01"
                          value={raw}
                          onChange={e => setScore(s.id, e.target.value)}
                          className={raw !== "" && !valid ? "border-destructive" : ""}
                        />
                      </TableCell>
                      <TableCell>
                        {valid ? (
                          <Badge variant="outline" className="font-bold">{gradeFor(num!)}</Badge>
                        ) : raw !== "" ? (
                          <span className="text-xs text-destructive">0–100</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {filledCount > 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Scores save per student — leave any box empty to skip that student for now.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
