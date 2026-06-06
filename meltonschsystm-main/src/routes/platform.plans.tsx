import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Package, Plus } from "lucide-react";

export const Route = createFileRoute("/platform/plans")({
  component: PlatformPlans,
});

function PlatformPlans() {
  const { roles } = useAuth();
  const qc = useQueryClient();
  const isOwner = roles.includes("platform_owner");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ slug: "", name: "", monthly_fee: "0", description: "" });

  const { data: plans } = useQuery({
    queryKey: ["all-plans"],
    queryFn: async () => {
      const { data } = await supabase.from("subscription_plans").select("*").order("monthly_fee");
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const slug = form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
      if (!slug || !form.name.trim()) throw new Error("Slug and name required");
      const { error } = await supabase.from("subscription_plans").insert({
        slug, name: form.name.trim(),
        monthly_fee: parseFloat(form.monthly_fee) || 0,
        description: form.description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plan created");
      setOpen(false);
      setForm({ slug: "", name: "", monthly_fee: "0", description: "" });
      qc.invalidateQueries({ queryKey: ["all-plans"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("subscription_plans").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["all-plans"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Package className="h-6 w-6" /> Subscription plans
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Define the plans you sell to schools.</p>
        </div>
        {isOwner && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New plan</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create plan</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Slug</Label><Input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="enterprise" /></div>
                <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Enterprise" /></div>
                <div><Label>Monthly fee (KES)</Label><Input type="number" value={form.monthly_fee} onChange={e => setForm({ ...form, monthly_fee: e.target.value })} /></div>
                <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>All plans</CardTitle><CardDescription>Inactive plans are hidden from school assignment.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Monthly fee</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(plans ?? []).map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell><Badge variant="outline">{p.slug}</Badge></TableCell>
                  <TableCell>KES {Number(p.monthly_fee).toLocaleString()}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-md truncate">{p.description ?? "—"}</TableCell>
                  <TableCell>
                    <Switch
                      checked={p.is_active}
                      onCheckedChange={(v) => isOwner && toggleActive.mutate({ id: p.id, is_active: v })}
                      disabled={!isOwner}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
