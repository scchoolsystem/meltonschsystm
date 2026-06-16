import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";

export const Route = createFileRoute("/_app/discipline")({ component: () => (<FeatureGate feature="discipline"><Page /></FeatureGate>) });

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("teacher") || hasRole("deputy_principal") || hasRole("discipline_admin") || hasRole("guidance_admin");
  const canCounsel = isAdmin || hasRole("guidance_admin");

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["discipline"],
    queryFn: async () => (await supabase.from("discipline_records").select("*, students(id,first_name,last_name,admission_no)").order("incident_date", { ascending: false }).limit(200)).data ?? [],
  });
  const { data: sessions = [] } = useQuery({
    queryKey: ["counselling"],
    queryFn: async () => (await supabase.from("counselling_sessions").select("*, students(first_name,last_name,admission_no), staff(first_name,last_name)").order("session_date", { ascending: false }).limit(100)).data ?? [],
  });

  const [addRecord, setAddRecord] = useState(false);
  const [addSession, setAddSession] = useState(false);

  const notifyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("discipline_records").update({ parent_notified: true, notified_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["discipline"] }); toast.success("Marked as notified"); },
    onError: (e: any) => toast.error(e.message),
  });

  // Repeat offenders: students with more than 2 incidents
  const repeatOffenders = useMemo(() => {
    const counts: Record<string, { count: number; student: any }> = {};
    for (const r of records as any[]) {
      const sid = r.student_id;
      if (!sid) continue;
      if (!counts[sid]) counts[sid] = { count: 0, student: r.students };
      counts[sid].count++;
    }
    return Object.entries(counts).filter(([, v]) => v.count > 2).map(([sid, v]) => ({ student_id: sid, ...v })).sort((a, b) => b.count - a.count);
  }, [records]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div><h1 className="text-3xl font-bold">Discipline</h1><p className="text-sm text-muted-foreground mt-1">{(records as any[]).length} incidents</p></div>
        {can && (
          <div className="flex gap-2 flex-wrap">
            <Dialog open={addRecord} onOpenChange={setAddRecord}><DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Log Incident</Button></DialogTrigger>
              <IncidentDialog onDone={() => { setAddRecord(false); qc.invalidateQueries({ queryKey: ["discipline"] }); }} />
            </Dialog>
            {canCounsel && (
              <Dialog open={addSession} onOpenChange={setAddSession}><DialogTrigger asChild><Button variant="outline"><Plus className="w-4 h-4 mr-2" />Counselling Session</Button></DialogTrigger>
                <CounsellingDialog onDone={() => { setAddSession(false); qc.invalidateQueries({ queryKey: ["counselling"] }); }} />
              </Dialog>
            )}
          </div>
        )}
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All Incidents</TabsTrigger>
          <TabsTrigger value="repeat">Repeat Offenders {repeatOffenders.length > 0 && <Badge variant="destructive" className="ml-2">{repeatOffenders.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="counselling">Counselling</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card><CardHeader /><CardContent>
            {isLoading ? <Loader2 className="animate-spin mx-auto" /> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Student</TableHead><TableHead>Incident</TableHead>
                  <TableHead>Severity</TableHead><TableHead>Action Taken</TableHead><TableHead>Parent Notified</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(records as any[]).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No incidents logged.</TableCell></TableRow>}
                  {(records as any[]).map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{r.incident_date}</TableCell>
                      <TableCell className="font-medium">{r.students?.first_name} {r.students?.last_name}<div className="text-xs text-muted-foreground">{r.students?.admission_no}</div></TableCell>
                      <TableCell className="max-w-[200px] truncate">{r.description}</TableCell>
                      <TableCell><Badge variant={r.severity === "high" ? "destructive" : r.severity === "medium" ? "secondary" : "outline"}>{r.severity ?? "—"}</Badge></TableCell>
                      <TableCell className="max-w-[160px] truncate text-sm">{r.action_taken ?? "—"}</TableCell>
                      <TableCell>
                        {r.parent_notified ? (
                          <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="w-3 h-3" />{r.notified_at?.slice(0, 10)}</span>
                        ) : can ? (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => notifyMutation.mutate(r.id)}>Mark Notified</Button>
                        ) : <span className="text-xs text-muted-foreground">No</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="repeat">
          <Card><CardHeader /><CardContent>
            {repeatOffenders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No students with more than 2 incidents.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Total Incidents</TableHead></TableRow></TableHeader>
                <TableBody>
                  {repeatOffenders.map((o: any) => (
                    <TableRow key={o.student_id}>
                      <TableCell className="font-medium">{o.student?.first_name} {o.student?.last_name}<div className="text-xs text-muted-foreground">{o.student?.admission_no}</div></TableCell>
                      <TableCell><Badge variant="destructive">{o.count} incidents</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="counselling">
          <Card><CardHeader /><CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Student</TableHead><TableHead>Counsellor</TableHead><TableHead>Notes</TableHead><TableHead>Follow-up</TableHead></TableRow></TableHeader>
              <TableBody>
                {(sessions as any[]).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No counselling sessions logged.</TableCell></TableRow>}
                {(sessions as any[]).map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">{s.session_date}</TableCell>
                    <TableCell className="font-medium">{s.students?.first_name} {s.students?.last_name}<div className="text-xs text-muted-foreground">{s.students?.admission_no}</div></TableCell>
                    <TableCell>{s.staff ? `${s.staff.first_name} ${s.staff.last_name}` : "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">{s.notes ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.follow_up_date ?? "—"}</TableCell>
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

function IncidentDialog({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ student_id: "", incident_date: format(new Date(), "yyyy-MM-dd"), description: "", severity: "low", action_taken: "" });
  const { data: students = [] } = useQuery({ queryKey: ["students-min-disc"], queryFn: async () => (await supabase.from("students").select("id,admission_no,first_name,last_name").order("first_name")).data ?? [] });
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("discipline_records").insert({ ...f, reported_by: u.user?.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Incident logged"); onDone(); }, onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent><DialogHeader><DialogTitle>Log Incident</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Student</Label>
          <Select value={f.student_id} onValueChange={v => setF(p => ({ ...p, student_id: v }))}><SelectTrigger><SelectValue placeholder="Choose student" /></SelectTrigger>
            <SelectContent>{(students as any[]).map(s => <SelectItem key={s.id} value={s.id}>{s.admission_no} – {s.first_name} {s.last_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Date</Label><Input type="date" value={f.incident_date} onChange={e => setF(p => ({ ...p, incident_date: e.target.value }))} /></div>
        <div><Label>Description *</Label><Textarea required value={f.description} onChange={e => setF(p => ({ ...p, description: e.target.value }))} /></div>
        <div><Label>Severity</Label>
          <Select value={f.severity} onValueChange={v => setF(p => ({ ...p, severity: v }))}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent>
          </Select>
        </div>
        <div><Label>Action Taken</Label><Textarea value={f.action_taken} onChange={e => setF(p => ({ ...p, action_taken: e.target.value }))} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending || !f.student_id}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function CounsellingDialog({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ student_id: "", counsellor_id: "", session_date: format(new Date(), "yyyy-MM-dd"), notes: "", follow_up_date: "" });
  const { data: students = [] } = useQuery({ queryKey: ["students-min-counsel"], queryFn: async () => (await supabase.from("students").select("id,admission_no,first_name,last_name").order("first_name")).data ?? [] });
  const { data: staff = [] } = useQuery({ queryKey: ["staff-min"], queryFn: async () => (await supabase.from("staff").select("id,first_name,last_name").order("first_name")).data ?? [] });
  const m = useMutation({
    mutationFn: async () => {
      const payload: any = { ...f };
      if (!payload.follow_up_date) delete payload.follow_up_date;
      if (!payload.counsellor_id) delete payload.counsellor_id;
      const { error } = await supabase.from("counselling_sessions").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Session logged"); onDone(); }, onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent><DialogHeader><DialogTitle>Log Counselling Session</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Student</Label>
          <Select value={f.student_id} onValueChange={v => setF(p => ({ ...p, student_id: v }))}><SelectTrigger><SelectValue placeholder="Choose student" /></SelectTrigger>
            <SelectContent>{(students as any[]).map(s => <SelectItem key={s.id} value={s.id}>{s.admission_no} – {s.first_name} {s.last_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Counsellor (Staff)</Label>
          <Select value={f.counsellor_id} onValueChange={v => setF(p => ({ ...p, counsellor_id: v }))}><SelectTrigger><SelectValue placeholder="Choose staff" /></SelectTrigger>
            <SelectContent>{(staff as any[]).map(s => <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Date</Label><Input type="date" value={f.session_date} onChange={e => setF(p => ({ ...p, session_date: e.target.value }))} /></div>
        <div><Label>Session Notes</Label><Textarea value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} /></div>
        <div><Label>Follow-up Date</Label><Input type="date" value={f.follow_up_date} onChange={e => setF(p => ({ ...p, follow_up_date: e.target.value }))} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending || !f.student_id}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
