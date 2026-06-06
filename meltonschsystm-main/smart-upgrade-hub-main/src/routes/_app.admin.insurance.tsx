import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin/insurance")({ component: InsurancePage });

function InsurancePage() {
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" /> Student Insurance
        </h1>
        <p className="text-sm text-muted-foreground">Manage school insurance policies and student enrolments</p>
      </div>

      <Tabs defaultValue="enrolments">
        <TabsList>
          <TabsTrigger value="enrolments">Enrolments</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
        </TabsList>
        <TabsContent value="enrolments" className="mt-4"><EnrolmentsTab /></TabsContent>
        <TabsContent value="policies" className="mt-4"><PoliciesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function EnrolmentsTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [policyId, setPolicyId] = useState("");
  const [enrolledOn, setEnrolledOn] = useState(new Date().toISOString().slice(0, 10));

  const { data: rows = [] } = useQuery({
    queryKey: ["student-insurance"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("student_insurance")
        .select("id, enrolled_on, students(first_name, last_name, admission_no), insurance_policies(policy_name, provider)")
        .order("enrolled_on", { ascending: false });
      return data ?? [];
    },
  });

  const { data: students = [] } = useQuery({
    queryKey: ["students-min"],
    queryFn: async () => {
      const { data } = await supabase.from("students").select("id, first_name, last_name, admission_no").order("admission_no");
      return data ?? [];
    },
  });

  const { data: policies = [] } = useQuery({
    queryKey: ["insurance-policies-min"],
    queryFn: async () => {
      const { data } = await supabase.from("insurance_policies").select("id, policy_name, provider");
      return data ?? [];
    },
  });

  async function submit() {
    if (!studentId || !policyId) return toast.error("Pick a student and policy");
    const { error } = await (supabase as any).from("student_insurance").insert({
      student_id: studentId, policy_id: policyId, enrolled_on: enrolledOn,
    });
    if (error) return toast.error(error.message);
    toast.success("Student enrolled");
    setOpen(false); setStudentId(""); setPolicyId("");
    qc.invalidateQueries({ queryKey: ["student-insurance"] });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Enrolments</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><UserPlus className="w-4 h-4 mr-1" /> Enrol student</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Enrol student in insurance</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Student</Label>
                <Select value={studentId} onValueChange={setStudentId}>
                  <SelectTrigger><SelectValue placeholder="Pick a student" /></SelectTrigger>
                  <SelectContent>
                    {students.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.admission_no} — {s.first_name} {s.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Policy</Label>
                <Select value={policyId} onValueChange={setPolicyId}>
                  <SelectTrigger><SelectValue placeholder="Pick a policy" /></SelectTrigger>
                  <SelectContent>
                    {policies.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.policy_name} ({p.provider})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Enrolled on</Label>
                <Input type="date" value={enrolledOn} onChange={(e) => setEnrolledOn(e.target.value)} />
              </div>
            </div>
            <DialogFooter><Button onClick={submit}>Enrol</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Student</TableHead><TableHead>Adm No</TableHead>
            <TableHead>Policy</TableHead><TableHead>Provider</TableHead><TableHead>Enrolled</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No enrolments yet</TableCell></TableRow>
            ) : rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.students?.first_name} {r.students?.last_name}</TableCell>
                <TableCell>{r.students?.admission_no}</TableCell>
                <TableCell>{r.insurance_policies?.policy_name}</TableCell>
                <TableCell>{r.insurance_policies?.provider}</TableCell>
                <TableCell>{r.enrolled_on}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PoliciesTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    policy_name: "", provider: "", premium_per_student: 0, cover_amount: 0,
    starts_on: "", ends_on: "", is_default: false,
  });

  const { data: rows = [] } = useQuery({
    queryKey: ["insurance-policies"],
    queryFn: async () => {
      const { data } = await supabase.from("insurance_policies").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  async function submit() {
    if (!form.policy_name || !form.provider) return toast.error("Name and provider are required");
    const payload: any = {
      policy_name: form.policy_name,
      provider: form.provider,
      premium_per_student: form.premium_per_student,
      cover_amount: form.cover_amount || null,
      starts_on: form.starts_on || null,
      ends_on: form.ends_on || null,
      is_default: form.is_default,
    };
    const { error } = await supabase.from("insurance_policies").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Policy added");
    setOpen(false);
    setForm({ policy_name: "", provider: "", premium_per_student: 0, cover_amount: 0, starts_on: "", ends_on: "", is_default: false });
    qc.invalidateQueries({ queryKey: ["insurance-policies"] });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Policies</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" /> New policy</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New insurance policy</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Policy name</Label><Input value={form.policy_name} onChange={(e) => setForm({ ...form, policy_name: e.target.value })} /></div>
              <div><Label>Provider</Label><Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Premium / student (KES)</Label><Input type="number" value={form.premium_per_student} onChange={(e) => setForm({ ...form, premium_per_student: Number(e.target.value) })} /></div>
                <div><Label>Cover amount (KES)</Label><Input type="number" value={form.cover_amount} onChange={(e) => setForm({ ...form, cover_amount: Number(e.target.value) })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Starts on</Label><Input type="date" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} /></div>
                <div><Label>Ends on</Label><Input type="date" value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} /></div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="is_default" checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: !!v })} />
                <Label htmlFor="is_default">Default policy</Label>
              </div>
            </div>
            <DialogFooter><Button onClick={submit}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Provider</TableHead>
            <TableHead>Premium</TableHead><TableHead>Cover</TableHead>
            <TableHead>Period</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No policies yet</TableCell></TableRow>
            ) : rows.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.policy_name}</TableCell>
                <TableCell>{p.provider}</TableCell>
                <TableCell>KES {Number(p.premium_per_student).toLocaleString()}</TableCell>
                <TableCell>{p.cover_amount ? `KES ${Number(p.cover_amount).toLocaleString()}` : "—"}</TableCell>
                <TableCell className="text-xs">{p.starts_on ?? "—"} → {p.ends_on ?? "—"}</TableCell>
                <TableCell>{p.is_default && <Badge>Default</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
