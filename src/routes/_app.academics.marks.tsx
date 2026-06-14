import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Save, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useTeacherScope } from "@/hooks/use-teacher-scope";

export const Route = createFileRoute("/_app/academics/marks")({ component: Page });

function gradeFor(s: number) {
  if (s >= 80) return "A"; if (s >= 70) return "B"; if (s >= 60) return "C"; if (s >= 50) return "D"; return "E";
}

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const { isTeacherScoped, classIds, subjectIdsByClass, allSubjectIds } = useTeacherScope();
  const canEnter = isAdmin || hasRole("teacher") || hasRole("subject_teacher") || hasRole("exams_admin") || hasRole("academic_master");
  const canVerify = isAdmin || hasRole("exams_admin") || hasRole("academic_master");

  const [examId, setExamId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [scores, setScores] = useState<Record<string, { id?: string; score: string; verified: boolean }>>({});

  const { data: exams = [] } = useQuery({ queryKey: ["exams-marks"], queryFn: async () => (await supabase.from("exams").select("id,name,term,year").order("created_at", { ascending: false })).data ?? [] });
  const { data: classes = [] } = useQuery({
    queryKey: ["classes-marks", isTeacherScoped, classIds.join(",")],
    queryFn: async () => {
      let q = supabase.from("classes").select("id,name").order("name");
      if (isTeacherScoped) {
        if (classIds.length === 0) return [];
        q = q.in("id", classIds);
      }
      return (await q).data ?? [];
    },
  });
  const allowedSubjectIds = useMemo(() => {
    if (!isTeacherScoped) return null;
    if (classId && subjectIdsByClass[classId]?.length) return subjectIdsByClass[classId];
    return allSubjectIds;
  }, [isTeacherScoped, classId, subjectIdsByClass, allSubjectIds]);

  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects-marks", isTeacherScoped, (allowedSubjectIds ?? []).join(",")],
    queryFn: async () => {
      let q = supabase.from("subjects").select("id,code,name").order("code");
      if (isTeacherScoped) {
        if (!allowedSubjectIds || allowedSubjectIds.length === 0) return [];
        q = q.in("id", allowedSubjectIds);
      }
      return (await q).data ?? [];
    },
  });

  // Reset subject if it leaves the allowed list after class change
  useEffect(() => {
    if (isTeacherScoped && subjectId && allowedSubjectIds && !allowedSubjectIds.includes(subjectId)) {
      setSubjectId("");
    }
  }, [isTeacherScoped, subjectId, allowedSubjectIds]);

  const { data: students, isFetching: loadingStudents } = useQuery({
    queryKey: ["students-class-marks", classId],
    enabled: !!classId,
    queryFn: async () => (await supabase.from("students").select("id,admission_no,first_name,last_name").eq("class_id", classId).eq("status", "active").order("last_name")).data ?? [],
  });

  const { data: existing, isFetching: loadingExisting } = useQuery({
    queryKey: ["existing-results", examId, subjectId, classId],
    enabled: !!(examId && subjectId && classId && students && ((students as any[]) ?? []).length > 0),
    queryFn: async () => {
      const ids = ((students as any[]) ?? []).map(s => s.id);
      if (!ids.length) return [];
      const { data } = await supabase.from("exam_results")
        .select("id,student_id,score,verified")
        .eq("exam_id", examId).eq("subject_id", subjectId).in("student_id", ids);
      return data || [];
    },
  });

  useEffect(() => {
    if (!students) return;
    const map: Record<string, { id?: string; score: string; verified: boolean }> = {};
    ((students as any[]) ?? []).forEach(s => {
      const ex = (existing as any[] | undefined)?.find(e => e.student_id === s.id);
      map[s.id] = { id: ex?.id, score: ex ? String(ex.score) : "", verified: !!ex?.verified };
    });
    setScores(map);
  }, [students, existing]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const rows = Object.entries(scores)
        .filter(([, v]) => v.score !== "" && !isNaN(Number(v.score)))
        .map(([student_id, v]) => ({
          exam_id: examId, subject_id: subjectId, student_id,
          score: Number(v.score), grade: gradeFor(Number(v.score)),
          verified: false, verified_by: null, verified_at: null,
        }));
      if (!rows.length) throw new Error("Nothing to save");
      const { error } = await supabase.from("exam_results")
        .upsert(rows, { onConflict: "exam_id,student_id,subject_id" });
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      toast.success(`Saved ${n} mark${n === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["existing-results"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const verifyMut = useMutation({
    mutationFn: async () => {
      const ids = ((existing as any[]) ?? []).filter(e => !e.verified).map(e => e.id);
      if (!ids.length) throw new Error("Nothing to verify");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("exam_results").update({
        verified: true, verified_by: u.user?.id, verified_at: new Date().toISOString(),
      }).in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`Verified ${n} mark${n === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["existing-results"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const stats = useMemo(() => {
    const nums = Object.values(scores).map(v => Number(v.score)).filter(n => !isNaN(n) && n >= 0);
    if (!nums.length) return null;
    return { n: nums.length, avg: (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1), max: Math.max(...nums), min: Math.min(...nums) };
  }, [scores]);

  const ready = examId && classId && subjectId;
  const unverifiedCount = ((existing as any[]) ?? []).filter(e => !e.verified).length;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Bulk Mark Entry</h1>
        <p className="text-sm text-muted-foreground mt-1">Subject teachers enter scores. Exams department verifies.{isTeacherScoped ? " Only your assigned classes and subjects are shown." : ""}</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Select exam, class & subject</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <div>
            <Label>Exam</Label>
            <Select value={examId} onValueChange={setExamId}>
              <SelectTrigger><SelectValue placeholder="Choose exam" /></SelectTrigger>
              <SelectContent>
                {(exams as any[]).map(e => <SelectItem key={e.id} value={e.id}>{e.name} ({e.term} {e.year})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder={isTeacherScoped && (classes as any[]).length === 0 ? "No classes assigned" : "Choose class"} /></SelectTrigger>
              <SelectContent>
                {(classes as any[]).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Subject</Label>
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger><SelectValue placeholder={isTeacherScoped && (subjects as any[]).length === 0 ? "No subjects assigned" : "Choose subject"} /></SelectTrigger>
              <SelectContent>
                {(subjects as any[]).map(s => <SelectItem key={s.id} value={s.id}>{s.code} – {s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {ready && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">{((students as any[]) ?? []).length} student(s)</CardTitle>
              {stats && (
                <>
                  <Badge variant="secondary">avg {stats.avg}</Badge>
                  <Badge variant="secondary">hi {stats.max}</Badge>
                  <Badge variant="secondary">lo {stats.min}</Badge>
                </>
              )}
              {unverifiedCount > 0 && <Badge variant="outline">{unverifiedCount} unverified</Badge>}
            </div>
            <div className="flex gap-2">
              {canEnter && (
                <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                  {saveMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Save marks
                </Button>
              )}
              {canVerify && (
                <Button variant="secondary" onClick={() => verifyMut.mutate()} disabled={verifyMut.isPending || unverifiedCount === 0}>
                  {verifyMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />} Verify all
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loadingStudents || loadingExisting ? (
              <div className="h-32 grid place-items-center"><Loader2 className="animate-spin" /></div>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Adm No</TableHead><TableHead>Student</TableHead>
                  <TableHead className="w-32">Score (0–100)</TableHead>
                  <TableHead className="w-20">Grade</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {((students as any[]) ?? []).map(s => {
                    const row = scores[s.id] || { score: "", verified: false };
                    const n = Number(row.score);
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">{s.admission_no}</TableCell>
                        <TableCell>{s.first_name} {s.last_name}</TableCell>
                        <TableCell>
                          <Input type="number" min={0} max={100} step="0.5" value={row.score}
                            disabled={!canEnter || row.verified}
                            onChange={e => setScores(prev => ({ ...prev, [s.id]: { ...prev[s.id], score: e.target.value } }))} />
                        </TableCell>
                        <TableCell className="font-bold">{row.score !== "" && !isNaN(n) ? gradeFor(n) : "—"}</TableCell>
                        <TableCell>
                          {row.verified ? <Badge className="bg-green-600">Verified</Badge>
                            : row.id ? <Badge variant="outline">Pending</Badge>
                            : <Badge variant="secondary">New</Badge>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {((students as any[]) ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No active students in this class.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
