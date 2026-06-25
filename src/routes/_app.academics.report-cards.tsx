import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FileText, Printer } from "lucide-react";

export const Route = createFileRoute("/_app/academics/report-cards")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: ReportCardsGuard,
});

function ReportCardsGuard() {
  const { roles, rolesLoaded } = useAuth();
  if (!rolesLoaded) return null;
  const pureStudent = roles.length === 1 && roles[0] === "student";
  if (pureStudent) {
    return (
      <div className="flex items-center justify-center h-64 p-6">
        <div className="max-w-md text-center space-y-3">
          <p className="text-sm text-muted-foreground">Your report cards are in <strong>My Portal</strong> — Reports tab.</p>
          <a href="/portal/student" className="text-primary underline text-sm">Go to My Portal</a>
        </div>
      </div>
    );
  }
  return <Page />;
}

function Page() {
  const [examId, setExamId] = useState("");
  const [classId, setClassId] = useState("");

  const { data: exams = [] } = useQuery({ queryKey: ["exams-rc"], queryFn: async () => (await supabase.from("exams").select("id,name,term,year").order("created_at", { ascending: false })).data ?? [] });
  const { data: classes = [] } = useQuery({ queryKey: ["classes-rc"], queryFn: async () => (await supabase.from("classes").select("id,name").order("name")).data ?? [] });

  const { data: students = [] } = useQuery({
    queryKey: ["students-rc", classId],
    enabled: !!classId,
    queryFn: async () => (await supabase.from("students").select("id,admission_no,first_name,last_name").eq("class_id", classId).eq("status", "active").order("last_name")).data ?? [],
  });

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["results-rc", examId, classId],
    enabled: !!(examId && classId && students.length),
    queryFn: async () => {
      const ids = (students as any[]).map(s => s.id);
      const { data } = await supabase.from("exam_results")
        .select("student_id,score,grade,verified,subjects(code)")
        .eq("exam_id", examId).in("student_id", ids);
      return data || [];
    },
  });

  const ranked = useMemo(() => {
    const byStudent: Record<string, { total: number; n: number; verified: number }> = {};
    (results as any[]).forEach(r => {
      const cur = byStudent[r.student_id] ||= { total: 0, n: 0, verified: 0 };
      cur.total += Number(r.score); cur.n += 1; if (r.verified) cur.verified += 1;
    });
    const rows = (students as any[]).map(s => {
      const r = byStudent[s.id];
      return { ...s, total: r?.total ?? 0, n: r?.n ?? 0, verified: r?.verified ?? 0, mean: r ? r.total / r.n : 0 };
    });
    rows.sort((a, b) => b.mean - a.mean);
    return rows.map((r, i) => ({ ...r, position: r.n ? i + 1 : null }));
  }, [students, results]);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Report Cards</h1>
        <p className="text-sm text-muted-foreground mt-1">Class summary &amp; printable per-student mark sheets.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Choose exam &amp; class</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Exam</Label>
            <Select value={examId} onValueChange={setExamId}>
              <SelectTrigger><SelectValue placeholder="Choose exam" /></SelectTrigger>
              <SelectContent>{(exams as any[]).map(e => <SelectItem key={e.id} value={e.id}>{e.name} ({e.term} {e.year})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder="Choose class" /></SelectTrigger>
              <SelectContent>{(classes as any[]).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {examId && classId && (
        <Card>
          <CardHeader><CardTitle className="text-base">Class ranking</CardTitle></CardHeader>
          <CardContent>
            {isFetching ? <div className="h-32 grid place-items-center"><Loader2 className="animate-spin" /></div> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Subjects</TableHead>
                  <TableHead>Verified</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Mean</TableHead>
                  <TableHead className="text-right">Report</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {ranked.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-bold">{r.position ?? "—"}</TableCell>
                      <TableCell>{r.first_name} {r.last_name} <span className="text-xs text-muted-foreground font-mono">{r.admission_no}</span></TableCell>
                      <TableCell>{r.n}</TableCell>
                      <TableCell className="text-xs">{r.verified}/{r.n}</TableCell>
                      <TableCell>{r.total.toFixed(1)}</TableCell>
                      <TableCell className="font-semibold">{r.mean.toFixed(1)}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link to="/academics/report-card/$studentId/$examId" params={{ studentId: r.id, examId }}>
                            <FileText className="w-4 h-4 mr-1" /> Open
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {ranked.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No students.</TableCell></TableRow>}
                </TableBody>
              </Table>
            )}
            <div className="text-xs text-muted-foreground mt-3 flex items-center gap-2"><Printer className="w-3 h-3" /> Open a report card and use the print button to produce a PDF.</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
