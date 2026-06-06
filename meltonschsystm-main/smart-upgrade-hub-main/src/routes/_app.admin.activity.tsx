import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/admin/activity")({
  component: ActivityPage,
});

function ActivityPage() {
  const { isAdmin } = useAuth();
  const { data = [], isLoading } = useQuery({
    queryKey: ["activity-logs"],
    queryFn: async () => {
      const { data } = await supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(200);
      return data ?? [];
    },
    enabled: isAdmin,
  });

  if (!isAdmin) return <div className="p-6"><Card><CardContent className="py-12 text-center text-muted-foreground">Admins only.</CardContent></Card></div>;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Activity Log</h1>
        <p className="text-sm text-muted-foreground mt-1">Last 200 system events</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-40 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : data.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No activity recorded yet.</div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Entity ID</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((l: any) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</TableCell>
                      <TableCell className="font-medium">{l.action}</TableCell>
                      <TableCell className="text-sm">{l.entity ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{l.entity_id ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{l.user_id ? l.user_id.slice(0, 8) : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate" title={l.metadata ? JSON.stringify(l.metadata) : ""}>
                        {l.metadata ? JSON.stringify(l.metadata) : "—"}
                      </TableCell>
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
