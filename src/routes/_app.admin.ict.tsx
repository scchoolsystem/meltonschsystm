import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ShieldAlert, Lock, Settings } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_app/admin/ict")({ component: IctAdminPage });

const STATUS_STYLE: Record<string, string> = {
  open: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  in_progress: "bg-amber-500/15 text-amber-700 border-amber-500/30",
};

function IctAdminPage() {
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("ict_admin");
  if (!can) return (
    <div className="p-6 flex items-center gap-2 text-muted-foreground">
      <ShieldAlert className="w-5 h-5" /> You do not have access to this page.
    </div>
  );
  return <IctAdminInner />;
}

function IctAdminInner() {
  const { data: features = [], isLoading: fLoading } = useQuery({
    queryKey: ["ict-features"],
    queryFn: async () => {
      const { data: schoolId } = await supabase.rpc("my_school_id");
      if (!schoolId) return [];
      const { data } = await (supabase as any).from("school_features").select("feature_key,enabled,platform_enabled").eq("school_id", schoolId);
      return data ?? [];
    },
  });

  const { data: members = [], isLoading: mLoading } = useQuery({
    queryKey: ["ict-members"],
    queryFn: async () => {
      const { data: schoolId } = await supabase.rpc("my_school_id");
      if (!schoolId) return [];
      const { data: sm } = await supabase.from("school_members").select("id,user_id,created_at").eq("school_id", schoolId as any).order("created_at", { ascending: false });
      const rows = sm ?? [];
      const userIds = rows.map((r: any) => r.user_id);
      if (userIds.length === 0) return [];
      const [{ data: profiles }, { data: userRoles }] = await Promise.all([
        supabase.from("profiles").select("id,full_name").in("id", userIds),
        supabase.from("user_roles").select("user_id,role").in("user_id", userIds),
      ]);
      return rows.map((r: any) => ({
        ...r,
        full_name: (profiles ?? []).find((p: any) => p.id === r.user_id)?.full_name ?? "—",
        roles: (userRoles ?? []).filter((ur: any) => ur.user_id === r.user_id).map((ur: any) => ur.role),
      }));
    },
  });

  const { data: tickets = [], isLoading: tLoading } = useQuery({
    queryKey: ["ict-tickets"],
    queryFn: async () => {
      const { data: schoolId } = await supabase.rpc("my_school_id");
      if (!schoolId) return [];
      const { data } = await supabase.from("support_tickets").select("id,subject,status,category,created_at").eq("school_id", schoolId as any).in("status", ["open", "in_progress"]).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Settings className="w-7 h-7" />ICT Admin</h1>
        <p className="text-sm text-muted-foreground mt-1">Feature flags, active users, and open support tickets for your school</p>
      </div>

      <Tabs defaultValue="features">
        <TabsList>
          <TabsTrigger value="features">Feature Flags</TabsTrigger>
          <TabsTrigger value="users">Active Users</TabsTrigger>
          <TabsTrigger value="tickets">Support Tickets <Badge variant="secondary" className="ml-2">{(tickets as any[]).length}</Badge></TabsTrigger>
        </TabsList>

        <TabsContent value="features">
          <Card><CardHeader><CardTitle className="text-base">School Feature Flags (read-only)</CardTitle></CardHeader>
            <CardContent>
              {fLoading ? <Loader2 className="animate-spin mx-auto" /> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Feature</TableHead><TableHead>Enabled for School</TableHead><TableHead>Available on Plan</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(features as any[]).length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No feature configuration found.</TableCell></TableRow>}
                    {(features as any[]).map((f: any) => (
                      <TableRow key={f.feature_key}>
                        <TableCell className="font-medium capitalize">{f.feature_key.replace(/_/g, " ")}</TableCell>
                        <TableCell><Badge variant={f.enabled ? "default" : "outline"}>{f.enabled ? "Enabled" : "Disabled"}</Badge></TableCell>
                        <TableCell>
                          {f.platform_enabled ? <Badge variant="secondary">Yes</Badge> : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock className="w-3 h-3" />Not in plan</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <p className="text-xs text-muted-foreground mt-3">This view is read-only. Feature toggles are managed by your school admin under Settings → Modules.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card><CardHeader><CardTitle className="text-base">Active Users ({(members as any[]).length})</CardTitle></CardHeader>
            <CardContent>
              {mLoading ? <Loader2 className="animate-spin mx-auto" /> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Role(s)</TableHead><TableHead>Member Since</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(members as any[]).length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No members found.</TableCell></TableRow>}
                    {(members as any[]).map((m: any) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.full_name}</TableCell>
                        <TableCell className="flex gap-1 flex-wrap">{m.roles.length ? m.roles.map((r: string) => <Badge key={r} variant="outline" className="capitalize">{r}</Badge>) : <span className="text-xs text-muted-foreground">No role</span>}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{m.created_at ? formatDistanceToNow(new Date(m.created_at), { addSuffix: true }) : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <p className="text-xs text-muted-foreground mt-3">Last sign-in is not available without admin API access; showing membership date instead.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tickets">
          <Card><CardHeader><CardTitle className="text-base">Open / In-Progress Support Tickets</CardTitle></CardHeader>
            <CardContent>
              {tLoading ? <Loader2 className="animate-spin mx-auto" /> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Subject</TableHead><TableHead>Category</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(tickets as any[]).length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No open tickets. All clear!</TableCell></TableRow>}
                    {(tickets as any[]).map((t: any) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.subject}</TableCell>
                        <TableCell className="capitalize">{t.category}</TableCell>
                        <TableCell><Badge className={STATUS_STYLE[t.status] ?? ""} variant="outline">{t.status}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
