import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/academics/exams")({ component: Page });

interface Exam { id: string; name: string; term: string; year: number; start_date: string | null; end_date: string | null; status: string }

function Page() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: ["exams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("exams").select("*").order("year", { ascending: false }).order("term");
      if (error) throw error;
      return data as Exam[];
    },
  });
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">Exams</h1><p className="text-sm text-muted-foreground mt-1">{data.length} exams scheduled</p></div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Schedule Exam</Button></DialogTrigger>
            <AddDialog onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["exams"] }); }} />
          </Dialog>
        )}
      </div>
      <Card>
        <CardHeader />
        <CardContent>
          {isLoading ? <div className="h-40 grid place-items-center"><Loader2 className="animate-spin" /></div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Term</TableHead><TableHead>Year</TableHead><TableHead>Dates</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No exams yet.</TableCell></TableRow>}
                {data.map(x => (
                  <TableRow key={x.id}>
                    <TableCell className="font-medium">{x.name}</TableCell>
                    <TableCell>{x.term}</TableCell>
                    <TableCell>{x.year}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{x.start_date ?? "—"} → {x.end_date ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{x.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AddDialog({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: "", term: "Term 1", year: new Date().getFullYear(), start_date: "", end_date: "", status: "planned" });
  const m = useMutation({
    mutationFn: async () => {
      const payload: any = { ...f };
      if (!payload.start_date) delete payload.start_date;
      if (!payload.end_date) delete payload.end_date;
      const { error } = await supabase.from("exams").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Exam scheduled"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Schedule Exam</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Name</Label><Input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Mid-term Exam" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Term</Label>
            <Select value={f.term} onValueChange={v => setF({ ...f, term: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="Term 1">Term 1</SelectItem><SelectItem value="Term 2">Term 2</SelectItem><SelectItem value="Term 3">Term 3</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label>Year</Label><Input type="number" value={f.year} onChange={e => setF({ ...f, year: +e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Start</Label><Input type="date" value={f.start_date} onChange={e => setF({ ...f, start_date: e.target.value })} /></div>
          <div><Label>End</Label><Input type="date" value={f.end_date} onChange={e => setF({ ...f, end_date: e.target.value })} /></div>
        </div>
        <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
