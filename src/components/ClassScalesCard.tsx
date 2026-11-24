import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { GraduationCap, Sparkles, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CBC_SCALE_NAME = "CBC 8-level (EE1-BE2)";

/**
 * Per-class grading scale. A class with no scale uses the school default, so a school
 * running both curricula can keep Form 3 on the KCSE default and put Grade 7–9 on the CBC scale.
 * Subject-level scales (Subject Scales card) still take priority over the class scale.
 */
export function ClassScalesCard({ scales }: { scales: any[] }) {
  const qc = useQueryClient();
  const { data: classes = [] } = useQuery({
    queryKey: ["grading-classes"],
    queryFn: async () => ((await (supabase as any).from("classes").select("id,name,stream,grading_scale_id").order("name")).data ?? []) as any[],
  });
  const { data: exams = [] } = useQuery({
    queryKey: ["grading-exams"],
    queryFn: async () => ((await supabase.from("exams").select("id,name,term,year").order("start_date", { ascending: false })).data ?? []) as any[],
  });
  const [rgClass, setRgClass] = useState("");
  const [rgExam, setRgExam] = useState("all");
  const regrade = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("regrade_class_results", {
        p_class_id: rgClass, p_exam_id: rgExam === "all" ? null : rgExam,
      });
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
    onSuccess: (n) => { toast.success(n ? `Re-graded ${n} mark(s)` : "Nothing to change — grades already match the scale"); qc.invalidateQueries({ queryKey: ["exam_results"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const hasCbc = scales.some((s) => s.name === CBC_SCALE_NAME);

  const seed = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("seed_cbc_grading_scale");
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("CBC 8-level scale added"); qc.invalidateQueries({ queryKey: ["grading-scales"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const assign = useMutation({
    mutationFn: async (v: { classId: string; scaleId: string | null }) => {
      const { error } = await (supabase as any).from("classes").update({ grading_scale_id: v.scaleId }).eq("id", v.classId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Class scale saved"); qc.invalidateQueries({ queryKey: ["grading-classes"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><GraduationCap className="w-4 h-4" /> Class Scales (CBC)</CardTitle>
        <CardDescription>
          Choose which scale each class is graded on. Classes left on “School default” use the default scale.
          New marks use the class scale; marks already saved keep their grade.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasCbc && (
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div className="text-sm">
              <div className="font-medium">CBC 8-level scale (EE1 – BE2)</div>
              <div className="text-muted-foreground text-xs">KNEC levels: EE1 90–100 (8 pts) down to BE2 0–10 (1 pt).</div>
            </div>
            <Button size="sm" onClick={() => seed.mutate()} disabled={seed.isPending} className="gap-1.5">
              {seed.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Add scale
            </Button>
          </div>
        )}
        {classes.length === 0 && <p className="text-sm text-muted-foreground">No classes yet.</p>}
        {classes.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <span className="text-sm w-24 shrink-0">{`${c.name ?? ""}${c.stream ? " " + c.stream : ""}`}</span>
            <Select value={c.grading_scale_id ?? "default"} onValueChange={(v) => assign.mutate({ classId: c.id, scaleId: v === "default" ? null : v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">School default</SelectItem>
                {scales.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.is_default ? " ★" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ))}

        <div className="border-t pt-4 space-y-2">
          <div className="text-sm font-medium flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> Re-grade saved marks</div>
          <p className="text-xs text-muted-foreground">
            After changing a class’s scale, update the grades already saved. Scores are not changed — only the grade/level.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={rgClass} onValueChange={setRgClass}>
              <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Class" /></SelectTrigger>
              <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{`${c.name ?? ""}${c.stream ? " " + c.stream : ""}`}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={rgExam} onValueChange={setRgExam}>
              <SelectTrigger className="h-8 text-xs w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All exams</SelectItem>
                {exams.map((e) => <SelectItem key={e.id} value={e.id}>{e.name} — {e.term} {e.year}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" disabled={!rgClass || regrade.isPending}
              onClick={() => { if (confirm("Re-grade the saved marks for this class using its current scale? This changes stored grades.")) regrade.mutate(); }}>
              {regrade.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Re-grade"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
