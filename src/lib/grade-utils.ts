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
};

export function gradeHex(grade: string): string {
  return GRADE_COLORS[grade] ?? "#94a3b8";
}

// ── Points (KCSE 12-point system) ─────────────────────────────────────────────

export function gradePoints(grade: string): number {
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
