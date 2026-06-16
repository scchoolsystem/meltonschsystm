import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, CheckCircle, XCircle, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";

export const Route = createFileRoute("/_app/security")({ component: () => (<FeatureGate feature="security"><Page /></FeatureGate>) });

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("security_admin") || hasRole("security_user");

  const today = format(new Date(), "yyyy-MM-dd");

  const { data: gatePasses = [], isLoading: gpLoading } = useQuery({
    queryKey: ["gate-passes-all"],
    queryFn: async () => (await supabase.from("gate_passes").select("*, students(first_name,last_name,admission_no)").order("exit_time", { ascending: false }).limit(100)).data ?? [],
  });
  const { data: visitors = [] } = useQuery({
    queryKey: ["visitor-log"],
    queryFn: async () => (await supabase.from("visitor_log").select("*").order("time_in", { ascending: false }).limit(100)).data ?? [],
  });
  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicle-log"],
    queryFn: async () => (await supabase.from("vehicle_log").select("*").order("time_in", { ascending: false }).limit(100)).data ?? [],
  });
  const { data: totalStudents = 0 } = useQuery({
    queryKey: ["total-active-students"],
    queryFn: async () => { const { count } = await supabase.from("students").select("id", { count: "exact", head: true }).eq("active", true); return count ?? 0; },
  });

  const pendingPasses = useMemo(() => (gatePasses as any[]).filter(g => g.status === "pending"), [gatePasses]);
  const openGatePasses = useMemo(() => (gatePasses as any[]).filter(g => g.exit_time?.startsWith(today) && !g.return_time), [gatePasses, today]);
  const studentsOnCampus = (typeof totalStudents === "number" ? totalStudents : 0) - openGatePasses.length;

  const approvalMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("gate_passes").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gate-passes-all"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const timeOutMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("visitor_log").update({ time_out: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visitor-log"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const vehicleTimeOutMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicle_log").update({ time_out: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicle-log"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const [addVisitor, setAddVisitor] = useState(false);
  const [addVehicle, setAddVehicle] = useState(false);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div><h1 className="text-3xl font-bold">Security</h1></div>
        {can && (
          <div className="flex gap-2">
            <Dialog open={addVisitor} onOpenChange={setAddVisitor}><DialogTrigger asChild><Button variant="outline"><Plus className="w-4 h-4 mr-2" />Visitor</Button></DialogTrigger>
              <VisitorDialog onDone={() => { setAddVisitor(false); qc.invalidateQueries({ queryKey: ["visitor-log"] }); }} />
            </Dialog>
            <Dialog open={addVehicle} onOpenChange={setAddVehicle}><DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Vehicle</Button></DialogTrigger>
              <VehicleDialog onDone={() => { setAddVehicle(false); qc.invalidateQueries({ queryKey: ["vehicle-log"] }); }} />
            </Dialog>
          </div>
        )}
      </div>

      {/* On-campus count */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-4 flex items-center gap-4">
          <Users className="w-8 h-8 text-primary" />
          <div>
            <div className="text-2xl font-bold">{studentsOnCampus}</div>
            <div className="text-sm text-muted-foreground">Students currently on campus <span className="text-xs">({openGatePasses.length} off-campus today)</span></div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="gatepasses">
        <TabsList>
          <TabsTrigger value="gatepasses">
            Gate Pass Queue
            {pendingPasses.length > 0 && <Badge variant="destructive" className="ml-2">{pendingPasses.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="allpasses">All Gate Passes</TabsTrigger>
          <TabsTrigger value="visitors">Visitors</TabsTrigger>
          <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
        </TabsList>

        <TabsContent value="gatepasses">
          <Card><CardHeader><CardTitle className="text-base">Pending Gate Pass Approvals</CardTitle></CardHeader><CardContent>
            {gpLoading ? <Loader2 className="animate-spin mx-auto" /> : pendingPasses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No pending gate passes.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Reason</TableHead><TableHead>Exit Time</TableHead><TableHead>Return Time</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {pendingPasses.map((g: any) => (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{g.students?.first_name} {g.students?.last_name}<div className="text-xs text-muted-foreground">{g.students?.admission_no}</div></TableCell>
                      <TableCell>{g.reason}</TableCell>
                      <TableCell className="text-xs">{g.exit_time ? new Date(g.exit_time).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-xs">{g.return_time ? new Date(g.return_time).toLocaleString() : "—"}</TableCell>
                      <TableCell>
                        {can && (
                          <div className="flex gap-2">
                            <Button size="sm" className="h-8 gap-1" onClick={() => approvalMutation.mutate({ id: g.id, status: "approved" })}><CheckCircle className="w-3 h-3" />Approve</Button>
                            <Button size="sm" variant="destructive" className="h-8 gap-1" onClick={() => approvalMutation.mutate({ id: g.id, status: "denied" })}><XCircle className="w-3 h-3" />Deny</Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="allpasses">
          <Card><CardHeader /><CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Reason</TableHead><TableHead>Exit</TableHead><TableHead>Return</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {(gatePasses as any[]).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No gate passes.</TableCell></TableRow>}
                {(gatePasses as any[]).map((g: any) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.students?.first_name} {g.students?.last_name}</TableCell>
                    <TableCell>{g.reason}</TableCell>
                    <TableCell className="text-xs">{g.exit_time ? new Date(g.exit_time).toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-xs">{g.return_time ? new Date(g.return_time).toLocaleString() : "—"}</TableCell>
                    <TableCell><Badge variant={g.status === "approved" ? "default" : g.status === "denied" ? "destructive" : "secondary"}>{g.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="visitors">
          <Card><CardHeader /><CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Visitor</TableHead><TableHead>ID No</TableHead><TableHead>Visiting</TableHead><TableHead>Purpose</TableHead><TableHead>Time In</TableHead><TableHead>Time Out</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {(visitors as any[]).length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No visitor logs.</TableCell></TableRow>}
                {(visitors as any[]).map((v: any) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.visitor_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{v.id_number ?? "—"}</TableCell>
                    <TableCell>{v.visiting ?? "—"}</TableCell>
                    <TableCell>{v.purpose ?? "—"}</TableCell>
                    <TableCell className="text-xs">{new Date(v.time_in).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{v.time_out ? new Date(v.time_out).toLocaleString() : <Badge variant="secondary">On campus</Badge>}</TableCell>
                    <TableCell>
                      {can && !v.time_out && <Button size="sm" variant="outline" className="h-8" onClick={() => timeOutMutation.mutate(v.id)}>Sign Out</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="vehicles">
          <Card><CardHeader /><CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Reg</TableHead><TableHead>Driver</TableHead><TableHead>Purpose</TableHead><TableHead>Time In</TableHead><TableHead>Time Out</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {(vehicles as any[]).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No vehicle logs.</TableCell></TableRow>}
                {(vehicles as any[]).map((v: any) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.vehicle_reg}</TableCell>
                    <TableCell>{v.driver_name ?? "—"}</TableCell>
                    <TableCell>{v.purpose ?? "—"}</TableCell>
                    <TableCell className="text-xs">{new Date(v.time_in).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{v.time_out ? new Date(v.time_out).toLocaleString() : <Badge variant="secondary">On campus</Badge>}</TableCell>
                    <TableCell>
                      {can && !v.time_out && <Button size="sm" variant="outline" className="h-8" onClick={() => vehicleTimeOutMutation.mutate(v.id)}>Log Exit</Button>}
                    </TableCell>
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

function VisitorDialog({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ visitor_name: "", id_number: "", visiting: "", purpose: "" });
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("visitor_log").insert({ ...f, logged_by: u.user?.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Visitor logged"); onDone(); }, onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent><DialogHeader><DialogTitle>Log Visitor</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Visitor Name *</Label><Input required value={f.visitor_name} onChange={e => setF(p => ({ ...p, visitor_name: e.target.value }))} /></div>
        <div><Label>ID Number</Label><Input value={f.id_number} onChange={e => setF(p => ({ ...p, id_number: e.target.value }))} /></div>
        <div><Label>Visiting (student/staff name)</Label><Input value={f.visiting} onChange={e => setF(p => ({ ...p, visiting: e.target.value }))} /></div>
        <div><Label>Purpose</Label><Input value={f.purpose} onChange={e => setF(p => ({ ...p, purpose: e.target.value }))} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Log In</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function VehicleDialog({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ vehicle_reg: "", driver_name: "", purpose: "" });
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("vehicle_log").insert({ ...f, logged_by: u.user?.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Vehicle logged"); onDone(); }, onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent><DialogHeader><DialogTitle>Log Vehicle</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Vehicle Reg *</Label><Input required value={f.vehicle_reg} onChange={e => setF(p => ({ ...p, vehicle_reg: e.target.value }))} /></div>
        <div><Label>Driver Name</Label><Input value={f.driver_name} onChange={e => setF(p => ({ ...p, driver_name: e.target.value }))} /></div>
        <div><Label>Purpose</Label><Input value={f.purpose} onChange={e => setF(p => ({ ...p, purpose: e.target.value }))} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Log Entry</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
