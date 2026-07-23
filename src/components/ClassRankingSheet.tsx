import React from "react";

// ── Grade helpers (kept in sync with results.tsx / ReportCardBody.tsx) ─────
export function fallbackGrade(s: number): string {
  if (s >= 80) return "A";  if (s >= 75) return "A-"; if (s >= 70) return "B+";
  if (s >= 65) return "B";  if (s >= 60) return "B-"; if (s >= 55) return "C+";
  if (s >= 50) return "C";  if (s >= 45) return "C-"; if (s >= 40) return "D+";
  if (s >= 35) return "D";  if (s >= 30) return "D-"; return "E";
}

function gradePoints(g: string): number {
  const map: Record<string, number> = {
    "A": 12, "A-": 11, "B+": 10, "B": 9, "B-": 8,
    "C+": 7, "C": 6, "C-": 5, "D+": 4, "D": 3, "D-": 2, "E": 1,
  };
  return map[g] ?? 0;
}

function meanGradeFromPoints(avgPoints: number): string {
  if (avgPoints >= 11.5) return "A";
  if (avgPoints >= 10.5) return "A-";
  if (avgPoints >= 9.5)  return "B+";
  if (avgPoints >= 8.5)  return "B";
  if (avgPoints >= 7.5)  return "B-";
  if (avgPoints >= 6.5)  return "C+";
  if (avgPoints >= 5.5)  return "C";
  if (avgPoints >= 4.5)  return "C-";
  if (avgPoints >= 3.5)  return "D+";
  if (avgPoints >= 2.5)  return "D";
  if (avgPoints >= 1.5)  return "D-";
  return "E";
}

