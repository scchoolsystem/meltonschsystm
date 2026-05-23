import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/use-tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_app/admin/grading")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const { school } = useTenant();
  const schoolId = school?.id;

  const { data: scales = [] } = useQuery({
    enabled: !!schoolId,
    queryKey: ["grading-scales", schoolId],
    queryFn: async () => (await supabase.from("grading_scales").select("*").eq("school_id", schoolId!).order("created_at")).data ?? [],
  });
  const defaultScale = (scales as any[]).find(s => s.is_default) ?? (scales as any[])[0];

  const { data: bands = [], refetch } = useQuery({
    enabled: !!defaultScale,
    queryKey: ["grading-bands", defaultScale?.id],
    queryFn: async () => (await supabase.from("grading_bands").select("*").eq("scale_id", defaultScale.id).order("min_score", { ascending: false })).data ?? [],
  });

  const [newRow, setNewRow] = useState({ min_score: 0, max_score: 0, grade: "", remarks: "" });

  const addMut = useMutation({
    mutationFn: async () => {
      if (!defaultScale) throw new Error("No scale");
      if (!schoolId) throw new Error("No school");
      const { error } = await supabase.from("grading_bands").insert({
        ...newRow,
        scale_id: defaultScale.id,
        school_id: schoolId,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Band added"); setNewRow({ min_score: 0, max_score: 0, grade: "", remarks: "" }); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("grading_bands").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); refetch(); },
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Grading Scale</h1>
        <p className="text-sm text-muted-foreground">Define grade bands for the default school grading scale. Used by Mark Entry and Report Cards.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">{defaultScale?.name ?? "No default scale"}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-24">Min</TableHead><TableHead className="w-24">Max</TableHead>
              <TableHead className="w-24">Grade</TableHead><TableHead>Remarks</TableHead>
              <TableHead className="w-16" />
            </TableRow></TableHeader>
            <TableBody>
              {(bands as any[]).map(b => (
                <TableRow key={b.id}>
                  <TableCell>{b.min_score}</TableCell>
                  <TableCell>{b.max_score}</TableCell>
                  <TableCell className="font-bold">{b.grade}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{b.remarks}</TableCell>
                  <TableCell><Button size="icon" variant="ghost" onClick={() => delMut.mutate(b.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell><Input type="number" value={newRow.min_score} onChange={e => setNewRow(r => ({ ...r, min_score: Number(e.target.value) }))} /></TableCell>
                <TableCell><Input type="number" value={newRow.max_score} onChange={e => setNewRow(r => ({ ...r, max_score: Number(e.target.value) }))} /></TableCell>
                <TableCell><Input value={newRow.grade} onChange={e => setNewRow(r => ({ ...r, grade: e.target.value }))} /></TableCell>
                <TableCell><Input value={newRow.remarks} onChange={e => setNewRow(r => ({ ...r, remarks: e.target.value }))} /></TableCell>
                <TableCell><Button size="icon" onClick={() => addMut.mutate()} disabled={!newRow.grade}><Plus className="w-4 h-4" /></Button></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
