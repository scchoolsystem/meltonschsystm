// Role-scoped navigation builder. Returns a SINGLE unified nav for the user
// regardless of how many roles they hold. No repeated Dashboard links, no
// repeated group headers. Multi-role users get the union of their accessible
// pages, de-duplicated by URL and grouped logically.
import { canAccess, moduleForPath, type AppRole } from "@/core/rbac";

export type NavItem = { title: string; url: string; icon?: any; feature?: string };
export type NavGroup = { label: string; items: NavItem[] };

const ADMIN_ROLES = new Set([
  "super_admin", "principal", "deputy_principal", "school_admin",
]);

const dashboard: NavItem = { title: "Dashboard", url: "/dashboard" };

// ── Admin nav (full access) ──────────────────────────────────────────────────
const ADMIN_NAV: NavGroup[] = [
  { label: "Main", items: [
    dashboard,
    { title: "Analytics", url: "/analytics" },
    { title: "Students", url: "/students" },
    { title: "Staff", url: "/staff" },
    { title: "Payslips", url: "/staff/payslips" },
    { title: "Classes", url: "/classes" },
    { title: "Announcements", url: "/announcements" },
  ]},
  { label: "Academics", items: [
    // Daily academic workflow first
    { title: "Marks & Remarks", url: "/academics/entry" },
    { title: "Results", url: "/academics/results" },
    { title: "Report Cards", url: "/academics/report-cards" },
    { title: "Remark Templates", url: "/academics/remarks" },
    // Setup
    { title: "Exams", url: "/academics/exams" },
    { title: "Subjects", url: "/academics/subjects" },
    { title: "Exam Oversight", url: "/academics/oversight" },
  ]},
  { label: "Planning", items: [
    { title: "Timetable", url: "/timetable" },
    { title: "Classroom", url: "/classroom" },
    { title: "Live Classes", url: "/live" },
    { title: "Department", url: "/department" },
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
    { title: "Expenses", url: "/finance/expenses" },
    { title: "Budget", url: "/finance/budget" },
    { title: "Analytics", url: "/finance/analytics" },
  ]},
  { label: "Digital IDs", items: [
    { title: "Bulk Print Cards", url: "/ids/bulk" },
    { title: "Verify ID (QR)", url: "/ids/verify" },
  ]},
  { label: "Administration", items: [
    // People & Access
    { title: "Departments", url: "/department" },
    { title: "Users & Credentials", url: "/admin/users" },
    { title: "User Roles", url: "/admin/roles" },
    { title: "Field Permissions", url: "/admin/permissions" },
    { title: "Portal Links", url: "/admin/links" },
    // Academic config
    { title: "Grading Scale", url: "/admin/grading" },
    { title: "Feature Modules", url: "/admin/features" },
    // Promotion system
    { title: "Class Structure", url: "/admin/class-structure" },
    { title: "Promotion Settings", url: "/admin/promotion-settings" },
    { title: "Year Promotion", url: "/admin/promotion" },
    // Student records
    { title: "Student Documents", url: "/admin/student-documents" },
    { title: "Leaving Certificates", url: "/admin/leaving-certificates" },
    { title: "Lifecycle Events", url: "/admin/lifecycle" },
    { title: "Insurance", url: "/admin/insurance" },
    // Data & tooling
    { title: "CSV Import", url: "/admin/import" },
    { title: "School Brain", url: "/admin/brain" },
    { title: "ICT Overview", url: "/admin/ict" },
    // Comms
    { title: "Communications", url: "/admin/communications", feature: "communications" },
    { title: "Support Tickets", url: "/admin/support" },
    // Audit & Finance
    { title: "Activity Log", url: "/admin/activity" },
    { title: "Field Edit Audit", url: "/admin/field-edits" },
    { title: "Override Log", url: "/admin/overrides" },
    { title: "Billing", url: "/admin/billing" },
    { title: "Compliance", url: "/admin/compliance" },
    { title: "Settings", url: "/admin/settings" },
  ]},
];

