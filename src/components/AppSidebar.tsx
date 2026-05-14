import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, UserCog,
  Settings, Activity, LogOut, Sun, Moon, ChevronDown,
  ClipboardCheck, AlertTriangle, Library, Home, Bus, Stethoscope,
  Megaphone, CalendarDays, Wallet, Receipt, FileText, BookText, Award,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const mainItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Students", url: "/students", icon: GraduationCap },
  { title: "Staff", url: "/staff", icon: UserCog },
  { title: "Classes", url: "/classes", icon: BookOpen },
  { title: "Announcements", url: "/announcements", icon: Megaphone },
];

const academicItems = [
  { title: "Subjects", url: "/academics/subjects", icon: BookText },
  { title: "Exams", url: "/academics/exams", icon: FileText },
  { title: "Results", url: "/academics/results", icon: Award },
  { title: "Timetable", url: "/timetable", icon: CalendarDays },
];

const operationsItems = [
  { title: "Attendance", url: "/attendance", icon: ClipboardCheck },
  { title: "Discipline", url: "/discipline", icon: AlertTriangle },
  { title: "Library", url: "/library", icon: Library },
  { title: "Boarding", url: "/boarding", icon: Home },
  { title: "Transport", url: "/transport", icon: Bus },
  { title: "Clinic", url: "/clinic", icon: Stethoscope },
];

const financeItems = [
  { title: "Fee Structures", url: "/finance/fees", icon: Wallet },
  { title: "Invoices", url: "/finance/invoices", icon: Receipt },
  { title: "Payments", url: "/finance/payments", icon: Receipt },
];

const adminItems = [
  { title: "User Roles", url: "/admin/roles", icon: Users },
  { title: "Activity Log", url: "/admin/activity", icon: Activity },
  { title: "Settings", url: "/admin/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { isAdmin, fullName, user, signOut, roles } = useAuth();
  const { theme, toggle } = useTheme();
  const path = useRouterState({ select: (r) => r.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center shrink-0">
            <GraduationCap className="w-4 h-4" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className="font-bold text-sm truncate">Greenfield Academy</div>
              <div className="text-[10px] text-sidebar-foreground/60 truncate">School ERP</div>
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
            {academicItems.map((item) => (
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
            {operationsItems.map((item) => (
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
            {financeItems.map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild isActive={path === item.url}>
                  <Link to={item.url}><item.icon className="w-4 h-4" /><span>{item.title}</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu></SidebarGroupContent>
        </SidebarGroup>

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
