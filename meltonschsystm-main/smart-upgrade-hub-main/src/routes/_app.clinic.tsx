import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/clinic")({ component: () => (<FeatureGate feature="clinic"><Page /></FeatureGate>) });

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("nurse");
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: ["clinic"],
    queryFn: async () => (await supabase.from("clinic_visits").select("*, students(first_name,last_name,admission_no)").order("visit_date", { ascending: false }).limit(200)).data ?? [],
  });
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">Clinic / Health</h1><p className="text-sm text-muted-foreground mt-1">{data.length} visits logged</p></div>
        {can && <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Log Visit</Button></DialogTrigger>
          <AddDialog onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["clinic"] }); }} />
        </Dialog>}
      </div>
      <Card><CardHeader /><CardContent>
        {isLoading ? <Loader2 className="animate-spin mx-auto" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Student</TableHead><TableHead>Symptoms</TableHead><TableHead>Diagnosis</TableHead><TableHead>Treatment</TableHead><TableHead>Referred</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No visits logged.</TableCell></TableRow>}
              {(data as any[]).map(v => (
                <TableRow key={v.id}>
                  <TableCell className="text-xs">{v.visit_date}</TableCell>
                  <TableCell className="font-medium">{v.students?.first_name} {v.students?.last_name}</TableCell>
                  <TableCell className="max-w-xs text-sm truncate">{v.symptoms}</TableCell>
                  <TableCell className="max-w-xs text-sm truncate">{v.diagnosis ?? "—"}</TableCell>
                  <TableCell className="max-w-xs text-sm truncate">{v.treatment ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{v.referred_to ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  );
}

function AddDialog({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ student_id: "", visit_date: new Date().toISOString().slice(0, 10), symptoms: "", diagnosis: "", treatment: "", referred_to: "" });
  const { data: students = [] } = useQuery({ queryKey: ["students-min7"], queryFn: async () => (await supabase.from("students").select("id,admission_no,first_name,last_name").limit(500)).data ?? [] });
  const m = useMutation({ mutationFn: async () => { const { data: u } = await supabase.auth.getUser(); const { error } = await supabase.from("clinic_visits").insert({ ...f, attended_by: u.user?.id }); if (error) throw error; }, onSuccess: () => { toast.success("Visit logged"); onDone(); }, onError: (e: any) => toast.error(e.message) });
  return (
    <DialogContent><DialogHeader><DialogTitle>New Clinic Visit</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Student</Label>
          <Select value={f.student_id} onValueChange={v => setF({ ...f, student_id: v })}>
            <SelectTrigger><SelectValue placeholder="Choose student" /></SelectTrigger>
            <SelectContent>{(students as any[]).map(s => <SelectItem key={s.id} value={s.id}>{s.admission_no} – {s.first_name} {s.last_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Visit Date</Label><Input type="date" value={f.visit_date} onChange={e => setF({ ...f, visit_date: e.target.value })} /></div>
        <div><Label>Symptoms</Label><Textarea required value={f.symptoms} onChange={e => setF({ ...f, symptoms: e.target.value })} /></div>
        <div><Label>Diagnosis</Label><Textarea value={f.diagnosis} onChange={e => setF({ ...f, diagnosis: e.target.value })} /></div>
        <div><Label>Treatment</Label><Textarea value={f.treatment} onChange={e => setF({ ...f, treatment: e.target.value })} /></div>
        <div><Label>Referred To</Label><Input value={f.referred_to} onChange={e => setF({ ...f, referred_to: e.target.value })} placeholder="Hospital/clinic if any" /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending || !f.student_id}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
