import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  listExpenses,
  recordExpense,
  approveExpense,
  seedExpenseCategories,
  recordPettyCash,
} from "@/lib/finance-extended.functions";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Loader2, CheckCircle, Coins } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Pager } from "@/components/Pager";

export const Route = createFileRoute("/_app/finance/expenses")({
  component: () => (
    <FeatureGate feature="finance">
      <Page />
    </FeatureGate>
  ),
});

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
  approved: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  paid: "bg-green-500/15 text-green-500 border-green-500/30",
  rejected: "bg-red-500/15 text-red-500 border-red-500/30",
};

const YEAR = new Date().getFullYear();
const TERMS = ["Term 1", "Term 2", "Term 3"];
const METHODS = ["cash", "cheque", "bank_transfer", "mpesa", "card", "other"];

function Page() {
  const { isAdmin, hasRole } = useAuth();
  const canWrite = isAdmin || hasRole("bursar") || hasRole("finance_admin") || hasRole("finance_user");
  const canApprove = isAdmin || hasRole("bursar") || hasRole("finance_admin");

  const [page, setPage] = useState(0);
  const [filterYear, setFilterYear] = useState(YEAR);
  const [filterTerm, setFilterTerm] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [pcOpen, setPcOpen] = useState(false);
  const qc = useQueryClient();

  const listFn = useServerFn(listExpenses);
  const approveFn = useServerFn(approveExpense);
  const seedFn = useServerFn(seedExpenseCategories);
  const pcFn = useServerFn(recordPettyCash);

  const { data: expData, isLoading } = useQuery({
    queryKey: ["expenses", page, filterYear, filterTerm, filterStatus],
    queryFn: () =>
      listFn({
        data: {
          page,
          year: filterYear,
          term: filterTerm === "all" ? undefined : filterTerm,
          status: filterStatus === "all" ? undefined : filterStatus,
        },
      }),
  });
  const rows = (expData as any)?.rows ?? [];
  const totalCount = (expData as any)?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / 50));

  const { data: pcBalance } = useQuery({
    queryKey: ["petty-cash-balance"],
    queryFn: async () =>
      (await supabase.from("v_petty_cash_balance").select("*").single()).data,
  });

  const totalShown = (rows as any[]).reduce((s: number, r: any) => s + Number(r.amount), 0);

  async function handleApprove(id: string) {
    try {
      await approveFn({ data: { expense_id: id } });
      toast.success("Expense approved");
      qc.invalidateQueries({ queryKey: ["expenses"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleSeed() {
    try {
      await seedFn({ data: {} });
      toast.success("Default categories seeded");
      qc.invalidateQueries({ queryKey: ["expense-categories"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Expenses</h1>
          <p className="text-sm text-muted-foreground mt-1">Track, approve, and report all school expenditure</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canApprove && (
            <Button variant="outline" size="sm" onClick={handleSeed}>
              Seed categories
            </Button>
          )}
          {canWrite && (
            <>
              <Dialog open={pcOpen} onOpenChange={setPcOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Coins className="w-4 h-4 mr-2" />Petty Cash
                  </Button>
                </DialogTrigger>
                <PettyCashDialog
                  onDone={() => { setPcOpen(false); qc.invalidateQueries({ queryKey: ["petty-cash-balance"] }); }}
                />
              </Dialog>
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="w-4 h-4 mr-2" />Record Expense</Button>
                </DialogTrigger>
                <AddExpenseDialog
                  onDone={() => { setAddOpen(false); qc.invalidateQueries({ queryKey: ["expenses"] }); }}
                />
              </Dialog>
            </>
          )}
        </div>
      </div>

      {/* Petty cash balance card */}
      {pcBalance && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="pt-4 pb-3 flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-muted-foreground">Petty Cash Balance</p>
              <p className="text-xl font-bold font-mono">KES {Number(pcBalance.balance ?? 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Funded</p>
              <p className="text-sm font-mono">KES {Number(pcBalance.total_funded ?? 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Disbursed</p>
              <p className="text-sm font-mono text-red-500">KES {Number(pcBalance.total_disbursed ?? 0).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={String(filterYear)} onValueChange={(v) => { setFilterYear(Number(v)); setPage(0); }}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{[YEAR - 1, YEAR, YEAR + 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterTerm} onValueChange={(v) => { setFilterTerm(v); setPage(0); }}>
          <SelectTrigger className="w-32"><SelectValue placeholder="All terms" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Terms</SelectItem>
            {TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(0); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {["pending", "approved", "paid", "rejected"].map((s) => (
              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="self-center text-sm px-3 py-1">
          Showing: KES {totalShown.toLocaleString()}
        </Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="h-48 grid place-items-center"><Loader2 className="animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Payee</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {canApprove && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                      No expenses recorded yet. Click "Record Expense" to get started.
                    </TableCell>
                  </TableRow>
                )}
                {(rows as any[]).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{r.expense_date}</TableCell>
                    <TableCell className="font-medium">{r.title}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.expense_categories?.name ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.payee ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.term ?? "—"}</TableCell>
                    <TableCell className="text-xs capitalize">{r.payment_method}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_COLORS[r.status] ?? ""}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">KES {Number(r.amount).toLocaleString()}</TableCell>
                    {canApprove && (
                      <TableCell>
                        {r.status === "pending" && (
                          <Button size="sm" variant="ghost" onClick={() => handleApprove(r.id)}>
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Pager page={page} pageCount={pageCount} total={totalCount} onChange={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}

function AddExpenseDialog({ onDone }: { onDone: () => void }) {
  const recFn = useServerFn(recordExpense);
  const { data: cats = [] } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => (await supabase.from("expense_categories").select("id,name").order("name")).data ?? [],
  });

  const [f, setF] = useState({
    title: "",
    description: "",
    amount: 0,
    expense_date: new Date().toISOString().slice(0, 10),
    payment_method: "cash" as const,
    reference: "",
    payee: "",
    term: "Term 1",
    year: YEAR,
    category_id: "",
  });

  const m = useMutation({
    mutationFn: () => recFn({ data: { ...f, category_id: f.category_id || undefined } }),
    onSuccess: () => { toast.success("Expense recorded"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });

  const set = (k: string, v: any) => setF((prev) => ({ ...prev, [k]: v }));

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Record Expense</DialogTitle></DialogHeader>
      <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
        <div><Label>Title *</Label><Input value={f.title} onChange={(e) => set("title", e.target.value)} required /></div>
        <div><Label>Category</Label>
          <Select value={f.category_id} onValueChange={(v) => set("category_id", v)}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {(cats as any[]).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Amount (KES) *</Label><Input type="number" min={0} value={f.amount} onChange={(e) => set("amount", Number(e.target.value))} required /></div>
          <div><Label>Date *</Label><Input type="date" value={f.expense_date} onChange={(e) => set("expense_date", e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Payment Method</Label>
            <Select value={f.payment_method} onValueChange={(v) => set("payment_method", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Reference</Label><Input value={f.reference} onChange={(e) => set("reference", e.target.value)} placeholder="Cheque no / ref" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Term</Label>
            <Select value={f.term} onValueChange={(v) => set("term", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Year</Label><Input type="number" value={f.year} onChange={(e) => set("year", Number(e.target.value))} /></div>
        </div>
        <div><Label>Payee / Supplier</Label><Input value={f.payee} onChange={(e) => set("payee", e.target.value)} /></div>
        <div><Label>Description</Label><Textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={2} /></div>
      </div>
      <DialogFooter>
        <Button onClick={() => m.mutate()} disabled={m.isPending || !f.title || f.amount <= 0}>
          {m.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save Expense
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function PettyCashDialog({ onDone }: { onDone: () => void }) {
  const pcFn = useServerFn(recordPettyCash);
  const [f, setF] = useState({ type: "disbursement" as "top_up" | "disbursement", amount: 0, description: "", voucher_no: "", transaction_date: new Date().toISOString().slice(0, 10) });
  const m = useMutation({
    mutationFn: () => pcFn({ data: f }),
    onSuccess: () => { toast.success("Petty cash entry saved"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Petty Cash Entry</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Type</Label>
          <Select value={f.type} onValueChange={(v: any) => setF({ ...f, type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="top_up">Top Up (Fund)</SelectItem>
              <SelectItem value="disbursement">Disbursement (Spend)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Amount (KES)</Label><Input type="number" min={0} value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></div>
          <div><Label>Date</Label><Input type="date" value={f.transaction_date} onChange={(e) => setF({ ...f, transaction_date: e.target.value })} /></div>
        </div>
        <div><Label>Description *</Label><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} required /></div>
        <div><Label>Voucher No</Label><Input value={f.voucher_no} onChange={(e) => setF({ ...f, voucher_no: e.target.value })} /></div>
      </div>
      <DialogFooter>
        <Button onClick={() => m.mutate()} disabled={m.isPending || !f.description || f.amount <= 0}>
          {m.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
