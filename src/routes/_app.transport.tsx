import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Bus, ChevronDown, ChevronUp, Phone, User } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";

export const Route = createFileRoute("/_app/transport")({ component: () => (<FeatureGate feature="transport"><Page /></FeatureGate>) });

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("transport_officer") || hasRole("transport_admin");

  const { data: routes = [], isLoading: rLoading } = useQuery({
    queryKey: ["transport-routes"],
    queryFn: async () => (await supabase.from("transport_routes").select("*").order("name")).data ?? [],
  });
  const { data: assignments = [], isLoading: aLoading } = useQuery({
    queryKey: ["transport-assignments"],
    queryFn: async () => (await supabase.from("transport_assignments").select("*, students(id,first_name,last_name,admission_no), transport_routes(name,monthly_fee)").order("assigned_on", { ascending: false })).data ?? [],
  });
  const { data: logs = [] } = useQuery({
    queryKey: ["transport-logs"],
    queryFn: async () => (await supabase.from("transport_daily_log").select("*, transport_routes(name)").order("log_date", { ascending: false }).limit(100)).data ?? [],
  });

  const [addRoute, setAddRoute] = useState(false);
  const [addAssign, setAddAssign] = useState(false);
  const [addLog, setAddLog] = useState(false);
  const [expandedRoute, setExpandedRoute] = useState<string | null>(null);

  const studentsOnRoute = (routeId: string) => (assignments as any[]).filter(a => a.route_id === routeId);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div><h1 className="text-3xl font-bold">Transport</h1><p className="text-sm text-muted-foreground mt-1">{(routes as any[]).length} routes · {(assignments as any[]).length} students assigned</p></div>
        {can && (
          <div className="flex gap-2 flex-wrap">
            <Dialog open={addRoute} onOpenChange={setAddRoute}><DialogTrigger asChild><Button variant="outline"><Plus className="w-4 h-4 mr-2" />Route</Button></DialogTrigger>
              <RouteDialog onDone={() => { setAddRoute(false); qc.invalidateQueries({ queryKey: ["transport-routes"] }); }} />
            </Dialog>
            <Dialog open={addAssign} onOpenChange={setAddAssign}><DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Assign Student</Button></DialogTrigger>
              <AssignDialog routes={routes as any[]} onDone={() => { setAddAssign(false); qc.invalidateQueries({ queryKey: ["transport-assignments"] }); }} />
            </Dialog>
          </div>
        )}
      </div>

      <Tabs defaultValue="routes">
        <TabsList>
          <TabsTrigger value="routes">Routes</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="drivers">Driver Directory</TabsTrigger>
          <TabsTrigger value="log">Daily Log</TabsTrigger>
        </TabsList>

        <TabsContent value="routes">
          <Card><CardHeader /><CardContent>
            {rLoading ? <Loader2 className="animate-spin mx-auto" /> : (
              <div className="space-y-2">
                {(routes as any[]).length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No routes yet.</p>}
                {(routes as any[]).map((r: any) => {
                  const enrolled = studentsOnRoute(r.id);
                  const over = r.capacity && enrolled.length >= r.capacity;
                  return (
                    <div key={r.id} className="border rounded-md overflow-hidden">
                      <button className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors" onClick={() => setExpandedRoute(expandedRoute === r.id ? null : r.id)}>
                        <div className="flex items-center gap-3">
                          <Bus className="w-5 h-5 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{r.name}</div>
                            <div className="text-xs text-muted-foreground">{r.vehicle_reg ?? "No reg"} · {r.driver_name ?? "Driver TBA"}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {over && <Badge variant="destructive">At capacity</Badge>}
                          <Badge variant="outline">{enrolled.length}{r.capacity ? `/${r.capacity}` : ""} students</Badge>
                          <span className="text-xs text-muted-foreground">KES {Number(r.monthly_fee ?? 0).toLocaleString()}/mo</span>
                          {expandedRoute === r.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </button>
                      {expandedRoute === r.id && (
                        <div className="border-t bg-muted/20 p-4">
                          {enrolled.length === 0 ? <p className="text-sm text-muted-foreground">No students assigned to this route.</p> : (
                            <Table>
                              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Admission No</TableHead><TableHead>Pickup Point</TableHead><TableHead>Class</TableHead></TableRow></TableHeader>
                              <TableBody>
                                {enrolled.map((a: any) => (
                                  <TableRow key={a.id}>
                                    <TableCell>{a.students?.first_name} {a.students?.last_name}</TableCell>
                                    <TableCell className="text-muted-foreground">{a.students?.admission_no}</TableCell>
                                    <TableCell>{a.pickup_point ?? "—"}</TableCell>
                                    <TableCell>{a.students?.classes?.name ?? "—"}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="assignments">
          <Card><CardHeader /><CardContent>
            {aLoading ? <Loader2 className="animate-spin mx-auto" /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Route</TableHead><TableHead>Pickup Point</TableHead><TableHead>Monthly Fee</TableHead><TableHead>Assigned On</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(assignments as any[]).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No assignments yet.</TableCell></TableRow>}
                  {(assignments as any[]).map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.students?.first_name} {a.students?.last_name}<div className="text-xs text-muted-foreground">{a.students?.admission_no}</div></TableCell>
                      <TableCell>{a.transport_routes?.name ?? "—"}</TableCell>
                      <TableCell>{a.pickup_point ?? "—"}</TableCell>
                      <TableCell>KES {Number(a.transport_routes?.monthly_fee ?? 0).toLocaleString()}
                        {Number(a.transport_routes?.monthly_fee ?? 0) > 0 && <div className="text-xs text-amber-600">Transport fee will be added to student's next invoice</div>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{a.assigned_on ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="drivers">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(routes as any[]).length === 0 && <p className="text-sm text-muted-foreground col-span-full py-8 text-center">No routes configured.</p>}
            {(routes as any[]).map((r: any) => (
              <Card key={r.id}>
                <CardContent className="pt-5 space-y-2">
                  <div className="flex items-center gap-2 font-semibold"><Bus className="w-4 h-4 text-muted-foreground" />{r.name}</div>
                  <div className="text-sm flex items-center gap-2"><User className="w-3 h-3 text-muted-foreground" />{r.driver_name ?? "Driver TBA"}</div>
                  {r.driver_phone && <div className="text-sm flex items-center gap-2"><Phone className="w-3 h-3 text-muted-foreground" />{r.driver_phone}</div>}
                  <div className="text-xs text-muted-foreground">{r.vehicle_reg ?? "No vehicle reg"}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="log">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-lg">Daily Boarding Log</h2>
            {can && <Dialog open={addLog} onOpenChange={setAddLog}><DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-2" />Log Boarding</Button></DialogTrigger>
              <LogDialog routes={routes as any[]} onDone={() => { setAddLog(false); qc.invalidateQueries({ queryKey: ["transport-logs"] }); }} />
            </Dialog>}
          </div>
          <Card><CardHeader /><CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Route</TableHead><TableHead>Boarded</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
              <TableBody>
                {(logs as any[]).length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No boarding logs yet.</TableCell></TableRow>}
                {(logs as any[]).map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.log_date}</TableCell>
                    <TableCell>{l.transport_routes?.name ?? "—"}</TableCell>
                    <TableCell><Badge>{l.boarded_count}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{l.notes ?? "—"}</TableCell>
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

function RouteDialog({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: "", vehicle_reg: "", driver_name: "", driver_phone: "", monthly_fee: "", capacity: "" });
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("transport_routes").insert({ ...f, monthly_fee: f.monthly_fee ? Number(f.monthly_fee) : null, capacity: f.capacity ? Number(f.capacity) : null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Route added"); onDone(); }, onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent><DialogHeader><DialogTitle>Add Route</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Route Name *</Label><Input required value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} /></div>
        <div><Label>Vehicle Reg</Label><Input value={f.vehicle_reg} onChange={e => setF(p => ({ ...p, vehicle_reg: e.target.value }))} /></div>
        <div><Label>Driver Name</Label><Input value={f.driver_name} onChange={e => setF(p => ({ ...p, driver_name: e.target.value }))} /></div>
        <div><Label>Driver Phone</Label><Input value={f.driver_phone} onChange={e => setF(p => ({ ...p, driver_phone: e.target.value }))} /></div>
        <div><Label>Monthly Fee (KES)</Label><Input type="number" value={f.monthly_fee} onChange={e => setF(p => ({ ...p, monthly_fee: e.target.value }))} /></div>
        <div><Label>Capacity</Label><Input type="number" value={f.capacity} onChange={e => setF(p => ({ ...p, capacity: e.target.value }))} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function AssignDialog({ routes, onDone }: { routes: any[]; onDone: () => void }) {
  const [f, setF] = useState({ student_id: "", route_id: "", pickup_point: "" });
  const { data: students = [] } = useQuery({ queryKey: ["students-min-transport"], queryFn: async () => (await supabase.from("students").select("id,admission_no,first_name,last_name").order("first_name")).data ?? [] });
  const selectedRoute = routes.find(r => r.id === f.route_id);
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("transport_assignments").insert(f);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Student assigned"); onDone(); }, onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent><DialogHeader><DialogTitle>Assign Student to Route</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Student</Label>
          <Select value={f.student_id} onValueChange={v => setF(p => ({ ...p, student_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Choose student" /></SelectTrigger>
            <SelectContent>{(students as any[]).map(s => <SelectItem key={s.id} value={s.id}>{s.admission_no} – {s.first_name} {s.last_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Route</Label>
          <Select value={f.route_id} onValueChange={v => setF(p => ({ ...p, route_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Choose route" /></SelectTrigger>
            <SelectContent>{routes.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {selectedRoute?.monthly_fee > 0 && <p className="text-xs text-amber-600">Transport fee will be added to student's next invoice</p>}
        <div><Label>Pickup Point</Label><Input value={f.pickup_point} onChange={e => setF(p => ({ ...p, pickup_point: e.target.value }))} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending || !f.student_id || !f.route_id}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Assign</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function LogDialog({ routes, onDone }: { routes: any[]; onDone: () => void }) {
  const [f, setF] = useState({ route_id: "", log_date: format(new Date(), "yyyy-MM-dd"), boarded_count: "", notes: "" });
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("transport_daily_log").upsert({ ...f, boarded_count: Number(f.boarded_count) }, { onConflict: "route_id,log_date" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Log saved"); onDone(); }, onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent><DialogHeader><DialogTitle>Log Daily Boarding</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Route</Label>
          <Select value={f.route_id} onValueChange={v => setF(p => ({ ...p, route_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Choose route" /></SelectTrigger>
            <SelectContent>{routes.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Date</Label><Input type="date" value={f.log_date} onChange={e => setF(p => ({ ...p, log_date: e.target.value }))} /></div>
        <div><Label>Students Boarded *</Label><Input required type="number" min={0} value={f.boarded_count} onChange={e => setF(p => ({ ...p, boarded_count: e.target.value }))} /></div>
        <div><Label>Notes</Label><Input value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending || !f.route_id}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
