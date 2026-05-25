// Role-based UX engine: single source of truth for navigation + dashboard
// composition. Every user sees their own version of the system.
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, UserCog, Settings,
  Activity, ClipboardCheck, AlertTriangle, Library, Home, Bus, Stethoscope,
  Megaphone, CalendarDays, Wallet, Receipt, FileText, BookText, Award, User,
  Users2, Link2, QrCode, ScanLine, MessageSquare, HeartPulse, Pill, ShieldCheck,
  DoorOpen, ClipboardList, TrendingUp, AlertCircle, Calendar, type LucideIcon,
} from "lucide-react";
import type { FeatureKey } from "@/hooks/use-feature-gate";

export type Role = string;

export type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  feature?: FeatureKey;
};
export type NavGroup = { label: string; items: NavItem[] };

export type WidgetKey =
  | "attendance_pct" | "upcoming_exams" | "recent_marks" | "assignment_deadlines"
  | "today_timetable" | "announcements" | "child_attendance" | "fee_balance"
  | "performance_trend" | "school_notices" | "classes_today" | "pending_marks"
  | "attendance_alerts" | "exam_reminders" | "student_performance"
  | "class_attendance" | "discipline_incidents" | "top_performers"
  | "at_risk_students" | "missing_attendance" | "outstanding_balances"
  | "payments_today" | "overdue_invoices" | "collection_performance"
  | "todays_visits" | "health_alerts" | "medication_schedule"
  | "open_incidents" | "repeat_offenders" | "pending_reviews"
  | "visitors_today" | "entry_logs" | "pickup_alerts"
  | "total_students" | "total_staff" | "total_classes" | "term_status"
  | "students_per_class" | "school_structure";

// ---- Role priority for "primary persona" when merging ----------------------
const ADMIN_ROLES = new Set(["super_admin", "principal", "deputy_principal", "school_admin", "platform_owner", "platform_support"]);
export const isAdminRole = (roles: Role[]) =>
  roles.some((r) => ADMIN_ROLES.has(r));

// ---- Navigation building blocks --------------------------------------------
const STUDENT_NAV: NavGroup[] = [
  {
    label: "My School",
    items: [
      { title: "Dashboard",      url: "/dashboard",            icon: LayoutDashboard },
      { title: "My Portal",      url: "/portal/student",       icon: User },
      { title: "My Subjects",    url: "/academics/subjects",   icon: BookText },
      { title: "Assignments",    url: "/academics/exams",      icon: ClipboardList },
      { title: "Attendance",     url: "/attendance",           icon: ClipboardCheck },
      { title: "Results",        url: "/academics/results",    icon: Award },
      { title: "Timetable",      url: "/timetable",            icon: CalendarDays, feature: "timetable" },
      { title: "Announcements",  url: "/announcements",        icon: Megaphone },
      { title: "Library",        url: "/library",              icon: Library, feature: "library" },
    ],
  },
];

const PARENT_NAV: NavGroup[] = [
  {
    label: "Parent Portal",
    items: [
      { title: "Dashboard",         url: "/dashboard",        icon: LayoutDashboard },
      { title: "My Portal",         url: "/portal/parent",    icon: Users2 },
      { title: "Child Performance", url: "/academics/results",icon: Award },
      { title: "Attendance",        url: "/attendance",       icon: ClipboardCheck },
      { title: "Fees",              url: "/finance/invoices", icon: Wallet, feature: "finance" },
      { title: "Discipline",        url: "/discipline",       icon: AlertTriangle, feature: "discipline" },
      { title: "Timetable",         url: "/timetable",        icon: CalendarDays, feature: "timetable" },
      { title: "Announcements",     url: "/announcements",    icon: Megaphone },
    ],
  },
];

const SUBJECT_TEACHER_NAV: NavGroup[] = [
  {
    label: "Teaching",
    items: [
      { title: "Dashboard",      url: "/dashboard",          icon: LayoutDashboard },
      { title: "My Subjects",    url: "/academics/subjects", icon: BookText },
      { title: "Attendance",     url: "/attendance",         icon: ClipboardCheck },
      { title: "Mark Entry",     url: "/academics/marks",    icon: ClipboardList },
      { title: "Exams",          url: "/academics/exams",    icon: FileText },
      { title: "Students",       url: "/students",           icon: GraduationCap },
      { title: "Timetable",      url: "/timetable",          icon: CalendarDays, feature: "timetable" },
      { title: "Reports",        url: "/academics/results",  icon: Award },
    ],
  },
];

