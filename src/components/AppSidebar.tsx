import { Link, useRouterState } from "@tanstack/react-router";
import {
  GraduationCap, LogOut, Sun, Moon, ChevronDown,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useTenant } from "@/hooks/use-tenant";
import { useFeatureGate } from "@/hooks/use-feature-gate";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { buildNavigation } from "@/lib/role-experience";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { fullName, user, signOut, roles } = useAuth();
  const { theme, toggle } = useTheme();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { school } = useTenant();
  const { isEnabled } = useFeatureGate();

  const groups = buildNavigation(roles as string[]).map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.feature || isEnabled(i.feature)),
  })).filter((g) => g.items.length);

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
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.url + item.title}>
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
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="p-2 space-y-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {!collapsed && <span className="ml-2">{theme === "dark" ? "Light" : "Dark"} mode</span>}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent"
              >
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
