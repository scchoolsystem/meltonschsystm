import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Loader2, DoorOpen } from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/use-tenant";
export const Route = createFileRoute("/_app/admin/rooms")({ component: Page });
const ROOM_TYPES = [{ value:"classroom",label:"Classroom"},{ value:"science_lab",label:"Science Lab"},{ value:"computer_lab",label:"Computer Lab"},{ value:"art_room",label:"Art Room"},{ value:"music_room",label:"Music Room"},{ value:"gym",label:"Gym / PE Hall"},{ value:"library",label:"Library"},{ value:"other",label:"Other"}];
const TYPE_COLORS: Record<string,string> = { classroom:"bg-blue-100 text-blue-800", science_lab:"bg-green-100 text-green-800", computer_lab:"bg-purple-100 text-purple-800", art_room:"bg-yellow-100 text-yellow-800", music_room:"bg-pink-100 text-pink-800", gym:"bg-orange-100 text-orange-800", library:"bg-teal-100 text-teal-800", other:"bg-gray-100 text-gray-800" };
function Page() {
  const qc = useQueryClient();
  const { school } = useTenant();
  const schoolId = school?.id;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name:"", room_type:"classroom", capacity:40, is_active:true });
  const [editId, setEditId] = useState<string|null>(null);
  const [filterType, setFilterType] = useState("all");
  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ["rooms", schoolId], enabled: !!schoolId,
    queryFn: async () => { const { data, error } = await supabase.from("rooms").select("*").eq("school_id", schoolId!).order("room_type").order("name"); if (error) throw error; return data; },
  });
  const upsert = useMutation({
    mutationFn: async (r: any) => { const payload = { ...r, school_id: schoolId }; const id = r.id; delete payload.id; if (id) { const { error } = await supabase.from("rooms").update(payload).eq("id", id); if (error) throw error; } else { const { error } = await supabase.from("rooms").insert(payload); if (error) throw error; } },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rooms", schoolId] }); setOpen(false); setEditId(null); toast.success("Room saved"); },
    onError: (e: any) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("rooms").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rooms", schoolId] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });
  const filtered = filterType==="all" ? rooms as any[] : (rooms as any[]).filter(r => r.room_type===filterType);
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div><h1 className="text-3xl font-bold">Rooms</h1><p className="text-sm text-muted-foreground mt-1">Teaching spaces available to the timetable solver</p></div>
        <Button size="sm" onClick={() => { setForm({name:"",room_type:"classroom",capacity:40,is_active:true}); setEditId(null); setOpen(true); }}><Plus className="w-4 h-4 mr-2"/>Add Room</Button>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilterType("all")} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterType==="all"?"bg-primary text-primary-foreground":"bg-muted hover:bg-muted/80"}`}>All ({(rooms as any[]).length})</button>
        {ROOM_TYPES.filter(t => (rooms as any[]).some(r => r.room_type===t.value)).map(t => <button key={t.value} onClick={() => setFilterType(t.value)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterType===t.value?"bg-primary text-primary-foreground":"bg-muted hover:bg-muted/80"}`}>{t.label} ({(rooms as any[]).filter(r => r.room_type===t.value).length})</button>)}
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && filtered.length===0 && <Card><CardContent className="py-12 text-center text-muted-foreground">No rooms yet. Click "Add Room".</CardContent></Card>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((r: any) => (
          <Card key={r.id} className={!r.is_active?"opacity-50":""}>
            <CardContent className="p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0"><DoorOpen className="w-4 h-4 text-muted-foreground"/></div>
              <div className="flex-1 min-w-0"><div className="font-medium text-sm truncate">{r.name}</div><div className="flex items-center gap-2 mt-1 flex-wrap"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[r.room_type]??TYPE_COLORS.other}`}>{ROOM_TYPES.find(t=>t.value===r.room_type)?.label??r.room_type}</span><span className="text-xs text-muted-foreground">Cap: {r.capacity}</span>{!r.is_active&&<Badge variant="secondary" className="text-xs">Inactive</Badge>}</div></div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm({name:r.name,room_type:r.room_type,capacity:r.capacity,is_active:r.is_active}); setEditId(r.id); setOpen(true); }}><Pencil className="w-3.5 h-3.5"/></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove.mutate(r.id)}><Trash2 className="w-3.5 h-3.5"/></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId?"Edit Room":"Add Room"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1"><Label>Room name</Label><Input placeholder="e.g. Room 4B, Science Lab 1" value={form.name} onChange={e => setForm({...form,name:e.target.value})}/></div>
            <div className="space-y-1"><Label>Room type</Label><Select value={form.room_type} onValueChange={v => setForm({...form,room_type:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{ROOM_TYPES.map(t=><SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Capacity</Label><Input type="number" min={1} value={form.capacity} onChange={e => setForm({...form,capacity:parseInt(e.target.value)||40})}/></div>
            <div className="flex items-center gap-2"><Switch id="is_active" checked={form.is_active} onCheckedChange={v => setForm({...form,is_active:v})}/><Label htmlFor="is_active">Room is active (available to solver)</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { if(!form.name.trim()) return toast.error("Name required"); upsert.mutate(editId?{...form,id:editId}:form); }} disabled={upsert.isPending}>{upsert.isPending&&<Loader2 className="w-4 h-4 mr-2 animate-spin"/>}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
