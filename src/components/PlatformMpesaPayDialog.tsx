import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Smartphone } from "lucide-react";

interface Props {
  invoiceId: string;
  outstanding: number;
  defaultPhone?: string;
  triggerLabel?: string;
  onPaid?: () => void;
}

// Pays a PLATFORM (SmartDev subscription) invoice with M-Pesa STK push to the platform owner's till.
// The server works out the amount from the invoice; nothing here is trusted for the amount.
export function PlatformMpesaPayDialog({ invoiceId, outstanding, defaultPhone = "", triggerLabel = "Pay", onPaid }: Props) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(defaultPhone);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } setBusy(false); };
  useEffect(() => stop, []);

  async function submit() {
    setBusy(true);
    setNote(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Please sign in again.");
      const res = await fetch("/api/public/platform-mpesa-stk", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ invoice_id: invoiceId, phone }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Could not send the M-Pesa prompt.");

      setNote("Check your phone and enter your M-Pesa PIN…");
      const started = Date.now();
      timer.current = setInterval(async () => {
        const { data } = await supabase
          .from("platform_mpesa_transactions")
          .select("status, result_desc")
          .eq("id", j.transaction_id)
          .maybeSingle();
        const st = data?.status;
        if (st === "success") {
          stop(); toast.success("Payment received. Thank you!"); setOpen(false); onPaid?.();
        } else if (st === "cancelled" || st === "failed") {
          stop(); setNote(null); toast.error(data?.result_desc || "Payment did not go through. Please try again.");
        } else if (st === "review") {
          stop(); setNote("We received your payment but need to verify it. We'll confirm shortly.");
        } else if (Date.now() - started > 120_000) {
          stop(); setNote("No confirmation yet. If money left your M-Pesa, don't pay again — contact support quoting this invoice.");
        }
      }, 3000);
    } catch (e: any) {
      stop();
      toast.error(e?.message ?? "Failed to start payment");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={outstanding <= 0}>
          <Smartphone className="w-4 h-4 mr-1" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay with M-Pesa</DialogTitle>
          <DialogDescription>Amount due: KES {outstanding.toLocaleString()}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Safaricom phone number</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XXXXXXXX" disabled={busy} />
          </div>
          {note && <p className="text-sm text-muted-foreground">{note}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !phone}>{busy ? "Waiting for payment…" : "Send STK push"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
