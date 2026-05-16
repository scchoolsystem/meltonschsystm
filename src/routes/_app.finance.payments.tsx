import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/finance/payments")({ component: Page });

function Page() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["payments"],
    queryFn: async () => (await supabase.from("payments").select("*, invoices(invoice_no, students(first_name,last_name,admission_no))").order("paid_on", { ascending: false }).limit(300)).data ?? [],
  });
  const total = (data as any[]).reduce((s, p) => s + Number(p.amount), 0);
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">Payments</h1><p className="text-sm text-muted-foreground mt-1">Latest 300 transactions</p></div>
        <Badge variant="outline" className="text-base px-3 py-1">Total: KES {total.toLocaleString()}</Badge>
      </div>
      <Card><CardHeader /><CardContent>
        {isLoading ? <div className="h-40 grid place-items-center"><Loader2 className="animate-spin" /></div> : (
          <Table>
            <TableHeader><TableRow><TableHead>Receipt</TableHead><TableHead>Date</TableHead><TableHead>Invoice</TableHead><TableHead>Student</TableHead><TableHead>Method</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {data.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No payments yet.</TableCell></TableRow>}
              {(data as any[]).map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.receipt_no}</TableCell>
                  <TableCell>{p.paid_on}</TableCell>
                  <TableCell className="font-mono text-xs">{p.invoices?.invoice_no}</TableCell>
                  <TableCell>{p.invoices?.students?.first_name} {p.invoices?.students?.last_name}</TableCell>
                  <TableCell className="capitalize">{p.method}</TableCell>
                  <TableCell className="text-xs">{p.reference ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">KES {Number(p.amount).toLocaleString()}</TableCell>
                  <TableCell>
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/finance/receipt/$id" params={{ id: p.id }}><Printer className="w-3 h-3" /></Link>
                    </Button>
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
