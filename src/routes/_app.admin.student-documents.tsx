import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/admin/student-documents")({ component: StudentDocumentsPage });

const DOC_LABELS: Record<string,string> = {
  birth_certificate:"Birth Certificate", report_form:"Previous Report Form",
  passport_photo:"Passport Photo", medical_records:"Medical Records",
  transfer_letter:"Transfer Letter", national_id:"National ID",
  parent_id:"Parent/Guardian ID", other:"Other",
};

function StudentDocumentsPage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [q, setQ] = useState("");
  const [openUpload, setOpenUpload] = useState(false);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["student-docs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_documents")
        .select("*, students(first_name,last_name,admission_no)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: students = [] } = useQuery({
    queryKey: ["students-min-docs"],
    queryFn: async () => (await supabase.from("students").select("id,admission_no,first_name,last_name").eq("lifecycle_status","active").order("admission_no").limit(500)).data ?? [],
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("student_documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["student-docs"] }); },
    onError: (e:any) => toast.error(e.message),
  });

  const filtered = docs.filter((d:any) => {
    const name = (d.students?.first_name+" "+d.students?.last_name+" "+d.students?.admission_no).toLowerCase();
    return name.includes(q.toLowerCase());
  });

  const getUrl = async (path: string) => {
    const { data } = await supabase.storage.from("student-documents").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Student Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">{docs.length} documents on file</p>
        </div>
        {isAdmin && (
          <Dialog open={openUpload} onOpenChange={setOpenUpload}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Upload Document</Button></DialogTrigger>
            <UploadDocDialog students={students as any[]} onDone={() => { setOpenUpload(false); qc.invalidateQueries({ queryKey: ["student-docs"] }); }} />
          </Dialog>
        )}
      </div>
      <div className="flex gap-2">
        <Input placeholder="Search by student name or admission no..." value={q} onChange={e => setQ(e.target.value)} className="max-w-sm" />
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="h-40 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Adm No</TableHead>
                <TableHead>Document Type</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Uploaded</TableHead>
                {isAdmin && <TableHead />}
              </TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No documents found.</TableCell></TableRow>}
                {filtered.map((d:any) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.students?.first_name} {d.students?.last_name}</TableCell>
                    <TableCell className="font-mono text-xs">{d.students?.admission_no}</TableCell>
                    <TableCell><Badge variant="outline">{DOC_LABELS[d.doc_type] ?? d.doc_type}</Badge></TableCell>
                    <TableCell>
                      <button onClick={() => getUrl(d.file_path)} className="flex items-center gap-1 text-primary hover:underline text-sm">
                        {d.file_name ?? "View"} <ExternalLink className="w-3 h-3" />
                      </button>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString()}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <button onClick={() => deleteMut.mutate(d.id)} className="text-destructive hover:opacity-70"><Trash2 className="w-4 h-4" /></button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UploadDocDialog({ students, onDone }: { students: any[]; onDone: () => void }) {
  const [studentId, setStudentId] = useState("");
  const [docType, setDocType] = useState("");
  const [file, setFile] = useState<File|null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!studentId || !docType || !file) return toast.error("Fill all fields and pick a file");
    setBusy(true);
    try {
      const path = "uploads/"+Date.now()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
      const { error: upErr } = await supabase.storage.from("student-documents").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { error } = await supabase.from("student_documents").insert({ student_id: studentId, doc_type: docType, file_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size });
      if (error) throw error;
      toast.success("Document uploaded");
      onDone();
    } catch(e:any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Upload Student Document</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Student</Label>
          <Select value={studentId} onValueChange={setStudentId}>
            <SelectTrigger><SelectValue placeholder="Choose student" /></SelectTrigger>
            <SelectContent>{students.map((s:any) => <SelectItem key={s.id} value={s.id}>{s.admission_no} – {s.first_name} {s.last_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Document Type</Label>
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger><SelectValue placeholder="Choose type" /></SelectTrigger>
            <SelectContent>
              {Object.entries({birth_certificate:"Birth Certificate",report_form:"Previous Report Form",passport_photo:"Passport Photo",medical_records:"Medical Records",transfer_letter:"Transfer Letter",national_id:"National ID",parent_id:"Parent/Guardian ID",other:"Other"}).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>File</Label><Input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} /></div>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Upload</Button>
      </DialogFooter>
    </DialogContent>
  );
}