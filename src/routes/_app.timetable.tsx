import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/timetable")({ component: Page });

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Page() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [classId, setClassId] = useState("");
  const [open, setOpen] = useState(false);
  const { data: classes = [] } = useQuery({ queryKey: ["classes-tt"], queryFn: async () => (await supabase.from("classes").select("id,name").order("name")).data ?? [] });
  const { data: subjects = [] } = useQuery({ queryKey: ["subjects-tt"], queryFn: async () => (await supabase.from("subjects").select("id,code").order("code")).data ?? [] });
  const { data: staff = [] } = useQuery({ queryKey: ["staff-tt"], queryFn: async () => (await supabase.from("staff").select("id,first_name,last_name").order("first_name")).data ?? [] });
  const { data: slots = [] } = useQuery({
    queryKey: ["tt", classId],
    enabled: !!classId,
    queryFn: async () => (await supabase.from("timetable_slots").select("*, subjects(code), staff(first_name,last_name)").eq("class_id", classId).order("day_of_week").order("start_time")).data ?? [],
  });

  const grid = useMemo(() => {
    const g: Record<number, any[]> = {};
    (slots as any[]).forEach(s => { (g[s.day_of_week] ||= []).push(s); });
    return g;
  }, [slots]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div><h1 className="text-3xl font-bold">Timetable</h1><p className="text-sm text-muted-foreground mt-1">Class schedule</p></div>
        <div className="flex gap-2 items-end">
          <div className="min-w-[200px]"><Label>Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder="Choose class" /></SelectTrigger>
              <SelectContent>{(classes as any[]).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {isAdmin && classId && <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Add Slot</Button></DialogTrigger>
            <AddSlot classId={classId} subjects={subjects as any[]} staff={staff as any[]} onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["tt", classId] }); }} />
          </Dialog>}
        </div>
      </div>
      {!classId ? <Card><CardContent className="py-12 text-center text-muted-foreground">Select a class to view its timetable.</CardContent></Card> : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {DAYS.map((d, i) => (
            <Card key={d}><CardHeader className="pb-2"><div className="font-semibold">{d}</div></CardHeader><CardContent className="space-y-2 text-sm">
              {(grid[i + 1] ?? []).length === 0 && <p className="text-xs text-muted-foreground">No slots.</p>}
              {(grid[i + 1] ?? []).map((s: any) => (
                <div key={s.id} className="border rounded p-2">
                  <div className="font-mono text-xs text-muted-foreground">{s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}</div>
                  <div className="font-medium">{s.subjects?.code}</div>
                  <div className="text-xs text-muted-foreground">{s.staff ? `${s.staff.first_name} ${s.staff.last_name}` : "—"} {s.room && `· ${s.room}`}</div>
                </div>
              ))}
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AddSlot({ classId, subjects, staff, onDone }: { classId: string; subjects: any[]; staff: any[]; onDone: () => void }) {
  const [f, setF] = useState({ subject_id: "", teacher_id: "", day_of_week: 1, start_time: "08:00", end_time: "08:40", room: "" });
  const m = useMutation({
    mutationFn: async () => {
      const payload: any = { ...f, class_id: classId };
      if (!payload.teacher_id) delete payload.teacher_id;
      const { error } = await supabase.from("timetable_slots").insert(payload); if (error) throw error;
    },
    onSuccess: () => { toast.success("Slot added"); onDone(); }, onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Add Timetable Slot</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Day</Label>
            <Select value={String(f.day_of_week)} onValueChange={v => setF({ ...f, day_of_week: +v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DAYS.map((d, i) => <SelectItem key={d} value={String(i + 1)}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Room</Label><Input value={f.room} onChange={e => setF({ ...f, room: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Start</Label><Input type="time" value={f.start_time} onChange={e => setF({ ...f, start_time: e.target.value })} /></div>
          <div><Label>End</Label><Input type="time" value={f.end_time} onChange={e => setF({ ...f, end_time: e.target.value })} /></div>
        </div>
        <div><Label>Subject</Label>
          <Select value={f.subject_id} onValueChange={v => setF({ ...f, subject_id: v })}>
            <SelectTrigger><SelectValue placeholder="Choose subject" /></SelectTrigger>
            <SelectContent>{subjects.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.code}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Teacher</Label>
          <Select value={f.teacher_id} onValueChange={v => setF({ ...f, teacher_id: v })}>
            <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
            <SelectContent>{staff.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <DialogFooter><Button type="submit" disabled={m.isPending || !f.subject_id}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
