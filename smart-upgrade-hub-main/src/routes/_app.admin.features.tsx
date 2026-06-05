import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Library, Home, ChefHat, Bus, Stethoscope, Shield, Wallet, AlertTriangle,
  CalendarDays, Megaphone, QrCode, Award, BookOpen, Video, MessageSquare,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin/features")({
  component: FeaturesPage,
});

const MODULES = [
  { key: "library",        icon: Library,          name: "Library",          desc: "Book catalogue, loans, and overdue tracking" },
  { key: "boarding",       icon: Home,             name: "Boarding",         desc: "Dormitory assignments and matron management" },
  { key: "kitchen",        icon: ChefHat,          name: "Kitchen",          desc: "Meal plans and pantry stock alerts" },
  { key: "transport",      icon: Bus,              name: "Transport",        desc: "Bus routes and student pickup tracking" },
  { key: "clinic",         icon: Stethoscope,      name: "Clinic",           desc: "Medical visit records and health tracking" },
  { key: "security",       icon: Shield,           name: "Security",         desc: "Gate passes and visitor management" },
  { key: "finance",        icon: Wallet,           name: "Finance",          desc: "Fee structures, invoices, and payments" },
  { key: "discipline",     icon: AlertTriangle,    name: "Discipline",       desc: "Incident records and behavior tracking" },
  { key: "timetable",      icon: CalendarDays,     name: "Timetable",        desc: "Class schedules and auto-generation" },
  { key: "announcements",  icon: Megaphone,        name: "Announcements",    desc: "School-wide announcements and pinned notices" },
  { key: "id_cards",       icon: QrCode,           name: "Digital IDs",      desc: "ID card printing and QR verification" },
  { key: "leaving_certs",  icon: Award,            name: "Leaving Certs",    desc: "Student leaving certificates" },
  { key: "classroom",      icon: BookOpen,         name: "Classroom",        desc: "Classroom feed, assignments, and submissions" },
  { key: "live_classes",   icon: Video,            name: "Live Classes",     desc: "Live video sessions via Jitsi" },
  { key: "communications", icon: MessageSquare,    name: "Communications",   desc: "SMS and email blast tools" },
] as const;

function FeaturesPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["school_features"],
    queryFn: async () => {
      const { data } = await supabase.from("school_features").select("feature_key, enabled");
      const map = new Map<string, boolean>();
      for (const row of (data ?? []) as any[]) map.set(row.feature_key, row.enabled);
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
          { school_id: schoolId as any, feature_key: key, enabled } as any,
          { onConflict: "school_id,feature_key" } as any
        );
      if (error) throw error;
    },
    onMutate: async ({ key, enabled }) => {
      await qc.cancelQueries({ queryKey: ["school_features"] });
      const prev = qc.getQueryData<Map<string, boolean>>(["school_features"]);
      const next = new Map(prev ?? []);
      next.set(key, enabled);
      qc.setQueryData(["school_features"], next);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["school_features"], ctx.prev);
      toast.error("Failed to save");
    },
    onSuccess: () => toast.success("Saved"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["school_features"] }),
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Feature Modules</h1>
        <p className="text-muted-foreground">Enable or disable modules for your school.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 15 }).map((_, i) => (
              <Card key={i}><CardContent className="pt-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
            ))
          : MODULES.map((m) => {
              const enabled = data?.get(m.key) ?? true;
              const Icon = m.icon;
              return (
                <Card key={m.key} className={enabled ? "" : "opacity-60"}>
                  <CardContent className="pt-6 flex items-start gap-3">
                    <Icon className={`w-8 h-8 shrink-0 ${enabled ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold">{m.name}</div>
                      <div className="text-sm text-muted-foreground">{m.desc}</div>
                    </div>
                    <Switch
                      checked={enabled}
                      onCheckedChange={(v) => toggleMutation.mutate({ key: m.key, enabled: v })}
                    />
                  </CardContent>
                </Card>
              );
            })}
      </div>
    </div>
  );
}
