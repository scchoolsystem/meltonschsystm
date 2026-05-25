import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/portal/student")({
  component: StudentPortal,
});

function StudentPortal() {
  const { user, fullName } = useAuth();
  const [student, setStudent] = useState<any>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: link } = await supabase
        .from("student_user_links")
        .select("student_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!link) { setLoading(false); return; }
      const sid = link.student_id;

      const [s, a, r, i, l, an] = await Promise.all([
        supabase.from("students").select("*, classes(name, level, stream)").eq("id", sid).maybeSingle(),
        supabase.from("attendance_records").select("*").eq("student_id", sid).order("date", { ascending: false }).limit(30),
        supabase.from("exam_results").select("*, subjects(name, code), exams(name, term, year)").eq("student_id", sid).order("created_at", { ascending: false }).limit(50),
        supabase.from("invoices").select("*").eq("student_id", sid).order("created_at", { ascending: false }),
        supabase.from("book_loans").select("*, books(title, author)").eq("student_id", sid).order("borrowed_on", { ascending: false }).limit(20),
        supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(10),
      ]);
      setStudent(s.data);
      setAttendance(a.data ?? []);
      setResults(r.data ?? []);
      setInvoices(i.data ?? []);
      setLoans(l.data ?? []);
      setAnnouncements(an.data ?? []);
      setLoading(false);
    })();
  }, [user]);

  if (loading) return <div className="p-6 text-muted-foreground">Loading your portal…</div>;
  if (!student) return (
    <div className="p-6">
      <Card><CardContent className="py-12 text-center text-muted-foreground">
        Your account is not linked to a student record yet. Please contact the school admin.
      </CardContent></Card>
    </div>
  );

  const totalDue = invoices.reduce((s, i) => s + Number(i.amount) - Number(i.paid), 0);
  const present = attendance.filter(a => a.status === "present").length;
  const attRate = attendance.length ? Math.round((present / attendance.length) * 100) : 0;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Welcome, {fullName || student.first_name}</h1>
        <p className="text-sm text-muted-foreground">
          {student.admission_no} · {student.classes?.name ?? "No class"} · {student.unique_id ?? ""}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Attendance (30d)" value={`${attRate}%`} hint={`${present}/${attendance.length} days`} />
        <StatCard label="Outstanding Fees" value={`KES ${totalDue.toLocaleString()}`} hint={`${invoices.length} invoice(s)`} />
        <StatCard label="Books on Loan" value={String(loans.filter(l => l.status === "active").length)} hint={`${loans.length} total`} />
      </div>

      <Tabs defaultValue="results">
        <TabsList>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="fees">Fees</TabsTrigger>
          <TabsTrigger value="library">Library</TabsTrigger>
          <TabsTrigger value="news">Announcements</TabsTrigger>
        </TabsList>

        <TabsContent value="results">
          <Card><CardContent className="pt-6 space-y-2">
            {results.length === 0 && <p className="text-sm text-muted-foreground">No results yet.</p>}
            {results.map(r => (
              <div key={r.id} className="flex items-center justify-between border-b py-2">
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
            {attendance.length === 0 && <p className="text-sm text-muted-foreground">No attendance records.</p>}
            {attendance.map(a => (
              <div key={a.id} className="flex justify-between py-1 border-b text-sm">
                <span>{a.date}</span>
                <Badge variant={a.status === "present" ? "default" : a.status === "absent" ? "destructive" : "secondary"}>{a.status}</Badge>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="fees">
          <Card><CardContent className="pt-6 space-y-2">
            {invoices.length === 0 && <p className="text-sm text-muted-foreground">No invoices.</p>}
            {invoices.map(i => (
              <div key={i.id} className="flex justify-between items-center border-b py-2">
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

        <TabsContent value="library">
          <Card><CardContent className="pt-6 space-y-2">
            {loans.length === 0 && <p className="text-sm text-muted-foreground">No book loans.</p>}
            {loans.map(l => (
              <div key={l.id} className="flex justify-between items-center border-b py-2 text-sm">
                <div>
                  <div className="font-medium">{l.books?.title}</div>
                  <div className="text-xs text-muted-foreground">{l.books?.author} · borrowed {l.borrowed_on}</div>
                </div>
                <Badge variant={l.status === "active" ? "default" : "secondary"}>{l.status}</Badge>
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

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardDescription>{label}</CardDescription><CardTitle className="text-2xl">{value}</CardTitle></CardHeader>
      {hint && <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  );
}
