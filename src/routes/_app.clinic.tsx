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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";

export const Route = createFileRoute("/_app/clinic")({ component: () => (<FeatureGate feature="clinic"><Page /></FeatureGate>) });

const REFERRAL_OPTIONS = ["pending", "sent", "completed"];

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("nurse") || hasRole("clinic_admin") || hasRole("clinic_user");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [historyStudent, setHistoryStudent] = useState<any | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["clinic"],
    queryFn: async () => (await supabase.from("clinic_visits").select("*, students(id,first_name,last_name,admission_no)").order("visit_date", { ascending: false }).limit(200)).data ?? [],
  });

  const today = format(new Date(), "yyyy-MM-dd");

  const filtered = useMemo(() => {
    if (!search.trim()) return data as any[];
    const q = search.trim().toLowerCase();
    return (data as any[]).filter(v => {
      const name = `${v.students?.first_name ?? ""} ${v.students?.last_name ?? ""}`.toLowerCase();
      const adm = (v.students?.admission_no ?? "").toLowerCase();
      return name.includes(q) || adm.includes(q);
    });
  }, [data, search]);

  const todayVisits = useMemo(() => filtered.filter((v: any) => v.visit_date === today), [filtered, today]);
  const underObservation = useMemo(() => (data as any[]).filter((v: any) => v.under_observation && !v.discharge_date), [data]);

  const referralMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("clinic_visits").update({ referral_status: status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clinic"] }); toast.success("Referral status updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold">Clinic / Health</h1>
          <p className="text-sm text-muted-foreground mt-1">{(data as any[]).length} visits total</p>
        </div>
        {can && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Log Visit</Button></DialogTrigger>
            <AddDialog onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["clinic"] }); }} />
          </Dialog>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search by student name or admission no…" className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All Visits</TabsTrigger>
          <TabsTrigger value="today">Today <Badge variant="secondary" className="ml-2">{todayVisits.length}</Badge></TabsTrigger>
          <TabsTrigger value="observation">Under Observation <Badge variant="secondary" className="ml-2">{underObservation.length}</Badge></TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <VisitsTable data={filtered} isLoading={isLoading} can={can} onSelectStudent={setHistoryStudent} onReferralChange={(id, status) => referralMutation.mutate({ id, status })} />
        </TabsContent>
        <TabsContent value="today">
          <VisitsTable data={todayVisits} isLoading={isLoading} can={can} onSelectStudent={setHistoryStudent} onReferralChange={(id, status) => referralMutation.mutate({ id, status })} emptyText="No visits logged today." />
        </TabsContent>
        <TabsContent value="observation">
          <VisitsTable data={underObservation} isLoading={isLoading} can={can} onSelectStudent={setHistoryStudent} onReferralChange={(id, status) => referralMutation.mutate({ id, status })} emptyText="No students currently under observation." showAdmitted />
        </TabsContent>
      </Tabs>

      <Sheet open={!!historyStudent} onOpenChange={(o) => !o && setHistoryStudent(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          {historyStudent && <StudentHistory student={historyStudent} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function VisitsTable({ data, isLoading, can, onSelectStudent, onReferralChange, emptyText = "No visits logged.", showAdmitted = false }: {
  data: any[]; isLoading: boolean; can: boolean;
  onSelectStudent: (s: any) => void;
  onReferralChange: (id: string, status: string) => void;
  emptyText?: string; showAdmitted?: boolean;
}) {
  return (
    <Card><CardHeader /><CardContent>
      {isLoading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Student</TableHead><TableHead>Symptoms</TableHead>
            <TableHead>Diagnosis</TableHead><TableHead>Treatment</TableHead><TableHead>Referred To</TableHead>
            <TableHead>Referral Status</TableHead>
            {showAdmitted && <TableHead>Admitted</TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {data.length === 0 && <TableRow><TableCell colSpan={showAdmitted ? 8 : 7} className="text-center text-muted-foreground py-8">{emptyText}</TableCell></TableRow>}
            {data.map((v: any) => (
              <TableRow key={v.id}>
                <TableCell className="text-xs whitespace-nowrap">{v.visit_date}</TableCell>
                <TableCell>
                  <button className="hover:underline text-left font-medium" onClick={() => onSelectStudent(v.students)}>
                    {v.students?.first_name} {v.students?.last_name}
                  </button>
                  <div className="text-xs text-muted-foreground">{v.students?.admission_no}</div>
                </TableCell>
                <TableCell className="max-w-[160px] text-sm truncate">{v.symptoms}</TableCell>
                <TableCell className="max-w-[140px] text-sm truncate">{v.diagnosis ?? "—"}</TableCell>
                <TableCell className="max-w-[140px] text-sm truncate">{v.treatment ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{v.referred_to ?? "—"}</TableCell>
                <TableCell>
                  {can ? (
                    <Select value={v.referral_status ?? "pending"} onValueChange={(val) => onReferralChange(v.id, val)}>
                      <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>{REFERRAL_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline">{v.referral_status ?? "pending"}</Badge>
                  )}
                </TableCell>
                {showAdmitted && <TableCell className="text-xs">{v.admitted_date ?? "—"}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent></Card>
  );
}

function StudentHistory({ student }: { student: any }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["clinic-history", student?.id],
    queryFn: async () => (await supabase.from("clinic_visits").select("*").eq("student_id", student.id).order("visit_date", { ascending: false })).data ?? [],
    enabled: !!student?.id,
  });
  return (
    <>
      <SheetHeader>
        <SheetTitle>{student.first_name} {student.last_name}</SheetTitle>
        <p className="text-sm text-muted-foreground">{student.admission_no} · {(data as any[]).length} total visit(s)</p>
      </SheetHeader>
      <div className="mt-4 space-y-3">
        {isLoading ? <div className="flex justify-center"><Loader2 className="animate-spin" /></div> : (data as any[]).length === 0 ? (
          <p className="text-sm text-muted-foreground">No clinic visits on record.</p>
        ) : (data as any[]).map((v: any) => (
          <div key={v.id} className="border-b pb-2">
            <div className="flex justify-between items-center">
              <div className="font-medium text-sm">{v.visit_date}</div>
              {v.under_observation && !v.discharge_date && <Badge>Under observation</Badge>}
            </div>
            <div className="text-sm mt-1"><span className="text-muted-foreground">Symptoms:</span> {v.symptoms}</div>
            {v.diagnosis && <div className="text-sm"><span className="text-muted-foreground">Diagnosis:</span> {v.diagnosis}</div>}
            {v.treatment && <div className="text-sm"><span className="text-muted-foreground">Treatment:</span> {v.treatment}</div>}
            {v.referred_to && <div className="text-xs text-muted-foreground mt-1">Referred to: {v.referred_to} · {v.referral_status ?? "pending"}</div>}
          </div>
        ))}
      </div>
    </>
  );
}

function AddDialog({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ student_id: "", visit_date: new Date().toISOString().slice(0, 10), symptoms: "", diagnosis: "", treatment: "", referred_to: "", under_observation: false, admitted_date: "" });
  const { data: students = [] } = useQuery({ queryKey: ["students-min-clinic"], queryFn: async () => (await supabase.from("students").select("id,admission_no,first_name,last_name").order("first_name")).data ?? [] });
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const payload: any = { ...f, attended_by: u.user?.id };
      if (!payload.admitted_date) delete payload.admitted_date;
      if (!payload.under_observation) delete payload.admitted_date;
      const { error } = await supabase.from("clinic_visits").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Visit logged"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent><DialogHeader><DialogTitle>New Clinic Visit</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
        <div><Label>Student</Label>
          <Select value={f.student_id} onValueChange={v => setF(p => ({ ...p, student_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Choose student" /></SelectTrigger>
            <SelectContent>{(students as any[]).map(s => <SelectItem key={s.id} value={s.id}>{s.admission_no} – {s.first_name} {s.last_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Visit Date</Label><Input type="date" value={f.visit_date} onChange={e => setF(p => ({ ...p, visit_date: e.target.value }))} /></div>
        <div><Label>Symptoms *</Label><Textarea required value={f.symptoms} onChange={e => setF(p => ({ ...p, symptoms: e.target.value }))} /></div>
        <div><Label>Diagnosis</Label><Textarea value={f.diagnosis} onChange={e => setF(p => ({ ...p, diagnosis: e.target.value }))} /></div>
        <div><Label>Treatment</Label><Textarea value={f.treatment} onChange={e => setF(p => ({ ...p, treatment: e.target.value }))} /></div>
        <div><Label>Referred To</Label><Input value={f.referred_to} onChange={e => setF(p => ({ ...p, referred_to: e.target.value }))} placeholder="Hospital or specialist if any" /></div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="obs" checked={f.under_observation} onChange={e => setF(p => ({ ...p, under_observation: e.target.checked }))} />
          <Label htmlFor="obs" className="cursor-pointer">Admit under observation</Label>
        </div>
        {f.under_observation && <div><Label>Admitted Date</Label><Input type="date" value={f.admitted_date} onChange={e => setF(p => ({ ...p, admitted_date: e.target.value }))} /></div>}
        <DialogFooter><Button type="submit" disabled={m.isPending || !f.student_id}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save Visit</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
