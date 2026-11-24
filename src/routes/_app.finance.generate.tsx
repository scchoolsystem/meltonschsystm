import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FeatureGate } from "@/components/FeatureGate";
import { supabase } from "@/integrations/supabase/client";
import { bulkGenerateInvoices, bulkGenerateComponentInvoices } from "@/lib/finance.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Zap, Layers, Coins, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/finance/generate")({
  component: () => (
    <FeatureGate feature="finance">
      <Page />
    </FeatureGate>
  ),
});

const CURRENT_YEAR = new Date().getFullYear();
const kes = (n: number) => `KES ${Number(n).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;

type Result = { label: string; created?: number; skipped?: number; note?: string } | null;

function Page() {
  const qc = useQueryClient();
  const structFn = useServerFn(bulkGenerateInvoices);
  const compFn = useServerFn(bulkGenerateComponentInvoices);
  // Server-only work is lazy-loaded so it never lands in the client bundle.
  const termFn = useServerFn(() => import("@/lib/class-fees.functions").then((m) => m.generateTermInvoices));

  const [result, setResult] = useState<Result>(null);
  const [dueDate, setDueDate] = useState("");

  // tab 1 – flat fee structure
  const [feeId, setFeeId] = useState("");
  const [structClassId, setStructClassId] = useState("all");
  // tab 2 – single class fee component
  const [componentId, setComponentId] = useState("");
  // tab 3 – all components for a term
  const [termClassId, setTermClassId] = useState("all");
  const [term, setTerm] = useState("");
  const [year, setYear] = useState("");

  const { data: classes = [] } = useQuery({
    queryKey: ["gen-classes"],
    queryFn: async () =>
      (await supabase.from("classes").select("id,name,level,year,stream").order("name")).data ?? [],
  });
  const { data: fees = [] } = useQuery({
    queryKey: ["gen-fee-structures"],
    queryFn: async () =>
      (await supabase.from("fee_structures").select("id,name,term,year,amount,level").order("year", { ascending: false })).data ?? [],
  });
  const { data: components = [] } = useQuery({
    queryKey: ["gen-class-fee-components"],
    queryFn: async () =>
      (await supabase.from("class_fee_components").select("id,class_id,component,amount,term,year").order("year", { ascending: false }).order("term")).data ?? [],
  });
  const { data: stats } = useQuery({
    queryKey: ["gen-student-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .eq("lifecycle_status", "active");
      return { active: count ?? 0 };
    },
  });

  const className = useMemo(() => {
    const m = new Map<string, string>();
    (classes as any[]).forEach((c) => m.set(c.id, `${c.name}${c.stream ? ` – ${c.stream}` : ""}`));
    return m;
  }, [classes]);

  const done = (r: Result) => {
    setResult(r);
    qc.invalidateQueries({ queryKey: ["invoices"] });
  };

  const structMut = useMutation({
    mutationFn: () =>
      structFn({
        data: {
          fee_structure_id: feeId,
          class_id: structClassId === "all" ? undefined : structClassId,
          due_date: dueDate || undefined,
        },
      }),
    onSuccess: (r: any) => {
      toast.success(`Created ${r.created} invoice(s), skipped ${r.skipped} (already invoiced).`);
      done({ label: "Fee structure", created: r.created, skipped: r.skipped });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to generate invoices"),
  });

  const compMut = useMutation({
    mutationFn: () => compFn({ data: { class_fee_component_id: componentId, due_date: dueDate || undefined } }),
    onSuccess: (r: any) => {
      toast.success(`Created ${r.created} invoice(s), skipped ${r.skipped} (already invoiced).`);
      done({ label: "Class fee component", created: r.created, skipped: r.skipped });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to generate invoices"),
  });

  const termMut = useMutation({
    mutationFn: () =>
      termFn({
        data: {
          class_id: termClassId === "all" ? undefined : termClassId,
          term: term || undefined,
          year: year ? Number(year) : undefined,
        },
      }),
    onSuccess: (r: any) => {
      toast.success(`Processed ${r.studentsProcessed} student(s), ${r.componentsConsidered} fee component(s) applied.`);
      done({
        label: "Term fees",
        note: `${r.studentsProcessed} student(s) processed, ${r.componentsConsidered} fee component(s) applied.`,
      });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to generate invoices"),
  });

  const busy = structMut.isPending || compMut.isPending || termMut.isPending;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Zap className="w-7 h-7" /> Bulk Generate Invoices
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create invoices for many students at once. Students who already have the invoice are skipped, so it is safe to run again.
          {stats ? ` ${stats.active} active student(s) in your school.` : ""}
        </p>
      </div>

      {result && (
        <Card className="border-green-600/40">
          <CardContent className="py-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium">{result.label} — done</div>
              <div className="text-muted-foreground">
                {result.note ??
                  `${result.created ?? 0} invoice(s) created, ${result.skipped ?? 0} skipped (already invoiced).`}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Due date (optional)</CardTitle>
          <CardDescription>Applied to invoices created from a fee structure or a single fee component.</CardDescription>
        </CardHeader>
        <CardContent>
          <Input type="date" className="max-w-xs" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </CardContent>
      </Card>

      <Tabs defaultValue="structure">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="structure"><Layers className="w-4 h-4 mr-1.5" />Fee structure</TabsTrigger>
          <TabsTrigger value="component"><Coins className="w-4 h-4 mr-1.5" />Class component</TabsTrigger>
          <TabsTrigger value="term"><Zap className="w-4 h-4 mr-1.5" />Whole term</TabsTrigger>
        </TabsList>

        <TabsContent value="structure">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">From a fee structure</CardTitle>
              <CardDescription>One flat fee (e.g. a full term's fee) invoiced to every active student, or just one class.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Fee structure</Label>
                  <Select value={feeId} onValueChange={setFeeId}>
                    <SelectTrigger><SelectValue placeholder="Choose fee structure" /></SelectTrigger>
                    <SelectContent>
                      {(fees as any[]).map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name} — {f.term} {f.year} ({kes(f.amount)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Class</Label>
                  <Select value={structClassId} onValueChange={setStructClassId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All classes</SelectItem>
                      {(classes as any[]).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{className.get(c.id)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                disabled={busy || !feeId}
                onClick={() => {
                  if (confirm("Generate invoices for the selected students now?")) structMut.mutate();
                }}
              >
                {structMut.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
                Generate invoices
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="component">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">From one class fee component</CardTitle>
              <CardDescription>Invoice a single item (tuition, boarding, transport or meals) to every active student in that class.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Fee component</Label>
                <Select value={componentId} onValueChange={setComponentId}>
                  <SelectTrigger><SelectValue placeholder="Choose class fee component" /></SelectTrigger>
                  <SelectContent>
                    {(components as any[]).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {className.get(c.class_id) ?? "Class"} · {c.component} · {c.term} {c.year} ({kes(c.amount)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                disabled={busy || !componentId}
                onClick={() => {
                  if (confirm("Generate invoices for every active student in this class?")) compMut.mutate();
                }}
              >
                {compMut.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
                Generate invoices
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="term">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Whole term (all components)</CardTitle>
              <CardDescription>
                Applies every configured fee component to each active student in the class (or all classes). Leave term and year blank to use the school's current term.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label>Class</Label>
                  <Select value={termClassId} onValueChange={setTermClassId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All classes</SelectItem>
                      {(classes as any[]).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{className.get(c.id)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Term</Label>
                  <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Term 1" />
                </div>
                <div>
                  <Label>Year</Label>
                  <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder={String(CURRENT_YEAR)} />
                </div>
              </div>
              <Button
                disabled={busy}
                onClick={() => {
                  if (confirm("Generate term invoices now?")) termMut.mutate();
                }}
              >
                {termMut.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
                Generate term invoices
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
