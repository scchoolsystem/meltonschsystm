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
    queryFn: async () => (await supabase.from("students").select("first_name,last_name,admission_no,unique_id,date_of_birth,gender,classes(name)").eq("id", studentId).single()).data,
  });

  const { data: results = [], isLoading: resultsLoading } = useQuery({
    queryKey: ["rc-results", studentId, examId],
    queryFn: async () => (await supabase
      .from("exam_results")
      .select("score, grade, remarks, verified, subject_id, subjects(code, name, scale_id)")
      .eq("student_id", studentId)
      .eq("exam_id", examId)
    ).data || [],
  });

  // Load school's report card settings
  const { data: rcSettings } = useQuery({
    queryKey: ["rc-settings"],
    queryFn: async () => {
      const { data: sid } = await supabase.rpc("current_user_school");
      const { data } = await supabase
        .from("report_card_settings")
        .select("*")
        .eq("school_id", sid as string)
        .maybeSingle();
      return data;
    },
  });

  // Load summary from DB function (overall grade + position)
  const { data: summary } = useQuery({
    queryKey: ["rc-summary", studentId, examId],
    enabled: results.length > 0,
    queryFn: async () => {
      const { data: sid } = await supabase.rpc("current_user_school");
      const { data } = await supabase.rpc("get_student_report_summary", {
        p_student_id: studentId,
        p_exam_id: examId,
        p_school_id: sid as string,
      });
      return (data as any)?.[0] ?? null;
    },
  });

  // Subject positions (rank per subject across class)
  const { data: subjectPositions = {} } = useQuery({
    queryKey: ["rc-subject-positions", examId, studentId],
    enabled: !!rcSettings?.show_subject_position && results.length > 0,
    queryFn: async () => {
      // Get all results for this exam, group by subject
      const { data: allResults } = await supabase
        .from("exam_results")
        .select("student_id, subject_id, score")
        .eq("exam_id", examId);
      if (!allResults) return {};

      // For each subject, rank this student
      const bySubject: Record<string, number[]> = {};
      for (const r of allResults) {
        if (!bySubject[r.subject_id]) bySubject[r.subject_id] = [];
        bySubject[r.subject_id].push(r.score);
      }

      const myScores: Record<string, number> = {};
      for (const r of results as any[]) myScores[r.subject_id] = r.score;

      const positions: Record<string, number> = {};
      for (const [subId, scores] of Object.entries(bySubject)) {
        const myScore = myScores[subId];
        if (myScore === undefined) continue;
        const rank = scores.filter(s => s > myScore).length + 1;
        positions[subId] = rank;
      }
      return positions;
    },
  });

  const isLoading = resultsLoading;
  if (isLoading) return <div className="h-screen grid place-items-center"><Loader2 className="animate-spin" /></div>;

  // Calculate totals using school's chosen method
  const totalMethod = rcSettings?.total_method ?? "sum";
  const maxPerSubject = Number(rcSettings?.max_score_per_subject ?? 100);
  const totalScore = (results as any[]).reduce((a, r) => a + Number(r.score), 0);
  const meanScore = results.length ? totalScore / results.length : 0;
  const displayTotal = totalMethod === "sum" ? totalScore : meanScore;
  const displayMax = totalMethod === "sum" ? maxPerSubject * results.length : maxPerSubject;

  const overallGrade = summary?.overall_grade ?? "—";
  const overallRemarks = summary?.overall_remarks
    ?? rcSettings?.grade_remarks?.[overallGrade]
    ?? "—";
  const position = summary?.class_position;

  const principalName = rcSettings?.principal_name ?? "";
  const principalTitle = rcSettings?.principal_title ?? "Principal";
  const footerNote = rcSettings?.footer_note ?? "";

  return (
    <div className="min-h-screen bg-muted/30 py-8 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto px-4 print:px-0">
        <div className="flex justify-end gap-2 mb-4 print:hidden">
          <Button onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" />Print / Save PDF</Button>
        </div>

        <div className="bg-card text-card-foreground border rounded-lg p-8 print:border-0 print:p-4 space-y-6">

          {/* Header */}
          <div className="text-center pb-4 border-b space-y-1">
            {school?.logo_url && (
              <img src={school.logo_url} alt="School logo" className="w-16 h-16 object-contain mx-auto mb-2" />
            )}
            <h1 className="text-2xl font-bold uppercase">{school?.name || "School"}</h1>
            {(school as any)?.motto && <p className="text-sm italic text-muted-foreground">{(school as any).motto}</p>}
            <p className="text-sm font-semibold mt-2">STUDENT REPORT CARD</p>
            <p className="text-sm text-muted-foreground">{exam?.name} — {exam?.term} {exam?.year}</p>
          </div>

          {/* Student info */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
            <div><span className="text-muted-foreground">Name: </span><span className="font-semibold">{student?.first_name} {student?.last_name}</span></div>
            <div><span className="text-muted-foreground">Class: </span><span className="font-semibold">{(student as any)?.classes?.name ?? "—"}</span></div>
            <div><span className="text-muted-foreground">Adm No: </span><span className="font-mono">{student?.admission_no}</span></div>
            <div><span className="text-muted-foreground">Student ID: </span><span className="font-mono">{(student as any)?.unique_id ?? "—"}</span></div>
            {(student as any)?.date_of_birth && (
              <div><span className="text-muted-foreground">D.O.B: </span><span>{(student as any).date_of_birth}</span></div>
            )}
            {(student as any)?.gender && (
              <div><span className="text-muted-foreground">Gender: </span><span className="capitalize">{(student as any).gender}</span></div>
            )}
          </div>

          {/* Results table */}
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-y bg-muted/40">
                <th className="text-left p-2">Code</th>
                <th className="text-left p-2">Subject</th>
                <th className="text-right p-2">Score</th>
                <th className="text-center p-2">/ Max</th>
                <th className="text-center p-2">Grade</th>
                {rcSettings?.show_subject_position && <th className="text-center p-2">Pos</th>}
                <th className="text-left p-2">Remarks</th>
                <th className="text-center p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(results as any[]).length === 0 && (
                <tr><td colSpan={8} className="text-center p-4 text-muted-foreground">No results recorded.</td></tr>
              )}
              {(results as any[]).map((r, i) => (
                <tr key={i} className="border-b">
                  <td className="p-2 font-mono text-xs">{r.subjects?.code}</td>
                  <td className="p-2">{r.subjects?.name}</td>
                  <td className="p-2 text-right font-medium">{r.score}</td>
                  <td className="p-2 text-center text-muted-foreground text-xs">{maxPerSubject}</td>
                  <td className="p-2 text-center font-bold text-base">{r.grade}</td>
                  {rcSettings?.show_subject_position && (
                    <td className="p-2 text-center text-xs">{subjectPositions[r.subject_id] ?? "—"}</td>
                  )}
                  <td className="p-2 text-xs text-muted-foreground">{r.remarks || "—"}</td>
                  <td className="p-2 text-center">
                    {r.verified
                      ? <Badge className="bg-green-600 text-[10px]">✓</Badge>
                      : <Badge variant="outline" className="text-[10px]">Pending</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="border rounded p-3 text-center">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                {totalMethod === "sum" ? "Total" : "Mean"}
              </div>
              <div className="text-xl font-bold mt-1">
                {displayTotal.toFixed(1)}
                <span className="text-sm font-normal text-muted-foreground"> / {displayMax}</span>
              </div>
            </div>
            <div className="border rounded p-3 text-center">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Mean Score</div>
              <div className="text-xl font-bold mt-1">{meanScore.toFixed(1)}%</div>
            </div>
            <div className="border rounded p-3 text-center">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Overall Grade</div>
              <div className="text-2xl font-bold mt-1">{overallGrade}</div>
            </div>
            {rcSettings?.show_position && position != null && (
              <div className="border rounded p-3 text-center">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Class Position</div>
                <div className="text-xl font-bold mt-1">{position}<span className="text-sm font-normal text-muted-foreground"> / {results.length > 0 ? "—" : "—"}</span></div>
              </div>
            )}
          </div>

          {/* Teacher's remark */}
          <div className="border rounded p-4 text-sm space-y-1">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Class Teacher's Remarks</div>
            <div className="italic mt-1">{overallRemarks}</div>
          </div>

          {/* Signatures */}
          <div className="mt-8 grid grid-cols-2 gap-12 text-xs">
            <div className="space-y-1">
              <div className="border-t pt-2">Class Teacher's Signature</div>
              <div className="text-muted-foreground">Name: ___________________________</div>
            </div>
            <div className="space-y-1">
              <div className="border-t pt-2">{principalTitle}'s Signature</div>
              {principalName && <div className="font-medium">{principalName}</div>}
            </div>
          </div>

          {/* Footer */}
          {footerNote && (
            <div className="text-xs text-muted-foreground text-center border-t pt-3 mt-4">
              {footerNote}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
