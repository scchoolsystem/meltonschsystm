import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { Calendar, Clock, MapPin, User, GraduationCap, Heart, Bed, DoorOpen, Video, FileText, ExternalLink, Bus } from "lucide-react";
import { format } from "date-fns";
import { MpesaPayDialog } from "@/components/MpesaPayDialog";
import { AttendanceHeatmap } from "@/components/AttendanceHeatmap";

export const Route = createFileRoute("/_app/portal/student")({
  component: StudentPortal,
});

const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function StudentPortal() {
  const { user, fullName, loading } = useAuth();
  const [student, setStudent] = useState<any>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [timetable, setTimetable] = useState<any[]>([]);
  const [discipline, setDiscipline] = useState<any[]>([]);
  const [clinic, setClinic] = useState<any[]>([]);
  const [dorm, setDorm] = useState<any | null>(null);
  const [gatePasses, setGatePasses] = useState<any[]>([]);
  const [liveUpcoming, setLiveUpcoming] = useState<any[]>([]);
  const [liveAttendance, setLiveAttendance] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [transport, setTransport] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || loading) return;
    (async () => {
      const { data: link } = await supabase
        .from("student_user_links")
        .select("student_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!link) { setLoading(false); return; }
      const sid = link.student_id;

      const sRes = await supabase
        .from("students")
        .select("*, classes(id, name, level, stream)")
        .eq("id", sid)
        .maybeSingle();
      const stu = sRes.data;
      setStudent(stu);

      const classId = stu?.classes?.id;

      const [a, r, i, l, an, tt, dr, cv, da, gp] = await Promise.all([
        supabase.from("attendance_records").select("*").eq("student_id", sid).order("date", { ascending: false }).limit(30),
        supabase.from("exam_results").select("*, subjects(name, code), exams(name, term, year)").eq("student_id", sid).order("created_at", { ascending: false }).limit(50),
        supabase.from("invoices").select("*").eq("student_id", sid).order("created_at", { ascending: false }),
        supabase.from("book_loans").select("*, books(title, author)").eq("student_id", sid).order("borrowed_on", { ascending: false }).limit(20),
        supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(10),
        classId
          ? supabase.from("timetable_slots").select("*, subjects(name, code), staff(first_name, last_name)").eq("class_id", classId).order("day_of_week").order("start_time")
          : Promise.resolve({ data: [] } as any),
        supabase.from("discipline_records").select("*").eq("student_id", sid).order("incident_date", { ascending: false }).limit(20),
        supabase.from("clinic_visits").select("*").eq("student_id", sid).order("visit_date", { ascending: false }).limit(20),
        supabase.from("dorm_assignments").select("*, dormitories(name, gender)").eq("student_id", sid).order("assigned_on", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("gate_passes").select("*").eq("student_id", sid).order("exit_time", { ascending: false }).limit(20),
      ]);
      setAttendance(a.data ?? []);
      setResults(r.data ?? []);
      setInvoices(i.data ?? []);
      setLoans(l.data ?? []);
      setAnnouncements(an.data ?? []);
      setTimetable((tt as any).data ?? []);
      setDiscipline(dr.data ?? []);
      setClinic(cv.data ?? []);
      setDorm((da as any).data ?? null);
      setGatePasses(gp.data ?? []);

      // Live classes for this student's class (next 14 days + recent)
      if (classId) {
        const since = new Date(Date.now() - 7 * 864e5).toISOString();
        const until = new Date(Date.now() + 14 * 864e5).toISOString();
        const { data: ls } = await (supabase as any)
          .from("live_sessions")
          .select("id, title, scheduled_start, scheduled_end, status, room_name, classes(name)")
          .eq("class_id", classId)
          .gte("scheduled_start", since)
          .lte("scheduled_start", until)
          .order("scheduled_start", { ascending: true });
        setLiveUpcoming(ls ?? []);
      }
      const { data: la } = await (supabase as any)
        .from("live_session_attendance")
        .select("id, status, joined_at, left_at, duration_seconds, live_sessions(title, scheduled_start)")
        .eq("student_id", sid)
        .order("created_at", { ascending: false })
        .limit(30);
      setLiveAttendance(la ?? []);

      const { data: docs } = await (supabase as any)
        .from("student_documents")
        .select("*")
        .eq("student_id", sid)
        .order("created_at", { ascending: false });
      setDocuments(docs ?? []);

      const { data: tr } = await (supabase as any)
        .from("transport_assignments")
        .select("*, transport_routes(name, pickup_point, dropoff_point, driver_name, driver_phone, vehicle_reg)")
        .eq("student_id", sid)
        .order("assigned_on", { ascending: false })
        .limit(1)
        .maybeSingle();
      setTransport(tr ?? null);

      setLoading(false);
    })();
  }, [user, loading]);

  const today = new Date();
  const todayDow = ((today.getDay() + 6) % 7) + 1; // Mon=1..Sun=7
  const todaySlots = useMemo(
    () => timetable.filter((s) => s.day_of_week === todayDow),
    [timetable, todayDow]
  );
  const nowMin = today.getHours() * 60 + today.getMinutes();
  const nextSlot = useMemo(() => {
    const toMin = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    return todaySlots.find((s) => toMin(s.end_time) > nowMin) ?? null;
  }, [todaySlots, nowMin]);

  if (loading) return <div className="p-6 text-muted-foreground">Loading your portal…</div>;
  if (!student) return (
    <div className="p-6">
      <Card><CardContent className="py-12 text-center text-muted-foreground">
        Your account is not linked to a student record yet. Please contact the school admin.
      </CardContent></Card>
    </div>
  );

  const totalDue = invoices.reduce((s, i) => s + Number(i.amount) - Number(i.paid), 0);
  const present = attendance.filter((a) => a.status === "present").length;
  const attRate = attendance.length ? Math.round((present / attendance.length) * 100) : 0;
  const initials = `${student.first_name?.[0] ?? ""}${student.last_name?.[0] ?? ""}`.toUpperCase();
  const avgScore = results.length
    ? Math.round(results.reduce((a, r) => a + Number(r.score || 0), 0) / results.length)
    : null;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Identity header */}
      <Card>
        <CardContent className="pt-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={student.photo_url ?? undefined} alt={fullName ?? student.first_name} />
            <AvatarFallback className="text-xl">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{fullName || `${student.first_name} ${student.last_name}`}</h1>
            <p className="text-sm text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-1">
              <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{student.unique_id ?? student.admission_no}</span>
              <span className="inline-flex items-center gap-1"><GraduationCap className="w-3 h-3" />{student.classes?.name ?? "No class"}</span>
              {dorm?.dormitories?.name && (
                <span className="inline-flex items-center gap-1"><Bed className="w-3 h-3" />{dorm.dormitories.name}{dorm.bed_no ? ` · Bed ${dorm.bed_no}` : ""}</span>
              )}
            </p>
          </div>
          {nextSlot && (
            <div className="rounded-lg border bg-primary/5 px-4 py-3 text-sm">
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><Clock className="w-3 h-3" /> Up next today</div>
              <div className="font-semibold">{nextSlot.subjects?.name ?? "Lesson"}</div>
              <div className="text-xs text-muted-foreground">
                {nextSlot.start_time?.slice(0, 5)}–{nextSlot.end_time?.slice(0, 5)}
                {nextSlot.room ? ` · ${nextSlot.room}` : ""}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Attendance (30d)" value={`${attRate}%`} hint={`${present}/${attendance.length} days`} />
        <StatCard label="Average Score" value={avgScore !== null ? `${avgScore}%` : "—"} hint={`${results.length} result(s)`} />
        <StatCard label="Outstanding Fees" value={`KES ${totalDue.toLocaleString()}`} hint={`${invoices.length} invoice(s)`} />
        <StatCard label="Books on Loan" value={String(loans.filter((l) => l.status === "active").length)} hint={`${loans.length} total`} />
      </div>

      <Tabs defaultValue="today">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="today">My Day</TabsTrigger>
          <TabsTrigger value="timetable">Timetable</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="fees">Fees</TabsTrigger>
          <TabsTrigger value="library">Library</TabsTrigger>
          <TabsTrigger value="discipline">Discipline</TabsTrigger>
          <TabsTrigger value="clinic">Clinic</TabsTrigger>
          <TabsTrigger value="gate">Gate Passes</TabsTrigger>
          <TabsTrigger value="transport">Transport</TabsTrigger>
          <TabsTrigger value="live">Live Classes</TabsTrigger>
          <TabsTrigger value="news">News</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="today">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Calendar className="w-4 h-4" /> {DAYS[todayDow]}, today</CardTitle>
              <CardDescription>Your lessons for today</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {todaySlots.length === 0 && <p className="text-sm text-muted-foreground">No lessons scheduled today.</p>}
              {todaySlots.map((s) => {
                const isNow = nextSlot?.id === s.id;
                return (
                  <div key={s.id} className={`flex items-center justify-between border rounded-md p-3 ${isNow ? "border-primary bg-primary/5" : ""}`}>
                    <div>
                      <div className="font-medium">{s.subjects?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.staff ? `${s.staff.first_name} ${s.staff.last_name}` : "TBA"}
                        {s.room ? ` · ${s.room}` : ""}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-mono">{s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</div>
                      {isNow && <Badge className="mt-1">Now / next</Badge>}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timetable">
          <Card><CardContent className="pt-6">
            {timetable.length === 0 ? (
              <p className="text-sm text-muted-foreground">No timetable published for your class yet.</p>
            ) : (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5, 6, 7].map((dow) => {
                  const slots = timetable.filter((s) => s.day_of_week === dow);
                  if (slots.length === 0) return null;
                  return (
                    <div key={dow}>
                      <div className="text-sm font-semibold mb-1">{DAYS[dow]}</div>
                      <div className="space-y-1">
                        {slots.map((s) => (
                          <div key={s.id} className="flex justify-between border-b py-1 text-sm">
                            <span className="font-mono text-xs text-muted-foreground w-24">{s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</span>
                            <span className="flex-1">{s.subjects?.name}</span>
                            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                              {s.room && <><MapPin className="w-3 h-3" />{s.room}</>}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="results">
          <Card><CardContent className="pt-6 space-y-2">
            {results.length === 0 && <p className="text-sm text-muted-foreground">No results yet.</p>}
            {results.map((r) => (
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
          <Card><CardContent className="pt-6 space-y-4">
            {attendance.length === 0 ? <p className="text-sm text-muted-foreground">No attendance records.</p> : (
              <>
                <AttendanceHeatmap records={attendance} />
                <div className="space-y-1">
                  {attendance.map((a) => (
                    <div key={a.id} className="flex justify-between py-1 border-b text-sm">
                      <span>{a.date}</span>
                      <Badge variant={a.status === "present" ? "default" : a.status === "absent" ? "destructive" : "secondary"}>{a.status}</Badge>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="fees">
          <Card><CardContent className="pt-6 space-y-2">
            {invoices.length === 0 && <p className="text-sm text-muted-foreground">No invoices.</p>}
            {invoices.map((i) => {
              const outstanding = Number(i.amount) - Number(i.paid);
              return (
                <div key={i.id} className="flex justify-between items-center border-b py-2 gap-3">
                  <div>
                    <div className="font-medium">{i.invoice_no}</div>
                    <div className="text-xs text-muted-foreground">Due: {i.due_date ?? "—"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm">Paid {Number(i.paid).toLocaleString()} / {Number(i.amount).toLocaleString()}</div>
                    <Badge variant={i.status === "paid" ? "default" : i.status === "partial" ? "secondary" : "destructive"}>{i.status}</Badge>
                  </div>
                  {outstanding > 0 && (
                    <MpesaPayDialog
                      invoiceId={i.id}
                      outstanding={outstanding}
                      defaultPhone={student?.parent_phone ?? ""}
                    />
                  )}
                </div>
              );
            })}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="library">
          <Card><CardContent className="pt-6 space-y-2">
            {loans.length === 0 && <p className="text-sm text-muted-foreground">No book loans.</p>}
            {loans.map((l) => (
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

        <TabsContent value="discipline">
          <Card><CardContent className="pt-6 space-y-2">
            {discipline.length === 0 && <p className="text-sm text-muted-foreground">No discipline records — keep it up!</p>}
            {discipline.map((d) => (
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

        <TabsContent value="clinic">
          <Card><CardContent className="pt-6 space-y-2">
            {clinic.length === 0 && <p className="text-sm text-muted-foreground">No clinic visits.</p>}
            {clinic.map((c) => (
              <div key={c.id} className="border-b py-2">
                <div className="flex justify-between">
                  <div className="font-medium inline-flex items-center gap-1"><Heart className="w-3 h-3" /> {c.visit_date}</div>
                  {c.referred_to && <Badge variant="outline">Referred: {c.referred_to}</Badge>}
                </div>
                <div className="text-sm mt-1"><span className="text-muted-foreground">Symptoms:</span> {c.symptoms}</div>
                {c.diagnosis && <div className="text-sm"><span className="text-muted-foreground">Diagnosis:</span> {c.diagnosis}</div>}
                {c.treatment && <div className="text-sm"><span className="text-muted-foreground">Treatment:</span> {c.treatment}</div>}
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="gate">
          <Card><CardContent className="pt-6 space-y-2">
            {gatePasses.length === 0 && <p className="text-sm text-muted-foreground">No gate passes on record.</p>}
            {gatePasses.map((g) => (
              <div key={g.id} className="border-b py-2">
                <div className="flex justify-between">
                  <div className="font-medium inline-flex items-center gap-1"><DoorOpen className="w-3 h-3" /> {g.reason}</div>
                  <Badge variant={g.status === "out" ? "destructive" : "default"}>{g.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Out: {new Date(g.exit_time).toLocaleString()}
                  {g.actual_return && ` · Back: ${new Date(g.actual_return).toLocaleString()}`}
                </div>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="transport">
          <Card><CardContent className="pt-6">
            {!transport ? (
              <p className="text-sm text-muted-foreground inline-flex items-center gap-2"><Bus className="w-4 h-4" /> No transport route assigned.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-base font-medium"><Bus className="w-4 h-4" /> {transport.transport_routes?.name ?? "Route"}</div>
                <div><span className="text-muted-foreground">Pickup:</span> {transport.transport_routes?.pickup_point ?? "—"}</div>
                <div><span className="text-muted-foreground">Drop-off:</span> {transport.transport_routes?.dropoff_point ?? "—"}</div>
                <div><span className="text-muted-foreground">Vehicle:</span> {transport.transport_routes?.vehicle_reg ?? "—"}</div>
                <div><span className="text-muted-foreground">Driver:</span> {transport.transport_routes?.driver_name ?? "—"} {transport.transport_routes?.driver_phone ? `· ${transport.transport_routes.driver_phone}` : ""}</div>
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="live">
          <Card>
            <CardHeader>
              <CardTitle className="text-base inline-flex items-center gap-2"><Video className="w-4 h-4" /> Upcoming & live sessions</CardTitle>
              <CardDescription>Join scheduled online classes for your class.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {liveUpcoming.length === 0 && <p className="text-sm text-muted-foreground">No live classes scheduled.</p>}
              {liveUpcoming.map((s: any) => {
                const start = new Date(s.scheduled_start);
                const now = Date.now();
                const canJoin = s.status === "live" || (start.getTime() - now < 15 * 60_000 && s.status !== "ended" && s.status !== "cancelled");
                return (
                  <div key={s.id} className="flex items-center justify-between border rounded-md p-3">
                    <div>
                      <div className="font-medium">{s.title}</div>
                      <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {start.toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={s.status === "live" ? "default" : s.status === "ended" ? "secondary" : "outline"}>{s.status}</Badge>
                      {canJoin && (
                        <Button asChild size="sm">
                          <Link to="/live/$sessionId" params={{ sessionId: s.id }}>Join</Link>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <Card className="mt-4">
            <CardHeader><CardTitle className="text-base">My attendance (recent)</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {liveAttendance.length === 0 && <p className="text-sm text-muted-foreground">No attendance yet.</p>}
              {liveAttendance.map((a: any) => (
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

        <TabsContent value="news">
          <Card><CardContent className="pt-6 space-y-3">
            {announcements.length === 0 && <p className="text-sm text-muted-foreground">No announcements.</p>}
            {announcements.map((a) => (
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

        <TabsContent value="documents">
          <Card><CardContent className="pt-6">
            {documents.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>No documents uploaded yet</p>
                <p className="text-xs">Ask your school admin to upload your documents</p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((d: any) => {
                  const labels: Record<string, string> = {
                    birth_certificate: "Birth Certificate",
                    report_form: "Previous Report Form",
                    passport_photo: "Passport Photo",
                    medical_records: "Medical Records",
                    transfer_letter: "Transfer Letter",
                    national_id: "National ID",
                    parent_id: "Parent/Guardian ID",
                    other: "Other",
                  };
                  return (
                    <div key={d.id} className="flex items-center justify-between border-b py-2">
                      <Badge variant="secondary">{labels[d.document_type] ?? d.document_type}</Badge>
                      <span className="text-xs text-muted-foreground">{d.created_at ? format(new Date(d.created_at), "dd/MM/yyyy") : ""}</span>
                      <Button variant="ghost" size="sm" onClick={async () => {
                        const { data } = await supabase.storage.from("student-documents").createSignedUrl(d.file_path, 60);
                        if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                      }}>
                        <ExternalLink className="w-4 h-4 mr-1" /> Open
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
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
