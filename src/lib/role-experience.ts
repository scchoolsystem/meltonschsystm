// Role-scoped navigation builder. Returns the nav groups a user can see
// based on their roles. Admin roles get everything; every other role gets
// a focused, task-specific menu. Unknown roles fall back to Dashboard only.

export type NavItem = { title: string; url: string; icon?: any; feature?: string };
export type NavGroup = { label: string; items: NavItem[] };

const ADMIN_ROLES = new Set([
  "super_admin", "principal", "deputy_principal", "school_admin",
]);

const dashboard: NavItem = { title: "Dashboard", url: "/dashboard" };

// Per-role group templates. A user gets the union of every group their roles unlock.
const ROLE_GROUPS: Record<string, NavGroup[]> = {
  student: [{
    label: "My School",
    items: [
      dashboard,
      { title: "My Portal", url: "/portal/student" },
      { title: "My Subjects", url: "/academics/subjects" },
      { title: "Exams", url: "/academics/exams" },
      // Results, Report Cards, admin/* and settings/* are accessed via the
      // student portal only — direct routes are blocked by route guards.
      { title: "Attendance", url: "/attendance" },
      { title: "Classroom", url: "/classroom" },
      { title: "Live Classes", url: "/live" },
      { title: "Announcements", url: "/announcements" },
      { title: "Library", url: "/library" },
    ],
  }],
  parent: [{
    label: "Parent Portal",
    items: [
      dashboard,
      { title: "My Portal", url: "/portal/parent" },
      { title: "Child Performance", url: "/academics/results" },
      { title: "Attendance", url: "/attendance" },
      { title: "Fees", url: "/finance/invoices" },
      { title: "Discipline", url: "/discipline" },
      { title: "Timetable", url: "/timetable" },
      { title: "Live Classes", url: "/live" },
      { title: "Announcements", url: "/announcements" },
    ],
  }],
  teacher: [{
    label: "Teaching",
    items: [
      dashboard,
      { title: "My Subjects", url: "/academics/subjects" },
      { title: "Attendance", url: "/attendance" },
      { title: "Mark Entry", url: "/academics/marks" },
      { title: "Exams", url: "/academics/exams" },
      { title: "Students", url: "/students" },
      { title: "Timetable", url: "/timetable" },
      { title: "Classroom", url: "/classroom" },
      { title: "Live Classes", url: "/live" },
      { title: "Results", url: "/academics/results" },
    ],
  }],
  class_teacher: [{
    label: "My Class",
    items: [
      dashboard,
      { title: "My Class", url: "/classes" },
      { title: "Attendance", url: "/attendance" },
      { title: "Discipline", url: "/discipline" },
      { title: "Performance", url: "/academics/results" },
      { title: "Report Cards", url: "/academics/report-cards" },
      { title: "Timetable", url: "/timetable" },
      { title: "Classroom", url: "/classroom" },
      { title: "Live Classes", url: "/live" },
    ],
  }],
  bursar: [{
    label: "Finance",
    items: [
      dashboard,
      { title: "Fee Structures", url: "/finance/fees" },
      { title: "Invoices", url: "/finance/invoices" },
      { title: "Bulk Generate", url: "/finance/generate" },
      { title: "Payments", url: "/finance/payments" },
      { title: "Reports", url: "/analytics" },
    ],
  }],
  nurse: [{
    label: "Clinic",
    items: [
      dashboard,
      { title: "Medical Records", url: "/clinic" },
      { title: "Announcements", url: "/announcements" },
    ],
  }],
  // Wave 1, Fix C-5: matron previously aliased to nurse and saw only the
  // Clinic group. Give matrons the boarding-house surface they actually run.
  matron: [{
    label: "Boarding",
    items: [
      dashboard,
      { title: "Boarding", url: "/boarding" },
      { title: "Dormitories", url: "/boarding/dormitories" },
      { title: "Night Attendance", url: "/boarding/attendance" },
      { title: "Students", url: "/students" },
      { title: "Clinic", url: "/clinic" },
      { title: "Announcements", url: "/announcements" },
    ],
  }],
  discipline_admin: [{
    label: "Discipline",
    items: [
      dashboard,
      { title: "Incidents", url: "/discipline" },
      { title: "Students", url: "/students" },
      { title: "Reports", url: "/analytics" },
    ],
  }],
  security_admin: [{
    label: "Security",
    items: [
      dashboard,
      { title: "Gate Records", url: "/security" },
      { title: "Verify Student IDs", url: "/ids/verify" },
      { title: "Bulk IDs", url: "/ids/bulk" },
    ],
  }],
  sports_admin: [{
    label: "Sports & activities",
    items: [
      dashboard,
      { title: "Co-curricular", url: "/cocurricular" },
      { title: "Students", url: "/students" },
    ],
  }],
  librarian: [{
    label: "Library",
    items: [
      dashboard,
      { title: "Library", url: "/library" },
      { title: "Students", url: "/students" },
    ],
  }],
  boarding_admin: [{
    label: "Boarding",
    items: [
      dashboard,
      { title: "Boarding", url: "/boarding" },
      { title: "Students", url: "/students" },
    ],
  }],
  kitchen_admin: [{
    label: "Kitchen",
    items: [dashboard, { title: "Kitchen", url: "/kitchen" }],
  }],
  transport_admin: [{
    label: "Transport",
    items: [
      dashboard,
      { title: "Transport", url: "/transport" },
      { title: "Students", url: "/students" },
    ],
  }],
  admission_officer: [{
    label: "Admissions",
    items: [
      dashboard,
      { title: "Students", url: "/students" },
      { title: "CSV Import", url: "/admin/import" },
      { title: "Documents", url: "/admin/student-documents" },
    ],
  }],
  // Wave 2: dedicated nav groups for previously-blank sidebars.
  hod: [{
    label: "Department",
    items: [
      dashboard,
      { title: "My Department", url: "/admin/departments" },
      { title: "Subjects", url: "/academics/subjects" },
      { title: "Staff", url: "/staff" },
      { title: "Mark Entry", url: "/academics/marks" },
      { title: "Results", url: "/academics/results" },
      { title: "Report Cards", url: "/academics/report-cards" },
      { title: "Analytics", url: "/analytics" },
      { title: "Announcements", url: "/announcements" },
    ],
  }],
  ict_admin: [{
    label: "ICT",
    items: [
      dashboard,
      { title: "ICT Overview", url: "/admin/ict" },
      { title: "Users & Credentials", url: "/admin/users" },
      { title: "User Roles", url: "/admin/roles" },
      { title: "Field Permissions", url: "/admin/permissions" },
      { title: "Portal Links", url: "/admin/links" },
      { title: "Activity Log", url: "/admin/activity" },
      { title: "CSV Import", url: "/admin/import" },
      { title: "Feature Modules", url: "/admin/features" },
      { title: "Support Tickets", url: "/admin/support" },
      { title: "Settings", url: "/admin/settings" },
    ],
  }],
  exams_admin: [{
    label: "Examinations",
    items: [
      dashboard,
      { title: "Exams", url: "/academics/exams" },
      { title: "Mark Entry", url: "/academics/marks" },
      { title: "Results", url: "/academics/results" },
      { title: "Report Cards", url: "/academics/report-cards" },
      { title: "Grading Scale", url: "/admin/grading" },
      { title: "Subjects", url: "/academics/subjects" },
      { title: "Analytics", url: "/analytics" },
    ],
  }],
  store_admin: [{
    label: "Store / Inventory",
    items: [
      dashboard,
      { title: "Inventory", url: "/inventory" },
      { title: "Announcements", url: "/announcements" },
    ],
  }],
  guidance_admin: [{
    label: "Guidance & Counselling",
    items: [
      dashboard,
      { title: "Discipline", url: "/discipline" },
      { title: "Students", url: "/students" },
      { title: "Announcements", url: "/announcements" },
      { title: "Analytics", url: "/analytics" },
    ],
  }],
};

