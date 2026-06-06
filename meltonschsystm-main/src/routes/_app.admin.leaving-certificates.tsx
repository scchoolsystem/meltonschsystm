import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Printer } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { issueLeavingCertificate } from "@/lib/leaving-certs.functions";

export const Route = createFileRoute("/_app/admin/leaving-certificates")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const issue = useServerFn(issueLeavingCertificate);

  const { data: certs = [] } = useQuery({
    queryKey: ["leaving-certs"],
    queryFn: async () => (await supabase.from("leaving_certificates").select("*, students(first_name, last_name, admission_no)").order("issued_at", { ascending: false })).data ?? [],
  });
  const { data: students = [] } = useQuery({
    queryKey: ["students-for-cert"],
    queryFn: async () => (await supabase.from("students").select("id, first_name, last_name, admission_no").order("last_name")).data ?? [],
  });

  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    student_id: "", leaving_date: new Date().toISOString().slice(0, 10),
    reason: "completion" as const, conduct: "good" as const,
    achievements: "", signed_by_name: "", signed_by_title: "Principal",
  });

  const mut = useMutation({
    mutationFn: async () => {
      if (!f.student_id) throw new Error("Pick a student");
      return issue({ data: f as any });
    },
    onSuccess: () => { toast.success("Certificate issued"); setOpen(false); qc.invalidateQueries({ queryKey: ["leaving-certs"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Leaving Certificates</h1>
          <p className="text-sm text-muted-foreground">Issue and re-print certificates for students leaving the school.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Issue certificate</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Issue leaving certificate</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Student</Label>
                <Select value={f.student_id} onValueChange={v => setF(s => ({ ...s, student_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Choose student" /></SelectTrigger>
                  <SelectContent>{(students as any[]).map(s => <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.admission_no})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Leaving date</Label><Input type="date" value={f.leaving_date} onChange={e => setF(s => ({ ...s, leaving_date: e.target.value }))} /></div>
                <div><Label>Reason</Label>
                  <Select value={f.reason} onValueChange={(v: any) => setF(s => ({ ...s, reason: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="completion">Completion</SelectItem>
                      <SelectItem value="transfer">Transfer</SelectItem>
                      <SelectItem value="withdrawal">Withdrawal</SelectItem>
                      <SelectItem value="expulsion">Expulsion</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Conduct</Label>
                  <Select value={f.conduct} onValueChange={(v: any) => setF(s => ({ ...s, conduct: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="excellent">Excellent</SelectItem>
                      <SelectItem value="good">Good</SelectItem>
                      <SelectItem value="satisfactory">Satisfactory</SelectItem>
                      <SelectItem value="poor">Poor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Signed by name</Label><Input value={f.signed_by_name} onChange={e => setF(s => ({ ...s, signed_by_name: e.target.value }))} /></div>
                <div><Label>Signed by title</Label><Input value={f.signed_by_title} onChange={e => setF(s => ({ ...s, signed_by_title: e.target.value }))} /></div>
              </div>
              <div><Label>Achievements (optional)</Label><Textarea value={f.achievements} onChange={e => setF(s => ({ ...s, achievements: e.target.value }))} /></div>
            </div>
            <DialogFooter><Button onClick={() => mut.mutate()} disabled={mut.isPending}>Issue</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Issued certificates</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Serial</TableHead><TableHead>Student</TableHead>
              <TableHead>Reason</TableHead><TableHead>Conduct</TableHead>
              <TableHead>Leaving date</TableHead><TableHead className="w-24" />
            </TableRow></TableHeader>
            <TableBody>
              {(certs as any[]).map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.serial_no}</TableCell>
                  <TableCell>{c.students?.first_name} {c.students?.last_name} <span className="text-muted-foreground text-xs">({c.students?.admission_no})</span></TableCell>
                  <TableCell className="capitalize">{c.reason}</TableCell>
                  <TableCell className="capitalize">{c.conduct}</TableCell>
                  <TableCell>{c.leaving_date}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => window.open(`/admin/leaving-certificate/${c.id}`, "_blank")}>
                      <Printer className="w-3 h-3 mr-1" />Print
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(certs as any[]).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No certificates yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
