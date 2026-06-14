// Centralized RBAC module → roles map.
// Additive layer: existing inline role checks keep working. New code should
// prefer canAccess(roles, "module") over hand-rolled role.includes(...) checks.

export type AppRole =
  | "super_admin" | "principal" | "deputy_principal" | "class_teacher"
  | "subject_teacher" | "hod" | "admission_officer" | "bursar"
  | "librarian" | "sports" | "boarding" | "parent" | "student" | "staff"
  | "teacher" | "nurse" | "matron" | "transport_officer"
  | "school_admin" | "academic_master"
  | "exams_admin" | "exams_user" | "finance_admin" | "finance_user"
  | "boarding_admin" | "boarding_user" | "kitchen_admin" | "kitchen_user"
  | "security_admin" | "security_user" | "library_admin" | "library_user"
  | "clinic_admin" | "clinic_user" | "sports_admin" | "sports_user"
  | "store_admin" | "store_user" | "transport_admin" | "guidance_admin"
  | "ict_admin" | "discipline_admin"
  | "platform_owner" | "platform_support";

export const ADMIN_ROLES: AppRole[] = [
  "super_admin", "principal", "deputy_principal", "school_admin",
];

export const PLATFORM_ROLES: AppRole[] = ["platform_owner", "platform_support"];

const TEACHING_ROLES: AppRole[] = [
  "class_teacher", "subject_teacher", "teacher", "hod", "academic_master",
];

/** Module → roles allowed to access. Admin roles are implicitly allowed everywhere. */
export const MODULE_PERMISSIONS: Record<string, AppRole[]> = {
  // Core
  dashboard: [], // everyone authenticated
  profile: [],

  // Academics
  students: [...ADMIN_ROLES, ...TEACHING_ROLES, "admission_officer"],
  staff: [...ADMIN_ROLES, "hod"],
  classes: [...ADMIN_ROLES, ...TEACHING_ROLES],
  subjects: [...ADMIN_ROLES, ...TEACHING_ROLES, "academic_master"],
  exams: [...ADMIN_ROLES, ...TEACHING_ROLES, "exams_admin", "exams_user", "academic_master"],
  marks: [...ADMIN_ROLES, ...TEACHING_ROLES, "exams_admin", "exams_user"],
  results: [...ADMIN_ROLES, ...TEACHING_ROLES, "exams_admin", "exams_user", "academic_master"],
  "report-cards": [...ADMIN_ROLES, ...TEACHING_ROLES, "exams_admin", "academic_master"],
  attendance: [...ADMIN_ROLES, ...TEACHING_ROLES],
  timetable: [...ADMIN_ROLES, ...TEACHING_ROLES, "academic_master"],
  analytics: [...ADMIN_ROLES, "academic_master"],

  // Operations
  // Wave 2: parent allowed (RLS scopes to own children's invoices only).
  finance: [...ADMIN_ROLES, "bursar", "finance_admin", "finance_user", "parent"],
  // Wave 2: student allowed (read-only catalog; RLS scopes loans).
  library: [...ADMIN_ROLES, "librarian", "library_admin", "library_user", "student"],
  boarding: [...ADMIN_ROLES, "boarding_admin", "boarding_user", "matron"],
  kitchen: [...ADMIN_ROLES, "kitchen_admin", "kitchen_user"],
  clinic: [...ADMIN_ROLES, "nurse", "clinic_admin", "clinic_user"],
  security: [...ADMIN_ROLES, "security_admin", "security_user"],
  // Wave 2: Inventory / Store module.
  inventory: [...ADMIN_ROLES, "store_admin", "store_user", "bursar"],
  transport: [...ADMIN_ROLES, "transport_admin", "transport_officer"],
  sports: [...ADMIN_ROLES, "sports", "sports_admin", "sports_user"],
  cocurricular: [...ADMIN_ROLES, "sports", "sports_admin", "sports_user"],
  // Wave 2: parent allowed (RLS scopes to own children's incidents only).
  discipline: [...ADMIN_ROLES, "discipline_admin", "class_teacher", "guidance_admin", "parent"],

  // Communication
  announcements: [], // everyone authenticated
  classroom: [], // everyone authenticated — students see classes they joined; teachers post
  // Wave 1, Fix C-4: register `live` (live classes / streaming) so the
  // teacher/student/parent sidebar entries stop bouncing to /dashboard.
  live: [...ADMIN_ROLES, ...TEACHING_ROLES, "student", "parent"],
  ids: [...ADMIN_ROLES, "admission_officer", "security_admin", "security_user"],

  // Portals (role-specific)
  "portal.student": ["student"],
  "portal.parent": ["parent"],
  "portal.me": [], // any authenticated user

  // Admin
  admin: [...ADMIN_ROLES],
  "admin.users": [...ADMIN_ROLES],
  "admin.roles": [...ADMIN_ROLES],
  "admin.schools": ["super_admin", ...PLATFORM_ROLES],
  "admin.settings": [...ADMIN_ROLES],
  "admin.permissions": [...ADMIN_ROLES],
  "admin.activity": [...ADMIN_ROLES],
  "admin.brain": [...ADMIN_ROLES],
  "admin.grading": [...ADMIN_ROLES, "academic_master", "exams_admin"],
  "admin.import": [...ADMIN_ROLES],
  "admin.lifecycle": [...ADMIN_ROLES],
  "admin.links": [...ADMIN_ROLES],
  "admin.overrides": ["super_admin", "principal"],
  "admin.field-edits": [...ADMIN_ROLES],
  "admin.leaving-certificates": [...ADMIN_ROLES],
  "admin.insurance": [...ADMIN_ROLES, "bursar", "finance_admin"],
  "admin.student-documents": [...ADMIN_ROLES, "admission_officer"],

  // Platform
  platform: PLATFORM_ROLES,
};

export type ModuleKey = keyof typeof MODULE_PERMISSIONS;

/** Map a route path (e.g. "/finance/fees" or "/admin/users") to a module key. */
export function moduleForPath(pathname: string): string | null {
  const p = pathname.replace(/^\/+/, "").split("?")[0].split("#")[0];
  if (!p) return "dashboard";
  const seg = p.split("/");
  // /admin/users → "admin.users", /portal/parent → "portal.parent"
  if (seg[0] === "admin" && seg[1]) return `admin.${seg[1]}`;
  if (seg[0] === "portal" && seg[1]) return `portal.${seg[1]}`;
  if (seg[0] === "academics" && seg[1]) {
    if (seg[1] === "exams") return "exams";
    if (seg[1] === "marks") return "marks";
    if (seg[1] === "results" || seg[1] === "report-card" || seg[1] === "report-cards") return "results";
    if (seg[1] === "subjects") return "subjects";
  }
  if (seg[0] === "finance") return "finance";
  if (seg[0] === "timetable") return "timetable";
  if (seg[0] === "ids") return "ids";
  if (seg[0] === "cocurricular") return "cocurricular";
  return seg[0] ?? null;
}
