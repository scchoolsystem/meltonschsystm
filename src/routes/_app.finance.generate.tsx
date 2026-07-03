import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { bulkGenerateInvoices, bulkGenerateComponentInvoices } from "@/lib/finance.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/finance/generate")({ component: () => (<FeatureGate feature="finance"><Page /></FeatureGate>) });

function Page() {
  const [source, setSource] = useState<"structure" | "component">("structure");
  const generateFromStructure = useServerFn(bulkGenerateInvoices);
  const generateFromComponent = useServerFn(bulkGenerateComponentInvoices);

  const [feeId, setFeeId] = useState("");
  const [classId, setClassId] = useState("all");
  const [componentId, setComponentId] = useState("");
  const [due, setDue] = useState("");

  const { data: fees = [] } = useQuery({
    queryKey: ["fees-min"],
    queryFn: async () =>
      (await supabase.from("fee_structures").select("id,name,term,year,amount,level").order("year", { ascending: false })).data ?? [],
  });
  const { data: classes = [] } = useQuery({
    queryKey: ["classes-min"],
    queryFn: async () => (await supabase.from("classes").select("id,name,level,year,stream").order("name")).data ?? [],
  });
  const { data: components = [] } = useQuery({
    queryKey: ["class-fee-components-min"],
    queryFn: async () =>
      (await supabase
        .from("class_fee_components")
        .select("id,class_id,component,amount,term,year")
        .order("year", { ascending: false })
        .order("term")).data ?? [],
  });

  const classNameById = new Map((classes as any[]).map((c) => [c.id, `${c.name}${c.stream ? ` – ${c.stream}` : ""} (${c.level} ${c.year})`]));

  const structureMutation = useMutation({
    mutationFn: async () =>
      generateFromStructure({
        data: {
          fee_structure_id: feeId,
          class_id: classId === "all" ? undefined : classId,
          due_date: due || undefined,
        },
      }),
    onSuccess: (r) => toast.success(`Created ${r.created} invoice(s), skipped ${r.skipped} (already invoiced).`),
    onError: (e: any) => toast.error(e.message),
  });

  const componentMutation = useMutation({
    mutationFn: async () =>
      generateFromComponent({
        data: {
          class_fee_component_id: componentId,
          due_date: due || undefined,
        },
      }),
    onSuccess: (r) => toast.success(`Created ${r.created} invoice(s), skipped ${r.skipped} (already invoiced).`),
    onError: (e: any) => toast.error(e.message),
  });

  const isComponent = source === "component";
  const m = isComponent ? componentMutation : structureMutation;
  const canGenerate = isComponent ? !!componentId : !!feeId;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bulk Invoice Generation</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Issue invoices to every active student for a fee structure or a class fee component. Students already
          invoiced for the same source are skipped.
        </p>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Zap className="w-4 h-4" /> New batch</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Source</Label>
            <Tabs value={source} onValueChange={(v) => setSource(v as "structure" | "component")}>
              <TabsList className="grid grid-cols-2">
                <TabsTrigger value="structure">Fee Structure</TabsTrigger>
                <TabsTrigger value="component">Class Fee Component</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {!isComponent ? (
            <>
              <div>
                <Label>Fee Structure</Label>
                <Select value={feeId} onValueChange={setFeeId}>
                  <SelectTrigger><SelectValue placeholder="Choose fee structure" /></SelectTrigger>
                  <SelectContent>
                    {(fees as any[]).length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No fee structures yet.</div>
                    )}
                    {(fees as any[]).map(f => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name} – {f.term} {f.year} ({f.level}) – KES {Number(f.amount).toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Class (optional)</Label>
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All active students</SelectItem>
                    {(classes as any[]).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name} – {c.level} {c.year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <div>
              <Label>Fee Component</Label>
              <Select value={componentId} onValueChange={setComponentId}>
                <SelectTrigger><SelectValue placeholder="Choose fee component" /></SelectTrigger>
                <SelectContent>
                  {(components as any[]).length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No fee components yet — add one on the Class Fees page.
                    </div>
                  )}
                  {(components as any[]).map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {classNameById.get(c.class_id) ?? "Unknown class"} – {c.component} – {c.term} {c.year} – KES {Number(c.amount).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Invoices only that component to active students in the class it was set up for.
              </p>
            </div>
          )}

          <div>
            <Label>Due Date (optional)</Label>
            <Input type="date" value={due} onChange={e => setDue(e.target.value)} />
          </div>
          <Button disabled={!canGenerate || m.isPending} onClick={() => m.mutate()}>
            {m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
            Generate Invoices
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
