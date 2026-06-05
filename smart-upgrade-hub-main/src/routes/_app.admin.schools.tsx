import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTenant } from "@/hooks/use-tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, ExternalLink, Info } from "lucide-react";

export const Route = createFileRoute("/_app/admin/schools")({
  component: SchoolsPage,
});

function SchoolsPage() {
  const { roles } = useAuth();
  const { school: current } = useTenant();
  const isSuperAdmin = roles?.includes("super_admin");

  const { data: schools, isLoading } = useQuery({
    queryKey: ["schools"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardHeader><CardTitle>Schools</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Only super admins can view this page.</p></CardContent>
      </Card>
    );
  }

  const rootDomain = "smartdev.co.ke";

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Building2 className="h-6 w-6" /> Schools (read-only)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          School onboarding and feature toggles are now managed by the platform admin.
        </p>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-6 flex items-start gap-3">
          <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">Need to add a school or change a plan?</p>
            <p className="text-muted-foreground mt-1">
              Contact your platform administrator. The Platform Admin Portal lives at{" "}
              <a href="https://admin.smartdev.co.ke" target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                admin.smartdev.co.ke <ExternalLink className="h-3 w-3" />
              </a>
              .
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Schools on this platform</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Portal URL</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(schools ?? []).map((s: any) => {
                  const url = `https://${s.slug}.${rootDomain}`;
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {s.primary_color && <span className="inline-block w-3 h-3 rounded-full" style={{ background: s.primary_color }} />}
                          <span className="font-medium">{s.name}</span>
                          {current?.id === s.id && <Badge variant="secondary" className="ml-1">current</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <a href={url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-sm">
                          {s.slug}.{rootDomain} <ExternalLink className="h-3 w-3" />
                        </a>
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.status === "active" ? "default" : "destructive"}>{s.status}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
