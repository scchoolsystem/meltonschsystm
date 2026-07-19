import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Library, Home, ChefHat, Bus, Stethoscope, Shield, Wallet, AlertTriangle, CalendarDays, Megaphone, QrCode, Award, BookOpen, Video, MessageSquare, BarChart3, Lock, Users, GraduationCap } from "lucide-react";

export const Route = createFileRoute("/_app/admin/features")({ component: FeaturesPage });

const MODULES = [
  { key: "timetable",      icon: CalendarDays,  name: "Timetable",                desc: "Class schedules and auto-generation" },
  { key: "attendance",     icon: Users,         name: "Attendance",               desc: "Daily attendance tracking" },
  { key: "academics_subjects",     icon: GraduationCap, name: "Subjects",             desc: "Subject list and teacher assignments" },
  { key: "academics_exams",        icon: GraduationCap, name: "Exams",                desc: "Exam creation and scheduling" },
  { key: "academics_marks",        icon: GraduationCap, name: "Marks Entry",          desc: "Entering marks and results log" },
  { key: "academics_remarks",      icon: GraduationCap, name: "Remark Templates",     desc: "Reusable remark wording for report cards" },
  { key: "academics_results",      icon: GraduationCap, name: "Results",              desc: "Results dashboard and analysis" },
  { key: "academics_report_cards", icon: GraduationCap, name: "Report Cards",         desc: "Generating and printing report cards" },
  { key: "academics_oversight",    icon: GraduationCap, name: "Exam Oversight",       desc: "Cross-class exam completion tracking" },
  { key: "discipline",     icon: AlertTriangle, name: "Discipline",               desc: "Incident records and behavior tracking" },
  { key: "announcements",  icon: Megaphone,     name: "Announcements",            desc: "School-wide announcements and pinned notices" },
  { key: "portals",        icon: Users,         name: "Parent / Student Portals", desc: "Parents and students can log in and view their portal" },
  { key: "finance",        icon: Wallet,        name: "Finance & Billing",        desc: "Fee structures, invoices, and payments" },
  { key: "ids",            icon: QrCode,        name: "Digital IDs",              desc: "ID card printing and QR verification" },
  { key: "leaving_certs",  icon: Award,         name: "Leaving Certificates",     desc: "Student leaving certificates" },
  { key: "boarding",       icon: Home,          name: "Boarding",                 desc: "Dormitory assignments and matron management" },
  { key: "kitchen",        icon: ChefHat,       name: "Kitchen",                  desc: "Meal plans and pantry stock alerts" },
  { key: "library",        icon: Library,       name: "Library",                  desc: "Book catalogue, loans, and overdue tracking" },
  { key: "clinic",         icon: Stethoscope,   name: "Clinic",                   desc: "Medical visit records and health tracking" },
  { key: "transport",      icon: Bus,           name: "Transport",                desc: "Bus routes and student pickup tracking" },
  { key: "security",       icon: Shield,        name: "Security",                 desc: "Gate passes and visitor management" },
  { key: "classroom",      icon: BookOpen,      name: "Classroom",                desc: "Classroom feed, assignments, and submissions" },
  { key: "live_classes",   icon: Video,         name: "Live Classes",             desc: "Live video sessions via Jitsi" },
  { key: "communications", icon: MessageSquare, name: "Communications",           desc: "SMS and email blast tools" },
  { key: "analytics",      icon: BarChart3,     name: "Analytics",                desc: "Dashboards, KPIs, and trend reports" },
] as const;

const CATEGORIES = [
  { label: "Core Academic",   keys: ["timetable","attendance","academics_subjects","academics_exams","academics_marks","academics_remarks","academics_results","academics_report_cards","academics_oversight","discipline","announcements","portals"] },
  { label: "Finance & Admin", keys: ["finance","ids","leaving_certs"] },
  { label: "Facilities",      keys: ["boarding","kitchen","library","clinic","transport","security"] },
  { label: "Digital",         keys: ["classroom","live_classes","communications","analytics"] },
] as const;

const MODULE_MAP = Object.fromEntries(MODULES.map((m) => [m.key, m]));
const TOGGLE_ROLES = new Set(["super_admin","principal","deputy_principal"]);

function FeaturesPage() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const canToggle = (roles ?? []).some((r) => TOGGLE_ROLES.has(r as string));

  const { data, isLoading } = useQuery({
    queryKey: ["school_modules"],
    queryFn: async () => {
      const { data: schoolId } = await supabase.rpc("my_school_id");
      if (!schoolId) return {} as Record<string, { enabled: boolean; platform_enabled: boolean }>;
      const { data, error } = await (supabase as any)
        .from("school_features")
        .select("feature_key,enabled,platform_enabled")
        .eq("school_id", schoolId);
      if (error) throw error;
      const map: Record<string, { enabled: boolean; platform_enabled: boolean }> = {};
      for (const row of (data ?? []) as any[]) {
        map[row.feature_key] = { enabled: row.enabled ?? true, platform_enabled: row.platform_enabled ?? true };
      }
      return map;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const { data: schoolId } = await supabase.rpc("my_school_id");
      if (!schoolId) throw new Error("No school context");
      const { error } = await (supabase as any).from("school_features")
        .upsert({ school_id: schoolId, feature_key: key, enabled } as any, { onConflict: "school_id,feature_key" } as any);
      if (error) throw error;
      return { key, enabled };
    },
    onMutate: async ({ key, enabled }) => {
      await qc.cancelQueries({ queryKey: ["school_modules"] });
      const prev = qc.getQueryData<Record<string, any>>(["school_modules"]);
      qc.setQueryData(["school_modules"], { ...prev, [key]: { ...(prev?.[key] ?? {}), enabled } });
      return { prev };
    },
    onError: (_e: any, _v: any, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(["school_modules"], ctx.prev);
      toast.error("Could not save — please try again");
    },
    onSuccess: ({ key, enabled }: { key: string; enabled: boolean }) => {
      const name = MODULE_MAP[key]?.name ?? key;
      toast.success(enabled ? `${name} enabled` : `${name} disabled`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["school_modules"] }),
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">School Modules</h1>
        <p className="text-muted-foreground text-sm">Turn modules on or off. Modules marked "Not in your plan" are controlled by your platform provider.</p>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {CATEGORIES.map((cat) => (
            <div key={cat.label}>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{cat.label}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {cat.keys.map((key) => {
                  const mod = MODULE_MAP[key];
                  if (!mod) return null;
                  const Icon = mod.icon;
                  const featureData = data?.[key];
                  const platformOn = featureData?.platform_enabled ?? true;
                  const schoolOn   = featureData?.enabled ?? true;
                  const locked     = !platformOn;
                  return (
                    <Card key={key} className={`transition-opacity ${locked || !schoolOn ? "opacity-60" : ""}`}>
                      <CardContent className="pt-5 flex items-start gap-3">
                        <Icon className={`w-7 h-7 shrink-0 mt-0.5 ${schoolOn && !locked ? "text-primary" : "text-muted-foreground"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{mod.name}</span>
                            {locked ? (
                              <Badge variant="secondary" className="text-[10px] gap-1"><Lock className="w-2.5 h-2.5" />Not in your plan</Badge>
                            ) : schoolOn ? (
                              <Badge variant="default" className="text-[10px]">Active</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">Inactive</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{mod.desc}</p>
                        </div>
                        {locked ? (
                          <Lock className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                        ) : (
                          <Switch checked={schoolOn} disabled={!canToggle}
                            onCheckedChange={(v) => canToggle && toggleMutation.mutate({ key, enabled: v })} />
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
