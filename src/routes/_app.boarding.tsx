import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";

export const Route = createFileRoute("/_app/boarding")({ component: () => (<FeatureGate feature="boarding"><Page /></FeatureGate>) });

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("matron") || hasRole("boarding_admin") || hasRole("boarding_user");

  const { data: dorms = [], isLoading: dLoading } = useQuery({
    queryKey: ["dormitories"],
    queryFn: async () => (await supabase.from("dormitories").select("*").order("name")).data ?? [],
  });
  const { data: assignments = [], isLoading: aLoading } = useQuery({
    queryKey: ["dorm-assignments"],
    queryFn: async () => (await supabase.from("dorm_assignments").select("*, students(id,first_name,last_name,admission_no), dormitories(name,gender)").order("assigned_on", { ascending: false })).data ?? [],
  });
  const { data: maintenance = [] } = useQuery({
    queryKey: ["dorm-maintenance"],
    queryFn: async () => (await supabase.from("dorm_maintenance").select("*, dormitories(name)").order("created_at", { ascending: false })).data ?? [],
  });
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: rollCalls = [] } = useQuery({
    queryKey: ["roll-call", today],
    queryFn: async () => (await supabase.from("boarding_roll_call").select("student_id,status").eq("roll_date", today)).data ?? [],
  });
  const { data: gatePasses = [] } = useQuery({
    queryKey: ["gate-passes-tonight"],
    queryFn: async () => (await supabase.from("gate_passes").select("*, students(first_name,last_name,admission_no)").gte("exit_time", today).is("return_time", null).order("exit_time", { ascending: false })).data ?? [],
  });

  const [addDorm, setAddDorm] = useState(false);
  const [addAssign, setAddAssign] = useState(false);
  const [addMaint, setAddMaint] = useState(false);
  const [welfareSheet, setWelfareSheet] = useState<any | null>(null);
  const [rollCallDorm, setRollCallDorm] = useState<string>(dorms.length > 0 ? (dorms as any[])[0]?.id : "");

  const rollCallMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of rollCalls as any[]) m[r.student_id] = r.status;
    return m;
  }, [rollCalls]);

  const rollMutation = useMutation({
    mutationFn: async ({ student_id, dorm_id, status }: any) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("boarding_roll_call").upsert({ student_id, dorm_id, status, roll_date: today, recorded_by: u.user?.id }, { onConflict: "student_id,roll_date" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roll-call", today] }),
    onError: (e: any) => toast.error(e.message),
  });

  const maintMutation = useMutation({
    mutationFn: async ({ id, status }: any) => {
      const { error } = await supabase.from("dorm_maintenance").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dorm-maintenance"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const welfareMutation = useMutation({
    mutationFn: async ({ id, notes }: any) => {
      const { error } = await supabase.from("dorm_assignments").update({ welfare_notes: notes }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dorm-assignments"] }); toast.success("Welfare note saved"); setWelfareSheet(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const activeAssignments = (assignments as any[]).filter(a => a.active !== false);
  const dormAssignees = (dormId: string) => activeAssignments.filter(a => a.dormitory_id === dormId);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div><h1 className="text-3xl font-bold">Boarding</h1><p className="text-sm text-muted-foreground">{activeAssignments.length} boarders assigned</p></div>
        {can && (
          <div className="flex gap-2 flex-wrap">
            <Dialog open={addDorm} onOpenChange={setAddDorm}><DialogTrigger asChild><Button variant="outline"><Plus className="w-4 h-4 mr-2" />Dorm</Button></DialogTrigger>
              <DormDialog onDone={() => { setAddDorm(false); qc.invalidateQueries({ queryKey: ["dormitories"] }); }} />
            </Dialog>
            <Dialog open={addAssign} onOpenChange={setAddAssign}><DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Assign Student</Button></DialogTrigger>
              <AssignDialog dorms={dorms as any[]} onDone={() => { setAddAssign(false); qc.invalidateQueries({ queryKey: ["dorm-assignments"] }); }} />
            </Dialog>
          </div>
        )}
      </div>

      <Tabs defaultValue="dorms">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="dorms">Dorms</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="rollcall">Roll Call</TabsTrigger>
          <TabsTrigger value="out">Out Tonight</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
        </TabsList>

        <TabsContent value="dorms">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(dorms as any[]).map(d => (
              <Card key={d.id}>
                <CardContent className="pt-4">
                  <div className="font-semibold text-lg">{d.name}</div>
                  <div className="text-sm text-muted-foreground">{d.gender ?? "Mixed"}</div>
                  <div className="mt-2 text-sm">{dormAssignees(d.id).length} / {d.capacity ?? "∞"} beds</div>
                </CardContent>
              </Card>
            ))}
            {(dorms as any[]).length === 0 && <p className="text-sm text-muted-foreground col-span-full py-8 text-center">No dormitories configured.</p>}
          </div>
        </TabsContent>

        <TabsContent value="assignments">
          <Card><CardHeader /><CardContent>
            {aLoading ? <Loader2 className="animate-spin mx-auto" /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Dorm</TableHead><TableHead>Bed No</TableHead><TableHead>Assigned</TableHead><TableHead>Welfare Notes</TableHead></TableRow></TableHeader>
                <TableBody>
                  {activeAssignments.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No assignments.</TableCell></TableRow>}
                  {activeAssignments.map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.students?.first_name} {a.students?.last_name}<div className="text-xs text-muted-foreground">{a.students?.admission_no}</div></TableCell>
                      <TableCell>{a.dormitories?.name}</TableCell>
                      <TableCell>{a.bed_no ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{a.assigned_on ?? "—"}</TableCell>
                      <TableCell>
                        <button className="text-xs text-primary hover:underline" onClick={() => can && setWelfareSheet(a)}>
                          {a.welfare_notes ? a.welfare_notes.slice(0, 40) + (a.welfare_notes.length > 40 ? "…" : "") : <span className="text-muted-foreground">{can ? "Add note" : "—"}</span>}
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="rollcall">
          <Card><CardContent className="pt-4">
            <div className="mb-4 flex items-center gap-3 flex-wrap">
              <Label>Dorm:</Label>
              <Select value={rollCallDorm} onValueChange={setRollCallDorm}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Choose dorm" /></SelectTrigger>
                <SelectContent>{(dorms as any[]).map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">{today}</span>
            </div>
            {rollCallDorm && (
              <Table>
                <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {dormAssignees(rollCallDorm).length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-8">No students in this dorm.</TableCell></TableRow>}
                  {dormAssignees(rollCallDorm).map((a: any) => {
                    const status = rollCallMap[a.student_id] ?? "present";
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.students?.first_name} {a.students?.last_name}</TableCell>
                        <TableCell>
                          {can ? (
                            <div className="flex gap-2">
                              <Button size="sm" variant={status === "present" ? "default" : "outline"} className="h-8 gap-1" onClick={() => rollMutation.mutate({ student_id: a.student_id, dorm_id: rollCallDorm, status: "present" })}>
                                <CheckCircle className="w-3 h-3" />Present
                              </Button>
                              <Button size="sm" variant={status === "absent" ? "destructive" : "outline"} className="h-8 gap-1" onClick={() => rollMutation.mutate({ student_id: a.student_id, dorm_id: rollCallDorm, status: "absent" })}>
                                <XCircle className="w-3 h-3" />Absent
                              </Button>
                            </div>
                          ) : (
                            <Badge variant={status === "absent" ? "destructive" : "default"}>{status}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="out">
          <Card><CardHeader><CardTitle className="text-base">Students off-campus tonight</CardTitle></CardHeader><CardContent>
            {(gatePasses as any[]).length === 0 ? <p className="text-sm text-muted-foreground">No open gate passes tonight.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Exit Time</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(gatePasses as any[]).map((g: any) => (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{g.students?.first_name} {g.students?.last_name}<div className="text-xs text-muted-foreground">{g.students?.admission_no}</div></TableCell>
                      <TableCell className="text-xs">{new Date(g.exit_time).toLocaleString()}</TableCell>
                      <TableCell>{g.reason}</TableCell>
                      <TableCell><Badge variant={g.status === "approved" ? "default" : g.status === "pending" ? "secondary" : "destructive"}>{g.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="maintenance">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold">Maintenance Requests</h2>
            {can && <Dialog open={addMaint} onOpenChange={setAddMaint}><DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-2" />New Request</Button></DialogTrigger>
              <MaintDialog dorms={dorms as any[]} onDone={() => { setAddMaint(false); qc.invalidateQueries({ queryKey: ["dorm-maintenance"] }); }} />
            </Dialog>}
          </div>
          <Card><CardHeader /><CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Dorm</TableHead><TableHead>Description</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
              <TableBody>
                {(maintenance as any[]).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No maintenance requests.</TableCell></TableRow>}
                {(maintenance as any[]).map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.dormitories?.name ?? "—"}</TableCell>
                    <TableCell>{m.description}</TableCell>
                    <TableCell><Badge variant={m.priority === "high" ? "destructive" : m.priority === "medium" ? "secondary" : "outline"}>{m.priority}</Badge></TableCell>
                    <TableCell>
                      {can ? (
                        <Select value={m.status} onValueChange={v => maintMutation.mutate({ id: m.id, status: v })}>
                          <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in progress">In Progress</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : <Badge variant="outline">{m.status}</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.created_at?.slice(0, 10)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <Sheet open={!!welfareSheet} onOpenChange={o => !o && setWelfareSheet(null)}>
        <SheetContent className="sm:max-w-md">
          {welfareSheet && <WelfareNotesPanel assignment={welfareSheet} onSave={(notes) => welfareMutation.mutate({ id: welfareSheet.id, notes })} loading={welfareMutation.isPending} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function WelfareNotesPanel({ assignment, onSave, loading }: { assignment: any; onSave: (n: string) => void; loading: boolean }) {
  const [notes, setNotes] = useState(assignment.welfare_notes ?? "");
  return (
    <>
      <SheetHeader><SheetTitle>Welfare Notes — {assignment.students?.first_name} {assignment.students?.last_name}</SheetTitle></SheetHeader>
      <div className="mt-4 space-y-3">
        <Textarea className="min-h-[200px]" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Enter welfare note…" />
        <Button onClick={() => onSave(notes)} disabled={loading}>{loading && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save Notes</Button>
      </div>
    </>
  );
}

function DormDialog({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: "", gender: "", capacity: "" });
  const m = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("dormitories").insert({ ...f, capacity: f.capacity ? Number(f.capacity) : null }); if (error) throw error; },
    onSuccess: () => { toast.success("Dorm added"); onDone(); }, onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent><DialogHeader><DialogTitle>Add Dormitory</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Name *</Label><Input required value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} /></div>
        <div><Label>Gender</Label>
          <Select value={f.gender} onValueChange={v => setF(p => ({ ...p, gender: v }))}><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
            <SelectContent><SelectItem value="boys">Boys</SelectItem><SelectItem value="girls">Girls</SelectItem><SelectItem value="mixed">Mixed</SelectItem></SelectContent>
          </Select>
        </div>
        <div><Label>Capacity</Label><Input type="number" value={f.capacity} onChange={e => setF(p => ({ ...p, capacity: e.target.value }))} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function AssignDialog({ dorms, onDone }: { dorms: any[]; onDone: () => void }) {
  const [f, setF] = useState({ student_id: "", dormitory_id: "", bed_no: "", assigned_on: format(new Date(), "yyyy-MM-dd") });
  const { data: students = [] } = useQuery({ queryKey: ["students-min-boarding"], queryFn: async () => (await supabase.from("students").select("id,admission_no,first_name,last_name").order("first_name")).data ?? [] });
  const m = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("dorm_assignments").insert({ ...f, bed_no: f.bed_no ? Number(f.bed_no) : null }); if (error) throw error; },
    onSuccess: () => { toast.success("Student assigned"); onDone(); }, onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent><DialogHeader><DialogTitle>Assign to Dorm</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Student</Label>
          <Select value={f.student_id} onValueChange={v => setF(p => ({ ...p, student_id: v }))}><SelectTrigger><SelectValue placeholder="Choose student" /></SelectTrigger>
            <SelectContent>{(students as any[]).map(s => <SelectItem key={s.id} value={s.id}>{s.admission_no} – {s.first_name} {s.last_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Dorm</Label>
          <Select value={f.dormitory_id} onValueChange={v => setF(p => ({ ...p, dormitory_id: v }))}><SelectTrigger><SelectValue placeholder="Choose dorm" /></SelectTrigger>
            <SelectContent>{dorms.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Bed Number</Label><Input value={f.bed_no} onChange={e => setF(p => ({ ...p, bed_no: e.target.value }))} /></div>
        <div><Label>Assigned On</Label><Input type="date" value={f.assigned_on} onChange={e => setF(p => ({ ...p, assigned_on: e.target.value }))} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending || !f.student_id || !f.dormitory_id}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Assign</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function MaintDialog({ dorms, onDone }: { dorms: any[]; onDone: () => void }) {
  const [f, setF] = useState({ dorm_id: "", description: "", priority: "medium" });
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("dorm_maintenance").insert({ ...f, reported_by: u.user?.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Request logged"); onDone(); }, onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent><DialogHeader><DialogTitle>Maintenance Request</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Dorm</Label>
          <Select value={f.dorm_id} onValueChange={v => setF(p => ({ ...p, dorm_id: v }))}><SelectTrigger><SelectValue placeholder="Choose dorm" /></SelectTrigger>
            <SelectContent>{dorms.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Description *</Label><Textarea required value={f.description} onChange={e => setF(p => ({ ...p, description: e.target.value }))} /></div>
        <div><Label>Priority</Label>
          <Select value={f.priority} onValueChange={v => setF(p => ({ ...p, priority: v }))}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent>
          </Select>
        </div>
        <DialogFooter><Button type="submit" disabled={m.isPending || !f.dorm_id}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Submit</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
