// Add to Admin → Settings page:
// import { ReportCardSettingsCard } from "@/components/ReportCardSettingsCard";
// <ReportCardSettingsCard />

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, FileText } from "lucide-react";
import { toast } from "sonner";

export function ReportCardSettingsCard() {
  const qc = useQueryClient();

  const { data: scales = [] } = useQuery({
    queryKey: ["grading-scales"],
    queryFn: async () => (await supabase.from("grading_scales").select("id,name,is_default")).data ?? [],
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ["rc-settings"],
    queryFn: async () => {
      const { data: sid } = await supabase.rpc("current_user_school");
      const { data } = await supabase
        .from("report_card_settings")
        .select("*")
        .eq("school_id", sid as string)
        .maybeSingle();
      return data;
    },
  });

  const defaultRemarks = {
    "A": "Excellent performance. Keep it up!",
    "A-": "Very good performance.",
    "B+": "Good performance. Aim higher.",
    "B": "Good performance.",
    "B-": "Above average. Work harder.",
    "C+": "Average performance. More effort needed.",
    "C": "Average. Needs to improve.",
    "C-": "Below average. Seek help.",
    "D+": "Weak performance. Must work harder.",
    "D": "Weak. Urgent attention needed.",
    "D-": "Poor. Repeat work required.",
    "E": "Fail. Must repeat.",
    "P": "Pass.",
    "F": "Fail.",
  };

  const [form, setForm] = useState({
    total_method: "sum",
    max_score_per_subject: 100,
    show_position: true,
    show_subject_position: false,
    overall_scale_id: "default",
    principal_name: "",
    principal_title: "Principal",
    footer_note: "This report card is computer generated and is valid without a signature.",
    grade_remarks: defaultRemarks as Record<string, string>,
  });

  useEffect(() => {
    if (!settings) return;
    setForm({
      total_method: settings.total_method ?? "sum",
      max_score_per_subject: settings.max_score_per_subject ?? 100,
      show_position: settings.show_position ?? true,
      show_subject_position: settings.show_subject_position ?? false,
      overall_scale_id: settings.overall_scale_id ?? "default",
      principal_name: settings.principal_name ?? "",
      principal_title: settings.principal_title ?? "Principal",
      footer_note: settings.footer_note ?? "",
      grade_remarks: settings.grade_remarks ?? defaultRemarks,
    });
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: sid } = await supabase.rpc("current_user_school");
      const payload: any = {
        school_id: sid,
        total_method: form.total_method,
        max_score_per_subject: Number(form.max_score_per_subject),
        show_position: form.show_position,
        show_subject_position: form.show_subject_position,
        overall_scale_id: form.overall_scale_id === "default" ? null : form.overall_scale_id,
        principal_name: form.principal_name.trim() || null,
        principal_title: form.principal_title.trim() || "Principal",
        footer_note: form.footer_note.trim() || null,
        grade_remarks: form.grade_remarks,
      };
      const { error } = await supabase
        .from("report_card_settings")
        .upsert(payload, { onConflict: "school_id" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Report card settings saved"); qc.invalidateQueries({ queryKey: ["rc-settings"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const setRemark = (grade: string, val: string) =>
    setForm(f => ({ ...f, grade_remarks: { ...f.grade_remarks, [grade]: val } }));

  // Get the bands of the selected overall scale to show remark fields
  const selectedScaleId = form.overall_scale_id === "default"
    ? (scales as any[]).find((s: any) => s.is_default)?.id
    : form.overall_scale_id;

  const { data: bands = [] } = useQuery({
    queryKey: ["grading-bands", selectedScaleId],
    enabled: !!selectedScaleId,
    queryFn: async () => (await supabase.from("grading_bands").select("grade").eq("scale_id", selectedScaleId).order("min_score", { ascending: false })).data ?? [],
  });

  if (isLoading) return (
    <Card><CardContent className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></CardContent></Card>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="w-4 h-4" /> Report Card Settings
        </CardTitle>
        <CardDescription>
          Define exactly how totals, means, grades and remarks are calculated and displayed on student report cards.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Score calculation */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Score Calculation</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>How to calculate the displayed total</Label>
              <Select value={form.total_method} onValueChange={v => setForm(f => ({ ...f, total_method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sum">Sum of all subject scores (e.g. 540 / 700)</SelectItem>
                  <SelectItem value="mean">Mean / average of all subjects (e.g. 77.1%)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                The mean is always used to determine the overall grade regardless of this setting.
              </p>
            </div>
            <div>
              <Label>Maximum score per subject</Label>
              <Input
                type="number" min={1} max={1000}
                value={form.max_score_per_subject}
                onChange={e => setForm(f => ({ ...f, max_score_per_subject: Number(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Used to show e.g. "78 / 100". Set to 100 for percentage-based marking.
              </p>
            </div>
          </div>
        </div>

        {/* Overall grading scale */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Overall Grade Scale</h3>
          <div>
            <Label>Which grading scale determines the overall (mean) grade?</Label>
            <Select value={form.overall_scale_id} onValueChange={v => setForm(f => ({ ...f, overall_scale_id: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">School default scale</SelectItem>
                {(scales as any[]).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}{s.is_default ? " (default)" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Example: if mean score is 68 and your scale says 65–69 = B, the student gets overall grade B.
            </p>
          </div>
        </div>

        {/* Position settings */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Ranking & Position</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Show class position</p>
                <p className="text-xs text-muted-foreground">e.g. "Position: 3 / 42 students"</p>
              </div>
              <Switch checked={form.show_position} onCheckedChange={v => setForm(f => ({ ...f, show_position: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Show subject position</p>
                <p className="text-xs text-muted-foreground">Rank per subject across the class</p>
              </div>
              <Switch checked={form.show_subject_position} onCheckedChange={v => setForm(f => ({ ...f, show_subject_position: v }))} />
            </div>
          </div>
        </div>

        {/* Grade remarks */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Grade Remarks</h3>
          <p className="text-xs text-muted-foreground">
            These are the remarks printed on the report card for each overall grade. Edit them to match your school's language.
          </p>
          <div className="space-y-2">
            {(bands as any[]).length > 0
              ? (bands as any[]).map((b: any) => (
                <div key={b.grade} className="flex items-center gap-3">
                  <span className="font-bold w-8 text-center shrink-0">{b.grade}</span>
                  <Input
                    value={form.grade_remarks[b.grade] ?? ""}
                    onChange={e => setRemark(b.grade, e.target.value)}
                    placeholder={`Remark for ${b.grade}`}
                  />
                </div>
              ))
              : Object.entries(form.grade_remarks).map(([grade, remark]) => (
                <div key={grade} className="flex items-center gap-3">
                  <span className="font-bold w-8 text-center shrink-0">{grade}</span>
                  <Input
                    value={remark}
                    onChange={e => setRemark(grade, e.target.value)}
                    placeholder={`Remark for ${grade}`}
                  />
                </div>
              ))
            }
          </div>
        </div>

        {/* Principal / footer */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Report Card Footer</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Principal / Head Teacher Name</Label>
              <Input value={form.principal_name} onChange={e => setForm(f => ({ ...f, principal_name: e.target.value }))} placeholder="e.g. Mr. John Kamau" />
            </div>
            <div>
              <Label>Title</Label>
              <Input value={form.principal_title} onChange={e => setForm(f => ({ ...f, principal_title: e.target.value }))} placeholder="Principal" />
            </div>
          </div>
          <div>
            <Label>Footer note</Label>
            <Textarea
              rows={2}
              value={form.footer_note}
              onChange={e => setForm(f => ({ ...f, footer_note: e.target.value }))}
              placeholder="e.g. This report card is computer generated..."
            />
          </div>
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save report card settings
        </Button>
      </CardContent>
    </Card>
  );
}