const CLASS_TEACHER_NAV: NavGroup[] = [
  {
    label: "My Class",
    items: [
      { title: "Dashboard",        url: "/dashboard",      icon: LayoutDashboard },
      { title: "My Class",         url: "/classes",        icon: BookOpen },
      { title: "Attendance",       url: "/attendance",     icon: ClipboardCheck },
      { title: "Discipline",       url: "/discipline",     icon: AlertTriangle, feature: "discipline" },
      { title: "Performance",      url: "/academics/results", icon: TrendingUp },
      { title: "Report Cards",     url: "/academics/report-cards", icon: FileText },
      { title: "Parent Messages",  url: "/announcements",  icon: MessageSquare },
      { title: "Timetable",        url: "/timetable",      icon: CalendarDays, feature: "timetable" },
    ],
  },
];

const FINANCE_NAV: NavGroup[] = [
  {
    label: "Finance",
    items: [
      { title: "Dashboard",      url: "/dashboard",          icon: LayoutDashboard },
      { title: "Fee Structures", url: "/finance/fees",       icon: Wallet,  feature: "finance" },
      { title: "Invoices",       url: "/finance/invoices",   icon: Receipt, feature: "finance" },
      { title: "Bulk Generate",  url: "/finance/generate",   icon: Receipt, feature: "finance" },
      { title: "Payments",       url: "/finance/payments",   icon: Receipt, feature: "finance" },
      { title: "Reports",        url: "/analytics",          icon: Activity },
    ],
  },
];

const CLINIC_NAV: NavGroup[] = [
  {
    label: "Clinic",
    items: [
      { title: "Dashboard",        url: "/dashboard", icon: LayoutDashboard },
      { title: "Medical Records",  url: "/clinic",    icon: HeartPulse, feature: "clinic" },
      { title: "Visits",           url: "/clinic",    icon: Stethoscope, feature: "clinic" },
      { title: "Medication",       url: "/clinic",    icon: Pill,        feature: "clinic" },
      { title: "Health Reports",   url: "/analytics", icon: Activity },
    ],
  },
];

const DISCIPLINE_NAV: NavGroup[] = [
  {
    label: "Discipline",
    items: [
      { title: "Dashboard",        url: "/dashboard",  icon: LayoutDashboard },
      { title: "Incidents",        url: "/discipline", icon: AlertTriangle, feature: "discipline" },
      { title: "Student Behavior", url: "/students",   icon: GraduationCap },
      { title: "Sanctions",        url: "/discipline", icon: ShieldCheck,   feature: "discipline" },
      { title: "Reports",          url: "/analytics",  icon: Activity },
    ],
  },
];

const SECURITY_NAV: NavGroup[] = [
  {
    label: "Security & Gate",
    items: [
      { title: "Dashboard",   url: "/dashboard",   icon: LayoutDashboard },
      { title: "Visitors",    url: "/security",    icon: DoorOpen,  feature: "security" },
      { title: "Gate Records",url: "/security",    icon: ShieldCheck, feature: "security" },
      { title: "Student IDs", url: "/ids/verify",  icon: ScanLine,  feature: "id_cards" },
      { title: "Bulk IDs",    url: "/ids/bulk",    icon: QrCode,    feature: "id_cards" },
    ],
  },
];

const LIBRARY_NAV: NavGroup[] = [
  { label: "Library", items: [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "Library",   url: "/library",   icon: Library, feature: "library" },
    { title: "Students",  url: "/students",  icon: GraduationCap },
  ]},
];

const BOARDING_NAV: NavGroup[] = [
  { label: "Boarding", items: [
    { title: "Dashboard",  url: "/dashboard", icon: LayoutDashboard },
    { title: "Boarding",   url: "/boarding",  icon: Home, feature: "boarding" },
    { title: "Students",   url: "/students",  icon: GraduationCap },
  ]},
];

