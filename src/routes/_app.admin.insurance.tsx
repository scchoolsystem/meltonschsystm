import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/admin/insurance")({ component: InsurancePage });

function InsurancePage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [openPolicy, setOpenPolicy] = useState(false);
  const [openEnrol, setOpenEnrol] = useState(false);

  const { data: policies = [], isLoading: lp } = useQuery({
    queryKey: ["insurance-policies"],
    queryFn: async () => (await supabase.from("insurance_policies").select("*").order("created_at")).data ?? [],
  });
  const { data: enrolments = [], isLoading: le } = useQuery({
    queryKey: ["student-insurance"],
    queryFn: async () => (await supabase.from("student_insurance").select("*, students(first_name,last_name,admission_no), insurance_policies(policy_name,provider)").order("enrolled_on", { ascending: false })).data ?? [],
  });
  const { data: students = [] } = useQuery({
    queryKey: ["students-min-ins"],
    queryFn: async () => (await supabase.from("students").select("id,admission_no,first_name,last_name").eq("lifecycle_status","active").order("admission_no").limit(500)).data ?? [],
  });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["insurance-policies"] }); qc.invalidateQueries({ queryKey: ["student-insurance"] }); };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Insurance</h1>
          <p className="text-sm text-muted-foreground mt-1">{(enrolments as any[]).length} students enrolled across {(policies as any[]).length} policies</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Dialog open={openPolicy} onOpenChange={setOpenPolicy}>
              <DialogTrigger asChild><Button variant="outline"><Plus className="w-4 h-4 mr-2" />New Policy</Button></DialogTrigger>
              <AddPolicyDialog onDone={() => { setOpenPolicy(false); refresh(); }} />
            </Dialog>
            <Dialog open={openEnrol} onOpenChange={setOpenEnrol}>
              <DialogTrigger asChild><Button><ShieldCheck className="w-4 h-4 mr-2" />Enrol Student</Button></DialogTrigger>
              <EnrolDialog policies={policies as any[]} students={students as any[]} onDone={() => { setOpenEnrol(false); refresh(); }} />
            </Dialog>
          </div>
        )}
      </div>
      <Tabs defaultValue="enrolments">
        <TabsList><TabsTrigger value="enrolments">Enrolments ({(enrolments as any[]).length})</TabsTrigger><TabsTrigger value="policies">Policies ({(policies as any[]).length})</TabsTrigger></TabsList>
        <TabsContent value="enrolments">
          <Card><CardContent className="p-0">
            {le ? <div className="h-32 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin" /></div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Adm No</TableHead><TableHead>Policy</TableHead><TableHead>Provider</TableHead><TableHead>Enrolled On</TableHead></TableRow></TableHeader>
              <TableBody>
                {(enrolments as any[]).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No enrolments yet.</TableCell></TableRow>}
                {(enrolments as any[]).map((e:any) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.students?.first_name} {e.students?.last_name}</TableCell>
                    <TableCell className="font-mono text-xs">{e.students?.admission_no}</TableCell>
                    <TableCell><Badge variant="outline">{e.insurance_policies?.policy_name}</Badge></TableCell>
                    <TableCell>{e.insurance_policies?.provider}</TableCell>
                    <TableCell className="text-xs">{e.enrolled_on}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            )}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="policies">
          <Card><CardContent className="p-0">
            {lp ? <div className="h-32 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin" /></div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Policy Name</TableHead><TableHead>Provider</TableHead><TableHead>Premium/Student</TableHead><TableHead>Cover Amount</TableHead><TableHead>Default</TableHead><TableHead>Period</TableHead></TableRow></TableHeader>
              <TableBody>
                {(policies as any[]).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No policies yet.</TableCell></TableRow>}
                {(policies as any[]).map((p:any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.policy_name}</TableCell>
                    <TableCell>{p.provider}</TableCell>
                    <TableCell className="font-mono">KES {Number(p.premium_per_student).toLocaleString()}</TableCell>
                    <TableCell className="font-mono">{p.cover_amount ? "KES "+Number(p.cover_amount).toLocaleString() : "—"}</TableCell>
                    <TableCell>{p.is_default ? <Badge>Default</Badge> : "—"}</TableCell>
                    <TableCell className="text-xs">{p.starts_on ?? "—"} → {p.ends_on ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AddPolicyDialog({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ policy_name:"", provider:"", premium_per_student:0, cover_amount:"", starts_on:"", ends_on:"", is_default:false });
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("insurance_policies").insert({ ...f, cover_amount: f.cover_amount ? +f.cover_amount : null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Policy created"); onDone(); },
    onError: (e:any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New Insurance Policy</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Policy Name</Label><Input required value={f.policy_name} onChange={e => setF({...f,policy_name:e.target.value})} /></div>
          <div><Label>Provider</Label><Input required value={f.provider} onChange={e => setF({...f,provider:e.target.value})} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Premium per Student (KES)</Label><Input type="number" min={0} value={f.premium_per_student} onChange={e => setF({...f,premium_per_student:+e.target.value})} /></div>
          <div><Label>Cover Amount (KES)</Label><Input type="number" min={0} value={f.cover_amount} onChange={e => setF({...f,cover_amount:e.target.value})} placeholder="Optional" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Start Date</Label><Input type="date" value={f.starts_on} onChange={e => setF({...f,starts_on:e.target.value})} /></div>
          <div><Label>End Date</Label><Input type="date" value={f.ends_on} onChange={e => setF({...f,ends_on:e.target.value})} /></div>
        </div>
        <div className="flex items-center gap-2"><input type="checkbox" id="def" checked={f.is_default} onChange={e => setF({...f,is_default:e.target.checked})} /><Label htmlFor="def">Set as default policy</Label></div>
        <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Create</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function EnrolDialog({ policies, students, onDone }: { policies:any[]; students:any[]; onDone:()=>void }) {
  const [f, setF] = useState({ student_id:"", policy_id:"", enrolled_on: new Date().toISOString().slice(0,10) });
  const m = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("student_insurance").insert(f); if (error) throw error; },
    onSuccess: () => { toast.success("Student enrolled"); onDone(); },
    onError: (e:any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Enrol Student in Insurance</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Student</Label>
          <Select value={f.student_id} onValueChange={v => setF({...f,student_id:v})}>
            <SelectTrigger><SelectValue placeholder="Choose student" /></SelectTrigger>
            <SelectContent>{students.map((s:any) => <SelectItem key={s.id} value={s.id}>{s.admission_no} – {s.first_name} {s.last_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Policy</Label>
          <Select value={f.policy_id} onValueChange={v => setF({...f,policy_id:v})}>
            <SelectTrigger><SelectValue placeholder="Choose policy" /></SelectTrigger>
            <SelectContent>{policies.map((p:any) => <SelectItem key={p.id} value={p.id}>{p.policy_name} – {p.provider}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Enrolled On</Label><Input type="date" value={f.enrolled_on} onChange={e => setF({...f,enrolled_on:e.target.value})} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending||!f.student_id||!f.policy_id}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Enrol</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}