import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Lock, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/admin/permissions")({
  component: PermissionsPage,
});

interface Policy {
  id: string; resource: string; field: string;
  classification: string; required_level: number; notes: string | null;
}

const RESOURCES = ["students", "staff", "invoices", "payments", "exam_results"];
const CLASSIFICATIONS = ["editable", "restricted", "locked"];

function PermissionsPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ["field-policies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("field_policies").select("*").order("resource").order("field");
      if (error) throw error;
      return data as Policy[];
    },
  });

  const filtered = filter === "all" ? policies : policies.filter(p => p.resource === filter);

  async function remove(id: string) {
    if (!confirm("Delete this policy? Field will revert to default editability.")) return;
    const { error } = await supabase.from("field_policies").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Policy removed");
    qc.invalidateQueries({ queryKey: ["field-policies"] });
  }

  if (!isAdmin) {
    return <div className="p-6 text-muted-foreground">Admin only. You don't have permission to view field policies.</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Field Permissions</h1>
          <p className="text-sm text-muted-foreground mt-1">Centralized governance — controls which roles can edit which fields, and which require override.</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All resources</SelectItem>
              {RESOURCES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <PolicyDialog onSaved={() => qc.invalidateQueries({ queryKey: ["field-policies"] })} />
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Policies ({filtered.length})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Resource</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead>Classification</TableHead>
                    <TableHead>Required Level</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">No policies — all fields use defaults (editable at level ≥ 50).</TableCell></TableRow>
                  )}
                  {filtered.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.resource}</TableCell>
                      <TableCell className="font-medium">{p.field}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize gap-1">
                          {p.classification === "locked" && <Lock className="w-3 h-3" />}
                          {p.classification === "restricted" && <ShieldAlert className="w-3 h-3" />}
                          {p.classification}
                        </Badge>
                      </TableCell>
                      <TableCell>{p.required_level}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{p.notes ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => remove(p.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Role levels</CardTitle></CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <div>100 — super_admin · 90 — principal · 80 — deputy_principal · 75 — academic_master</div>
          <div>70 — exams_admin, bursar, finance_admin · 60 — hod, admission_officer, boarding/kitchen/security/transport admin</div>
          <div>50 — class_teacher, librarian, nurse, matron · 40 — subject_teacher, teacher · 30 — staff · 10 — student · 5 — parent</div>
          <div className="mt-2 text-foreground"><strong>Locked</strong> fields require level ≥ 90 AND a written reason (override audit).</div>
        </CardContent>
      </Card>
    </div>
  );
}

function PolicyDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ resource: "students", field: "", classification: "restricted", required_level: 70, notes: "" });
  async function save() {
    if (!form.field.trim()) return toast.error("Field name required");
    const { error } = await supabase.from("field_policies").upsert(form as any, { onConflict: "resource,field" } as any);
    if (error) return toast.error(error.message);
    toast.success("Policy saved"); setOpen(false); onSaved();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Add policy</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New field policy</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Resource</Label>
            <Select value={form.resource} onValueChange={v => setForm({ ...form, resource: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{RESOURCES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Field name</Label>
            <Input value={form.field} onChange={e => setForm({ ...form, field: e.target.value })} placeholder="e.g. national_id" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Classification</Label>
              <Select value={form.classification} onValueChange={v => setForm({ ...form, classification: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CLASSIFICATIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Required level</Label>
              <Input type="number" min={0} max={100} value={form.required_level} onChange={e => setForm({ ...form, required_level: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Why is this field protected?" />
          </div>
        </div>
        <DialogFooter><Button onClick={save}>Save policy</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