const KITCHEN_NAV: NavGroup[] = [
  { label: "Kitchen", items: [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "Kitchen",   url: "/kitchen",   icon: BookOpen, feature: "kitchen" },
  ]},
];

const TRANSPORT_NAV: NavGroup[] = [
  { label: "Transport", items: [
    { title: "Dashboard",  url: "/dashboard", icon: LayoutDashboard },
    { title: "Transport",  url: "/transport", icon: Bus, feature: "transport" },
    { title: "Students",   url: "/students",  icon: GraduationCap },
  ]},
];

const ADMISSION_NAV: NavGroup[] = [
  { label: "Admissions", items: [
    { title: "Dashboard", url: "/dashboard",      icon: LayoutDashboard },
    { title: "Students",  url: "/students",       icon: GraduationCap },
    { title: "Import",    url: "/admin/import",   icon: FileText },
    { title: "Documents", url: "/admin/student-documents", icon: FileText },
  ]},
];

// Full admin surface
const ADMIN_NAV: NavGroup[] = [
  { label: "Main", items: [
    { title: "Dashboard",     url: "/dashboard",     icon: LayoutDashboard },
    { title: "Analytics",     url: "/analytics",     icon: Activity },
    { title: "Students",      url: "/students",      icon: GraduationCap },
    { title: "Staff",         url: "/staff",         icon: UserCog },
    { title: "Classes",       url: "/classes",       icon: BookOpen },
    { title: "Announcements", url: "/announcements", icon: Megaphone },
  ]},
  { label: "Academics", items: [
    { title: "Subjects",     url: "/academics/subjects",     icon: BookText },
    { title: "Exams",        url: "/academics/exams",        icon: FileText },
    { title: "Mark Entry",   url: "/academics/marks",        icon: ClipboardCheck },
    { title: "Results",      url: "/academics/results",      icon: Award },
    { title: "Report Cards", url: "/academics/report-cards", icon: FileText },
    { title: "Timetable",    url: "/timetable",              icon: CalendarDays, feature: "timetable" },
    { title: "Auto-generate",url: "/timetable/generate",     icon: CalendarDays, feature: "timetable" },
  ]},
  { label: "Operations", items: [
    { title: "Attendance", url: "/attendance", icon: ClipboardCheck },
    { title: "Discipline", url: "/discipline", icon: AlertTriangle, feature: "discipline" },
    { title: "Library",    url: "/library",    icon: Library,       feature: "library" },
    { title: "Boarding",   url: "/boarding",   icon: Home,          feature: "boarding" },
    { title: "Kitchen",    url: "/kitchen",    icon: BookOpen,      feature: "kitchen" },
    { title: "Transport",  url: "/transport",  icon: Bus,           feature: "transport" },
    { title: "Clinic",     url: "/clinic",     icon: Stethoscope,   feature: "clinic" },
    { title: "Security",   url: "/security",   icon: AlertTriangle, feature: "security" },
  ]},
  { label: "Finance", items: [
    { title: "Fee Structures",url: "/finance/fees",     icon: Wallet,  feature: "finance" },
    { title: "Invoices",      url: "/finance/invoices", icon: Receipt, feature: "finance" },
    { title: "Bulk Generate", url: "/finance/generate", icon: Receipt, feature: "finance" },
    { title: "Payments",      url: "/finance/payments", icon: Receipt, feature: "finance" },
  ]},
  { label: "Digital IDs", items: [
    { title: "Bulk Print Cards", url: "/ids/bulk",   icon: QrCode,    feature: "id_cards" },
    { title: "Verify ID",        url: "/ids/verify", icon: ScanLine,  feature: "id_cards" },
  ]},
  { label: "Administration", items: [
    { title: "School Brain",         url: "/admin/brain",       icon: Activity },
    { title: "Users & Credentials",  url: "/admin/users",       icon: Users },
    { title: "Portal Links",         url: "/admin/links",       icon: Link2 },
    { title: "User Roles",           url: "/admin/roles",       icon: Users },
    { title: "Field Permissions",    url: "/admin/permissions", icon: Settings },
    { title: "CSV Import",           url: "/admin/import",      icon: FileText },
    { title: "Activity Log",         url: "/admin/activity",    icon: Activity },
    { title: "Lifecycle Events",     url: "/admin/lifecycle",   icon: Activity },
    { title: "Field Edit Audit",     url: "/admin/field-edits", icon: Activity },
    { title: "Override Log",         url: "/admin/overrides",   icon: Activity },
    { title: "Leaving Certificates", url: "/admin/leaving-certificates", icon: Award },
    { title: "Grading Scale",        url: "/admin/grading",     icon: Award },
    { title: "Settings",             url: "/admin/settings",    icon: Settings },
  ]},
];

