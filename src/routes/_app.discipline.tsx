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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, CheckCircle, Bell, BarChart3, AlertTriangle, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useActiveStudents } from "@/lib/students.functions";
import { format, subMonths } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";

export const Route = createFileRoute("/_app/discipline")({ component: () => (<FeatureGate feature="discipline"><Page /></FeatureGate>) });

const SEVERITY_COLORS = { low: "#22c55e", medium: "#f59e0b", high: "#ef4444" };
const PIE_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#6366f1", "#ec4899"];

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("teacher") || hasRole("deputy_principal") || hasRole("discipline_admin") || hasRole("guidance_admin");
  const canCounsel = isAdmin || hasRole("guidance_admin");

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["discipline"],
    queryFn: async () => (await supabase.from("discipline_records").select("*, students(id,first_name,last_name,admission_no)").order("incident_date", { ascending: false }).limit(500)).data ?? [],
  });
  const { data: sessions = [] } = useQuery({
    queryKey: ["counselling"],
    queryFn: async () => (await supabase.from("counselling_sessions").select("*, students(first_name,last_name,admission_no), staff(first_name,last_name)").order("session_date", { ascending: false }).limit(100)).data ?? [],
  });

  const [addRecord, setAddRecord] = useState(false);
  const [addSession, setAddSession] = useState(false);

  // ── Notification mutation ──────────────────────────────────────────────────
  const notifyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("discipline_records")
        .update({ parent_notified: true, notified_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["discipline"] }); toast.success("Parent marked as notified"); },
    onError: (e: any) => toast.error(e.message),
  });

  // Bulk notify all unnotified
  const bulkNotifyMutation = useMutation({
    mutationFn: async () => {
      const ids = (records as any[]).filter(r => !r.parent_notified).map(r => r.id);
      if (!ids.length) throw new Error("All parents already notified");
      const { error } = await supabase
        .from("discipline_records")
        .update({ parent_notified: true, notified_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => { qc.invalidateQueries({ queryKey: ["discipline"] }); toast.success(`${count} parents marked as notified`); },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Analytics ─────────────────────────────────────────────────────────────
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

  const severityData = useMemo(() => {
    const counts: Record<string, number> = { low: 0, medium: 0, high: 0 };
    for (const r of records as any[]) if (r.severity) counts[r.severity] = (counts[r.severity] ?? 0) + 1;
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [records]);

  const monthlyData = useMemo(() => {
    const months: Record<string, { month: string; incidents: number; notified: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, "yyyy-MM");
      months[key] = { month: format(d, "MMM"), incidents: 0, notified: 0 };
    }
    for (const r of records as any[]) {
      const key = r.incident_date?.slice(0, 7);
      if (months[key]) {
        months[key].incidents++;
        if (r.parent_notified) months[key].notified++;
      }
    }
    return Object.values(months);
  }, [records]);

  const notifiedCount = (records as any[]).filter(r => r.parent_notified).length;
  const unnotifiedCount = (records as any[]).length - notifiedCount;
  const highSeverity = (records as any[]).filter(r => r.severity === "high").length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold">Discipline</h1>
          <p className="text-sm text-muted-foreground mt-1">{(records as any[]).length} incidents · {unnotifiedCount} parents pending notification</p>
        </div>
        {can && (
          <div className="flex gap-2 flex-wrap">
            {unnotifiedCount > 0 && (
              <Button variant="outline" onClick={() => bulkNotifyMutation.mutate()} disabled={bulkNotifyMutation.isPending}>
                {bulkNotifyMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bell className="w-4 h-4 mr-2" />}
                Notify All Parents ({unnotifiedCount})
              </Button>
            )}
            <Dialog open={addRecord} onOpenChange={setAddRecord}>
              <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Log Incident</Button></DialogTrigger>
              <IncidentDialog onDone={() => { setAddRecord(false); qc.invalidateQueries({ queryKey: ["discipline"] }); }} />
            </Dialog>
            {canCounsel && (
              <Dialog open={addSession} onOpenChange={setAddSession}>
                <DialogTrigger asChild><Button variant="outline"><Plus className="w-4 h-4 mr-2" />Counselling Session</Button></DialogTrigger>
                <CounsellingDialog onDone={() => { setAddSession(false); qc.invalidateQueries({ queryKey: ["counselling"] }); }} />
              </Dialog>
            )}
          </div>
        )}
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All Incidents</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5">
            <Bell className="w-3.5 h-3.5" /> Notifications
            {unnotifiedCount > 0 && <Badge variant="destructive" className="ml-1">{unnotifiedCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="repeat">
            Repeat Offenders {repeatOffenders.length > 0 && <Badge variant="destructive" className="ml-2">{repeatOffenders.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="counselling">Counselling</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5"><BarChart3 className="w-3.5 h-3.5" /> Analytics</TabsTrigger>
        </TabsList>

        {/* ── All Incidents ── */}
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
                        ) : <span className="text-xs text-muted-foreground">Pending</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        {/* ── Notifications ── */}
        <TabsContent value="notifications" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card><CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center"><CheckCircle className="w-5 h-5 text-green-600" /></div>
                <div><p className="text-2xl font-bold">{notifiedCount}</p><p className="text-xs text-muted-foreground">Parents Notified</p></div>
              </div>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center"><Bell className="w-5 h-5 text-orange-600" /></div>
                <div><p className="text-2xl font-bold">{unnotifiedCount}</p><p className="text-xs text-muted-foreground">Pending Notification</p></div>
              </div>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
                <div><p className="text-2xl font-bold">{highSeverity}</p><p className="text-xs text-muted-foreground">High Severity</p></div>
              </div>
            </CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Pending Parent Notifications</CardTitle></CardHeader>
            <CardContent>
              {unnotifiedCount === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground flex flex-col items-center gap-2">
                  <CheckCircle className="w-8 h-8 text-green-500" />All parents have been notified.
                </div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead>Student</TableHead><TableHead>Severity</TableHead><TableHead>Description</TableHead><TableHead>Action</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(records as any[]).filter(r => !r.parent_notified).map((r: any) => (
                      <TableRow key={r.id} className={r.severity === "high" ? "bg-red-50" : ""}>
                        <TableCell className="text-xs">{r.incident_date}</TableCell>
                        <TableCell className="font-medium">{r.students?.first_name} {r.students?.last_name}<div className="text-xs text-muted-foreground">{r.students?.admission_no}</div></TableCell>
                        <TableCell><Badge variant={r.severity === "high" ? "destructive" : r.severity === "medium" ? "secondary" : "outline"}>{r.severity}</Badge></TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">{r.description}</TableCell>
                        <TableCell>
                          {can && (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => notifyMutation.mutate(r.id)} disabled={notifyMutation.isPending}>
                              <Bell className="w-3 h-3" /> Mark Notified
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Repeat Offenders ── */}
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

        {/* ── Counselling ── */}
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

        {/* ── Analytics ── */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Incidents", value: (records as any[]).length, icon: AlertTriangle, color: "text-red-500", bg: "bg-red-50" },
              { label: "High Severity", value: highSeverity, icon: AlertTriangle, color: "text-orange-500", bg: "bg-orange-50" },
              { label: "Repeat Offenders", value: repeatOffenders.length, icon: Users, color: "text-purple-500", bg: "bg-purple-50" },
              { label: "Notification Rate", value: (records as any[]).length ? `${Math.round(notifiedCount / (records as any[]).length * 100)}%` : "—", icon: Bell, color: "text-blue-500", bg: "bg-blue-50" },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <Card key={label}><CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-full ${bg} flex items-center justify-center`}><Icon className={`w-5 h-5 ${color}`} /></div>
                  <div><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
                </div>
              </CardContent></Card>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4" />Monthly Incidents vs Notifications</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="incidents" stroke="#ef4444" strokeWidth={2} name="Incidents" dot={false} />
                    <Line type="monotone" dataKey="notified" stroke="#22c55e" strokeWidth={2} name="Notified" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-4 h-4" />Incidents by Severity</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={severityData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                      {severityData.map((entry, i) => (
                        <Cell key={i} fill={SEVERITY_COLORS[entry.name as keyof typeof SEVERITY_COLORS] ?? PIE_COLORS[i]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader><CardTitle className="text-base">Top Repeat Offenders</CardTitle></CardHeader>
              <CardContent>
                {repeatOffenders.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No repeat offenders.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={repeatOffenders.slice(0, 10).map(o => ({ name: `${o.student?.first_name} ${o.student?.last_name}`, incidents: o.count }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="incidents" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function IncidentDialog({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ student_id: "", incident_date: format(new Date(), "yyyy-MM-dd"), description: "", severity: "low", action_taken: "" });
  const { data: students = [] } = useActiveStudents();
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
  const { data: students = [] } = useActiveStudents();
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