// ── Per-role nav items (URL → NavItem). Groups are defined separately below.
// Each role contributes items into logical named groups. When a user has
// multiple roles, items are merged by URL — no duplicates.

type RoleNavContribution = { group: string; items: NavItem[] }[];

const ROLE_NAV_CONTRIBUTIONS: Record<string, RoleNavContribution> = {
  student: [
    { group: "My School", items: [
      { title: "My Portal", url: "/portal" },
      { title: "Performance", url: "/portal/student?tab=analytics" },
      { title: "Results", url: "/portal/student?tab=results" },
      { title: "Report Cards", url: "/portal/student?tab=reportcards" },
      { title: "Timetable", url: "/portal/student?tab=timetable" },
      { title: "Assignments", url: "/assignments" },
      { title: "Attendance", url: "/portal/student?tab=attendance" },
      { title: "Fees", url: "/portal/student?tab=fees" },
      { title: "Classroom", url: "/classroom" },
      { title: "Live Classes", url: "/live" },
      { title: "Announcements", url: "/announcements" },
      { title: "Library", url: "/library" },
    ]},
  ],
  parent: [
    { group: "Parent Portal", items: [
      { title: "My Portal", url: "/portal" },
      { title: "Child Performance", url: "/portal/parent" },
      { title: "Attendance", url: "/portal/parent?tab=attendance" },
      { title: "Fees", url: "/finance/invoices" },
      { title: "Discipline", url: "/discipline" },
      { title: "Timetable", url: "/portal/parent?tab=timetable" },
      { title: "Live Classes", url: "/live" },
      { title: "Announcements", url: "/announcements" },
    ]},
  ],
  teacher: [
    { group: "Teaching", items: [
      { title: "My Workspace", url: "/portal" },
      { title: "My Subjects", url: "/academics/subjects" },
      { title: "Attendance", url: "/attendance" },
      { title: "Marks & Remarks", url: "/academics/entry" },
      { title: "Assignments", url: "/assignments" },
      { title: "Exams", url: "/academics/exams" },
      { title: "My Classes", url: "/classes" },
      { title: "Students", url: "/students" },
      { title: "My Timetable", url: "/portal/me?tab=timetable" },
      { title: "Classroom", url: "/classroom" },
      { title: "Live Classes", url: "/live" },
      { title: "Results", url: "/academics/results" },
      { title: "Remark Templates", url: "/academics/remarks" },
      { title: "Payslips", url: "/staff/payslips" },
    ]},
  ],
  class_teacher: [
    { group: "My Class", items: [
      { title: "My Workspace", url: "/portal" },
      { title: "My Class", url: "/classes" },
      { title: "Attendance", url: "/attendance" },
      { title: "Marks & Remarks", url: "/academics/entry" },
      { title: "Assignments", url: "/assignments" },
      { title: "Discipline", url: "/discipline" },
      { title: "Performance", url: "/academics/results" },
      { title: "Report Cards", url: "/academics/report-cards" },
      { title: "Remark Templates", url: "/academics/remarks" },
      { title: "My Timetable", url: "/portal/me?tab=timetable" },
      { title: "Classroom", url: "/classroom" },
      { title: "Live Classes", url: "/live" },
      { title: "Payslips", url: "/staff/payslips" },
    ]},
  ],
  hod: [
    { group: "Department", items: [
      { title: "My Department", url: "/department" },
      { title: "Subjects", url: "/academics/subjects" },
      { title: "Staff", url: "/staff" },
      { title: "Marks & Remarks", url: "/academics/entry" },
      { title: "Results Log", url: "/academics/marks" },
      { title: "Assignments", url: "/assignments" },
      { title: "Results", url: "/academics/results" },
      { title: "Report Cards", url: "/academics/report-cards" },
      { title: "Remarks", url: "/academics/remarks" },
      { title: "Analytics", url: "/analytics" },
      { title: "Announcements", url: "/announcements" },
      { title: "Payslips", url: "/staff/payslips" },
    ]},
  ],
  exams_admin: [
    { group: "Examinations", items: [
      { title: "Exams", url: "/academics/exams" },
      { title: "Marks & Remarks", url: "/academics/entry" },
      { title: "Results Log", url: "/academics/marks" },
      { title: "Results", url: "/academics/results" },
      { title: "Report Cards", url: "/academics/report-cards" },
      { title: "Exam Oversight", url: "/academics/oversight" },
      { title: "Remarks", url: "/academics/remarks" },
      { title: "Grading Scale", url: "/admin/grading" },
      { title: "Subjects", url: "/academics/subjects" },
      { title: "Analytics", url: "/analytics" },
      // Promotion system
      { title: "Class Structure", url: "/admin/class-structure" },
      { title: "Promotion Settings", url: "/admin/promotion-settings" },
      { title: "Year Promotion", url: "/admin/promotion" },
    ]},
  ],
  bursar: [
    { group: "Finance", items: [
      { title: "Fee Structures", url: "/finance/fees" },
      { title: "Invoices", url: "/finance/invoices" },
      { title: "Bulk Generate", url: "/finance/generate" },
      { title: "Payments", url: "/finance/payments" },
      { title: "Expenses", url: "/finance/expenses" },
      { title: "Budget", url: "/finance/budget" },
      { title: "Analytics", url: "/finance/analytics" },
    ]},
  ],
  nurse: [
    { group: "Clinic", items: [
      { title: "Medical Records", url: "/clinic" },
      { title: "Analytics", url: "/analytics" },
      { title: "Announcements", url: "/announcements" },
    ]},
  ],
  matron: [
    { group: "Boarding", items: [
      { title: "Boarding", url: "/boarding" },
      { title: "Dormitories", url: "/boarding?tab=dorms" },
      { title: "Night Attendance", url: "/boarding?tab=rollcall" },
      { title: "Students", url: "/students" },
      { title: "Clinic", url: "/clinic" },
      { title: "Analytics", url: "/analytics" },
      { title: "Announcements", url: "/announcements" },
    ]},
  ],
  discipline_admin: [
    { group: "Discipline", items: [
      { title: "Incidents", url: "/discipline" },
      { title: "Students", url: "/students" },
      { title: "Analytics", url: "/analytics" },
    ]},
  ],
  guidance_admin: [
    { group: "Guidance & Counselling", items: [
      { title: "Discipline", url: "/discipline" },
      { title: "Students", url: "/students" },
      { title: "Announcements", url: "/announcements" },
      { title: "Analytics", url: "/analytics" },
    ]},
  ],
  hr_admin: [
    { group: "Human Resources", items: [
      { title: "Staff Directory", url: "/staff" },
      { title: "Payslips", url: "/staff/payslips" },
      { title: "Analytics", url: "/analytics" },
    ]},
  ],
  security_admin: [
    { group: "Security", items: [
      { title: "Gate Records", url: "/security" },
      { title: "Verify Student IDs", url: "/ids/verify" },
      { title: "Bulk IDs", url: "/ids/bulk" },
      { title: "Analytics", url: "/analytics" },
    ]},
  ],
  sports_admin: [
    { group: "Sports & Activities", items: [
      { title: "Co-curricular", url: "/cocurricular" },
      { title: "Students", url: "/students" },
      { title: "Analytics", url: "/analytics" },
    ]},
  ],
  librarian: [
    { group: "Library", items: [
      { title: "Library", url: "/library" },
      { title: "Students", url: "/students" },
      { title: "Analytics", url: "/analytics" },
    ]},
  ],
  boarding_admin: [
    { group: "Boarding", items: [
      { title: "Boarding", url: "/boarding" },
      { title: "Students", url: "/students" },
      { title: "Analytics", url: "/analytics" },
    ]},
  ],
  kitchen_admin: [
    { group: "Kitchen", items: [
      { title: "Kitchen", url: "/kitchen" },
      { title: "Analytics", url: "/analytics" },
    ]},
  ],
  store_admin: [
    { group: "Store / Inventory", items: [
      { title: "Inventory", url: "/inventory" },
      { title: "Analytics", url: "/analytics" },
      { title: "Announcements", url: "/announcements" },
    ]},
  ],
  transport_admin: [
    { group: "Transport", items: [
      { title: "Transport", url: "/transport" },
      { title: "Students", url: "/students" },
      { title: "Analytics", url: "/analytics" },
    ]},
  ],
  ict_admin: [
    { group: "ICT", items: [
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
    ]},
  ],
  admission_officer: [
    { group: "Admissions", items: [
      { title: "Students", url: "/students" },
      { title: "CSV Import", url: "/admin/import" },
      { title: "Documents", url: "/admin/student-documents" },
    ]},
  ],
  // Generic "staff" role with no teaching/admin role — still needs to see
  // their own payslip. Was previously missing: matched 0 contributions,
  // so they got nothing but the bare Dashboard.
  staff: [
    { group: "My Account", items: [
      { title: "Payslips", url: "/staff/payslips" },
      { title: "Announcements", url: "/announcements" },
    ]},
  ],
};

