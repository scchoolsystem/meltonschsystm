import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  createAccount,
  resetPassword,
  setAccountActive,
  bulkCreateStaffAccounts,
  bulkCreateStudentAccounts,
} from "@/lib/auth-admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Loader2,
  Copy,
  KeyRound,
  Ban,
  CheckCircle2,
  ShieldAlert,
  ExternalLink,
  Search,
  Users,
  GraduationCap,
  Briefcase,
  Download,
  UserPlus,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/admin/users")({ component: UsersPage });

// ─── Role catalogue ──────────────────────────────────────────────────────────
const ROLE_GROUPS: Record<string, { label: string; roles: string[] }> = {
  admin: {
    label: "Administration",
    roles: [
      "super_admin", "school_admin", "principal", "deputy_principal",
      "academic_master", "admission_officer", "guidance_admin", "ict_admin",
    ],
  },
  teaching: {
    label: "Teaching Staff",
    roles: [
      "hod", "class_teacher", "subject_teacher", "teacher",
    ],
  },
  exams: {
    label: "Exams",
    roles: ["exams_admin", "exams_user"],
  },
  finance: {
    label: "Finance",
    roles: ["finance_admin", "finance_user", "bursar"],
  },
  support: {
    label: "Support Staff",
    roles: [
      "boarding_admin", "boarding_user", "matron",
      "kitchen_admin", "kitchen_user",
      "security_admin", "security_user",
      "library_admin", "library_user", "librarian",
      "clinic_admin", "clinic_user", "nurse",
      "sports_admin", "sports_user", "sports",
      "store_admin", "store_user",
      "transport_admin", "transport_officer",
      "discipline_admin",
    ],
  },
  portal: {
    label: "Portals",
    roles: ["parent", "student"],
  },
};

const STAFF_ROLES = [
  ...ROLE_GROUPS.admin.roles,
  ...ROLE_GROUPS.teaching.roles,
  ...ROLE_GROUPS.exams.roles,
  ...ROLE_GROUPS.finance.roles,
  ...ROLE_GROUPS.support.roles,
];
const ALL_ROLES = [...STAFF_ROLES, ...ROLE_GROUPS.portal.roles];

