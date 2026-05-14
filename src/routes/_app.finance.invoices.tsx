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

export const Route = createFileRoute("/_app/finance/invoices")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("bursar");
  const [open, setOpen] = useState(false);
  const [openPay, setOpenPay] = useState<string | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => (await supabase.from("invoices").select("*, students(first_name,last_name,admission_no)").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">Invoices</h1><p className="text-sm text-muted-foreground mt-1">{data.length} invoices</p></div>
        {can && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Issue Invoice</Button></DialogTrigger>
            <IssueDialog onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["invoices"] }); }} />
          </Dialog>
        )}
      </div>
      <Card><CardHeader /><CardContent>
        {isLoading ? <div className="h-40 grid place-items-center"><Loader2 className="animate-spin" /></div> : (
          <Table>
            <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Student</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Paid</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {data.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No invoices.</TableCell></TableRow>}
              {(data as any[]).map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.invoice_no}</TableCell>
                  <TableCell>{r.students?.first_name} {r.students?.last_name} <span className="text-xs text-muted-foreground">({r.students?.admission_no})</span></TableCell>
                  <TableCell className="text-right font-mono">KES {Number(r.amount).toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono">KES {Number(r.paid).toLocaleString()}</TableCell>
                  <TableCell><Badge variant="outline" className={r.status === 'paid' ? 'bg-success/15 text-success border-success/30' : r.status === 'partial' ? 'bg-warning/15' : ''}>{r.status}</Badge></TableCell>
                  <TableCell>
                    {can && r.status !== 'paid' && (
                      <Dialog open={openPay === r.id} onOpenChange={v => setOpenPay(v ? r.id : null)}>
                        <DialogTrigger asChild><Button size="sm" variant="outline">Pay</Button></DialogTrigger>
                        <PayDialog invoiceId={r.id} balance={Number(r.amount) - Number(r.paid)} onDone={() => { setOpenPay(null); qc.invalidateQueries({ queryKey: ["invoices"] }); }} />
                      </Dialog>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  );
}

function IssueDialog({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ student_id: "", amount: 0, due_date: "" });
  const { data: students = [] } = useQuery({ queryKey: ["students-min2"], queryFn: async () => (await supabase.from("students").select("id,admission_no,first_name,last_name").limit(500)).data ?? [] });
  const m = useMutation({
    mutationFn: async () => {
      const payload: any = { ...f }; if (!payload.due_date) delete payload.due_date;
      const { error } = await supabase.from("invoices").insert(payload); if (error) throw error;
    },
    onSuccess: () => { toast.success("Invoice issued"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Issue Invoice</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Student</Label>
          <Select value={f.student_id} onValueChange={v => setF({ ...f, student_id: v })}>
            <SelectTrigger><SelectValue placeholder="Choose student" /></SelectTrigger>
            <SelectContent>{(students as any[]).map(s => <SelectItem key={s.id} value={s.id}>{s.admission_no} – {s.first_name} {s.last_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Amount (KES)</Label><Input type="number" min={1} value={f.amount} onChange={e => setF({ ...f, amount: +e.target.value })} required /></div>
          <div><Label>Due Date</Label><Input type="date" value={f.due_date} onChange={e => setF({ ...f, due_date: e.target.value })} /></div>
        </div>
        <DialogFooter><Button type="submit" disabled={m.isPending || !f.student_id}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Issue</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function PayDialog({ invoiceId, balance, onDone }: { invoiceId: string; balance: number; onDone: () => void }) {
  const [f, setF] = useState({ amount: balance, method: "cash", reference: "" });
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("payments").insert({ invoice_id: invoiceId, ...f } as any); if (error) throw error;
    },
    onSuccess: () => { toast.success("Payment recorded"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Amount (balance: KES {balance.toLocaleString()})</Label><Input type="number" min={1} max={balance} value={f.amount} onChange={e => setF({ ...f, amount: +e.target.value })} required /></div>
        <div><Label>Method</Label>
          <Select value={f.method} onValueChange={v => setF({ ...f, method: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="mpesa">M-Pesa</SelectItem><SelectItem value="bank">Bank</SelectItem><SelectItem value="cheque">Cheque</SelectItem></SelectContent>
          </Select>
        </div>
        <div><Label>Reference / Txn No</Label><Input value={f.reference} onChange={e => setF({ ...f, reference: e.target.value })} /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Record</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
