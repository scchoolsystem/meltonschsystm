import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  createAccount,
  resetPassword,
  setAccountActive,
} from "@/lib/auth-admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Copy, KeyRound, Ban, CheckCircle2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/admin/users")({ component: UsersPage });

const ALL_ROLES = [
  "super_admin","school_admin","principal","deputy_principal","academic_master",
  "class_teacher","subject_teacher","teacher","hod","staff",
  "exams_admin","exams_user",
  "finance_admin","finance_user","bursar",
  "boarding_admin","boarding_user","matron",
  "kitchen_admin","kitchen_user",
  "security_admin","security_user",
  "library_admin","library_user","librarian",
  "clinic_admin","clinic_user","nurse",
  "sports_admin","sports_user","sports",
  "store_admin","store_user",
  "transport_admin","transport_officer",
  "guidance_admin","ict_admin","discipline_admin",
  "admission_officer","parent","student",
];

function UsersPage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [creds, setCreds] = useState<{ uniqueId: string; password: string; title: string } | null>(null);

  const createFn = useServerFn(createAccount);
  const resetFn = useServerFn(resetPassword);
  const setActiveFn = useServerFn(setAccountActive);

  const { data, isLoading } = useQuery({
    queryKey: ["all-credentials"],
    queryFn: async () => {
      const [{ data: creds }, { data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("user_credentials").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      return (creds ?? []).map((c) => ({
        ...c,
        full_name: profiles?.find((p) => p.id === c.user_id)?.full_name ?? "—",
        roles: (roles ?? []).filter((r) => r.user_id === c.user_id).map((r) => r.role),
      }));
    },
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <ShieldAlert className="w-10 h-10 mx-auto mb-2 opacity-40" />
          Super admin only.
        </CardContent></Card>
      </div>
    );
  }

  async function handleReset(user_id: string, label: string) {
    try {
      const { password } = await resetFn({ data: { user_id } });
      setCreds({ uniqueId: label, password, title: "Password reset" });
      qc.invalidateQueries({ queryKey: ["all-credentials"] });
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleToggle(user_id: string, active: boolean) {
    try {
      await setActiveFn({ data: { user_id, active } });
      toast.success(active ? "Account restored" : "Account revoked");
      qc.invalidateQueries({ queryKey: ["all-credentials"] });
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Users & Credentials</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every user is created with a system-generated Unique ID and password
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Create user</Button>
          </DialogTrigger>
          <CreateDialog
            onDone={(c) => {
              setOpen(false);
              setCreds({ ...c, title: "Account created" });
              qc.invalidateQueries({ queryKey: ["all-credentials"] });
            }}
            createFn={createFn}
          />
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">All accounts</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-40 grid place-items-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unique ID</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Synthetic email</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Last reset</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">
                      No accounts yet.
                    </TableCell></TableRow>
                  )}
                  {data?.map((u) => (
                    <TableRow key={u.user_id}>
                      <TableCell className="font-mono text-xs">{u.unique_id}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{u.category ?? "—"}</Badge></TableCell>
                      <TableCell className="font-medium">{u.full_name}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="font-mono text-[11px] hover:underline inline-flex items-center gap-1"
                          onClick={() => { if (u.synthetic_email) { navigator.clipboard.writeText(u.synthetic_email); toast.success("Email copied"); } }}
                          title="Click to copy"
                        >
                          {u.synthetic_email ?? "—"}
                          {u.synthetic_email && <Copy className="w-3 h-3 opacity-50" />}
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {u.roles.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                          {u.roles.map((r) => (
                            <Badge key={r} variant="secondary" className="text-[10px]">{r.replace(/_/g," ")}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u.last_reset_at ? new Date(u.last_reset_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {u.is_active ? (
                            <Badge variant="outline" className="bg-success/15 text-success border-success/30">active</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">revoked</Badge>
                          )}
                          {u.password_reset_required && (
                            <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30 text-[10px]">
                              Password Reset Required
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="sm" variant="outline" onClick={() => handleReset(u.user_id, u.unique_id)}>
                          <KeyRound className="w-3.5 h-3.5 mr-1" />Reset
                        </Button>
                        {u.is_active ? (
                          <Button size="sm" variant="outline" onClick={() => handleToggle(u.user_id, false)}>
                            <Ban className="w-3.5 h-3.5 mr-1" />Revoke
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => handleToggle(u.user_id, true)}>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Restore
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CredentialsDialog creds={creds} onClose={() => setCreds(null)} />
    </div>
  );
}

function CreateDialog({
  onDone, createFn,
}: { onDone: (c: { uniqueId: string; password: string }) => void; createFn: (args: { data: { full_name: string; role: string; email?: string } }) => Promise<{ uniqueId: string; password: string }> }) {
  const [form, setForm] = useState({ full_name: "", role: "staff", email: "" });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await createFn({ data: { full_name: form.full_name, role: form.role, email: form.email || undefined } });
      onDone({ uniqueId: res.uniqueId, password: res.password });
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Create new account</DialogTitle>
        <DialogDescription>System will generate a Unique ID and strong password.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div><Label>Full name</Label><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
        <div>
          <Label>Role</Label>
          <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              {ALL_ROLES.map((r) => <SelectItem key={r} value={r}>{r.replace(/_/g," ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Contact email <span className="text-muted-foreground text-xs">(optional — used to deliver credentials when email is enabled)</span></Label>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Generate credentials
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function CredentialsDialog({
  creds, onClose,
}: { creds: { uniqueId: string; password: string; title: string } | null; onClose: () => void }) {
  function copyBoth() {
    if (!creds) return;
    navigator.clipboard.writeText(`Unique ID: ${creds.uniqueId}\nPassword: ${creds.password}`);
    toast.success("Credentials copied");
  }
  return (
    <Dialog open={!!creds} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{creds?.title ?? "Credentials"}</DialogTitle>
          <DialogDescription>
            Copy now — this password will <strong>not</strong> be shown again.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Unique ID</Label>
            <div className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm">{creds?.uniqueId}</div>
          </div>
          <div>
            <Label className="text-xs">Password</Label>
            <div className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm select-all">{creds?.password}</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={copyBoth}><Copy className="w-3.5 h-3.5 mr-1" />Copy both</Button>
          <Button onClick={onClose}>I've saved it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
