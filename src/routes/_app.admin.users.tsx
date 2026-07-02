import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, KeyRound, Ban, CheckCircle2, Copy } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/admin/users")({ component: AdminUsersPage });

const ROLE_OPTIONS = [
  "teacher", "class_teacher", "subject_teacher", "hod", "principal",
  "deputy_principal", "bursar", "librarian", "nurse", "matron", "sports",
  "boarding", "admission_officer", "school_admin", "academic_master",
  "exams_admin", "exams_user", "finance_admin", "finance_user",
  "boarding_admin", "boarding_user", "kitchen_admin", "kitchen_user",
  "security_admin", "security_user", "library_admin", "library_user",
  "clinic_admin", "clinic_user", "sports_admin", "sports_user",
  "store_admin", "store_user", "transport_admin", "transport_officer",
  "guidance_admin", "ict_admin", "discipline_admin", "staff",
];

type UserRow = {
  user_id: string;
  unique_id: string;
  category: string;
  synthetic_email: string;
  is_active: boolean;
  last_reset_at: string | null;
  created_at: string;
  full_name: string | null;
  role: string | null;
};

function AdminUsersPage() {
  const { isAdmin } = useAuth();

  // Do not statically import server-only functions into client bundle.
  const createFn = useServerFn(() => import("@/lib/auth-admin.functions").then((m) => m.createAccount));
  const resetFn = useServerFn(() => import("@/lib/auth-admin.functions").then((m) => m.resetPassword));
  const setActiveFn = useServerFn(() => import("@/lib/auth-admin.functions").then((m) => m.setAccountActive));

  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [creating, setCreating] = useState(false);

  const [credDialog, setCredDialog] = useState<{ uniqueId: string; password: string; email: string } | null>(null);

  async function load() {
    setLoading(true);
    const { data: creds, error } = await supabase
      .from("user_credentials")
      .select("user_id, unique_id, category, synthetic_email, is_active, last_reset_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const userIds = (creds ?? []).map((c) => c.user_id);
    const [profilesRes, rolesRes] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("id, full_name").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      userIds.length
        ? supabase.from("user_roles").select("user_id, role").in("user_id", userIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const nameById = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p.full_name]));
    const roleById = new Map((rolesRes.data ?? []).map((r: any) => [r.user_id, r.role]));

    setRows(
      (creds ?? []).map((c: any) => ({
        ...c,
        full_name: nameById.get(c.user_id) ?? null,
        role: roleById.get(c.user_id) ?? null,
      }))
    );
    setLoading(false);
  }

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      r.unique_id.toLowerCase().includes(q) ||
      r.synthetic_email.toLowerCase().includes(q) ||
      (r.full_name ?? "").toLowerCase().includes(q) ||
      (r.role ?? "").toLowerCase().includes(q)
    );
  });

  async function handleCreate() {
    if (!newName.trim() || !newRole) return toast.error("Full name and role are required");
    setCreating(true);
    try {
      const res: any = await createFn({
        data: { full_name: newName.trim(), role: newRole, email: newEmail.trim() || undefined },
      });
      toast.success("Account created");
      setCreateOpen(false);
      setCredDialog({ uniqueId: res.uniqueId, password: res.password, email: res.syntheticEmail });
      setNewName("");
      setNewRole("");
      setNewEmail("");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create account");
    } finally {
      setCreating(false);
    }
  }

  async function handleReset(row: UserRow) {
    if (!confirm(`Reset password for ${row.unique_id}?`)) return;
    setBusy(row.user_id);
    try {
      const res: any = await resetFn({ data: { user_id: row.user_id } });
      setCredDialog({ uniqueId: row.unique_id, password: res.password, email: row.synthetic_email });
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to reset password");
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleActive(row: UserRow) {
    const nextActive = !row.is_active;
    if (!confirm(`${nextActive ? "Restore" : "Revoke"} access for ${row.unique_id}?`)) return;
    setBusy(row.user_id);
    try {
      await setActiveFn({ data: { user_id: row.user_id, active: nextActive } });
      toast.success(nextActive ? "Account restored" : "Account revoked");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update account status");
    } finally {
      setBusy(null);
    }
  }

  function copyCreds() {
    if (!credDialog) return;
    const text = `Unique ID: ${credDialog.uniqueId}\nLogin email: ${credDialog.email}\nPassword: ${credDialog.password}`;
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card><CardContent className="py-12 text-center text-muted-foreground">Admins only.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Admin — Users</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create logins, reset passwords, and revoke or restore access for staff, parents, and students.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Create account
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Accounts ({filtered.length})</CardTitle>
          <CardDescription>Search by unique ID, email, name, or role.</CardDescription>
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm mt-2"
          />
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No accounts found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unique ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Login email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.user_id}>
                    <TableCell className="font-mono text-xs">{r.unique_id}</TableCell>
                    <TableCell>{r.full_name ?? "—"}</TableCell>
                    <TableCell className="capitalize">{(r.role ?? r.category).replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.synthetic_email}</TableCell>
                    <TableCell>
                      {r.is_active ? (
                        <Badge variant="outline" className="text-green-600 border-green-600">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-red-600 border-red-600">Revoked</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === r.user_id}
                        onClick={() => handleReset(r)}
                        title="Reset password"
                      >
                        <KeyRound className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === r.user_id}
                        onClick={() => handleToggleActive(r)}
                        title={r.is_active ? "Revoke access" : "Restore access"}
                      >
                        {r.is_active ? <Ban className="w-4 h-4 text-red-600" /> : <CheckCircle2 className="w-4 h-4 text-green-600" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create account</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Full name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Jane Doe" />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger><SelectValue placeholder="Choose role" /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">{r.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Contact email (optional)</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="personal or notification email — not used to log in"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Login uses a generated Unique ID + system email, not this address.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!credDialog} onOpenChange={(open) => !open && setCredDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Account credentials</DialogTitle></DialogHeader>
          {credDialog && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Share these with the user now — the password won't be shown again.
              </p>
              <div className="rounded-md border p-3 space-y-1 font-mono text-sm">
                <div>Unique ID: {credDialog.uniqueId}</div>
                <div>Login email: {credDialog.email}</div>
                <div>Password: {credDialog.password}</div>
              </div>
              <Button variant="outline" size="sm" onClick={copyCreds}>
                <Copy className="w-4 h-4 mr-2" /> Copy to clipboard
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCredDialog(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
