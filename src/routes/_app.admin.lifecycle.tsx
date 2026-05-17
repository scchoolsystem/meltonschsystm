import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/admin/lifecycle")({
  component: LifecyclePage,
});

function LifecyclePage() {
  const { isAdmin } = useAuth();
  const { data = [], isLoading } = useQuery({
    queryKey: ["lifecycle-events"],
    queryFn: async () => {
      const { data } = await supabase
        .from("lifecycle_events")
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
        <h1 className="text-3xl font-bold">Lifecycle Events</h1>
        <p className="text-sm text-muted-foreground mt-1">Status transitions for students, staff and other records</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Recent Transitions</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-40 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : data.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No lifecycle events recorded.</div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Target ID</TableHead>
                    <TableHead>From → To</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Actor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-sm">{e.target_type}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{e.target_id?.slice(0, 8) ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {e.from_status ? <Badge variant="outline">{e.from_status}</Badge> : <span className="text-muted-foreground">—</span>}
                        <span className="mx-2 text-muted-foreground">→</span>
                        <Badge>{e.to_status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[260px] truncate" title={e.reason ?? ""}>{e.reason ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{e.actor_id ? e.actor_id.slice(0, 8) : "—"}</TableCell>
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