// Role aliasing
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
  exams_user: "exams_admin",
  store_user: "store_admin",
  guidance_user: "guidance_admin",
  hr: "hr_admin",
};

export function isAdminRole(roles: string[]): boolean {
  return roles.some((r) => ADMIN_ROLES.has(r));
}

/**
 * Build a SINGLE unified sidebar navigation for the user.
 *
 * Rules:
 * - Admins → full ADMIN_NAV (unchanged)
 * - Single role → their focused nav group(s)
 * - Multiple roles → ONE Dashboard at the top, then every group from every
 *   role merged together, de-duplicated by URL. No group or link appears twice.
 */
export function buildNavigation(roles: string[], features?: Record<string, boolean>): NavGroup[] {
  if (!roles || roles.length === 0) {
    return [{ label: "Main", items: [dashboard] }];
  }
  if (isAdminRole(roles)) return filterNavByFeatures(ADMIN_NAV, features);

  // Accumulate contributions from every role, merging items by URL across groups.
  // groupOrder preserves the first time we see each group label.
  const groupOrder: string[] = [];
  const groupItems = new Map<string, Map<string, NavItem>>(); // groupLabel → url → NavItem
  const seenUrls = new Set<string>(); // global dedup across all groups

  // Dashboard is always first, never repeated
  seenUrls.add("/dashboard");

  let matched = 0;
  for (const role of roles) {
    const key = ROLE_ALIASES[role] ?? role;
    const contributions = ROLE_NAV_CONTRIBUTIONS[key];
    if (!contributions) continue;
    matched++;

    for (const { group, items } of contributions) {
      if (!groupItems.has(group)) {
        groupItems.set(group, new Map());
        groupOrder.push(group);
      }
      const bucket = groupItems.get(group)!;
      for (const item of items) {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          bucket.set(item.url, item);
        }
      }
    }
  }

  if (matched === 0) {
    return [{ label: "Main", items: [dashboard] }];
  }

  // Build final groups with Dashboard prepended once
  const groups: NavGroup[] = [{ label: "Main", items: [dashboard] }];
  for (const label of groupOrder) {
    const items = Array.from(groupItems.get(label)!.values());
    if (items.length > 0) groups.push({ label, items });
  }

  return filterNavByFeatures(groups, features);
}

