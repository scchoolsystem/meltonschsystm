import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { bulkGenerateInvoices } from "@/lib/finance.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/finance/generate")({ component: () => (<FeatureGate feature="finance"><Page /></FeatureGate>) });

function Page() {
  const generate = useServerFn(bulkGenerateInvoices);
  const [feeId, setFeeId] = useState("");
  const [classId, setClassId] = useState("all");
  const [due, setDue] = useState("");

  const { data: fees = [] } = useQuery({
    queryKey: ["fees-min"],
    queryFn: async () =>
      (await supabase.from("fee_structures").select("id,name,term,year,amount,level").order("year", { ascending: false })).data ?? [],
  });
  const { data: classes = [] } = useQuery({
    queryKey: ["classes-min"],
    queryFn: async () => (await supabase.from("classes").select("id,name,level,year").order("name")).data ?? [],
  });

  const m = useMutation({
    mutationFn: async () =>
      generate({
        data: {
          fee_structure_id: feeId,
          class_id: classId === "all" ? undefined : classId,
          due_date: due || undefined,
        },
      }),
    onSuccess: (r) => toast.success(`Created ${r.created} invoice(s), skipped ${r.skipped} (already invoiced).`),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bulk Invoice Generation</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Issue invoices to every active student for a fee structure. Students already invoiced for the same structure are skipped.
        </p>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Zap className="w-4 h-4" /> New batch</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Fee Structure</Label>
            <Select value={feeId} onValueChange={setFeeId}>
              <SelectTrigger><SelectValue placeholder="Choose fee structure" /></SelectTrigger>
              <SelectContent>
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
          <div>
            <Label>Due Date (optional)</Label>
            <Input type="date" value={due} onChange={e => setDue(e.target.value)} />
          </div>
          <Button disabled={!feeId || m.isPending} onClick={() => m.mutate()}>
            {m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
            Generate Invoices
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
