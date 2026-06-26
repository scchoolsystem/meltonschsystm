import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Printer, ShieldCheck, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";
import { useAuth } from "@/hooks/use-auth";
import { useMemo } from "react";

export const Route = createFileRoute("/_app/academics/report-card/$studentId/$examId")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: ReportCardPage,
});

// ── Grade helper ────────────────────────────────────────────────────────────
function fallbackGrade(s: number) {
  if (s >= 80) return "A";  if (s >= 75) return "A-"; if (s >= 70) return "B+";
  if (s >= 65) return "B";  if (s >= 60) return "B-"; if (s >= 55) return "C+";
  if (s >= 50) return "C";  if (s >= 45) return "C-"; if (s >= 40) return "D+";
  if (s >= 35) return "D";  if (s >= 30) return "D-"; return "E";
}

function gradeColor(grade: string) {
  if (["A", "A-"].includes(grade)) return "#16a34a";
  if (["B+", "B", "B-"].includes(grade)) return "#2563eb";
  if (["C+", "C", "C-"].includes(grade)) return "#d97706";
  return "#dc2626";
}

function scoreBarWidth(score: number, max: number) {
  return `${Math.round((score / max) * 100)}%`;
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

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

  // ── Calculations ─────────────────────────────────────────────────────────
  const totalMethod  = rcSettings?.total_method ?? "sum";
  const maxPerSubject = Number(rcSettings?.max_score_per_subject ?? 100);
  const totalScore   = (results as any[]).reduce((a, r) => a + Number(r.score), 0);
  const meanScore    = results.length ? totalScore / results.length : 0;
  const displayTotal = totalMethod === "sum" ? totalScore : meanScore;
  const displayMax   = totalMethod === "sum" ? maxPerSubject * results.length : maxPerSubject;

  const overallGrade   = summary?.overall_grade ?? fallbackGrade(meanScore);
  const gradeColour    = gradeColor(overallGrade);
  const overallRemarks = summary?.overall_remarks ?? rcSettings?.grade_remarks?.[overallGrade] ?? "—";
  const position       = summary?.position;

  const principalName  = rcSettings?.principal_name ?? "";
  const principalTitle = rcSettings?.principal_title ?? "Principal";
  const footerNote     = rcSettings?.footer_note ?? "";

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

  // QR verification string
  const qrData = `${school?.name ?? ""} | ${student?.first_name ?? ""} ${student?.last_name ?? ""} | Adm: ${student?.admission_no ?? ""} | ${exam?.name ?? ""} | Grade: ${overallGrade}`;
  const qrUrl  = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(qrData)}`;

  if (resultsLoading) return (
    <div className="h-screen grid place-items-center">
      <Loader2 className="animate-spin w-8 h-8 text-muted-foreground" />
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30 py-8 print:bg-white print:py-0">

      {/* Print styles injected inline for portability */}
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-border { border: 1px solid #d1d5db !important; }
        }
        .score-bar { height: 5px; background: #e5e7eb; border-radius: 3px; overflow: hidden; }
        .score-bar-fill { height: 100%; border-radius: 3px; transition: width 0.5s; }
      `}</style>

      <div className="max-w-[820px] mx-auto px-4 print:px-0">

        {/* ── Actions ─────────────────────────────────────────────────── */}
        <div className="flex justify-end gap-2 mb-4 no-print">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" /> Print / Save PDF
          </Button>
        </div>

        {/* ── Report card body ─────────────────────────────────────────── */}
        <div className="bg-white text-gray-900 border rounded-xl p-8 print:border-0 print:p-0 print:rounded-none shadow-sm space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between gap-4 pb-4 border-b-2 border-gray-200">
            <div className="flex items-center gap-4">
              {school?.logo_url && (
                <img src={school.logo_url} alt="School logo" className="w-16 h-16 object-contain shrink-0" />
              )}
              <div>
                <h1 className="text-xl font-extrabold uppercase tracking-tight">{school?.name || "School"}</h1>
                {(school as any)?.address && <p className="text-xs text-gray-500 mt-0.5">{(school as any).address}</p>}
                {(school as any)?.motto && <p className="text-xs italic text-gray-500 mt-0.5">&ldquo;{(school as any).motto}&rdquo;</p>}
                <p className="text-sm font-bold mt-1.5 uppercase tracking-wide text-gray-700">Student Report Card</p>
                <p className="text-xs text-gray-500">{exam?.name} &mdash; {exam?.term} {exam?.year}</p>
              </div>
            </div>
            {/* QR code */}
            <div className="shrink-0 text-center">
              <img src={qrUrl} alt="Verification QR" className="w-16 h-16" />
              <p className="text-[9px] text-gray-400 mt-0.5">Verify</p>
            </div>
          </div>

          {/* Student info + photo */}
          <div className="flex gap-4 items-start">
            {student?.photo_url && (
              <img
                src={student.photo_url}
                alt="Student"
                className="w-24 h-28 object-cover rounded border-2 border-gray-200 shrink-0"
              />
            )}
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
              {[
                ["Full Name",   `${student?.first_name ?? ""} ${student?.last_name ?? ""}`.trim()],
                ["Adm No",      student?.admission_no ?? "—"],
                ["Student ID",  (student as any)?.unique_id ?? "—"],
                ["Class",       (student as any)?.classes?.name ?? "—"],
                ["Stream",      (student as any)?.classes?.stream ?? "—"],
                ["Gender",      (student as any)?.gender ? ((student as any).gender[0].toUpperCase() + (student as any).gender.slice(1)) : "—"],
                ["Date of Birth", (student as any)?.date_of_birth ?? "—"],
                ["Exam Period",  exam ? `${exam.start_date ?? ""}${exam.end_date ? " → " + exam.end_date : ""}` : "—"],
              ].map(([label, value]) => (
                <div key={label}>
                  <span className="text-xs text-gray-500">{label}: </span>
                  <span className="font-semibold">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Results table ──────────────────────────────────────────── */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Academic Results</h2>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 text-xs uppercase tracking-wide text-gray-600">
                  <th className="text-left px-3 py-2">Subject</th>
                  <th className="text-right px-3 py-2">Score</th>
                  {rcSettings?.show_subject_position && <th className="text-center px-3 py-2">Pos</th>}
                  <th className="text-center px-3 py-2">Grade</th>
                  <th className="text-center px-2 py-2 hidden sm:table-cell">Growth</th>
                  <th className="text-left px-3 py-2">Progress</th>
                  <th className="text-left px-3 py-2 hidden sm:table-cell">Remarks</th>
                  <th className="text-center px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {(results as any[]).length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-6 text-gray-400 text-xs">
                      No results recorded for this exam.
                    </td>
                  </tr>
                )}
                {(results as any[]).map((r, i) => {
                  const g      = r.grade ?? fallbackGrade(r.score);
                  const gc     = gradeColor(g);
                  const prev   = prevScoreMap[r.subject_id];
                  const growth = prev !== undefined ? r.score - prev : null;
                  return (
                    <tr key={i} className={`border-b ${i % 2 === 0 ? "bg-gray-50" : "bg-white"}`}>
                      <td className="px-3 py-2 font-medium">
                        {r.subjects?.name}
                        {r.subjects?.code && (
                          <span className="ml-1.5 text-[10px] text-gray-400 font-mono">{r.subjects.code}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {r.score}
                        <span className="text-[10px] text-gray-400"> /{maxPerSubject}</span>
                      </td>
                      {rcSettings?.show_subject_position && (
                        <td className="px-3 py-2 text-center text-xs text-gray-500">
                          {subjectPositions[r.subject_id] != null
                            ? ordinal(subjectPositions[r.subject_id])
                            : "—"}
                        </td>
                      )}
                      <td className="px-3 py-2 text-center">
                        <span className="font-extrabold text-base" style={{ color: gc }}>{g}</span>
                      </td>
                      <td className="px-2 py-2 text-center hidden sm:table-cell">
                        {growth === null ? (
                          <Minus className="w-3 h-3 mx-auto text-gray-300" />
                        ) : growth > 0 ? (
                          <span className="text-emerald-600 text-xs font-semibold flex items-center justify-center gap-0.5">
                            <TrendingUp className="w-3 h-3" />+{growth.toFixed(1)}
                          </span>
                        ) : growth < 0 ? (
                          <span className="text-red-500 text-xs font-semibold flex items-center justify-center gap-0.5">
                            <TrendingDown className="w-3 h-3" />{growth.toFixed(1)}
                          </span>
                        ) : (
                          <Minus className="w-3 h-3 mx-auto text-gray-400" />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="score-bar w-20">
                          <div
                            className="score-bar-fill"
                            style={{ width: scoreBarWidth(r.score, maxPerSubject), backgroundColor: gc }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 hidden sm:table-cell max-w-[140px] truncate">
                        {subjectRemarkMap[r.subject_id] || r.remarks || "—"}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {r.verified
                          ? <span className="text-emerald-600 text-[10px] font-semibold">✓</span>
                          : <span className="text-gray-400 text-[10px]">Pending</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Academic summary ───────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="border rounded-lg p-3 text-center bg-gray-50">
              <div className="text-[10px] uppercase tracking-wider text-gray-500">
                {totalMethod === "sum" ? "Total Score" : "Mean Score"}
              </div>
              <div className="text-2xl font-extrabold mt-1">
                {displayTotal.toFixed(totalMethod === "sum" ? 0 : 1)}
                <span className="text-xs font-normal text-gray-400"> /{displayMax.toFixed(0)}</span>
              </div>
            </div>
            <div className="border rounded-lg p-3 text-center bg-gray-50">
              <div className="text-[10px] uppercase tracking-wider text-gray-500">Mean %</div>
              <div className="text-2xl font-extrabold mt-1">{meanScore.toFixed(1)}%</div>
            </div>
            <div className="border-2 rounded-lg p-3 text-center" style={{ borderColor: gradeColour }}>
              <div className="text-[10px] uppercase tracking-wider text-gray-500">Overall Grade</div>
              <div className="text-3xl font-extrabold mt-1" style={{ color: gradeColour }}>{overallGrade}</div>
            </div>
            {rcSettings?.show_position && position != null ? (
              <div className="border rounded-lg p-3 text-center bg-gray-50">
                <div className="text-[10px] uppercase tracking-wider text-gray-500">Class Position</div>
                <div className="text-2xl font-extrabold mt-1">{ordinal(position)}</div>
              </div>
            ) : attRate !== null ? (
              <div className="border rounded-lg p-3 text-center bg-gray-50">
                <div className="text-[10px] uppercase tracking-wider text-gray-500">Attendance</div>
                <div className="text-2xl font-extrabold mt-1"
                  style={{ color: attRate >= 90 ? "#16a34a" : attRate >= 75 ? "#d97706" : "#dc2626" }}>
                  {attRate}%
                </div>
                <div className="text-[10px] text-gray-400">{presentCount}/{attendanceRecords.length} days</div>
              </div>
            ) : null}
          </div>

          {/* Attendance summary row */}
          {attRate !== null && (
            <div className="border rounded-lg p-4 bg-gray-50 text-sm flex flex-wrap gap-6 items-center">
              <div>
                <span className="text-xs text-gray-500 uppercase tracking-wide">Attendance Summary</span>
                <div className="font-bold text-lg mt-0.5">{attRate}% present</div>
              </div>
              <div>
                <span className="text-xs text-gray-500">Days present:</span>
                <span className="font-semibold ml-1">{presentCount}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500">Days absent:</span>
                <span className="font-semibold ml-1">
                  {attendanceRecords.filter((a: any) => a.status === "absent").length}
                </span>
              </div>
              <div className="flex-1 min-w-[120px]">
                <div className="score-bar">
                  <div
                    className="score-bar-fill"
                    style={{
                      width: `${attRate}%`,
                      backgroundColor: attRate >= 90 ? "#16a34a" : attRate >= 75 ? "#d97706" : "#dc2626",
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Remarks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border rounded-lg p-4 text-sm space-y-1 bg-gray-50">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Class Teacher's Remarks</div>
              <div className="italic text-gray-700 mt-1.5">{classTeacherRemark || overallRemarks}</div>
            </div>
            {(principalRemark || rcSettings?.principal_remarks) && (
              <div className="border rounded-lg p-4 text-sm space-y-1 bg-gray-50">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{principalTitle}'s Remarks</div>
                <div className="italic text-gray-700 mt-1.5">{principalRemark || rcSettings?.principal_remarks}</div>
              </div>
            )}
          </div>

          {promotionDecision && (
            <div className={`border-2 rounded-lg p-4 text-center ${
              promotionDecision === "promoted"
                ? "border-emerald-500 bg-emerald-50"
                : promotionDecision === "retained"
                ? "border-red-500 bg-red-50"
                : "border-amber-500 bg-amber-50"
            }`}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Promotion Decision
              </div>
              <div className={`text-xl font-extrabold mt-1 capitalize ${
                promotionDecision === "promoted"
                  ? "text-emerald-700"
                  : promotionDecision === "retained"
                  ? "text-red-700"
                  : "text-amber-700"
              }`}>
                {promotionDecision}
              </div>
            </div>
          )}

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-12 pt-4 text-xs text-gray-500 border-t">
            <div className="space-y-6">
              <div className="h-8" />
              <div className="border-t pt-2">
                <p className="font-semibold text-gray-700">Class Teacher's Signature</p>
                <p>Name: ________________________________</p>
              </div>
            </div>
            <div className="space-y-6">
              <div className="h-8" />
              <div className="border-t pt-2">
                <p className="font-semibold text-gray-700">{principalTitle}'s Signature</p>
                {principalName && <p className="font-medium text-gray-800">{principalName}</p>}
                <p>Name: ________________________________</p>
              </div>
            </div>
          </div>

          {/* Parent acknowledgement */}
          <div className="border rounded-lg p-4 text-xs text-gray-500 space-y-2 bg-gray-50">
            <p className="font-semibold text-gray-700 uppercase tracking-wide text-[10px]">Parent / Guardian Acknowledgement</p>
            <p>I have seen and acknowledged this report card.</p>
            <div className="grid grid-cols-2 gap-6 mt-2">
              <div>Signature: _______________________</div>
              <div>Date: ____________________________</div>
            </div>
          </div>

          {/* Footer */}
          {footerNote && (
            <p className="text-[10px] text-center text-gray-400 border-t pt-3">{footerNote}</p>
          )}

          <p className="text-[9px] text-center text-gray-300">
            Powered by SmartDev ERP &mdash; smartdev.co.ke
          </p>
        </div>
      </div>
    </div>
  );
}
