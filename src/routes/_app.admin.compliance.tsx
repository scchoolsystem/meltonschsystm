import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Save, Upload, FileText, CheckCircle2, XCircle, AlertTriangle, Trash2, Download,
  ShieldCheck, ShieldAlert,
} from "lucide-react";
import {
  KENYA_COUNTIES, OWNERSHIP_TYPES, INSTITUTION_LEVELS, CURRICULA, legalStatusBadge,
} from "@/routes/platform.schools";

export const Route = createFileRoute("/_app/admin/compliance")({
  component: SchoolCompliancePage,
});

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

function SchoolCompliancePage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const [legal, setLegal] = useState({
    registration_number: "", nemis_code: "", kra_pin: "", kra_tax_obligation: "",
    business_permit_no: "", registrar_of_societies_no: "", county: "", sub_county: "",
    ward: "", postal_address: "", ownership_type: "", institution_level: "", curriculum: "",
    year_established: "", legal_entity_name: "",
  });

  const [docOpen, setDocOpen] = useState(false);
  const [docForm, setDocForm] = useState({
    doc_type: "moe_registration_certificate", doc_number: "", issued_on: "", expires_on: "", notes: "",
    file: null as File | null,
  });

  const { data: school } = useQuery({
    queryKey: ["my-school-compliance"],
    queryFn: async () => {
      const { data: schoolIdRow } = await supabase.rpc("current_user_school");
      const schoolId = schoolIdRow as unknown as string | null;
      if (!schoolId) return null;
      const { data, error } = await supabase.from("schools").select("*").eq("id", schoolId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (school) {
      setLegal({
        registration_number: (school as any).registration_number ?? "",
        nemis_code: (school as any).nemis_code ?? "",
        kra_pin: (school as any).kra_pin ?? "",
        kra_tax_obligation: (school as any).kra_tax_obligation ?? "",
        business_permit_no: (school as any).business_permit_no ?? "",
        registrar_of_societies_no: (school as any).registrar_of_societies_no ?? "",
        county: (school as any).county ?? "",
        sub_county: (school as any).sub_county ?? "",
        ward: (school as any).ward ?? "",
        postal_address: (school as any).postal_address ?? "",
        ownership_type: (school as any).ownership_type ?? "",
        institution_level: (school as any).institution_level ?? "",
        curriculum: (school as any).curriculum ?? "",
        year_established: (school as any).year_established ? String((school as any).year_established) : "",
        legal_entity_name: (school as any).legal_entity_name ?? "",
      });
    }
  }, [school]);

  const { data: documents } = useQuery({
    queryKey: ["my-school-documents", school?.id],
    enabled: !!school?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("school_documents_with_expiry")
        .select("*")
        .eq("school_id", school!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const saveLegal = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("No school found for your account");
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
        // Editing details after verification sends it back for platform re-review.
        legal_status: (school as any).legal_status === "verified" ? "pending_review" : (school as any).legal_status,
      }).eq("id", school.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Legal & compliance details saved — the SmartDev team will review any changes.");
      qc.invalidateQueries({ queryKey: ["my-school-compliance"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const uploadDoc = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("No school found for your account");
      if (!docForm.file) throw new Error("Choose a file to upload");
      const path = `${school.id}/${docForm.doc_type}/${Date.now()}-${docForm.file.name}`;
      const { error: upErr } = await supabase.storage.from("school-documents").upload(path, docForm.file, {
        upsert: false, contentType: docForm.file.type,
      });
      if (upErr) throw upErr;
      const { error } = await (supabase as any).from("school_documents").insert({
        school_id: school.id,
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
      toast.success("Document uploaded — pending review by the SmartDev team");
      setDocOpen(false);
      setDocForm({ doc_type: "moe_registration_certificate", doc_number: "", issued_on: "", expires_on: "", notes: "", file: null });
      qc.invalidateQueries({ queryKey: ["my-school-documents", school?.id] });
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
      qc.invalidateQueries({ queryKey: ["my-school-documents", school?.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const downloadDoc = async (doc: any) => {
    const { data, error } = await supabase.storage.from("school-documents").createSignedUrl(doc.file_path, 60);
    if (error || !data) { toast.error("Could not open document"); return; }
    window.open(data.signedUrl, "_blank");
  };

  if (!school) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const { label, variant, Icon } = legalStatusBadge((school as any).legal_status);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          Legal &amp; compliance
          <Badge variant={variant} className="inline-flex items-center gap-1"><Icon className="h-3 w-3" />{label}</Badge>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Keep your school's registration and tax details current, and upload official documents for SmartDev to review and verify.
        </p>
        {(school as any).legal_status === "rejected" && (school as any).compliance_notes && (
          <div className="mt-3 rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <strong>Review notes:</strong> {(school as any).compliance_notes}
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Registration &amp; tax details</CardTitle>
            <CardDescription>Ministry of Education, NEMIS, KRA, and county details for your institution.</CardDescription>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => saveLegal.mutate()} disabled={saveLegal.isPending}>
              <Save className="h-4 w-4 mr-1" /> {saveLegal.isPending ? "Saving..." : "Save"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <Label>MOE registration no.</Label>
              <Input value={legal.registration_number} disabled={!isAdmin}
                onChange={e => setLegal({ ...legal, registration_number: e.target.value })} />
            </div>
            <div>
              <Label>NEMIS code</Label>
              <Input value={legal.nemis_code} disabled={!isAdmin}
                onChange={e => setLegal({ ...legal, nemis_code: e.target.value })} />
            </div>
            <div>
              <Label>KRA PIN</Label>
              <Input value={legal.kra_pin} disabled={!isAdmin}
                onChange={e => setLegal({ ...legal, kra_pin: e.target.value.toUpperCase() })} placeholder="P0XXXXXXXXA" />
            </div>
            <div>
              <Label>KRA tax obligation</Label>
              <Input value={legal.kra_tax_obligation} disabled={!isAdmin}
                onChange={e => setLegal({ ...legal, kra_tax_obligation: e.target.value })} placeholder="e.g. Income Tax - Company" />
            </div>
            <div>
              <Label>Business permit no.</Label>
              <Input value={legal.business_permit_no} disabled={!isAdmin}
                onChange={e => setLegal({ ...legal, business_permit_no: e.target.value })} />
            </div>
            <div>
              <Label>Registrar of Societies no.</Label>
              <Input value={legal.registrar_of_societies_no} disabled={!isAdmin}
                onChange={e => setLegal({ ...legal, registrar_of_societies_no: e.target.value })} />
            </div>
            <div>
              <Label>Legal entity / proprietor name</Label>
              <Input value={legal.legal_entity_name} disabled={!isAdmin}
                onChange={e => setLegal({ ...legal, legal_entity_name: e.target.value })} />
            </div>
            <div>
              <Label>Ownership type</Label>
              <Select value={legal.ownership_type} disabled={!isAdmin} onValueChange={v => setLegal({ ...legal, ownership_type: v })}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {OWNERSHIP_TYPES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Institution level</Label>
              <Select value={legal.institution_level} disabled={!isAdmin} onValueChange={v => setLegal({ ...legal, institution_level: v })}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {INSTITUTION_LEVELS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Curriculum</Label>
              <Select value={legal.curriculum} disabled={!isAdmin} onValueChange={v => setLegal({ ...legal, curriculum: v })}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {CURRICULA.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Year established</Label>
              <Input type="number" value={legal.year_established} disabled={!isAdmin}
                onChange={e => setLegal({ ...legal, year_established: e.target.value })} />
            </div>
            <div>
              <Label>County</Label>
              <Select value={legal.county} disabled={!isAdmin} onValueChange={v => setLegal({ ...legal, county: v })}>
                <SelectTrigger><SelectValue placeholder="Select county..." /></SelectTrigger>
                <SelectContent>
                  {KENYA_COUNTIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sub-county</Label>
              <Input value={legal.sub_county} disabled={!isAdmin}
                onChange={e => setLegal({ ...legal, sub_county: e.target.value })} />
            </div>
            <div>
              <Label>Ward</Label>
              <Input value={legal.ward} disabled={!isAdmin}
                onChange={e => setLegal({ ...legal, ward: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Postal address</Label>
            <Input value={legal.postal_address} disabled={!isAdmin}
              onChange={e => setLegal({ ...legal, postal_address: e.target.value })} placeholder="P.O. Box 000-00100, Nairobi" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Compliance documents</CardTitle>
            <CardDescription>Upload your registration certificate, KRA PIN certificate, permits, and other official documents.</CardDescription>
          </div>
          {isAdmin && (
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
          )}
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
                const docLabel = SCHOOL_DOC_TYPES.find(t => t.value === d.doc_type)?.label ?? d.doc_type;
                const eff = d.effective_status ?? d.status;
                const badgeVariant = eff === "verified" ? "default" : eff === "rejected" || eff === "expired" ? "destructive" : "secondary";
                return (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-medium">{docLabel}</div>
                          <div className="text-xs text-muted-foreground">{d.file_name}</div>
                          {d.review_notes && eff === "rejected" && (
                            <div className="text-xs text-destructive mt-0.5">{d.review_notes}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{d.doc_number || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {d.expires_on ?? "—"}
                      {d.expiring_soon && <AlertTriangle className="inline h-3 w-3 text-amber-500 ml-1" />}
                    </TableCell>
                    <TableCell>
                      <Badge variant={badgeVariant} className="capitalize inline-flex items-center gap-1">
                        {eff === "verified" ? <CheckCircle2 className="h-3 w-3" /> : eff === "rejected" || eff === "expired" ? <XCircle className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                        {String(eff).replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => downloadDoc(d)}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      {isAdmin && d.status !== "verified" && (
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
    </div>
  );
}
