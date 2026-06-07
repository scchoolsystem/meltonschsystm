import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Copy, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/use-tenant";
export const Route = createFileRoute("/_app/admin/periods")({ component: Page });
const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday"];
function Page() {
  const qc = useQueryClient();
  const { school } = useTenant();
  const schoolId = school?.id;
  const [activeDay, setActiveDay] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ day_of_week:1, period_index:1, label:"", start_time:"08:00", end_time:"08:45", is_break:false });
  const [editId, setEditId] = useState<string|null>(null);
  const { data: periods = [], isLoading } = useQuery({
    queryKey: ["period_templates", schoolId], enabled: !!schoolId,
    queryFn: async () => { const { data, error } = await supabase.from("period_templates").select("*").eq("school_id", schoolId!).order("day_of_week").order("period_index"); if (error) throw error; return data; },
  });
  const upsert = useMutation({
    mutationFn: async (p: any) => { const payload = { ...p, school_id: schoolId }; const id = p.id; delete payload.id; if (id) { const { error } = await supabase.from("period_templates").update(payload).eq("id", id); if (error) throw error; } else { const { error } = await supabase.from("period_templates").insert(payload); if (error) throw error; } },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["period_templates", schoolId] }); setOpen(false); setEditId(null); toast.success("Period saved"); },
    onError: (e: any) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("period_templates").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["period_templates", schoolId] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });
  const copyToAll = useMutation({
    mutationFn: async () => { const monday = (periods as any[]).filter(p => p.day_of_week === 1); if (!monday.length) throw new Error("No Monday periods to copy"); const inserts = []; for (let day = 2; day <= 5; day++) for (const p of monday) inserts.push({ school_id: schoolId, day_of_week: day, period_index: p.period_index, label: p.label, start_time: p.start_time, end_time: p.end_time, is_break: p.is_break }); await supabase.from("period_templates").delete().eq("school_id", schoolId!).gte("day_of_week", 2).lte("day_of_week", 5); const { error } = await supabase.from("period_templates").insert(inserts); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["period_templates", schoolId] }); toast.success("Copied Mon → Tue–Fri"); },
    onError: (e: any) => toast.error(e.message),
  });
  const dayPeriods = (periods as any[]).filter(p => p.day_of_week === activeDay).sort((a,b) => a.period_index - b.period_index);
  const openAdd = () => { setForm({ day_of_week: activeDay, period_index: dayPeriods.length + 1, label:"", start_time:"08:00", end_time:"08:45", is_break:false }); setEditId(null); setOpen(true); };
  const openEdit = (p: any) => { setForm({ day_of_week: p.day_of_week, period_index: p.period_index, label: p.label, start_time: p.start_time, end_time: p.end_time, is_break: p.is_break }); setEditId(p.id); setOpen(true); };
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div><h1 className="text-3xl font-bold">Period Templates</h1><p className="text-sm text-muted-foreground mt-1">Define your school day — the solver uses these slots</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => copyToAll.mutate()} disabled={copyToAll.isPending}>{copyToAll.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <Copy className="w-4 h-4 mr-2"/>}Copy Mon → Tue–Fri</Button>
          <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-2"/>Add Period</Button>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {DAYS.map((d,i) => { const count = (periods as any[]).filter(p => p.day_of_week === i+1).length; return <button key={d} onClick={() => setActiveDay(i+1)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeDay===i+1?"bg-primary text-primary-foreground":"bg-muted hover:bg-muted/80"}`}>{d} <span className="ml-1 opacity-60">({count})</span></button>; })}
      </div>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">{DAYS[activeDay-1]}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && dayPeriods.length===0 && <p className="text-sm text-muted-foreground py-4 text-center">No periods yet. Click "Add Period" to start.</p>}
          {dayPeriods.map((p: any) => (
            <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 cursor-pointer" onClick={() => openEdit(p)}>
              <Clock className="w-4 h-4 text-muted-foreground shrink-0"/>
              <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="font-medium text-sm">{p.label}</span>{p.is_break && <Badge variant="secondary" className="text-xs">Break</Badge>}</div><div className="text-xs text-muted-foreground">{p.start_time} – {p.end_time}</div></div>
              <span className="text-xs text-muted-foreground">#{p.period_index}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={e => { e.stopPropagation(); remove.mutate(p.id); }}><Trash2 className="w-3.5 h-3.5"/></Button>
            </div>
          ))}
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId?"Edit Period":"Add Period"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1"><Label>Label</Label><Input placeholder="e.g. Period 1, Break, Lunch" value={form.label} onChange={e => setForm({...form,label:e.target.value})}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Start time</Label><Input type="time" value={form.start_time} onChange={e => setForm({...form,start_time:e.target.value})}/></div>
              <div className="space-y-1"><Label>End time</Label><Input type="time" value={form.end_time} onChange={e => setForm({...form,end_time:e.target.value})}/></div>
            </div>
            <div className="space-y-1"><Label>Period #</Label><Input type="number" min={1} value={form.period_index} onChange={e => setForm({...form,period_index:parseInt(e.target.value)||1})}/></div>
            <div className="flex items-center gap-2"><Checkbox id="is_break" checked={form.is_break} onCheckedChange={v => setForm({...form,is_break:!!v})}/><Label htmlFor="is_break">This is a break / non-teaching slot</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { if(!form.label.trim()) return toast.error("Label required"); upsert.mutate(editId?{...form,id:editId}:form); }} disabled={upsert.isPending}>{upsert.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin"/>}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
