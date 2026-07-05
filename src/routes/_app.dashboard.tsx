import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { buildDashboard, type DashboardWidgetKey } from "@/core/rbac/dashboard";
import type { AppRole } from "@/core/rbac";
import {
  AdminKpisWidget, AdminStudentRiskWidget, AdminStudentsPerClassWidget,
  AdminSchoolStructureWidget, TeacherMyClassesWidget, TeacherTodayTimetableWidget,
  TeacherPendingMarksWidget, StudentSummaryWidget, StudentUpcomingExamsWidget,
  StudentRecentResultsWidget, ParentChildrenWidget, ParentOutstandingFeesWidget,
  FinanceCollectionsWidget, FinanceOutstandingWidget, ClinicTodayVisitsWidget,
  DisciplineRecentIncidentsWidget, LibraryActiveLoansWidget, BoardingOccupancyWidget,
  SecurityRecentLogsWidget, PlatformTenantsWidget, AdminAttendanceTodayWidget,
  AdminPendingActionsWidget, AdminNewStudentsThisWeekWidget, AdminOverdueFeesWidget,
  TransportRouteSummaryWidget, KitchenTodaySummaryWidget, SportsSummaryWidget,
  IctFeatureFlagsWidget, IctActiveUsersWidget, IctSupportTicketsWidget,
} from "@/components/dashboard/widgets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen, Calendar, ClipboardList, TrendingUp, Users, Wallet,
  Library, Utensils, Package, Bus, Stethoscope, ShieldCheck, Trophy,
  GraduationCap, Bell, BarChart3, ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

const WIDGETS: Record<DashboardWidgetKey, React.ComponentType> = {
  "admin.kpis": AdminKpisWidget,
  "admin.studentRisk": AdminStudentRiskWidget,
  "admin.studentsPerClass": AdminStudentsPerClassWidget,
  "admin.schoolStructure": AdminSchoolStructureWidget,
  "teacher.myClasses": TeacherMyClassesWidget,
  "teacher.todayTimetable": TeacherTodayTimetableWidget,
  "teacher.pendingMarks": TeacherPendingMarksWidget,
  "student.summary": StudentSummaryWidget,
  "student.upcomingExams": StudentUpcomingExamsWidget,
  "student.recentResults": StudentRecentResultsWidget,
  "parent.children": ParentChildrenWidget,
  "parent.outstandingFees": ParentOutstandingFeesWidget,
  "finance.collections": FinanceCollectionsWidget,
  "finance.outstanding": FinanceOutstandingWidget,
  "clinic.todayVisits": ClinicTodayVisitsWidget,
  "discipline.recentIncidents": DisciplineRecentIncidentsWidget,
  "library.activeLoans": LibraryActiveLoansWidget,
  "boarding.occupancy": BoardingOccupancyWidget,
  "security.recentLogs": SecurityRecentLogsWidget,
  "platform.tenants": PlatformTenantsWidget,
  "admin.attendanceToday": AdminAttendanceTodayWidget,
  "admin.pendingActions": AdminPendingActionsWidget,
  "admin.newStudentsThisWeek": AdminNewStudentsThisWeekWidget,
  "admin.overdueFees": AdminOverdueFeesWidget,
  "transport.routeSummary": TransportRouteSummaryWidget,
  "kitchen.todaySummary": KitchenTodaySummaryWidget,
  "sports.summary": SportsSummaryWidget,
  "ict.featureFlags": IctFeatureFlagsWidget,
  "ict.activeUsers": IctActiveUsersWidget,
  "ict.supportTickets": IctSupportTicketsWidget,
  // deputy widgets — reuse admin ones
  "deputy.attendanceToday": AdminAttendanceTodayWidget,
  "deputy.disciplineToday": DisciplineRecentIncidentsWidget,
  "deputy.staffOnLeave": AdminPendingActionsWidget,
};