const ROLE_TO_NAV: Record<string, NavGroup[]> = {
  student: STUDENT_NAV,
  parent: PARENT_NAV,
  subject_teacher: SUBJECT_TEACHER_NAV,
  teacher: SUBJECT_TEACHER_NAV,
  class_teacher: CLASS_TEACHER_NAV,
  hod: SUBJECT_TEACHER_NAV,
  academic_master: SUBJECT_TEACHER_NAV,
  bursar: FINANCE_NAV,
  finance_admin: FINANCE_NAV,
  finance_user: FINANCE_NAV,
  nurse: CLINIC_NAV,
  matron: CLINIC_NAV,
  clinic_admin: CLINIC_NAV,
  clinic_user: CLINIC_NAV,
  discipline_admin: DISCIPLINE_NAV,
  security_admin: SECURITY_NAV,
  security_user: SECURITY_NAV,
  librarian: LIBRARY_NAV,
  library_admin: LIBRARY_NAV,
  library_user: LIBRARY_NAV,
  boarding: BOARDING_NAV,
  boarding_admin: BOARDING_NAV,
  boarding_user: BOARDING_NAV,
  kitchen_admin: KITCHEN_NAV,
  kitchen_user: KITCHEN_NAV,
  transport_officer: TRANSPORT_NAV,
  transport_admin: TRANSPORT_NAV,
  admission_officer: ADMISSION_NAV,
  staff: SUBJECT_TEACHER_NAV,
};

/**
 * buildNavigation — merges nav groups for all of a user's roles intelligently.
 * Admin roles get the full nav. Everyone else gets only what their roles allow,
 * with duplicate items de-duped by URL.
 */
export function buildNavigation(roles: Role[]): NavGroup[] {
  if (isAdminRole(roles)) return ADMIN_NAV;

  const groups: NavGroup[] = [];
  const seenGroupLabels = new Map<string, NavGroup>();

  for (const r of roles) {
    const navs = ROLE_TO_NAV[r];
    if (!navs) continue;
    for (const g of navs) {
      const existing = seenGroupLabels.get(g.label);
      if (existing) {
        const urls = new Set(existing.items.map((i) => i.url));
        for (const it of g.items) if (!urls.has(it.url)) existing.items.push(it);
      } else {
        const copy = { label: g.label, items: [...g.items] };
        seenGroupLabels.set(g.label, copy);
        groups.push(copy);
      }
    }
  }

  // Fallback: unknown role => minimal dashboard
  if (!groups.length) {
    groups.push({
      label: "My School",
      items: [{ title: "Dashboard", url: "/dashboard", icon: LayoutDashboard }],
    });
  }

  // Cross-group de-dup by URL (keep first occurrence)
  const seenUrl = new Set<string>();
  for (const g of groups) {
    g.items = g.items.filter((i) => (seenUrl.has(i.url) ? false : (seenUrl.add(i.url), true)));
  }
  return groups.filter((g) => g.items.length);
}

// ---- Dashboard widgets ------------------------------------------------------
export type Widget = {
  key: WidgetKey;
  title: string;
  description?: string;
  icon: LucideIcon;
  accent?: string;
};

