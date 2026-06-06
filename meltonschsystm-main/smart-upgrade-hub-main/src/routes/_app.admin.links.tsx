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
  const resolveFn = useServerFn(resolvePendingLink);
  const [parentLinks, setParentLinks] = useState<any[]>([]);
  const [studentLinks, setStudentLinks] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [pendingChoice, setPendingChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // forms
  const [pUid, setPUid] = useState("");
  const [pStu, setPStu] = useState("");
  const [pRel, setPRel] = useState("parent");
  const [sUid, setSUid] = useState("");
  const [sStu, setSStu] = useState("");

  async function load() {
    const [pl, sl, st, pq] = await Promise.all([
      supabase.from("parent_student_links").select("*, students(first_name,last_name,admission_no)").order("created_at", { ascending: false }),
      supabase.from("student_user_links").select("*, students(first_name,last_name,admission_no)").order("created_at", { ascending: false }),
      supabase.from("students").select("id, first_name, last_name, admission_no").order("admission_no").limit(500),
      supabase.from("pending_parent_links").select("*").eq("status", "pending").order("created_at", { ascending: false }),
    ]);
    setParentLinks(pl.data ?? []);
    setStudentLinks(sl.data ?? []);
    setStudents(st.data ?? []);
    setPending(pq.data ?? []);
  }
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  async function resolve(pending_id: string, decision: "approve" | "reject") {
    try {
      const student_id = decision === "approve" ? pendingChoice[pending_id] : undefined;
      if (decision === "approve" && !student_id) return toast.error("Pick a student to approve");
      await resolveFn({ data: { pending_id, decision, student_id } });
      toast.success(decision === "approve" ? "Approved & linked" : "Rejected");
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  // Resolve a Unique ID (e.g. PAR-2026-000001 or STU-2026-...) to the auth user UUID.
  async function resolveUidToUserId(uniqueIdOrUuid: string): Promise<string | null> {
    const trimmed = uniqueIdOrUuid.trim();
    if (!trimmed) return null;
    // Already a UUID? pass through.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) return trimmed;
    const { data, error } = await supabase
      .from("user_credentials")
      .select("user_id")
      .ilike("unique_id", trimmed)
      .maybeSingle();
    if (error) { toast.error(error.message); return null; }
    if (!data) { toast.error(`No account found for "${trimmed}"`); return null; }
    return data.user_id;
  }

  async function linkParent() {
    if (!pUid || !pStu) return toast.error("Enter both fields");
    setBusy(true);
    const uid = await resolveUidToUserId(pUid);
    if (!uid) { setBusy(false); return; }
    const { error } = await supabase.from("parent_student_links").insert({
      parent_user_id: uid, student_id: pStu, relationship: pRel, link_method: "manual_admin", verified: true,
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
    const uid = await resolveUidToUserId(sUid);
    if (!uid) { setBusy(false); return; }
    const { error } = await supabase.from("student_user_links").insert({
      user_id: uid, student_id: sStu,
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
          Connect student accounts to student records, and parent accounts to their children. Enter the user's <b>Unique ID</b> (e.g. PAR-2026-000001) — UUIDs also work.
        </p>
      </div>


      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending requests {pending.length > 0 && <Badge variant="secondary" className="ml-2">{pending.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="parents">Parent ↔ Student</TabsTrigger>
          <TabsTrigger value="students">Student account ↔ Student record</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Parent link requests</CardTitle>
              <CardDescription>
                Parents whose email/phone didn't match any student record on signup. Approve by selecting the correct child.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {pending.length === 0 && <p className="text-sm text-muted-foreground">No pending requests.</p>}
              {pending.map((p) => (
                <div key={p.id} className="rounded-md border p-3 space-y-2">
                  <div className="text-sm">
                    <div className="font-medium">Parent UID: <span className="font-mono text-xs">{p.parent_user_id}</span></div>
                    <div className="text-xs text-muted-foreground">
                      Email: {p.parent_email ?? "—"} · Phone: {p.parent_phone ?? "—"}
                      {p.attempted_code && <> · Tried code: <span className="font-mono">{p.attempted_code}</span></>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <select
                      value={pendingChoice[p.id] ?? ""}
                      onChange={(e) => setPendingChoice({ ...pendingChoice, [p.id]: e.target.value })}
                      className="flex-1 min-w-[200px] h-9 rounded-md border bg-transparent px-3 text-sm"
                    >
                      <option value="">Match to student…</option>
                      {students.map((s) => <option key={s.id} value={s.id}>{s.admission_no} — {s.first_name} {s.last_name}</option>)}
                    </select>
                    <Button size="sm" onClick={() => resolve(p.id, "approve")}>
                      <Check className="w-3.5 h-3.5 mr-1" />Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => resolve(p.id, "reject")}>
                      <X className="w-3.5 h-3.5 mr-1" />Reject
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="parents" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Link a parent to a child</CardTitle><CardDescription>One parent can be linked to multiple children.</CardDescription></CardHeader>
            <CardContent className="grid md:grid-cols-4 gap-3">
              <div className="md:col-span-2 space-y-1"><Label>Parent Unique ID</Label><Input value={pUid} onChange={(e) => setPUid(e.target.value)} placeholder="PAR-2026-000001 or UUID" /></div>
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
                    <div className="font-medium flex items-center gap-2 flex-wrap">
                      {l.students?.first_name} {l.students?.last_name}
                      <Badge variant="secondary">{l.relationship}</Badge>
                      {l.verified ? <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/30">verified</Badge>
                                  : <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30">unverified</Badge>}
                      {l.link_method && <Badge variant="outline" className="text-[10px]">{l.link_method}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {l.students?.admission_no} · parent uid: {l.parent_user_id}
                      {l.parent_email && <> · ✉ {l.parent_email}</>}
                      {l.parent_phone && <> · ☎ {l.parent_phone}</>}
                    </div>
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
              <div className="md:col-span-2 space-y-1"><Label>Student Unique ID</Label><Input value={sUid} onChange={(e) => setSUid(e.target.value)} placeholder="STU-2026-000001 or UUID" /></div>
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
