import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { upsertClassFee } from "@/lib/class-fees.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Zap, Coins, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/finance/fees")({
  component: () => (<FeatureGate feature="finance"><Page /></FeatureGate>),
});

const COMPONENTS = ["tuition", "boarding", "transport", "meals"] as const;
const CURRENT_YEAR = new Date().getFullYear();

function Page() {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertClassFee);
  // Server-only work is lazy-loaded so it never lands in the client bundle.
  const genFn = useServerFn(() => import("@/lib/class-fees.functions").then((m) => m.generateTermInvoices));

  const [classId, setClassId] = useState("");
  const [component, setComponent] = useState<(typeof COMPONENTS)[number] | "">("");
  const [amount, setAmount] = useState("");
  const [term, setTerm] = useState("Term 1");
  const [year, setYear] = useState(String(CURRENT_YEAR));

  const [fsName, setFsName] = useState("");
  const [fsLevel, setFsLevel] = useState("");
  const [fsTerm, setFsTerm] = useState("Term 1");
  const [fsYear, setFsYear] = useState(String(CURRENT_YEAR));
  const [fsAmount, setFsAmount] = useState("");

  const [genClassId, setGenClassId] = useState("all");
  const [genTerm, setGenTerm] = useState("");
  const [genYear, setGenYear] = useState("");

  const { data: classes = [] } = useQuery({
    queryKey: ["classes-min"],
    queryFn: async () =>
      (await supabase.from("classes").select("id,name,level,stream,year").order("name")).data ?? [],
  });

  const { data: feeStructures = [], isLoading: structuresLoading } = useQuery({
    queryKey: ["fee-structures"],
    queryFn: async () =>
      (await supabase
        .from("fee_structures")
        .select("id, name, level, term, year, amount")
        .order("year", { ascending: false })
        .order("term")).data ?? [],
  });

  const { data: components = [], isLoading: componentsLoading } = useQuery({
    queryKey: ["class-fee-components"],
    queryFn: async () =>
      (await supabase
        .from("class_fee_components")
        .select("id, class_id, component, amount, term, year")
        .order("year", { ascending: false })
        .order("term")).data ?? [],
  });

  const classNameById = new Map((classes as any[]).map((c) => [c.id, `${c.name}${c.stream ? ` – ${c.stream}` : ""}`]));

  const distinctLevels = Array.from(new Set((classes as any[]).map((c) => c.level).filter(Boolean)));

  const addStructure = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("fee_structures").insert({
        name: fsName,
        level: fsLevel,
        term: fsTerm,
        year: Number(fsYear),
        amount: Number(fsAmount),
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fee structure saved.");
      setFsName("");
      setFsAmount("");
      qc.invalidateQueries({ queryKey: ["fee-structures"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save fee structure"),
  });

  const deleteStructure = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fee_structures").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fee structure deleted.");
      qc.invalidateQueries({ queryKey: ["fee-structures"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to delete — it may already have invoices against it"),
  });

  const deleteComponent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("class_fee_components").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fee component deleted.");
      qc.invalidateQueries({ queryKey: ["class-fee-components"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to delete — it may already have invoices against it"),
  });

  const upsert = useMutation({
    mutationFn: async () =>
      upsertFn({
        data: {
          class_id: classId,
          component: component as (typeof COMPONENTS)[number],
          amount: Number(amount),
          term,
          year: Number(year),
        },
      }),
    onSuccess: () => {
      toast.success("Fee component saved.");
      setAmount("");
      qc.invalidateQueries({ queryKey: ["class-fee-components"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save fee component"),
  });

  const generate = useMutation({
    mutationFn: async () =>
      genFn({
        data: {
          class_id: genClassId === "all" ? undefined : genClassId,
          term: genTerm || undefined,
          year: genYear ? Number(genYear) : undefined,
        },
      }),
    onSuccess: (r: any) =>
      toast.success(`Processed ${r.studentsProcessed} student(s), ${r.componentsConsidered} fee component(s) applied.`),
    onError: (e: any) => toast.error(e.message ?? "Failed to generate invoices"),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Fees</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Set up flat fee structures (e.g. a whole term's fee for a level) and/or itemized class fee components
          (tuition/boarding/transport/meals per class). Both show up as sources on the Bulk Invoice Generation and
          Issue Invoice pages.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="w-4 h-4" /> Add fee structure</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Name</Label>
              <Input value={fsName} onChange={(e) => setFsName(e.target.value)} placeholder="e.g. Term 1 Fees" />
            </div>
            <div>
              <Label>Level</Label>
              <Input
                value={fsLevel}
                onChange={(e) => setFsLevel(e.target.value)}
                placeholder="e.g. Form 1"
                list="fee-structure-levels"
              />
              <datalist id="fee-structure-levels">
                {distinctLevels.map((l) => <option key={l} value={l} />)}
              </datalist>
            </div>
            <div>
              <Label>Amount (KES)</Label>
              <Input type="number" min="0" value={fsAmount} onChange={(e) => setFsAmount(e.target.value)} placeholder="e.g. 45000" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Term</Label>
                <Input value={fsTerm} onChange={(e) => setFsTerm(e.target.value)} placeholder="Term 1" />
              </div>
              <div>
                <Label>Year</Label>
                <Input type="number" value={fsYear} onChange={(e) => setFsYear(e.target.value)} />
              </div>
            </div>
          </div>
          <Button
            disabled={!fsName || !fsLevel || !fsAmount || !fsTerm || !fsYear || addStructure.isPending}
            onClick={() => addStructure.mutate()}
          >
            {addStructure.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
            Save fee structure
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Coins className="w-4 h-4" /> Configured fee structures</CardTitle></CardHeader>
        <CardContent>
          {structuresLoading ? (
            <div className="py-8 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
          ) : feeStructures.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No fee structures configured yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(feeStructures as any[]).map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>{f.name}</TableCell>
                    <TableCell>{f.level}</TableCell>
                    <TableCell>{f.term}</TableCell>
                    <TableCell>{f.year}</TableCell>
                    <TableCell className="text-right">KES {Number(f.amount).toLocaleString()}</TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={deleteStructure.isPending}
                        onClick={() => {
                          if (confirm(`Delete "${f.name}"? This cannot be undone.`)) deleteStructure.mutate(f.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="w-4 h-4" /> Add / update fee component</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Class</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger><SelectValue placeholder="Choose class" /></SelectTrigger>
                <SelectContent>
                  {(classes as any[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.stream ? ` – ${c.stream}` : ""} ({c.level} {c.year})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Component</Label>
              <Select value={component} onValueChange={(v) => setComponent(v as (typeof COMPONENTS)[number])}>
                <SelectTrigger><SelectValue placeholder="Choose component" /></SelectTrigger>
                <SelectContent>
                  {COMPONENTS.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (KES)</Label>
              <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 15000" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Term</Label>
                <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Term 1" />
              </div>
              <div>
                <Label>Year</Label>
                <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
              </div>
            </div>
          </div>
          <Button
            disabled={!classId || !component || !amount || !term || !year || upsert.isPending}
            onClick={() => upsert.mutate()}
          >
            {upsert.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
            Save fee component
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Coins className="w-4 h-4" /> Configured fee components</CardTitle></CardHeader>
        <CardContent>
          {componentsLoading ? (
            <div className="py-8 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
          ) : components.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No fee components configured yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead>Component</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(components as any[]).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{classNameById.get(c.class_id) ?? c.class_id}</TableCell>
                    <TableCell className="capitalize">{c.component}</TableCell>
                    <TableCell>{c.term}</TableCell>
                    <TableCell>{c.year}</TableCell>
                    <TableCell className="text-right">KES {Number(c.amount).toLocaleString()}</TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={deleteComponent.isPending}
                        onClick={() => {
                          if (confirm(`Delete this ${c.component} component?`)) deleteComponent.mutate(c.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Zap className="w-4 h-4" /> Generate term invoices</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Applies every configured fee component to each active student in the selected class (or all classes),
            for the given term/year — leave term/year blank to use the school's current term.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Class (optional)</Label>
              <Select value={genClassId} onValueChange={setGenClassId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All classes</SelectItem>
                  {(classes as any[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.stream ? ` – ${c.stream}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Term (optional)</Label>
              <Input value={genTerm} onChange={(e) => setGenTerm(e.target.value)} placeholder="Term 1" />
            </div>
            <div>
              <Label>Year (optional)</Label>
              <Input type="number" value={genYear} onChange={(e) => setGenYear(e.target.value)} placeholder={String(CURRENT_YEAR)} />
            </div>
          </div>
          <Button disabled={generate.isPending} onClick={() => generate.mutate()}>
            {generate.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
            Generate invoices
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
