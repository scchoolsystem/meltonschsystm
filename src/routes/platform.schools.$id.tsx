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
import {
  ArrowLeft, ExternalLink, Plus, Save, KeyRound, Copy, Upload, FileText,
  CheckCircle2, XCircle, AlertTriangle, Trash2, Download, ShieldCheck,
} from "lucide-react";
import {
  KENYA_COUNTIES, OWNERSHIP_TYPES, INSTITUTION_LEVELS, CURRICULA, legalStatusBadge,
} from "@/routes/platform.schools";

const SCHOOL_DOC_TYPES: { value: string; label: string; expiring?: boolean }[] = [
  { value: "moe_registration_certificate", label: "MOE registration certificate" },
  { value: "nemis_certificate", label: "NEMIS certificate" },
  { value: "kra_pin_certificate", label: "KRA PIN certificate" },
  { value: "tax_compliance_certificate", label: "Tax compliance certificate", expiring: true },
  { value: "business_permit", label: "Business permit", expiring: true },
  { value: "incorporation_certificate", label: "Incorporation certificate" },
  { value: "registrar_of_societies_cert", label: "Registrar of Societies certificate" },
  { value: "lease_or_title_deed", label: "Lease / title deed" },
  { value: "fire_safety_certificate", label: "Fire safety certificate", expiring: true },
  { value: "public_health_certificate", label: "Public health certificate", expiring: true },
  { value: "nema_license", label: "NEMA license" },
  { value: "insurance_certificate", label: "Insurance certificate", expiring: true },
  { value: "bank_confirmation_letter", label: "Bank confirmation letter" },
  { value: "other", label: "Other" },
];

export const Route = createFileRoute("/platform/schools/$id")({
  component: PlatformSchoolDetail,
});

