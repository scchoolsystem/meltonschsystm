import { useState, ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { checkEdit, editWithOverride } from "@/lib/permission.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Lock, ShieldAlert, Pencil } from "lucide-react";
import { toast } from "sonner";

interface Props {
  resource: "students" | "staff";
  resourceId: string;
  field: string;
  label: string;
  currentValue: string | number | null;
  type?: "text" | "number" | "date";
  onSaved?: () => void;
  display?: ReactNode;
}

export function LockedFieldGate({ resource, resourceId, field, label, currentValue, type = "text", onSaved, display }: Props) {
  const check = useServerFn(checkEdit);
  const save = useServerFn(editWithOverride);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>(currentValue == null ? "" : String(currentValue));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: perm } = useQuery({
    queryKey: ["perm", resource, field],
    queryFn: () => check({ data: { resource, field } }),
  });

  const allowed = !!perm?.allowed;
  const requiresOverride = !!perm?.requiresOverride;
  const classification = perm?.classification ?? "editable";

  async function commit() {
    if (!allowed) return;
    if (requiresOverride && reason.trim().length < 5) {
      toast.error("Reason (min 5 chars) is required for locked fields");
      return;
    }
    setSaving(true);
    try {
      await save({ data: { resource, resource_id: resourceId, field, new_value: type === "number" ? Number(value) : value, reason: reason || "edit" } });
      toast.success(requiresOverride ? "Override saved & logged" : "Updated");
      setOpen(false); setReason("");
      onSaved?.();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          {label}
          {classification === "locked" && <Lock className="w-3 h-3" />}
          {classification === "restricted" && <ShieldAlert className="w-3 h-3" />}
        </div>
        <div className="text-sm truncate">{display ?? currentValue ?? "—"}</div>
      </div>
      <div className="flex items-center gap-2">
        {classification !== "editable" && (
          <Badge variant="outline" className="text-xs capitalize">{classification}</Badge>
        )}
        <Button size="sm" variant="ghost" disabled={!allowed} onClick={() => setOpen(true)}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Edit {label}
              {requiresOverride && <Badge variant="destructive">Override</Badge>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>New value</Label>
              <Input type={type} value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            {requiresOverride && (
              <div>
                <Label>Reason (required, logged)</Label>
                <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this change needed?" />
                <p className="text-xs text-muted-foreground mt-1">This change will be permanently logged in the override audit trail.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={commit} disabled={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
