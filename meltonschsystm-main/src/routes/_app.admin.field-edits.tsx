import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/admin/field-edits")({
  component: FieldEditsPage,
});

function FieldEditsPage() {
  const { isAdmin } = useAuth();
  const { data = [], isLoading } = useQuery({
    queryKey: ["field-edit-audit"],
    queryFn: async () => {
      const { data } = await supabase
        .from("field_edit_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
    enabled: isAdmin,
  });

  if (!isAdmin)
    return (
      <div className="p-6">
        <Card><CardContent className="py-12 text-center text-muted-foreground">Admins only.</CardContent></Card>
      </div>
    );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Field Edit Audit</h1>
        <p className="text-sm text-muted-foreground mt-1">Per-field change history for protected resources</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Recent Field Edits</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-40 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : data.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No field edits recorded.</div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>Resource ID</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead>Old → New</TableHead>
                    <TableHead>Override</TableHead>
                    <TableHead>Actor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((e: any) => {
                    const oldStr = e.old_value === null || e.old_value === undefined ? "—" : JSON.stringify(e.old_value);
                    const newStr = e.new_value === null || e.new_value === undefined ? "—" : JSON.stringify(e.new_value);
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</TableCell>
                        <TableCell className="text-sm">{e.resource}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{e.resource_id?.slice(0, 12) ?? "—"}</TableCell>
                        <TableCell className="font-medium text-sm">{e.field ?? "—"}</TableCell>
                        <TableCell className="text-xs max-w-[300px]">
                          <span className="text-muted-foreground line-through" title={oldStr}>{oldStr.slice(0, 30)}</span>
                          <span className="mx-1">→</span>
                          <span className="font-mono" title={newStr}>{newStr.slice(0, 30)}</span>
                        </TableCell>
                        <TableCell>{e.override_used ? <Badge variant="destructive">Override</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <div className="font-mono">{e.actor_id ? e.actor_id.slice(0, 8) : "—"}</div>
                          {e.actor_role && <div className="text-[10px]">{e.actor_role}</div>}
                        </TableCell>
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
