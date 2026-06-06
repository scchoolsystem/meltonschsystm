import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { redeemParentCode, autoLinkParent } from "@/lib/parent-link.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/portal/parent")({
  component: ParentPortal,
});

function ParentPortal() {
  const { user, fullName } = useAuth();
  const [children, setChildren] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [data, setData] = useState<any>({ attendance: [], results: [], invoices: [] });
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: links } = await supabase
        .from("parent_student_links")
        .select("student_id, relationship, students(id, first_name, last_name, admission_no, unique_id, classes(name))")
        .eq("parent_user_id", user.id);
      const kids = (links ?? []).map((l: any) => l.students).filter(Boolean);
      setChildren(kids);
      if (kids[0]) setActiveId(kids[0].id);
      const { data: an } = await supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(10);
      setAnnouncements(an ?? []);
      setLoading(false);
    })();
  }, [user]);

  useEffect(() => {
    if (!activeId) return;
    (async () => {
      const stu = children.find(c => c.id === activeId);
      const classId = stu?.classes?.id ?? null;
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const until = new Date(Date.now() + 14 * 864e5).toISOString();
      const [a, r, i, lu, la, dr] = await Promise.all([
        supabase.from("attendance_records").select("*").eq("student_id", activeId).order("date", { ascending: false }).limit(30),
        supabase.from("exam_results").select("*, subjects(name), exams(name, term, year)").eq("student_id", activeId).order("created_at", { ascending: false }).limit(50),
        supabase.from("invoices").select("*").eq("student_id", activeId).order("created_at", { ascending: false }),
        classId
          ? (supabase as any).from("live_sessions").select("id, title, scheduled_start, status").eq("class_id", classId).gte("scheduled_start", since).lte("scheduled_start", until).order("scheduled_start")
          : Promise.resolve({ data: [] } as any),
        (supabase as any).from("live_session_attendance").select("id, status, duration_seconds, live_sessions(title, scheduled_start)").eq("student_id", activeId).order("created_at", { ascending: false }).limit(30),
        supabase.from("discipline_records").select("*").eq("student_id", activeId).order("incident_date", { ascending: false }).limit(20),
      ]);
      setData({ attendance: a.data ?? [], results: r.data ?? [], invoices: i.data ?? [], liveUpcoming: lu.data ?? [], liveAttendance: la.data ?? [], discipline: dr.data ?? [] });
    })();
  }, [activeId, children]);

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (children.length === 0) return <LinkChildPanel onLinked={() => window.location.reload()} />;

  const active = children.find(c => c.id === activeId);
  const totalDue = data.invoices.reduce((s: number, i: any) => s + Number(i.amount) - Number(i.paid), 0);
  const present = data.attendance.filter((a: any) => a.status === "present").length;
  const attRate = data.attendance.length ? Math.round((present / data.attendance.length) * 100) : 0;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Hello, {fullName || "Parent"}</h1>
          <p className="text-sm text-muted-foreground">Viewing: {active?.first_name} {active?.last_name} · {active?.admission_no}</p>
        </div>
        {children.length > 1 && (
          <Select value={activeId} onValueChange={setActiveId}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              {children.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name} ({c.admission_no})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Class" value={active?.classes?.name ?? "—"} />
        <StatCard label="Attendance" value={`${attRate}%`} hint={`${present}/${data.attendance.length} days`} />
        <StatCard label="Outstanding Fees" value={`KES ${totalDue.toLocaleString()}`} hint={`${data.invoices.length} invoice(s)`} />
      </div>

      <Tabs defaultValue="results">
        <TabsList>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="fees">Fees</TabsTrigger>
          <TabsTrigger value="live">Live Classes</TabsTrigger>
          <TabsTrigger value="discipline">Discipline</TabsTrigger>
          <TabsTrigger value="news">School News</TabsTrigger>
        </TabsList>

        <TabsContent value="results">
          <Card><CardContent className="pt-6 space-y-2">
            {data.results.length === 0 && <p className="text-sm text-muted-foreground">No results yet.</p>}
            {data.results.map((r: any) => (
              <div key={r.id} className="flex justify-between border-b py-2">
                <div>
                  <div className="font-medium">{r.subjects?.name}</div>
                  <div className="text-xs text-muted-foreground">{r.exams?.name} · {r.exams?.term} {r.exams?.year}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold">{r.score}</div>
                  {r.grade && <Badge variant="secondary">{r.grade}</Badge>}
                </div>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="attendance">
          <Card><CardContent className="pt-6 space-y-1">
            {data.attendance.length === 0 && <p className="text-sm text-muted-foreground">No records.</p>}
            {data.attendance.map((a: any) => (
              <div key={a.id} className="flex justify-between py-1 border-b text-sm">
                <span>{a.date}</span>
                <Badge variant={a.status === "present" ? "default" : a.status === "absent" ? "destructive" : "secondary"}>{a.status}</Badge>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="fees">
          <Card><CardContent className="pt-6 space-y-2">
            {data.invoices.length === 0 && <p className="text-sm text-muted-foreground">No invoices.</p>}
            {data.invoices.map((i: any) => (
              <div key={i.id} className="flex justify-between border-b py-2">
                <div>
                  <div className="font-medium">{i.invoice_no}</div>
                  <div className="text-xs text-muted-foreground">Due: {i.due_date ?? "—"}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm">Paid {Number(i.paid).toLocaleString()} / {Number(i.amount).toLocaleString()}</div>
                  <Badge variant={i.status === "paid" ? "default" : i.status === "partial" ? "secondary" : "destructive"}>{i.status}</Badge>
                </div>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="live">
          <Card>
            <CardHeader><CardTitle className="text-base">Upcoming live classes</CardTitle><CardDescription>Online sessions scheduled for {active?.first_name}'s class.</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {(data.liveUpcoming ?? []).length === 0 && <p className="text-sm text-muted-foreground">No live classes scheduled.</p>}
              {(data.liveUpcoming ?? []).map((s: any) => (
                <div key={s.id} className="flex justify-between items-center border-b py-2 text-sm">
                  <div>
                    <div className="font-medium">{s.title}</div>
                    <div className="text-xs text-muted-foreground">{new Date(s.scheduled_start).toLocaleString()}</div>
                  </div>
                  <Badge variant={s.status === "live" ? "default" : s.status === "ended" ? "secondary" : "outline"}>{s.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="mt-4">
            <CardHeader><CardTitle className="text-base">Live class attendance</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {(data.liveAttendance ?? []).length === 0 && <p className="text-sm text-muted-foreground">No live attendance records.</p>}
              {(data.liveAttendance ?? []).map((a: any) => (
                <div key={a.id} className="flex justify-between items-center border-b py-2 text-sm">
                  <div>
                    <div className="font-medium">{a.live_sessions?.title ?? "Session"}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.live_sessions?.scheduled_start ? new Date(a.live_sessions.scheduled_start).toLocaleString() : ""}
                      {a.duration_seconds ? ` · ${Math.round(a.duration_seconds / 60)} min` : ""}
                    </div>
                  </div>
                  <Badge variant={a.status === "present" ? "default" : a.status === "late" ? "secondary" : "destructive"}>{a.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="discipline">
          <Card><CardContent className="pt-6 space-y-2">
            {(data.discipline ?? []).length === 0 && <p className="text-sm text-muted-foreground">No discipline records.</p>}
            {(data.discipline ?? []).map((d: any) => (
              <div key={d.id} className="border-b py-2">
                <div className="flex justify-between">
                  <div className="font-medium">{d.category}</div>
                  <Badge variant={d.severity === "major" ? "destructive" : "secondary"}>{d.severity}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">{d.incident_date}</div>
                <div className="text-sm mt-1">{d.description}</div>
                {d.action_taken && <div className="text-xs text-muted-foreground mt-1">Action: {d.action_taken}</div>}
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="news">
          <Card><CardContent className="pt-6 space-y-3">
            {announcements.length === 0 && <p className="text-sm text-muted-foreground">No announcements.</p>}
            {announcements.map(a => (
              <div key={a.id} className="border-b pb-3">
                <div className="flex items-center gap-2">
                  <div className="font-medium">{a.title}</div>
                  {a.pinned && <Badge variant="secondary">Pinned</Badge>}
                </div>
                <div className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{a.body}</div>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LinkChildPanel({ onLinked }: { onLinked: () => void }) {
  const redeem = useServerFn(redeemParentCode);
  const auto = useServerFn(autoLinkParent);
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  async function tryAuto() {
    setBusy(true);
    try {
      const r = await auto({ data: { email, phone } });
      if (r.linked > 0) { toast.success(`Linked to ${r.linked} child(ren)`); onLinked(); }
      else toast.message("No automatic match found. Submitted request to school admin for review.");
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function tryCode() {
    if (!code.trim()) return;
    setBusy(true);
    try {
      await redeem({ data: { code: code.trim() } });
      toast.success("Linked successfully");
      onLinked();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Link your child</h1>
        <p className="text-sm text-muted-foreground mt-1">Connect your account to your child's school record.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Option 1 — Auto-match by contact</CardTitle><CardDescription>We'll check if your email or phone matches a registered parent contact.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Your email" value={email} onChange={e => setEmail(e.target.value)} />
          <Input placeholder="Your phone (as on school record)" value={phone} onChange={e => setPhone(e.target.value)} />
          <Button onClick={tryAuto} disabled={busy}>Find my child</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Option 2 — Parent code (PRN-…)</CardTitle><CardDescription>Enter the code printed on the admission slip.</CardDescription></CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="PRN-2026-XXXXX" value={code} onChange={e => setCode(e.target.value.toUpperCase())} className="font-mono" />
          <Button onClick={tryCode} disabled={busy}>Link</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardDescription>{label}</CardDescription><CardTitle className="text-2xl">{value}</CardTitle></CardHeader>
      {hint && <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  );
}
