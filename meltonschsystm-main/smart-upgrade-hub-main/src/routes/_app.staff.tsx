import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Download, Search, X, Wand2, FileSpreadsheet, FileText, ExternalLink } from "lucide-react";
import { useTrackedDelete } from "@/hooks/useTrackedDelete";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { useAuth } from "@/hooks/use-auth";
import { LifecycleActions } from "@/components/LifecycleActions";
import { StatusBadge } from "@/components/StatusBadge";
import { Pager } from "@/components/Pager";
import { StaffWizard } from "@/components/staff/StaffWizard";
import { BulkActionsWizard } from "@/components/staff/BulkActionsWizard";
import { downloadCsv, downloadExcel, type Column } from "@/lib/export-utils";
import { toast } from "sonner";


export const Route = createFileRoute("/_app/staff")({
  component: StaffPage,
});

const CATEGORIES = ["teaching", "administration", "support"] as const;
const STATUSES = ["active", "on_leave", "transferred", "deceased", "terminated", "archived"] as const;

function StaffPage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const deleteMutation = useTrackedDelete();
  const [schoolId, setSchoolId] = useState<string | null>(null);
  supabase.rpc("current_user_school").then(({ data }) => setSchoolId(data as string));
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [wizardOpen, setWizardOpen] = useState(false);


  // Filters
  const [search, setSearch] = useState("");
  const [fCategory, setFCategory] = useState<string>("all");
  const [fDept, setFDept] = useState<string>("all");
  const [fSubject, setFSubject] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fRole, setFRole] = useState<string>("all");

  const { data: depts = [] } = useQuery({
    queryKey: ["departments-filter"],
    queryFn: async () => (await supabase.from("departments").select("id, name, kind").order("name")).data ?? [],
  });
  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects-filter"],
    queryFn: async () => (await supabase.from("subjects").select("id, code, name").order("name")).data ?? [],
  });

  const { data: subjectStaffIds } = useQuery({
    queryKey: ["staff-by-subject", fSubject],
    enabled: fSubject !== "all",
    queryFn: async () => {
      const { data } = await supabase.from("teacher_subjects").select("staff_id").eq("subject_id", fSubject);
      return (data ?? []).map((r: any) => r.staff_id as string);
    },
  });

  // Apply current filters to a fresh staff query. Used for both the paged
  // view and exports so downloads always match what the user has filtered.
  const applyFilters = (q: any) => {
    if (search.trim()) {
      const s = `%${search.trim()}%`;
      q = q.or(`first_name.ilike.${s},last_name.ilike.${s},employee_no.ilike.${s},unique_id.ilike.${s},email.ilike.${s}`);
    }
    if (fCategory !== "all") q = q.eq("staff_category", fCategory);
    if (fDept !== "all") q = q.eq("department_id", fDept);
    if (fStatus !== "all") q = q.eq("lifecycle_status", fStatus);
    if (fRole !== "all") q = q.eq("role", fRole as any);
    if (fSubject !== "all") {
      if (!subjectStaffIds || subjectStaffIds.length === 0) return null;
      q = q.in("id", subjectStaffIds);
    }
    return q.order("employee_no", { ascending: false });
  };

  const { data: pageData, isLoading } = useQuery({
    queryKey: ["staff", page, search, fCategory, fDept, fStatus, fRole, fSubject, subjectStaffIds?.length],
    queryFn: async () => {
      const q = applyFilters(supabase.from("staff").select("*", { count: "exact" }));
      if (!q) return { rows: [], count: 0, links: {} };
      const { data, error, count } = await q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = data ?? [];
      const ids = rows.map((r: any) => r.id);
      let links: Record<string, string[]> = {};
      if (ids.length) {
        const { data: ts } = await supabase
          .from("teacher_subjects")
          .select("staff_id, subjects(code, name)")
          .in("staff_id", ids);
        (ts ?? []).forEach((r: any) => {
          links[r.staff_id] ??= [];
          links[r.staff_id].push(r.subjects?.code ?? r.subjects?.name ?? "");
        });
      }
      return { rows, count: count ?? 0, links };
    },
  });

  const staff = pageData?.rows ?? [];
  const links = pageData?.links ?? {};
  const totalCount = pageData?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const roleOptions = useMemo(() => {
    const set = new Set<string>(staff.map((s: any) => s.role));
    return Array.from(set).sort();
  }, [staff]);

  function staffColumns(): Column<any>[] {
    return [
      { header: "Employee #", value: (s) => s.employee_no },
      { header: "Unique ID", value: (s) => s.unique_id ?? "" },
      { header: "First Name", value: (s) => s.first_name },
      { header: "Last Name", value: (s) => s.last_name },
      { header: "Role", value: (s) => s.role },
      { header: "Category", value: (s) => s.staff_category ?? "" },
      { header: "Department", value: (s) => depts.find((d: any) => d.id === s.department_id)?.name ?? s.department ?? "" },
      { header: "Email", value: (s) => s.email ?? "" },
      { header: "Phone", value: (s) => s.phone ?? "" },
      { header: "Hire date", value: (s) => s.hire_date ?? "" },
      { header: "Status", value: (s) => s.lifecycle_status ?? s.status ?? "" },
    ];
  }

  async function handleExport(format: "csv" | "xls") {
    const t = toast.loading("Preparing export…");
    try {
      const all: any[] = [];
      const size = 1000;
      for (let i = 0; i < 20; i++) {
        const q = applyFilters(supabase.from("staff").select("*"));
        if (!q) break;
        const { data, error } = await q.range(i * size, i * size + size - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < size) break;
      }
      const cols = staffColumns();
      const name = `staff-${new Date().toISOString().slice(0, 10)}`;
      if (format === "csv") downloadCsv(name, all, cols);
      else downloadExcel(name, "Staff", all, cols);
      toast.success(`Exported ${all.length} staff`, { id: t });
    } catch (e: any) {
      toast.error(e.message ?? "Export failed", { id: t });
    }
  }

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const allOnPageSelected = staff.length > 0 && staff.every((s: any) => selected.has(s.id));
  const togglePage = (on: boolean) => {
    const next = new Set(selected);
    if (on) staff.forEach((s: any) => next.add(s.id));
    else staff.forEach((s: any) => next.delete(s.id));
    setSelected(next);
  };
  const clearSelection = () => setSelected(new Set());




  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Staff</h1>
          <p className="text-sm text-muted-foreground mt-1">{totalCount.toLocaleString()} members</p>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline"><Download className="w-4 h-4 mr-2" />Export</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("csv")}><FileText className="w-4 h-4 mr-2" />CSV (all filtered)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("xls")}><FileSpreadsheet className="w-4 h-4 mr-2" />Excel (all filtered)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {isAdmin && (
            <Dialog open={open} onOpenChange={(o) => setOpen(o)}>
              <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Add Staff</Button></DialogTrigger>
              <StaffWizard onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["staff"] }); }} />
            </Dialog>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
            <div className="md:col-span-2 relative">
              <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder="Search name, employee #, ID, email…" className="pl-8" />
            </div>
            <Select value={fCategory} onValueChange={(v) => { setFCategory(v); setPage(0); }}>
              <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fDept} onValueChange={(v) => { setFDept(v); setPage(0); }}>
              <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {depts.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fSubject} onValueChange={(v) => { setFSubject(v); setPage(0); }}>
              <SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All subjects</SelectItem>
                {subjects.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.code ?? s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fStatus} onValueChange={(v) => { setFStatus(v); setPage(0); }}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {roleOptions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <button onClick={() => setFRole("all")} className={`text-xs px-2 py-1 rounded border ${fRole === "all" ? "bg-primary text-primary-foreground border-primary" : "hover:border-primary"}`}>All roles</button>
              {roleOptions.map((r) => (
                <button key={r} onClick={() => setFRole(r)}
                  className={`text-xs px-2 py-1 rounded border capitalize ${fRole === r ? "bg-primary text-primary-foreground border-primary" : "hover:border-primary"}`}>
                  {r.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isAdmin && selected.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
              <span className="text-sm font-medium">{selected.size} selected</span>
              <Button size="sm" variant="ghost" onClick={clearSelection}><X className="w-3 h-3 mr-1" />Clear</Button>
              <div className="h-4 w-px bg-border mx-1" />
              <Button size="sm" onClick={() => setWizardOpen(true)}>
                <Wand2 className="w-3 h-3 mr-1" />Bulk actions…
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="h-60 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isAdmin && (
                      <TableHead className="w-8">
                        <Checkbox checked={allOnPageSelected} onCheckedChange={(v) => togglePage(!!v)} aria-label="Select all" />
                      </TableHead>
                    )}
                    <TableHead>Employee #</TableHead>
                    <TableHead>Unique ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Subjects</TableHead>
                    <TableHead>Login</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.length === 0 && (
                    <TableRow><TableCell colSpan={isAdmin ? 11 : 9} className="text-center text-sm text-muted-foreground py-8">No staff matching filters.</TableCell></TableRow>
                  )}
                  {staff.map((s: any) => {
                    const dept = depts.find((d: any) => d.id === s.department_id);
                    const sj = links[s.id] ?? [];
                    const isSel = selected.has(s.id);
                    return (
                      <TableRow key={s.id} data-state={isSel ? "selected" : undefined}>
                        {isAdmin && (
                          <TableCell>
                            <Checkbox
                              checked={isSel}
                              onCheckedChange={(v) => {
                                const next = new Set(selected);
                                if (v) next.add(s.id); else next.delete(s.id);
                                setSelected(next);
                              }}
                              aria-label="Select row"
                            />
                          </TableCell>
                        )}
                        <TableCell className="font-mono text-xs">{s.employee_no}</TableCell>

                        <TableCell className="font-mono text-xs">{s.unique_id ?? "—"}</TableCell>
                        <TableCell className="font-medium">
                          <Link to="/staff/$id" params={{ id: s.id }} className="flex items-center gap-2 hover:underline">
                            {s.photo_url && <img src={s.photo_url} alt="" className="w-7 h-7 rounded-full object-cover" />}
                            {s.first_name} {s.last_name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {s.staff_category ? <Badge variant="secondary" className="capitalize text-[10px]">{s.staff_category}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{s.role.replace(/_/g, " ")}</Badge></TableCell>
                        <TableCell className="text-xs">{dept?.name ?? s.department ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-[180px]">
                            {sj.slice(0, 3).map((c, i) => <Badge key={i} variant="outline" className="text-[9px]">{c}</Badge>)}
                            {sj.length > 3 && <span className="text-[10px] text-muted-foreground">+{sj.length - 3}</span>}
                            {sj.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {s.user_id ? (
                            <Badge variant="outline" className="text-[10px]">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">No login</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <StatusBadge status={s.lifecycle_status ?? s.status} />
                            {s.lifecycle_reason && (
                              <span className="text-[10px] text-muted-foreground italic max-w-[180px] truncate" title={s.lifecycle_reason}>
                                {s.lifecycle_reason}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Link to="/staff/$id" params={{ id: s.id }}>
                                <Button size="sm" variant="ghost"><ExternalLink className="w-3 h-3" /></Button>
                              </Link>
                              <EditStaffWizardButton staff={s} onDone={() => qc.invalidateQueries({ queryKey: ["staff"] })} />
                              <LifecycleActions kind="staff" id={s.id} currentStatus={s.lifecycle_status ?? "active"} queryKey="staff" />
                              <DeleteConfirmDialog label={`${s.first_name ?? ""} ${s.last_name ?? s.full_name ?? s.employee_no}`} isPending={deleteMutation.isPending} onConfirm={() => schoolId && deleteMutation.mutate({ id: s.id, schoolId, table: "staff", entity: "staff", label: s.employee_no, invalidateKeys: ["staff"] })} />
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <Pager page={page} pageCount={pageCount} total={totalCount} onChange={setPage} />
        </CardContent>
      </Card>

      <BulkActionsWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        selectedIds={selectedIds}
        departments={depts as any}
        onComplete={clearSelection}
      />
    </div>
  );
}

function EditStaffWizardButton({ staff, onDone }: { staff: any; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline">Edit</Button></DialogTrigger>
      <StaffWizard existing={staff} onDone={() => { setOpen(false); onDone(); }} />
    </Dialog>
  );
}
