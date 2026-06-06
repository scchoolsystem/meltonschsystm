import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { upsertClassFee, generateTermInvoices } from "@/lib/class-fees.functions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/finance/fees")({ component: () => (<FeatureGate feature="finance"><Page /></FeatureGate>) });

function Page() {
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("bursar") || hasRole("finance_admin");

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Fees</h1>
        <p className="text-sm text-muted-foreground mt-1">Class-based components feed auto-invoice generation; legacy structures remain for compatibility.</p>
      </div>
      <Tabs defaultValue="class">
        <TabsList>
          <TabsTrigger value="class">Class Components</TabsTrigger>
          <TabsTrigger value="legacy">Legacy Fee Structures</TabsTrigger>
        </TabsList>
        <TabsContent value="class" className="space-y-4"><ClassComponentsPanel can={can} /></TabsContent>
        <TabsContent value="legacy" className="space-y-4"><LegacyPanel can={can} /></TabsContent>
      </Tabs>
    </div>
  );
}

function ClassComponentsPanel({ can }: { can: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const genFn = useServerFn(generateTermInvoices);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["class-fee-components"],
    queryFn: async () => (await supabase.from("class_fee_components").select("*, classes(name)").order("year", { ascending: false })).data ?? [],
  });
  const { data: classes = [] } = useQuery({
    queryKey: ["classes-min"],
    queryFn: async () => (await supabase.from("classes").select("id, name").order("name")).data ?? [],
  });

  async function generateAll() {
    setGenBusy(true);
    try {
      const res = await genFn({ data: {} });
      toast.success(`Processed ${res.studentsProcessed} students (${res.componentsConsidered} components)`);
      qc.invalidateQueries({ queryKey: ["invoices"] });
    } catch (e: any) { toast.error(e.message); } finally { setGenBusy(false); }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base font-semibold">Per-class fee components</h2>
            <p className="text-xs text-muted-foreground">Tuition, boarding, transport, meals — auto-applied to all active students in that class.</p>
          </div>
          {can && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={generateAll} disabled={genBusy}>
                {genBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                Generate term invoices
              </Button>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Add component</Button></DialogTrigger>
                <ComponentDialog classes={classes as any} onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["class-fee-components"] }); }} />
              </Dialog>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="h-32 grid place-items-center"><Loader2 className="animate-spin" /></div> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Class</TableHead><TableHead>Component</TableHead><TableHead>Term</TableHead><TableHead>Year</TableHead><TableHead className="text-right">Amount</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No components yet.</TableCell></TableRow>}
                {(rows as any[]).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.classes?.name ?? "—"}</TableCell>
                    <TableCell className="capitalize">{r.component}</TableCell>
                    <TableCell>{r.term}</TableCell>
                    <TableCell>{r.year}</TableCell>
                    <TableCell className="text-right font-mono">KES {Number(r.amount).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function ComponentDialog({ classes, onDone }: { classes: { id: string; name: string }[]; onDone: () => void }) {
  const upsertFn = useServerFn(upsertClassFee);
  const [f, setF] = useState({ class_id: "", component: "tuition" as const, amount: 0, term: "Term 1", year: new Date().getFullYear() });
  const m = useMutation({
    mutationFn: async () => { if (!f.class_id) throw new Error("Pick a class"); await upsertFn({ data: f }); },
    onSuccess: () => { toast.success("Component saved"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Add fee component</DialogTitle></DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Class</Label>
          <Select value={f.class_id} onValueChange={(v) => setF({ ...f, class_id: v })}>
            <SelectTrigger><SelectValue placeholder="Pick class" /></SelectTrigger>
            <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Component</Label>
            <Select value={f.component} onValueChange={(v: any) => setF({ ...f, component: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tuition">Tuition</SelectItem>
                <SelectItem value="boarding">Boarding</SelectItem>
                <SelectItem value="transport">Transport</SelectItem>
                <SelectItem value="meals">Meals</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Term</Label>
            <Select value={f.term} onValueChange={(v) => setF({ ...f, term: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="Term 1">Term 1</SelectItem><SelectItem value="Term 2">Term 2</SelectItem><SelectItem value="Term 3">Term 3</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Year</Label><Input type="number" value={f.year} onChange={(e) => setF({ ...f, year: +e.target.value })} /></div>
          <div><Label>Amount (KES)</Label><Input type="number" min={0} value={f.amount} onChange={(e) => setF({ ...f, amount: +e.target.value })} required /></div>
        </div>
        <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function LegacyPanel({ can }: { can: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: ["fees"],
    queryFn: async () => (await supabase.from("fee_structures").select("*").order("year", { ascending: false })).data ?? [],
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div><h2 className="text-base font-semibold">Legacy fee structures</h2><p className="text-xs text-muted-foreground">{data.length} entries</p></div>
        {can && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button variant="outline"><Plus className="w-4 h-4 mr-2" />New</Button></DialogTrigger>
            <LegacyAddDialog onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["fees"] }); }} />
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="h-32 grid place-items-center"><Loader2 className="animate-spin" /></div> : (
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Level</TableHead><TableHead>Term</TableHead><TableHead>Year</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No legacy structures.</TableCell></TableRow>}
              {(data as any[]).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="capitalize">{r.level}</TableCell>
                  <TableCell>{r.term}</TableCell>
                  <TableCell>{r.year}</TableCell>
                  <TableCell className="text-right font-mono">KES {Number(r.amount).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function LegacyAddDialog({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: "", level: "secondary", term: "Term 1", year: new Date().getFullYear(), amount: 0 });
  const m = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("fee_structures").insert(f); if (error) throw error; },
    onSuccess: () => { toast.success("Saved"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New Fee Structure</DialogTitle></DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Name</Label><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Level</Label>
            <Select value={f.level} onValueChange={(v) => setF({ ...f, level: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="primary">Primary</SelectItem><SelectItem value="secondary">Secondary</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label>Term</Label>
            <Select value={f.term} onValueChange={(v) => setF({ ...f, term: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="Term 1">Term 1</SelectItem><SelectItem value="Term 2">Term 2</SelectItem><SelectItem value="Term 3">Term 3</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Year</Label><Input type="number" value={f.year} onChange={(e) => setF({ ...f, year: +e.target.value })} /></div>
          <div><Label>Amount (KES)</Label><Input type="number" min={0} value={f.amount} onChange={(e) => setF({ ...f, amount: +e.target.value })} required /></div>
        </div>
        <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
