import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  User, GraduationCap, DollarSign, Calendar, Heart, Shield, FileText,
  Bed, Bus, Loader2, Pencil, ArrowLeft, Phone, Mail, MapPin, BookOpen, Trophy, Flag,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_app/students/$id")({ component: StudentProfilePage });

function StudentProfilePage() {
  const { id } = Route.useParams();
  const { isAdmin, hasRole } = useAuth();

  // --- access flags ---
  const canEditProfile = isAdmin || hasRole("admission_officer") || hasRole("deputy_principal");
  const canViewFinance  = isAdmin || hasRole("bursar") || hasRole("finance_admin") || hasRole("finance_user");
  const canViewClinic   = isAdmin || hasRole("nurse") || hasRole("clinic_admin") || hasRole("matron");
  const canViewDiscipline = isAdmin || hasRole("discipline_admin") || hasRole("guidance_admin") || hasRole("class_teacher") || hasRole("deputy_principal") || hasRole("teacher");
  const canViewBoarding = isAdmin || hasRole("matron") || hasRole("boarding_admin") || hasRole("boarding_user");
  const canViewTransport = isAdmin || hasRole("transport_admin") || hasRole("transport_officer");

  // FIXED: isTeacher is now actually used — teachers see full profile read-only + Raise Concern
  const isTeacher = hasRole("teacher") || hasRole("class_teacher") || hasRole("subject_teacher") || hasRole("hod") || hasRole("academic_master");
  // Teachers can raise a concern; admins / guidance already have discipline tools
  const canRaiseConcern = isTeacher && !isAdmin;

  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [concernOpen, setConcernOpen] = useState(false);

  const { data: student, isLoading } = useQuery({
    queryKey: ["student-profile", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*, classes(id, name, level, stream)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["classes-min"],
    queryFn: async () => (await supabase.from("classes").select("id, name").order("name")).data ?? [],
  });

  const { data: results = [] } = useQuery({
    queryKey: ["student-results", id],
    queryFn: async () => (await supabase.from("exam_results").select("*, subjects(name,code), exams(name,term,year)").eq("student_id", id).order("created_at", { ascending: false }).limit(30)).data ?? [],
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ["student-attendance", id],
    queryFn: async () => (await supabase.from("attendance_records").select("*").eq("student_id", id).order("date", { ascending: false }).limit(60)).data ?? [],
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["student-invoices", id],
    enabled: canViewFinance,
    queryFn: async () => (await supabase.from("invoices").select("*").eq("student_id", id).order("created_at", { ascending: false })).data ?? [],
  });

  const { data: clinicVisits = [] } = useQuery({
    queryKey: ["student-clinic", id],
    enabled: canViewClinic,
    queryFn: async () => (await supabase.from("clinic_visits").select("*").eq("student_id", id).order("visit_date", { ascending: false })).data ?? [],
  });

  const { data: discipline = [] } = useQuery({
    queryKey: ["student-discipline", id],
    enabled: canViewDiscipline,
    queryFn: async () => (await supabase.from("discipline_records").select("*").eq("student_id", id).order("incident_date", { ascending: false })).data ?? [],
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["student-docs", id],
    queryFn: async () => (await supabase.from("student_documents").select("*").eq("student_id", id).order("created_at", { ascending: false })).data ?? [],
  });

  const { data: dorm } = useQuery({
    queryKey: ["student-dorm", id],
    enabled: canViewBoarding,
    queryFn: async () => (await supabase.from("dorm_assignments").select("*, dormitories(name)").eq("student_id", id).order("assigned_on", { ascending: false }).limit(1).maybeSingle()).data ?? null,
  });

  const { data: transport } = useQuery({
    queryKey: ["student-transport", id],
    enabled: canViewTransport,
    queryFn: async () => (await supabase.from("transport_assignments").select("*, transport_routes(name, driver_name, driver_phone, vehicle_reg)").eq("student_id", id).limit(1).maybeSingle()).data ?? null,
  });

  const { data: cocurricular = [] } = useQuery({
    queryKey: ["student-cocurricular", id],
    queryFn: async () => (await supabase.from("student_co_curricular").select("*, co_curricular_activities(name, category)").eq("student_id", id)).data ?? [],
  });

  const { data: reportExams = [] } = useQuery({
    queryKey: ["student-report-exams", id],
    queryFn: async () => {
      const { data } = await supabase.from("exam_results").select("exam_id, exams(id, name, term, year)").eq("student_id", id).order("created_at", { ascending: false });
      const seen = new Set<string>();
      const unique: any[] = [];
      for (const r of data ?? []) {
        if (r.exam_id && !seen.has(r.exam_id)) { seen.add(r.exam_id); unique.push(r.exams); }
      }
      return unique.filter(Boolean);
    },
  });

  if (isLoading) return <div className="h-screen grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!student) return <div className="p-6 text-muted-foreground">Student not found.</div>;

  const fullName = `${student.first_name} ${student.last_name}`;
  const initials = `${student.first_name?.[0] ?? ""}${student.last_name?.[0] ?? ""}`.toUpperCase();
  const present = attendance.filter((a: any) => a.status === "present").length;
  const attRate = attendance.length ? Math.round((present / attendance.length) * 100) : null;
  const totalOutstanding = (invoices as any[]).reduce((s: number, i: any) => s + Number(i.amount) - Number(i.paid ?? 0), 0);
  const avgScore = results.length ? Math.round((results as any[]).reduce((s: number, r: any) => s + Number(r.score ?? 0), 0) / results.length) : null;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Back */}
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/students"><ArrowLeft className="w-4 h-4 mr-1" /> All Students</Link>
      </Button>

      {/* Header card */}
      <Card>
        <CardContent className="pt-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <Avatar className="h-24 w-24 shrink-0">
            <AvatarImage src={student.photo_url ?? undefined} alt={fullName} />
            <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">{fullName}</h1>
              <Badge variant={student.status === "active" ? "default" : "secondary"} className="capitalize">{student.status}</Badge>
            </div>
            <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1"><GraduationCap className="w-3 h-3" /> {student.classes?.name ?? "No class"}</span>
              <span className="inline-flex items-center gap-1"><User className="w-3 h-3" /> {student.admission_no}</span>
              {student.unique_id && <span className="inline-flex items-center gap-1"><Shield className="w-3 h-3" />{student.unique_id}</span>}
              {student.gender && <span className="capitalize">{student.gender}</span>}
              {student.date_of_birth && <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{student.date_of_birth}</span>}
            </div>
            <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
              {student.parent_name && <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />Parent: {student.parent_name}</span>}
              {student.parent_phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{student.parent_phone}</span>}
              {student.parent_email && <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{student.parent_email}</span>}
              {student.address && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{student.address}</span>}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {/* FIXED: Edit button only for authorised roles — teachers do NOT get this */}
            {canEditProfile && (
              <Button size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="w-4 h-4 mr-1" /> Edit Profile
              </Button>
            )}
            {/* FIXED: Raise Concern button — teachers only (admins use discipline tools) */}
            {canRaiseConcern && (
              <Button size="sm" variant="outline" onClick={() => setConcernOpen(true)}>
                <Flag className="w-4 h-4 mr-1" /> Raise Concern
              </Button>
            )}
            <Button size="sm" variant="outline" asChild>
              <Link to="/ids/student/$id" params={{ id: student.id }}>
                <FileText className="w-4 h-4 mr-1" /> ID Card
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Attendance" value={attRate !== null ? `${attRate}%` : "—"} hint={`${attendance.length} records`} icon={<Calendar className="w-4 h-4" />} />
        <StatCard label="Avg Score" value={avgScore !== null ? `${avgScore}%` : "—"} hint={`${results.length} results`} icon={<BookOpen className="w-4 h-4" />} />
        {canViewFinance && <StatCard label="Outstanding" value={`KES ${totalOutstanding.toLocaleString()}`} hint={`${invoices.length} invoices`} icon={<DollarSign className="w-4 h-4" />} />}
        <StatCard label="Activities" value={String(cocurricular.length)} hint="co-curricular" icon={<Trophy className="w-4 h-4" />} />
      </div>

      {/* Tabs — all tabs visible to all roles; edit actions inside are individually gated */}
      <Tabs defaultValue="academic">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="academic">Academic</TabsTrigger>
          <TabsTrigger value="report-cards">Report Cards</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          {canViewFinance && <TabsTrigger value="finance">Finance</TabsTrigger>}
          {canViewClinic && <TabsTrigger value="clinic">Clinic</TabsTrigger>}
          {canViewDiscipline && <TabsTrigger value="discipline">Discipline</TabsTrigger>}
          <TabsTrigger value="documents">Documents</TabsTrigger>
          {canViewBoarding && <TabsTrigger value="boarding">Boarding</TabsTrigger>}
          {canViewTransport && <TabsTrigger value="transport">Transport</TabsTrigger>}
          <TabsTrigger value="activities">Activities</TabsTrigger>
        </TabsList>

        {/* ACADEMIC */}
        <TabsContent value="academic">
          <Card>
            <CardHeader><CardTitle className="text-base">Exam Results</CardTitle></CardHeader>
            <CardContent>
              {results.length === 0 ? <p className="text-sm text-muted-foreground">No results yet.</p> : (
                <div className="divide-y">
                  {(results as any[]).map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <div className="font-medium">{r.subjects?.name}</div>
                        <div className="text-xs text-muted-foreground">{r.exams?.name} · {r.exams?.term} {r.exams?.year}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-base">{r.score}</div>
                        {r.grade && <Badge variant="secondary">{r.grade}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* REPORT CARDS */}
        <TabsContent value="report-cards">
          <Card>
            <CardHeader><CardTitle className="text-base">Report Cards</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {reportExams.length === 0 ? <p className="text-sm text-muted-foreground">No report cards available.</p> : (
                (reportExams as any[]).map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between border-b py-2">
                    <div>
                      <div className="font-medium">{e.name}</div>
                      <div className="text-xs text-muted-foreground">{e.term} {e.year}</div>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/academics/report-card/$studentId/$examId" params={{ studentId: student.id, examId: e.id }}>
                        Open
                      </Link>
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ATTENDANCE */}
        <TabsContent value="attendance">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Attendance</CardTitle>
              <CardDescription>{attRate !== null ? `${attRate}% present over last ${attendance.length} records` : "No records"}</CardDescription>
            </CardHeader>
            <CardContent>
              {attendance.length === 0 ? <p className="text-sm text-muted-foreground">No attendance records.</p> : (
                <div className="divide-y max-h-96 overflow-y-auto">
                  {(attendance as any[]).map((a: any) => (
                    <div key={a.id} className="flex justify-between items-center py-1.5 text-sm">
                      <span>{a.date}</span>
                      <Badge variant={a.status === "present" ? "default" : a.status === "absent" ? "destructive" : "secondary"}>{a.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* FINANCE */}
        {canViewFinance && (
          <TabsContent value="finance">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Fee Invoices</CardTitle>
                <CardDescription>Outstanding: KES {totalOutstanding.toLocaleString()}</CardDescription>
              </CardHeader>
              <CardContent>
                {invoices.length === 0 ? <p className="text-sm text-muted-foreground">No invoices.</p> : (
                  <div className="divide-y">
                    {(invoices as any[]).map((i: any) => {
                      const outstanding = Number(i.amount) - Number(i.paid ?? 0);
                      return (
                        <div key={i.id} className="flex items-center justify-between py-2 text-sm">
                          <div>
                            <div className="font-medium">{i.invoice_no}</div>
                            <div className="text-xs text-muted-foreground">Due: {i.due_date ?? "—"}</div>
                          </div>
                          <div className="text-right">
                            <div>Paid {Number(i.paid ?? 0).toLocaleString()} / {Number(i.amount).toLocaleString()}</div>
                            {outstanding > 0 && <div className="text-xs text-destructive">Owed: {outstanding.toLocaleString()}</div>}
                            <Badge variant={i.status === "paid" ? "default" : i.status === "partial" ? "secondary" : "destructive"}>{i.status}</Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* CLINIC */}
        {canViewClinic && (
          <TabsContent value="clinic">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Heart className="w-4 h-4" />Health Records</CardTitle></CardHeader>
              <CardContent>
                {student.medical_notes && (
                  <div className="mb-4 p-3 border rounded-md bg-muted/30">
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Medical Notes / Allergies</div>
                    <div className="text-sm">{student.medical_notes}</div>
                  </div>
                )}
                {student.dietary_notes && (
                  <div className="mb-4 p-3 border rounded-md bg-muted/30">
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Dietary Requirements</div>
                    <div className="text-sm">{student.dietary_notes}</div>
                  </div>
                )}
                {clinicVisits.length === 0 ? <p className="text-sm text-muted-foreground">No clinic visits.</p> : (
                  <div className="divide-y">
                    {(clinicVisits as any[]).map((c: any) => (
                      <div key={c.id} className="py-2 text-sm">
                        <div className="flex justify-between">
                          <span className="font-medium">{c.visit_date}</span>
                          <div className="flex gap-1">
                            {c.under_observation && <Badge variant="destructive">Admitted</Badge>}
                            {c.referral_status && c.referral_status !== "none" && <Badge variant="outline">{c.referral_status}</Badge>}
                          </div>
                        </div>
                        {c.symptoms && <div className="text-xs text-muted-foreground">Symptoms: {c.symptoms}</div>}
                        {c.diagnosis && <div className="text-xs text-muted-foreground">Diagnosis: {c.diagnosis}</div>}
                        {c.treatment && <div className="text-xs text-muted-foreground">Treatment: {c.treatment}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* DISCIPLINE */}
        {canViewDiscipline && (
          <TabsContent value="discipline">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield className="w-4 h-4" />Discipline Records</CardTitle></CardHeader>
              <CardContent>
                {discipline.length === 0 ? <p className="text-sm text-muted-foreground">No discipline records.</p> : (
                  <div className="divide-y">
                    {(discipline as any[]).map((d: any) => (
                      <div key={d.id} className="py-2 text-sm">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium">{d.category}</div>
                            <div className="text-xs text-muted-foreground">{d.incident_date}</div>
                          </div>
                          <Badge variant={d.severity === "major" ? "destructive" : "secondary"}>{d.severity}</Badge>
                        </div>
                        <div className="mt-1 text-xs">{d.description}</div>
                        {d.action_taken && <div className="text-xs text-muted-foreground mt-0.5">Action: {d.action_taken}</div>}
                        {d.parent_notified && <Badge variant="outline" className="text-xs mt-1">Parent notified</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* DOCUMENTS */}
        <TabsContent value="documents">
          <Card>
            <CardHeader><CardTitle className="text-base">Documents</CardTitle></CardHeader>
            <CardContent>
              {documents.length === 0 ? <p className="text-sm text-muted-foreground">No documents uploaded.</p> : (
                <div className="divide-y">
                  {(documents as any[]).map((d: any) => (
                    <div key={d.id} className="flex items-center justify-between py-2">
                      <div>
                        <Badge variant="secondary">{d.document_type?.replace(/_/g, " ")}</Badge>
                        <div className="text-xs text-muted-foreground mt-0.5">{d.created_at ? format(new Date(d.created_at), "dd/MM/yyyy") : ""}</div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={async () => {
                        const { data } = await supabase.storage.from("student-documents").createSignedUrl(d.file_path, 60);
                        if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                      }}>Open</Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* BOARDING */}
        {canViewBoarding && (
          <TabsContent value="boarding">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bed className="w-4 h-4" />Boarding</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                {!dorm ? <p className="text-muted-foreground">Not a boarder or no assignment.</p> : (
                  <>
                    <div><span className="text-muted-foreground">Dormitory: </span><span className="font-medium">{(dorm as any).dormitories?.name}</span></div>
                    <div><span className="text-muted-foreground">Bed No: </span><span className="font-medium">{(dorm as any).bed_no ?? "—"}</span></div>
                    <div><span className="text-muted-foreground">Assigned: </span>{(dorm as any).assigned_on}</div>
                    {(dorm as any).welfare_notes && (
                      <div className="mt-2 p-3 border rounded-md bg-muted/30">
                        <div className="text-xs font-semibold text-muted-foreground mb-1">Welfare Notes</div>
                        <div>{(dorm as any).welfare_notes}</div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* TRANSPORT */}
        {canViewTransport && (
          <TabsContent value="transport">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bus className="w-4 h-4" />Transport</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                {!transport ? <p className="text-muted-foreground">No transport assignment.</p> : (
                  <>
                    <div><span className="text-muted-foreground">Route: </span><span className="font-medium">{(transport as any).transport_routes?.name}</span></div>
                    <div><span className="text-muted-foreground">Driver: </span>{(transport as any).transport_routes?.driver_name ?? "—"}</div>
                    <div><span className="text-muted-foreground">Driver Phone: </span>{(transport as any).transport_routes?.driver_phone ?? "—"}</div>
                    <div><span className="text-muted-foreground">Vehicle: </span>{(transport as any).transport_routes?.vehicle_reg ?? "—"}</div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ACTIVITIES */}
        <TabsContent value="activities">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Trophy className="w-4 h-4" />Co-curricular Activities</CardTitle></CardHeader>
            <CardContent>
              {cocurricular.length === 0 ? <p className="text-sm text-muted-foreground">Not enrolled in any activities.</p> : (
                <div className="divide-y">
                  {(cocurricular as any[]).map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between py-2 text-sm">
                      <div className="font-medium">{c.co_curricular_activities?.name}</div>
                      <Badge variant="secondary">{c.co_curricular_activities?.category}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Profile Dialog — admins / admission officers only */}
      {canEditProfile && (
        <EditStudentDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          student={student}
          classes={classes as any[]}
          onDone={() => {
            setEditOpen(false);
            qc.invalidateQueries({ queryKey: ["student-profile", id] });
            qc.invalidateQueries({ queryKey: ["students"] });
          }}
        />
      )}

      {/* Raise Concern Dialog — teachers only */}
      {canRaiseConcern && (
        <RaiseConcernDialog
          open={concernOpen}
          onOpenChange={setConcernOpen}
          student={student}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Raise Concern Dialog
// Logs an internal school ticket (category: "student_concern").
// Goes to support_tickets with school_id set — visible in /_app/admin/support
// to school admins. Does NOT reach platform support.
// ---------------------------------------------------------------------------
function RaiseConcernDialog({ open, onOpenChange, student }: {
  open: boolean; onOpenChange: (v: boolean) => void; student: any;
}) {
  const [form, setForm] = useState({ type: "academic", priority: "normal", details: "" });
  const [busy, setBusy] = useState(false);

  const CONCERN_TYPES = [
    { value: "academic",    label: "Academic performance" },
    { value: "behaviour",   label: "Behaviour / conduct" },
    { value: "attendance",  label: "Attendance / lateness" },
    { value: "welfare",     label: "Welfare / wellbeing" },
    { value: "health",      label: "Health concern" },
    { value: "other",       label: "Other" },
  ];

  const submit = async () => {
    if (!form.details.trim()) { toast.error("Please describe the concern"); return; }
    setBusy(true);
    try {
      const { data: schoolId } = await supabase.rpc("my_school_id");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const label = CONCERN_TYPES.find(t => t.value === form.type)?.label ?? form.type;
      const subject = `[Student Concern] ${label} — ${student.first_name} ${student.last_name} (${student.admission_no})`;
      const body = `Student: ${student.first_name} ${student.last_name}\nAdmission No: ${student.admission_no}\nClass: ${student.classes?.name ?? "—"}\n\nConcern type: ${label}\n\n${form.details.trim()}`;

      // Insert ticket as internal school concern
      const { data: ticket, error } = await supabase
        .from("support_tickets")
        .insert({
          school_id: schoolId as any,
          subject,
          body,
          category: "student_concern",   // distinguishes from platform support tickets
          priority: form.priority,
          status: "open",
          opened_by: user.id,
        } as any)
        .select("id")
        .single();
      if (error) throw error;

      // First message mirrors the body
      await supabase.from("support_messages").insert({
        ticket_id: ticket.id,
        body,
        is_platform_reply: false,
        author_id: user.id,
      } as any);

      toast.success("Concern raised — school admin has been notified");
      setForm({ type: "academic", priority: "normal", details: "" });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to submit concern");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-amber-500" />
            Raise a Concern — {student.first_name} {student.last_name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="p-3 rounded-md bg-amber-500/10 border border-amber-400/20 text-xs text-amber-800 dark:text-amber-300">
            This concern will be logged internally and sent to the school admin / pastoral team. It will not be shared with the student or parent.
          </div>
          <div>
            <Label>Type of concern</Label>
            <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[
                  { value: "academic",   label: "Academic performance" },
                  { value: "behaviour",  label: "Behaviour / conduct" },
                  { value: "attendance", label: "Attendance / lateness" },
                  { value: "welfare",    label: "Welfare / wellbeing" },
                  { value: "health",     label: "Health concern" },
                  { value: "other",      label: "Other" },
                ].map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Details</Label>
            <Textarea
              value={form.details}
              onChange={e => setForm(f => ({ ...f, details: e.target.value }))}
              placeholder="Describe what you have observed, when it started, and any relevant context…"
              rows={5}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
            Submit Concern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------
function StatCard({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1">{icon}{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="text-xs text-muted-foreground pt-0">{hint}</CardContent>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Edit Student Dialog — unchanged, only shown to canEditProfile roles
// ---------------------------------------------------------------------------
function EditStudentDialog({ open, onOpenChange, student, classes, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  student: any; classes: any[]; onDone: () => void;
}) {
  const [f, setF] = useState({
    first_name: student.first_name ?? "",
    last_name: student.last_name ?? "",
    gender: student.gender ?? "",
    date_of_birth: student.date_of_birth ?? "",
    class_id: student.class_id ?? "none",
    parent_name: student.parent_name ?? "",
    parent_phone: student.parent_phone ?? "",
    parent_email: student.parent_email ?? "",
    address: student.address ?? "",
    medical_notes: student.medical_notes ?? "",
    dietary_notes: student.dietary_notes ?? "",
    status: student.status ?? "active",
  });

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("students").update({
        ...f,
        class_id: f.class_id === "none" ? null : f.class_id,
        date_of_birth: f.date_of_birth || null,
      }).eq("id", student.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Student updated"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });

  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Student — {student.first_name} {student.last_name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          <div><Label>First Name</Label><Input value={f.first_name} onChange={e => set("first_name", e.target.value)} /></div>
          <div><Label>Last Name</Label><Input value={f.last_name} onChange={e => set("last_name", e.target.value)} /></div>
          <div>
            <Label>Gender</Label>
            <Select value={f.gender} onValueChange={v => set("gender", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Date of Birth</Label><Input type="date" value={f.date_of_birth} onChange={e => set("date_of_birth", e.target.value)} /></div>
          <div>
            <Label>Class</Label>
            <Select value={f.class_id} onValueChange={v => set("class_id", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Unassigned —</SelectItem>
                {classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={f.status} onValueChange={v => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="transferred">Transferred</SelectItem>
                <SelectItem value="graduated">Graduated</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Parent / Guardian</Label><Input value={f.parent_name} onChange={e => set("parent_name", e.target.value)} /></div>
          <div><Label>Parent Phone</Label><Input value={f.parent_phone} onChange={e => set("parent_phone", e.target.value)} /></div>
          <div className="sm:col-span-2"><Label>Parent Email</Label><Input type="email" value={f.parent_email} onChange={e => set("parent_email", e.target.value)} /></div>
          <div className="sm:col-span-2"><Label>Address</Label><Input value={f.address} onChange={e => set("address", e.target.value)} /></div>
          <div className="sm:col-span-2"><Label>Medical Notes / Allergies</Label><Textarea rows={3} value={f.medical_notes} onChange={e => set("medical_notes", e.target.value)} /></div>
          <div className="sm:col-span-2"><Label>Dietary Requirements</Label><Textarea rows={2} value={f.dietary_notes} onChange={e => set("dietary_notes", e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
