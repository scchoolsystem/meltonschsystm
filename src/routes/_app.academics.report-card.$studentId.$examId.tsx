import React from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery } from "@tanstack/react-query";
import { supabase, getSessionSafe } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, ShieldCheck } from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";
import { useAuth } from "@/hooks/use-auth";
import { useMemo } from "react";
import { ReportCardBody, REPORT_CARD_PRINT_CSS } from "@/components/ReportCardBody";

export const Route = createFileRoute("/_app/academics/report-card/$studentId/$examId")({
  beforeLoad: async () => {
    const { data, timedOut } = await getSessionSafe();
    if (timedOut) return; // defer to AppLayout's own client-side session check
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: () => (
    <FeatureGate feature="academics_report_cards">
      <ReportCardPage />
    </FeatureGate>
  ),
});

// ── Security guard ──────────────────────────────────────────────────────────
function SecurityCheck({ studentId, children }: { studentId: string; children: React.ReactNode }) {
  const { user, roles, rolesLoaded } = useAuth();

  const { data: link, isLoading } = useQuery({
    queryKey: ["rc-security", studentId, user?.id],
    enabled: !!user && rolesLoaded,
    queryFn: async () => {
      // Admins / staff can view any report card in their school
      const isStaff = roles.some((r: any) =>
        ["super_admin", "principal", "deputy_principal", "school_admin",
         "class_teacher", "teacher", "hod", "academic_master", "exams_admin"].includes(r)
      );
      if (isStaff) return { allowed: true };

      /// Students: must be linked to this exact student record
      const { data: studentLink } = await supabase
        .from("student_user_links")
        .select("student_id")
        .eq("user_id", user!.id)
        .eq("student_id", studentId)
        .maybeSingle();
      if (studentLink) return { allowed: true };

      // Parents: must be linked via parent_student_links
      const { data: parentLink } = await supabase
        .from("parent_student_links")
        .select("id")
        .eq("parent_user_id", user!.id)
        .eq("student_id", studentId)
        .maybeSingle();
      return { allowed: !!parentLink };
    },
  });

  if (!rolesLoaded || isLoading) return (
    <div className="h-screen grid place-items-center">
      <Loader2 className="animate-spin w-8 h-8 text-muted-foreground" />
    </div>
  );

  if (!link?.allowed) return (
    <div className="h-screen grid place-items-center p-6">
      <div className="max-w-sm text-center space-y-3">
        <ShieldCheck className="w-12 h-12 mx-auto text-destructive opacity-60" />
        <h2 className="font-semibold text-lg">Access Denied</h2>
        <p className="text-sm text-muted-foreground">You do not have permission to view this report card.</p>
      </div>
    </div>
  );

  return <>{children}</>;
}

// ── Main component ──────────────────────────────────────────────────────────
function ReportCardPage() {
  const { studentId, examId } = Route.useParams();
  const { school } = useTenant();

  return (
    <SecurityCheck studentId={studentId}>
      <ReportCardContent studentId={studentId} examId={examId} school={school} />
    </SecurityCheck>
  );
}

function ReportCardContent({
  studentId, examId, school,
}: { studentId: string; examId: string; school: any }) {

  const { data: exam } = useQuery({
    queryKey: ["exam-rc", examId],
    queryFn: async () => (await supabase.from("exams").select("name,term,year,start_date,end_date").eq("id", examId).single()).data,
  });

  const { data: student } = useQuery({
    queryKey: ["student-rc", studentId],
    queryFn: async () => (await supabase
      .from("students")
      .select("first_name,last_name,admission_no,unique_id,date_of_birth,gender,photo_url,classes(name,stream,level)")
      .eq("id", studentId)
      .single()
    ).data,
  });

  const { data: results = [], isLoading: resultsLoading } = useQuery({
    queryKey: ["rc-results", studentId, examId],
    queryFn: async () => (await supabase
      .from("exam_results")
      .select("score,grade,remarks,verified,subject_id,promotion_decision,subjects(code,name,scale_id)")
      .eq("student_id", studentId)
      .eq("exam_id", examId)
    ).data || [],
  });

  // Exam remarks (subject teacher / class teacher / principal) — NEW V3
  const { data: examRemarks = [] } = useQuery({
    queryKey: ["rc-exam-remarks", studentId, examId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_exam_remarks", {
        p_exam_id: examId,
        p_student_id: studentId,
      });
      if (error) console.warn("remarks rpc:", error);
      return (data as any[]) ?? [];
    },
  });

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

  // Subject positions
  const { data: subjectPositions = {} } = useQuery({
    queryKey: ["rc-subject-positions", examId, studentId],
    enabled: !!rcSettings?.show_subject_position && results.length > 0,
    queryFn: async () => {
      const { data: allResults } = await supabase
        .from("exam_results")
        .select("student_id,subject_id,score")
        .eq("exam_id", examId);
      if (!allResults) return {};

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
        positions[subId] = scores.filter((s) => s > myScore).length + 1;
      }
      return positions;
    },
  });

  // Attendance for this student (last 90 days)
  const { data: attendanceRecords = [] } = useQuery({
    queryKey: ["rc-attendance", studentId],
    queryFn: async () => (await supabase
      .from("attendance_records")
      .select("status")
      .eq("student_id", studentId)
      .order("date", { ascending: false })
      .limit(90)
    ).data || [],
  });

  // Previous exam results for growth analysis
  const { data: previousResults = [] } = useQuery({
    queryKey: ["rc-prev-results", studentId, examId],
    enabled: results.length > 0,
    queryFn: async () => {
      // Find the exam before this one (by start_date)
      const currentExamDate = exam?.start_date;
      if (!currentExamDate) return [];
      const { data: prevExam } = await supabase
        .from("exams")
        .select("id")
        .lt("start_date", currentExamDate)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!prevExam) return [];
      const { data } = await supabase
        .from("exam_results")
        .select("score,subject_id")
        .eq("student_id", studentId)
        .eq("exam_id", prevExam.id);
      return data || [];
    },
  });

  // Note: total/mean/grade/position/footer calculations now live inside
  // <ReportCardBody> (shared with the bulk-print route) — kept out of this
  // file so both routes can never drift out of sync.

  // Attendance stats
  const presentCount = attendanceRecords.filter((a: any) => a.status === "present").length;
  const attRate      = attendanceRecords.length
    ? Math.round((presentCount / attendanceRecords.length) * 100)
    : null;

  // Previous scores map for growth
  const prevScoreMap: Record<string, number> = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of previousResults as any[]) m[r.subject_id] = r.score;
    return m;
  }, [previousResults]);

  // Build remark lookup maps — NEW V3
  const subjectRemarkMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of examRemarks as any[]) {
      if (r.remark_type === "subject_teacher" && r.subject_id) {
        m[r.subject_id] = r.remark_text;
      }
    }
    return m;
  }, [examRemarks]);

  const classTeacherRemark = useMemo(() => {
    const r = (examRemarks as any[]).find((r: any) => r.remark_type === "class_teacher");
    return r?.remark_text ?? null;
  }, [examRemarks]);

  const principalRemark = useMemo(() => {
    const r = (examRemarks as any[]).find((r: any) => r.remark_type === "principal");
    return r?.remark_text ?? null;
  }, [examRemarks]);

  const promotionDecision = useMemo(() => {
    const decisions = (results as any[]).map((r) => r.promotion_decision).filter(Boolean);
    if (decisions.length === 0) return null;
    const freq: Record<string, number> = {};
    for (const d of decisions) freq[d] = (freq[d] ?? 0) + 1;
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [results]);

  // QR encodes ONLY the unique_id so the Verify page can look it up by scanning.
  // The verify page does: supabase.from("students").select(...).eq("unique_id", scannedValue)
  const uniqueId = (student as any)?.unique_id ?? "";
  const qrData   = uniqueId; // e.g. "STU-2026-000005"
  const qrUrl    = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(qrData)}`;

  if (resultsLoading) return (
    <div className="h-screen grid place-items-center">
      <Loader2 className="animate-spin w-8 h-8 text-muted-foreground" />
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30 py-8 print:bg-white print:py-0">
      <style>{REPORT_CARD_PRINT_CSS}</style>

      <div className="max-w-[820px] mx-auto px-4 print:px-0">
        {/* ── Actions ─────────────────────────────────────────────────── */}
        <div className="flex justify-end gap-2 mb-4 no-print">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" /> Print / Save PDF
          </Button>
        </div>

        <ReportCardBody
          school={school}
          exam={exam}
          student={student}
          results={results as any[]}
          rcSettings={rcSettings}
          summary={summary}
          subjectPositions={subjectPositions}
          attendanceRecords={attendanceRecords}
          prevScoreMap={prevScoreMap}
          subjectRemarkMap={subjectRemarkMap}
          classTeacherRemark={classTeacherRemark}
          principalRemark={principalRemark}
          qrUrl={qrUrl}
          pageBreakAfter={false}
        />
      </div>
    </div>
  );
}
