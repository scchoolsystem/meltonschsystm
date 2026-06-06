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
    return { greeting: "admin", widgets: ADMIN_WIDGETS };
  }

  const widgets = new Set<DashboardWidgetKey>();
  let greeting: DashboardLayout["greeting"] = "staff";

  const has = (r: AppRole) => userRoles.includes(r);
  const hasAny = (rs: AppRole[]) => rs.some((r) => userRoles.includes(r));

  if (hasAny(["class_teacher", "subject_teacher", "teacher", "hod", "academic_master"])) {
    greeting = "teacher";
    widgets.add("teacher.myClasses");
    widgets.add("teacher.todayTimetable");
    widgets.add("teacher.pendingMarks");
  }

  if (has("student")) {
    greeting = greeting === "staff" ? "student" : greeting;
    widgets.add("student.summary");
    widgets.add("student.upcomingExams");
    widgets.add("student.recentResults");
  }

  if (has("parent")) {
    greeting = greeting === "staff" ? "parent" : greeting;
    widgets.add("parent.children");
    widgets.add("parent.outstandingFees");
  }

  if (hasAny(["bursar", "finance_admin", "finance_user"])) {
    widgets.add("finance.collections");
    widgets.add("finance.outstanding");
  }

  if (hasAny(["nurse", "clinic_admin", "clinic_user", "matron"])) {
    widgets.add("clinic.todayVisits");
  }

  if (hasAny(["discipline_admin", "guidance_admin"])) {
    widgets.add("discipline.recentIncidents");
  }

  if (hasAny(["librarian", "library_admin", "library_user"])) {
    widgets.add("library.activeLoans");
  }

  if (hasAny(["boarding_admin", "boarding_user"])) {
    widgets.add("boarding.occupancy");
  }

  if (hasAny(["security_admin", "security_user"])) {
    widgets.add("security.recentLogs");
  }

  return { greeting, widgets: Array.from(widgets) };
}
