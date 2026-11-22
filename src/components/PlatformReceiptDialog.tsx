import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Printer, Receipt } from "lucide-react";

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function below1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} hundred`);
  if (r) {
    if (h) parts.push("and");
    parts.push(r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? "-" + ONES[r % 10] : ""}`);
  }
  return parts.join(" ");
}
function amountInWords(amount: number): string {
  const whole = Math.floor(Math.abs(amount));
  const cents = Math.round((Math.abs(amount) - whole) * 100);
  if (whole === 0 && cents === 0) return "Zero shillings only";
  const scales: [number, string][] = [[1_000_000_000, "billion"], [1_000_000, "million"], [1000, "thousand"]];
  let n = whole;
  const parts: string[] = [];
  for (const [v, name] of scales) {
    if (n >= v) { parts.push(`${below1000(Math.floor(n / v))} ${name}`); n %= v; }
  }
  if (n > 0) parts.push(parts.length && n < 100 ? `and ${below1000(n)}` : below1000(n));
  let words = parts.join(" ").trim() || "zero";
  words = words.charAt(0).toUpperCase() + words.slice(1);
  let out = `${words} shilling${whole === 1 ? "" : "s"}`;
  if (cents) out += ` and ${below1000(cents)} cents`;
  return `${out} only`;
}

const maskPhone = (p?: string | null) => {
  const d = String(p ?? "").replace(/\D+/g, "");
  return d.length >= 10 ? `${d.slice(0, 5)}****${d.slice(-3)}` : (p ?? "");
};
const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "medium" }) : "";
const kes = (n: number) => `KES ${Number(n).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-dashed last:border-0">
      <span className="text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
      <span className="text-sm text-right">{children}</span>
    </div>
  );
}

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .platform-receipt-print, .platform-receipt-print * { visibility: visible !important; }
  .platform-receipt-print { position: fixed; inset: 0; background: #fff; color: #000; padding: 24px; overflow: visible; }
}`;