// ─── Feature-toggle filtering ───────────────────────────────────────────────
// Maps a nav item's URL to the school_features.feature_key that gates it, so
// a platform admin (or school admin) disabling a module also hides its link
// from the sidebar — not just blocks the page after the click. Ordered
// longest-prefix-first isn't required since every entry is checked against
// `startsWith`, but keep more specific prefixes above their broader parents
// if that's ever needed (none currently overlap).
const NAV_FEATURE_BY_PREFIX: [prefix: string, feature: string][] = [
  ["/academics/subjects", "academics_subjects"],
  ["/academics/exams", "academics_exams"],
  ["/academics/entry", "academics_marks"],
  ["/academics/marks", "academics_marks"],
  ["/academics/remarks", "academics_remarks"],
  ["/academics/results", "academics_results"],
  ["/academics/report-cards", "academics_report_cards"],
  ["/academics/report-card", "academics_report_cards"],
  ["/academics/oversight", "academics_oversight"],
  ["/timetable", "timetable"],
  ["/announcements", "announcements"],
  ["/classroom", "classroom"],
  ["/live", "live_classes"],
  ["/library", "library"],
  ["/boarding", "boarding"],
  ["/kitchen", "kitchen"],
  ["/transport", "transport"],
  ["/clinic", "clinic"],
  ["/security", "security"],
  ["/discipline", "discipline"],
  ["/finance", "finance"],
  ["/ids", "ids"],
  ["/admin/leaving-certificates", "leaving_certs"],
  ["/admin/leaving-certificate", "leaving_certs"],
  ["/admin/communications", "communications"],
];

