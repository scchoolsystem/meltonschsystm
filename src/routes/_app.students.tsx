import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
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
              <AdmitStudentDialog classes={classes} onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["students"] }); }} />
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

function AdmitStudentDialog({ classes, onDone }: { classes: ClassRow[]; onDone: () => void }) {
  const [form, setForm] = useState({
    first_name: "", last_name: "", gender: "", class_id: "",
    parent_name: "", parent_phone: "", parent_email: "", date_of_birth: "",
  });
  const m = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form };
      if (!payload.class_id) delete payload.class_id;
      if (!payload.gender) delete payload.gender;
      if (!payload.date_of_birth) delete payload.date_of_birth;
      const { error } = await supabase.from("students").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Student admitted"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Admit New Student</DialogTitle></DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>First Name</Label><Input required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
          <div><Label>Last Name</Label><Input required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
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
        <div><Label>Parent / Guardian Name</Label><Input value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Parent Phone</Label><Input value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} /></div>
          <div><Label>Parent Email</Label><Input type="email" value={form.parent_email} onChange={(e) => setForm({ ...form, parent_email: e.target.value })} /></div>
        </div>
        <p className="text-xs text-muted-foreground">Admission number will be auto-generated.</p>
        <DialogFooter>
          <Button type="submit" disabled={m.isPending}>
            {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Admit
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
