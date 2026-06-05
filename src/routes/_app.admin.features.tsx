import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import {
  Library, Home, ChefHat, Bus, Stethoscope, Shield, Wallet, AlertTriangle,
  CalendarDays, Megaphone, QrCode, Award, BookOpen, Video, MessageSquare,
  BarChart3, Lock,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin/features")({ component: FeaturesPage });

const MODULES = [
  { key: "security",       icon: Shield,        name: "Security",       desc: "Gate passes and visitor management" },
  { key: "kitchen",        icon: ChefHat,       name: "Kitchen",        desc: "Meal plans and pantry stock alerts" },
  { key: "boarding",       icon: Home,          name: "Boarding",       desc: "Dormitory assignments and matron management" },
  { key: "transport",      icon: Bus,           name: "Transport",      desc: "Bus routes and student pickup tracking" },
  { key: "library",        icon: Library,       name: "Library",        desc: "Book catalogue, loans, and overdue tracking" },
  { key: "clinic",         icon: Stethoscope,   name: "Clinic",         desc: "Medical visit records and health tracking" },
  { key: "analytics",      icon: BarChart3,     name: "Analytics",      desc: "Dashboards, KPIs, and trend reports" },
  { key: "communications", icon: MessageSquare, name: "Communications", desc: "SMS and email blast tools" },
  { key: "live_classes",   icon: Video,         name: "Live Classes",   desc: "Live video sessions via Jitsi" },
  { key: "classroom",      icon: BookOpen,      name: "Classroom",      desc: "Classroom feed, assignments, and submissions" },
  { key: "timetable",      icon: CalendarDays,  name: "Timetable",      desc: "Class schedules and auto-generation" },
  { key: "ids",            icon: QrCode,        name: "IDs",            desc: "ID card printing and QR verification" },
  { key: "finance",        icon: Wallet,        name: "Finance",        desc: "Fee structures, invoices, and payments" },
  { key: "discipline",     icon: AlertTriangle, name: "Discipline",     desc: "Incident records and behavior tracking" },
  { key: "announcements",  icon: Megaphone,     name: "Announcements",  desc: "School-wide announcements and pinned notices" },
  { key: "leaving_certs",  icon: Award,         name: "Leaving Certs",  desc: "Student leaving certificates" },
] as const;

const TOGGLE_ROLES = new Set(["super_admin", "principal", "deputy_principal"]);

function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function FeaturesPage() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const canToggle = (roles ?? []).some((r) => TOGGLE_ROLES.has(r as string));

  const { data, isLoading } = useQuery({
    queryKey: ["school_modules"],
    queryFn: async () => {
      const { data: schoolId } = await supabase.rpc("my_school_id");
      if (!schoolId) return new Map<string, boolean>();
      const { data, error } = await supabase
        .from("school_features")
        .select("feature, enabled")
        .eq("school_id", schoolId as any);
      if (error) throw error;
      const map = new Map<string, boolean>();
      for (const row of (data ?? []) as any[]) {
        if (row.feature) map.set(row.feature, row.enabled);
      }
      return map;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const { data: schoolId } = await supabase.rpc("my_school_id");
      if (!schoolId) throw new Error("No school context");
      const { error } = await supabase
        .from("school_features")
        .upsert(
          { school_id: schoolId as any, feature: key, enabled } as any,
          { onConflict: "school_id,feature" } as any,
        );
      if (error) throw error;
      return enabled;
    },
    onMutate: async ({ key, enabled }) => {
      await qc.cancelQueries({ queryKey: ["school_modules"] });
      const prev = qc.getQueryData<Map<string, boolean>>(["school_modules"]);
      const next = new Map(prev ?? []);
      next.set(key, enabled);
      qc.setQueryData(["school_modules"], next);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["school_modules"], ctx.prev);
      toast.error("Failed to save");
    },
    onSuccess: (enabled) => toast.success(enabled ? "Module enabled" : "Module disabled"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["school_modules"] }),
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">School Modules</h1>
        <p className="text-muted-foreground">Enable or disable modules for your school.</p>
      </div>
      <TooltipProvider delayDuration={200}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading
            ? Array.from({ length: 12 }).map((_, i) => (
                <Card key={i}><CardContent className="pt-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
              ))
            : MODULES.map((m) => {
                const enabled = data?.get(m.key) ?? false;
                const Icon = m.icon;
                const switchEl = (
                  <Switch
                    checked={enabled}
                    disabled={!canToggle}
                    onCheckedChange={(v) => canToggle && toggleMutation.mutate({ key: m.key, enabled: v })}
                  />
                );
                return (
                  <Card key={m.key} className={enabled ? "" : "opacity-60"}>
                    <CardContent className="pt-6 flex items-start gap-3">
                      <Icon className={`w-8 h-8 shrink-0 ${enabled ? "text-primary" : "text-muted-foreground"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold">{titleCase(m.name)}</div>
                        <div className="text-sm text-muted-foreground">{m.desc}</div>
                      </div>
                      {canToggle ? switchEl : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1">
                              <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                              {switchEl}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Contact your principal to enable this module</TooltipContent>
                        </Tooltip>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
        </div>
      </TooltipProvider>
    </div>
  );
}
