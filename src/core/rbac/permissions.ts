// Centralized RBAC module → roles map.
// Additive layer: existing inline role checks keep working. New code should
// prefer canAccess(roles, "module") over hand-rolled role.includes(...) checks.

export type AppRole =
  | "super_admin" | "principal" | "deputy_principal" | "class_teacher" | "hr_admin" | "hr"
  | "subject_teacher" | "hod" | "admission_officer" | "bursar"
  | "librarian" | "sports" | "boarding" | "parent" | "student" | "staff"
  | "teacher" | "nurse" | "matron" | "transport_officer"
  | "school_admin" | "academic_master" | "hr_admin" | "hr"
  | "exams_admin" | "exams_user" | "finance_admin" | "finance_user"
  | "boarding_admin" | "boarding_user" | "kitchen_admin" | "kitchen_user"
  | "security_admin" | "security_user" | "library_admin" | "library_user"
  | "clinic_admin" | "clinic_user" | "sports_admin" | "sports_user"
  | "store_admin" | "store_user" | "transport_admin" | "guidance_admin" | "guidance_user"
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
  // Widened to match every role role-experience.ts gives a Students nav link to:
  // matron, librarian, boarding staff, transport staff, sports staff,
  // discipline_admin, and guidance_admin all link to /students.
  students: [
    ...ADMIN_ROLES, ...TEACHING_ROLES, "admission_officer",
    "matron", "librarian", "library_admin", "library_user",
    "boarding", "boarding_admin", "boarding_user",
    "transport_admin", "transport_officer",
    "sports", "sports_admin", "sports_user",
    "discipline_admin", "guidance_admin", "guidance_user",
  ],
  staff: [...ADMIN_ROLES, "hod", "hr_admin", "hr"],
  // /staff/payslips specifically — broader than the staff directory itself,
  // since every staff member needs to view their own payslip. Page restricts
  // create/edit/issue actions to canManage (admin/finance_admin/bursar).
  "staff.payslips": [...ADMIN_ROLES, "hr_admin", "hr", "bursar", "finance_admin", ...TEACHING_ROLES, "staff"],
  classes: [...ADMIN_ROLES, ...TEACHING_ROLES, "student", "parent"],
  // exams_admin also gets a Subjects link in their nav group.
  subjects: [...ADMIN_ROLES, ...TEACHING_ROLES, "academic_master", "exams_admin", "exams_user", "student", "parent"],
  // SECURITY: exam ADMINISTRATION (create/edit exam windows). Students and
  // parents must never reach this — they see their own exams inside
  // portal.student / portal.parent, never this CRUD screen.
  exams: [...ADMIN_ROLES, ...TEACHING_ROLES, "exams_admin", "exams_user", "academic_master"],
  marks: [...ADMIN_ROLES, ...TEACHING_ROLES, "exams_admin", "exams_user"],
  // SECURITY: whole-school/whole-class results ADMINISTRATION (marks entry,
  // verification, cross-student tables). Students/parents must never reach
  // this — their own results render inside portal.student / portal.parent.
  results: [...ADMIN_ROLES, ...TEACHING_ROLES, "exams_admin", "exams_user", "academic_master"],
  // SECURITY: the class-wide report-card PICKER/ranking admin screen
  // (/academics/report-cards, plural). Never expose to student/parent —
  // it lets you pick any class and open ANY student's report card.
  "report-cards-admin": [...ADMIN_ROLES, ...TEACHING_ROLES, "exams_admin", "exams_user", "academic_master"],
  // A single student's own report card detail page
  // (/academics/report-card/$studentId/$examId, singular). Ownership of
  // $studentId must still be enforced by the route loader / RLS — this
  // module key only controls whether the role may reach the page at all.
  "report-card-view": [...ADMIN_ROLES, ...TEACHING_ROLES, "exams_admin", "academic_master", "student", "parent"],
  // Exam oversight: moderation, approval, release dashboard
  "exam-oversight": [
    ...ADMIN_ROLES,
    "exams_admin", "exams_user", "academic_master",
  ],
  // Remarks entry: subject/class teacher/principal can access (page filters by role)
  "remarks": [
    ...ADMIN_ROLES,
    ...TEACHING_ROLES,
    "exams_admin", "exams_user", "academic_master",
  ],
  // SECURITY: this is the teacher/admin marking screen (whole roster,
  // editable). Students/parents must never reach it — they see attendance
  // read-only, scoped to themselves/their own child, inside
  // portal.student / portal.parent instead.
  attendance: [...ADMIN_ROLES, ...TEACHING_ROLES],
  timetable: [...ADMIN_ROLES, ...TEACHING_ROLES, "academic_master", "student", "parent"],
  // Widened to match every role role-experience.ts gives an Analytics/Reports
  // nav link to: bursar (+ finance aliases), discipline_admin, hod, exams_admin,
  // guidance_admin.
  analytics: [
    ...ADMIN_ROLES, "academic_master", "exams_admin",
    "bursar", "finance_admin", "finance_user",
    "discipline_admin", "hod", "guidance_admin",
  ],

  // Dedicated analytics permissions (one per module — separate from the
  // module's own access permission, per the "View X Analytics" pattern).
  // Seeded from the exact role lists that were previously hardcoded inline
  // in _app.analytics.tsx's ALL_TABS, so existing users see zero change.
  // Gated behind the "analytics" key above at the route level; these control
  // which tabs render once inside the page.
  "analytics.academics": [...ADMIN_ROLES, ...TEACHING_ROLES, "exams_admin", "exams_user"],
  "analytics.finance": [...ADMIN_ROLES, "bursar", "finance_admin", "finance_user"],
  "analytics.library": [...ADMIN_ROLES, "librarian", "library_admin", "library_user"],
  "analytics.kitchen": [...ADMIN_ROLES, "kitchen_admin", "kitchen_user"],
  "analytics.store": [...ADMIN_ROLES, "store_admin", "store_user"],
  "analytics.transport": [...ADMIN_ROLES, "transport_admin", "transport_officer"],
  "analytics.clinic": [...ADMIN_ROLES, "nurse", "clinic_admin", "clinic_user", "matron"],
  "analytics.security": [...ADMIN_ROLES, "security_admin", "security_user"],
  "analytics.sports": [...ADMIN_ROLES, "sports_admin", "sports_user", "sports"],
  // New in this phase — these tabs didn't exist before.
  "analytics.discipline": [...ADMIN_ROLES, "discipline_admin", "guidance_admin", "guidance_user", "class_teacher"],
  "analytics.boarding": [...ADMIN_ROLES, "boarding_admin", "boarding_user", "boarding", "matron"],
  // Communications: notifications_log is RLS-restricted to admins only, so
  // this permission mirrors that — a non-admin role here would just see an
  // empty/blocked query, not real data.
  "analytics.communication": [...ADMIN_ROLES],
  // HR: headcount/status/department breakdown from the staff table.
  "analytics.hr": [...ADMIN_ROLES, "hr_admin", "hr"],
  // Attendance: school-wide, deeper than the Overview tab's single trend line.
  "analytics.attendance": [...ADMIN_ROLES, ...TEACHING_ROLES, "discipline_admin", "guidance_admin"],

  // Operations
  // Wave 2: parent allowed (RLS scopes to own children's invoices only).
  finance: [...ADMIN_ROLES, "bursar", "finance_admin", "finance_user", "parent"],
  // Wave 2: student allowed (read-only catalog; RLS scopes loans).
  library: [...ADMIN_ROLES, "librarian", "library_admin", "library_user", "student"],
  boarding: [...ADMIN_ROLES, "boarding_admin", "boarding_user", "boarding", "matron"],
  kitchen: [...ADMIN_ROLES, "kitchen_admin", "kitchen_user"],
  // matron's nav group also links to /clinic.
  clinic: [...ADMIN_ROLES, "nurse", "clinic_admin", "clinic_user", "matron"],
  security: [...ADMIN_ROLES, "security_admin", "security_user"],
  // Wave 2: Inventory / Store module.
  inventory: [...ADMIN_ROLES, "store_admin", "store_user", "bursar"],
  transport: [...ADMIN_ROLES, "transport_admin", "transport_officer"],
  sports: [...ADMIN_ROLES, "sports", "sports_admin", "sports_user"],
  cocurricular: [...ADMIN_ROLES, "sports", "sports_admin", "sports_user"],
  // Wave 2: parent allowed (RLS scopes to own children's incidents only).
  discipline: [...ADMIN_ROLES, "discipline_admin", "class_teacher", "guidance_admin", "guidance_user", "parent"],

  // Communication
  announcements: [], // everyone authenticated
  support: [], // everyone authenticated can submit a ticket
  classroom: [], // everyone authenticated — students see classes they joined; teachers post
  // Wave 1, Fix C-4: register `live` (live classes / streaming) so the
  // teacher/student/parent sidebar entries stop bouncing to /dashboard.
  live: [...ADMIN_ROLES, ...TEACHING_ROLES, "student", "parent"],
  ids: [], // everyone authenticated — any staff member needs to verify a student/staff ID on the spot
  // Assignments: teachers create/grade, students submit. Page itself
  // branches internally on isTeacher/isStudent — was previously missing
  // from this map entirely, so canAccess() fell back to admin-only.
  assignments: [...ADMIN_ROLES, ...TEACHING_ROLES, "student"],

  // Portals
  // "portal" is the single universal entry point (/portal) — any authenticated
  // user lands here and gets dispatched to the experience for their role(s).
  // The role-specific paths below remain reachable directly (deep links from
  // emails, notifications, and tab-scoped links like /portal/student?tab=fees)
  // for backward compatibility.
  portal: [], // any authenticated user
  "portal.student": ["student"],
  "portal.parent": ["parent"],
  "portal.me": [], // any authenticated user

  // Admin
  admin: [...ADMIN_ROLES],
  // ict_admin's nav group links to several admin.* pages it wasn't allowed
  // into: users, roles, permissions, links, activity, import, settings.
  "admin.users": [...ADMIN_ROLES, "ict_admin"],
  "admin.roles": [...ADMIN_ROLES, "ict_admin"],
  "admin.schools": ["super_admin", ...PLATFORM_ROLES],
  "admin.settings": [...ADMIN_ROLES, "ict_admin"],
  "admin.permissions": [...ADMIN_ROLES, "ict_admin"],
  "admin.activity": [...ADMIN_ROLES, "ict_admin"],
  "admin.brain": [...ADMIN_ROLES],
  "admin.grading": [...ADMIN_ROLES, "academic_master", "exams_admin", "exams_user"],
  // admission_officer and ict_admin both link to CSV Import.
  "admin.import": [...ADMIN_ROLES, "admission_officer", "ict_admin"],
  "admin.lifecycle": [...ADMIN_ROLES],
  "admin.links": [...ADMIN_ROLES, "ict_admin"],
  "admin.overrides": ["super_admin", "principal"],
  "admin.field-edits": [...ADMIN_ROLES],
  "admin.leaving-certificates": [...ADMIN_ROLES],
  "admin.leaving-certificate": [...ADMIN_ROLES],
  "admin.insurance": [...ADMIN_ROLES, "bursar", "finance_admin"],
  "admin.student-documents": [...ADMIN_ROLES, "admission_officer"],
  "admin.ict": [...ADMIN_ROLES, "ict_admin"],
  // New modules: previously missing entirely, so canAccess() fell back to
  // "admin only" even though role-experience.ts links hod/ict_admin here.
  "admin.departments": [...ADMIN_ROLES, "hod"],
  "admin.features": [...ADMIN_ROLES, "ict_admin"],
  "admin.support": [...ADMIN_ROLES, "ict_admin"],
  "admin.compliance": [...ADMIN_ROLES],

  // Promotion system
  // exams_admin's nav group links to all three of these (Class Structure,
  // Promotion Settings, Year Promotion) but wasn't in any of their role
  // lists — a dead sidebar link, same bug pattern as the analytics gate above.
  "admin.promotion": [...ADMIN_ROLES, "academic_master", "exams_admin", "exams_user"],
  "admin.promotion-settings": [...ADMIN_ROLES, "exams_admin", "exams_user"],
  "admin.class-structure": [...ADMIN_ROLES, "exams_admin", "exams_user"],

  // Platform
  platform: PLATFORM_ROLES,
};

