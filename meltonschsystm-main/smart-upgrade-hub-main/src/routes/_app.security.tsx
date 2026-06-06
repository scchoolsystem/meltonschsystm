import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/security")({ component: () => (<FeatureGate feature="security"><Page /></FeatureGate>) });

const SEV_STYLE: Record<string, string> = {
  low: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
  medium: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  high: "bg-orange-500/20 text-orange-700 dark:text-orange-300",
  critical: "bg-destructive/20 text-destructive",
};

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const canManage = isAdmin || hasRole("security_admin") || hasRole("security_user");
  const [passOpen, setPassOpen] = useState(false);
  const [incOpen, setIncOpen] = useState(false);

  const { data: passes = [] } = useQuery({
    queryKey: ["gate-passes"],
    queryFn: async () => (await supabase.from("gate_passes")
      .select("*, students(first_name,last_name,admission_no)")
      .order("exit_time", { ascending: false }).limit(50)).data ?? [],
  });
  const { data: incidents = [] } = useQuery({
    queryKey: ["incidents"],
    queryFn: async () => (await supabase.from("incident_reports").select("*").order("incident_date", { ascending: false }).limit(50)).data ?? [],
  });

  const checkIn = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("gate_passes").update({
        actual_return: new Date().toISOString(), status: "returned",
      }).eq("id", id); if (error) throw error;
    },
    onSuccess: () => { toast.success("Marked returned"); qc.invalidateQueries({ queryKey: ["gate-passes"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Security</h1>
        <p className="text-sm text-muted-foreground mt-1">Gate passes and incident reports.</p>
      </div>

      <Tabs defaultValue="passes">
        <TabsList>
          <TabsTrigger value="passes">Gate Passes</TabsTrigger>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
        </TabsList>

        <TabsContent value="passes">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
              <CardTitle className="text-base">Recent gate passes</CardTitle>
              {canManage && (
                <Dialog open={passOpen} onOpenChange={setPassOpen}>
                  <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />Issue pass</Button></DialogTrigger>
                  <AddPass onDone={() => { setPassOpen(false); qc.invalidateQueries({ queryKey: ["gate-passes"] }); }} />
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Reason</TableHead><TableHead>Out</TableHead><TableHead>Expected back</TableHead><TableHead>Actual back</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {passes.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No gate passes.</TableCell></TableRow>}
                  {(passes as any[]).map(p => {
                    const overdue = p.status === "out" && p.expected_return && new Date(p.expected_return) < new Date();
                    return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.students?.first_name} {p.students?.last_name} <span className="font-mono text-xs text-muted-foreground">{p.students?.admission_no}</span></TableCell>
                      <TableCell className="text-sm">{p.reason}</TableCell>
                      <TableCell className="text-xs">{new Date(p.exit_time).toLocaleString()}</TableCell>
                      <TableCell className={`text-xs ${overdue ? 'text-destructive font-semibold' : ''}`}>{p.expected_return ? new Date(p.expected_return).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-xs">{p.actual_return ? new Date(p.actual_return).toLocaleString() : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={overdue ? "destructive" : p.status === "out" ? "outline" : p.status === "returned" ? "default" : "destructive"} className="capitalize">{overdue ? "overdue" : p.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {p.status === "out" && canManage && (
                          <Button size="sm" variant="outline" onClick={() => checkIn.mutate(p.id)}><LogIn className="w-3 h-3 mr-1" />Check in</Button>
                        )}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="incidents">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
              <CardTitle className="text-base">Recent incidents</CardTitle>
              {canManage && (
                <Dialog open={incOpen} onOpenChange={setIncOpen}>
                  <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />Log incident</Button></DialogTrigger>
                  <AddIncident onDone={() => { setIncOpen(false); qc.invalidateQueries({ queryKey: ["incidents"] }); }} />
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Location</TableHead><TableHead>Description</TableHead><TableHead>Severity</TableHead></TableRow></TableHeader>
                <TableBody>
                  {incidents.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No incidents.</TableCell></TableRow>}
                  {(incidents as any[]).map(i => (
                    <TableRow key={i.id}>
                      <TableCell className="text-xs">{i.incident_date}</TableCell>
                      <TableCell className="font-medium">{i.location}</TableCell>
                      <TableCell className="text-sm">{i.description}</TableCell>
                      <TableCell><Badge className={`capitalize ${SEV_STYLE[i.severity] || ""}`}>{i.severity}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AddPass({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ student_id: "", reason: "", expected_return: "" });
  const { data: students = [] } = useQuery({
    queryKey: ["sec-students"],
    queryFn: async () => (await supabase.from("students").select("id,admission_no,first_name,last_name").eq("status", "active").order("admission_no").limit(500)).data ?? [],
  });
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const payload: any = { ...f, authorized_by: u.user?.id };
      if (!payload.expected_return) delete payload.expected_return;
      const { error } = await supabase.from("gate_passes").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Pass issued"); onDone(); }, onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Issue gate pass</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Student</Label>
          <Select value={f.student_id} onValueChange={v => setF({ ...f, student_id: v })}>
            <SelectTrigger><SelectValue placeholder="Choose student" /></SelectTrigger>
            <SelectContent>{(students as any[]).map(s => <SelectItem key={s.id} value={s.id}>{s.admission_no} – {s.first_name} {s.last_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Reason</Label><Input value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} required /></div>
        <div><Label>Expected return</Label><Input type="datetime-local" value={f.expected_return} onChange={e => setF({ ...f, expected_return: e.target.value })} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending || !f.student_id || !f.reason}>{m.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Issue</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function AddIncident({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ incident_date: new Date().toISOString().slice(0, 10), location: "", description: "", severity: "low" });
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("incident_reports").insert({ ...f, reported_by: u.user?.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Incident logged"); onDone(); }, onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Log incident</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Date</Label><Input type="date" value={f.incident_date} onChange={e => setF({ ...f, incident_date: e.target.value })} /></div>
          <div><Label>Severity</Label>
            <Select value={f.severity} onValueChange={v => setF({ ...f, severity: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>Location</Label><Input value={f.location} onChange={e => setF({ ...f, location: e.target.value })} required /></div>
        <div><Label>Description</Label><Textarea value={f.description} onChange={e => setF({ ...f, description: e.target.value })} required rows={4} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending || !f.location || !f.description}>{m.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
