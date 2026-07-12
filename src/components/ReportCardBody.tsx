import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

// ── Grade helpers (kept in sync with the picker + single-card page) ────────
export function fallbackGrade(s: number) {
  if (s >= 80) return "A";  if (s >= 75) return "A-"; if (s >= 70) return "B+";
  if (s >= 65) return "B";  if (s >= 60) return "B-"; if (s >= 55) return "C+";
  if (s >= 50) return "C";  if (s >= 45) return "C-"; if (s >= 40) return "D+";
  if (s >= 35) return "D";  if (s >= 30) return "D-"; return "E";
}

export function gradeColor(grade: string) {
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

export interface ReportCardBodyProps {
  school: any;
  exam: any;
  student: any;
  results: any[];
  rcSettings: any;
  summary: any;
  subjectPositions: Record<string, number>;
  attendanceRecords: any[];
  prevScoreMap: Record<string, number>;
  subjectRemarkMap: Record<string, string>;
  classTeacherRemark: string | null;
  principalRemark: string | null;
  qrUrl: string;
  /** Adds print page-break-after; set false on the very last card in a batch. */
  pageBreakAfter?: boolean;
}

/**
 * Pure, print-ready A4 report card. Used by both the single report-card
 * route and the bulk-print route — same markup, so a bulk PDF looks
 * identical to printing one card at a time.
 */
export function ReportCardBody({
  school, exam, student, results, rcSettings, summary, subjectPositions,
  attendanceRecords, prevScoreMap, subjectRemarkMap, classTeacherRemark,
  principalRemark, qrUrl, pageBreakAfter = true,
}: ReportCardBodyProps) {
  const totalMethod   = rcSettings?.total_method ?? "sum";
  const maxPerSubject = Number(rcSettings?.max_score_per_subject ?? 100);
  const totalScore    = (results as any[]).reduce((a, r) => a + Number(r.score), 0);
  const meanScore     = results.length ? totalScore / results.length : 0;
  const displayTotal  = totalMethod === "sum" ? totalScore : meanScore;
  const displayMax    = totalMethod === "sum" ? maxPerSubject * results.length : maxPerSubject;

  const overallGrade   = summary?.overall_grade ?? fallbackGrade(meanScore);
  const gradeColour     = gradeColor(overallGrade);
  const overallRemarks  = summary?.overall_remarks ?? rcSettings?.grade_remarks?.[overallGrade] ?? "—";
  const position        = summary?.position;

  const principalTitle = rcSettings?.principal_title ?? "Principal";
  const principalName  = rcSettings?.principal_name ?? "";
  const footerNote      = rcSettings?.footer_note ?? "";

  const presentCount = attendanceRecords.filter((a: any) => a.status === "present").length;
  const attRate = attendanceRecords.length
    ? Math.round((presentCount / attendanceRecords.length) * 100)
    : null;

  const promotionDecision = (() => {
    const decisions = (results as any[]).map((r) => r.promotion_decision).filter(Boolean);
    if (decisions.length === 0) return null;
    const freq: Record<string, number> = {};
    for (const d of decisions) freq[d] = (freq[d] ?? 0) + 1;
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  })();

  return (
    <div
      className="rc-page bg-white text-gray-900 border rounded-xl p-8 print:border-0 print:p-0 print:rounded-none shadow-sm space-y-6"
      style={pageBreakAfter ? { pageBreakAfter: "always", breakAfter: "page" } : undefined}
    >
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

      {/* Results table */}
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
            {([...(results as any[])].sort((a, b) => Number(b.score) - Number(a.score))).map((r, i, arr) => {
              const g      = r.grade ?? fallbackGrade(r.score);
              const gc     = gradeColor(g);
              const prev   = prevScoreMap[r.subject_id];
              const growth = prev !== undefined ? r.score - prev : null;
              const prevG     = i > 0 ? (arr[i-1].grade ?? fallbackGrade(Number(arr[i-1].score))) : null;
              const bandStart = i === 0 || g !== prevG;
              const colSpan   = 5 + (rcSettings?.show_subject_position ? 1 : 0);
              return (
                <React.Fragment key={i}>
                {bandStart && (
                  <tr>
                    <td colSpan={colSpan + 3} className="px-3 pt-3 pb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold uppercase tracking-widest" style={{ color: gc }}>
                          Grade {g}
                        </span>
                        <div className="flex-1 h-px" style={{ backgroundColor: gc + "40" }} />
                      </div>
                    </td>
                  </tr>
                )}
                <tr className={`border-b ${i % 2 === 0 ? "bg-gray-50" : "bg-white"}`}>
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
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Academic summary */}
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

      {footerNote && (
        <p className="text-[10px] text-center text-gray-400 border-t pt-3">{footerNote}</p>
      )}

      <p className="text-[9px] text-center text-gray-300">
        Powered by SmartDev ERP &mdash; smartdev.co.ke
      </p>
    </div>
  );
}

/** Shared print CSS: forces true A4 pages with sane margins for both the
 *  single report card and the bulk batch. Keep in one place so both routes
 *  can never drift out of sync on paper size. */
export const REPORT_CARD_PRINT_CSS = `
  @media print {
    @page { size: A4; margin: 12mm; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    .print-border { border: 1px solid #d1d5db !important; }
  }
  .score-bar { height: 5px; background: #e5e7eb; border-radius: 3px; overflow: hidden; }
  .score-bar-fill { height: 100%; border-radius: 3px; transition: width 0.5s; }
  /* Screen preview: show each card at true A4 proportions (210mm) so what
     you see is what prints. */
  .rc-page { width: 100%; max-width: 210mm; margin-left: auto; margin-right: auto; }
`;
