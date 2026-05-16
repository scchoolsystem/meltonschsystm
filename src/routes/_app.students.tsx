import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { admitStudent } from "@/lib/admissions.functions";
import { PhotoCapture, uploadPhotoDataUrl } from "@/components/PhotoCapture";
import { IdCard } from "@/components/IdCard";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/students")({
  component: StudentsPage,
});

interface ClassRow { id: string; name: string }
interface Student {
  id: string; admission_no: string; first_name: string; last_name: string;
  gender: string | null; class_id: string | null; status: string;
  parent_phone: string | null;
  classes?: { name: string } | null;
}

function StudentsPage() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const canEdit = isAdmin || hasRole("admission_officer") || hasRole("deputy_principal");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, admission_no, first_name, last_name, gender, class_id, status, parent_phone, classes(name)")
        .order("admission_no", { ascending: false });
      if (error) throw error;
      return data as unknown as Student[];
    },
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["classes-min"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, name").order("name");
      return (data ?? []) as ClassRow[];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["school-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("school_settings").select("school_name, academic_year, current_term").limit(1).maybeSingle();
      return data;
    },
  });

  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    return students.filter((s) =>
      !t ||
      s.admission_no.toLowerCase().includes(t) ||
      s.first_name.toLowerCase().includes(t) ||
      s.last_name.toLowerCase().includes(t)
    );
  }, [students, q]);

  function exportCsv() {
    const rows = [
      ["Admission No", "First Name", "Last Name", "Gender", "Class", "Status", "Parent Phone"],
      ...filtered.map((s) => [s.admission_no, s.first_name, s.last_name, s.gender ?? "", s.classes?.name ?? "", s.status, s.parent_phone ?? ""]),
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
          <p className="text-sm text-muted-foreground mt-1">{students.length} total enrolled</p>
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

      <Card>
        <CardHeader>
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name or admission no…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
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
                    <TableHead>Name</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Parent Phone</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">No students found.</TableCell></TableRow>
                  )}
                  {filtered.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.admission_no}</TableCell>
                      <TableCell className="font-medium">{s.first_name} {s.last_name}</TableCell>
                      <TableCell>{s.classes?.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="capitalize">{s.gender ?? "—"}</TableCell>
                      <TableCell>{s.parent_phone ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={s.status} /></TableCell>
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-success/15 text-success border-success/30",
    inactive: "bg-muted text-muted-foreground",
    transferred: "bg-warning/15 text-warning-foreground border-warning/30",
    graduated: "bg-accent/15 text-accent border-accent/30",
  };
  return <Badge variant="outline" className={map[status] ?? ""}>{status}</Badge>;
}

function AdmitStudentDialog({ classes, settings, onDone }: { classes: ClassRow[]; settings: any; onDone: () => void }) {
  const admit = useServerFn(admitStudent);
  const [photo, setPhoto] = useState<string | null>(null);
  const [form, setForm] = useState({
    first_name: "", last_name: "", gender: "", class_id: "",
    parent_name: "", parent_phone: "", parent_email: "", date_of_birth: "",
    address: "", medical_notes: "",
  });
  const [result, setResult] = useState<null | { uniqueId: string; password: string; admission_no: string; full_name: string; photo_url: string | null; class_name?: string }>(null);

  const m = useMutation({
    mutationFn: async () => {
      let photo_url: string | undefined;
      if (photo) {
        photo_url = await uploadPhotoDataUrl(supabase, photo, "students", `${form.first_name}-${form.last_name}`.toLowerCase().replace(/\s+/g, "-"));
      }
      const payload: any = {
        first_name: form.first_name, last_name: form.last_name,
        parent_name: form.parent_name, parent_phone: form.parent_phone, parent_email: form.parent_email,
        address: form.address, medical_notes: form.medical_notes,
        photo_url,
      };
      if (form.gender) payload.gender = form.gender;
      if (form.date_of_birth) payload.date_of_birth = form.date_of_birth;
      if (form.class_id) payload.class_id = form.class_id;
      const res = await admit({ data: payload });
      return { ...res, photo_url: photo_url ?? null };
    },
    onSuccess: (res) => {
      toast.success("Student admitted");
      const cls = classes.find((c) => c.id === form.class_id)?.name;
      setResult({
        uniqueId: res.uniqueId,
        password: res.password,
        admission_no: res.student.admission_no,
        full_name: `${res.student.first_name} ${res.student.last_name}`,
        photo_url: res.photo_url,
        class_name: cls,
      });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (result) {
    return (
      <DialogContent className="max-w-xl">
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
          <Label>Class</Label>
          <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v })}>
            <SelectTrigger><SelectValue placeholder="Assign class" /></SelectTrigger>
            <SelectContent>
              {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
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
        <p className="text-xs text-muted-foreground">A unique Student ID (STU-{settings?.academic_year ?? new Date().getFullYear()}-XXXXXX), admission number, and login password are generated automatically.</p>
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
