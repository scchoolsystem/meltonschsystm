import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTenant } from "@/hooks/use-tenant";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Building2, Plus, ExternalLink, Globe } from "lucide-react";

export const Route = createFileRoute("/_app/admin/schools")({
  component: SchoolsPage,
});

function SchoolsPage() {
  const { roles } = useAuth();
  const { school: current } = useTenant();
  const qc = useQueryClient();
  const isSuperAdmin = roles?.includes("super_admin");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ slug: "", name: "", motto: "", primary_color: "#0ea5e9", email: "", phone: "" });

  const { data: schools, isLoading } = useQuery({
    queryKey: ["schools"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: members } = useQuery({
    queryKey: ["school-members-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("school_members").select("school_id");
      const counts: Record<string, number> = {};
      (data ?? []).forEach((m: any) => { counts[m.school_id] = (counts[m.school_id] || 0) + 1; });
      return counts;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const slug = form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
      if (!slug || !form.name.trim()) throw new Error("Slug and name are required");
      const { error } = await supabase.from("schools").insert({
        slug,
        name: form.name.trim(),
        motto: form.motto || null,
        primary_color: form.primary_color || null,
        email: form.email || null,
        phone: form.phone || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("School created");
      setOpen(false);
      setForm({ slug: "", name: "", motto: "", primary_color: "#0ea5e9", email: "", phone: "" });
      qc.invalidateQueries({ queryKey: ["schools"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const next = status === "active" ? "suspended" : "active";
      const { error } = await supabase.from("schools").update({ status: next }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["schools"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardHeader><CardTitle>Schools</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Only super admins can manage schools.</p></CardContent>
      </Card>
    );
  }

  const rootDomain = "erp.smartdev.co.ke";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Building2 className="h-6 w-6" /> Schools
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Each school is a fully isolated tenant. Add a school here, then add the matching subdomain in Project Settings → Domains.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New school</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a school</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Slug (subdomain)</Label>
                <Input
                  value={form.slug}
                  onChange={e => setForm({ ...form, slug: e.target.value })}
                  placeholder="greenfield"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Portal URL: <code>{form.slug || "[slug]"}.{rootDomain}</code>
                </p>
              </div>
              <div>
                <Label>School name</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Greenfield Academy" />
              </div>
              <div>
                <Label>Motto (optional)</Label>
                <Input value={form.motto} onChange={e => setForm({ ...form, motto: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Primary color</Label>
                  <Input type="color" value={form.primary_color} onChange={e => setForm({ ...form, primary_color: e.target.value })} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending ? "Creating..." : "Create school"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="h-4 w-4" />DNS setup (one-time)</CardTitle>
          <CardDescription>At your domain registrar (smartdev.co.ke):</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-1 font-mono bg-muted/50 p-3 rounded">
          <div>A &nbsp;&nbsp; erp &nbsp;&nbsp;&nbsp;&nbsp; → 185.158.133.1</div>
          <div>A &nbsp;&nbsp; *.erp &nbsp;&nbsp; → 185.158.133.1 &nbsp; (wildcard for all school subdomains)</div>
          <div className="text-xs text-muted-foreground font-sans mt-2">
            Then in <strong>Project Settings → Domains</strong>, add each school's full subdomain (e.g. <code>greenfield.erp.smartdev.co.ke</code>) so Lovable issues an SSL cert for it.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>All schools</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Portal URL</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                        {s.motto && <p className="text-xs text-muted-foreground">{s.motto}</p>}
                      </TableCell>
                      <TableCell>
                        <a href={url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-sm">
                          {s.slug}.{rootDomain} <ExternalLink className="h-3 w-3" />
                        </a>
                      </TableCell>
                      <TableCell>{members?.[s.id] ?? 0}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === "active" ? "default" : "destructive"}>{s.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => toggleStatus.mutate({ id: s.id, status: s.status })}>
                          {s.status === "active" ? "Suspend" : "Activate"}
                        </Button>
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
