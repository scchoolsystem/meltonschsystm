import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Smartphone } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  schoolId: string;
  amountDue: number;
  onPaid?: () => void;
};

export function PlatformMpesaPayDialog({ open, onOpenChange, invoiceId, schoolId, amountDue, onPaid }: Props) {
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState(String(amountDue));
  const [status, setStatus] = useState<"idle" | "sending" | "waiting" | "success" | "failed">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const txnIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStatus("idle");
      setMessage(null);
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [open]);

  const startPolling = (txnId: string) => {
    txnIdRef.current = txnId;
    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from("platform_mpesa_transactions")
        .select("status, result_desc, mpesa_receipt")
        .eq("id", txnId)
        .maybeSingle();
      if (!data) return;
      if (data.status === "success") {
        setStatus("success");
        setMessage(`Payment confirmed. Receipt: ${data.mpesa_receipt ?? "—"}`);
        if (pollRef.current) clearInterval(pollRef.current);
        toast.success("Payment received");
        onPaid?.();
      } else if (data.status === "failed" || data.status === "cancelled") {
        setStatus("failed");
        setMessage(data.result_desc ?? "Payment was not completed");
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 3000);

    // Stop polling after 2 minutes regardless
    setTimeout(() => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (status === "waiting") {
        setStatus("failed");
        setMessage("Timed out waiting for confirmation. Check your phone or try again.");
      }
    }, 120000);
  };

  const handlePay = async () => {
    if (!phone.trim()) {
      toast.error("Enter the M-Pesa phone number");
      return;
    }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setStatus("sending");
    setMessage(null);
    try {
      const defaultApiBase = window.location.protocol === "file:" ? "https://app.smartdev.co.ke" : "";
      const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? defaultApiBase;
      const res = await fetch(`${apiBase}/api/public/platform-mpesa-stk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId, school_id: schoolId, phone, amount: amt }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to send STK push");
      setStatus("waiting");
      setMessage("Check your phone and enter your M-Pesa PIN to complete the payment.");
      startPolling(json.transaction_id);
    } catch (e: any) {
      setStatus("failed");
      setMessage(e.message ?? "Something went wrong");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" /> Pay with M-Pesa
          </DialogTitle>
        </DialogHeader>

        {status === "idle" || status === "sending" ? (
          <div className="space-y-3">
            <div>
              <Label>Phone number</Label>
              <Input placeholder="07XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label>Amount (KES)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="py-6 text-center space-y-2">
            {status === "waiting" && <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />}
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
        )}

        <DialogFooter>
          {status === "idle" || status === "sending" ? (
            <Button onClick={handlePay} disabled={status === "sending"} className="w-full">
              {status === "sending" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Send M-Pesa prompt
            </Button>
          ) : status === "success" ? (
            <Button onClick={() => onOpenChange(false)} className="w-full">Done</Button>
          ) : (
            <Button variant="outline" onClick={() => setStatus("idle")} className="w-full">Try again</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