// ─── Main page ────────────────────────────────────────────────────────────────
function UsersPage() {
  const qc = useQueryClient();
  const { isAdmin: isTopAdmin, hasRole } = useAuth();
  // The backend is_admin() RLS function already treats "school_admin" as a
  // full admin for writes (account creation, role changes, etc.). The
  // client-side isAdmin flag did not, which locked school_admin users out
  // of this page entirely even though their database writes would succeed.
  const isAdmin = isTopAdmin || hasRole("school_admin");
  const [open, setOpen] = useState(false);
  const [creds, setCreds] = useState<{ uniqueId: string; password: string; title: string } | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tab, setTab] = useState("all");

  const createFn = useServerFn(createAccount);
  const resetFn = useServerFn(resetPassword);
  const setActiveFn = useServerFn(setAccountActive);
  const bulkStaffFn = useServerFn(bulkCreateStaffAccounts);
  const bulkStudentFn = useServerFn(bulkCreateStudentAccounts);
  const [backfillBusy, setBackfillBusy] = useState<"staff" | "students" | null>(null);
  const [backfillResult, setBackfillResult] = useState<{
    kind: "staff" | "students";
    idKey: string;
    created: { full_name: string; uniqueId: string; password: string; [key: string]: any }[];
    skipped: { reason: string; [key: string]: any }[];
    errors: { error: string; [key: string]: any }[];
  } | null>(null);

  async function handleBackfill(kind: "staff" | "students") {
    setBackfillBusy(kind);
    try {
      if (kind === "staff") {
        const { data: rows, error } = await supabase
          .from("staff")
          .select("employee_no, first_name, last_name, role, email")
          .is("user_id", null);
        if (error) throw new Error(error.message);
        if (!rows?.length) { toast.success("Every staff record already has a login."); return; }
        const items = rows.map((r: any) => ({
          employee_no: r.employee_no,
          full_name: `${r.first_name} ${r.last_name || ""}`.trim(),
          role: r.role || "staff",
          email: r.email || undefined,
        }));
        const res = await bulkStaffFn({ data: { items } });
        setBackfillResult({ kind, idKey: "employee_no", ...res });
        toast.success(
          `Created ${res.created.length} staff login${res.created.length === 1 ? "" : "s"}` +
          `${res.skipped.length ? `, ${res.skipped.length} skipped` : ""}` +
          `${res.errors.length ? `, ${res.errors.length} failed` : ""}.`
        );
      } else {
        const { data: rows, error } = await supabase
          .from("students")
          .select("admission_no, first_name, last_name, parent_email")
          .is("user_id", null);
        if (error) throw new Error(error.message);
        if (!rows?.length) { toast.success("Every student record already has a login."); return; }
        const items = rows.map((r: any) => ({
          admission_no: r.admission_no,
          full_name: `${r.first_name} ${r.last_name || ""}`.trim(),
          email: r.parent_email || undefined,
        }));
        const res = await bulkStudentFn({ data: { items } });
        setBackfillResult({ kind, idKey: "admission_no", ...res });
        toast.success(
          `Created ${res.created.length} student login${res.created.length === 1 ? "" : "s"}` +
          `${res.skipped.length ? `, ${res.skipped.length} skipped` : ""}` +
          `${res.errors.length ? `, ${res.errors.length} failed` : ""}.`
        );
      }
      qc.invalidateQueries({ queryKey: ["all-credentials"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBackfillBusy(null);
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ["all-credentials"],
    queryFn: async () => {
      const [
        { data: creds },
        { data: profiles },
        { data: roles },
        { data: staffRows },
        { data: studentRows },
        { data: classRows },
      ] = await Promise.all([
        supabase.from("user_credentials").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("staff").select("id, user_id, staff_category, department_id, role"),
        supabase.from("students").select("id, user_id, unique_id, admission_no, class_id, year_of_admission"),
        supabase.from("classes").select("id, name, level"),
      ]);
      return (creds ?? []).map((c) => {
        const staffRow = (staffRows ?? []).find((s: any) => s.user_id === c.user_id);
        const studentRow = (studentRows ?? []).find((s: any) => s.user_id === c.user_id);
        const classRow = (classRows ?? []).find((cl: any) => cl.id === studentRow?.class_id);
        return {
          ...c,
          full_name: profiles?.find((p) => p.id === c.user_id)?.full_name ?? "—",
          roles: (roles ?? []).filter((r) => r.user_id === c.user_id).map((r) => r.role),
          staff_id: staffRow?.id ?? null,
          staff_category: staffRow?.staff_category ?? null,
          student_id: studentRow?.id ?? null,
          student_search: studentRow?.admission_no ?? studentRow?.unique_id ?? null,
          class_name: classRow?.name ?? null,
          class_level: classRow?.level ?? null,
          year_of_admission: studentRow?.year_of_admission ?? null,
        };
      });
    },
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ShieldAlert className="w-10 h-10 mx-auto mb-2 opacity-40" />
            Super admin only.
          </CardContent>
        </Card>
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

  // Derived lists by category
  const staffData = useMemo(() => (data ?? []).filter((u) =>
    u.category === "staff" || STAFF_ROLES.some((r) => u.roles.includes(r))
  ), [data]);
  const studentData = useMemo(() => (data ?? []).filter((u) =>
    u.category === "student" || u.roles.includes("student")
  ), [data]);

  function applyFilters(rows: typeof data) {
    return (rows ?? []).filter((u) => {
      const matchSearch =
        !search ||
        u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        u.unique_id?.toLowerCase().includes(search.toLowerCase()) ||
        u.synthetic_email?.toLowerCase().includes(search.toLowerCase());
      const matchRole =
        roleFilter === "all" || u.roles.includes(roleFilter);
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && u.is_active) ||
        (statusFilter === "revoked" && !u.is_active);
      return matchSearch && matchRole && matchStatus;
    });
  }

  const tabData = tab === "staff"
    ? applyFilters(staffData)
    : tab === "students"
    ? applyFilters(studentData)
    : applyFilters(data);

  // Stats
  const total = data?.length ?? 0;
  const activeCount = data?.filter((u) => u.is_active).length ?? 0;
  const revokedCount = data?.filter((u) => !u.is_active).length ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Users & Credentials</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage system accounts — staff, students, and external users
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => handleBackfill("staff")}
            disabled={backfillBusy !== null}
          >
            {backfillBusy === "staff" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
            Generate staff logins
          </Button>
          <Button
            variant="outline"
            onClick={() => handleBackfill("students")}
            disabled={backfillBusy !== null}
          >
            {backfillBusy === "students" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
            Generate student logins
          </Button>
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
      </div>

      {/* Backfill result */}
      {backfillResult && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <KeyRound className="w-4 h-4" />
              {backfillResult.kind === "staff" ? "Staff" : "Student"} logins generated
              <Badge variant="default" className="gap-1"><CheckCircle2 className="w-3 h-3" />{backfillResult.created.length} created</Badge>
              {backfillResult.skipped.length > 0 && (
                <Badge variant="outline" className="text-[10px]">{backfillResult.skipped.length} already had one</Badge>
              )}
              {backfillResult.errors.length > 0 && (
                <Badge variant="destructive" className="gap-1"><AlertCircle className="w-3 h-3" />{backfillResult.errors.length} failed</Badge>
              )}
            </CardTitle>
            <div className="flex gap-2">
              {backfillResult.created.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const idKey = backfillResult.idKey;
                    const csv =
                      `${idKey},full_name,unique_id,password\n` +
                      backfillResult.created
                        .map((c) => [c[idKey], c.full_name, c.uniqueId, c.password].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
                        .join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = `${backfillResult.kind}-credentials.csv`; a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="w-3.5 h-3.5 mr-1" /> Download credentials CSV
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setBackfillResult(null)}>Dismiss</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {backfillResult.created.length > 0 && (
              <div className="text-xs text-warning">
                Passwords are only shown once — download the CSV now and share credentials securely with each person.
              </div>
            )}
            {backfillResult.created.length > 0 && (
              <div className="overflow-x-auto border rounded max-h-80 overflow-y-auto">
                <table className="text-xs w-full">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left">{backfillResult.idKey}</th>
                      <th className="px-2 py-1 text-left">Name</th>
                      <th className="px-2 py-1 text-left">Unique ID</th>
                      <th className="px-2 py-1 text-left">Password</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backfillResult.created.map((c, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1 font-mono">{c[backfillResult.idKey]}</td>
                        <td className="px-2 py-1">{c.full_name}</td>
                        <td className="px-2 py-1 font-mono">{c.uniqueId}</td>
                        <td className="px-2 py-1 font-mono">{c.password}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {backfillResult.errors.length > 0 && (
              <div className="text-xs space-y-1 max-h-40 overflow-auto font-mono">
                {backfillResult.errors.map((e, i) => (
                  <div key={i} className="text-destructive">{e[backfillResult.idKey]}: {e.error}</div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total accounts", value: total, icon: Users },
          { label: "Staff accounts", value: staffData.length, icon: Briefcase },
          { label: "Student accounts", value: studentData.length, icon: GraduationCap },
          { label: "Revoked", value: revokedCount, icon: Ban },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
              <div>
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-8 w-56"
            placeholder="Search name or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All roles" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">All roles</SelectItem>
            {Object.entries(ROLE_GROUPS).map(([, group]) => (
              <div key={group.label}>
                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </div>
                {group.roles.map((r) => (
                  <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="revoked">Revoked</SelectItem>
          </SelectContent>
        </Select>
        {(search || roleFilter !== "all" || statusFilter !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setRoleFilter("all"); setStatusFilter("all"); }}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All ({(data ?? []).length})</TabsTrigger>
          <TabsTrigger value="staff">
            <Briefcase className="w-3.5 h-3.5 mr-1" />Staff ({staffData.length})
          </TabsTrigger>
          <TabsTrigger value="students">
            <GraduationCap className="w-3.5 h-3.5 mr-1" />Students ({studentData.length})
          </TabsTrigger>
        </TabsList>

        {["all", "staff", "students"].map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {tabData.length} account{tabData.length !== 1 ? "s" : ""}
                  {(search || roleFilter !== "all" || statusFilter !== "all") && (
                    <span className="text-muted-foreground font-normal text-sm ml-2">(filtered)</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-40 grid place-items-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <AccountTable
                    rows={tabData}
                    showClass={t === "students"}
                    onReset={handleReset}
                    onToggle={handleToggle}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <CredentialsDialog creds={creds} onClose={() => setCreds(null)} />
    </div>
  );
}

// ─── Account table ────────────────────────────────────────────────────────────
function AccountTable({
  rows,
  showClass,
  onReset,
  onToggle,
}: {
  rows: any[];
  showClass?: boolean;
  onReset: (uid: string, label: string) => void;
  onToggle: (uid: string, active: boolean) => void;
}) {
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Unique ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            {showClass && <TableHead>Class / Year</TableHead>}
            <TableHead>Roles</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={showClass ? 7 : 6} className="text-center py-8 text-sm text-muted-foreground">
                No accounts match your filters.
              </TableCell>
            </TableRow>
          )}
          {rows.map((u) => (
            <TableRow key={u.user_id}>
              <TableCell className="font-mono text-xs">{u.unique_id}</TableCell>
              <TableCell className="font-medium">
                <div>{u.full_name}</div>
                <button
                  type="button"
                  className="font-mono text-[10px] text-muted-foreground hover:underline inline-flex items-center gap-1"
                  onClick={() => { if (u.synthetic_email) { navigator.clipboard.writeText(u.synthetic_email); toast.success("Email copied"); } }}
                >
                  {u.synthetic_email ?? "—"}
                  {u.synthetic_email && <Copy className="w-2.5 h-2.5" />}
                </button>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-[10px]">{u.category ?? u.staff_category ?? "—"}</Badge>
              </TableCell>
              {showClass && (
                <TableCell className="text-xs">
                  <div>{u.class_name ?? "—"}</div>
                  {u.year_of_admission && (
                    <div className="text-muted-foreground">Admitted {u.year_of_admission}</div>
                  )}
                </TableCell>
              )}
              <TableCell>
                <RoleBadges roles={u.roles} />
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  {u.is_active ? (
                    <Badge variant="outline" className="bg-success/15 text-success border-success/30 w-fit">active</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30 w-fit">revoked</Badge>
                  )}
                  {u.password_reset_required && (
                    <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30 text-[10px] w-fit">
                      Reset required
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right space-x-1">
                {u.staff_id ? (
                  <Link to="/staff/$id" params={{ id: u.staff_id }}>
                    <Button size="sm" variant="ghost" title="Open staff profile">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                ) : u.student_id ? (
                  <Link to="/students" search={{ q: u.student_search ?? "" } as any}>
                    <Button size="sm" variant="ghost" title="Open student record">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                ) : null}
                <Button size="sm" variant="outline" onClick={() => onReset(u.user_id, u.unique_id)}>
                  <KeyRound className="w-3.5 h-3.5 mr-1" />Reset
                </Button>
                {u.is_active ? (
                  <Button size="sm" variant="outline" onClick={() => onToggle(u.user_id, false)}>
                    <Ban className="w-3.5 h-3.5 mr-1" />Revoke
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => onToggle(u.user_id, true)}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Restore
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Role badges grouped by category
function RoleBadges({ roles }: { roles: string[] }) {
  if (!roles.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1 max-w-[200px]">
      {roles.map((r) => (
        <Badge key={r} variant="secondary" className="text-[10px]">{r.replace(/_/g, " ")}</Badge>
      ))}
    </div>
  );
}

// ─── Create dialog ─────────────────────────────────────────────────────────
function CreateDialog({
  onDone,
  createFn,
}: {
  onDone: (c: { uniqueId: string; password: string }) => void;
  createFn: (args: { data: { full_name: string; role: string; email?: string } }) => Promise<{ uniqueId: string; password: string }>;
}) {
  const [form, setForm] = useState({ full_name: "", role: "teacher", email: "" });
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
      <form onSubmit={submit} className="space-y-4">
        <div><Label>Full name</Label>
          <Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div>
          <Label>Role</Label>
          <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              {Object.entries(ROLE_GROUPS).map(([, group]) => (
                <div key={group.label}>
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {group.label}
                  </div>
                  {group.roles.map((r) => (
                    <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Contact email <span className="text-muted-foreground text-xs">(optional)</span></Label>
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

// ─── Credentials reveal dialog ─────────────────────────────────────────────
function CredentialsDialog({
  creds,
  onClose,
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
