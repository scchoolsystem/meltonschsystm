import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { setStudentLifecycle, setStaffLifecycle } from "@/lib/lifecycle.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Kind = "student" | "staff";
const STATES: Record<Kind, { value: string; label: string }[]> = {
  student: [
    { value: "active", label: "Restore to active" },
    { value: "suspended", label: "Suspend" },
    { value: "expelled", label: "Expel" },
    { value: "transferred", label: "Transfer out" },
    { value: "archived", label: "Archive" },
  ],
  staff: [
    { value: "active", label: "Restore to active" },
    { value: "suspended", label: "Suspend" },
    { value: "transferred", label: "Transfer out" },
    { value: "archived", label: "Archive" },
  ],
};

export function LifecycleActions({
  kind, id, currentStatus, queryKey,
}: { kind: Kind; id: string; currentStatus: string; queryKey: string }) {
  const qc = useQueryClient();
  const setStudent = useServerFn(setStudentLifecycle);
  const setStaff = useServerFn(setStaffLifecycle);
  const [open, setOpen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [transferredTo, setTransferredTo] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!open) return;
    if (reason.trim().length < 3) return toast.error("Reason is required (min 3 chars)");
    setBusy(true);
    try {
      const payload: any = { reason, to_status: open };
      if (open === "transferred") payload.transferred_to = transferredTo;
      if (kind === "student") await setStudent({ data: { ...payload, student_id: id } });
      else await setStaff({ data: { ...payload, staff_id: id } });
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: [queryKey] });
      setOpen(null); setReason(""); setTransferredTo("");
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost"><MoreHorizontal className="w-4 h-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {STATES[kind].filter(s => s.value !== currentStatus).map((s, i) => (
            <>
              {i > 0 && s.value === "archived" && <DropdownMenuSeparator />}
              <DropdownMenuItem key={s.value} onSelect={() => setOpen(s.value)}>{s.label}</DropdownMenuItem>
            </>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change status → {open}</DialogTitle>
            <DialogDescription>
              This action is logged to the lifecycle audit trail. {open !== "active" && "Affected login will be deactivated."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Reason *</Label><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this change?" /></div>
            {open === "transferred" && (
              <div><Label>Transferred to</Label><Input value={transferredTo} onChange={(e) => setTransferredTo(e.target.value)} placeholder="Destination school / location" /></div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