function Dashboard() {
  const { fullName, roles } = useAuth();
  const appRoles = roles as AppRole[];
  const layout = buildDashboard(appRoles);
  const firstName = fullName?.split(" ")[0] || "there";
  const today = new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" });

  const has = (r: AppRole) => appRoles.includes(r);
  const hasAny = (rs: AppRole[]) => rs.some((r) => appRoles.includes(r));

  // ── Admin dashboard ──────────────────────────────────────────────────────
  if (layout.greeting === "admin") {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <DashHeader greeting="Welcome back" firstName={firstName} roles={roles} today={today} />
        <AdminKpisWidget />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <AdminAttendanceTodayWidget />
          <AdminPendingActionsWidget />
          <AdminNewStudentsThisWeekWidget />
          <AdminOverdueFeesWidget />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2"><AdminStudentRiskWidget /></div>
          <AdminSchoolStructureWidget />
        </div>
        <AdminStudentsPerClassWidget />
        <QuickLinks links={[
          { label: "Analytics", url: "/analytics", icon: BarChart3 },
          { label: "Students", url: "/students", icon: Users },
          { label: "Attendance", url: "/attendance", icon: ClipboardList },
          { label: "Finance", url: "/finance/fees", icon: Wallet },
          { label: "Announcements", url: "/announcements", icon: Bell },
        ]} />
      </div>
    );
  }

  // ── Teacher / class teacher / HOD / academic master ──────────────────────
  if (hasAny(["teacher", "class_teacher", "subject_teacher", "hod", "academic_master"])) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <DashHeader greeting="Welcome back" firstName={firstName} roles={roles} today={today} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <TeacherMyClassesWidget />
          <TeacherTodayTimetableWidget />
          <TeacherPendingMarksWidget />
        </div>
        {has("class_teacher") && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DisciplineRecentIncidentsWidget />
            <AdminAttendanceTodayWidget />
          </div>
        )}
        {has("hod") && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <AdminStudentsPerClassWidget />
            <AdminStudentRiskWidget />
          </div>
        )}
        <QuickLinks links={[
          { label: "My Subjects", url: "/academics/subjects", icon: BookOpen },
          { label: "Mark Entry", url: "/academics/marks", icon: ClipboardList },
          { label: "Exams", url: "/academics/exams", icon: Calendar },
          { label: "Results", url: "/academics/results", icon: TrendingUp },
          { label: "Timetable", url: "/timetable", icon: Calendar },
          { label: "Classroom", url: "/classroom", icon: GraduationCap },
        ]} />
      </div>
    );
  }

  // ── Exams admin ──────────────────────────────────────────────────────────
  if (hasAny(["exams_admin", "exams_user"])) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <DashHeader greeting="Welcome" firstName={firstName} roles={roles} today={today} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <TeacherPendingMarksWidget />
          <AdminStudentsPerClassWidget />
          <AdminStudentRiskWidget />
        </div>
        <QuickLinks links={[
          { label: "Exams", url: "/academics/exams", icon: Calendar },
          { label: "Mark Entry", url: "/academics/marks", icon: ClipboardList },
          { label: "Results", url: "/academics/results", icon: TrendingUp },
          { label: "Report Cards", url: "/academics/report-cards", icon: BookOpen },
          { label: "Grading Scale", url: "/admin/grading", icon: GraduationCap },
          { label: "Analytics", url: "/analytics", icon: BarChart3 },
        ]} />
      </div>
    );
  }

  // ── Student ──────────────────────────────────────────────────────────────
  if (has("student")) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <DashHeader greeting="Hi" firstName={firstName} roles={roles} today={today} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StudentSummaryWidget />
          <StudentUpcomingExamsWidget />
          <StudentRecentResultsWidget />
        </div>
        <QuickLinks links={[
          { label: "My Portal", url: "/portal", icon: GraduationCap },
          { label: "Results", url: "/portal/student?tab=results", icon: TrendingUp },
          { label: "Report Cards", url: "/portal/student?tab=reportcards", icon: BookOpen },
          { label: "Timetable", url: "/portal/student?tab=timetable", icon: Calendar },
          { label: "Library", url: "/library", icon: Library },
          { label: "Live Classes", url: "/live", icon: Users },
        ]} />
      </div>
    );
  }

  // ── Parent ───────────────────────────────────────────────────────────────
  if (has("parent")) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <DashHeader greeting="Welcome" firstName={firstName} roles={roles} today={today} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ParentChildrenWidget />
          <ParentOutstandingFeesWidget />
        </div>
        <QuickLinks links={[
          { label: "Parent Portal", url: "/portal", icon: Users },
          { label: "Attendance", url: "/attendance", icon: ClipboardList },
          { label: "Fees", url: "/finance/invoices", icon: Wallet },
          { label: "Timetable", url: "/timetable", icon: Calendar },
          { label: "Announcements", url: "/announcements", icon: Bell },
        ]} />
      </div>
    );
  }

  // ── Finance / Bursar ─────────────────────────────────────────────────────
  if (hasAny(["bursar", "finance_admin", "finance_user"])) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <DashHeader greeting="Welcome" firstName={firstName} roles={roles} today={today} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FinanceCollectionsWidget />
          <FinanceOutstandingWidget />
          <AdminOverdueFeesWidget />
          <AdminNewStudentsThisWeekWidget />
        </div>
        <QuickLinks links={[
          { label: "Fee Structures", url: "/finance/fees", icon: Wallet },
          { label: "Invoices", url: "/finance/invoices", icon: ClipboardList },
          { label: "Payments", url: "/finance/payments", icon: TrendingUp },
          { label: "Bulk Generate", url: "/finance/generate", icon: Users },
          { label: "Analytics", url: "/analytics", icon: BarChart3 },
        ]} />
      </div>
    );
  }

  // ── Library ──────────────────────────────────────────────────────────────
  if (hasAny(["librarian", "library_admin", "library_user"])) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <DashHeader greeting="Welcome" firstName={firstName} roles={roles} today={today} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <LibraryActiveLoansWidget />
          <AdminStudentsPerClassWidget />
        </div>
        <QuickLinks links={[
          { label: "Library", url: "/library", icon: Library },
          { label: "Students", url: "/students", icon: Users },
          { label: "Analytics", url: "/analytics", icon: BarChart3 },
        ]} />
      </div>
    );
  }

  // ── Kitchen ──────────────────────────────────────────────────────────────
  if (hasAny(["kitchen_admin", "kitchen_user"])) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <DashHeader greeting="Welcome" firstName={firstName} roles={roles} today={today} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <KitchenTodaySummaryWidget />
          <AdminAttendanceTodayWidget />
        </div>
        <QuickLinks links={[
          { label: "Kitchen", url: "/kitchen", icon: Utensils },
          { label: "Analytics", url: "/analytics", icon: BarChart3 },
          { label: "Announcements", url: "/announcements", icon: Bell },
        ]} />
      </div>
    );
  }

  // ── Store / Inventory ────────────────────────────────────────────────────
  if (hasAny(["store_admin", "store_user"])) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <DashHeader greeting="Welcome" firstName={firstName} roles={roles} today={today} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <AdminPendingActionsWidget />
          <AdminOverdueFeesWidget />
        </div>
        <QuickLinks links={[
          { label: "Inventory", url: "/inventory", icon: Package },
          { label: "Analytics", url: "/analytics", icon: BarChart3 },
          { label: "Announcements", url: "/announcements", icon: Bell },
        ]} />
      </div>
    );
  }

  // ── Transport ────────────────────────────────────────────────────────────
  if (hasAny(["transport_admin", "transport_officer"])) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <DashHeader greeting="Welcome" firstName={firstName} roles={roles} today={today} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TransportRouteSummaryWidget />
          <AdminAttendanceTodayWidget />
        </div>
        <QuickLinks links={[
          { label: "Transport", url: "/transport", icon: Bus },
          { label: "Students", url: "/students", icon: Users },
          { label: "Analytics", url: "/analytics", icon: BarChart3 },
        ]} />
      </div>
    );
  }

  // ── Clinic / Nurse / Matron ───────────────────────────────────────────────
  if (hasAny(["nurse", "clinic_admin", "clinic_user", "matron"])) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <DashHeader greeting="Welcome" firstName={firstName} roles={roles} today={today} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ClinicTodayVisitsWidget />
          {has("matron") && <BoardingOccupancyWidget />}
          <AdminAttendanceTodayWidget />
        </div>
        <QuickLinks links={[
          { label: "Medical Records", url: "/clinic", icon: Stethoscope },
          ...(has("matron") ? [{ label: "Boarding", url: "/boarding", icon: Users }] : []),
          { label: "Students", url: "/students", icon: Users },
          { label: "Announcements", url: "/announcements", icon: Bell },
        ]} />
      </div>
    );
  }

  // ── Discipline / Guidance ─────────────────────────────────────────────────
  if (hasAny(["discipline_admin", "guidance_admin"])) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <DashHeader greeting="Welcome" firstName={firstName} roles={roles} today={today} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DisciplineRecentIncidentsWidget />
          <AdminStudentRiskWidget />
        </div>
        <QuickLinks links={[
          { label: "Incidents", url: "/discipline", icon: ClipboardList },
          { label: "Students", url: "/students", icon: Users },
          { label: "Analytics", url: "/analytics", icon: BarChart3 },
          { label: "Announcements", url: "/announcements", icon: Bell },
        ]} />
      </div>
    );
  }

  // ── Security ─────────────────────────────────────────────────────────────
  if (hasAny(["security_admin", "security_user"])) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <DashHeader greeting="Welcome" firstName={firstName} roles={roles} today={today} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SecurityRecentLogsWidget />
          <AdminAttendanceTodayWidget />
        </div>
        <QuickLinks links={[
          { label: "Gate Records", url: "/security", icon: ShieldCheck },
          { label: "Verify ID", url: "/ids/verify", icon: GraduationCap },
          { label: "Bulk IDs", url: "/ids/bulk", icon: Users },
        ]} />
      </div>
    );
  }

  // ── Sports ────────────────────────────────────────────────────────────────
  if (hasAny(["sports_admin", "sports_user", "sports"])) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <DashHeader greeting="Welcome" firstName={firstName} roles={roles} today={today} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SportsSummaryWidget />
          <AdminStudentsPerClassWidget />
        </div>
        <QuickLinks links={[
          { label: "Co-curricular", url: "/cocurricular", icon: Trophy },
          { label: "Students", url: "/students", icon: Users },
          { label: "Analytics", url: "/analytics", icon: BarChart3 },
        ]} />
      </div>
    );
  }

  // ── Boarding ──────────────────────────────────────────────────────────────
  if (hasAny(["boarding_admin", "boarding_user", "boarding"])) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <DashHeader greeting="Welcome" firstName={firstName} roles={roles} today={today} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <BoardingOccupancyWidget />
          <AdminAttendanceTodayWidget />
        </div>
        <QuickLinks links={[
          { label: "Boarding", url: "/boarding", icon: Users },
          { label: "Students", url: "/students", icon: Users },
          { label: "Analytics", url: "/analytics", icon: BarChart3 },
        ]} />
      </div>
    );
  }

  // ── ICT admin ─────────────────────────────────────────────────────────────
  if (has("ict_admin")) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <DashHeader greeting="Welcome" firstName={firstName} roles={roles} today={today} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <IctFeatureFlagsWidget />
          <IctActiveUsersWidget />
          <IctSupportTicketsWidget />
        </div>
        <QuickLinks links={[
          { label: "ICT Overview", url: "/admin/ict", icon: ShieldCheck },
          { label: "Users", url: "/admin/users", icon: Users },
          { label: "Roles", url: "/admin/roles", icon: ClipboardList },
          { label: "Feature Modules", url: "/admin/features", icon: TrendingUp },
          { label: "Support Tickets", url: "/admin/support", icon: Bell },
          { label: "Settings", url: "/admin/settings", icon: GraduationCap },
        ]} />
      </div>
    );
  }

  // ── Admission officer ────────────────────────────────────────────────────
  if (has("admission_officer")) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <DashHeader greeting="Welcome" firstName={firstName} roles={roles} today={today} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <AdminStudentsPerClassWidget />
          <AdminNewStudentsThisWeekWidget />
        </div>
        <QuickLinks links={[
          { label: "Students", url: "/students", icon: Users },
          { label: "CSV Import", url: "/admin/import", icon: ClipboardList },
          { label: "Documents", url: "/admin/student-documents", icon: BookOpen },
        ]} />
      </div>
    );
  }

  // ── Platform ──────────────────────────────────────────────────────────────
  if (layout.greeting === "platform") {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <DashHeader greeting="Platform Console" firstName={firstName} roles={roles} today={today} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PlatformTenantsWidget />
        </div>
      </div>
    );
  }

  // ── Fallback: multi-role with generic widgets ────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <DashHeader greeting="Welcome" firstName={firstName} roles={roles} today={today} />
      {layout.widgets.length === 0 ? (
        <div className="text-sm text-muted-foreground border rounded-lg p-8 text-center">
          Your dashboard is empty. Contact an administrator if you expect widgets here.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {layout.widgets.map((key) => {
            const Widget = WIDGETS[key];
            return Widget ? <Widget key={key} /> : null;
          })}
        </div>
      )}
    </div>
  );
}

// ─── Shared header ────────────────────────────────────────────────────────────
function DashHeader({ greeting, firstName, roles, today }: {
  greeting: string; firstName: string; roles: string[]; today: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold">{greeting}, {firstName} 👋</h1>
        <p className="text-muted-foreground text-sm mt-1">{today}</p>
      </div>
      <div className="hidden sm:flex flex-wrap gap-1 justify-end">
        {roles.map((r) => (
          <Badge key={r} variant="secondary" className="text-xs capitalize">{r.replace(/_/g, " ")}</Badge>
        ))}
      </div>
    </div>
  );
}

// ─── Quick link grid ──────────────────────────────────────────────────────────
function QuickLinks({ links }: { links: { label: string; url: string; icon: React.ComponentType<any> }[] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Quick Access</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {links.map((l) => {
          const Icon = l.icon;
          return (
            <Link key={l.url} to={l.url}>
              <Card className="hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer group">
                <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
                  <Icon className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-medium leading-tight">{l.label}</span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
