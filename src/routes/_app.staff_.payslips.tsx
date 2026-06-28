import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTenant } from "@/hooks/use-tenant";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Trash2, Download, FileText, Banknote } from "lucide-react";
import { motion } from "framer-motion";

export const Route = createFileRoute("/_app/staff/payslips")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: PayslipsPage,
});

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i);

interface LineItem { name: string; amount: string }

function PayslipsPage() {
  const { isAdmin, hasRole, user } = useAuth();
  const { school } = useTenant();
  const qc = useQueryClient();

  const canManage = isAdmin || hasRole("finance_admin") || hasRole("bursar");
  const isStaff   = hasRole("staff") || hasRole("teacher") || hasRole("class_teacher");

  // ── Staff list (for admin) ────────────────────────────────────────────
  const { data: staffList = [] } = useQuery({
    queryKey: ["staff-list-payslips"],
    enabled:  canManage,
    queryFn:  async () => {
      const { data } = await supabase
        .from("staff")
        .select("id, first_name, last_name, employee_no, department, position_title")
        .order("first_name");
      return data ?? [];
    },
  });

  // ── Payslips ──────────────────────────────────────────────────────────
  const { data: payslips = [], isLoading } = useQuery({
    queryKey: ["payslips", user?.id, canManage],
    queryFn:  async () => {
      let q = supabase
        .from("staff_payslips")
        .select(`
          *,
          staff:staff_id(first_name, last_name, employee_no, department, position_title)
        `)
        .order("year",  { ascending: false })
        .order("month", { ascending: false });

      // Staff only see their own payslips (RLS also enforces this)
      if (!canManage) {
        const { data: link } = await supabase
          .from("staff")
          .select("id")
          .eq("user_id", user!.id)
          .maybeSingle();
        if (!link) return [];
        q = q.eq("staff_id", link.id);
      }

      const { data, error } = await q;
      if (error) { console.error("payslips error:", error); return []; }
      return data ?? [];
    },
  });

  // ── Form state ────────────────────────────────────────────────────────
  const [open, setOpen]         = useState(false);
  const [editing, setEditing]   = useState<any | null>(null);
  const [staffId, setStaffId]   = useState("");
  const [month, setMonth]       = useState(String(new Date().getMonth() + 1));
  const [year, setYear]         = useState(String(CURRENT_YEAR));
  const [basic, setBasic]       = useState("");
  const [allowances, setAllowances] = useState<LineItem[]>([{ name: "", amount: "" }]);
  const [deductions, setDeductions] = useState<LineItem[]>([{ name: "", amount: "" }]);
  const [notes, setNotes]       = useState("");
  const [status, setStatus]     = useState("draft");

  const netPay =
    Number(basic || 0) +
    allowances.reduce((s, a) => s + Number(a.amount || 0), 0) -
    deductions.reduce((s, d) => s + Number(d.amount || 0), 0);

  function resetForm() {
    setEditing(null); setStaffId(""); setMonth(String(new Date().getMonth() + 1));
    setYear(String(CURRENT_YEAR)); setBasic(""); setNotes(""); setStatus("draft");
    setAllowances([{ name: "", amount: "" }]);
    setDeductions([{ name: "", amount: "" }]);
  }

  function openEdit(p: any) {
    setEditing(p);
    setStaffId(p.staff_id);
    setMonth(String(p.month));
    setYear(String(p.year));
    setBasic(String(p.basic_salary));
    setAllowances(p.allowances?.length ? p.allowances : [{ name: "", amount: "" }]);
    setDeductions(p.deductions?.length ? p.deductions : [{ name: "", amount: "" }]);
    setNotes(p.notes ?? "");
    setStatus(p.status);
    setOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!school) {
        throw new Error("School info is still loading — please wait a moment and try again.");
      }
      if (!user) {
        throw new Error("You're not signed in. Please refresh and log in again.");
      }
      const payload = {
        school_id:    school.id,
        staff_id:     staffId,
        month:        Number(month),
        year:         Number(year),
        basic_salary: Number(basic),
        allowances:   allowances.filter(a => a.name && a.amount),
        deductions:   deductions.filter(d => d.name && d.amount),
        notes:        notes || null,
        status,
        net_pay:      netPay,
        created_by:   user.id,
      };
      if (editing) {
        const { error } = await supabase.from("staff_payslips").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("staff_payslips").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Payslip updated" : "Payslip created");
      qc.invalidateQueries({ queryKey: ["payslips"] });
      setOpen(false);
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff_payslips").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payslip deleted");
      qc.invalidateQueries({ queryKey: ["payslips"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("staff_payslips")
        .update({ status: "approved" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payslip approved");
      qc.invalidateQueries({ queryKey: ["payslips"] });
    },
  });

  function updateAllowance(i: number, field: "name" | "amount", val: string) {
    setAllowances(prev => prev.map((a, idx) => idx === i ? { ...a, [field]: val } : a));
  }
  function updateDeduction(i: number, field: "name" | "amount", val: string) {
    setDeductions(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: val } : d));
  }

  const statusColor = (s: string) =>
    s === "paid"     ? "bg-emerald-600"  :
    s === "approved" ? "bg-blue-600"     :
                       "bg-muted-foreground";

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Banknote className="w-6 h-6 text-primary" />
            {canManage ? "Staff Payslips" : "My Payslips"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {canManage ? "Manage and issue staff payslips" : "View your salary payslips"}
          </p>
        </div>

        {canManage && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-1.5">
                <Plus className="w-4 h-4" /> New Payslip
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Payslip" : "Create Payslip"}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Staff + Period */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-1 space-y-1">
                    <Label>Staff Member</Label>
                    <Select value={staffId} onValueChange={setStaffId}>
                      <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                      <SelectContent>
                        {staffList.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.first_name} {s.last_name}
                            {s.employee_no ? ` (${s.employee_no})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Month</Label>
                    <Select value={month} onValueChange={setMonth}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Year</Label>
                    <Select value={year} onValueChange={setYear}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {YEARS.map((y) => (
                          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Basic salary */}
                <div className="space-y-1">
                  <Label>Basic Salary (KES)</Label>
                  <Input
                    type="number" min={0} value={basic}
                    onChange={(e) => setBasic(e.target.value)}
                    placeholder="e.g. 45000"
                  />
                </div>

                {/* Allowances */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Allowances</Label>
                    <Button
                      type="button" size="sm" variant="outline"
                      onClick={() => setAllowances(p => [...p, { name: "", amount: "" }])}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Add
                    </Button>
                  </div>
                  {allowances.map((a, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Input
                        placeholder="Name (e.g. House)"
                        value={a.name}
                        onChange={(e) => updateAllowance(i, "name", e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        type="number" placeholder="Amount"
                        value={a.amount}
                        onChange={(e) => updateAllowance(i, "amount", e.target.value)}
                        className="w-32"
                      />
                      {allowances.length > 1 && (
                        <Button
                          type="button" size="icon" variant="ghost"
                          onClick={() => setAllowances(p => p.filter((_, idx) => idx !== i))}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Deductions */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Deductions</Label>
                    <Button
                      type="button" size="sm" variant="outline"
                      onClick={() => setDeductions(p => [...p, { name: "", amount: "" }])}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Add
                    </Button>
                  </div>
                  {deductions.map((d, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Input
                        placeholder="Name (e.g. NSSF)"
                        value={d.name}
                        onChange={(e) => updateDeduction(i, "name", e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        type="number" placeholder="Amount"
                        value={d.amount}
                        onChange={(e) => updateDeduction(i, "amount", e.target.value)}
                        className="w-32"
                      />
                      {deductions.length > 1 && (
                        <Button
                          type="button" size="icon" variant="ghost"
                          onClick={() => setDeductions(p => p.filter((_, idx) => idx !== i))}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Net pay preview */}
                <div className="rounded-xl border bg-muted/30 p-4 flex items-center justify-between">
                  <span className="text-sm font-semibold text-muted-foreground">Net Pay</span>
                  <span className="text-2xl font-bold text-emerald-600">
                    KES {netPay.toLocaleString()}
                  </span>
                </div>

                {/* Status + Notes */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Notes (optional)</Label>
                  <Textarea
                    rows={2} value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any notes for this payslip..."
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || !staffId || !basic || !school}
                >
                  {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  {editing ? "Update" : "Create Payslip"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="h-40 grid place-items-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : payslips.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground opacity-30" />
              <p className="text-muted-foreground">No payslips on record yet.</p>
              {canManage && (
                <p className="text-sm text-muted-foreground">
                  Create the first payslip using the button above.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    {canManage && <TableHead>Staff</TableHead>}
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Basic</TableHead>
                    <TableHead className="text-right">Allowances</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right font-bold">Net Pay</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payslips.map((p: any) => {
                    const totalAllow = (p.allowances ?? []).reduce((s: number, a: any) => s + Number(a.amount || 0), 0);
                    const totalDeduct = (p.deductions ?? []).reduce((s: number, d: any) => s + Number(d.amount || 0), 0);
                    return (
                      <TableRow key={p.id} className="text-sm hover:bg-muted/40">
                        {canManage && (
                          <TableCell className="font-medium">
                            {p.staff?.first_name} {p.staff?.last_name}
                            <br />
                            <span className="text-xs text-muted-foreground font-mono">
                              {p.staff?.employee_no}
                            </span>
                          </TableCell>
                        )}
                        <TableCell>
                          {MONTHS[p.month - 1]} {p.year}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(p.basic_salary).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-600">
                          +{totalAllow.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-red-500">
                          -{totalDeduct.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums text-emerald-600">
                          KES {Number(p.net_pay ?? (p.basic_salary + totalAllow - totalDeduct)).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${statusColor(p.status)} text-white capitalize text-xs`}>
                            {p.status}
                          </Badge>
                        </TableCell>
                        {canManage && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {p.status === "draft" && (
                                <Button
                                  size="sm" variant="outline" className="h-7 text-xs"
                                  onClick={() => approveMutation.mutate(p.id)}
                                >
                                  Approve
                                </Button>
                              )}
                              <Button
                                size="sm" variant="ghost" className="h-7 text-xs"
                                onClick={() => openEdit(p)}
                              >
                                Edit
                              </Button>
                              <Button
                                size="icon" variant="ghost" className="h-7 w-7"
                                onClick={() => {
                                  if (confirm("Delete this payslip?")) deleteMutation.mutate(p.id);
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </Button>
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
        </CardContent>
      </Card>
    </div>
  );
}
