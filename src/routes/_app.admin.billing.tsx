import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/use-tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditCard, Wallet, Building2 } from "lucide-react";
import { MpesaPayDialog } from "@/components/MpesaPayDialog";

export const Route = createFileRoute("/_app/admin/billing")({ component: BillingPage });

function BillingPage() {
  const { school } = useTenant();

  // useTenant().school can be null if the slug/subdomain hasn't resolved yet
  // (e.g. direct dashboard navigation rather than via subdomain or SchoolPicker).
  // Fall back to the logged-in user's own school_members row so billing data
  // still loads even when tenant context is unset.
  const { data: memberSchoolId } = useQuery({
    queryKey: ["my-school-id"],
    enabled: !school?.id,
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return null;
      const { data } = await (supabase as any)
        .from("school_members")
        .select("school_id")
        .eq("user_id", uid)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.school_id ?? null;
    },
  });

  const schoolId = school?.id ?? memberSchoolId;

  const { data: sub } = useQuery({
    queryKey: ["school-subscription", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("school_subscriptions")
        .select("status, current_period_start, current_period_end, subscription_plans(name, monthly_fee)")
        .eq("school_id", schoolId!)
        .maybeSingle();
      return data;
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["school-platform-invoices", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("platform_invoices")
        .select("id, invoice_no, period_start, period_end, amount, paid, status, due_date")
        .eq("school_id", schoolId!)
        .order("period_start", { ascending: false });
      return data ?? [];
    },
  });

  const planName = sub?.subscription_plans?.name ?? "—";
  const monthlyFee = Number(sub?.subscription_plans?.monthly_fee ?? 0);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><CreditCard className="w-5 h-5" /> Billing</h1>
        <p className="text-sm text-muted-foreground">Your subscription and invoices from the platform</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Current plan</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{planName}</div>
            <div className="text-xs text-muted-foreground mt-1">KES {monthlyFee.toLocaleString()} / month</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Status</CardTitle></CardHeader>
          <CardContent>
            <Badge variant={sub?.status === "active" ? "default" : "secondary"} className="capitalize text-base">
              {sub?.status ?? "—"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Billing period</CardTitle></CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{sub?.current_period_start ?? "—"}</div>
            <div className="text-xs text-muted-foreground">to {sub?.current_period_end ?? "—"}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Invoice history</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Invoice #</TableHead><TableHead>Period</TableHead>
              <TableHead>Amount</TableHead><TableHead>Paid</TableHead>
              <TableHead>Balance</TableHead><TableHead>Due</TableHead>
              <TableHead>Status</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {invoices.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No invoices yet</TableCell></TableRow>
              ) : invoices.map((inv: any) => {
                const balance = Number(inv.amount) - Number(inv.paid);
                const needsPayment = balance > 0 && inv.status !== "cancelled";
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs">{inv.invoice_no ?? inv.id.slice(0, 8)}</TableCell>
                    <TableCell className="text-xs">{inv.period_start} → {inv.period_end}</TableCell>
                    <TableCell>KES {Number(inv.amount).toLocaleString()}</TableCell>
                    <TableCell>KES {Number(inv.paid).toLocaleString()}</TableCell>
                    <TableCell className={balance > 0 ? "text-destructive font-medium" : ""}>
                      KES {balance.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs">{inv.due_date ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={inv.status === "paid" ? "default" : balance > 0 ? "destructive" : "secondary"} className="capitalize">
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {needsPayment && <PayNowButton invoice={inv} />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function PayNowButton({ invoice }: { invoice: any }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const balance = Number(invoice.amount) - Number(invoice.paid);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button size="sm">Pay now</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Pay invoice {invoice.invoice_no}</DialogTitle></DialogHeader>
          <div className="text-sm text-muted-foreground mb-2">
            Outstanding balance: <strong className="text-foreground">KES {balance.toLocaleString()}</strong>
          </div>

          <Tabs defaultValue="mpesa">
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="mpesa"><Wallet className="w-4 h-4 mr-1" /> M-Pesa</TabsTrigger>
              <TabsTrigger value="bank"><Building2 className="w-4 h-4 mr-1" /> Bank transfer</TabsTrigger>
            </TabsList>

            <TabsContent value="bank" className="space-y-2 mt-4 text-sm">
              <p className="text-muted-foreground">Transfer to the platform account:</p>
              <div className="border rounded p-3 bg-muted/30 space-y-1 text-xs">
                <div><strong>Contact platform owner for current bank details.</strong></div>
                <div className="text-muted-foreground mt-2">Reference: {invoice.invoice_no}</div>
                <div className="text-muted-foreground">Amount: KES {balance.toLocaleString()}</div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                After transferring, email the receipt to your account manager — payment is recorded within 24 hours.
              </p>
            </TabsContent>

            <TabsContent value="mpesa" className="space-y-2 mt-4 text-sm">
              <p className="text-muted-foreground text-xs">
                You'll get an M-Pesa prompt on your phone to enter your PIN and complete the payment.
              </p>
              <MpesaPayDialog
                invoiceId={invoice.id}
                outstanding={balance}
                triggerLabel={`Pay KES ${balance.toLocaleString()} with M-Pesa`}
                onPaid={() => {
                  qc.invalidateQueries({ queryKey: ["school-platform-invoices"] });
                  setOpen(false);
                }}
              />
            </TabsContent>
          </Tabs>

          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
