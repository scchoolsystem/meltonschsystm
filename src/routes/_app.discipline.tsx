import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/discipline")({ component: Page });

const sevColor: Record<string, string> = { minor: "", major: "bg-warning/15", severe: "bg-destructive/15 text-destructive border-destructive/30" };

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("teacher") || hasRole("deputy_principal");
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: ["discipline"],
    queryFn: async () => (await supabase.from("discipline_records").select("*, students(first_name,last_name,admission_no)").order("incident_date", { ascending: false }).limit(200)).data ?? [],
  });
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">Discipline</h1><p className="text-sm text-muted-foreground mt-1">{data.length} incidents</p></div>
        {can && <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Log Incident</Button></DialogTrigger>
          <AddDialog onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["discipline"] }); }} />
        </Dialog>}
      </div>
      <Card><CardHeader /><CardContent>
        {isLoading ? <div className="h-40 grid place-items-center"><Loader2 className="animate-spin" /></div> : (
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Student</TableHead><TableHead>Category</TableHead><TableHead>Severity</TableHead><TableHead>Description</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No incidents.</TableCell></TableRow>}
              {(data as any[]).map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{r.incident_date}</TableCell>
                  <TableCell className="font-medium">{r.students?.first_name} {r.students?.last_name}</TableCell>
                  <TableCell>{r.category}</TableCell>
                  <TableCell><Badge variant="outline" className={sevColor[r.severity] ?? ""}>{r.severity}</Badge></TableCell>
                  <TableCell className="max-w-sm text-sm truncate">{r.description}</TableCell>
                  <TableCell className="max-w-xs text-xs text-muted-foreground truncate">{r.action_taken ?? "—"}</TableCell>
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
  const [f, setF] = useState({ student_id: "", category: "behaviour", severity: "minor", description: "", action_taken: "", incident_date: new Date().toISOString().slice(0, 10) });
  const { data: students = [] } = useQuery({ queryKey: ["students-min3"], queryFn: async () => (await supabase.from("students").select("id,admission_no,first_name,last_name").limit(500)).data ?? [] });
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("discipline_records").insert({ ...f, reported_by: u.user?.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Incident logged"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Log Discipline Incident</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Student</Label>
          <Select value={f.student_id} onValueChange={v => setF({ ...f, student_id: v })}>
            <SelectTrigger><SelectValue placeholder="Choose student" /></SelectTrigger>
            <SelectContent>{(students as any[]).map(s => <SelectItem key={s.id} value={s.id}>{s.admission_no} – {s.first_name} {s.last_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Date</Label><Input type="date" value={f.incident_date} onChange={e => setF({ ...f, incident_date: e.target.value })} /></div>
          <div><Label>Severity</Label>
            <Select value={f.severity} onValueChange={v => setF({ ...f, severity: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="minor">Minor</SelectItem><SelectItem value="major">Major</SelectItem><SelectItem value="severe">Severe</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>Category</Label><Input value={f.category} onChange={e => setF({ ...f, category: e.target.value })} /></div>
        <div><Label>Description</Label><Textarea required value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
        <div><Label>Action Taken</Label><Textarea value={f.action_taken} onChange={e => setF({ ...f, action_taken: e.target.value })} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending || !f.student_id}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
