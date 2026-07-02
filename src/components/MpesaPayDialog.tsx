import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initiateMpesaPayment } from "@/lib/mpesa.functions";
import { toast } from "sonner";
import { Smartphone } from "lucide-react";

interface Props {
  invoiceId: string;
  outstanding: number;
  defaultPhone?: string;
  triggerLabel?: string;
}

export function MpesaPayDialog({ invoiceId, outstanding, defaultPhone = "", triggerLabel = "Pay" }: Props) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(defaultPhone);
  const [amount, setAmount] = useState(String(outstanding));
  const [busy, setBusy] = useState(false);
  const initiate = useServerFn(initiateMpesaPayment);

  async function submit() {
    setBusy(true);
    try {
      const r = await initiate({ data: { invoice_id: invoiceId, phone, amount: Number(amount) } });
      toast.success(r.message ?? "STK push sent");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to initiate payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={outstanding <= 0}>
          <Smartphone className="w-4 h-4 mr-1" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay with M-Pesa</DialogTitle>
          <DialogDescription>Outstanding: KES {outstanding.toLocaleString()}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Safaricom phone number</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XXXXXXXX" />
          </div>
          <div>
            <Label>Amount (KES)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !phone || !Number(amount)}>
            {busy ? "Sending…" : "Send STK push"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
