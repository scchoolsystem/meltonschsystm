import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Users as UsersIcon, Building2, Archive, ChevronRight, ChevronLeft, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { setStaffLifecycle } from "@/lib/lifecycle.functions";
import { toast } from "sonner";

type Action = "role" | "department" | "archive";

const ROLE_OPTIONS = [
  "teacher", "class_teacher", "subject_teacher", "hod",
  "principal", "deputy_principal", "bursar", "librarian",
  "nurse", "matron", "sports", "boarding", "admission_officer",
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedIds: string[];
  departments: { id: string; name: string }[];
  onComplete: () => void;
}

export function BulkActionsWizard({ open, onOpenChange, selectedIds, departments, onComplete }: Props) {
  const qc = useQueryClient();
  const setLifecycleFn = useServerFn(setStaffLifecycle);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [action, setAction] = useState<Action | null>(null);
  const [role, setRole] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [result, setResult] = useState<{ ok: number; failed: { name: string; error: string }[] } | null>(null);

  // Reset whenever dialog opens
  useEffect(() => {
    if (open) {
      setStep(1); setAction(null); setRole(""); setDepartmentId("");
      setReason(""); setPreview([]); setResult(null);
    }
  }, [open]);

  // Load preview when entering step 3
  useEffect(() => {
    if (step !== 3 || preview.length || previewLoading) return;
    setPreviewLoading(true);
    supabase.from("staff")
      .select("id, first_name, last_name, employee_no, role, department_id, lifecycle_status")
      .in("id", selectedIds)
      .then(({ data }) => { setPreview(data ?? []); setPreviewLoading(false); });
  }, [step, selectedIds, preview.length, previewLoading]);

  const canAdvance = useMemo(() => {
    if (step === 1) return !!action;
    if (step === 2) {
      if (action === "role") return !!role;
      if (action === "department") return !!departmentId;
      if (action === "archive") return reason.trim().length >= 3;
    }
    return true;
  }, [step, action, role, departmentId, reason]);

  const apply = useMutation({
    mutationFn: async () => {
      const failed: { name: string; error: string }[] = [];
      let ok = 0;
      if (action === "role") {
        const { error } = await supabase.from("staff").update({ role: role as any }).in("id", selectedIds);
        if (error) throw error;
        ok = selectedIds.length;
      } else if (action === "department") {
        const { error } = await supabase.from("staff").update({ department_id: departmentId }).in("id", selectedIds);
        if (error) throw error;
        ok = selectedIds.length;
      } else if (action === "archive") {
        for (const id of selectedIds) {
          try {
            await setLifecycleFn({ data: { id, status: "archived", reason } });
            ok++;
          } catch (e: any) {
            const p = preview.find((x) => x.id === id);
            failed.push({ name: p ? `${p.first_name} ${p.last_name}` : id, error: e?.message ?? "Failed" });
          }
        }
      }
      return { ok, failed };
    },
    onSuccess: (r) => {
      setResult(r);
      setStep(4);
      qc.invalidateQueries({ queryKey: ["staff"] });
      if (r.failed.length === 0) toast.success(`Applied to ${r.ok} staff`);
      else toast.warning(`${r.ok} succeeded, ${r.failed.length} failed`);
    },
    onError: (e: any) => toast.error(e.message ?? "Bulk action failed"),
  });

  const summary = () => {
    if (action === "role") return `Assign role "${role.replace(/_/g, " ")}"`;
    if (action === "department") return `Move to ${departments.find((d) => d.id === departmentId)?.name ?? "department"}`;
    if (action === "archive") return `Archive — ${reason}`;
    return "";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Bulk actions
            <Badge variant="secondary">{selectedIds.length} selected</Badge>
          </DialogTitle>
          <Stepper step={step} />
        </DialogHeader>

        {step === 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-2">
            <ActionCard active={action === "role"} onClick={() => setAction("role")} icon={<UsersIcon />} label="Assign role" hint="Update role for all selected" />
            <ActionCard active={action === "department"} onClick={() => setAction("department")} icon={<Building2 />} label="Move department" hint="Reassign to a department" />
            <ActionCard active={action === "archive"} onClick={() => setAction("archive")} icon={<Archive />} label="Archive" hint="Soft-archive (recoverable)" />
          </div>
        )}

        {step === 2 && action === "role" && (
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">New role</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue placeholder="Pick a role…" /></SelectTrigger>
              <SelectContent>{ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r} className="capitalize">{r.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">All selected staff will be reassigned to this role. Existing role-derived permissions update immediately.</p>
          </div>
        )}
        {step === 2 && action === "department" && (
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Destination department</label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger><SelectValue placeholder="Pick a department…" /></SelectTrigger>
              <SelectContent>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        {step === 2 && action === "archive" && (
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Reason</label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. End of contract, transfer, retirement" />
            <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Archived staff lose dashboard access but records are kept.</p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3 py-2">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="font-medium">{summary()}</div>
              <div className="text-xs text-muted-foreground">Applies to {selectedIds.length} staff member{selectedIds.length === 1 ? "" : "s"}.</div>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border">
              {previewLoading ? (
                <div className="p-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
              ) : preview.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No staff loaded.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase">
                    <tr><th className="text-left p-2">Name</th><th className="text-left p-2">Employee #</th><th className="text-left p-2">Current</th></tr>
                  </thead>
                  <tbody>
                    {preview.map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="p-2">{p.first_name} {p.last_name}</td>
                        <td className="p-2 font-mono text-xs">{p.employee_no}</td>
                        <td className="p-2 text-xs text-muted-foreground capitalize">
                          {action === "role" && p.role?.replace(/_/g, " ")}
                          {action === "department" && (departments.find((d) => d.id === p.department_id)?.name ?? "—")}
                          {action === "archive" && p.lifecycle_status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {step === 4 && result && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 rounded-md border bg-success/10 text-success-foreground p-3">
              <CheckCircle2 className="w-5 h-5 text-success" />
              <div className="text-sm"><span className="font-medium">{result.ok} updated</span> successfully.</div>
            </div>
            {result.failed.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <div className="text-sm font-medium text-destructive flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{result.failed.length} failed</div>
                <ul className="text-xs mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {result.failed.map((f, i) => <li key={i}><span className="font-medium">{f.name}</span> — {f.error}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && step < 4 && (
            <Button variant="outline" onClick={() => setStep((s) => (s - 1) as any)} disabled={apply.isPending}>
              <ChevronLeft className="w-4 h-4 mr-1" />Back
            </Button>
          )}
          {step < 3 && (
            <Button onClick={() => setStep((s) => (s + 1) as any)} disabled={!canAdvance}>
              Next<ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
          {step === 3 && (
            <Button onClick={() => apply.mutate()} disabled={apply.isPending}>
              {apply.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Apply to {selectedIds.length}
            </Button>
          )}
          {step === 4 && (
            <Button onClick={() => { onOpenChange(false); onComplete(); }}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ step }: { step: number }) {
  const items = ["Choose action", "Configure", "Preview", "Result"];
  return (
    <div className="flex items-center gap-1 text-xs">
      {items.map((label, i) => {
        const n = i + 1;
        const done = step > n;
        const active = step === n;
        return (
          <div key={label} className="flex items-center gap-1">
            <span className={`w-5 h-5 grid place-items-center rounded-full text-[10px] font-bold ${active ? "bg-primary text-primary-foreground" : done ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}`}>{n}</span>
            <span className={active ? "font-medium" : "text-muted-foreground"}>{label}</span>
            {i < items.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground mx-1" />}
          </div>
        );
      })}
    </div>
  );
}

function ActionCard({ active, onClick, icon, label, hint }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; hint: string }) {
  return (
    <button onClick={onClick}
      className={`text-left rounded-md border p-3 transition hover:border-primary ${active ? "border-primary bg-primary/5 ring-1 ring-primary" : ""}`}>
      <div className="w-8 h-8 grid place-items-center rounded-md bg-primary/10 text-primary mb-2 [&>svg]:w-4 [&>svg]:h-4">{icon}</div>
      <div className="font-medium text-sm">{label}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
    </button>
  );
}
