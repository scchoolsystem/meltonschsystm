import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { provisionSchoolAdmin } from "@/lib/school-admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, Plus, ExternalLink, Settings, KeyRound, Trash2, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";

export const KENYA_COUNTIES = [
  "Baringo","Bomet","Bungoma","Busia","Elgeyo-Marakwet","Embu","Garissa","Homa Bay",
  "Isiolo","Kajiado","Kakamega","Kericho","Kiambu","Kilifi","Kirinyaga","Kisii","Kisumu",
  "Kitui","Kwale","Laikipia","Lamu","Machakos","Makueni","Mandera","Marsabit","Meru",
  "Migori","Mombasa","Murang'a","Nairobi","Nakuru","Nandi","Narok","Nyamira","Nyandarua",
  "Nyeri","Samburu","Siaya","Taita-Taveta","Tana River","Tharaka-Nithi","Trans Nzoia",
  "Turkana","Uasin Gishu","Vihiga","Wajir","West Pokot",
];

export const OWNERSHIP_TYPES = [
  { value: "government", label: "Government / Public" },
  { value: "private", label: "Private" },
  { value: "faith_based", label: "Faith-based" },
  { value: "community", label: "Community" },
  { value: "ngo", label: "NGO" },
  { value: "trust", label: "Trust" },
  { value: "other", label: "Other" },
];

export const INSTITUTION_LEVELS = [
  { value: "ecde", label: "ECDE / Pre-primary" },
  { value: "primary", label: "Primary" },
  { value: "junior_secondary", label: "Junior Secondary" },
  { value: "senior_secondary", label: "Senior Secondary" },
  { value: "secondary", label: "Secondary" },
  { value: "tvet", label: "TVET" },
  { value: "college", label: "College" },
  { value: "university", label: "University" },
  { value: "mixed", label: "Mixed levels" },
];

export const CURRICULA = ["CBC", "8-4-4", "IGCSE", "Cambridge", "IB", "Other"];

export function legalStatusBadge(status: string | null | undefined) {
  const s = status ?? "unverified";
  if (s === "verified") return { label: "Verified", variant: "default" as const, Icon: ShieldCheck };
  if (s === "pending_review") return { label: "Pending review", variant: "secondary" as const, Icon: ShieldQuestion };
  if (s === "rejected") return { label: "Rejected", variant: "destructive" as const, Icon: ShieldAlert };
  return { label: "Unverified", variant: "outline" as const, Icon: ShieldQuestion };
}

function PlatformSchoolsLayout() {
  const location = useLocation();
  if (location.pathname !== "/platform/schools") return <Outlet />;
  return <PlatformSchools />;
}

export const Route = createFileRoute("/platform/schools")({
  component: PlatformSchoolsLayout,
});

const FEATURE_KEYS = [
  "academics", "finance", "boarding", "kitchen", "library",
  "clinic", "transport", "security", "discipline", "portals",
];