// Role aliasing — multiple roles share a nav template
const ROLE_ALIASES: Record<string, string> = {
  subject_teacher: "teacher",
  academic_master: "teacher",
  finance_admin: "bursar",
  finance_user: "bursar",
  clinic_admin: "nurse",
  clinic_user: "nurse",
  security_user: "security_admin",
  library_admin: "librarian",
  library_user: "librarian",
  boarding_user: "boarding_admin",
  boarding: "boarding_admin",
  kitchen_user: "kitchen_admin",
  transport_officer: "transport_admin",
  sports: "sports_admin",
  sports_user: "sports_admin",
};

// Full admin navigation
const ADMIN_NAV: NavGroup[] = [
  { label: "Main", items: [
    dashboard,
    { title: "Analytics", url: "/analytics" },
    { title: "Students", url: "/students" },
    { title: "Staff", url: "/staff" },
    { title: "Classes", url: "/classes" },
    { title: "Classroom", url: "/classroom" },
      { title: "Live Classes", url: "/live" },
    { title: "Announcements", url: "/announcements" },
  ]},
  { label: "Academics", items: [
    { title: "Subjects", url: "/academics/subjects" },
    { title: "Exams", url: "/academics/exams" },
    { title: "Mark Entry", url: "/academics/marks" },
    { title: "Results", url: "/academics/results" },
    { title: "Report Cards", url: "/academics/report-cards" },
    { title: "Timetable", url: "/timetable" },
  ]},
  { label: "Operations", items: [
    { title: "Attendance", url: "/attendance" },
    { title: "Discipline", url: "/discipline" },
    { title: "Library", url: "/library" },
    { title: "Boarding", url: "/boarding" },
    { title: "Kitchen", url: "/kitchen" },
    { title: "Transport", url: "/transport" },
    { title: "Clinic", url: "/clinic" },
    { title: "Security", url: "/security" },
    { title: "Co-curricular", url: "/cocurricular" },
    { title: "Inventory", url: "/inventory" },
  ]},
  { label: "Finance", items: [
    { title: "Fee Structures", url: "/finance/fees" },
    { title: "Invoices", url: "/finance/invoices" },
    { title: "Bulk Generate", url: "/finance/generate" },
    { title: "Payments", url: "/finance/payments" },
  ]},
  { label: "Digital IDs", items: [
    { title: "Bulk Print Cards", url: "/ids/bulk" },
    { title: "Verify ID", url: "/ids/verify" },
  ]},
  { label: "Administration", items: [
    { title: "Departments", url: "/admin/departments" },
    { title: "School Brain", url: "/admin/brain" },
    { title: "Users & Credentials", url: "/admin/users" },
    { title: "Portal Links", url: "/admin/links" },
    { title: "User Roles", url: "/admin/roles" },
    { title: "Field Permissions", url: "/admin/permissions" },
    { title: "CSV Import", url: "/admin/import" },
    { title: "Activity Log", url: "/admin/activity" },
    { title: "Lifecycle Events", url: "/admin/lifecycle" },
    { title: "Field Edit Audit", url: "/admin/field-edits" },
    { title: "Override Log", url: "/admin/overrides" },
    { title: "Insurance", url: "/admin/insurance" },
    { title: "Student Documents", url: "/admin/student-documents" },
    { title: "Leaving Certificates", url: "/admin/leaving-certificates" },
    { title: "Grading Scale", url: "/admin/grading" },
    { title: "Billing", url: "/admin/billing" },
    { title: "Settings", url: "/admin/settings" },
    { title: "Communications", url: "/admin/communications", feature: "communications" },
    { title: "Feature Modules", url: "/admin/features" },
    { title: "Support Tickets", url: "/admin/support" },
    { title: "ICT Overview", url: "/admin/ict" },
  ]},
];