const MODULE_META: Record<string, string> = {
  timetable:"Timetable", attendance:"Attendance",
  academics_subjects:"Subjects", academics_exams:"Exams", academics_marks:"Marks Entry",
  academics_remarks:"Remark Templates", academics_results:"Results",
  academics_report_cards:"Report Cards", academics_oversight:"Exam Oversight",
  discipline:"Discipline", announcements:"Announcements", portals:"Parent / Student Portals",
  finance:"Finance & Billing", ids:"Digital IDs", leaving_certs:"Leaving Certificates",
  boarding:"Boarding", kitchen:"Kitchen", library:"Library", clinic:"Clinic",
  transport:"Transport", security:"Security", classroom:"Classroom",
  live_classes:"Live Classes", communications:"Communications", analytics:"Analytics",
};
const CATEGORIES = [
  { label: "Core Academic",   keys: ["timetable","attendance","academics_subjects","academics_exams","academics_marks","academics_remarks","academics_results","academics_report_cards","academics_oversight","discipline","announcements","portals"] },
  { label: "Finance & Admin", keys: ["finance","ids","leaving_certs"] },
  { label: "Facilities",      keys: ["boarding","kitchen","library","clinic","transport","security"] },
  { label: "Digital",         keys: ["classroom","live_classes","communications","analytics"] },
] as const;

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
  const [legal, setLegal] = useState({
    registration_number: "", nemis_code: "", kra_pin: "", kra_tax_obligation: "",
    business_permit_no: "", registrar_of_societies_no: "", county: "", sub_county: "",
    ward: "", postal_address: "", ownership_type: "", institution_level: "", curriculum: "",
    year_established: "", legal_entity_name: "", compliance_notes: "",
  });
  const [credentials, setCredentials] = useState<{ email: string; password: string; portal_url: string } | null>(null);

  const [docOpen, setDocOpen] = useState(false);
  const [docForm, setDocForm] = useState({
    doc_type: "moe_registration_certificate", doc_number: "", issued_on: "", expires_on: "", notes: "",
    file: null as File | null,
  });

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
      setLegal({
        registration_number: school.registration_number ?? "",
        nemis_code: school.nemis_code ?? "",
        kra_pin: school.kra_pin ?? "",
        kra_tax_obligation: school.kra_tax_obligation ?? "",
        business_permit_no: school.business_permit_no ?? "",
        registrar_of_societies_no: school.registrar_of_societies_no ?? "",
        county: school.county ?? "",
        sub_county: school.sub_county ?? "",
        ward: school.ward ?? "",
        postal_address: school.postal_address ?? "",
        ownership_type: school.ownership_type ?? "",
        institution_level: school.institution_level ?? "",
        curriculum: school.curriculum ?? "",
        year_established: school.year_established ? String(school.year_established) : "",
        legal_entity_name: school.legal_entity_name ?? "",
        compliance_notes: school.compliance_notes ?? "",
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
      const { data } = await supabase.from("school_features").select("id,feature_key,enabled,platform_enabled").eq("school_id", id);
      const map: Record<string, { id: string; enabled: boolean; platform_enabled: boolean }> = {};
      (data ?? []).forEach((f: any) => { map[f.feature_key] = { id: f.id, enabled: f.enabled, platform_enabled: f.platform_enabled ?? true }; });
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

  const saveLegal = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("schools").update({
        registration_number: legal.registration_number.trim() || null,
        nemis_code: legal.nemis_code.trim() || null,
        kra_pin: legal.kra_pin.trim().toUpperCase() || null,
        kra_tax_obligation: legal.kra_tax_obligation.trim() || null,
        business_permit_no: legal.business_permit_no.trim() || null,
        registrar_of_societies_no: legal.registrar_of_societies_no.trim() || null,
        county: legal.county || null,
        sub_county: legal.sub_county.trim() || null,
        ward: legal.ward.trim() || null,
        postal_address: legal.postal_address.trim() || null,
        ownership_type: legal.ownership_type || null,
        institution_level: legal.institution_level || null,
        curriculum: legal.curriculum || null,
        year_established: legal.year_established ? Number(legal.year_established) : null,
        legal_entity_name: legal.legal_entity_name.trim() || null,
        compliance_notes: legal.compliance_notes.trim() || null,
        // Any edit to legal details after verification drops it back to pending review
        legal_status: school?.legal_status === "verified" ? "pending_review" : school?.legal_status,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Legal & compliance details saved");
      qc.invalidateQueries({ queryKey: ["platform-school", id] });
      qc.invalidateQueries({ queryKey: ["platform-schools"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setLegalStatus = useMutation({
    mutationFn: async (status: "verified" | "rejected" | "pending_review") => {
      const { error } = await (supabase as any).from("schools").update({
        legal_status: status,
        verified_at: status === "verified" ? new Date().toISOString() : null,
        verified_by: status === "verified" ? (await supabase.auth.getUser()).data.user?.id : null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, status) => {
      toast.success(`Marked as ${status.replace("_", " ")}`);
      qc.invalidateQueries({ queryKey: ["platform-school", id] });
      qc.invalidateQueries({ queryKey: ["platform-schools"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const { data: documents } = useQuery({
    queryKey: ["school-documents", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("school_documents_with_expiry")
        .select("*")
        .eq("school_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const uploadDoc = useMutation({
    mutationFn: async () => {
      if (!docForm.file) throw new Error("Choose a file to upload");
      const path = `${id}/${docForm.doc_type}/${Date.now()}-${docForm.file.name}`;
      const { error: upErr } = await supabase.storage.from("school-documents").upload(path, docForm.file, {
        upsert: false, contentType: docForm.file.type,
      });
      if (upErr) throw upErr;
      const { error } = await (supabase as any).from("school_documents").insert({
        school_id: id,
        doc_type: docForm.doc_type,
        file_path: path,
        file_name: docForm.file.name,
        mime_type: docForm.file.type,
        size_bytes: docForm.file.size,
        doc_number: docForm.doc_number.trim() || null,
        issued_on: docForm.issued_on || null,
        expires_on: docForm.expires_on || null,
        notes: docForm.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Document uploaded — pending review");
      setDocOpen(false);
      setDocForm({ doc_type: "moe_registration_certificate", doc_number: "", issued_on: "", expires_on: "", notes: "", file: null });
      qc.invalidateQueries({ queryKey: ["school-documents", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const reviewDoc = useMutation({
    mutationFn: async ({ docId, status }: { docId: string; status: "verified" | "rejected" }) => {
      const { error } = await (supabase as any).from("school_documents").update({
        status, reviewed_at: new Date().toISOString(),
        reviewed_by: (await supabase.auth.getUser()).data.user?.id,
      }).eq("id", docId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["school-documents", id] });
      toast.success("Document reviewed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteDoc = useMutation({
    mutationFn: async (doc: any) => {
      await supabase.storage.from("school-documents").remove([doc.file_path]);
      const { error } = await (supabase as any).from("school_documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Document removed");
      qc.invalidateQueries({ queryKey: ["school-documents", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const downloadDoc = async (doc: any) => {
    const { data, error } = await supabase.storage.from("school-documents").createSignedUrl(doc.file_path, 60);
    if (error || !data) { toast.error("Could not open document"); return; }
    window.open(data.signedUrl, "_blank");
  };

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
    mutationFn: async ({ key, platform_enabled }: { key: string; platform_enabled: boolean }) => {
      const { error } = await (supabase as any).from("school_features")
        .upsert({ school_id: id, feature_key: key, platform_enabled, enabled: platform_enabled }, { onConflict: "school_id,feature_key" });
      if (error) throw error;
    },
    onSuccess: (_d: any, vars: any) => {
      qc.invalidateQueries({ queryKey: ["school-features", id] });
      const name = MODULE_META[vars.key] ?? vars.key;
      toast.success(vars.platform_enabled ? `${name} enabled for school` : `${name} disabled for school`);
    },
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

  const rootDomain = "smartdev.co.ke";

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
            {(() => {
              const { label, variant, Icon } = legalStatusBadge(school.legal_status);
              return <Badge variant={variant} className="inline-flex items-center gap-1"><Icon className="h-3 w-3" />{label}</Badge>;
            })()}
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
            <CardTitle>Legal &amp; compliance</CardTitle>
            <CardDescription>Official registration, tax, and licensing details. Used for regulator (MOE, KRA, county) reporting and platform compliance tracking.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isOwner && (
              <Button size="sm" onClick={() => saveLegal.mutate()} disabled={saveLegal.isPending}>
                <Save className="h-4 w-4 mr-1" /> {saveLegal.isPending ? "Saving..." : "Save"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <Label>MOE registration no.</Label>
              <Input value={legal.registration_number} disabled={!isOwner}
                onChange={e => setLegal({ ...legal, registration_number: e.target.value })} />
            </div>
            <div>
              <Label>NEMIS code</Label>
              <Input value={legal.nemis_code} disabled={!isOwner}
                onChange={e => setLegal({ ...legal, nemis_code: e.target.value })} />
            </div>
            <div>
              <Label>KRA PIN</Label>
              <Input value={legal.kra_pin} disabled={!isOwner}
                onChange={e => setLegal({ ...legal, kra_pin: e.target.value.toUpperCase() })} placeholder="P0XXXXXXXXA" />
            </div>
            <div>
              <Label>KRA tax obligation</Label>
              <Input value={legal.kra_tax_obligation} disabled={!isOwner}
                onChange={e => setLegal({ ...legal, kra_tax_obligation: e.target.value })} placeholder="e.g. Income Tax - Company" />
            </div>
            <div>
              <Label>Business permit no.</Label>
              <Input value={legal.business_permit_no} disabled={!isOwner}
                onChange={e => setLegal({ ...legal, business_permit_no: e.target.value })} />
            </div>
            <div>
              <Label>Registrar of Societies no.</Label>
              <Input value={legal.registrar_of_societies_no} disabled={!isOwner}
                onChange={e => setLegal({ ...legal, registrar_of_societies_no: e.target.value })} />
            </div>
            <div>
              <Label>Legal entity / proprietor name</Label>
              <Input value={legal.legal_entity_name} disabled={!isOwner}
                onChange={e => setLegal({ ...legal, legal_entity_name: e.target.value })} />
            </div>
            <div>
              <Label>Ownership type</Label>
              <Select value={legal.ownership_type} disabled={!isOwner} onValueChange={v => setLegal({ ...legal, ownership_type: v })}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {OWNERSHIP_TYPES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Institution level</Label>
              <Select value={legal.institution_level} disabled={!isOwner} onValueChange={v => setLegal({ ...legal, institution_level: v })}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {INSTITUTION_LEVELS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Curriculum</Label>
              <Select value={legal.curriculum} disabled={!isOwner} onValueChange={v => setLegal({ ...legal, curriculum: v })}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {CURRICULA.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Year established</Label>
              <Input type="number" value={legal.year_established} disabled={!isOwner}
                onChange={e => setLegal({ ...legal, year_established: e.target.value })} />
            </div>
            <div>
              <Label>County</Label>
              <Select value={legal.county} disabled={!isOwner} onValueChange={v => setLegal({ ...legal, county: v })}>
                <SelectTrigger><SelectValue placeholder="Select county..." /></SelectTrigger>
                <SelectContent>
                  {KENYA_COUNTIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sub-county</Label>
              <Input value={legal.sub_county} disabled={!isOwner}
                onChange={e => setLegal({ ...legal, sub_county: e.target.value })} />
            </div>
            <div>
              <Label>Ward</Label>
              <Input value={legal.ward} disabled={!isOwner}
                onChange={e => setLegal({ ...legal, ward: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Postal address</Label>
            <Input value={legal.postal_address} disabled={!isOwner}
              onChange={e => setLegal({ ...legal, postal_address: e.target.value })} placeholder="P.O. Box 000-00100, Nairobi" />
          </div>
          <div>
            <Label>Compliance notes</Label>
            <Textarea value={legal.compliance_notes} disabled={!isOwner} rows={2}
              onChange={e => setLegal({ ...legal, compliance_notes: e.target.value })}
              placeholder="Internal notes — e.g. outstanding documents, follow-ups with the school." />
          </div>

          {isOwner && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
              <span className="text-xs text-muted-foreground mr-2">Verification:</span>
              <Button size="sm" variant="outline" onClick={() => setLegalStatus.mutate("verified")} disabled={setLegalStatus.isPending}>
                <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Mark verified
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLegalStatus.mutate("pending_review")} disabled={setLegalStatus.isPending}>
                Mark pending review
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLegalStatus.mutate("rejected")} disabled={setLegalStatus.isPending}>
                <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
              </Button>
              {school.verified_at && (
                <span className="text-xs text-muted-foreground ml-auto">
                  Verified {new Date(school.verified_at).toLocaleDateString()}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Compliance documents</CardTitle>
            <CardDescription>Registration certificates, tax and permit documents. Uploads are private and reviewed by the platform team.</CardDescription>
          </div>
          <Dialog open={docOpen} onOpenChange={setDocOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Upload className="h-4 w-4 mr-1" /> Upload document</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Upload compliance document</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Document type</Label>
                  <Select value={docForm.doc_type} onValueChange={v => setDocForm({ ...docForm, doc_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SCHOOL_DOC_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>File</Label>
                  <Input type="file" accept=".pdf,.jpg,.jpeg,.png"
                    onChange={e => setDocForm({ ...docForm, file: e.target.files?.[0] ?? null })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Document / certificate no.</Label>
                    <Input value={docForm.doc_number} onChange={e => setDocForm({ ...docForm, doc_number: e.target.value })} />
                  </div>
                  <div>
                    <Label>Issued on</Label>
                    <Input type="date" value={docForm.issued_on} onChange={e => setDocForm({ ...docForm, issued_on: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Expires on <span className="text-muted-foreground text-xs">(if applicable)</span></Label>
                  <Input type="date" value={docForm.expires_on} onChange={e => setDocForm({ ...docForm, expires_on: e.target.value })} />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea value={docForm.notes} onChange={e => setDocForm({ ...docForm, notes: e.target.value })} rows={2} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDocOpen(false)}>Cancel</Button>
                <Button onClick={() => uploadDoc.mutate()} disabled={uploadDoc.isPending || !docForm.file}>
                  {uploadDoc.isPending ? "Uploading..." : "Upload"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>No.</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(documents ?? []).map((d: any) => {
                const label = SCHOOL_DOC_TYPES.find(t => t.value === d.doc_type)?.label ?? d.doc_type;
                const eff = d.effective_status ?? d.status;
                const variant = eff === "verified" ? "default" : eff === "rejected" || eff === "expired" ? "destructive" : "secondary";
                return (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-medium">{label}</div>
                          <div className="text-xs text-muted-foreground">{d.file_name}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{d.doc_number || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {d.expires_on ?? "—"}
                      {d.expiring_soon && <AlertTriangle className="inline h-3 w-3 text-amber-500 ml-1" />}
                    </TableCell>
                    <TableCell><Badge variant={variant} className="capitalize">{String(eff).replace("_", " ")}</Badge></TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => downloadDoc(d)}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      {isOwner && d.status !== "verified" && (
                        <Button size="sm" variant="ghost" onClick={() => reviewDoc.mutate({ docId: d.id, status: "verified" })}>
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        </Button>
                      )}
                      {isOwner && d.status !== "rejected" && (
                        <Button size="sm" variant="ghost" onClick={() => reviewDoc.mutate({ docId: d.id, status: "rejected" })}>
                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                      {isOwner && (
                        <Button size="sm" variant="ghost" onClick={() => deleteDoc.mutate(d)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!documents || documents.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">No documents uploaded yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
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
          <CardContent className="space-y-6">
            {CATEGORIES.map((cat) => (
              <div key={cat.label}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{cat.label}</p>
                <div className="space-y-2">
                  {cat.keys.map((key) => {
                    const f = features?.[key];
                    const platformOn = f?.platform_enabled ?? true;
                    return (
                      <div key={key} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${!platformOn ? "opacity-50" : ""}`}>
                        <div>
                          <p className="text-sm font-medium">{MODULE_META[key] ?? key}</p>
                          {!platformOn && <p className="text-xs text-muted-foreground">Disabled for this school</p>}
                        </div>
                        <Switch checked={platformOn} disabled={!isOwner}
                          onCheckedChange={(v) => isOwner && toggleFeature.mutate({ key, platform_enabled: v })} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
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
