import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer, Loader2 } from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";

export const Route = createFileRoute("/_app/finance/receipt/$id")({ component: () => (<FeatureGate feature="finance"><Page /></FeatureGate>) });

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

function Page() {
  const { id } = Route.useParams();
  const { school } = useTenant();

  const { data, isLoading } = useQuery({
    queryKey: ["receipt-full", id],
    queryFn: async () => {
      const db = supabase as any;
      const { data: p, error } = await db
        .from("payments")
        .select("*, invoices(invoice_no, amount, description, students(first_name,last_name,admission_no,class_id,photo_url))")
        .eq("id", id)
        .single();
      if (error) throw error;

      // Every payment on this invoice, so we can show what was paid before and what is still owing.
      const { data: all } = await db
        .from("payments")
        .select("id, amount, created_at")
        .eq("invoice_id", p.invoice_id);

      let className: string | null = null;
      const classId = p.invoices?.students?.class_id;
      if (classId) {
        const { data: c } = await db.from("classes").select("name, stream").eq("id", classId).maybeSingle();
        if (c) className = [c.name, c.stream].filter(Boolean).join(" ");
      }

      let receivedBy: string | null = null;
      if (p.received_by) {
        const { data: u } = await db.from("profiles").select("full_name").eq("id", p.received_by).maybeSingle();
        receivedBy = u?.full_name ?? null;
      }
      return { p, all: all ?? [], className, receivedBy };
    },
  });

  if (isLoading) return <div className="h-screen grid place-items-center"><Loader2 className="animate-spin" /></div>;
  if (!data) return <div className="p-8">Receipt not found.</div>;

  const { p, all, className, receivedBy } = data as any;
  const inv = p.invoices;
  const s = inv?.students;

  const isMpesa = String(p.method).toLowerCase() === "mpesa";
  // Older payments only have "CODE (phone)" in the reference column.
  const refMatch = String(p.reference ?? "").match(/^(\S+)\s*(?:\((\d+)\))?/);
  const mpesaCode = p.mpesa_receipt || (isMpesa ? refMatch?.[1] : null);
  const payerPhone = p.payer_phone || (isMpesa ? refMatch?.[2] : null);

  const sorted = [...all].sort((a: any, b: any) =>
    a.created_at === b.created_at ? String(a.id).localeCompare(String(b.id)) : a.created_at < b.created_at ? -1 : 1);
  const idx = sorted.findIndex((x: any) => x.id === p.id);
  const paidBefore = sorted.slice(0, Math.max(idx, 0)).reduce((sum: number, x: any) => sum + Number(x.amount), 0);
  const invoiceTotal = Number(inv?.amount ?? 0);
  const amount = Number(p.amount);
  const balanceAfter = Math.max(invoiceTotal - paidBefore - amount, 0);
  const settled = balanceAfter <= 0.005;
  const when = p.transaction_at ?? p.created_at;

  return (
    <div className="min-h-screen bg-muted/30 py-8 print:bg-white print:py-0">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex items-center justify-between mb-4 print:hidden">
          <h1 className="text-2xl font-bold">Receipt</h1>
          <Button onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" />Print / Save as PDF</Button>
        </div>

        <div className="receipt-print bg-card border rounded-xl p-10 print:border-0 print:rounded-none print:shadow-none">
          <div className="text-center border-b pb-4 mb-5">
            {school?.logo_url && <img src={school.logo_url} alt="logo" className="w-16 h-16 object-contain mx-auto mb-2" />}
            <h2 className="text-2xl font-bold">{school?.name || "School"}</h2>
            {school?.motto && <p className="text-xs italic text-muted-foreground">{school.motto}</p>}
            {school?.address && <p className="text-xs text-muted-foreground">{school.address}</p>}
            {(school?.phone || school?.email) && (
              <p className="text-xs text-muted-foreground">{[school?.phone, school?.email].filter(Boolean).join(" · ")}</p>
            )}
            <p className="text-sm font-semibold uppercase tracking-widest mt-2">Official Payment Receipt</p>
          </div>

          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-muted-foreground text-xs uppercase">Receipt No</div>
              <div className="font-mono font-semibold text-lg">{p.receipt_no}</div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${settled ? "border-green-600 text-green-700" : "border-amber-600 text-amber-700"}`}>
              {settled ? "PAID IN FULL" : "PARTIAL PAYMENT"}
            </span>
          </div>

          <div className="mb-4">
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Student</div>
            <div className="flex items-center gap-3">
              {s?.photo_url && <img src={s.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />}
              <div>
                <div className="font-medium">{s?.first_name} {s?.last_name}</div>
                <div className="text-xs text-muted-foreground">
                  Adm. No: {s?.admission_no}{className ? ` · Class: ${className}` : ""}
                </div>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Invoice</div>
            <Row label="Invoice No"><span className="font-mono">{inv?.invoice_no}</span></Row>
            {inv?.description && <Row label="For">{inv.description}</Row>}
          </div>

          <div className="mb-4">
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Payment details</div>
            <Row label="Date & time">{fmtDateTime(when)} <span className="text-xs text-muted-foreground">(EAT)</span></Row>
            <Row label="Method"><span className="capitalize">{isMpesa ? "M-Pesa" : p.method}</span></Row>
            {mpesaCode && <Row label="M-Pesa code"><span className="font-mono font-semibold">{mpesaCode}</span></Row>}
            {payerPhone && <Row label="Paid from">{maskPhone(payerPhone)}</Row>}
            {p.paid_to && <Row label="Paid to">{p.paid_to}</Row>}
            {!isMpesa && p.reference && <Row label="Reference">{p.reference}</Row>}
            <Row label="Received by">{receivedBy ?? (isMpesa ? "M-Pesa (automatic)" : "—")}</Row>
          </div>

          <div className="border rounded-lg p-4 bg-muted/20">
            <Row label="Invoice total">{kes(invoiceTotal)}</Row>
            <Row label="Paid before this receipt">{kes(paidBefore)}</Row>
            <Row label="This payment"><span className="font-semibold">{kes(amount)}</span></Row>
            <Row label="Balance remaining"><span className={balanceAfter > 0 ? "font-semibold text-destructive" : "font-semibold"}>{kes(balanceAfter)}</span></Row>
          </div>

          <div className="mt-5 flex items-end justify-between">
            <div>
              <div className="text-xs text-muted-foreground uppercase">Amount Paid</div>
              <div className="text-3xl font-bold">{kes(amount)}</div>
              <div className="text-xs text-muted-foreground mt-1 italic">{amountInWords(amount)}</div>
            </div>
          </div>

          <div className="mt-12 grid grid-cols-2 gap-8 text-xs text-muted-foreground">
            <div className="border-t pt-2 text-center">Received by{receivedBy ? `: ${receivedBy}` : ""}</div>
            <div className="border-t pt-2 text-center">Authorized signature &amp; stamp</div>
          </div>
          <p className="mt-6 text-center text-[10px] text-muted-foreground">
            This is a computer-generated receipt. Quote receipt no. {p.receipt_no} for any enquiry.
          </p>
        </div>
      </div>
    </div>
  );
}
