import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { mpesaStkPush, bulkGenerateInvoices, bulkGenerateComponentInvoices } from "@/lib/finance.functions";
import { recordPayment } from "@/lib/finance-extended.functions";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, Smartphone, ChevronsUpDown, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Pager } from "@/components/Pager";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/finance/invoices")({
  component: () => (
    <FeatureGate feature="finance">
      <Page />
    </FeatureGate>
  ),
});

const PAGE_SIZE = 50;

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("bursar") || hasRole("finance_admin");

  const [open, setOpen] = useState(false);
  const [openPay, setOpenPay] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // ── Filters ──
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "unpaid" | "partial" | "paid">("all");
  const [classId, setClassId] = useState("all");

  const { data: classes = [] } = useQuery({
    queryKey: ["classes-min-invoices"],
    queryFn: async () => (await supabase.from("classes").select("id,name,level,year,stream").order("name")).data ?? [],
  });

  const { data: pageData, isLoading } = useQuery({
    queryKey: ["invoices", page, search, status, classId],
    queryFn: async () => {
      let q = supabase
        .from("invoices")
        .select(
          "*, students!inner(first_name,last_name,admission_no,class_id), fee_structures(name), class_fee_components(component)",
          { count: "exact" }
        )
        .order("created_at", { ascending: false });

      if (status !== "all") q = q.eq("status", status);
      if (classId !== "all") q = q.eq("students.class_id", classId);
      if (search.trim()) {
        const term = search.trim();
        q = q.or(
          `first_name.ilike.%${term}%,last_name.ilike.%${term}%,admission_no.ilike.%${term}%`,
          { referencedTable: "students" }
        );
      }

      const { data, count, error } = await q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const rows = pageData?.rows ?? [];
  const totalCount = pageData?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const hasFilters = search.trim() !== "" || status !== "all" || classId !== "all";
  const resetFilters = () => {
    setSearch("");
    setStatus("all");
    setClassId("all");
    setPage(0);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalCount.toLocaleString()} invoice{totalCount === 1 ? "" : "s"}
            {hasFilters ? " (filtered)" : ""}
          </p>
        </div>
        {can && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />Issue Invoice
              </Button>
            </DialogTrigger>
            <IssueDialog
              onDone={() => {
                setOpen(false);
                qc.invalidateQueries({ queryKey: ["invoices"] });
              }}
            />
          </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <Label>Search student</Label>
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder="Name or admission no."
              />
            </div>
            <div className="w-44">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v: any) => {
                  setStatus(v);
                  setPage(0);
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-56">
              <Label>Class</Label>
              <Select
                value={classId}
                onValueChange={(v) => {
                  setClassId(v);
                  setPage(0);
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All classes</SelectItem>
                  {(classes as any[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.stream ? ` – ${c.stream}` : ""} ({c.level} {c.year})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <X className="w-3.5 h-3.5 mr-1" />Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="h-40 grid place-items-center">
              <Loader2 className="animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Fee</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      {hasFilters ? "No invoices match these filters." : "No invoices."}
                    </TableCell>
                  </TableRow>
                )}
                {(rows as any[]).map((r) => {
                  const balance = Number(r.amount) - Number(r.paid);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.invoice_no}</TableCell>
                      <TableCell>
                        {r.students?.first_name} {r.students?.last_name}{" "}
                        <span className="text-xs text-muted-foreground">
                          ({r.students?.admission_no})
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.description || r.fee_structures?.name || (r.class_fee_components?.component && `${r.class_fee_components.component} (component)`) || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        KES {Number(r.amount).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-green-500">
                        KES {Number(r.paid).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-red-500">
                        KES {balance.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            r.status === "paid"
                              ? "bg-green-500/15 text-green-500 border-green-500/30"
                              : r.status === "partial"
                              ? "bg-yellow-500/15 text-yellow-500 border-yellow-500/30"
                              : "bg-muted"
                          }
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="space-x-2">
                        {can && r.status !== "paid" && (
                          <>
                            <Dialog
                              open={openPay === r.id}
                              onOpenChange={(v) => setOpenPay(v ? r.id : null)}
                            >
                              <DialogTrigger asChild>
                                <Button size="sm" variant="outline">
                                  Pay
                                </Button>
                              </DialogTrigger>
                              <PayDialog
                                invoiceId={r.id}
                                balance={balance}
                                onDone={() => {
                                  setOpenPay(null);
                                  qc.invalidateQueries({ queryKey: ["invoices"] });
                                }}
                              />
                            </Dialog>
                            <StkButton invoiceId={r.id} balance={balance} />
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <Pager page={page} pageCount={pageCount} total={totalCount} onChange={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}

// ── Searchable student picker ──────────────────────────────────
function StudentCombobox({
  value,
  onChange,
  students,
}: {
  value: string;
  onChange: (id: string) => void;
  students: { id: string; admission_no: string; first_name: string; last_name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const selected = students.find((s) => s.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected ? `${selected.admission_no} – ${selected.first_name} ${selected.last_name}` : "Search student…"}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Type a name or admission no…" />
          <CommandList>
            <CommandEmpty>No student found.</CommandEmpty>
            <CommandGroup>
              {students.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`${s.admission_no} ${s.first_name} ${s.last_name}`}
                  onSelect={() => {
                    onChange(s.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === s.id ? "opacity-100" : "opacity-0")} />
                  {s.admission_no} – {s.first_name} {s.last_name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── Issue Invoice Dialog ──────────────────────────────────────
function IssueDialog({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"manual" | "structure" | "component">("manual");
  const [f, setF] = useState({ student_id: "", amount: 0, due_date: "", description: "" });
  const [feeId, setFeeId] = useState("");
  const [componentId, setComponentId] = useState("");

  const generateFromStructure = useServerFn(bulkGenerateInvoices);
  const generateFromComponent = useServerFn(bulkGenerateComponentInvoices);

  const { data: students = [] } = useQuery({
    queryKey: ["students-min2"],
    queryFn: async () =>
      (await supabase.from("students").select("id,admission_no,first_name,last_name,class_id").eq("status", "active").limit(2000)).data ?? [],
  });
  const { data: fees = [] } = useQuery({
    queryKey: ["fees-min-issue"],
    queryFn: async () =>
      (await supabase.from("fee_structures").select("id,name,term,year,amount,level").order("year", { ascending: false })).data ?? [],
    enabled: mode === "structure",
  });
  const { data: classes = [] } = useQuery({
    queryKey: ["classes-min-issue"],
    queryFn: async () => (await supabase.from("classes").select("id,name,level,year,stream").order("name")).data ?? [],
    enabled: mode === "component",
  });
  const { data: components = [] } = useQuery({
    queryKey: ["class-fee-components-issue"],
    queryFn: async () =>
      (await supabase.from("class_fee_components").select("id,class_id,component,amount,term,year").order("year", { ascending: false }).order("term")).data ?? [],
    enabled: mode === "component",
  });

  const classNameById = useMemo(
    () => new Map((classes as any[]).map((c) => [c.id, `${c.name}${c.stream ? ` – ${c.stream}` : ""} (${c.level} ${c.year})`])),
    [classes]
  );

  const manualMutation = useMutation({
    mutationFn: async () => {
      const payload: any = { ...f };
      if (!payload.due_date) delete payload.due_date;
      if (!payload.description) payload.description = "Fee";
      // school_id is set by trg_autofill_school trigger
      const { error } = await supabase.from("invoices").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice issued");
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const structureForStudentMutation = useMutation({
    mutationFn: async () => {
      const fee = (fees as any[]).find((x) => x.id === feeId);
      if (!fee) throw new Error("Choose a fee structure");
      const { error } = await supabase.from("invoices").insert({
        student_id: f.student_id,
        fee_structure_id: fee.id,
        amount: fee.amount,
        due_date: f.due_date || undefined,
        description: `${fee.name} - ${fee.term} ${fee.year}`,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice issued");
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkStructureMutation = useMutation({
    mutationFn: () => generateFromStructure({ data: { fee_structure_id: feeId, due_date: f.due_date || undefined } }),
    onSuccess: (r) => {
      toast.success(`Created ${r.created} invoice(s), skipped ${r.skipped} (already invoiced).`);
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkComponentMutation = useMutation({
    mutationFn: () => generateFromComponent({ data: { class_fee_component_id: componentId, due_date: f.due_date || undefined } }),
    onSuccess: (r) => {
      toast.success(`Created ${r.created} invoice(s), skipped ${r.skipped} (already invoiced).`);
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const isPending =
    manualMutation.isPending || structureForStudentMutation.isPending || bulkStructureMutation.isPending || bulkComponentMutation.isPending;

  const handleIssue = () => {
    if (mode === "manual") return manualMutation.mutate();
    if (mode === "structure") {
      if (f.student_id) return structureForStudentMutation.mutate();
      return bulkStructureMutation.mutate();
    }
    if (mode === "component") return bulkComponentMutation.mutate();
  };

  const canIssue =
    mode === "manual"
      ? !!f.student_id && f.amount > 0
      : mode === "structure"
      ? !!feeId
      : !!componentId;

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Issue Invoice</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="manual">Manual</TabsTrigger>
            <TabsTrigger value="structure">Fee Structure</TabsTrigger>
            <TabsTrigger value="component">Fee Component</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === "manual" && (
          <>
            <div>
              <Label>Student</Label>
              <StudentCombobox value={f.student_id} onChange={(v) => setF({ ...f, student_id: v })} students={students as any[]} />
            </div>
            <div>
              <Label>Fee (e.g. "Transport - Term 2 2026")</Label>
              <Input
                value={f.description}
                onChange={(e) => setF({ ...f, description: e.target.value })}
                placeholder="What is this invoice for?"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount (KES)</Label>
                <Input type="number" min={1} value={f.amount} onChange={(e) => setF({ ...f, amount: +e.target.value })} />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} />
              </div>
            </div>
          </>
        )}

        {mode === "structure" && (
          <>
            <div>
              <Label>Fee Structure</Label>
              <Select value={feeId} onValueChange={setFeeId}>
                <SelectTrigger><SelectValue placeholder="Choose fee structure" /></SelectTrigger>
                <SelectContent>
                  {(fees as any[]).map((fs) => (
                    <SelectItem key={fs.id} value={fs.id}>
                      {fs.name} – {fs.term} {fs.year} ({fs.level}) – KES {Number(fs.amount).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Student (optional — leave blank to issue to every active student)</Label>
              <StudentCombobox value={f.student_id} onChange={(v) => setF({ ...f, student_id: v })} students={students as any[]} />
              {f.student_id && (
                <button type="button" className="text-xs text-muted-foreground underline mt-1" onClick={() => setF({ ...f, student_id: "" })}>
                  Clear — issue to all instead
                </button>
              )}
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} />
            </div>
          </>
        )}

        {mode === "component" && (
          <>
            <div>
              <Label>Fee Component</Label>
              <Select value={componentId} onValueChange={setComponentId}>
                <SelectTrigger><SelectValue placeholder="Choose fee component" /></SelectTrigger>
                <SelectContent>
                  {(components as any[]).length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No components yet — add one on the Fees page.</div>
                  )}
                  {(components as any[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {classNameById.get(c.class_id) ?? "Unknown class"} – {c.component} – {c.term} {c.year} – KES {Number(c.amount).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Issues to every active student in that component's class.</p>
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} />
            </div>
          </>
        )}
      </div>
      <DialogFooter>
        <Button onClick={handleIssue} disabled={isPending || !canIssue}>
          {isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
          {mode !== "manual" && !f.student_id ? "Generate Invoices" : "Issue"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ── M-Pesa STK Button ────────────────────────────────────────
function StkButton({ invoiceId, balance }: { invoiceId: string; balance: number }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState(balance);
  const stk = useServerFn(mpesaStkPush);

  const m = useMutation({
    mutationFn: async () =>
      stk({ data: { invoice_id: invoiceId, phone, amount: Math.round(amount) } }),
    onSuccess: () => {
      toast.success("STK push sent. Ask payer to enter M-Pesa PIN.");
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Smartphone className="w-3 h-3 mr-1" />M-Pesa
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>M-Pesa STK Push</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Phone (07.. or 2547..)</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0712345678"
            />
          </div>
          <div>
            <Label>Amount (KES)</Label>
            <Input
              type="number"
              min={1}
              max={balance}
              value={amount}
              onChange={(e) => setAmount(+e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => m.mutate()} disabled={!phone || m.isPending}>
            {m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
            Send STK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Pay Dialog ───────────────────────────────────────────────
// FIX: was directly inserting into payments table from the client.
// Now routes through the recordPayment server function which validates
// school_id ownership and balance before inserting.
function PayDialog({
  invoiceId,
  balance,
  onDone,
}: {
  invoiceId: string;
  balance: number;
  onDone: () => void;
}) {
  const recPayFn = useServerFn(recordPayment);
  const [f, setF] = useState({
    amount: balance,
    method: "cash" as "cash" | "cheque" | "bank_transfer" | "mpesa" | "card" | "other",
    reference: "",
  });

  const m = useMutation({
    mutationFn: () =>
      recPayFn({
        data: {
          invoice_id: invoiceId,
          amount: f.amount,
          method: f.method,
          reference: f.reference || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Payment recorded");
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Record Payment</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Amount (balance: KES {balance.toLocaleString()})</Label>
          <Input
            type="number"
            min={1}
            max={balance}
            value={f.amount}
            onChange={(e) => setF({ ...f, amount: +e.target.value })}
          />
        </div>
        <div>
          <Label>Method</Label>
          <Select value={f.method} onValueChange={(v: any) => setF({ ...f, method: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="mpesa">M-Pesa</SelectItem>
              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
              <SelectItem value="cheque">Cheque</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Reference / Txn No</Label>
          <Input
            value={f.reference}
            onChange={(e) => setF({ ...f, reference: e.target.value })}
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => m.mutate()} disabled={m.isPending || f.amount <= 0}>
          {m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
          Record
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
