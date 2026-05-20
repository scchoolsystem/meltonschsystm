import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, UserCog,
  Settings, Activity, LogOut, Sun, Moon, ChevronDown,
  ClipboardCheck, AlertTriangle, Library, Home, Bus, Stethoscope,
  Megaphone, CalendarDays, Wallet, Receipt, FileText, BookText, Award, User, Users2, Link2,
  QrCode, ScanLine,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useTenant } from "@/hooks/use-tenant";
import { useFeatureGate, type FeatureKey } from "@/hooks/use-feature-gate";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type NavItem = { title: string; url: string; icon: any; feature?: FeatureKey };

const mainItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Analytics", url: "/analytics", icon: Activity },
  { title: "Students", url: "/students", icon: GraduationCap },
  { title: "Staff", url: "/staff", icon: UserCog },
  { title: "Classes", url: "/classes", icon: BookOpen },
  { title: "Announcements", url: "/announcements", icon: Megaphone },
];

const academicItems: NavItem[] = [
  { title: "Subjects", url: "/academics/subjects", icon: BookText },
  { title: "Exams", url: "/academics/exams", icon: FileText },
  { title: "Mark Entry", url: "/academics/marks", icon: ClipboardCheck },
  { title: "Results", url: "/academics/results", icon: Award },
  { title: "Report Cards", url: "/academics/report-cards", icon: FileText },
  { title: "Timetable", url: "/timetable", icon: CalendarDays, feature: "timetable" },
  { title: "Auto-generate", url: "/timetable/generate", icon: CalendarDays, feature: "timetable" },
];

const operationsItems: NavItem[] = [
  { title: "Attendance", url: "/attendance", icon: ClipboardCheck },
  { title: "Discipline", url: "/discipline", icon: AlertTriangle, feature: "discipline" },
  { title: "Library", url: "/library", icon: Library, feature: "library" },
  { title: "Boarding", url: "/boarding", icon: Home, feature: "boarding" },
  { title: "Kitchen", url: "/kitchen", icon: BookOpen, feature: "kitchen" },
  { title: "Transport", url: "/transport", icon: Bus, feature: "transport" },
  { title: "Clinic", url: "/clinic", icon: Stethoscope, feature: "clinic" },
  { title: "Security", url: "/security", icon: AlertTriangle, feature: "security" },
];

const financeItems: NavItem[] = [
  { title: "Fee Structures", url: "/finance/fees", icon: Wallet, feature: "finance" },
  { title: "Invoices", url: "/finance/invoices", icon: Receipt, feature: "finance" },
  { title: "Bulk Generate", url: "/finance/generate", icon: Receipt, feature: "finance" },
  { title: "Payments", url: "/finance/payments", icon: Receipt, feature: "finance" },
];

const idItems: NavItem[] = [
  { title: "Bulk Print Cards", url: "/ids/bulk", icon: QrCode, feature: "id_cards" },
  { title: "Verify ID", url: "/ids/verify", icon: ScanLine, feature: "id_cards" },
];

const adminItems = [
  { title: "School Brain", url: "/admin/brain", icon: Activity },
  { title: "Users & Credentials", url: "/admin/users", icon: Users },
  { title: "Portal Links", url: "/admin/links", icon: Link2 },
  { title: "User Roles", url: "/admin/roles", icon: Users },
  { title: "Field Permissions", url: "/admin/permissions", icon: Settings },
  { title: "CSV Import", url: "/admin/import", icon: FileText },
  { title: "Activity Log", url: "/admin/activity", icon: Activity },
  { title: "Lifecycle Events", url: "/admin/lifecycle", icon: Activity },
  { title: "Field Edit Audit", url: "/admin/field-edits", icon: Activity },
  { title: "Override Log", url: "/admin/overrides", icon: Activity },
  { title: "Settings", url: "/admin/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { isAdmin, fullName, user, signOut, roles, hasRole } = useAuth();
  const isStudent = hasRole("student");
  const isParent = hasRole("parent");
  const { theme, toggle } = useTheme();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { school } = useTenant();
  const { isEnabled } = useFeatureGate();
  const filt = (items: NavItem[]) => items.filter(i => !i.feature || isEnabled(i.feature));
  const settings = school
    ? { school_name: school.name, motto: school.motto, logo_url: school.logo_url }
    : null;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center shrink-0 overflow-hidden">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <GraduationCap className="w-4 h-4" />
            )}
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className="font-bold text-sm truncate">{settings?.school_name ?? "School ERP"}</div>
              <div className="text-[10px] text-sidebar-foreground/60 truncate">{settings?.motto ?? "School ERP"}</div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={path === item.url}>
                    <Link to={item.url}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Academics</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>
            {filt(academicItems).map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild isActive={path === item.url}>
                  <Link to={item.url}><item.icon className="w-4 h-4" /><span>{item.title}</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu></SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>
            {filt(operationsItems).map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild isActive={path === item.url}>
                  <Link to={item.url}><item.icon className="w-4 h-4" /><span>{item.title}</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu></SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Finance</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>
            {filt(financeItems).map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild isActive={path === item.url}>
                  <Link to={item.url}><item.icon className="w-4 h-4" /><span>{item.title}</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu></SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Digital IDs</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>
            {filt(idItems).map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild isActive={path === item.url}>
                  <Link to={item.url}><item.icon className="w-4 h-4" /><span>{item.title}</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu></SidebarGroupContent>
        </SidebarGroup>

        {(isStudent || isParent) && (
          <SidebarGroup>
            <SidebarGroupLabel>My Portal</SidebarGroupLabel>
            <SidebarGroupContent><SidebarMenu>
              {isStudent && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={path === "/portal/student"}>
                    <Link to="/portal/student"><User className="w-4 h-4" /><span>Student Portal</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {isParent && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={path === "/portal/parent"}>
                    <Link to="/portal/parent"><Users2 className="w-4 h-4" /><span>Parent Portal</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu></SidebarGroupContent>
          </SidebarGroup>
        )}

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={path === item.url}>
                      <Link to={item.url}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="p-2 space-y-1">
          <Button variant="ghost" size="sm" onClick={toggle} className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {!collapsed && <span className="ml-2">{theme === "dark" ? "Light" : "Dark"} mode</span>}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent">
                <Avatar className="w-6 h-6">
                  <AvatarFallback className="text-[10px] bg-sidebar-primary text-sidebar-primary-foreground">
                    {(fullName || user?.email || "U").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <>
                    <span className="ml-2 truncate text-xs">{fullName || user?.email}</span>
                    <ChevronDown className="ml-auto w-3 h-3" />
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="font-medium">{fullName || "User"}</div>
                <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {roles.length ? roles.join(", ") : "no roles"}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
