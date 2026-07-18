import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  AlertTriangle,
  X,
  ChevronLeft,
  ChevronRight,
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

// Reverse lookup: role -> group key, so a role badge can be colored by
// which department/group it belongs to at a glance.
const ROLE_TO_GROUP: Record<string, string> = {};
Object.entries(ROLE_GROUPS).forEach(([key, group]) => {
  group.roles.forEach((r) => { ROLE_TO_GROUP[r] = key; });
});

// One consistent color per group, used for both the quick-filter pills and
// the role badges in the table — this is the main visual thread that makes
// "who belongs to which department" scannable at a glance.
const GROUP_COLORS: Record<string, string> = {
  admin: "bg-indigo-500/15 text-indigo-700 border-indigo-500/30 dark:text-indigo-300",
  teaching: "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-300",
  exams: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",
  finance: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  support: "bg-slate-500/15 text-slate-700 border-slate-500/30 dark:text-slate-300",
  portal: "bg-pink-500/15 text-pink-700 border-pink-500/30 dark:text-pink-300",
};
const DEFAULT_BADGE_COLOR = "bg-muted text-muted-foreground border-transparent";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

// ─── Types ────────────────────────────────────────────────────────────────────
interface ProcessedCredential {
  user_id: string;
  unique_id: string;
  synthetic_email: string | null;
  is_active: boolean;
  password_reset_required: boolean;
  category: string | null;
  created_at: string;
  full_name: string;
  roles: string[];
  staff_id: string | null;
  staff_category: string | null;
  student_id: string | null;
  student_search: string | null;
  class_name: string | null;
  class_level: string | null;
  year_of_admission: number | null;
  [key: string]: unknown;
}

type SortKey = "name" | "unique_id" | "status";
type SortDir = "asc" | "desc";

// ─── Small utility hook ──────────────────────────────────────────────────────
function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── CSV export ───────────────────────────────────────────────────────────────
function toCSV(rows: ProcessedCredential[]): string {
  const headers = ["Unique ID", "Full Name", "Email", "Category", "Roles", "Status", "Reset Required"];
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.unique_id,
        r.full_name,
        r.synthetic_email ?? "",
        r.category ?? r.staff_category ?? "",
        r.roles.join("; "),
        r.is_active ? "active" : "revoked",
        r.password_reset_required ? "yes" : "no",
      ]
        .map(escape)
        .join(",")
    );
  }
  return lines.join("\n");
}

