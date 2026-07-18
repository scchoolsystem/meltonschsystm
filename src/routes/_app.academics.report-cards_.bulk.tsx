import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase, getSessionSafe } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/use-tenant";
import { useAuth } from "@/hooks/use-auth";
import { useTeacherScope } from "@/hooks/use-teacher-scope";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Printer, ArrowLeft, ShieldCheck } from "lucide-react";
import { ReportCardBody, REPORT_CARD_PRINT_CSS } from "@/components/ReportCardBody";

// ── Route ────────────────────────────────────────────────────────────────────
// /academics/report-cards/bulk?classId=...&examId=...
export const Route = createFileRoute("/_app/academics/report-cards/bulk")({
  beforeLoad: async () => {
    const { data, timedOut } = await getSessionSafe();
    if (timedOut) return;
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: () => (
    <FeatureGate feature="academics">
      <BulkReportCardsPage />
    </FeatureGate>
  ),
});

function BulkReportCardsPage() {
  const { classId, examId } = Route.useSearch() as { classId?: string; examId?: string };
  const navigate = useNavigate();
  const { school } = useTenant();
  const { isAdmin, hasRole } = useAuth();
  const { isTeacherScoped, classIds } = useTeacherScope();

  const canBulkPrint = isAdmin || hasRole("teacher") || hasRole("class_teacher") ||
    hasRole("subject_teacher") || hasRole("hod") || hasRole("academic_master") ||
    hasRole("exams_admin") || hasRole("principal") || hasRole("deputy_principal");

  // A teacher-scoped user may only bulk-print classes they actually teach.
  const classAllowed = !isTeacherScoped || (!!classId && classIds.includes(classId));

  // ── Base data ───────────────────────────────────────────────────────────
  const { data: exam } = useQuery({
    queryKey: ["brc-exam", examId],
    enabled: !!examId,
    queryFn: async () => (await supabase
      .from("exams").select("id,name,term,year,start_date,end_date")
      .eq("id", examId!).single()).data,
  });

  const { data: classInfo } = useQuery({
    queryKey: ["brc-class", classId],
    enabled: !!classId,
    queryFn: async () => (await supabase
      .from("classes").select("id,name,stream").eq("id", classId!).single()).data,
  });

  const { data: rcSettings } = useQuery({
    queryKey: ["rc-settings"],
    queryFn: async () => {
      const { data: sid } = await supabase.rpc("current_user_school");
      const { data } = await supabase
        .from("report_card_settings").select("*").eq("school_id", sid as string).maybeSingle();
      return data;
    },
  });

  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ["brc-students", classId],
    enabled: !!classId && classAllowed,
    queryFn: async () => (await supabase
      .from("students")
      .select("id,first_name,last_name,admission_no,unique_id,date_of_birth,gender,photo_url,classes(name,stream,level)")
      .eq("class_id", classId!)
      .eq("status", "active")
      .order("first_name")).data ?? [],
  });

  const studentIds = useMemo(() => students.map((s: any) => s.id), [students]);

  // ── Batched per-class data (ONE round-trip per data type, not per student —
  // this is the same anti-N×M-loop pattern already fixed on /portal/me's
  // pendingMarks) ────────────────────────────────────────────────────────
  const { data: bulkData, isLoading: bulkLoading } = useQuery({
    queryKey: ["brc-bulk-data", examId, studentIds.join(",")],
    enabled: !!examId && studentIds.length > 0,
    queryFn: async () => {
      const { data: sid } = await supabase.rpc("current_user_school");

      const [resultsRes, allExamResultsRes, prevExamRes, attendanceRes] = await Promise.all([
        supabase.from("exam_results")
          .select("student_id,score,grade,remarks,verified,subject_id,promotion_decision,subjects(code,name,scale_id)")
          .eq("exam_id", examId!).in("student_id", studentIds),
        // Whole-exam results (all students taking it) — needed to rank subject positions,
        // matches the single-card page's behaviour of ranking across everyone in the exam.
        supabase.from("exam_results").select("student_id,subject_id,score").eq("exam_id", examId!),
        exam?.start_date
          ? supabase.from("exams").select("id").lt("start_date", exam.start_date)
              .order("start_date", { ascending: false }).limit(1).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("attendance_records").select("student_id,status,date")
          .in("student_id", studentIds).order("date", { ascending: false }),
      ]);

      const resultsByStudent = new Map<string, any[]>();
      (resultsRes.data ?? []).forEach((r: any) => {
        if (!resultsByStudent.has(r.student_id)) resultsByStudent.set(r.student_id, []);
        resultsByStudent.get(r.student_id)!.push(r);
      });

      // Subject position ranking, computed once across the whole exam.
      const bySubject = new Map<string, number[]>();
      (allExamResultsRes.data ?? []).forEach((r: any) => {
        if (!bySubject.has(r.subject_id)) bySubject.set(r.subject_id, []);
        bySubject.get(r.subject_id)!.push(Number(r.score));
      });
      const positionsByStudent = new Map<string, Record<string, number>>();
      for (const sIdKey of studentIds) {
        const myResults = resultsByStudent.get(sIdKey) ?? [];
        const positions: Record<string, number> = {};
        for (const r of myResults) {
          const scores = bySubject.get(r.subject_id) ?? [];
          positions[r.subject_id] = scores.filter((s) => s > Number(r.score)).length + 1;
        }
        positionsByStudent.set(sIdKey, positions);
      }

      // Previous exam scores (for growth arrows), batched in one query.
      const prevExamId = (prevExamRes as any)?.data?.id ?? null;
      let prevScoresByStudent = new Map<string, Record<string, number>>();
      if (prevExamId) {
        const { data: prevResults } = await supabase.from("exam_results")
          .select("student_id,subject_id,score").eq("exam_id", prevExamId).in("student_id", studentIds);
        (prevResults ?? []).forEach((r: any) => {
          if (!prevScoresByStudent.has(r.student_id)) prevScoresByStudent.set(r.student_id, {});
          prevScoresByStudent.get(r.student_id)![r.subject_id] = r.score;
        });
      }

      // Attendance — fetched for everyone at once, then trimmed to each
      // student's most recent 90 records in JS (Postgrest can't do a
      // per-group LIMIT in a single query).
      const attendanceByStudent = new Map<string, any[]>();
      (attendanceRes.data ?? []).forEach((a: any) => {
        if (!attendanceByStudent.has(a.student_id)) attendanceByStudent.set(a.student_id, []);
        const arr = attendanceByStudent.get(a.student_id)!;
        if (arr.length < 90) arr.push(a);
      });

      // Remarks + summary RPCs have no bulk variant — call them in
      // parallel (Promise.all), never as a sequential per-student loop.
      const [remarksSettled, summarySettled] = await Promise.all([
        Promise.all(studentIds.map((id) =>
          supabase.rpc("get_exam_remarks", { p_exam_id: examId, p_student_id: id })
            .then((r) => ({ id, data: r.data ?? [] }))
            .catch(() => ({ id, data: [] }))
        )),
        Promise.all(studentIds.map((id) =>
          supabase.rpc("get_student_report_summary", { p_student_id: id, p_exam_id: examId, p_school_id: sid })
            .then((r) => ({ id, data: (r.data as any)?.[0] ?? null }))
            .catch(() => ({ id, data: null }))
        )),
      ]);
      const remarksByStudent = new Map(remarksSettled.map((r) => [r.id, r.data]));
      const summaryByStudent = new Map(summarySettled.map((r) => [r.id, r.data]));

      return {
        resultsByStudent, positionsByStudent, prevScoresByStudent,
        attendanceByStudent, remarksByStudent, summaryByStudent,
      };
    },
  });

  const isLoading = studentsLoading || bulkLoading;

  if (!canBulkPrint) {
    return (
      <div className="flex items-center justify-center h-64 p-6">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-3">
            <ShieldCheck className="w-12 h-12 mx-auto text-muted-foreground opacity-50" />
            <h2 className="font-semibold text-lg">Bulk Print</h2>
            <p className="text-sm text-muted-foreground">You don't have access to bulk-print report cards.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!classId || !examId) {
    return (
      <div className="flex items-center justify-center h-64 p-6">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-3">
            <Printer className="w-12 h-12 mx-auto text-muted-foreground opacity-40" />
            <h2 className="font-semibold text-lg">Bulk Print</h2>
            <p className="text-sm text-muted-foreground">
              Pick a class and exam from the Report Cards page first.
            </p>
            <Button variant="outline" onClick={() => navigate({ to: "/academics/report-cards" })}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Report Cards
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!classAllowed) {
    return (
      <div className="flex items-center justify-center h-64 p-6">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-3">
            <ShieldCheck className="w-12 h-12 mx-auto text-destructive opacity-60" />
            <h2 className="font-semibold text-lg">Access Denied</h2>
            <p className="text-sm text-muted-foreground">You aren't assigned to this class.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 print:bg-white print:py-0">
      <style>{REPORT_CARD_PRINT_CSS}</style>

      {/* Toolbar — hidden on print */}
      <div className="max-w-[820px] mx-auto px-4 print:hidden mb-4 space-y-3">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/academics/report-cards" })} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <Card>
          <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">
                {classInfo?.name}{classInfo?.stream ? ` — ${classInfo.stream}` : ""} · {exam?.name} ({exam?.term} {exam?.year})
              </p>
              <p className="text-sm text-muted-foreground">
                {isLoading ? "Loading…" : `${students.length} report card${students.length === 1 ? "" : "s"} ready to print`}
              </p>
            </div>
            <Button onClick={() => window.print()} disabled={isLoading || students.length === 0}>
              <Printer className="w-4 h-4 mr-2" /> Print All ({students.length})
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Cards */}
      <div className="max-w-[820px] mx-auto px-4 print:px-0 space-y-6 print:space-y-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : students.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">No active students in this class.</CardContent></Card>
        ) : (
          students.map((student: any, i: number) => {
            const results = bulkData?.resultsByStudent.get(student.id) ?? [];
            const summary = bulkData?.summaryByStudent.get(student.id) ?? null;
            const subjectPositions = bulkData?.positionsByStudent.get(student.id) ?? {};
            const prevScoreMap = bulkData?.prevScoresByStudent.get(student.id) ?? {};
            const attendanceRecords = bulkData?.attendanceByStudent.get(student.id) ?? [];
            const examRemarks: any[] = bulkData?.remarksByStudent.get(student.id) ?? [];

            const subjectRemarkMap: Record<string, string> = {};
            examRemarks.forEach((r) => {
              if (r.remark_type === "subject_teacher" && r.subject_id) subjectRemarkMap[r.subject_id] = r.remark_text;
            });
            const classTeacherRemark = examRemarks.find((r) => r.remark_type === "class_teacher")?.remark_text ?? null;
            const principalRemark = examRemarks.find((r) => r.remark_type === "principal")?.remark_text ?? null;

            const uniqueId = student.unique_id ?? "";
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(uniqueId)}`;

            return (
              <ReportCardBody
                key={student.id}
                school={school}
                exam={exam}
                student={student}
                results={results}
                rcSettings={rcSettings}
                summary={summary}
                subjectPositions={subjectPositions}
                attendanceRecords={attendanceRecords}
                prevScoreMap={prevScoreMap}
                subjectRemarkMap={subjectRemarkMap}
                classTeacherRemark={classTeacherRemark}
                principalRemark={principalRemark}
                qrUrl={qrUrl}
                pageBreakAfter={i < students.length - 1}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
