import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Receipt } from "lucide-react";

export const Route = createFileRoute("/platform/invoices")({
  component: PlatformInvoices,
});

function PlatformInvoices() {
  const { roles } = useAuth();
  const qc = useQueryClient();
  const isOwner = roles.includes("platform_owner");

  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ invoice_id: "", amount: "", method: "manual", reference: "" });

  const { data: invoices } = useQuery({
    queryKey: ["all-platform-invoices"],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_invoices")
        .select("*, schools(name, slug)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const recordPayment = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(payForm.amount);
      if (!amount || amount <= 0) throw new Error("Enter a valid amount");
      if (!payForm.invoice_id) throw new Error("Select an invoice");
      const { error } = await supabase.from("platform_payments").insert({
        invoice_id: payForm.invoice_id,
        amount,
        method: payForm.method,
        reference: payForm.reference || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      setPayOpen(false);
      setPayForm({ invoice_id: "", amount: "", method: "manual", reference: "" });
      qc.invalidateQueries({ queryKey: ["all-platform-invoices"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openInvoices = (invoices ?? []).filter((i: any) => i.status !== "paid");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Receipt className="h-6 w-6" /> Billing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">All platform invoices across schools.</p>
        </div>
        {isOwner && (
          <Dialog open={payOpen} onOpenChange={setPayOpen}>
            <DialogTrigger asChild><Button>Record payment</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record a payment</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Invoice</Label>
                  <Select value={payForm.invoice_id} onValueChange={(v) => setPayForm({ ...payForm, invoice_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Choose unpaid invoice..." /></SelectTrigger>
                    <SelectContent>
                      {openInvoices.map((i: any) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.invoice_no} · {i.schools?.name} · KES {(Number(i.amount) - Number(i.paid)).toLocaleString()} due
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Amount (KES)</Label>
                    <Input type="number" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} />
                  </div>
                  <div>
                    <Label>Method</Label>
                    <Select value={payForm.method} onValueChange={(v) => setPayForm({ ...payForm, method: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="bank">Bank transfer</SelectItem>
                        <SelectItem value="mpesa">M-Pesa</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Reference (optional)</Label>
                  <Input value={payForm.reference} onChange={e => setPayForm({ ...payForm, reference: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
                <Button onClick={() => recordPayment.mutate()} disabled={recordPayment.isPending}>
                  {recordPayment.isPending ? "Saving..." : "Record payment"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>All invoices</CardTitle><CardDescription>Newest first.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>School</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoices ?? []).map((i: any) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.invoice_no}</TableCell>
                  <TableCell>{i.schools?.name ?? "—"}</TableCell>
                  <TableCell className="text-xs">{i.period_start} → {i.period_end}</TableCell>
                  <TableCell>KES {Number(i.amount).toLocaleString()}</TableCell>
                  <TableCell>KES {Number(i.paid).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{i.due_date ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={i.status === "paid" ? "default" : i.status === "partial" ? "secondary" : "destructive"}>
                      {i.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {(!invoices || invoices.length === 0) && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">No invoices yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
