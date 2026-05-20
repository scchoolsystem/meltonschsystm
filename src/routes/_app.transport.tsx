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
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/transport")({ component: () => (<FeatureGate feature="transport"><Page /></FeatureGate>) });

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("transport_officer");
  const [openR, setOpenR] = useState(false); const [openA, setOpenA] = useState(false);
  const { data: routes = [] } = useQuery({ queryKey: ["t_routes"], queryFn: async () => (await supabase.from("transport_routes").select("*").order("name")).data ?? [] });
  const { data: asg = [] } = useQuery({ queryKey: ["t_asg"], queryFn: async () => (await supabase.from("transport_assignments").select("*, transport_routes(name), students(first_name,last_name,admission_no)").order("assigned_on", { ascending: false })).data ?? [] });
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div><h1 className="text-3xl font-bold">Transport</h1><p className="text-sm text-muted-foreground mt-1">Routes & student assignments</p></div>
      <Tabs defaultValue="routes">
        <TabsList><TabsTrigger value="routes">Routes ({routes.length})</TabsTrigger><TabsTrigger value="asg">Assignments ({asg.length})</TabsTrigger></TabsList>
        <TabsContent value="routes">
          <Card><CardHeader>
            {can && <Dialog open={openR} onOpenChange={setOpenR}><DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Add Route</Button></DialogTrigger>
              <AddRoute onDone={() => { setOpenR(false); qc.invalidateQueries({ queryKey: ["t_routes"] }); }} /></Dialog>}
          </CardHeader><CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Vehicle</TableHead><TableHead>Driver</TableHead><TableHead>Phone</TableHead><TableHead className="text-right">Assigned / Cap.</TableHead><TableHead className="text-right">Fee/mo</TableHead></TableRow></TableHeader>
              <TableBody>
                {routes.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No routes.</TableCell></TableRow>}
                {(routes as any[]).map(r => {
                  const used = (asg as any[]).filter(a => a.route_id === r.id).length;
                  const full = used >= r.capacity;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{r.vehicle_reg ?? "—"}</TableCell>
                      <TableCell>{r.driver_name ?? "—"}</TableCell>
                      <TableCell>{r.driver_phone ?? "—"}</TableCell>
                      <TableCell className={`text-right font-mono ${full ? 'text-destructive font-semibold' : ''}`}>{used} / {r.capacity}</TableCell>
                      <TableCell className="text-right font-mono">KES {Number(r.monthly_fee).toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="asg">
          <Card><CardHeader>
            {can && <Dialog open={openA} onOpenChange={setOpenA}><DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Assign Student</Button></DialogTrigger>
              <Assign routes={routes as any[]} onDone={() => { setOpenA(false); qc.invalidateQueries({ queryKey: ["t_asg"] }); }} /></Dialog>}
          </CardHeader><CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Adm No</TableHead><TableHead>Route</TableHead><TableHead>Pickup</TableHead></TableRow></TableHeader>
              <TableBody>
                {asg.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No assignments.</TableCell></TableRow>}
                {(asg as any[]).map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.students?.first_name} {a.students?.last_name}</TableCell>
                    <TableCell className="font-mono text-xs">{a.students?.admission_no}</TableCell>
                    <TableCell>{a.transport_routes?.name}</TableCell>
                    <TableCell>{a.pickup_point ?? "—"}</TableCell>
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

function AddRoute({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: "", vehicle_reg: "", driver_name: "", driver_phone: "", capacity: 40, monthly_fee: 0 });
  const m = useMutation({ mutationFn: async () => { const { error } = await supabase.from("transport_routes").insert(f); if (error) throw error; }, onSuccess: () => { toast.success("Route added"); onDone(); }, onError: (e: any) => toast.error(e.message) });
  return (
    <DialogContent><DialogHeader><DialogTitle>New Route</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Name</Label><Input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Vehicle Reg</Label><Input value={f.vehicle_reg} onChange={e => setF({ ...f, vehicle_reg: e.target.value })} /></div>
          <div><Label>Capacity</Label><Input type="number" value={f.capacity} onChange={e => setF({ ...f, capacity: +e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Driver Name</Label><Input value={f.driver_name} onChange={e => setF({ ...f, driver_name: e.target.value })} /></div>
          <div><Label>Driver Phone</Label><Input value={f.driver_phone} onChange={e => setF({ ...f, driver_phone: e.target.value })} /></div>
        </div>
        <div><Label>Monthly Fee (KES)</Label><Input type="number" min={0} value={f.monthly_fee} onChange={e => setF({ ...f, monthly_fee: +e.target.value })} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function Assign({ routes, onDone }: { routes: any[]; onDone: () => void }) {
  const [f, setF] = useState({ route_id: "", student_id: "", pickup_point: "" });
  const { data: students = [] } = useQuery({ queryKey: ["students-min6"], queryFn: async () => (await supabase.from("students").select("id,admission_no,first_name,last_name").limit(500)).data ?? [] });
  const m = useMutation({ mutationFn: async () => { const { error } = await supabase.from("transport_assignments").insert(f); if (error) throw error; }, onSuccess: () => { toast.success("Assigned"); onDone(); }, onError: (e: any) => toast.error(e.message) });
  return (
    <DialogContent><DialogHeader><DialogTitle>Assign Student to Route</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Route</Label>
          <Select value={f.route_id} onValueChange={v => setF({ ...f, route_id: v })}>
            <SelectTrigger><SelectValue placeholder="Choose route" /></SelectTrigger>
            <SelectContent>{routes.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Student</Label>
          <Select value={f.student_id} onValueChange={v => setF({ ...f, student_id: v })}>
            <SelectTrigger><SelectValue placeholder="Choose student" /></SelectTrigger>
            <SelectContent>{(students as any[]).map(s => <SelectItem key={s.id} value={s.id}>{s.admission_no} – {s.first_name} {s.last_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Pickup Point</Label><Input value={f.pickup_point} onChange={e => setF({ ...f, pickup_point: e.target.value })} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending || !f.route_id || !f.student_id}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Assign</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