const W = {
  attendance_pct:        { key: "attendance_pct",        title: "My Attendance",        icon: ClipboardCheck, accent: "text-chart-1" },
  upcoming_exams:        { key: "upcoming_exams",        title: "Upcoming Exams",       icon: FileText,       accent: "text-chart-2" },
  recent_marks:          { key: "recent_marks",          title: "Recent Marks",         icon: Award,          accent: "text-chart-3" },
  assignment_deadlines:  { key: "assignment_deadlines",  title: "Assignment Deadlines", icon: ClipboardList,  accent: "text-chart-4" },
  today_timetable:       { key: "today_timetable",       title: "Today's Timetable",    icon: CalendarDays,   accent: "text-chart-5" },
  announcements:         { key: "announcements",         title: "Announcements",        icon: Megaphone,      accent: "text-chart-1" },
  child_attendance:      { key: "child_attendance",      title: "Child Attendance",     icon: ClipboardCheck, accent: "text-chart-1" },
  fee_balance:           { key: "fee_balance",           title: "Fee Balance",          icon: Wallet,         accent: "text-chart-2" },
  performance_trend:     { key: "performance_trend",     title: "Performance Trend",    icon: TrendingUp,     accent: "text-chart-3" },
  school_notices:        { key: "school_notices",        title: "School Notices",       icon: Megaphone,      accent: "text-chart-4" },
  classes_today:         { key: "classes_today",         title: "Classes Today",        icon: Calendar,       accent: "text-chart-1" },
  pending_marks:         { key: "pending_marks",         title: "Pending Marks",        icon: ClipboardList,  accent: "text-chart-2" },
  attendance_alerts:     { key: "attendance_alerts",     title: "Attendance Alerts",    icon: AlertCircle,    accent: "text-chart-3" },
  exam_reminders:        { key: "exam_reminders",        title: "Exam Reminders",       icon: FileText,       accent: "text-chart-4" },
  student_performance:   { key: "student_performance",   title: "Student Performance",  icon: TrendingUp,     accent: "text-chart-5" },
  class_attendance:      { key: "class_attendance",      title: "Class Attendance",     icon: ClipboardCheck, accent: "text-chart-1" },
  discipline_incidents:  { key: "discipline_incidents",  title: "Discipline Incidents", icon: AlertTriangle,  accent: "text-chart-2" },
  top_performers:        { key: "top_performers",        title: "Top Performers",       icon: Award,          accent: "text-chart-3" },
  at_risk_students:      { key: "at_risk_students",      title: "At-Risk Students",     icon: AlertCircle,    accent: "text-chart-4" },
  missing_attendance:    { key: "missing_attendance",    title: "Missing Attendance",   icon: AlertCircle,    accent: "text-chart-5" },
  outstanding_balances:  { key: "outstanding_balances",  title: "Outstanding Balances", icon: Wallet,         accent: "text-chart-1" },
  payments_today:        { key: "payments_today",        title: "Payments Today",       icon: Receipt,        accent: "text-chart-2" },
  overdue_invoices:      { key: "overdue_invoices",      title: "Overdue Invoices",     icon: AlertTriangle,  accent: "text-chart-3" },
  collection_performance:{ key: "collection_performance",title: "Collection Performance", icon: TrendingUp,   accent: "text-chart-4" },
  todays_visits:         { key: "todays_visits",         title: "Today's Visits",       icon: Stethoscope,    accent: "text-chart-1" },
  health_alerts:         { key: "health_alerts",         title: "Health Alerts",        icon: HeartPulse,     accent: "text-chart-2" },
  medication_schedule:   { key: "medication_schedule",   title: "Medication Schedule",  icon: Pill,           accent: "text-chart-3" },
  open_incidents:        { key: "open_incidents",        title: "Open Incidents",       icon: AlertTriangle,  accent: "text-chart-1" },
  repeat_offenders:      { key: "repeat_offenders",      title: "Repeat Offenders",     icon: AlertCircle,    accent: "text-chart-2" },
  pending_reviews:       { key: "pending_reviews",       title: "Pending Reviews",      icon: ClipboardList,  accent: "text-chart-3" },
  visitors_today:        { key: "visitors_today",        title: "Visitors Today",       icon: DoorOpen,       accent: "text-chart-1" },
  entry_logs:            { key: "entry_logs",            title: "Entry Logs",           icon: ShieldCheck,    accent: "text-chart-2" },
  pickup_alerts:         { key: "pickup_alerts",         title: "Pickup Alerts",        icon: AlertCircle,    accent: "text-chart-3" },
  total_students:        { key: "total_students",        title: "Total Students",       icon: GraduationCap,  accent: "text-chart-1" },
  total_staff:           { key: "total_staff",           title: "Staff Members",        icon: Users,          accent: "text-chart-2" },
  total_classes:         { key: "total_classes",         title: "Classes",              icon: BookOpen,       accent: "text-chart-3" },
  term_status:           { key: "term_status",           title: "This Term",            icon: TrendingUp,     accent: "text-chart-4" },
  students_per_class:    { key: "students_per_class",    title: "Students per Class",   icon: BookOpen },
  school_structure:      { key: "school_structure",      title: "School Structure",     icon: GraduationCap },
} satisfies Record<WidgetKey, Widget>;