function PlatformSchools() {
  const { roles } = useAuth();
  const qc = useQueryClient();
  const isOwner = roles.includes("platform_owner");
  const provision = useServerFn(provisionSchoolAdmin);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    slug: "", name: "", email: "", phone: "", primary_color: "#0ea5e9",
    registration_number: "", nemis_code: "", kra_pin: "", county: "", sub_county: "",
    ownership_type: "", institution_level: "", curriculum: "", year_established: "",
    legal_entity_name: "",
  });
  const [credentials, setCredentials] = useState<{ email: string; password: string; portal_url: string; school_name: string } | null>(null);

  const { data: schools, isLoading } = useQuery({
    queryKey: ["platform-schools"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("*, school_subscriptions(plan_id, subscription_plans(name, monthly_fee))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["platform-school-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("school_members").select("school_id");
      const map: Record<string, number> = {};
      (data ?? []).forEach((m: any) => { map[m.school_id] = (map[m.school_id] || 0) + 1; });
      return map;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const slug = form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
      if (!slug || !form.name.trim()) throw new Error("Slug and name are required");
      if (!form.email.trim()) throw new Error("Contact email is required — it becomes the school super-admin");

      const { data: school, error } = await supabase
        .from("schools")
        .insert({
          slug, name: form.name.trim(),
          email: form.email.trim(), phone: form.phone || null,
          primary_color: form.primary_color || null,
          registration_number: form.registration_number.trim() || null,
          nemis_code: form.nemis_code.trim() || null,
          kra_pin: form.kra_pin.trim().toUpperCase() || null,
          county: form.county || null,
          sub_county: form.sub_county.trim() || null,
          ownership_type: (form.ownership_type || null) as any,
          institution_level: (form.institution_level || null) as any,
          curriculum: form.curriculum || null,
          year_established: form.year_established ? Number(form.year_established) : null,
          legal_entity_name: form.legal_entity_name.trim() || null,
        } as any)
        .select()
        .single();
      if (error || !school) throw error ?? new Error("Failed to create school");

      // Default plan = Free
      const { data: freePlan } = await supabase
        .from("subscription_plans").select("id").eq("slug", "free").maybeSingle();
      if (freePlan) {
        await supabase.from("school_subscriptions").insert({
          school_id: school.id, plan_id: freePlan.id, status: "active",
        });
      }
      // Enable all features by default
      await supabase.from("school_features").insert(
        FEATURE_KEYS.map((k) => ({ school_id: school.id, feature_key: k, enabled: true }))
      );

      // Provision the super-admin user from the school's contact email
      const res: any = await provision({ data: {
        school_id: school.id, email: form.email.trim(), full_name: `${form.name.trim()} Admin`,
      }});
      return { school, res };
    },
    onSuccess: ({ school, res }: any) => {
      toast.success("School created");
      setOpen(false);
      setForm({
        slug: "", name: "", email: "", phone: "", primary_color: "#0ea5e9",
        registration_number: "", nemis_code: "", kra_pin: "", county: "", sub_county: "",
        ownership_type: "", institution_level: "", curriculum: "", year_established: "",
        legal_entity_name: "",
      });
      setCredentials({
        email: res.email, password: res.password, portal_url: res.portal_url, school_name: school.name,
      });
      qc.invalidateQueries({ queryKey: ["platform-schools"] });
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
      qc.invalidateQueries({ queryKey: ["platform-schools"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteSchool = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("schools").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("School deleted");
      qc.invalidateQueries({ queryKey: ["platform-schools"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rootDomain = "smartdev.co.ke";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Building2 className="h-6 w-6" /> Schools
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Onboard new schools, toggle features, and manage subscriptions.
          </p>
        </div>
        {isOwner && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New school</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader><DialogTitle>Onboard a new school</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Slug (subdomain)</Label>
                  <Input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="greenfield" />
                  <p className="text-xs text-muted-foreground mt-1">
                    Portal URL: <code>{form.slug || "[slug]"}.{rootDomain}</code>
                  </p>
                </div>
                <div>
                  <Label>School name</Label>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="SMART DEV" />
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
                  <Label>Super-admin email <span className="text-destructive">*</span></Label>
                  <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="principal@school.ac.ke" />
                  <p className="text-xs text-muted-foreground mt-1">
                    This address becomes the school's super-admin. A login password will be generated and shown on the next screen.
                  </p>
                </div>
                <div className="rounded border bg-muted/40 p-3 text-xs space-y-1">
                  <div className="font-medium text-foreground">DNS (one-time setup)</div>
                  <div className="font-mono">A &nbsp; * &nbsp; → 185.158.133.1</div>
                  <div className="text-muted-foreground">
                    Then in <strong>Project Settings → Domains</strong>, add <code>{form.slug || "[slug]"}.{rootDomain}</code> so SSL is issued.
                  </div>
                </div>

                <div className="pt-2 border-t">
                  <p className="text-sm font-medium mb-2">Legal &amp; registration details</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Optional here — can be completed and verified from the school's Manage page. Needed for compliance and official communication (KRA, MOE, county).
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>MOE registration no.</Label>
                      <Input value={form.registration_number} onChange={e => setForm({ ...form, registration_number: e.target.value })} placeholder="e.g. 12/34/567" />
                    </div>
                    <div>
                      <Label>NEMIS code</Label>
                      <Input value={form.nemis_code} onChange={e => setForm({ ...form, nemis_code: e.target.value })} />
                    </div>
                    <div>
                      <Label>KRA PIN</Label>
                      <Input value={form.kra_pin} onChange={e => setForm({ ...form, kra_pin: e.target.value.toUpperCase() })} placeholder="P0XXXXXXXXA" />
                    </div>
                    <div>
                      <Label>Legal entity / proprietor name</Label>
                      <Input value={form.legal_entity_name} onChange={e => setForm({ ...form, legal_entity_name: e.target.value })} />
                    </div>
                    <div>
                      <Label>County</Label>
                      <Select value={form.county} onValueChange={v => setForm({ ...form, county: v })}>
                        <SelectTrigger><SelectValue placeholder="Select county..." /></SelectTrigger>
                        <SelectContent>
                          {KENYA_COUNTIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Sub-county</Label>
                      <Input value={form.sub_county} onChange={e => setForm({ ...form, sub_county: e.target.value })} />
                    </div>
                    <div>
                      <Label>Ownership type</Label>
                      <Select value={form.ownership_type} onValueChange={v => setForm({ ...form, ownership_type: v })}>
                        <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          {OWNERSHIP_TYPES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Institution level</Label>
                      <Select value={form.institution_level} onValueChange={v => setForm({ ...form, institution_level: v })}>
                        <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          {INSTITUTION_LEVELS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Curriculum</Label>
                      <Select value={form.curriculum} onValueChange={v => setForm({ ...form, curriculum: v })}>
                        <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          {CURRICULA.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Year established</Label>
                      <Input type="number" value={form.year_established} onChange={e => setForm({ ...form, year_established: e.target.value })} placeholder="e.g. 1998" />
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  {create.isPending ? "Creating..." : "Create school & admin"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {credentials && (
        <Dialog open={!!credentials} onOpenChange={(v) => !v && setCredentials(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> {credentials.school_name} — admin credentials
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground text-xs">
                Share these privately with the school. The password is shown only once.
              </p>
              <div><span className="text-muted-foreground">Portal:</span> <span className="font-medium break-all">{credentials.portal_url}</span></div>
              <div><span className="text-muted-foreground">Email:</span> <span className="font-medium break-all">{credentials.email}</span></div>
              <div><span className="text-muted-foreground">Password:</span> <span className="font-mono font-medium break-all">{credentials.password}</span></div>
            </div>
            <DialogFooter>
              <Button onClick={() => setCredentials(null)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Card>
        <CardHeader><CardTitle>All schools</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Portal URL</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Compliance</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(schools ?? []).map((s: any) => {
                  const url = `https://${s.slug}.${rootDomain}`;
                  const sub = s.school_subscriptions?.[0];
                  const planName = sub?.subscription_plans?.name ?? "—";
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {s.primary_color && <span className="inline-block w-3 h-3 rounded-full" style={{ background: s.primary_color }} />}
                          <span className="font-medium">{s.name}</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="secondary">{planName}</Badge></TableCell>
                      <TableCell>
                        <a href={url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-sm">
                          {s.slug}.{rootDomain} <ExternalLink className="h-3 w-3" />
                        </a>
                      </TableCell>
                      <TableCell>{counts?.[s.id] ?? 0}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === "active" ? "default" : "destructive"}>{s.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const { label, variant, Icon } = legalStatusBadge(s.legal_status);
                          return <Badge variant={variant} className="inline-flex items-center gap-1"><Icon className="h-3 w-3" />{label}</Badge>;
                        })()}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Link to="/platform/schools/$id" params={{ id: s.id }}>
                          <Button size="sm" variant="outline"><Settings className="h-3 w-3 mr-1" /> Manage</Button>
                        </Link>
                        {isOwner && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => toggleStatus.mutate({ id: s.id, status: s.status })}>
                              {s.status === "active" ? "Suspend" : "Activate"}
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="destructive">
                                  <Trash2 className="h-3 w-3 mr-1" /> Delete
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete {s.name}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This permanently removes the school and all related records (subscriptions, features, members). This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteSchool.mutate(s.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete permanently
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
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
