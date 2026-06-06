import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Printer } from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";

export const Route = createFileRoute("/_app/academics/report-card/$studentId/$examId")({ component: Page });

function Page() {
  const { studentId, examId } = Route.useParams();
  const { school } = useTenant();
  const { data: exam } = useQuery({
    queryKey: ["exam-rc", examId],
    queryFn: async () => (await supabase.from("exams").select("name,term,year,start_date,end_date").eq("id", examId).single()).data,
  });
  const { data: student } = useQuery({
    queryKey: ["student-rc", studentId],
    queryFn: async () => (await supabase.from("students").select("first_name,last_name,admission_no,unique_id,classes(name)").eq("id", studentId).single()).data,
  });
  const { data: results = [], isLoading } = useQuery({
    queryKey: ["rc-results", studentId, examId],
    queryFn: async () => (await supabase.from("exam_results")
      .select("score,grade,remarks,verified,subjects(code,name)")
      .eq("student_id", studentId).eq("exam_id", examId)).data || [],
  });

  if (isLoading) return <div className="h-screen grid place-items-center"><Loader2 className="animate-spin" /></div>;

  const total = (results as any[]).reduce((a, r) => a + Number(r.score), 0);
  const mean = results.length ? total / results.length : 0;
  const grade = mean >= 80 ? "A" : mean >= 70 ? "B" : mean >= 60 ? "C" : mean >= 50 ? "D" : "E";
  const remark = mean >= 70 ? "Excellent — keep it up!" : mean >= 50 ? "Good effort. Aim higher." : "Needs improvement.";

  return (
    <div className="min-h-screen bg-muted/30 py-8 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto px-4 print:px-0">
        <div className="flex justify-end gap-2 mb-4 print:hidden">
          <Button onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" />Print / Save PDF</Button>
        </div>
        <div className="certificate-print bg-card text-card-foreground border rounded-lg p-8 print:border-0 print:p-6">
          <div className="text-center mb-6 pb-4 border-b">
            <h1 className="text-2xl font-bold">{school?.name || "School"}</h1>
            <div className="text-sm text-muted-foreground">STUDENT REPORT CARD</div>
            <div className="text-sm mt-1">{exam?.name} — {exam?.term} {exam?.year}</div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm mb-6">
            <div><span className="text-muted-foreground">Name:</span> <span className="font-semibold">{student?.first_name} {student?.last_name}</span></div>
            <div><span className="text-muted-foreground">Class:</span> <span className="font-semibold">{(student as any)?.classes?.name || "—"}</span></div>
            <div><span className="text-muted-foreground">Adm No:</span> <span className="font-mono">{student?.admission_no}</span></div>
            <div><span className="text-muted-foreground">ID:</span> <span className="font-mono">{(student as any)?.unique_id || "—"}</span></div>
          </div>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-y bg-muted/40">
                <th className="text-left p-2">Code</th>
                <th className="text-left p-2">Subject</th>
                <th className="text-right p-2">Score</th>
                <th className="text-center p-2">Grade</th>
                <th className="text-left p-2">Remarks</th>
                <th className="text-center p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(results as any[]).map((r, i) => (
                <tr key={i} className="border-b">
                  <td className="p-2 font-mono text-xs">{r.subjects?.code}</td>
                  <td className="p-2">{r.subjects?.name}</td>
                  <td className="p-2 text-right">{r.score}</td>
                  <td className="p-2 text-center font-bold">{r.grade}</td>
                  <td className="p-2 text-xs text-muted-foreground">{r.remarks || "—"}</td>
                  <td className="p-2 text-center">{r.verified ? <Badge className="bg-green-600 text-[10px]">VERIFIED</Badge> : <Badge variant="outline" className="text-[10px]">PENDING</Badge>}</td>
                </tr>
              ))}
              {results.length === 0 && <tr><td colSpan={6} className="text-center p-4 text-muted-foreground">No results recorded.</td></tr>}
            </tbody>
          </table>

          <div className="grid grid-cols-3 gap-3 mt-6 text-sm">
            <div className="border rounded p-3 text-center"><div className="text-xs text-muted-foreground">Total</div><div className="text-xl font-bold">{total.toFixed(1)}</div></div>
            <div className="border rounded p-3 text-center"><div className="text-xs text-muted-foreground">Mean</div><div className="text-xl font-bold">{mean.toFixed(1)}</div></div>
            <div className="border rounded p-3 text-center"><div className="text-xs text-muted-foreground">Grade</div><div className="text-xl font-bold">{grade}</div></div>
          </div>

          <div className="mt-6 text-sm">
            <div className="text-muted-foreground">Class teacher's remarks</div>
            <div className="mt-1 italic">{remark}</div>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-8 text-xs">
            <div className="border-t pt-1">Class Teacher's signature</div>
            <div className="border-t pt-1">Principal's signature</div>
          </div>
        </div>
      </div>
    </div>
  );
}
