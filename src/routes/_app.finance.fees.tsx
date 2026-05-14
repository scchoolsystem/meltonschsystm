import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/finance/fees")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("bursar");
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: ["fees"],
    queryFn: async () => (await supabase.from("fee_structures").select("*").order("year", { ascending: false })).data ?? [],
  });
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">Fee Structures</h1><p className="text-sm text-muted-foreground mt-1">{data.length} entries</p></div>
        {can && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />New Fee</Button></DialogTrigger>
            <AddDialog onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["fees"] }); }} />
          </Dialog>
        )}
      </div>
      <Card><CardHeader /><CardContent>
        {isLoading ? <div className="h-40 grid place-items-center"><Loader2 className="animate-spin" /></div> : (
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Level</TableHead><TableHead>Term</TableHead><TableHead>Year</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No fee structures yet.</TableCell></TableRow>}
              {(data as any[]).map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="capitalize">{r.level}</TableCell>
                  <TableCell>{r.term}</TableCell>
                  <TableCell>{r.year}</TableCell>
                  <TableCell className="text-right font-mono">KES {Number(r.amount).toLocaleString()}</TableCell>
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
  const [f, setF] = useState({ name: "", level: "secondary", term: "Term 1", year: new Date().getFullYear(), amount: 0 });
  const m = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("fee_structures").insert(f); if (error) throw error; },
    onSuccess: () => { toast.success("Fee structure saved"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New Fee Structure</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Name</Label><Input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Level</Label>
            <Select value={f.level} onValueChange={v => setF({ ...f, level: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="primary">Primary</SelectItem><SelectItem value="secondary">Secondary</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label>Term</Label>
            <Select value={f.term} onValueChange={v => setF({ ...f, term: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="Term 1">Term 1</SelectItem><SelectItem value="Term 2">Term 2</SelectItem><SelectItem value="Term 3">Term 3</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Year</Label><Input type="number" value={f.year} onChange={e => setF({ ...f, year: +e.target.value })} /></div>
          <div><Label>Amount (KES)</Label><Input type="number" min={0} value={f.amount} onChange={e => setF({ ...f, amount: +e.target.value })} required /></div>
        </div>
        <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