const ROLE_WIDGETS: Record<string, WidgetKey[]> = {
  student: ["attendance_pct","upcoming_exams","recent_marks","assignment_deadlines","today_timetable","announcements"],
  parent: ["child_attendance","fee_balance","performance_trend","school_notices","upcoming_exams","announcements"],
  subject_teacher: ["classes_today","pending_marks","attendance_alerts","exam_reminders","student_performance"],
  teacher: ["classes_today","pending_marks","attendance_alerts","exam_reminders","student_performance"],
  hod: ["classes_today","pending_marks","student_performance","exam_reminders","attendance_alerts"],
  academic_master: ["student_performance","pending_marks","exam_reminders","attendance_alerts"],
  class_teacher: ["class_attendance","discipline_incidents","top_performers","at_risk_students","missing_attendance"],
  bursar: ["outstanding_balances","payments_today","overdue_invoices","collection_performance"],
  finance_admin: ["outstanding_balances","payments_today","overdue_invoices","collection_performance"],
  finance_user: ["payments_today","outstanding_balances","overdue_invoices"],
  nurse: ["todays_visits","health_alerts","medication_schedule"],
  matron: ["todays_visits","health_alerts","medication_schedule"],
  clinic_admin: ["todays_visits","health_alerts","medication_schedule"],
  clinic_user: ["todays_visits","medication_schedule"],
  discipline_admin: ["open_incidents","repeat_offenders","pending_reviews"],
  security_admin: ["visitors_today","entry_logs","pickup_alerts"],
  security_user: ["visitors_today","entry_logs","pickup_alerts"],
  librarian: ["announcements"],
  staff: ["announcements","today_timetable"],
};

const ADMIN_WIDGETS: WidgetKey[] = ["total_students","total_staff","total_classes","term_status"];

/**
 * buildDashboard — merges widgets for all of a user's roles. Combines roles
 * intelligently for multi-role users (e.g. class_teacher + subject_teacher),
 * de-duplicates, and caps at 8 widgets to keep things focused.
 */
export function buildDashboard(roles: Role[]): {
  widgets: Widget[];
  showAdminCharts: boolean;
  primaryPersona: string;
} {
  const isAdmin = isAdminRole(roles);
  const seen = new Set<WidgetKey>();
  const widgets: Widget[] = [];

  const pushKeys = (keys: WidgetKey[]) => {
    for (const k of keys) {
      if (seen.has(k)) continue;
      seen.add(k);
      widgets.push(W[k]);
    }
  };

  if (isAdmin) pushKeys(ADMIN_WIDGETS);
  for (const r of roles) {
    const ks = ROLE_WIDGETS[r];
    if (ks) pushKeys(ks);
  }

  if (!widgets.length) {
    pushKeys(["announcements", "today_timetable"]);
  }

  const primary =
    (isAdmin && "Administrator") ||
    (roles.includes("class_teacher") && roles.includes("subject_teacher") && "Class & Subject Teacher") ||
    roles[0] ||
    "User";

  return {
    widgets: widgets.slice(0, 8),
    showAdminCharts: isAdmin,
    primaryPersona: primary.replace(/_/g, " "),
  };
}

// ---- Permission helpers -----------------------------------------------------
export function canAccessPath(roles: Role[], path: string): boolean {
  if (isAdminRole(roles)) return true;
  const groups = buildNavigation(roles);
  return groups.some((g) => g.items.some((i) => path.startsWith(i.url)));
}
