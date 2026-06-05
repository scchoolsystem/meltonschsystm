import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { buildDashboard, type DashboardWidgetKey } from "@/core/rbac/dashboard";
import type { AppRole } from "@/core/rbac";
import {
  AdminKpisWidget,
  AdminStudentsPerClassWidget,
  AdminSchoolStructureWidget,
  TeacherMyClassesWidget,
  TeacherTodayTimetableWidget,
  TeacherPendingMarksWidget,
  StudentSummaryWidget,
  StudentUpcomingExamsWidget,
  StudentRecentResultsWidget,
  ParentChildrenWidget,
  ParentOutstandingFeesWidget,
  FinanceCollectionsWidget,
  FinanceOutstandingWidget,
  ClinicTodayVisitsWidget,
  DisciplineRecentIncidentsWidget,
  LibraryActiveLoansWidget,
  BoardingOccupancyWidget,
  SecurityRecentLogsWidget,
  PlatformTenantsWidget,
} from "@/components/dashboard/widgets";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

const GREETINGS: Record<string, string> = {
  admin: "Welcome back",
  teacher: "Welcome back",
  student: "Hi there",
  parent: "Welcome",
  staff: "Welcome",
  platform: "Platform Console",
};

const WIDGETS: Record<DashboardWidgetKey, React.ComponentType> = {
  "admin.kpis": AdminKpisWidget,
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
};

function Dashboard() {
  const { fullName, roles } = useAuth();
  const layout = buildDashboard(roles as AppRole[]);
  const greeting = GREETINGS[layout.greeting] ?? "Welcome";

  // Admin layout keeps the legacy grid (KPIs row + 2/3 + 1/3 charts)
  if (layout.greeting === "admin") {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <Header greeting={greeting} fullName={fullName} roles={roles} />
        <AdminKpisWidget />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <AdminStudentsPerClassWidget />
          <AdminSchoolStructureWidget />
        </div>
      </div>
    );
  }

  // Role-tailored layouts: simple responsive grid of cards.
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <Header greeting={greeting} fullName={fullName} roles={roles} />
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

function Header({ greeting, fullName, roles }: { greeting: string; fullName?: string | null; roles: string[] }) {
  return (
    <div>
      <h1 className="text-3xl font-bold">{greeting}, {fullName?.split(" ")[0] || "there"}</h1>
      <p className="text-muted-foreground text-sm mt-1">
        Signed in as <span className="font-medium text-foreground">{roles.join(", ") || "user"}</span>
      </p>
    </div>
  );
}
