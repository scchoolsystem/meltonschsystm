import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { resolvePendingLink } from "@/lib/parent-link.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Trash2, Check, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/admin/links")({
  component: LinksPage,
});

function LinksPage() {
  const { isAdmin } = useAuth();
  const [parentLinks, setParentLinks] = useState<any[]>([]);
  const [studentLinks, setStudentLinks] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  // forms
  const [pUid, setPUid] = useState("");
  const [pStu, setPStu] = useState("");
  const [pRel, setPRel] = useState("parent");
  const [sUid, setSUid] = useState("");
  const [sStu, setSStu] = useState("");

  async function load() {
    const [pl, sl, st] = await Promise.all([
      supabase.from("parent_student_links").select("*, students(first_name,last_name,admission_no)").order("created_at", { ascending: false }),
      supabase.from("student_user_links").select("*, students(first_name,last_name,admission_no)").order("created_at", { ascending: false }),
      supabase.from("students").select("id, first_name, last_name, admission_no").order("admission_no").limit(500),
    ]);
    setParentLinks(pl.data ?? []);
    setStudentLinks(sl.data ?? []);
    setStudents(st.data ?? []);
  }
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  async function linkParent() {
    if (!pUid || !pStu) return toast.error("Enter both fields");
    setBusy(true);
    const { error } = await supabase.from("parent_student_links").insert({
      parent_user_id: pUid.trim(), student_id: pStu, relationship: pRel,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Parent linked");
    setPUid(""); setPStu("");
    load();
  }

  async function linkStudent() {
    if (!sUid || !sStu) return toast.error("Enter both fields");
    setBusy(true);
    const { error } = await supabase.from("student_user_links").insert({
      user_id: sUid.trim(), student_id: sStu,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Student linked");
    setSUid(""); setSStu("");
    load();
  }

  async function unlink(table: "parent_student_links" | "student_user_links", id: string) {
    if (!confirm("Remove this link?")) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    load();
  }

  if (!isAdmin) return <div className="p-6"><Card><CardContent className="py-12 text-center text-muted-foreground">Admins only.</CardContent></Card></div>;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Portal Links</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect student accounts to student records, and parent accounts to their children. Use the user's UUID from <b>Users & Credentials</b>.
        </p>
      </div>

      <Tabs defaultValue="parents">
        <TabsList>
          <TabsTrigger value="parents">Parent ↔ Student</TabsTrigger>
          <TabsTrigger value="students">Student account ↔ Student record</TabsTrigger>
        </TabsList>

        <TabsContent value="parents" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Link a parent to a child</CardTitle><CardDescription>One parent can be linked to multiple children.</CardDescription></CardHeader>
            <CardContent className="grid md:grid-cols-4 gap-3">
              <div className="md:col-span-2 space-y-1"><Label>Parent user UUID</Label><Input value={pUid} onChange={(e) => setPUid(e.target.value)} placeholder="uuid" /></div>
              <div className="space-y-1"><Label>Student</Label>
                <select value={pStu} onChange={(e) => setPStu(e.target.value)} className="w-full h-9 rounded-md border bg-transparent px-3 text-sm">
                  <option value="">Select student</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.admission_no} — {s.first_name} {s.last_name}</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label>Relationship</Label><Input value={pRel} onChange={(e) => setPRel(e.target.value)} /></div>
              <div className="md:col-span-4"><Button onClick={linkParent} disabled={busy}>Link parent</Button></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Existing parent links</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {parentLinks.length === 0 && <p className="text-sm text-muted-foreground">No links yet.</p>}
              {parentLinks.map(l => (
                <div key={l.id} className="flex items-center justify-between border-b py-2 text-sm">
                  <div>
                    <div className="font-medium">{l.students?.first_name} {l.students?.last_name} <Badge variant="secondary">{l.relationship}</Badge></div>
                    <div className="text-xs text-muted-foreground">{l.students?.admission_no} · parent uid: {l.parent_user_id}</div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => unlink("parent_student_links", l.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="students" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Link a student account to their record</CardTitle><CardDescription>Each student account maps to exactly one student.</CardDescription></CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-3">
              <div className="md:col-span-2 space-y-1"><Label>Student user UUID</Label><Input value={sUid} onChange={(e) => setSUid(e.target.value)} placeholder="uuid" /></div>
              <div className="space-y-1"><Label>Student record</Label>
                <select value={sStu} onChange={(e) => setSStu(e.target.value)} className="w-full h-9 rounded-md border bg-transparent px-3 text-sm">
                  <option value="">Select student</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.admission_no} — {s.first_name} {s.last_name}</option>)}
                </select>
              </div>
              <div className="md:col-span-3"><Button onClick={linkStudent} disabled={busy}>Link student</Button></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Existing student-account links</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {studentLinks.length === 0 && <p className="text-sm text-muted-foreground">No links yet.</p>}
              {studentLinks.map(l => (
                <div key={l.id} className="flex items-center justify-between border-b py-2 text-sm">
                  <div>
                    <div className="font-medium">{l.students?.first_name} {l.students?.last_name}</div>
                    <div className="text-xs text-muted-foreground">{l.students?.admission_no} · uid: {l.user_id}</div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => unlink("student_user_links", l.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
