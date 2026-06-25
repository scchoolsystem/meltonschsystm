import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer, Loader2 } from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";

export const Route = createFileRoute("/_app/finance/receipt/$id")({ component: () => (<FeatureGate feature="finance"><Page /></FeatureGate>) });

function Page() {
  const { id } = Route.useParams();
  const { school } = useTenant();
  const { data, isLoading } = useQuery({
    queryKey: ["receipt", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, invoices(invoice_no, amount, students(first_name,last_name,admission_no,class_id,photo_url))")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="h-screen grid place-items-center"><Loader2 className="animate-spin" /></div>;
  if (!data) return <div className="p-8">Receipt not found.</div>;

  const p: any = data;
  const inv = p.invoices;
  const s = inv?.students;

  return (
    <div className="min-h-screen bg-muted/30 py-8 print:bg-white print:py-0">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex items-center justify-between mb-4 print:hidden">
          <h1 className="text-2xl font-bold">Receipt</h1>
          <Button onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" />Print</Button>
        </div>
        <div className="receipt-print bg-card border rounded-xl p-10 print:border-0 print:rounded-none print:shadow-none">
          <div className="text-center border-b pb-4 mb-6">
            {school?.logo_url && (
              <img src={school.logo_url} alt="logo" className="w-16 h-16 object-contain mx-auto mb-2" />
            )}
            <h2 className="text-2xl font-bold">{school?.name || "School"}</h2>
            {school?.address && <p className="text-xs text-muted-foreground">{school.address}</p>}
            <p className="text-sm text-muted-foreground mt-1">Official Payment Receipt</p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm mb-6">
            <div><div className="text-muted-foreground text-xs uppercase">Receipt No</div><div className="font-mono font-semibold">{p.receipt_no}</div></div>
            <div><div className="text-muted-foreground text-xs uppercase">Date</div><div>{p.paid_on}</div></div>
            <div><div className="text-muted-foreground text-xs uppercase">Invoice</div><div className="font-mono">{inv?.invoice_no}</div></div>
            <div><div className="text-muted-foreground text-xs uppercase">Method</div><div className="capitalize">{p.method}</div></div>
            <div className="col-span-2"><div className="text-muted-foreground text-xs uppercase">Student</div><div className="flex items-center gap-2">{s?.photo_url && <img src={s.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />}<span>{s?.first_name} {s?.last_name} <span className="text-xs text-muted-foreground">({s?.admission_no})</span></span></div></div>
            {p.reference && <div className="col-span-2"><div className="text-muted-foreground text-xs uppercase">Reference</div><div>{p.reference}</div></div>}
          </div>
          <div className="border-t pt-4 flex items-end justify-between">
            <div>
              <div className="text-xs text-muted-foreground uppercase">Amount Paid</div>
              <div className="text-3xl font-bold">KES {Number(p.amount).toLocaleString()}</div>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <div>Invoice total: KES {Number(inv?.amount ?? 0).toLocaleString()}</div>
            </div>
          </div>
          <div className="mt-12 grid grid-cols-2 gap-8 text-xs text-muted-foreground">
            <div className="border-t pt-2 text-center">Received by</div>
            <div className="border-t pt-2 text-center">Authorized signature</div>
          </div>
        </div>
      </div>
    </div>
  );
}
