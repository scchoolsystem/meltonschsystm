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
import { Plus, Loader2, Star } from "lucide-react";
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

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const { isTeacherScoped, classIds, allSubjectIds } = useTeacherScope();
  const can = isAdmin || hasRole("teacher") || hasRole("exams_admin") || hasRole("academic_master");
  const [open, setOpen] = useState(false);

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
        .select("id, score, grade, verified, exams(name), students(first_name,last_name,admission_no), subjects(code,name)")
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
        <div>
          <h1 className="text-3xl font-bold">Exam Results</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Latest 200 entries{isTeacherScoped ? " — your classes only" : ""}
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No results yet.</TableCell></TableRow>
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
