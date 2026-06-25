import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Plus, Loader2, Sparkles, CheckCircle2, AlertTriangle, CalendarDays,
  Pencil, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { generateTimetable } from "@/lib/timetable.functions";

export const Route = createFileRoute("/_app/timetable")({ component: Page });

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Page() {
  const qc = useQueryClient();
  const { isAdmin, roles } = useAuth();
  const canGenerate = isAdmin || (roles ?? []).some((r) => r === "academic_master");

  const [classId, setClassId] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const { data: classes = [] } = useQuery({
    queryKey: ["classes-tt"],
    queryFn: async () =>
      (await supabase.from("classes").select("id,name,level").order("name")).data ?? [],
  });
  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects-tt"],
    queryFn: async () =>
      (await supabase.from("subjects").select("id,code,name").order("code")).data ?? [],
  });
  const { data: staff = [] } = useQuery({
    queryKey: ["staff-tt"],
    queryFn: async () =>
      (await supabase.from("staff").select("id,first_name,last_name").order("first_name")).data ?? [],
  });
  const { data: slots = [] } = useQuery({
    queryKey: ["tt", classId],
    enabled: !!classId,
    queryFn: async () =>
      (await supabase
        .from("timetable_slots")
        .select("*, subjects(code,name), staff(first_name,last_name)")
        .eq("class_id", classId)
        .order("day_of_week")
        .order("start_time")
      ).data ?? [],
  });

  const grid = useMemo(() => {
    const g: Record<number, any[]> = {};
    (slots as any[]).forEach((s) => { (g[s.day_of_week] ||= []).push(s); });
    return g;
  }, [slots]);

  const refreshGrid = () => qc.invalidateQueries({ queryKey: ["tt", classId] });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <CalendarDays className="w-7 h-7 text-primary" /> Timetable
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            View, edit, and auto-generate weekly class schedules.
          </p>
        </div>
        <div className="flex gap-2 items-end">
          <div className="min-w-[220px]">
            <Label>Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder="Choose class" /></SelectTrigger>
              <SelectContent>
                {(classes as any[]).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{c.level ? ` — ${c.level}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isAdmin && classId && (
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" />Add Slot</Button>
              </DialogTrigger>
              <SlotDialog
                classId={classId}
                subjects={subjects as any[]}
                staff={staff as any[]}
                onDone={() => { setAddOpen(false); refreshGrid(); }}
              />
            </Dialog>
          )}
        </div>
      </div>

      <Tabs defaultValue="view" className="w-full">
        <TabsList>
          <TabsTrigger value="view">View</TabsTrigger>
          {canGenerate && (
            <TabsTrigger value="generate">
              <Sparkles className="w-4 h-4 mr-1.5" /> Generate
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="view" className="mt-4">
          {!classId ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Select a class to view its timetable.
              </CardContent>
            </Card>
          ) : (slots as any[]).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground space-y-2">
                <p>No slots for this class yet.</p>
                {canGenerate && (
                  <p className="text-xs">Switch to the <strong>Generate</strong> tab to auto-build a schedule.</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {DAYS.map((d, i) => (
                <Card key={d}>
                  <CardHeader className="pb-2">
                    <div className="font-semibold">{d}</div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {(grid[i + 1] ?? []).length === 0 && (
                      <p className="text-xs text-muted-foreground">No slots.</p>
                    )}
                    {(grid[i + 1] ?? []).map((s: any) => (
                      <SlotCard
                        key={s.id}
                        slot={s}
                        subjects={subjects as any[]}
                        staff={staff as any[]}
                        canEdit={!!isAdmin}
                        onChanged={refreshGrid}
                      />
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {canGenerate && (
          <TabsContent value="generate" className="mt-4">
            <GeneratePanel
              classes={classes as any[]}
              activeClassId={classId}
              onGenerated={(firstClassId) => {
                if (firstClassId) setClassId(firstClassId);
                refreshGrid();
              }}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

/* ── Slot card with inline Edit / Delete ─────────────────────────────────── */

function SlotCard({
  slot, subjects, staff, canEdit, onChanged,
}: {
  slot: any; subjects: any[]; staff: any[]; canEdit: boolean; onChanged: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);

  const deleteMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("timetable_slots").delete().eq("id", slot.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Slot deleted"); onChanged(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="border rounded p-2 group relative">
      <div className="font-mono text-xs text-muted-foreground">
        {slot.start_time?.slice(0, 5)} – {slot.end_time?.slice(0, 5)}
      </div>
      <div className="font-medium">
        {slot.subjects?.code}{" "}
        <span className="text-xs text-muted-foreground font-normal">{slot.subjects?.name}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {slot.staff ? `${slot.staff.first_name} ${slot.staff.last_name}` : "—"}
        {slot.room && ` · ${slot.room}`}
      </div>

      {canEdit && (
        <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Edit */}
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-6 w-6">
                <Pencil className="w-3 h-3" />
              </Button>
            </DialogTrigger>
            <SlotDialog
              classId={slot.class_id}
              subjects={subjects}
              staff={staff}
              existing={slot}
              onDone={() => { setEditOpen(false); onChanged(); }}
            />
          </Dialog>

          {/* Delete */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive">
                <Trash2 className="w-3 h-3" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete slot?</AlertDialogTitle>
                <AlertDialogDescription>
                  {slot.subjects?.name} on {DAYS[(slot.day_of_week ?? 1) - 1]} at {slot.start_time?.slice(0, 5)} will be removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMut.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

/* ── Add / Edit slot dialog ──────────────────────────────────────────────── */

function SlotDialog({
  classId, subjects, staff, existing, onDone,
}: {
  classId: string; subjects: any[]; staff: any[]; existing?: any; onDone: () => void;
}) {
  const isEdit = !!existing;
  const [f, setF] = useState({
    subject_id: existing?.subject_id ?? "",
    teacher_id: existing?.teacher_id ?? "",
    day_of_week: existing?.day_of_week ?? 1,
    start_time: existing?.start_time?.slice(0, 5) ?? "07:30",
    end_time: existing?.end_time?.slice(0, 5) ?? "08:10",
    room: existing?.room ?? "",
  });

  const m = useMutation({
    mutationFn: async () => {
      const payload: any = { ...f, class_id: classId };
      if (!payload.teacher_id) delete payload.teacher_id;
      if (!payload.room) delete payload.room;

      // Conflict check (exclude self when editing)
      const classQ = supabase
        .from("timetable_slots")
        .select("id, subjects(name)")
        .eq("class_id", classId)
        .eq("day_of_week", f.day_of_week)
        .lt("start_time", f.end_time)
        .gt("end_time", f.start_time);
      if (isEdit) classQ.neq("id", existing.id);
      const { data: classConflicts } = await classQ;
      if (classConflicts?.length) {
        throw new Error(`Class conflict: ${(classConflicts[0] as any).subjects?.name ?? "another subject"} already in this slot.`);
      }

      if (payload.teacher_id) {
        const tQ = supabase
          .from("timetable_slots")
          .select("id, classes(name)")
          .eq("teacher_id", payload.teacher_id)
          .eq("day_of_week", f.day_of_week)
          .lt("start_time", f.end_time)
          .gt("end_time", f.start_time);
        if (isEdit) tQ.neq("id", existing.id);
        const { data: teacherConflicts } = await tQ;
        if (teacherConflicts?.length) {
          throw new Error(`Teacher conflict: already assigned to ${(teacherConflicts[0] as any).classes?.name ?? "another class"} at this time.`);
        }
      }

      if (isEdit) {
        const { error } = await supabase.from("timetable_slots").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("timetable_slots").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(isEdit ? "Slot updated" : "Slot added"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit Slot" : "Add Slot"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Day</Label>
            <Select value={String(f.day_of_week)} onValueChange={(v) => setF({ ...f, day_of_week: +v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAYS.map((d, i) => (
                  <SelectItem key={d} value={String(i + 1)}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Room</Label>
            <Input value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} placeholder="e.g. Room 3" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Start</Label>
            <Input type="time" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} />
          </div>
          <div>
            <Label>End</Label>
            <Input type="time" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} />
          </div>
        </div>
        <div>
          <Label>Subject</Label>
          <Select value={f.subject_id} onValueChange={(v) => setF({ ...f, subject_id: v })}>
            <SelectTrigger><SelectValue placeholder="Choose subject" /></SelectTrigger>
            <SelectContent>
              {subjects.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>{s.code} – {s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Teacher</Label>
          <Select value={f.teacher_id} onValueChange={(v) => setF({ ...f, teacher_id: v })}>
            <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">— None —</SelectItem>
              {staff.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !f.subject_id}>
            {m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
            {isEdit ? "Save changes" : "Add slot"}
          </Button>
        </DialogFooter>
      </div>
    </DialogContent>
  );
}

/* ── Generate panel ──────────────────────────────────────────────────────── */

function GeneratePanel({
  classes, activeClassId, onGenerated,
}: {
  classes: any[]; activeClassId: string; onGenerated: (firstId?: string) => void;
}) {
  const run = useServerFn(generateTimetable);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(activeClassId ? [activeClassId] : [])
  );
  const [perWeek, setPerWeek] = useState(4);
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const submit = async () => {
    setBusy(true); setResult(null);
    try {
      const out = await run({ data: { classIds: [...selected], lessonsPerSubjectPerWeek: perWeek, replaceExisting: replace } });
      setResult(out);
      if (out.ok) {
        toast.success(`Generated ${out.inserted} slots across ${selected.size} class(es)`);
        onGenerated([...selected][0]);
      } else {
        toast.error(out.error ?? "Generation failed");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Generation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Smart Timetable Generator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Auto-builds a clash-free weekly schedule. After generating you can edit or delete any slot individually from the <strong>View</strong> tab.
          </p>

          <div className="grid grid-cols-2 gap-4 max-w-md">
            <div>
              <Label>Lessons per subject / week</Label>
              <Input type="number" min={1} max={10} value={perWeek}
                onChange={(e) => setPerWeek(+e.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              <Checkbox id="rep" checked={replace} onCheckedChange={(v) => setReplace(!!v)} />
              <Label htmlFor="rep">Replace existing</Label>
            </div>
          </div>

          <div>
            <Label>Classes ({selected.size} selected)</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2 max-h-72 overflow-auto border rounded p-3">
              {classes.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                  {c.name} <span className="text-muted-foreground text-xs">{c.level}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" onClick={() => setSelected(new Set(classes.map((c) => c.id)))}>
                Select all
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          </div>

          <Button onClick={submit} disabled={busy || !selected.size} className="w-full md:w-auto">
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Generate timetable
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              Result
              {result.ok && (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="w-3 h-3" /> {result.inserted} slots inserted
                </Badge>
              )}
              {result.conflicts?.length > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="w-3 h-3" /> {result.conflicts.length} warnings
                </Badge>
              )}
              {!result.ok && (
                <Badge variant="destructive">Failed: {result.error}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          {result.conflicts?.length > 0 && (
            <CardContent>
              <div className="text-xs space-y-1 max-h-60 overflow-auto font-mono text-amber-600 dark:text-amber-400">
                {result.conflicts.map((c: string, i: number) => <div key={i}>⚠ {c}</div>)}
              </div>
            </CardContent>
          )}
          {result.summary && (
            <CardContent className="pt-0 text-xs text-muted-foreground">
              {result.summary.classes} class(es) · {result.summary.periodsAvailable} periods available · {result.summary.lessonsRequested} lessons requested
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
