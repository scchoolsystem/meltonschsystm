import { createFileRoute } from "@tanstack/react-router";
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
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/boarding")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("matron");
  const [openD, setOpenD] = useState(false); const [openA, setOpenA] = useState(false);
  const { data: dorms = [] } = useQuery({ queryKey: ["dorms"], queryFn: async () => (await supabase.from("dormitories").select("*").order("name")).data ?? [] });
  const { data: asg = [] } = useQuery({ queryKey: ["dorm_asg"], queryFn: async () => (await supabase.from("dorm_assignments").select("*, dormitories(name), students(first_name,last_name,admission_no)").order("assigned_on", { ascending: false })).data ?? [] });
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div><h1 className="text-3xl font-bold">Boarding</h1><p className="text-sm text-muted-foreground mt-1">Dormitories & assignments</p></div>
      <Tabs defaultValue="dorms">
        <TabsList><TabsTrigger value="dorms">Dormitories ({dorms.length})</TabsTrigger><TabsTrigger value="asg">Assignments ({asg.length})</TabsTrigger></TabsList>
        <TabsContent value="dorms">
          <Card><CardHeader>
            {can && <Dialog open={openD} onOpenChange={setOpenD}><DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Add Dorm</Button></DialogTrigger>
              <AddDorm onDone={() => { setOpenD(false); qc.invalidateQueries({ queryKey: ["dorms"] }); }} /></Dialog>}
          </CardHeader><CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Gender</TableHead><TableHead className="text-right">Capacity</TableHead></TableRow></TableHeader>
              <TableBody>
                {dorms.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No dorms.</TableCell></TableRow>}
                {(dorms as any[]).map(d => <TableRow key={d.id}><TableCell className="font-medium">{d.name}</TableCell><TableCell className="capitalize">{d.gender}</TableCell><TableCell className="text-right">{d.capacity}</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="asg">
          <Card><CardHeader>
            {can && <Dialog open={openA} onOpenChange={setOpenA}><DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Assign Student</Button></DialogTrigger>
              <Assign dorms={dorms as any[]} onDone={() => { setOpenA(false); qc.invalidateQueries({ queryKey: ["dorm_asg"] }); }} /></Dialog>}
          </CardHeader><CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Adm No</TableHead><TableHead>Dorm</TableHead><TableHead>Bed</TableHead><TableHead>Since</TableHead></TableRow></TableHeader>
              <TableBody>
                {asg.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No assignments.</TableCell></TableRow>}
                {(asg as any[]).map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.students?.first_name} {a.students?.last_name}</TableCell>
                    <TableCell className="font-mono text-xs">{a.students?.admission_no}</TableCell>
                    <TableCell>{a.dormitories?.name}</TableCell>
                    <TableCell>{a.bed_no ?? "—"}</TableCell>
                    <TableCell className="text-xs">{a.assigned_on}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AddDorm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: "", gender: "male", capacity: 40 });
  const m = useMutation({ mutationFn: async () => { const { error } = await supabase.from("dormitories").insert(f); if (error) throw error; }, onSuccess: () => { toast.success("Dorm added"); onDone(); }, onError: (e: any) => toast.error(e.message) });
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
          <div><Label>Capacity</Label><Input type="number" min={1} value={f.capacity} onChange={e => setF({ ...f, capacity: +e.target.value })} /></div>
        </div>
        <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function Assign({ dorms, onDone }: { dorms: any[]; onDone: () => void }) {
  const [f, setF] = useState({ dormitory_id: "", student_id: "", bed_no: "" });
  const { data: students = [] } = useQuery({ queryKey: ["students-min5"], queryFn: async () => (await supabase.from("students").select("id,admission_no,first_name,last_name").limit(500)).data ?? [] });
  const m = useMutation({ mutationFn: async () => { const { error } = await supabase.from("dorm_assignments").insert(f); if (error) throw error; }, onSuccess: () => { toast.success("Assigned"); onDone(); }, onError: (e: any) => toast.error(e.message) });
  return (
    <DialogContent><DialogHeader><DialogTitle>Assign Student to Dorm</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Dorm</Label>
          <Select value={f.dormitory_id} onValueChange={v => setF({ ...f, dormitory_id: v })}>
            <SelectTrigger><SelectValue placeholder="Choose dorm" /></SelectTrigger>
            <SelectContent>{dorms.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Student</Label>
          <Select value={f.student_id} onValueChange={v => setF({ ...f, student_id: v })}>
            <SelectTrigger><SelectValue placeholder="Choose student" /></SelectTrigger>
            <SelectContent>{(students as any[]).map(s => <SelectItem key={s.id} value={s.id}>{s.admission_no} – {s.first_name} {s.last_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Bed No</Label><Input value={f.bed_no} onChange={e => setF({ ...f, bed_no: e.target.value })} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending || !f.dormitory_id || !f.student_id}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Assign</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