export type ModuleKey = keyof typeof MODULE_PERMISSIONS;

// The top-level "analytics" gate (controls whether /analytics opens at all)
// must always be a superset of every analytics.<module> permission below it —
// otherwise a role can legitimately see a tab's content per the fine-grained
// permission, but the route guard in _app.tsx bounces them before they ever
// reach the page. This was a real, live bug: matron, librarian, boarding_admin,
// kitchen_admin, store_admin, transport_admin, sports_admin, and hr_admin all
// had an "Analytics" sidebar link (role-experience.ts) pointing at a page they
// didn't actually have permission to open.
//
// Computed once here instead of hand-duplicated, so registering a future
// analytics.<module> permission can never silently reopen this gap.
MODULE_PERMISSIONS.analytics = Array.from(new Set([
  ...MODULE_PERMISSIONS.analytics,
  ...Object.keys(MODULE_PERMISSIONS)
    .filter((k) => k.startsWith("analytics."))
    .flatMap((k) => MODULE_PERMISSIONS[k]),
])) as AppRole[];

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
    // /academics/entry — unified score+grade+remark grid ("Marks & Remarks"
    // in nav). Same audience as the old markbook, so it shares the "marks"
    // permission set rather than duplicating the role list.
    if (seg[1] === "entry") return "marks";
    if (seg[1] === "results") return "results";
    // /academics/report-card/$studentId/$examId — own report card detail.
    if (seg[1] === "report-card") return "report-card-view";
    // /academics/report-cards — admin class-wide picker/ranking.
    if (seg[1] === "report-cards") return "report-cards-admin";
    if (seg[1] === "subjects") return "subjects";
    if (seg[1] === "oversight") return "exam-oversight";
    if (seg[1] === "remarks") return "remarks";
  }
  if (seg[0] === "finance") return "finance";
  if (seg[0] === "staff" && seg[1] === "payslips") return "staff.payslips";
  if (seg[0] === "timetable") return "timetable";
  if (seg[0] === "ids") return "ids";
  if (seg[0] === "cocurricular") return "cocurricular";
  return seg[0] ?? null;
}
