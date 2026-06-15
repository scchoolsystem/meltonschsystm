import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Save, Trash2, Star, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/admin/grading")({ component: Page });

function Page() {
  const qc = useQueryClient();

  // All scales for this school
  const { data: scales = [] } = useQuery({
    queryKey: ["grading-scales"],
    queryFn: async () => (await supabase.from("grading_scales").select("*").order("created_at")).data ?? [],
  });

  const [activeScaleId, setActiveScaleId] = useState<string | null>(null);
  const activeScale = (scales as any[]).find(s => s.id === (activeScaleId ?? (scales as any[])[0]?.id)) ?? (scales as any[])[0];

  // Bands for active scale
  const { data: bands = [], refetch: refetchBands } = useQuery({
    enabled: !!activeScale,
    queryKey: ["grading-bands", activeScale?.id],
    queryFn: async () => (await supabase.from("grading_bands").select("*").eq("scale_id", activeScale.id).order("min_score", { ascending: false })).data ?? [],
  });

  // All subjects with their scale assignment
  const { data: subjects = [], refetch: refetchSubjects } = useQuery({
    queryKey: ["subjects-with-scale"],
    queryFn: async () => (await supabase.from("subjects").select("id, code, name, scale_id").order("code")).data ?? [],
  });

  const [newRow, setNewRow] = useState({ min_score: "", max_score: "", grade: "", remarks: "" });

  const addBand = useMutation({
    mutationFn: async () => {
      if (!activeScale) throw new Error("No scale selected");
      const { error } = await supabase.from("grading_bands").insert({
        scale_id: activeScale.id,
        min_score: Number(newRow.min_score),
        max_score: Number(newRow.max_score),
        grade: newRow.grade.trim(),
        remarks: newRow.remarks.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Band added"); setNewRow({ min_score: "", max_score: "", grade: "", remarks: "" }); refetchBands(); },
    onError: (e: any) => toast.error(e.message),
  });

  const delBand = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("grading_bands").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); refetchBands(); },
  });

  const setDefault = useMutation({
    mutationFn: async (scaleId: string) => {
      // Unset all defaults first, then set the chosen one
      const { data: schoolRow } = await supabase.rpc("current_user_school");
      await supabase.from("grading_scales").update({ is_default: false }).eq("school_id", schoolRow as string);
      const { error } = await supabase.from("grading_scales").update({ is_default: true }).eq("id", scaleId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Default scale updated"); qc.invalidateQueries({ queryKey: ["grading-scales"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const assignSubjectScale = useMutation({
    mutationFn: async ({ subjectId, scaleId }: { subjectId: string; scaleId: string | null }) => {
      const { error } = await supabase.from("subjects").update({ scale_id: scaleId }).eq("id", subjectId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Subject scale updated"); refetchSubjects(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Grading Scales</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Define multiple grading scales (e.g. 8-4-4, CBC, Pass/Fail) and assign them per subject.
          Subjects without a specific scale use the school default.
        </p>
      </div>

      {/* Scale tabs + create new */}
      <div className="flex items-center gap-2 flex-wrap">
        {(scales as any[]).map(s => (
          <button
            key={s.id}
            onClick={() => setActiveScaleId(s.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
              activeScale?.id === s.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-muted"
            }`}
          >
            {s.is_default && <Star className="w-3 h-3" />}
            {s.name}
          </button>
        ))}
        <NewScaleDialog onCreated={(id) => { qc.invalidateQueries({ queryKey: ["grading-scales"] }); setActiveScaleId(id); }} />
      </div>

      {activeScale && (
        <div className="grid md:grid-cols-3 gap-6">
          {/* Bands editor */}
          <div className="md:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <div>
                  <CardTitle className="text-base">{activeScale.name}</CardTitle>
                  <CardDescription>Grade bands for this scale</CardDescription>
                </div>
                <div className="flex gap-2">
                  {!activeScale.is_default && (
                    <Button size="sm" variant="outline" onClick={() => setDefault.mutate(activeScale.id)} disabled={setDefault.isPending}>
                      <Star className="w-3 h-3 mr-1" /> Set as default
                    </Button>
                  )}
                  {activeScale.is_default && <Badge><Star className="w-3 h-3 mr-1" />School Default</Badge>}
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Min</TableHead>
                      <TableHead className="w-20">Max</TableHead>
                      <TableHead className="w-20">Grade</TableHead>
                      <TableHead>Remarks</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(bands as any[]).map(b => (
                      <TableRow key={b.id}>
                        <TableCell>{b.min_score}</TableCell>
                        <TableCell>{b.max_score}</TableCell>
                        <TableCell className="font-bold text-base">{b.grade}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{b.remarks}</TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => delBand.mutate(b.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Add new band row */}
                    <TableRow className="bg-muted/30">
                      <TableCell><Input placeholder="0" type="number" value={newRow.min_score} onChange={e => setNewRow(r => ({ ...r, min_score: e.target.value }))} /></TableCell>
                      <TableCell><Input placeholder="100" type="number" value={newRow.max_score} onChange={e => setNewRow(r => ({ ...r, max_score: e.target.value }))} /></TableCell>
                      <TableCell><Input placeholder="A" value={newRow.grade} onChange={e => setNewRow(r => ({ ...r, grade: e.target.value }))} /></TableCell>
                      <TableCell><Input placeholder="Remarks (optional)" value={newRow.remarks} onChange={e => setNewRow(r => ({ ...r, remarks: e.target.value }))} /></TableCell>
                      <TableCell>
                        <Button size="icon" onClick={() => addBand.mutate()} disabled={!newRow.grade || !newRow.min_score || !newRow.max_score || addBand.isPending}>
                          <Plus className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Subject assignments */}
          <div>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="w-4 h-4" /> Subject Scales
                </CardTitle>
                <CardDescription>
                  Assign a specific scale per subject. Leave as "School default" to use the default scale.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(subjects as any[]).length === 0 && (
                  <p className="text-sm text-muted-foreground">No subjects yet.</p>
                )}
                {(subjects as any[]).map(sub => (
                  <div key={sub.id} className="flex items-center gap-2">
                    <span className="text-sm font-mono w-16 shrink-0">{sub.code}</span>
                    <Select
                      value={sub.scale_id ?? "default"}
                      onValueChange={v => assignSubjectScale.mutate({
                        subjectId: sub.id,
                        scaleId: v === "default" ? null : v,
                      })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">
                          <span className="flex items-center gap-1">
                            <Star className="w-3 h-3" /> School default
                          </span>
                        </SelectItem>
                        {(scales as any[]).map(s => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}{s.is_default ? " ★" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {(scales as any[]).length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No grading scales yet. Create one to get started.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function NewScaleDialog({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [copyFrom, setCopyFrom] = useState<string>("none");

  const { data: scales = [] } = useQuery({
    queryKey: ["grading-scales"],
    queryFn: async () => (await supabase.from("grading_scales").select("*").order("created_at")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: schoolId } = await supabase.rpc("current_user_school");
      const { data: newScale, error } = await supabase
        .from("grading_scales")
        .insert({ name: name.trim(), school_id: schoolId as string, is_default: false })
        .select("id")
        .single();
      if (error) throw error;

      // Copy bands from another scale if chosen
      if (copyFrom !== "none") {
        const { data: srcBands } = await supabase
          .from("grading_bands")
          .select("min_score, max_score, grade, remarks")
          .eq("scale_id", copyFrom);
        if (srcBands && srcBands.length > 0) {
          await supabase.from("grading_bands").insert(
            srcBands.map(b => ({ ...b, scale_id: newScale.id, school_id: schoolId as string }))
          );
        }
      }
      return newScale.id;
    },
    onSuccess: (id) => { toast.success("Scale created"); setOpen(false); setName(""); setCopyFrom("none"); onCreated(id); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Plus className="w-4 h-4 mr-1" />New scale</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create grading scale</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Scale name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pass/Fail, CBC, A-Level" />
          </div>
          <div>
            <Label>Copy bands from (optional)</Label>
            <Select value={copyFrom} onValueChange={setCopyFrom}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Start blank</SelectItem>
                {(scales as any[]).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Copying saves time — you can edit bands after creation.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