function featureForUrl(url: string, explicit?: string): string | undefined {
  if (explicit) return explicit;
  const path = url.split("?")[0];
  const match = NAV_FEATURE_BY_PREFIX.find(([prefix]) => path === prefix || path.startsWith(prefix + "/"));
  return match?.[1];
}

function filterNavByFeatures(groups: NavGroup[], features?: Record<string, boolean>): NavGroup[] {
  // No features loaded yet (still fetching, or platform-host context with no
  // school) → default-on, same as useFeatureGate, so we never hide links
  // before we actually know they should be hidden.
  if (!features) return groups;
  return groups
    .map((group) => ({
      label: group.label,
      items: group.items.filter((item) => {
        const key = featureForUrl(item.url, item.feature);
        if (!key) return true;
        return features[key] !== false;
      }),
    }))
    .filter((group) => group.items.length > 0);
}

// ─── Self-check: nav/permission consistency ───────────────────────────────────
// This exact class of bug bit us three times in one audit (Analytics links
// for matron/librarian/boarding_admin/etc., three exams_admin promotion
// links): role-experience.ts hands a role a sidebar link, but
// core/rbac/permissions.ts's MODULE_PERMISSIONS never granted that role
// access to the module the link resolves to — so canAccessRoute() in
// _app.tsx silently bounces them back to /dashboard the moment they click it.
//
// This check re-derives every literal role (accounting for ROLE_ALIASES) that
// reaches each nav item, resolves the item's URL to a module via
// moduleForPath(), and confirms canAccess() actually allows it. It runs once,
// in dev only, and warns in the console — it does not throw or block
// rendering, so a genuinely intentional gap (e.g. an item you're still
// wiring up) won't break the app, but you'll see it immediately in dev.
function auditNavPermissions(): string[] {
  const reverseAliases: Record<string, string[]> = {};
  for (const [literal, canonical] of Object.entries(ROLE_ALIASES)) {
    (reverseAliases[canonical] ??= []).push(literal);
  }

  const issues: string[] = [];
  for (const [contributionKey, groups] of Object.entries(ROLE_NAV_CONTRIBUTIONS)) {
    const literalRoles = [contributionKey, ...(reverseAliases[contributionKey] ?? [])];
    for (const { items } of groups) {
      for (const item of items) {
        const mod = moduleForPath(item.url);
        if (!mod) continue;
        for (const literalRole of literalRoles) {
          if (!canAccess([literalRole as AppRole], mod)) {
            issues.push(
              `role "${literalRole}" (nav group for "${contributionKey}") links to "${item.title}" → ${item.url} ` +
              `(module "${mod}"), but MODULE_PERMISSIONS["${mod}"] doesn't include "${literalRole}".`
            );
          }
        }
      }
    }
  }
  return issues;
}

if (import.meta.env.DEV) {
  const issues = auditNavPermissions();
  if (issues.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[role-experience] ${issues.length} nav/permission mismatch(es) — these sidebar links will bounce the user back to /dashboard:\n` +
      issues.map((i) => `  • ${i}`).join("\n")
    );
  }
}