function downloadCSV(rows: ProcessedCredential[], filenamePrefix: string) {
  if (!rows.length) {
    toast.error("Nothing to export — adjust your filters first.");
    return;
  }
  const csv = toCSV(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

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
  const debouncedSearch = useDebouncedValue(search, 250);
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tab, setTab] = useState("all");
  const [confirmAction, setConfirmAction] = useState<
    { type: "revoke" | "restore"; ids: string[]; label: string } | null
  >(null);

  // Do not statically import server-only functions into client bundle —
  // resolve each server fn from the lazy import right before calling it.

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["all-credentials"],
    queryFn: async (): Promise<ProcessedCredential[]> => {
      const [
        { data: creds, error: credsErr },
        { data: profiles, error: profilesErr },
        { data: roles, error: rolesErr },
        { data: staffRows, error: staffErr },
        { data: studentRows, error: studentsErr },
        { data: classRows, error: classesErr },
      ] = await Promise.all([
        supabase.from("user_credentials").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("staff").select("id, user_id, staff_category, department_id, role"),
        supabase.from("students").select("id, unique_id, admission_no, class_id, year_of_admission, student_user_links(user_id)"),
        supabase.from("classes").select("id, name, level"),
      ]);

      const firstError = credsErr ?? profilesErr ?? rolesErr ?? staffErr ?? studentsErr ?? classesErr;
      if (firstError) throw new Error(firstError.message);

      return (creds ?? []).map((c: any) => {
        const staffRow = (staffRows ?? []).find((s: any) => s.user_id === c.user_id);
        const studentRow = (studentRows ?? []).find((s: any) =>
          (s.student_user_links ?? []).some((l: any) => l.user_id === c.user_id)
        );
        const classRow = (classRows ?? []).find((cl: any) => cl.id === studentRow?.class_id);
        return {
          ...c,
          full_name: profiles?.find((p: any) => p.id === c.user_id)?.full_name ?? "—",
          roles: (roles ?? []).filter((r: any) => r.user_id === c.user_id).map((r: any) => r.role),
          staff_id: staffRow?.id ?? null,
          staff_category: staffRow?.staff_category ?? null,
          student_id: studentRow?.id ?? null,
          student_search: studentRow?.admission_no ?? studentRow?.unique_id ?? null,
          class_name: classRow?.name ?? null,
          class_level: classRow?.level ?? null,
          year_of_admission: studentRow?.year_of_admission ?? null,
        } as ProcessedCredential;
      });
    },
    enabled: isAdmin,
    staleTime: 30_000,
  });

  // ── Mutations ────────────────────────────────────────────────────────────
  const resetMutation = useMutation({
    mutationFn: async (vars: { user_id: string; label: string }) => {
      const { resetPassword } = await import("@/lib/auth-admin.functions");
      const { password } = await resetPassword({ data: { user_id: vars.user_id } });
      return { password, label: vars.label };
    },
    onSuccess: ({ password, label }) => {
      setCreds({ uniqueId: label, password, title: "Password reset" });
      qc.invalidateQueries({ queryKey: ["all-credentials"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to reset password"),
  });

  const setActiveMutation = useMutation({
    mutationFn: async (vars: { user_id: string; active: boolean }) => {
      const { setAccountActive } = await import("@/lib/auth-admin.functions");
      await setAccountActive({ data: vars });
      return vars;
    },
    onSuccess: ({ active }) => {
      toast.success(active ? "Account restored" : "Account revoked");
      qc.invalidateQueries({ queryKey: ["all-credentials"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update account status"),
  });

  const bulkActiveMutation = useMutation({
    mutationFn: async (vars: { ids: string[]; active: boolean }) => {
      const { setAccountActive } = await import("@/lib/auth-admin.functions");
      const results = await Promise.allSettled(
        vars.ids.map((user_id) => setAccountActive({ data: { user_id, active: vars.active } }))
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      return { total: vars.ids.length, failed, active: vars.active };
    },
    onSuccess: ({ total, failed, active }) => {
      const succeeded = total - failed;
      if (failed === 0) {
        toast.success(`${succeeded} account${succeeded !== 1 ? "s" : ""} ${active ? "restored" : "revoked"}`);
      } else {
        toast.error(`${succeeded} succeeded, ${failed} failed — try again for the rest`);
      }
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["all-credentials"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Bulk update failed"),
  });

  const createMutation = useMutation({
    mutationFn: async (vars: { full_name: string; role: string; email?: string }) => {
      const { createAccount } = await import("@/lib/auth-admin.functions");
      return await createAccount({ data: vars });
    },
  });

  // Derived lists by category — all hooks must run unconditionally, before
  // any early return, so the admin gate below stays purely a render branch.
  const staffData = useMemo(
    () => (data ?? []).filter((u) => u.category === "staff" || STAFF_ROLES.some((r) => u.roles.includes(r))),
    [data]
  );
  const studentData = useMemo(
    () => (data ?? []).filter((u) => u.category === "student" || u.roles.includes("student")),
    [data]
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSelectedIds(new Set());
  }, [tab]);

  function applyFilters(rows: ProcessedCredential[] | undefined) {
    return (rows ?? []).filter((u) => {
      const matchSearch =
        !debouncedSearch ||
        u.full_name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        u.unique_id?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        u.synthetic_email?.toLowerCase().includes(debouncedSearch.toLowerCase());
      const matchRole =
        roleFilter === "all"
          ? true
          : roleFilter.startsWith("group:")
          ? (ROLE_GROUPS[roleFilter.slice(6)]?.roles ?? []).some((r) => u.roles.includes(r))
          : u.roles.includes(roleFilter);
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && u.is_active) ||
        (statusFilter === "revoked" && !u.is_active);
      return matchSearch && matchRole && matchStatus;
    });
  }

  const tabData = useMemo(() => {
    const rows = tab === "staff" ? staffData : tab === "students" ? studentData : data;
    return applyFilters(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, staffData, studentData, data, debouncedSearch, roleFilter, statusFilter]);

  const filtersActive = !!search || roleFilter !== "all" || statusFilter !== "all";

  // Counts per role-group, used to power the quick-navigation pills below —
  // computed off the full dataset (not the current filter) so the pills
  // always show "how many total", like a directory.
  const roleGroupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [key, group] of Object.entries(ROLE_GROUPS)) {
      counts[key] = (data ?? []).filter((u) => group.roles.some((r) => u.roles.includes(r))).length;
    }
    return counts;
  }, [data]);

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

  function handleReset(user_id: string, label: string) {
    resetMutation.mutate({ user_id, label });
  }

  function requestToggle(user_id: string, active: boolean, label: string) {
    if (!active) {
      setConfirmAction({ type: "revoke", ids: [user_id], label });
    } else {
      setActiveMutation.mutate({ user_id, active: true });
    }
  }

  function requestBulkToggle(active: boolean) {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!active) {
      setConfirmAction({ type: "revoke", ids, label: `${ids.length} account${ids.length !== 1 ? "s" : ""}` });
    } else {
      bulkActiveMutation.mutate({ ids, active: true });
    }
  }

  function confirmPendingAction() {
    if (!confirmAction) return;
    if (confirmAction.ids.length === 1) {
      setActiveMutation.mutate({ user_id: confirmAction.ids[0], active: confirmAction.type === "restore" });
    } else {
      bulkActiveMutation.mutate({ ids: confirmAction.ids, active: confirmAction.type === "restore" });
    }
    setConfirmAction(null);
  }

  // Stats
  const total = data?.length ?? 0;
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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => downloadCSV(tabData, `users-${tab}`)}>
            <Download className="w-4 h-4 mr-2" />Export CSV
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />Create user</Button>
            </DialogTrigger>
            <CreateDialog
              mutation={createMutation}
              onDone={(c) => {
                setOpen(false);
                setCreds({ ...c, title: "Account created" });
                qc.invalidateQueries({ queryKey: ["all-credentials"] });
              }}
            />
          </Dialog>
        </div>
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Couldn't load accounts</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{(error as any)?.message ?? "Something went wrong fetching user data."}</span>
            <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
          </AlertDescription>
        </Alert>
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
                <div className="text-2xl font-bold">{isLoading ? <Skeleton className="h-7 w-10" /> : value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick navigation — browse by department at a glance */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <button
          type="button"
          onClick={() => setRoleFilter("all")}
          className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
            roleFilter === "all"
              ? "bg-foreground text-background border-foreground"
              : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"
          }`}
        >
          All roles ({total})
        </button>
        {Object.entries(ROLE_GROUPS).map(([key, group]) => {
          const active = roleFilter === `group:${key}`;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setRoleFilter(active ? "all" : `group:${key}`)}
              className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                active ? GROUP_COLORS[key].replace("/15", "/25") : `${GROUP_COLORS[key]} hover:opacity-80`
              }`}
            >
              {group.label} ({roleGroupCounts[key] ?? 0})
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-8 w-56"
            placeholder="Search name, ID, or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search accounts"
          />
        </div>
        <Select value={roleFilter.startsWith("group:") ? "all" : roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Specific role" /></SelectTrigger>
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
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setRoleFilter("all"); setStatusFilter("all"); }}>
            <X className="w-3.5 h-3.5 mr-1" />Clear filters
          </Button>
        )}
      </div>

      {/* Active filter chips — shows exactly what's narrowing the list, each removable on its own */}
      {filtersActive && (
        <div className="flex flex-wrap gap-1.5 items-center text-xs">
          <span className="text-muted-foreground">Filtered by:</span>
          {search && (
            <Chip onRemove={() => setSearch("")}>Search "{search}"</Chip>
          )}
          {roleFilter !== "all" && (
            <Chip onRemove={() => setRoleFilter("all")}>
              {roleFilter.startsWith("group:")
                ? ROLE_GROUPS[roleFilter.slice(6)]?.label
                : roleFilter.replace(/_/g, " ")}
            </Chip>
          )}
          {statusFilter !== "all" && (
            <Chip onRemove={() => setStatusFilter("all")}>{statusFilter}</Chip>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-4 py-2">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => requestBulkToggle(true)}>
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Restore selected
          </Button>
          <Button size="sm" variant="outline" onClick={() => requestBulkToggle(false)}>
            <Ban className="w-3.5 h-3.5 mr-1" />Revoke selected
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

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

        <TabsContent value={tab} className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {tabData.length} account{tabData.length !== 1 ? "s" : ""}
                {filtersActive && (
                  <span className="text-muted-foreground font-normal text-sm ml-2">(filtered)</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <TableSkeleton />
              ) : (
                <AccountTable
                  rows={tabData}
                  showClass={tab === "students"}
                  onReset={handleReset}
                  onToggle={requestToggle}
                  selectedIds={selectedIds}
                  setSelectedIds={setSelectedIds}
                  resetPendingId={resetMutation.isPending ? (resetMutation.variables as any)?.user_id : null}
                  togglePendingId={setActiveMutation.isPending ? (setActiveMutation.variables as any)?.user_id : null}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CredentialsDialog creds={creds} onClose={() => setCreds(null)} />

      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke access?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.label} will lose access immediately and won't be able to sign in until restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPendingAction} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

// ─── Account table ────────────────────────────────────────────────────────────
function AccountTable({
  rows,
  showClass,
  onReset,
  onToggle,
  selectedIds,
  setSelectedIds,
  resetPendingId,
  togglePendingId,
}: {
  rows: ProcessedCredential[];
  showClass?: boolean;
  onReset: (uid: string, label: string) => void;
  onToggle: (uid: string, active: boolean, label: string) => void;
  selectedIds: Set<string>;
  setSelectedIds: (fn: (prev: Set<string>) => Set<string>) => void;
  resetPendingId?: string | null;
  togglePendingId?: string | null;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let av = "";
      let bv = "";
      if (sortKey === "name") { av = a.full_name ?? ""; bv = b.full_name ?? ""; }
      else if (sortKey === "unique_id") { av = a.unique_id ?? ""; bv = b.unique_id ?? ""; }
      else { av = a.is_active ? "0-active" : "1-revoked"; bv = b.is_active ? "0-active" : "1-revoked"; }
      return av.localeCompare(bv);
    });
    return sortDir === "asc" ? copy : copy.reverse();
  }, [rows, sortKey, sortDir]);

  useEffect(() => { setPage(1); }, [rows.length, pageSize]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const pageIds = pageRows.map((r) => r.user_id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const someOnPageSelected = pageIds.some((id) => selectedIds.has(id));

  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function toggleSelectRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead className="w-9">
                <Checkbox
                  checked={allOnPageSelected ? true : someOnPageSelected ? "indeterminate" : false}
                  onCheckedChange={toggleSelectAllOnPage}
                  aria-label="Select all rows on this page"
                />
              </TableHead>
              <TableHead>
                <SortHeader label="Unique ID" sortKeyName="unique_id" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              </TableHead>
              <TableHead>
                <SortHeader label="Name" sortKeyName="name" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              </TableHead>
              <TableHead>Category</TableHead>
              {showClass && <TableHead>Class / Year</TableHead>}
              <TableHead>Roles</TableHead>
              <TableHead>
                <SortHeader label="Status" sortKeyName="status" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={showClass ? 8 : 7} className="text-center py-10 text-sm text-muted-foreground">
                  {rows.length === 0 ? "No accounts match your filters." : "No accounts on this page."}
                </TableCell>
              </TableRow>
            )}
            {pageRows.map((u) => (
              <TableRow key={u.user_id} data-state={selectedIds.has(u.user_id) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(u.user_id)}
                    onCheckedChange={() => toggleSelectRow(u.user_id)}
                    aria-label={`Select ${u.full_name}`}
                  />
                </TableCell>
                <TableCell className="font-mono text-xs">{u.unique_id}</TableCell>
                <TableCell className="font-medium">
                  <div>{u.full_name}</div>
                  <button
                    type="button"
                    className="font-mono text-[10px] text-muted-foreground hover:underline inline-flex items-center gap-1"
                    onClick={() => {
                      if (u.synthetic_email) {
                        navigator.clipboard.writeText(u.synthetic_email);
                        toast.success("Email copied");
                      }
                    }}
                  >
                    {u.synthetic_email ?? "—"}
                    {u.synthetic_email && <Copy className="w-2.5 h-2.5" />}
                  </button>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      u.student_id
                        ? "bg-teal-500/15 text-teal-700 border-teal-500/30 dark:text-teal-300"
                        : u.staff_id
                        ? "bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-300"
                        : DEFAULT_BADGE_COLOR
                    }`}
                  >
                    {u.category ?? u.staff_category ?? "—"}
                  </Badge>
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
                <TableCell className="text-right space-x-1 whitespace-nowrap">
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
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resetPendingId === u.user_id}
                    onClick={() => onReset(u.user_id, u.unique_id)}
                  >
                    {resetPendingId === u.user_id ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    ) : (
                      <KeyRound className="w-3.5 h-3.5 mr-1" />
                    )}
                    Reset
                  </Button>
                  {u.is_active ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={togglePendingId === u.user_id}
                      onClick={() => onToggle(u.user_id, false, u.full_name)}
                    >
                      {togglePendingId === u.user_id ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      ) : (
                        <Ban className="w-3.5 h-3.5 mr-1" />
                      )}
                      Revoke
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={togglePendingId === u.user_id}
                      onClick={() => onToggle(u.user_id, true, u.full_name)}
                    >
                      {togglePendingId === u.user_id ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      )}
                      Restore
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {rows.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sorted.length)} of {sorted.length}
            </span>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="h-7 w-[90px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground px-2">
              Page {safePage} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Sortable column header — hoisted to module scope so it isn't recreated
// (and its DOM node remounted) on every AccountTable render.
function SortHeader({
  label,
  sortKeyName,
  sortKey,
  sortDir,
  onToggle,
}: {
  label: string;
  sortKeyName: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggle: (key: SortKey) => void;
}) {
  const active = sortKey === sortKeyName;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 hover:text-foreground"
      onClick={() => onToggle(sortKeyName)}
    >
      {label}<Icon className="w-3 h-3" />
    </button>
  );
}

// Small dismissible chip used for the active-filters row
function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2 py-0.5 capitalize">
      {children}
      <button type="button" onClick={onRemove} aria-label="Remove filter" className="hover:text-foreground">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// Role badges grouped by category, colored by department so staff/student
// rosters are scannable by team at a glance.
function RoleBadges({ roles }: { roles: string[] }) {
  if (!roles.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1 max-w-[220px]">
      {roles.map((r) => {
        const groupKey = ROLE_TO_GROUP[r];
        const colorClass = groupKey ? GROUP_COLORS[groupKey] : DEFAULT_BADGE_COLOR;
        return (
          <Badge key={r} variant="outline" className={`text-[10px] ${colorClass}`}>
            {r.replace(/_/g, " ")}
          </Badge>
        );
      })}
    </div>
  );
}

// ─── Create dialog ─────────────────────────────────────────────────────────
function CreateDialog({
  onDone,
  mutation,
}: {
  onDone: (c: { uniqueId: string; password: string }) => void;
  mutation: ReturnType<typeof useMutation<{ uniqueId: string; password: string }, unknown, { full_name: string; role: string; email?: string }>>;
}) {
  const [form, setForm] = useState({ full_name: "", role: "teacher", email: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = form.full_name.trim();
    if (!name) {
      toast.error("Full name is required");
      return;
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error("Enter a valid email address");
      return;
    }
    try {
      const res = await mutation.mutateAsync({ full_name: name, role: form.role, email: form.email || undefined });
      onDone({ uniqueId: res.uniqueId, password: res.password });
      setForm({ full_name: "", role: "teacher", email: "" });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create account");
    }
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
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
