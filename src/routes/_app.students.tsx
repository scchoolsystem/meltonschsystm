import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { admitStudent } from "@/lib/admissions.functions";
import { PhotoCapture, uploadPhotoDataUrl } from "@/components/PhotoCapture";
import { IdCard } from "@/components/IdCard";
import { LifecycleActions } from "@/components/LifecycleActions";
import { StatusBadge } from "@/components/StatusBadge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Loader2, Download, FileText, UserCheck, Eye } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTrackedDelete } from "@/hooks/useTrackedDelete";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Pager } from "@/components/Pager";

export const Route = createFileRoute("/_app/students")({
  component: StudentsPage,
});

interface ClassRow { id: string; name: string; stream: string | null; year: number; capacity: number }
interface Student {
  id: string; admission_no: string; unique_id: string | null;
  first_name: string; last_name: string;
  gender: string | null; class_id: string | null; status: string;
  lifecycle_status: string;
  lifecycle_reason: string | null;
  transferred_to: string | null;
  admitted_on: string | null;
  parent_phone: string | null;
  classes?: { name: string } | null;
}


function StudentsPage() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const canEdit = isAdmin || hasRole("admission_officer") || hasRole("deputy_principal");
  const isAdmissionOfficer = isAdmin || hasRole("admission_officer");
  const REQUIRED_DOCS = ["birth_certificate", "report_form", "passport_photo"] as const;
  const deleteMutation = useTrackedDelete();
  const [schoolId, setSchoolId] = useState<string | null>(null);
  useEffect(() => { supabase.rpc("current_user_school").then(({ data }) => setSchoolId(data as string)); }, []);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [open, setOpen] = useState(false);

  const { data: pageData, isLoading } = useQuery({
    queryKey: ["students", q, page],
    queryFn: async () => {
      let req = supabase
        .from("students")
        .select("id, admission_no, unique_id, first_name, last_name, gender, class_id, status, lifecycle_status, lifecycle_reason, transferred_to, admitted_on, parent_phone, classes(name)", { count: "exact" })
        .order("admission_no", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      const t = q.trim();
      if (t) req = req.or(`admission_no.ilike.%${t}%,unique_id.ilike.%${t}%,first_name.ilike.%${t}%,last_name.ilike.%${t}%`);
      const { data, error, count } = await req;
      if (error) throw error;
      return { rows: (data as unknown as Student[]) ?? [], count: count ?? 0 };
    },
  });
  const students = pageData?.rows ?? [];
  const totalCount = pageData?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const { data: classes = [] } = useQuery({
    queryKey: ["classes-min"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, name, stream, year, capacity").order("name").order("stream");
      return (data ?? []) as ClassRow[];
    },
  });


  const { data: settings } = useQuery({
    queryKey: ["school-settings"],
    queryFn: async () => {
      const { data } = await supabase.rpc("current_user_school");
      const schoolId = (data as unknown) as string | null;
      if (!schoolId) return null;
      const { data: sch } = await supabase.from("schools").select("name, academic_year, current_term").eq("id", schoolId).maybeSingle();
      return sch ? { school_name: (sch as any).name, academic_year: (sch as any).academic_year, current_term: (sch as any).current_term } : null;
    },
  });

  // Server-side search via `q` in queryKey; no client-side filter.
  const filtered = students;

  const { data: pendingDocsList = [], isLoading: pendingLoading } = useQuery({
    queryKey: ["students-pending-docs"],
    enabled: isAdmissionOfficer,
    queryFn: async () => {
      const { data: allStudents } = await supabase.from("students").select("id, admission_no, first_name, last_name, status").eq("status", "active");
      const ids = (allStudents ?? []).map((s: any) => s.id);
      if (ids.length === 0) return [];
      const { data: docs } = await supabase.from("student_documents").select("student_id, doc_type").in("student_id", ids);
      return (allStudents ?? []).map((s: any) => {
        const have = new Set((docs ?? []).filter((d: any) => d.student_id === s.id).map((d: any) => d.doc_type));
        const missing = REQUIRED_DOCS.filter((d) => !have.has(d));
        return { ...s, missing };
      }).filter((s: any) => s.missing.length > 0);
    },
  });

  const sinceDate = new Date(); sinceDate.setDate(sinceDate.getDate() - 30);
  const { data: recentlyAdmitted = [], isLoading: recentLoading } = useQuery({
    queryKey: ["students-recently-admitted"],
    enabled: isAdmissionOfficer,
    queryFn: async () => {
      const { data } = await supabase.from("students").select("id, admission_no, first_name, last_name, created_at, classes(name)").gte("created_at", sinceDate.toISOString()).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  function exportCsv() {
    const rows = [
      ["Admission No", "Unique ID", "First Name", "Last Name", "Gender", "Class", "Status", "Parent Phone"],
      ...filtered.map((s) => [s.admission_no, s.unique_id ?? "", s.first_name, s.last_name, s.gender ?? "", s.classes?.name ?? "", s.status, s.parent_phone ?? ""]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `students-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Students</h1>
          <p className="text-sm text-muted-foreground mt-1">{totalCount.toLocaleString()} total enrolled</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-2" />Export</Button>
          {canEdit && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" />Admit Student</Button>
              </DialogTrigger>
              <AdmitStudentDialog classes={classes} settings={settings} onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["students"] }); }} />
            </Dialog>
          )}
        </div>
      </div>

      {isAdmissionOfficer ? (
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All Students</TabsTrigger>
            <TabsTrigger value="pending"><FileText className="w-3.5 h-3.5 mr-1" />Pending Documents {pendingDocsList.length > 0 && <Badge variant="destructive" className="ml-2">{pendingDocsList.length}</Badge>}</TabsTrigger>
            <TabsTrigger value="recent"><UserCheck className="w-3.5 h-3.5 mr-1" />Recently Admitted</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <StudentsTableCard {...{ q, setQ, setPage, isLoading, filtered, canEdit, isAdmin, schoolId, deleteMutation, page, pageCount, totalCount }} />
          </TabsContent>

          <TabsContent value="pending">
            <Card><CardContent className="pt-6">
              {pendingLoading ? <Loader2 className="animate-spin mx-auto" /> : pendingDocsList.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">All active students have their required documents on file.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Missing Documents</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {pendingDocsList.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.first_name} {s.last_name}<div className="text-xs text-muted-foreground">{s.admission_no}</div></TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {s.missing.map((m: string) => <Badge key={m} variant="outline" className="capitalize text-xs">{m.replace(/_/g, " ")}</Badge>)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button asChild size="sm" variant="outline">
                            <a href={`/students/${s.id}/documents`}>Upload Documents</a>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="recent">
            <Card><CardContent className="pt-6">
              {recentLoading ? <Loader2 className="animate-spin mx-auto" /> : recentlyAdmitted.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No students admitted in the last 30 days.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Admission No</TableHead><TableHead>Name</TableHead><TableHead>Class</TableHead><TableHead>Admitted</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(recentlyAdmitted as any[]).map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">{s.admission_no}</TableCell>
                        <TableCell className="font-medium">{s.first_name} {s.last_name}</TableCell>
                        <TableCell>{s.classes?.name ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      ) : (
        <StudentsTableCard {...{ q, setQ, setPage, isLoading, filtered, canEdit, isAdmin, schoolId, deleteMutation, page, pageCount, totalCount }} />
      )}
    </div>
  );
}

function StudentsTableCard({ q, setQ, setPage, isLoading, filtered, canEdit, isAdmin, schoolId, deleteMutation, page, pageCount, totalCount }: any) {
  return (
    <Card>
        <CardHeader>
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name, admission no, or unique ID…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-60 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Admission No</TableHead>
                    <TableHead>Unique ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Parent Phone</TableHead>
                    <TableHead>Admitted</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">No students found.</TableCell></TableRow>
                  )}
                  {filtered.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.admission_no}</TableCell>
                      <TableCell className="font-mono text-xs">{s.unique_id ?? "—"}</TableCell>
                      <TableCell className="font-medium">{s.first_name} {s.last_name}</TableCell>
                      <TableCell>{s.classes?.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="capitalize">{s.gender ?? "—"}</TableCell>
                      <TableCell>{s.parent_phone ?? "—"}</TableCell>
                      <TableCell className="text-xs">{s.admitted_on ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <StatusBadge status={s.lifecycle_status ?? s.status} />
                          {s.lifecycle_reason && (
                            <span className="text-[10px] text-muted-foreground italic max-w-[180px] truncate" title={s.lifecycle_reason}>
                              {s.lifecycle_reason}
                            </span>
                          )}
                          {s.lifecycle_status === "transferred" && s.transferred_to && (
                            <span className="text-[10px] text-muted-foreground">→ {s.transferred_to}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" className="gap-1" asChild>
                          <Link to="/students/$id" params={{ id: s.id }}>
                            <Eye className="w-3.5 h-3.5" /> View
                          </Link>
                        </Button>
                        {canEdit && (
                          <>
                            <LifecycleActions kind="student" id={s.id} currentStatus={s.lifecycle_status ?? "active"} queryKey="students" />
                            {isAdmin && <DeleteConfirmDialog label={`${s.first_name} ${s.last_name}`} isPending={deleteMutation.isPending} onConfirm={() => schoolId && deleteMutation.mutate({ id: s.id, schoolId, table: "students", entity: "student", label: `${s.first_name} ${s.last_name}`, invalidateKeys: ["students"] })} />}
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <Pager page={page} pageCount={pageCount} total={totalCount} onChange={setPage} />
        </CardContent>
      </Card>
  );
}


const DOC_TYPES: { key: "birth_certificate"|"report_form"|"passport_photo"|"medical_records"|"transfer_letter"|"national_id"|"parent_id"|"other"; label: string; accept: string }[] = [
  { key: "birth_certificate", label: "Birth Certificate", accept: "image/*,application/pdf" },
  { key: "report_form",       label: "Previous Report Form", accept: "image/*,application/pdf" },
  { key: "passport_photo",    label: "Passport Photo", accept: "image/*" },
  { key: "medical_records",   label: "Medical Records", accept: "image/*,application/pdf" },
  { key: "transfer_letter",   label: "Transfer Letter", accept: "image/*,application/pdf" },
  { key: "national_id",       label: "National ID (if applicable)", accept: "image/*,application/pdf" },
  { key: "parent_id",         label: "Parent / Guardian ID", accept: "image/*,application/pdf" },
  { key: "other",             label: "Other Supporting Document", accept: "image/*,application/pdf" },
];

function AdmitStudentDialog({ classes, settings, onDone }: { classes: ClassRow[]; settings: any; onDone: () => void }) {
  const admit = useServerFn(admitStudent);
  const [photo, setPhoto] = useState<string | null>(null);
  const [form, setForm] = useState({
    first_name: "", last_name: "", gender: "", class_id: "", level: "",
    parent_name: "", parent_phone: "", parent_email: "", date_of_birth: "",
    address: "", medical_notes: "", national_id: "",
  });
  // class_id has special values: "" | "auto:Form 1" | "<uuid>"
  const [docs, setDocs] = useState<Record<string, File | null>>({});
  const [result, setResult] = useState<null | {
    uniqueId: string; password: string; admission_no: string; full_name: string;
    photo_url: string | null; class_name?: string;
    parentAuthCode?: string;
    assignedDorm?: { id: string; name: string } | null;
    insuranceEnrolled?: boolean;
    documentsSaved?: number;
  }>(null);

  // Group classes by level name for the picker
  const levels = Array.from(new Set(classes.map(c => c.name)));

  const m = useMutation({
    mutationFn: async () => {
      let photo_url: string | undefined;
      if (photo) {
        photo_url = await uploadPhotoDataUrl(supabase, photo, "students", `${form.first_name}-${form.last_name}`.toLowerCase().replace(/\s+/g, "-"));
      }

      // Upload documents first (so the server fn just records refs).
      const docRefs: Array<{ doc_type: any; file_path: string; file_name?: string; mime_type?: string; size_bytes?: number }> = [];
      const ts = Date.now();
      for (const def of DOC_TYPES) {
        const file = docs[def.key];
        if (!file) continue;
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `pending/${ts}-${def.key}-${safeName}`;
        const { error: upErr } = await supabase.storage.from("student-documents").upload(path, file, { upsert: false, contentType: file.type });
        if (upErr) throw new Error(`Failed to upload ${def.label}: ${upErr.message}`);
        docRefs.push({ doc_type: def.key, file_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size });
      }

      const payload: any = {
        first_name: form.first_name, last_name: form.last_name,
        parent_name: form.parent_name, parent_phone: form.parent_phone, parent_email: form.parent_email,
        address: form.address, medical_notes: form.medical_notes,
        photo_url,
        documents: docRefs.length ? docRefs : undefined,
      };
      if (form.gender) payload.gender = form.gender;
      if (form.date_of_birth) payload.date_of_birth = form.date_of_birth;
      if (form.national_id) payload.national_id = form.national_id;
      if (form.class_id.startsWith("auto:")) {
        payload.level = form.class_id.slice(5);
      } else if (form.class_id) {
        payload.class_id = form.class_id;
      }
      const res = await admit({ data: payload });
      return { ...res, photo_url: photo_url ?? null };
    },
    onSuccess: (res) => {
      toast.success("Student admitted");
      const cls = classes.find((c) => c.id === res.assignedClassId);
      const className = cls ? `${cls.name}${cls.stream ? " " + cls.stream : ""}` : undefined;
      setResult({
        uniqueId: res.uniqueId,
        password: res.password,
        admission_no: res.student.admission_no,
        full_name: `${res.student.first_name} ${res.student.last_name}`,
        photo_url: res.photo_url,
        class_name: className,
        parentAuthCode: res.parentAuthCode,
        assignedDorm: res.assignedDorm,
        insuranceEnrolled: res.insuranceEnrolled,
        documentsSaved: res.documentsSaved,
      });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (result) {
    return (
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Student admitted ✓</DialogTitle>
          <p className="text-xs text-muted-foreground">Save or print the credentials below — the password is shown only once.</p>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex justify-center">
            <IdCard
              schoolName={settings?.school_name ?? "School"}
              kind="STUDENT"
              uniqueId={result.uniqueId}
              fullName={result.full_name}
              subtitle={result.class_name ?? "Student"}
              photoUrl={result.photo_url}
              meta={[{ label: "ADM", value: result.admission_no }]}
              validUntil={settings?.academic_year ? `Dec ${settings.academic_year}` : undefined}
            />
          </div>
          <div className="rounded-md border bg-muted/40 p-3 text-sm font-mono space-y-1">
            <div>Login ID: <span className="font-bold">{result.uniqueId}</span></div>
            <div>Password: <span className="font-bold">{result.password}</span></div>
            <div>Admission #: {result.admission_no}</div>
            {result.parentAuthCode && <div>Parent code: <span className="font-bold">{result.parentAuthCode}</span></div>}
          </div>
          <div className="text-xs space-y-1 border rounded-md p-3">
            <div className="font-semibold text-muted-foreground uppercase tracking-wide mb-1">Auto-assignments</div>
            <div>Class / stream: <span className="font-medium">{result.class_name ?? "— (none assigned)"}</span></div>
            <div>Dormitory: <span className="font-medium">{result.assignedDorm?.name ?? "— (day scholar / no capacity)"}</span></div>
            <div>Insurance: <span className="font-medium">{result.insuranceEnrolled ? "Enrolled in default policy" : "— (no default policy)"}</span></div>
            <div>Documents saved: <span className="font-medium">{result.documentsSaved ?? 0}</span></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => window.print()}>Print</Button>
          <Button onClick={onDone}>Done</Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Admit New Student</DialogTitle>
        {settings && (
          <p className="text-xs text-muted-foreground">
            {settings.school_name} · {settings.current_term ?? "Term"} {settings.academic_year ?? ""}
          </p>
        )}
      </DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-4">
        <div>
          <Label className="mb-2 block">Student Photo</Label>
          <PhotoCapture value={photo} onChange={setPhoto} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>First Name *</Label><Input required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
          <div><Label>Last Name *</Label><Input required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Date of Birth</Label><Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></div>
          <div>
            <Label>Gender</Label>
            <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Class / Stream</Label>
          <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v })}>
            <SelectTrigger><SelectValue placeholder="Assign class or auto-pick a stream" /></SelectTrigger>
            <SelectContent>
              {levels.map((lvl) => (
                <div key={lvl}>
                  <SelectItem value={`auto:${lvl}`}>★ Auto-assign stream — {lvl}</SelectItem>
                  {classes.filter(c => c.name === lvl).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.stream ? ` ${c.stream}` : ""}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">Auto-assign picks the least-full stream of the chosen level.</p>
        </div>
        <div><Label>National ID (if applicable)</Label><Input value={form.national_id} onChange={(e) => setForm({ ...form, national_id: e.target.value })} /></div>

        <div className="border-t pt-3 space-y-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Parent / Guardian</div>
          <div><Label>Name</Label><Input value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Phone</Label><Input value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} /></div>
            <div><Label>Email</Label><Input type="email" value={form.parent_email} onChange={(e) => setForm({ ...form, parent_email: e.target.value })} /></div>
          </div>
          <div><Label>Address</Label><Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div><Label>Medical Notes</Label><Textarea rows={2} value={form.medical_notes} onChange={(e) => setForm({ ...form, medical_notes: e.target.value })} /></div>
        </div>

        <div className="border-t pt-3 space-y-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Documents</div>
          <p className="text-[11px] text-muted-foreground">Attach a file for each document you have. All are optional but recommended.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DOC_TYPES.map(d => (
              <div key={d.key} className="space-y-1">
                <Label className="text-xs">{d.label}</Label>
                <Input
                  type="file"
                  accept={d.accept}
                  onChange={(e) => setDocs(prev => ({ ...prev, [d.key]: e.target.files?.[0] ?? null }))}
                />
                {docs[d.key] && <p className="text-[10px] text-muted-foreground truncate">{docs[d.key]!.name}</p>}
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">A unique Student ID (STU-{settings?.academic_year ?? new Date().getFullYear()}-XXXXXX), admission number, and login password are generated automatically. If a dormitory matches the student's gender (boarding school) the system will auto-assign one. If a default insurance policy is set, the student will be auto-enrolled.</p>
        <DialogFooter>
          <Button type="submit" disabled={m.isPending}>
            {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Admit Student
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

