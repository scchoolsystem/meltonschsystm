import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Save, Info, CheckCircle2, Settings2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin/promotion-settings")({
  component: PromotionSettingsPage,
});

interface PromotionSettings {
  id?: string;
  school_id?: string;
  min_pass_percentage: number;
  min_pass_gpa: number | null;
  method_final_average: boolean;
  method_gpa: boolean;
  method_exam_score: boolean;
  method_teacher_approval: boolean;
  auto_promotion_enabled: boolean;
  manual_override_allowed: boolean;
}

const DEFAULT_SETTINGS: PromotionSettings = {
  min_pass_percentage: 50,
  min_pass_gpa: null,
  method_final_average: true,
  method_gpa: false,
  method_exam_score: false,
  method_teacher_approval: false,
  auto_promotion_enabled: true,
  manual_override_allowed: true,
};

function MethodToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className={`flex items-start gap-4 p-4 rounded-lg border transition-colors
      ${checked ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          {checked && (
            <Badge variant="default" className="text-[10px] h-4 px-1.5">Active</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function PromotionSettingsPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<PromotionSettings>(DEFAULT_SETTINGS);
  const [dirty, setDirty] = useState(false);

  const { data: schoolId } = useQuery({
    queryKey: ["current-school-id"],
    queryFn: async () => {
      const { data } = await supabase.rpc("current_user_school");
      return data as string | null;
    },
  });

  const { data: existing, isLoading } = useQuery({
    queryKey: ["promotion-settings", schoolId],
    queryFn: async () => {
      if (!schoolId) return null;
      const { data, error } = await supabase
        .from("school_promotion_settings")
        .select("*")
        .eq("school_id", schoolId)
        .maybeSingle();
      if (error) throw error;
      return data as PromotionSettings | null;
    },
    enabled: !!schoolId,
  });

  useEffect(() => {
    if (existing) setForm(existing);
  }, [existing]);

  const set = <K extends keyof PromotionSettings>(k: K, v: PromotionSettings[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("No school context");
      const payload = {
        school_id: schoolId,
        min_pass_percentage: form.min_pass_percentage,
        min_pass_gpa: form.min_pass_gpa,
        method_final_average: form.method_final_average,
        method_gpa: form.method_gpa,
        method_exam_score: form.method_exam_score,
        method_teacher_approval: form.method_teacher_approval,
        auto_promotion_enabled: form.auto_promotion_enabled,
        manual_override_allowed: form.manual_override_allowed,
      };

      if (existing?.id) {
        const { error } = await supabase
          .from("school_promotion_settings")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("school_promotion_settings")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Promotion settings saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["promotion-settings"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const activeMethods = [
    form.method_final_average && "Final Average",
    form.method_gpa && "GPA",
    form.method_exam_score && "Exam Score",
    form.method_teacher_approval && "Teacher Approval",
  ].filter(Boolean);

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Admins only.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Promotion Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure how the system decides whether a student is promoted, repeats,
            or graduates at the end of each academic year.
          </p>
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !dirty}
        >
          {saveMutation.isPending
            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            : <Save className="w-4 h-4 mr-2" />}
          Save Settings
        </Button>
      </div>

      {isLoading ? (
        <div className="h-48 grid place-items-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-4 flex items-center gap-3 flex-wrap">
              <Settings2 className="w-4 h-4 text-primary shrink-0" />
              <div className="text-sm">
                <span className="font-medium">Current config: </span>
                Pass at <strong>{form.min_pass_percentage}%</strong>
                {activeMethods.length > 0 && (
                  <> using {activeMethods.join(" + ")}</>
                )}
                {form.auto_promotion_enabled
                  ? " · Auto-promotion ON"
                  : " · Auto-promotion OFF"}
                {form.manual_override_allowed
                  ? " · Overrides allowed"
                  : " · No overrides"}
              </div>
            </CardContent>
          </Card>

          {/* Pass Threshold */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pass Thresholds</CardTitle>
              <CardDescription>
                The minimum score a student must achieve to be promoted to the next class.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="min-pct">
                  Minimum Overall Percentage
                  <span className="text-muted-foreground font-normal ml-1">(used when method includes Final Average or Exam Score)</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="min-pct"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={form.min_pass_percentage}
                    onChange={(e) => set("min_pass_percentage", parseFloat(e.target.value) || 0)}
                    className="w-32"
                  />
                  <span className="text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Students scoring below this are automatically marked as <em>Repeat</em>.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="min-gpa">
                  Minimum GPA
                  <span className="text-muted-foreground font-normal ml-1">(used when GPA method is active)</span>
                </Label>
                <Input
                  id="min-gpa"
                  type="number"
                  min={0}
                  max={5}
                  step={0.1}
                  placeholder="e.g. 2.0"
                  value={form.min_pass_gpa ?? ""}
                  onChange={(e) =>
                    set("min_pass_gpa", e.target.value ? parseFloat(e.target.value) : null)
                  }
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank if GPA is not used at your school.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Promotion Method */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Promotion Method</CardTitle>
              <CardDescription>
                Select one or more criteria that determine a student's promotion decision.
                If multiple are selected, <em>all</em> active criteria are evaluated.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <MethodToggle
                label="Final Average"
                description="Average score across all subjects and exams in the academic year."
                checked={form.method_final_average}
                onChange={(v) => set("method_final_average", v)}
              />
              <MethodToggle
                label="GPA"
                description="Grade Point Average calculated from letter-grade conversions."
                checked={form.method_gpa}
                onChange={(v) => set("method_gpa", v)}
              />
              <MethodToggle
                label="Exam Score"
                description="Performance on the year-end/final examination specifically."
                checked={form.method_exam_score}
                onChange={(v) => set("method_exam_score", v)}
              />
              <MethodToggle
                label="Teacher Approval"
                description="Class teacher manually approves each student's promotion status before finalisation."
                checked={form.method_teacher_approval}
                onChange={(v) => set("method_teacher_approval", v)}
              />

              {activeMethods.length === 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-sm">
                  <Info className="w-4 h-4 shrink-0" />
                  At least one promotion method must be selected.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Automation */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Automation & Override</CardTitle>
              <CardDescription>
                Control how much the system automates and whether administrators can change decisions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-4 p-4 rounded-lg border bg-card">
                <Switch
                  id="auto-promotion"
                  checked={form.auto_promotion_enabled}
                  onCheckedChange={(v) => set("auto_promotion_enabled", v)}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="auto-promotion" className="text-sm font-medium cursor-pointer">
                    Enable Automatic Promotion
                    {form.auto_promotion_enabled && (
                      <Badge variant="default" className="ml-2 text-[10px] h-4 px-1.5">ON</Badge>
                    )}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    When enabled, the system automatically calculates and pre-fills promotion decisions
                    when you run the year-end promotion. You can still review before confirming.
                  </p>
                </div>
              </div>

              <Separator />

              <div className="flex items-start gap-4 p-4 rounded-lg border bg-card">
                <Switch
                  id="manual-override"
                  checked={form.manual_override_allowed}
                  onCheckedChange={(v) => set("manual_override_allowed", v)}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="manual-override" className="text-sm font-medium cursor-pointer">
                    Allow Manual Override
                    {form.manual_override_allowed && (
                      <Badge variant="default" className="ml-2 text-[10px] h-4 px-1.5">ON</Badge>
                    )}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    When enabled, administrators can change any student's suggested decision
                    (promote / repeat / graduate / transfer / inactive) before finalising.
                    Every override is logged with the reason and administrator's identity.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Visual example */}
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground font-medium uppercase tracking-wider">
                Example Outcome Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-separate border-spacing-0">
                  <thead>
                    <tr>
                      {["Student", "Class", "Final Avg", `Pass (${form.min_pass_percentage}%)`, "Decision"].map((h) => (
                        <th key={h} className="text-left text-xs text-muted-foreground font-medium px-3 py-2 border-b">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: "John Doe", cls: "Form 1", avg: 68 },
                      { name: "Mary Jane", cls: "Form 1", avg: 41 },
                      { name: "David Kim", cls: "Form 4", avg: 72 },
                    ].map((row) => {
                      const passes = row.avg >= form.min_pass_percentage;
                      const isLast = row.cls === "Form 4";
                      const decision = isLast && passes ? "Graduate" : passes ? "Promote" : "Repeat";
                      const color =
                        decision === "Graduate"
                          ? "text-amber-600 dark:text-amber-400"
                          : decision === "Promote"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400";
                      return (
                        <tr key={row.name} className="hover:bg-muted/30">
                          <td className="px-3 py-2 font-medium">{row.name}</td>
                          <td className="px-3 py-2 text-muted-foreground">{row.cls}</td>
                          <td className="px-3 py-2">{row.avg}%</td>
                          <td className="px-3 py-2">
                            {passes
                              ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              : <span className="text-red-500">✗</span>}
                          </td>
                          <td className={`px-3 py-2 font-semibold ${color}`}>{decision}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                * Example uses placeholder class structure; actual results depend on configured class order.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
