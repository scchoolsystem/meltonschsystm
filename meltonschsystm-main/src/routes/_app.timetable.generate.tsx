import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { generateTimetable } from "@/lib/timetable.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/timetable/generate")({ component: Page });

function Page() {
  const run = useServerFn(generateTimetable);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [perWeek, setPerWeek] = useState(4);
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const { data: classes = [] } = useQuery({
    queryKey: ["classes-gen"],
    queryFn: async () => (await supabase.from("classes").select("id,name,level").order("name")).data ?? [],
  });

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const run_ = async () => {
    if (!selected.size) return toast.error("Select at least one class");
    setBusy(true); setResult(null);
    try {
      const out = await run({ data: { classIds: [...selected], lessonsPerSubjectPerWeek: perWeek, replaceExisting: replace } });
      setResult(out);
      toast.success(`Generated ${out.inserted}/${out.totalPlanned} slots`);
    } catch (e: any) {
      toast.error(e.message ?? "Generation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> Smart Timetable Generator
        </h1>
        <p className="text-sm text-muted-foreground">
          Auto-builds a clash-free weekly schedule. Teacher, room, and class conflicts are blocked by the database.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Options</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 max-w-md">
            <div>
              <Label>Lessons per subject / week</Label>
              <Input type="number" min={1} max={10} value={perWeek} onChange={(e) => setPerWeek(+e.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              <Checkbox id="rep" checked={replace} onCheckedChange={(v) => setReplace(!!v)} />
              <Label htmlFor="rep">Replace existing timetable</Label>
            </div>
          </div>

          <div>
            <Label>Classes ({selected.size} selected)</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2 max-h-72 overflow-auto border rounded p-3">
              {(classes as any[]).map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                  {c.name} <span className="text-muted-foreground text-xs">{c.level}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" onClick={() => setSelected(new Set((classes as any[]).map(c => c.id)))}>Select all</Button>
              <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          </div>

          <Button onClick={run_} disabled={busy || !selected.size} className="w-full md:w-auto">
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Generate timetable
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Result
              <Badge variant="default" className="gap-1"><CheckCircle2 className="w-3 h-3" />{result.inserted} slots</Badge>
              {result.conflicts?.length > 0 && (
                <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" />{result.conflicts.length} skipped</Badge>
              )}
            </CardTitle>
          </CardHeader>
          {result.conflicts?.length > 0 && (
            <CardContent>
              <div className="text-xs space-y-1 max-h-60 overflow-auto font-mono text-destructive">
                {result.conflicts.map((c: string, i: number) => <div key={i}>{c}</div>)}
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
