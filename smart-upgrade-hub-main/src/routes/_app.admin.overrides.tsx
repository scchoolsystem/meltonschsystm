import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/admin/overrides")({
  component: OverridesPage,
});

function OverridesPage() {
  const { isAdmin } = useAuth();
  const { data = [], isLoading } = useQuery({
    queryKey: ["override-log"],
    queryFn: async () => {
      const { data } = await supabase
        .from("override_log")
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
        <h1 className="text-3xl font-bold">Override Log</h1>
        <p className="text-sm text-muted-foreground mt-1">Privileged overrides of locked or restricted fields</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Recent Overrides</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-40 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : data.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No overrides recorded.</div>
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
                    <TableHead>Reason</TableHead>
                    <TableHead>Actor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-sm">{e.resource}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{e.resource_id?.slice(0, 12) ?? "—"}</TableCell>
                      <TableCell className="font-medium text-sm">{e.field}</TableCell>
                      <TableCell className="text-xs max-w-[300px]">
                        <span className="text-muted-foreground line-through" title={e.old_value ?? ""}>{(e.old_value ?? "—").slice(0, 30)}</span>
                        <span className="mx-1">→</span>
                        <span className="font-mono" title={e.new_value ?? ""}>{(e.new_value ?? "—").slice(0, 30)}</span>
                      </TableCell>
                      <TableCell className="text-sm max-w-[260px]">
                        <Badge variant="destructive" className="mb-1">Override</Badge>
                        <div className="text-xs text-muted-foreground truncate" title={e.reason}>{e.reason}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{e.actor_id?.slice(0, 8) ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