function ReceiptBody({ paymentId }: { paymentId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["platform-receipt", paymentId],
    queryFn: async () => {
      const db = supabase as any;
      const { data: p, error: pe } = await db.from("platform_payments").select("*").eq("id", paymentId).single();
      if (pe) throw pe;
      const { data: inv } = await db
        .from("platform_invoices")
        .select("invoice_no, amount, period_start, period_end, school_id, notes")
        .eq("id", p.invoice_id)
        .maybeSingle();
      const { data: school } = inv?.school_id
        ? await db.from("schools").select("name, address, phone, email, logo_url").eq("id", inv.school_id).maybeSingle()
        : { data: null };
      const { data: all } = await db.from("platform_payments").select("id, amount, created_at").eq("invoice_id", p.invoice_id);
      let recordedBy: string | null = null;
      if (p.recorded_by) {
        const { data: u } = await db.from("profiles").select("full_name").eq("id", p.recorded_by).maybeSingle();
        recordedBy = u?.full_name ?? null;
      }
      return { p, inv, school, all: all ?? [], recordedBy };
    },
  });

  if (isLoading) return <div className="py-10 grid place-items-center"><Loader2 className="animate-spin" /></div>;
  if (error || !data) return <div className="py-6 text-sm text-destructive">Could not load this receipt.</div>;

  const { p, inv, school, all, recordedBy } = data as any;
  const isMpesa = String(p.method).toLowerCase() === "mpesa";
  const sorted = [...all].sort((a: any, b: any) =>
    a.created_at === b.created_at ? String(a.id).localeCompare(String(b.id)) : a.created_at < b.created_at ? -1 : 1);
  const idx = sorted.findIndex((x: any) => x.id === p.id);
  const paidBefore = sorted.slice(0, Math.max(idx, 0)).reduce((s: number, x: any) => s + Number(x.amount), 0);
  const invoiceTotal = Number(inv?.amount ?? 0);
  const amount = Number(p.amount);
  const balanceAfter = Math.max(invoiceTotal - paidBefore - amount, 0);
  const settled = balanceAfter <= 0.005;
  const when = p.transaction_at ?? p.created_at;

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="platform-receipt-print">
        <div className="text-center border-b pb-3 mb-4">
          <h2 className="text-xl font-bold">SmartDev ERP</h2>
          <p className="text-xs text-muted-foreground">app.smartdev.co.ke</p>
          <p className="text-sm font-semibold uppercase tracking-widest mt-2">Official Payment Receipt</p>
        </div>

        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-muted-foreground text-xs uppercase">Receipt No</div>
            <div className="font-mono font-semibold text-lg">{p.receipt_no ?? "—"}</div>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-bold border ${settled ? "border-green-600 text-green-700" : "border-amber-600 text-amber-700"}`}>
            {settled ? "PAID IN FULL" : "PARTIAL PAYMENT"}
          </span>
        </div>

        <div className="mb-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Received from</div>
          <div className="font-medium">{school?.name ?? "—"}</div>
          {school?.address && <div className="text-xs text-muted-foreground">{school.address}</div>}
          {(school?.phone || school?.email) && (
            <div className="text-xs text-muted-foreground">{[school?.phone, school?.email].filter(Boolean).join(" · ")}</div>
          )}
        </div>

        <div className="mb-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Invoice</div>
          <Row label="Invoice No"><span className="font-mono">{inv?.invoice_no}</span></Row>
          {inv?.period_start && <Row label="Billing period">{inv.period_start} → {inv.period_end}</Row>}
        </div>

        <div className="mb-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Payment details</div>
          <Row label="Date & time">{fmtDateTime(when)} <span className="text-xs text-muted-foreground">(EAT)</span></Row>
          <Row label="Method"><span className="capitalize">{isMpesa ? "M-Pesa" : p.method}</span></Row>
          {p.reference && <Row label={isMpesa ? "M-Pesa code" : "Reference"}><span className="font-mono font-semibold">{p.reference}</span></Row>}
          {p.payer_phone && <Row label="Paid from">{maskPhone(p.payer_phone)}</Row>}
          {p.paid_to && <Row label="Paid to">{p.paid_to}</Row>}
          <Row label="Recorded by">{recordedBy ?? (isMpesa ? "M-Pesa (automatic)" : "—")}</Row>
        </div>

        <div className="border rounded-lg p-3 bg-muted/20">
          <Row label="Invoice total">{kes(invoiceTotal)}</Row>
          <Row label="Paid before this receipt">{kes(paidBefore)}</Row>
          <Row label="This payment"><span className="font-semibold">{kes(amount)}</span></Row>
          <Row label="Balance remaining"><span className={balanceAfter > 0 ? "font-semibold text-destructive" : "font-semibold"}>{kes(balanceAfter)}</span></Row>
        </div>

        <div className="mt-4">
          <div className="text-xs text-muted-foreground uppercase">Amount Paid</div>
          <div className="text-2xl font-bold">{kes(amount)}</div>
          <div className="text-xs text-muted-foreground italic">{amountInWords(amount)}</div>
        </div>
        <p className="mt-5 text-center text-[10px] text-muted-foreground">
          This is a computer-generated receipt. Quote receipt no. {p.receipt_no ?? ""} for any enquiry.
        </p>
      </div>
      <div className="flex justify-end mt-4 print:hidden">
        <Button onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" />Print / Save as PDF</Button>
      </div>
    </>
  );
}

export function PlatformReceiptDialog({ paymentId, label = "Receipt" }: { paymentId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Receipt className="w-3 h-3 mr-1" />{label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payment receipt</DialogTitle>
            <DialogDescription className="sr-only">Full details of this payment</DialogDescription>
          </DialogHeader>
          {open && <ReceiptBody paymentId={paymentId} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Payment history with a Receipt button on every row. Pass schoolId to show one school's payments.
export function PlatformPaymentHistory({ schoolId, title = "Payment history" }: { schoolId?: string | null; title?: string }) {
  const { data: rows = [] } = useQuery({
    queryKey: ["platform-payments", schoolId ?? "all"],
    queryFn: async () => {
      let q = (supabase as any)
        .from("platform_payments")
        .select("id, receipt_no, amount, method, reference, created_at, transaction_at, platform_invoices!inner(invoice_no, school_id, schools(name))")
        .order("created_at", { ascending: false })
        .limit(100);
      if (schoolId) q = q.eq("platform_invoices.school_id", schoolId);
      const { data } = await q;
      return data ?? [];
    },
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Receipt #</TableHead>
              <TableHead>Date</TableHead>
              {!schoolId && <TableHead>School</TableHead>}
              <TableHead>Invoice</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={schoolId ? 7 : 8} className="text-center text-muted-foreground py-6">No payments yet</TableCell></TableRow>
            ) : rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.receipt_no ?? "—"}</TableCell>
                <TableCell className="text-xs">{fmtDateTime(r.transaction_at ?? r.created_at)}</TableCell>
                {!schoolId && <TableCell>{r.platform_invoices?.schools?.name ?? "—"}</TableCell>}
                <TableCell className="font-mono text-xs">{r.platform_invoices?.invoice_no ?? "—"}</TableCell>
                <TableCell className="capitalize">{r.method}</TableCell>
                <TableCell className="font-mono text-xs">{r.reference ?? "—"}</TableCell>
                <TableCell>{kes(Number(r.amount))}</TableCell>
                <TableCell className="text-right"><PlatformReceiptDialog paymentId={r.id} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
