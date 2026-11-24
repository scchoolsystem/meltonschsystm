/**
 * src/lib/grade-utils.ts
 *
 * SmartDev ERP — Shared grade calculation utilities.
 * Single source of truth for grade boundaries, colours, and points.
 * Replaces duplicated fallbackGrade / gradeColor / gradePoints / meanGrade
 * spread across results.tsx, report-card.tsx, report-cards.tsx, marks.tsx.
 *
 * Usage:
 *   import { fallbackGrade, gradeColor, gradePoints, meanGrade, GRADE_COLORS } from "@/lib/grade-utils";
 */

// ── Grade from score (KCSE-style 12-point A–E) ────────────────────────────────

export function fallbackGrade(score: number): string {
  if (score >= 80) return "A";
  if (score >= 75) return "A-";
  if (score >= 70) return "B+";
  if (score >= 65) return "B";
  if (score >= 60) return "B-";
  if (score >= 55) return "C+";
  if (score >= 50) return "C";
  if (score >= 45) return "C-";
  if (score >= 40) return "D+";
  if (score >= 35) return "D";
  if (score >= 30) return "D-";
  return "E";
}

// ── CSS text colour for a grade ───────────────────────────────────────────────

export function gradeColor(grade: string): string {
  if (isCbcGrade(grade)) {
    if (grade.startsWith("EE")) return "text-emerald-600";
    if (grade.startsWith("ME")) return "text-blue-600";
    if (grade.startsWith("AE")) return "text-amber-600";
    return "text-red-600"; // BE
  }
  if (["A", "A-"].includes(grade)) return "text-emerald-600";
  if (["B+", "B", "B-"].includes(grade)) return "text-blue-600";
  if (["C+", "C", "C-"].includes(grade)) return "text-amber-600";
  if (["D+", "D", "D-"].includes(grade)) return "text-orange-500";
  return "text-red-600";
}

// ── Hex colour for chart cells ────────────────────────────────────────────────

export const GRADE_COLORS: Record<string, string> = {
  "A":  "#16a34a",
  "A-": "#22c55e",
  "B+": "#2563eb",
  "B":  "#3b82f6",
  "B-": "#60a5fa",
  "C+": "#d97706",
  "C":  "#f59e0b",
  "C-": "#fbbf24",
  "D+": "#dc2626",
  "D":  "#ef4444",
  "D-": "#f87171",
  "E":  "#7c3aed",
  // CBC 8-level
  "EE1": "#16a34a", "EE2": "#22c55e",
  "ME1": "#2563eb", "ME2": "#60a5fa",
  "AE1": "#d97706", "AE2": "#fbbf24",
  "BE1": "#dc2626", "BE2": "#f87171",
};

export function gradeHex(grade: string): string {
  return GRADE_COLORS[grade] ?? "#94a3b8";
}

// ── Points (KCSE 12-point system) ─────────────────────────────────────────────

export function gradePoints(grade: string): number {
  if (isCbcGrade(grade)) return CBC_POINTS[grade];
  const map: Record<string, number> = {
    "A": 12, "A-": 11,
    "B+": 10, "B": 9, "B-": 8,
    "C+": 7,  "C": 6, "C-": 5,
    "D+": 4,  "D": 3, "D-": 2,
    "E": 1,
  };
  return map[grade] ?? 0;
}

// ── Mean grade from average points ────────────────────────────────────────────

export function meanGrade(avgPoints: number): string {
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

// ── Grade label with color (used in UI badges) ────────────────────────────────

export function gradeLabel(score: number): { grade: string; color: string } {
  const grade = fallbackGrade(score);
  return { grade, color: gradeHex(grade) };
}

// ── Chart colours (for recharts) ──────────────────────────────────────────────

export const CHART_COLORS = [
  "#6366f1", "#22c55e", "#f97316", "#06b6d4",
  "#ec4899", "#eab308", "#8b5cf6", "#14b8a6",
];

// ── Ordinal suffix ────────────────────────────────────────────────────────────

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}


// ── CBC (competency-based) 8-level scale ──────────────────────────────────────
// KNEC: four levels each split in two. Bands are contiguous so decimals never fall in a gap.
export const CBC_LEVELS = [
  { label: "EE1", min: 90, points: 8, name: "Exceptional" },
  { label: "EE2", min: 75, points: 7, name: "Very Good" },
  { label: "ME1", min: 58, points: 6, name: "Good" },
  { label: "ME2", min: 41, points: 5, name: "Fair" },
  { label: "AE1", min: 31, points: 4, name: "Needs Improvement" },
  { label: "AE2", min: 21, points: 3, name: "Below Average" },
  { label: "BE1", min: 11, points: 2, name: "Well Below Average" },
  { label: "BE2", min: 0,  points: 1, name: "Minimal" },
] as const;

export const CBC_POINTS: Record<string, number> = Object.fromEntries(CBC_LEVELS.map((l) => [l.label, l.points]));

export function isCbcGrade(grade: string | null | undefined): boolean {
  return !!grade && Object.prototype.hasOwnProperty.call(CBC_POINTS, grade);
}

export function cbcGradeFromScore(score: number): string {
  return (CBC_LEVELS.find((l) => score >= l.min) ?? CBC_LEVELS[CBC_LEVELS.length - 1]).label;
}

/** Overall CBC level from average points (rounded to the nearest level, .5 rounds up). */
export function cbcMeanLevel(avgPoints: number): string {
  const p = Math.min(8, Math.max(1, Math.round(avgPoints)));
  return CBC_LEVELS.find((l) => l.points === p)!.label;
}

/**
 * Overall (mean) grade for a set of subject grades. If every grade is a CBC
 * level the CBC scale is used; otherwise the KCSE 12-point mean grade.
 */
export function meanGradeOf(grades: string[]): string {
  if (grades.length === 0) return "—";
  const avg = grades.reduce((t, g) => t + gradePoints(g), 0) / grades.length;
  return grades.every(isCbcGrade) ? cbcMeanLevel(avg) : meanGrade(avg);
}

/** Total CBC points (e.g. 54 of 72 for nine learning areas) — KNEC reports KJSEA this way. */
export function cbcTotalPoints(grades: string[]): { total: number; max: number } {
  return { total: grades.reduce((t, g) => t + gradePoints(g), 0), max: grades.length * 8 };
}
