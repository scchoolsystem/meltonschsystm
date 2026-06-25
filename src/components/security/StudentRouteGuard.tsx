// src/components/security/StudentRouteGuard.tsx
// Blocks students from accessing admin/staff-only routes.
// Drop this as a wrapper in any route that students must not reach directly.

import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

/**
 * Paths that a pure student role must never reach.
 * Admin routes (/admin/*) and result administration pages
 * are access-controlled here AND at the sidebar level.
 */
export const STUDENT_FORBIDDEN_PREFIXES = [
  "/admin",
  "/academics/marks",
  "/academics/report-cards",    // admin list view
  "/academics/exams",           // exam administration
  "/analytics",                 // school-wide analytics
  "/staff",
  "/students",                  // student management (not their own portal)
  "/classes",                   // class administration
  "/finance/fees",
  "/finance/generate",
  "/finance/payments",
  "/timetable/generate",
  "/admin/periods",
  "/admin/rooms",
  "/admin/grading",
  "/admin/settings",
] as const;

/**
 * Returns true when `path` starts with any forbidden prefix for students.
 */
export function isStudentForbiddenPath(path: string): boolean {
  return STUDENT_FORBIDDEN_PREFIXES.some((p) => path.startsWith(p));
}

/**
 * Inline guard component — renders nothing and redirects if a pure student
 * lands on a forbidden route. Mount at the top of protected page components.
 *
 * Usage:
 *   function Page() {
 *     return (
 *       <>
 *         <StudentRouteGuard />
 *         <YourPageContent />
 *       </>
 *     );
 *   }
 */
export function StudentRouteGuard() {
  const { roles, rolesLoaded } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!rolesLoaded) return;
    const isPureStudent = roles.length === 1 && roles[0] === "student";
    if (!isPureStudent) return;

    const currentPath = window.location.pathname;
    if (isStudentForbiddenPath(currentPath)) {
      navigate({ to: "/portal/student", replace: true });
    }
  }, [rolesLoaded, roles, navigate]);

  return null;
}
