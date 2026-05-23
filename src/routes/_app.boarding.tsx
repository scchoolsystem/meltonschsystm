import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/boarding")({ component: () => (<FeatureGate feature="boarding"><Page /></FeatureGate>) });

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("matron");
  const [openD, setOpenD] = useState(false);
  const [openA, setOpenA] = useState(false);
  const [editingDorm, setEditingDorm] = useState<any>(null);
  const { data: dorms = [] } = useQuery({ queryKey: ["dorms"], queryFn: async () => (await supabase.from("dormitories").select("*").order("name")).data ?? [] });
  const { data: asg = [] } = useQuery({ queryKey: ["dorm_asg"], queryFn: async () => (await supabase.from("dorm_assignments").select("*, dormitories(name,beds), students(first_name,last_name,admission_no)").order("assigned_on", { ascending: false })).data ?? [] });
  const { data: staffMap = {} } = useQuery({
    queryKey: ["dorm-matrons", dorms.length],
    enabled: dorms.length > 0,
    queryFn: async () => {
      const ids = Array.from(new Set((dorms as any[]).map((d:any) => d.matron_id).filter(Boolean)));
      if (ids.length === 0) return {} as Record<string, string>;
      const { data } = await supabase.from("profiles").select("id,full_name").in("id", ids as string[]);
      const m: Record<string, string> = {};
      (data ?? []).forEach((p: any) => { m[p.id] = p.full_name; });
      return m;
    },
  });
  const occupancy = (dormId: string) => (asg as any[]).filter((a:any) => a.dormitory_id === dormId).length;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["dorms"] }); qc.invalidateQueries({ queryKey: ["dorm_asg"] }); };
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div><h1 className="text-3xl font-bold">Boarding</h1><p className="text-sm text-muted-foreground mt-1">Dormitories &amp; assignments</p></div>
      <Tabs defaultValue="dorms">
        <TabsList><TabsTrigger value="dorms">Dormitories ({dorms.length})</TabsTrigger><TabsTrigger value="asg">Assignments ({asg.length})</TabsTrigger></TabsList>
        <TabsContent value="dorms">
          <Card><CardHeader className="flex-row items-center justify-between">
            <span className="font-semibold">All Dorms</span>
            {can && <Dialog open={openD} onOpenChange={setOpenD}><DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-2" />Add Dorm</Button></DialogTrigger>
              <AddDorm onDone={() => { setOpenD(false); refresh(); }} /></Dialog>}
          </CardHeader><CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Gender</TableHead><TableHead>Matron</TableHead><TableHead className="text-right">Beds</TableHead><TableHead className="text-right">Occupancy</TableHead><TableHead className="text-right">Capacity</TableHead>{can && <TableHead />}</TableRow></TableHeader>
              <TableBody>
                {dorms.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No dorms.</TableCell></TableRow>}
                {(dorms as any[]).map((d:any) => {
                  const occ = occupancy(d.id);
                  const full = occ >= d.capacity;
                  const beds = d.beds ?? d.capacity;
                  const bedsFree = Math.max(0, beds - occ);
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell className="capitalize">{d.gender}</TableCell>
                      <TableCell>{(staffMap as any)[d.matron_id] ?? "—"}</TableCell>
                      <TableCell className="text-right">{beds} total · <span style={{color:bedsFree===0?"red":"green"}}>{bedsFree} free</span></TableCell>
                      <TableCell className={"text-right font-mono "+(full?"text-destructive font-semibold":"")}>{occ}</TableCell>
                      <TableCell className="text-right">{d.capacity}</TableCell>
                      {can && <TableCell className="text-right"><button onClick={() => setEditingDorm(d)} className="text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button></TableCell>}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="asg">
          <Card><CardHeader className="flex-row items-center justify-between">
            <span className="font-semibold">All Assignments</span>
            {can && <Dialog open={openA} onOpenChange={setOpenA}><DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-2" />Assign Student</Button></DialogTrigger>
              <Assign dorms={dorms as any[]} onDone={() => { setOpenA(false); refresh(); }} /></Dialog>}
          </CardHeader><CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Adm No</TableHead><TableHead>Dorm</TableHead><TableHead>Bed No</TableHead><TableHead>Since</TableHead></TableRow></TableHeader>
              <TableBody>
                {asg.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No assignments.</TableCell></TableRow>}
                {(asg as any[]).map((a:any) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.students?.first_name} {a.students?.last_name}</TableCell>
                    <TableCell className="font-mono text-xs">{a.students?.admission_no}</TableCell>
                    <TableCell>{a.dormitories?.name}</TableCell>
                    <TableCell className="font-mono">{a.bed_no ?? "—"}</TableCell>
                    <TableCell className="text-xs">{a.assigned_on}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
      {editingDorm && <EditDormDialog dorm={editingDorm} onDone={() => { setEditingDorm(null); refresh(); }} onClose={() => setEditingDorm(null)} />}
    </div>
  );
}

function AddDorm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: "", gender: "male", capacity: 40, beds: 40 });
  const m = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("dormitories").insert(f); if (error) throw error; },
    onSuccess: () => { toast.success("Dorm added"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent><DialogHeader><DialogTitle>New Dormitory</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Name</Label><Input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Gender</Label>
            <Select value={f.gender} onValueChange={v => setF({ ...f, gender: v })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label>Capacity (students)</Label><Input type="number" min={1} value={f.capacity} onChange={e => setF({ ...f, capacity: +e.target.value })} /></div>
        </div>
        <div>
          <Label>Number of Beds</Label>
          <div className="flex gap-2 mt-1">
            <button type="button" onClick={() => setF(x => ({ ...x, beds: Math.max(1, x.beds - 1) }))} className="px-3 py-1 rounded border text-lg font-bold hover:bg-secondary">−</button>
            <Input type="number" min={1} value={f.beds} onChange={e => setF({ ...f, beds: +e.target.value })} className="text-center" />
            <button type="button" onClick={() => setF(x => ({ ...x, beds: x.beds + 1 }))} className="px-3 py-1 rounded border text-lg font-bold hover:bg-secondary">+</button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Students are auto-assigned bed 1–{f.beds} on admission.</p>
        </div>
        <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function EditDormDialog({ dorm, onDone, onClose }: { dorm: any; onDone: () => void; onClose: () => void }) {
  const [f, setF] = useState({ name: dorm.name, gender: dorm.gender, capacity: dorm.capacity, beds: dorm.beds ?? dorm.capacity });
  const m = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("dormitories").update({ name: f.name, gender: f.gender, capacity: f.capacity, beds: f.beds }).eq("id", dorm.id); if (error) throw error; },
    onSuccess: () => { toast.success("Dorm updated"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent><DialogHeader><DialogTitle>Edit {dorm.name}</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <div><Label>Name</Label><Input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Gender</Label>
              <Select value={f.gender} onValueChange={v => setF({ ...f, gender: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Capacity (students)</Label><Input type="number" min={1} value={f.capacity} onChange={e => setF({ ...f, capacity: +e.target.value })} /></div>
          </div>
          <div>
            <Label>Number of Beds</Label>
            <div className="flex gap-2 mt-1">
              <button type="button" onClick={() => setF(x => ({ ...x, beds: Math.max(1, x.beds - 1) }))} className="px-3 py-1 rounded border text-lg font-bold hover:bg-secondary">−</button>
              <Input type="number" min={1} value={f.beds} onChange={e => setF({ ...f, beds: +e.target.value })} className="text-center" />
              <button type="button" onClick={() => setF(x => ({ ...x, beds: x.beds + 1 }))} className="px-3 py-1 rounded border text-lg font-bold hover:bg-secondary">+</button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Current: {f.beds} beds. Use + / − to adjust.</p>
          </div>
          <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save Changes</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Assign({ dorms, onDone }: { dorms: any[]; onDone: () => void }) {
  const [f, setF] = useState({ dormitory_id: "", student_id: "", bed_no: "" });
  const { data: students = [] } = useQuery({ queryKey: ["students-min5"], queryFn: async () => (await supabase.from("students").select("id,admission_no,first_name,last_name").eq("lifecycle_status","active").limit(500)).data ?? [] });
  const selectedDorm = dorms.find((d:any) => d.id === f.dormitory_id);
  const beds = selectedDorm?.beds ?? selectedDorm?.capacity ?? 40;
  const m = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("dorm_assignments").insert({ dormitory_id: f.dormitory_id, student_id: f.student_id, bed_no: f.bed_no ? +f.bed_no : null }); if (error) throw error; },
    onSuccess: () => { toast.success("Assigned"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent><DialogHeader><DialogTitle>Assign Student to Dorm</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Dorm</Label>
          <Select value={f.dormitory_id} onValueChange={v => setF({ ...f, dormitory_id: v, bed_no: "" })}>
            <SelectTrigger><SelectValue placeholder="Choose dorm" /></SelectTrigger>
            <SelectContent>{dorms.map((d:any) => <SelectItem key={d.id} value={d.id}>{d.name} ({d.gender})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Student</Label>
          <Select value={f.student_id} onValueChange={v => setF({ ...f, student_id: v })}>
            <SelectTrigger><SelectValue placeholder="Choose student" /></SelectTrigger>
            <SelectContent>{(students as any[]).map((s:any) => <SelectItem key={s.id} value={s.id}>{s.admission_no} – {s.first_name} {s.last_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Bed No (1–{beds})</Label><Input type="number" min={1} max={beds} value={f.bed_no} onChange={e => setF({ ...f, bed_no: e.target.value })} placeholder="Leave blank to auto-assign" /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending || !f.dormitory_id || !f.student_id}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Assign</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}