export function isAdminRole(roles: string[]): boolean {
  return roles.some((r) => ADMIN_ROLES.has(r));
}

/**
 * Build the role-scoped navigation. Admins get the full menu; everyone else
 * gets the union of their roles' scoped groups, de-duplicated by URL.
 */
export function buildNavigation(roles: string[]): NavGroup[] {
  if (!roles || roles.length === 0) {
    return [{ label: "Main", items: [dashboard] }];
  }
  if (isAdminRole(roles)) return ADMIN_NAV;

  // Collect groups for every role the user has
  const groupsByLabel = new Map<string, Map<string, NavItem>>();
  let matched = 0;
  for (const role of roles) {
    const key = ROLE_ALIASES[role] ?? role;
    const groups = ROLE_GROUPS[key];
    if (!groups) continue;
    matched++;
    for (const g of groups) {
      const bucket = groupsByLabel.get(g.label) ?? new Map<string, NavItem>();
      for (const it of g.items) {
        if (!bucket.has(it.url)) bucket.set(it.url, it);
      }
      groupsByLabel.set(g.label, bucket);
    }
  }

  if (matched === 0) {
    return [{ label: "Main", items: [dashboard] }];
  }

  return Array.from(groupsByLabel.entries()).map(([label, items]) => ({
    label,
    items: Array.from(items.values()),
  }));
}