export function gradeColor(grade: string): string {
  if (["A", "A-"].includes(grade)) return "#16a34a";
  if (["B+", "B", "B-"].includes(grade)) return "#2563eb";
  if (["C+", "C", "C-"].includes(grade)) return "#d97706";
  return "#dc2626";
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

// ── Types ────────────────────────────────────────────────────────────────
export interface SubjectColumn { id: string; name: string; code?: string | null }

export interface RankedStudent {
  studentId: string;
  name: string;
  admissionNo: string;
  scores: Record<string, { score: number; grade: string; position: number | null }>;
  subjectCount: number;
  total: number;
  mean: number;
  meanGrade: string;
  position: number; // overall class position (skip-tie / "competition" ranking)
}

export interface ClassRankingResult {
  subjectCols: SubjectColumn[];
  rows: RankedStudent[];
}

type RawStudent = { id: string; first_name?: string | null; last_name?: string | null; admission_no?: string | null };
type RawResult = {
  student_id: string;
  subject_id: string;
  score: number | string;
  grade?: string | null;
  subjects?: { name?: string | null; code?: string | null } | null;
};

/** Standard "skip" / competition ranking: ties share a position, the next
 *  distinct value skips ahead by the number of tied entries (1,1,3,4…). This
 *  matches how Kenyan schools conventionally rank merit lists. */
function assignSkipRanks<T>(items: T[], valueOf: (t: T) => number): Map<T, number> {
  const sorted = [...items].sort((a, b) => valueOf(b) - valueOf(a));
  const ranks = new Map<T, number>();
  let lastValue: number | null = null;
  let lastRank = 0;
  sorted.forEach((item, i) => {
    const v = valueOf(item);
    if (lastValue === null || v < lastValue) {
      lastRank = i + 1;
      lastValue = v;
    }
    ranks.set(item, lastRank);
  });
  return ranks;
}

/** Builds the full class merit list: subject columns, per-student scores,
 *  per-subject positions, and an overall class position — from raw
 *  exam_results rows for a single class + exam. */
export function buildClassRanking(
  students: RawStudent[],
  results: RawResult[],
  rankBasis: "mean" | "total" = "mean"
): ClassRankingResult {
  // Subject columns — union of subjects actually present in the results,
  // ordered by code (falls back to name) so the sheet reads consistently.
  const subjectMap = new Map<string, SubjectColumn>();
  for (const r of results) {
    if (!subjectMap.has(r.subject_id)) {
      subjectMap.set(r.subject_id, {
        id: r.subject_id,
        name: r.subjects?.name ?? "Subject",
        code: r.subjects?.code ?? null,
      });
    }
  }
  const subjectCols = Array.from(subjectMap.values()).sort((a, b) =>
    (a.code ?? a.name).localeCompare(b.code ?? b.name)
  );

  // Per-student, per-subject score lookup.
  const scoresByStudent = new Map<string, Map<string, { score: number; grade: string }>>();
  for (const r of results) {
    if (!scoresByStudent.has(r.student_id)) scoresByStudent.set(r.student_id, new Map());
    const score = Number(r.score);
    scoresByStudent.get(r.student_id)!.set(r.subject_id, {
      score,
      grade: r.grade ?? fallbackGrade(score),
    });
  }

  // Subject positions — rank every student who sat that subject, within the class.
  const subjectPositions = new Map<string, Map<string, number>>(); // subjectId -> studentId -> position
  for (const col of subjectCols) {
    const entries: { studentId: string; score: number }[] = [];
    scoresByStudent.forEach((subjMap, studentId) => {
      const cell = subjMap.get(col.id);
      if (cell) entries.push({ studentId, score: cell.score });
    });
    const ranks = assignSkipRanks(entries, (e) => e.score);
    const posMap = new Map<string, number>();
    ranks.forEach((rank, e) => posMap.set(e.studentId, rank));
    subjectPositions.set(col.id, posMap);
  }

  // Build rows for students who actually have at least one result.
  const nameOf = (s: RawStudent) => `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim();
  const rowsPrelim = students
    .filter((s) => (scoresByStudent.get(s.id)?.size ?? 0) > 0)
    .map((s) => {
      const subjMap = scoresByStudent.get(s.id)!;
      const scores: RankedStudent["scores"] = {};
      let total = 0;
      let pointsTotal = 0;
      subjMap.forEach((cell, subjectId) => {
        scores[subjectId] = {
          score: cell.score,
          grade: cell.grade,
          position: subjectPositions.get(subjectId)?.get(s.id) ?? null,
        };
        total += cell.score;
        pointsTotal += gradePoints(cell.grade);
      });
      const subjectCount = subjMap.size;
      const mean = subjectCount ? total / subjectCount : 0;
      const meanGrade = subjectCount ? meanGradeFromPoints(pointsTotal / subjectCount) : "—";
      return {
        studentId: s.id,
        name: nameOf(s) || "—",
        admissionNo: s.admission_no ?? "—",
        scores, subjectCount, total, mean, meanGrade,
      };
    });

  const ranks = assignSkipRanks(rowsPrelim, (r) => (rankBasis === "mean" ? r.mean : r.total));
  const rows: RankedStudent[] = rowsPrelim
    .map((r) => ({ ...r, position: ranks.get(r) ?? 0 }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

  return { subjectCols, rows };
}

export const CLASS_RANKING_PRINT_CSS = `
  @media print {
    @page { size: A4 landscape; margin: 10mm; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    .cr-page { box-shadow: none !important; border: 0 !important; }
  }
  .cr-page { width: 100%; }
`;

// ── Shared header block ──────────────────────────────────────────────────
function SheetHeader({
  school, classLabel, exam, subtitle,
}: { school: any; classLabel: string; exam: any; subtitle: string }) {
  return (
    <div className="flex items-start justify-between gap-4 pb-4 border-b-2 border-gray-200 mb-4">
      <div className="flex items-center gap-4">
        {school?.logo_url && (
          <img src={school.logo_url} alt="School logo" className="w-14 h-14 object-contain shrink-0" />
        )}
        <div>
          <h1 className="text-lg font-extrabold uppercase tracking-tight">{school?.name || "School"}</h1>
          <p className="text-sm font-bold mt-1 uppercase tracking-wide text-gray-700">{subtitle}</p>
          <p className="text-xs text-gray-500">
            {classLabel} &middot; {exam?.name} &mdash; {exam?.term} {exam?.year}
          </p>
        </div>
      </div>
      <div className="text-right text-[10px] text-gray-400">
        Generated {new Date().toLocaleDateString()}
        <br />
        Powered by SmartDev ERP
      </div>
    </div>
  );
}

// ── Full merit list (all subjects + overall position) ──────────────────────
export function ClassMeritListSheet({
  school, classLabel, exam, ranking, rankBasis, pageBreakAfter = false,
}: {
  school: any; classLabel: string; exam: any; ranking: ClassRankingResult; rankBasis: "mean" | "total";
  /** Adds print page-break-after; set true on every card except the last in a batch. */
  pageBreakAfter?: boolean;
}) {
  const { subjectCols, rows } = ranking;
  const classMean = rows.length ? rows.reduce((a, r) => a + r.mean, 0) / rows.length : 0;

  return (
    <div
      className="cr-page bg-white text-gray-900 border rounded-xl p-6 shadow-sm"
      style={pageBreakAfter ? { pageBreakAfter: "always", breakAfter: "page" } : undefined}
    >
      <SheetHeader school={school} classLabel={classLabel} exam={exam} subtitle="Class Merit List — Full Results" />

      {rows.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-10">No results found for this class and exam.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr className="bg-gray-100 uppercase tracking-wide text-gray-600">
                  <th className="text-center px-1.5 py-1.5 border">Pos</th>
                  <th className="text-left px-1.5 py-1.5 border">Adm No</th>
                  <th className="text-left px-1.5 py-1.5 border min-w-[110px]">Student Name</th>
                  {subjectCols.map((c) => (
                    <th key={c.id} className="text-center px-1 py-1.5 border max-w-[54px]">
                      {(c.code || c.name).slice(0, 10)}
                    </th>
                  ))}
                  <th className="text-center px-1.5 py-1.5 border">Total</th>
                  <th className="text-center px-1.5 py-1.5 border">Mean %</th>
                  <th className="text-center px-1.5 py-1.5 border">Grade</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.studentId} className="even:bg-gray-50">
                    <td className="text-center px-1.5 py-1 border font-bold">
                      {r.position === 1 ? "🥇" : r.position === 2 ? "🥈" : r.position === 3 ? "🥉" : r.position}
                    </td>
                    <td className="px-1.5 py-1 border font-mono">{r.admissionNo}</td>
                    <td className="px-1.5 py-1 border font-medium whitespace-nowrap">{r.name}</td>
                    {subjectCols.map((c) => {
                      const cell = r.scores[c.id];
                      return (
                        <td key={c.id} className="text-center px-1 py-1 border">
                          {cell ? (
                            <>
                              <span className="font-semibold">{cell.score}</span>
                              {cell.position != null && (
                                <span className="block text-[8px] text-gray-400 leading-none">
                                  {ordinal(cell.position)}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-center px-1.5 py-1 border font-semibold tabular-nums">{r.total}</td>
                    <td className="text-center px-1.5 py-1 border font-semibold tabular-nums">{r.mean.toFixed(1)}%</td>
                    <td className="text-center px-1.5 py-1 border font-bold" style={{ color: gradeColor(r.meanGrade) }}>
                      {r.meanGrade}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-6 items-center justify-between mt-4 pt-3 border-t text-xs text-gray-600">
            <div>
              Ranked by <span className="font-semibold">{rankBasis === "mean" ? "Mean Score" : "Total Score"}</span>.
              Small number under each score is that subject's position in the class.
            </div>
            <div className="flex gap-6">
              <div><span className="text-gray-400">Students:</span> <span className="font-semibold">{rows.length}</span></div>
              <div><span className="text-gray-400">Class Mean:</span> <span className="font-semibold">{classMean.toFixed(1)}%</span></div>
              <div><span className="text-gray-400">Top Student:</span> <span className="font-semibold">{rows[0]?.name}</span></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-12 pt-8 mt-4 text-xs text-gray-500 border-t">
            <div className="border-t pt-2 mt-6">
              <p className="font-semibold text-gray-700">Class Teacher's Signature</p>
              <p>Name: ________________________________</p>
            </div>
            <div className="border-t pt-2 mt-6">
              <p className="font-semibold text-gray-700">Principal's Signature</p>
              <p>Name: ________________________________</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Single-subject leaderboard (individual subject ranking) ────────────────
export function SubjectRankingSheet({
  school, classLabel, exam, ranking, subjectId,
}: { school: any; classLabel: string; exam: any; ranking: ClassRankingResult; subjectId: string }) {
  const col = ranking.subjectCols.find((c) => c.id === subjectId);
  const entries = ranking.rows
    .filter((r) => r.scores[subjectId])
    .map((r) => ({ ...r, cell: r.scores[subjectId] }))
    .sort((a, b) => (a.cell.position ?? 0) - (b.cell.position ?? 0) || a.name.localeCompare(b.name));

  const subjMean = entries.length
    ? entries.reduce((a, e) => a + e.cell.score, 0) / entries.length
    : 0;

  return (
    <div className="cr-page bg-white text-gray-900 border rounded-xl p-6 shadow-sm">
      <SheetHeader
        school={school} classLabel={classLabel} exam={exam}
        subtitle={`Subject Ranking — ${col?.name ?? "Subject"}`}
      />

      {entries.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-10">No results found for this subject.</p>
      ) : (
        <>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100 uppercase tracking-wide text-gray-600">
                <th className="text-center px-2 py-2 border w-14">Pos</th>
                <th className="text-left px-2 py-2 border">Adm No</th>
                <th className="text-left px-2 py-2 border">Student Name</th>
                <th className="text-center px-2 py-2 border">Score</th>
                <th className="text-center px-2 py-2 border">Grade</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.studentId} className="even:bg-gray-50">
                  <td className="text-center px-2 py-1.5 border font-bold">
                    {e.cell.position === 1 ? "🥇" : e.cell.position === 2 ? "🥈" : e.cell.position === 3 ? "🥉" : e.cell.position}
                  </td>
                  <td className="px-2 py-1.5 border font-mono">{e.admissionNo}</td>
                  <td className="px-2 py-1.5 border font-medium">{e.name}</td>
                  <td className="text-center px-2 py-1.5 border font-semibold tabular-nums">{e.cell.score}</td>
                  <td className="text-center px-2 py-1.5 border font-bold" style={{ color: gradeColor(e.cell.grade) }}>
                    {e.cell.grade}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-6 items-center justify-end mt-4 pt-3 border-t text-xs text-gray-600">
            <div><span className="text-gray-400">Entries:</span> <span className="font-semibold">{entries.length}</span></div>
            <div><span className="text-gray-400">Subject Mean:</span> <span className="font-semibold">{subjMean.toFixed(1)}%</span></div>
            <div><span className="text-gray-400">Top Score:</span> <span className="font-semibold">{entries[0]?.cell.score}</span></div>
          </div>
        </>
      )}
    </div>
  );
}
