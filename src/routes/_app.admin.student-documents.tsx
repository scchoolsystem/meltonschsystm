import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Upload, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/_app/admin/student-documents")({
  validateSearch: z.object({ student: z.string().optional() }),
  component: DocsPage,
});

const DOC_TYPES = [
  { value: "birth_certificate", label: "Birth Certificate" },
  { value: "report_form", label: "Report Form" },
  { value: "passport_photo", label: "Passport Photo" },
  { value: "medical_records", label: "Medical Records" },
  { value: "transfer_letter", label: "Transfer Letter" },
  { value: "national_id", label: "National ID" },
  { value: "parent_id", label: "Parent ID" },
  { value: "other", label: "Other" },
];

interface Document {
  id: string;
  doc_type: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  students: {
    first_name: string;
    last_name: string;
    admission_no: string;
  };
}

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  admission_no: string;
}

function DocsPage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const { student: preselect } = Route.useSearch() as { student?: string };
  const [studentId, setStudentId] = useState(preselect ?? "");
  const [open, setOpen] = useState(!!preselect);
  const [docType, setDocType] = useState("birth_certificate");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: docs = [] } = useQuery({
    queryKey: ["student-documents"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("student_documents")
        .select("id, doc_type, file_name, file_path, mime_type, size_bytes, created_at, students(first_name, last_name, admission_no)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: students = [] } = useQuery({
    queryKey: ["students-min-docs"],
    queryFn: async () => {
      const { data } = await supabase.from("students").select("id, first_name, last_name, admission_no").order("admission_no");
      return data ?? [];
    },
  });

  const filtered = docs.filter((d: Document) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (d.students?.first_name ?? "").toLowerCase().includes(q)
      || (d.students?.last_name ?? "").toLowerCase().includes(q)
      || (d.students?.admission_no ?? "").toLowerCase().includes(q)
      || (d.file_name ?? "").toLowerCase().includes(q);
  });

  async function upload() {
    if (!studentId || !file) return toast.error("Pick a student and a file");
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${studentId}/${docType}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("student-documents").upload(path, file, {
        contentType: file.type, upsert: false,
      });
      if (upErr) throw upErr;
      const { error: insErr } = await (supabase as any).from("student_documents").insert({
        student_id: studentId, doc_type: docType, file_path: path,
        file_name: file.name, mime_type: file.type, size_bytes: file.size,
      });
      if (insErr) throw insErr;
      toast.success("Document uploaded");
      setOpen(false); setFile(null); setStudentId("");
      qc.invalidateQueries({ queryKey: ["student-documents"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function viewDoc(path: string) {
    const { data, error } = await supabase.storage.from("student-documents").createSignedUrl(path, 60);
    if (error || !data) return toast.error("Could not open file");
    window.open(data.signedUrl, "_blank");
  }

  async function remove(id: string, path: string) {
    if (!confirm("Delete this document?")) return;
    await supabase.storage.from("student-documents").remove([path]);
    const { error } = await (supabase as any).from("student_documents").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["student-documents"] });
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="w-5 h-5" /> Student Documents</h1>
          <p className="text-sm text-muted-foreground">Upload and manage student document files</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Upload className="w-4 h-4 mr-1" /> Upload document</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Upload student document</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Student</Label>
                <Select value={studentId} onValueChange={setStudentId}>
                  <SelectTrigger><SelectValue placeholder="Pick a student" /></SelectTrigger>
                  <SelectContent>
                    {students.map((s: Student) => (
                      <SelectItem key={s.id} value={s.id}>{s.admission_no} — {s.first_name} {s.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Document type</Label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>File</Label>
                <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
            </div>
            <DialogFooter><Button onClick={upload} disabled={busy}>{busy ? "Uploading..." : "Upload"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All documents</CardTitle>
          <Input placeholder="Search by student or filename..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm mt-2" />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Student</TableHead><TableHead>Adm No</TableHead>
              <TableHead>Type</TableHead><TableHead>File</TableHead>
              <TableHead>Uploaded</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No documents</TableCell></TableRow>
              ) : filtered.map((d: Document) => (
                <TableRow key={d.id}>
                  <TableCell>{d.students?.first_name} {d.students?.last_name}</TableCell>
                  <TableCell>{d.students?.admission_no}</TableCell>
                  <TableCell><Badge variant="outline">{DOC_TYPES.find(t => t.value === d.doc_type)?.label ?? d.doc_type}</Badge></TableCell>
                  <TableCell>
                    <Button variant="link" size="sm" onClick={() => viewDoc(d.file_path)} className="h-auto p-0">
                      <Download className="w-3 h-3 mr-1" /> {d.file_name ?? "View"}
                    </Button>
                  </TableCell>
                  <TableCell className="text-xs">{new Date(d.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {isAdmin && (
                      <Button variant="ghost" size="sm" onClick={() => remove(d.id, d.file_path)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
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
