import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { upsertBudget, getBudgetVsActual, deleteBudget } from "@/lib/finance-extended.functions";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Plus, Loader2, TrendingUp, TrendingDown, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/finance/budget")({
  component: () => (
    <FeatureGate feature="finance">
      <Page />
    </FeatureGate>
  ),
});

const YEAR  = new Date().getFullYear();
const TERMS = ["", "Term 1", "Term 2", "Term 3"];

function Page() {
  const { isAdmin, hasRole } = useAuth();
  const canWrite = isAdmin || hasRole("bursar") || hasRole("finance_admin");

  const [selectedYear, setSelectedYear] = useState(YEAR);
  const [addOpen, setAddOpen]           = useState(false);
  const [editRow, setEditRow]           = useState<any>(null);
  const qc = useQueryClient();

  const bvaFn = useServerFn(getBudgetVsActual);
  const delFn = useServerFn(deleteBudget);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["budget-vs-actual", selectedYear],
    queryFn: () => bvaFn({ data: { year: selectedYear } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["budget-vs-actual"] });

  const totalAllocated = (rows as any[]).reduce((s, r) => s + Number(r.allocated), 0);
  const totalSpent     = (rows as any[]).reduce((s, r) => s + Number(r.actual_spent), 0);
  const totalVariance  = totalAllocated - totalSpent;

  const chartData = (rows as any[])
    .sort((a, b) => Number(b.allocated) - Number(a.allocated))
    .slice(0, 12)
    .map((r) => ({
      name:      (r.category_name ?? r.budget_name ?? "—").slice(0, 16),
      Allocated: Number(r.allocated),
      Spent:     Number(r.actual_spent),
    }));

  async function handleDelete(id: string, name: string) {
    try {
      await delFn({ data: { id } });
      toast.success(`"${name}" deleted`);
      invalidate();
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Budget Planning</h1>
          <p className="text-sm text-muted-foreground mt-1">Allocate budgets per category and track actual spending</p>
        </div>
        <div className="flex gap-3">
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{[YEAR - 1, YEAR, YEAR + 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          {canWrite && (
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" />New Budget Line</Button>
              </DialogTrigger>
              <BudgetDialog
                year={selectedYear}
                onDone={() => { setAddOpen(false); invalidate(); }}
              />
            </Dialog>
          )}
        </div>
      </div>

      {/* Edit dialog */}
      {editRow && (
        <Dialog open={!!editRow} onOpenChange={(v) => { if (!v) setEditRow(null); }}>
          <BudgetDialog
            year={selectedYear}
            initial={editRow}
            onDone={() => { setEditRow(null); invalidate(); }}
          />
        </Dialog>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Budget</p>
            <p className="text-2xl font-bold font-mono">KES {totalAllocated.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">{(rows as any[]).length} budget lines</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Actual Spent</p>
            <p className="text-2xl font-bold font-mono text-red-500">KES {totalSpent.toLocaleString()}</p>
            <Progress value={totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : 0} className="mt-2 h-1" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Variance</p>
            <p className={`text-2xl font-bold font-mono ${totalVariance >= 0 ? "text-green-500" : "text-red-500"}`}>
              KES {Math.abs(totalVariance).toLocaleString()}
              {totalVariance >= 0
                ? <TrendingDown className="inline w-5 h-5 ml-1" />
                : <TrendingUp className="inline w-5 h-5 ml-1" />}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{totalVariance >= 0 ? "under budget" : "OVER BUDGET"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {!isLoading && chartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Budget vs Actual by Category</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ left: 16, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => `KES ${Number(v).toLocaleString()}`} />
                <Legend />
                <Bar dataKey="Allocated" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Spent"     fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="h-48 grid place-items-center"><Loader2 className="animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Budget / Category</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead>Utilisation</TableHead>
                  {canWrite && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows as any[]).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                      No budget lines for {selectedYear}. Click "New Budget Line" to add one.
                    </TableCell>
                  </TableRow>
                )}
                {(rows as any[]).map((r, i) => {
                  const variance = Number(r.allocated) - Number(r.actual_spent);
                  const pct      = Number(r.utilisation_pct ?? 0);
                  return (
                    <TableRow key={r.id ?? i}>
                      <TableCell>
                        <div className="font-medium">{r.budget_name}</div>
                        {r.category_name && <div className="text-xs text-muted-foreground">{r.category_name}</div>}
                      </TableCell>
                      <TableCell className="text-xs">{r.term || "All terms"}</TableCell>
                      <TableCell className="text-right font-mono">KES {Number(r.allocated).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">KES {Number(r.actual_spent).toLocaleString()}</TableCell>
                      <TableCell className={`text-right font-mono ${variance >= 0 ? "text-green-500" : "text-red-500 font-bold"}`}>
                        {variance >= 0 ? "+" : ""}KES {Math.abs(variance).toLocaleString()}
                      </TableCell>
                      <TableCell className="min-w-[120px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <Progress value={Math.min(100, pct)} className="h-1.5" />
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              pct >= 100 ? "border-red-500 text-red-500 text-xs"
                              : pct >= 80 ? "border-yellow-500 text-yellow-500 text-xs"
                              : "border-green-500 text-green-500 text-xs"
                            }
                          >
                            {pct}%
                          </Badge>
                        </div>
                      </TableCell>
                      {canWrite && (
                        <TableCell>
                          <div className="flex items-center gap-1 justify-end">
                            <Button size="sm" variant="ghost" onClick={() => setEditRow(r)} title="Edit">
                              <Pencil className="w-4 h-4 text-muted-foreground" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" title="Delete">
                                  <Trash2 className="w-4 h-4 text-red-500" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete budget line?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    "{r.budget_name}" — KES {Number(r.allocated).toLocaleString()} allocated. This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(r.id, r.budget_name)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BudgetDialog({ year, initial, onDone }: { year: number; initial?: any; onDone: () => void }) {
  const isEdit = !!initial;
  const uFn    = useServerFn(upsertBudget);

  const { data: cats = [] } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => (await supabase.from("expense_categories").select("id,name").order("name")).data ?? [],
  });

  const [f, setF] = useState({
    name:        initial?.budget_name  ?? "",
    category_id: initial?.category_id ?? "",
    term:        initial?.term         ?? "",
    year:        initial?.year         ?? year,
    allocated:   initial?.allocated    ?? 0,
    notes:       initial?.notes        ?? "",
  });

  const m = useMutation({
    mutationFn: () =>
      uFn({ data: {
        ...(isEdit ? { id: initial.id } : {}),
        ...f,
        category_id: f.category_id || undefined,
        term:        f.term        || undefined,
      }}),
    onSuccess: () => { toast.success(isEdit ? "Budget line updated" : "Budget line saved"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });

  const set = (k: string, v: any) => setF((prev) => ({ ...prev, [k]: v }));

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{isEdit ? "Edit Budget Line" : "New Budget Line"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Budget Name *</Label><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Salaries Term 1" required /></div>
        <div>
          <Label>Category</Label>
          <Select value={f.category_id || "__none__"} onValueChange={(v) => set("category_id", v === "__none__" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Link to category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No category</SelectItem>
              {(cats as any[]).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Term</Label>
            <Select value={f.term || "__none__"} onValueChange={(v) => set("term", v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="All terms" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">All terms</SelectItem>
                {["Term 1", "Term 2", "Term 3"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Year</Label><Input type="number" value={f.year} onChange={(e) => set("year", Number(e.target.value))} /></div>
        </div>
        <div><Label>Allocated Amount (KES) *</Label><Input type="number" min={0} value={f.allocated} onChange={(e) => set("allocated", Number(e.target.value))} required /></div>
        <div><Label>Notes</Label><Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></div>
      </div>
      <DialogFooter>
        <Button onClick={() => m.mutate()} disabled={m.isPending || !f.name || f.allocated < 0}>
          {m.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{isEdit ? "Save Changes" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
