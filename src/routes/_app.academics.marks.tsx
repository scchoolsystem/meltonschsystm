/**
 * src/routes/_app.academics.marks.tsx
 *
 * SmartDev ERP V3 — Results Log
 *
 * The class+subject markbook grid used to live here. It's been superseded by
 * the unified /academics/entry page (score, grade, and subject remark in one
 * grid, auto-saved). This page is now just a flat, filterable log of the
 * latest recorded results plus a one-off "Record Result" dialog for edge
 * cases (a single correction, a result for a student outside the normal
 * class/subject flow, etc).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveStudents } from "@/lib/students.functions";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useTeacherScope } from "@/hooks/use-teacher-scope";
import { fallbackGrade } from "@/lib/grade-utils";

export const Route = createFileRoute("/_app/academics/marks")({ component: Page });

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
        <div>
          <h1 className="text-3xl font-bold">Results Log</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Latest 200 entries{isTeacherScoped ? " — your classes only" : ""}. For day-to-day mark entry, use{" "}
            <a href="/academics/entry" className="underline underline-offset-2">Marks &amp; Remarks</a>.
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

  const { data: students = [] } = useActiveStudents({
    classIds: isTeacherScoped ? classIds : undefined,
    enabled: !isTeacherScoped || classIds.length > 0,
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
      const { error } = await supabase.from("exam_results").insert({ ...f, grade: fallbackGrade(f.score) });
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
