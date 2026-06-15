// Role-aware dashboard widget builder.
// Returns a list of widget keys for the current user; the dashboard route
// maps each key to a concrete widget component. Admins keep the existing
// experience (the legacy "admin" widget set). Other roles get tailored sets.
import { isAdminRole, isPlatformRole, type AppRole } from "./index";

export type DashboardWidgetKey =
  // Admin / principal (legacy widgets)
  | "admin.kpis"
  | "admin.studentsPerClass"
  | "admin.schoolStructure"
  // Wave 2: deputy principal focus widgets
  | "deputy.attendanceToday"
  | "deputy.disciplineToday"
  | "deputy.staffOnLeave"
  // Teaching staff
  | "teacher.myClasses"
  | "teacher.todayTimetable"
  | "teacher.pendingMarks"
  // Student portal
  | "student.summary"
  | "student.upcomingExams"
  | "student.recentResults"
  // Parent portal
  | "parent.children"
  | "parent.outstandingFees"
  // Finance
  | "finance.collections"
  | "finance.outstanding"
  // Clinic / nurse
  | "clinic.todayVisits"
  // Discipline
  | "discipline.recentIncidents"
  // Library
  | "library.activeLoans"
  // Boarding
  | "boarding.occupancy"
  // Security
  | "security.recentLogs"
  // Platform
  | "platform.tenants";

export interface DashboardLayout {
  greeting: "admin" | "teacher" | "student" | "parent" | "staff" | "platform";
  widgets: DashboardWidgetKey[];
}

const ADMIN_WIDGETS: DashboardWidgetKey[] = [
  "admin.kpis",
  "admin.studentsPerClass",
  "admin.schoolStructure",
];

/**
 * Build a dashboard layout for the given user roles.
 * Multi-role users get the union of their widget sets, deduped, with the
 * highest-privilege greeting. Admin/principal => legacy admin dashboard.
 */
export function buildDashboard(userRoles: AppRole[]): DashboardLayout {
  if (!userRoles || userRoles.length === 0) {
    return { greeting: "staff", widgets: [] };
  }

  if (isPlatformRole(userRoles)) {
    return { greeting: "platform", widgets: ["platform.tenants"] };
  }

  if (isAdminRole(userRoles)) {
    const isDeputyOnly =
      userRoles.includes("deputy_principal") &&
      !userRoles.includes("super_admin") &&
      !userRoles.includes("principal") &&
      !userRoles.includes("school_admin");
    if (isDeputyOnly) {
      return {
        greeting: "admin",
        widgets: [
          "deputy.attendanceToday",
          "deputy.disciplineToday",
          "deputy.staffOnLeave",
          "admin.studentsPerClass",
        ],
      };
    }
    return { greeting: "admin", widgets: ADMIN_WIDGETS };
  }

  const widgets = new Set<DashboardWidgetKey>();
  let greeting: DashboardLayout["greeting"] = "staff";

  const has = (r: AppRole) => userRoles.includes(r);
  const hasAny = (rs: AppRole[]) => rs.some((r) => userRoles.includes(r));

  // ── Teaching staff ────────────────────────────────────────────────────────
  if (hasAny(["class_teacher", "subject_teacher", "teacher", "hod", "academic_master"])) {
    greeting = "teacher";
    widgets.add("teacher.myClasses");
    widgets.add("teacher.todayTimetable");
    widgets.add("teacher.pendingMarks");
  }

  // ── Exams staff ───────────────────────────────────────────────────────────
  if (hasAny(["exams_admin", "exams_user"])) {
    widgets.add("teacher.pendingMarks"); // reuse — shows pending mark sheets
  }

  // ── Student ───────────────────────────────────────────────────────────────
  if (has("student")) {
    greeting = greeting === "staff" ? "student" : greeting;
    widgets.add("student.summary");
    widgets.add("student.upcomingExams");
    widgets.add("student.recentResults");
  }

  // ── Parent ────────────────────────────────────────────────────────────────
  if (has("parent")) {
    greeting = greeting === "staff" ? "parent" : greeting;
    widgets.add("parent.children");
    widgets.add("parent.outstandingFees");
  }

  // ── Finance ───────────────────────────────────────────────────────────────
  if (hasAny(["bursar", "finance_admin", "finance_user"])) {
    widgets.add("finance.collections");
    widgets.add("finance.outstanding");
  }

  // ── Clinic / health ───────────────────────────────────────────────────────
  if (hasAny(["nurse", "clinic_admin", "clinic_user", "matron"])) {
    widgets.add("clinic.todayVisits");
  }

  // ── Discipline / guidance ─────────────────────────────────────────────────
  if (hasAny(["discipline_admin", "guidance_admin"])) {
    widgets.add("discipline.recentIncidents");
  }

  // ── Library ───────────────────────────────────────────────────────────────
  if (hasAny(["librarian", "library_admin", "library_user"])) {
    widgets.add("library.activeLoans");
  }

  // ── Boarding ──────────────────────────────────────────────────────────────
  if (hasAny(["boarding_admin", "boarding_user", "boarding", "matron"])) {
    widgets.add("boarding.occupancy");
  }

  // ── Security ──────────────────────────────────────────────────────────────
  if (hasAny(["security_admin", "security_user"])) {
    widgets.add("security.recentLogs");
  }

  // ── Sports / co-curricular ────────────────────────────────────────────────
  // sports_admin, sports_user, sports — previously got empty dashboard
  if (hasAny(["sports_admin", "sports_user", "sports"])) {
    // Show student count overview (useful for coaches) + discipline incidents
    // (useful for welfare tracking). Reuses existing widgets.
    widgets.add("admin.studentsPerClass");
    widgets.add("discipline.recentIncidents");
  }

  // ── Transport ─────────────────────────────────────────────────────────────
  // transport_admin, transport_officer — previously got empty dashboard
  if (hasAny(["transport_admin", "transport_officer"])) {
    widgets.add("admin.studentsPerClass"); // shows class/student numbers
  }

  // ── Kitchen / store ───────────────────────────────────────────────────────
  // kitchen_admin, kitchen_user, store_admin, store_user — empty before
  if (hasAny(["kitchen_admin", "kitchen_user", "store_admin", "store_user"])) {
    widgets.add("admin.studentsPerClass"); // headcount useful for catering
  }

  // ── Admission ─────────────────────────────────────────────────────────────
  if (has("admission_officer")) {
    widgets.add("admin.studentsPerClass");
    widgets.add("admin.schoolStructure");
  }

  // ── IT / HR / general staff ───────────────────────────────────────────────
  // Catch-all: any remaining authenticated staff with no specific widgets
  // get a minimal overview so they don't see the empty state.
  if (has("staff") && widgets.size === 0) {
    widgets.add("admin.studentsPerClass");
  }

  return { greeting, widgets: Array.from(widgets) };
}
