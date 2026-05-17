import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { provisionSchoolAdmin } from "@/lib/school-admin.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Plus, Save, KeyRound, Copy } from "lucide-react";

export const Route = createFileRoute("/platform/schools/$id")({
  component: PlatformSchoolDetail,
});

const FEATURE_LABELS: Record<string, string> = {
  timetable: "Timetable",
  attendance: "Attendance",
  academics: "Academics & Exams",
  finance: "Finance & Billing",
  boarding: "Boarding",
  kitchen: "Kitchen",
  library: "Library",
  clinic: "Clinic",
  transport: "Transport",
  security: "Security",
  discipline: "Discipline",
  announcements: "Announcements",
  portals: "Parent / Student portals",
};

function PlatformSchoolDetail() {
  const { id } = Route.useParams();
  const { roles } = useAuth();
  const qc = useQueryClient();
  const isOwner = roles.includes("platform_owner");
  const provision = useServerFn(provisionSchoolAdmin);

  const [invOpen, setInvOpen] = useState(false);
  const [invForm, setInvForm] = useState({
    amount: "", period_start: new Date().toISOString().slice(0, 10),
    period_end: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    notes: "",
  });

  const [edit, setEdit] = useState({
    name: "", slug: "", motto: "", email: "", phone: "", address: "", primary_color: "#0ea5e9",
  });
  const [credentials, setCredentials] = useState<{ email: string; password: string; portal_url: string } | null>(null);

  const { data: school } = useQuery({
    queryKey: ["platform-school", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (school) {
      setEdit({
        name: school.name ?? "",
        slug: school.slug ?? "",
        motto: school.motto ?? "",
        email: school.email ?? "",
        phone: school.phone ?? "",
        address: school.address ?? "",
        primary_color: school.primary_color ?? "#0ea5e9",
      });
    }
  }, [school]);

  const { data: plans } = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: async () => {
      const { data } = await supabase.from("subscription_plans").select("*").eq("is_active", true).order("monthly_fee");
      return data ?? [];
    },
  });

  const { data: subscription } = useQuery({
    queryKey: ["school-subscription", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("school_subscriptions")
        .select("*, subscription_plans(name, monthly_fee)")
        .eq("school_id", id).maybeSingle();
      return data;
    },
  });

  const { data: features } = useQuery({
    queryKey: ["school-features", id],
    queryFn: async () => {
      const { data } = await supabase.from("school_features").select("*").eq("school_id", id);
      const map: Record<string, { id: string; enabled: boolean }> = {};
      (data ?? []).forEach((f: any) => { map[f.feature_key] = { id: f.id, enabled: f.enabled }; });
      return map;
    },
  });

  const { data: invoices } = useQuery({
    queryKey: ["school-invoices", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_invoices")
        .select("*")
        .eq("school_id", id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const saveInfo = useMutation({
    mutationFn: async () => {
      const slug = edit.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
      if (!slug || !edit.name.trim()) throw new Error("Name and slug are required");
      const { error } = await supabase.from("schools").update({
        name: edit.name.trim(),
        slug,
        motto: edit.motto || null,
        email: edit.email || null,
        phone: edit.phone || null,
        address: edit.address || null,
        primary_color: edit.primary_color || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("School updated");
      qc.invalidateQueries({ queryKey: ["platform-school", id] });
      qc.invalidateQueries({ queryKey: ["platform-schools"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setPlan = useMutation({
    mutationFn: async (planId: string) => {
      if (subscription) {
        const { error } = await supabase
          .from("school_subscriptions").update({ plan_id: planId }).eq("id", subscription.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("school_subscriptions").insert({ school_id: id, plan_id: planId, status: "active" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Plan updated");
      qc.invalidateQueries({ queryKey: ["school-subscription", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleFeature = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const existing = features?.[key];
      if (existing) {
        const { error } = await supabase.from("school_features").update({ enabled }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("school_features").insert({ school_id: id, feature_key: key, enabled });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["school-features", id] }),
    onError: (e: any) => toast.error(e.message),
  });

  const createInvoice = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(invForm.amount);
      if (!amount || amount <= 0) throw new Error("Enter a valid amount");
      const { error } = await supabase.from("platform_invoices").insert({
        school_id: id, amount,
        period_start: invForm.period_start, period_end: invForm.period_end,
        due_date: invForm.due_date, notes: invForm.notes || null,
        invoice_no: "",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice issued");
      setInvOpen(false);
      setInvForm({ ...invForm, amount: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["school-invoices", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetAdmin = useMutation({
    mutationFn: async () => {
      if (!school?.email) throw new Error("School has no contact email. Save one first.");
      return await provision({ data: { school_id: id, email: school.email, full_name: `${school.name} Admin` } });
    },
    onSuccess: (res: any) => {
      setCredentials({ email: res.email, password: res.password, portal_url: res.portal_url });
      toast.success(res.created ? "Admin created" : "Admin password reset");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!school) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const rootDomain = "erp.smartdev.co.ke";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/platform/schools" className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> All schools
          </Link>
          <h1 className="text-2xl font-semibold mt-1 flex items-center gap-3">
            {school.primary_color && <span className="inline-block w-4 h-4 rounded-full" style={{ background: school.primary_color }} />}
            {school.name}
            <Badge variant={school.status === "active" ? "default" : "destructive"}>{school.status}</Badge>
          </h1>
          <a href={`https://${school.slug}.${rootDomain}`} target="_blank" rel="noreferrer"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1 mt-1">
            {school.slug}.{rootDomain} <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>School information</CardTitle>
            <CardDescription>Identity, branding & contact details. Saved changes apply to the school portal immediately.</CardDescription>
          </div>
          {isOwner && (
            <Button size="sm" onClick={() => saveInfo.mutate()} disabled={saveInfo.isPending}>
              <Save className="h-4 w-4 mr-1" /> {saveInfo.isPending ? "Saving..." : "Save"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>School name</Label>
              <Input value={edit.name} disabled={!isOwner} onChange={e => setEdit({ ...edit, name: e.target.value })} />
            </div>
            <div>
              <Label>Slug (subdomain)</Label>
              <Input value={edit.slug} disabled={!isOwner} onChange={e => setEdit({ ...edit, slug: e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">Portal: <code>{edit.slug || "[slug]"}.{rootDomain}</code></p>
            </div>
          </div>
          <div>
            <Label>Motto</Label>
            <Input value={edit.motto} disabled={!isOwner} onChange={e => setEdit({ ...edit, motto: e.target.value })} />
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <Label>Primary color</Label>
              <Input type="color" value={edit.primary_color} disabled={!isOwner}
                onChange={e => setEdit({ ...edit, primary_color: e.target.value })} />
            </div>
            <div>
              <Label>Contact email</Label>
              <Input type="email" value={edit.email} disabled={!isOwner}
                onChange={e => setEdit({ ...edit, email: e.target.value })} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={edit.phone} disabled={!isOwner} onChange={e => setEdit({ ...edit, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Address</Label>
            <Textarea value={edit.address} disabled={!isOwner} onChange={e => setEdit({ ...edit, address: e.target.value })} rows={2} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>School super-admin</CardTitle>
            <CardDescription>
              The contact email above logs in as the school's super-admin. Use this to (re)issue a password — share it with them privately.
            </CardDescription>
          </div>
          {isOwner && (
            <Button size="sm" variant="outline" onClick={() => resetAdmin.mutate()} disabled={resetAdmin.isPending}>
              <KeyRound className="h-4 w-4 mr-1" />
              {resetAdmin.isPending ? "Working..." : "Issue / reset password"}
            </Button>
          )}
        </CardHeader>
        {credentials && (
          <CardContent>
            <div className="rounded border bg-muted/40 p-3 space-y-2 text-sm">
              <div className="font-medium">Share these credentials with the school admin</div>
              <CopyRow label="Portal" value={credentials.portal_url} />
              <CopyRow label="Email" value={credentials.email} />
              <CopyRow label="Password" value={credentials.password} mono />
              <p className="text-xs text-muted-foreground">This password will not be shown again. Copy it now.</p>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
            <CardDescription>Current plan billed monthly.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Plan</Label>
              <Select value={subscription?.plan_id ?? ""} onValueChange={(v) => isOwner && setPlan.mutate(v)} disabled={!isOwner}>
                <SelectTrigger><SelectValue placeholder="Select plan..." /></SelectTrigger>
                <SelectContent>
                  {(plans ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — KES {Number(p.monthly_fee).toLocaleString()}/mo
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {subscription && (
              <p className="text-xs text-muted-foreground">
                Status: <strong>{subscription.status}</strong> · Period ends {new Date(subscription.current_period_end).toLocaleDateString()}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Feature modules</CardTitle>
            <CardDescription>Toggle which modules this school can use. Core (students, staff, classes) is always on.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(FEATURE_LABELS).map(([key, label]) => {
              const enabled = features?.[key]?.enabled ?? true;
              return (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm">{label}</span>
                  <Switch checked={enabled} onCheckedChange={(v) => isOwner && toggleFeature.mutate({ key, enabled: v })} disabled={!isOwner} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Billing history</CardTitle>
            <CardDescription>Platform invoices for this school.</CardDescription>
          </div>
          {isOwner && (
            <Dialog open={invOpen} onOpenChange={setInvOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New invoice</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Issue invoice</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Amount (KES)</Label>
                    <Input type="number" value={invForm.amount} onChange={e => setInvForm({ ...invForm, amount: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Period start</Label>
                      <Input type="date" value={invForm.period_start} onChange={e => setInvForm({ ...invForm, period_start: e.target.value })} />
                    </div>
                    <div>
                      <Label>Period end</Label>
                      <Input type="date" value={invForm.period_end} onChange={e => setInvForm({ ...invForm, period_end: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label>Due date</Label>
                    <Input type="date" value={invForm.due_date} onChange={e => setInvForm({ ...invForm, due_date: e.target.value })} />
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Textarea value={invForm.notes} onChange={e => setInvForm({ ...invForm, notes: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setInvOpen(false)}>Cancel</Button>
                  <Button onClick={() => createInvoice.mutate()} disabled={createInvoice.isPending}>
                    {createInvoice.isPending ? "Issuing..." : "Issue invoice"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoices ?? []).map((i: any) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.invoice_no}</TableCell>
                  <TableCell className="text-xs">{i.period_start} → {i.period_end}</TableCell>
                  <TableCell>KES {Number(i.amount).toLocaleString()}</TableCell>
                  <TableCell>KES {Number(i.paid).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{i.due_date ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={i.status === "paid" ? "default" : i.status === "partial" ? "secondary" : "destructive"}>
                      {i.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {(!invoices || invoices.length === 0) && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">No invoices yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function CopyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <code className={`flex-1 px-2 py-1 rounded bg-background border text-xs ${mono ? "font-mono" : ""}`}>{value}</code>
      <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied"); }}>
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}
