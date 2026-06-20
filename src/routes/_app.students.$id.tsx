import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft, Loader2, Phone, IdCard as IdCardIcon, Printer, User, Pencil,
  Award, Bed, Bus, Stethoscope, FileText, BookOpen, ExternalLink, Mail, Home,
} from "lucide-react";
import { LifecycleActions } from "@/components/LifecycleActions";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/hooks/use-auth";
import { StudentWizard } from "@/components/students/StudentWizard";

export const Route = createFileRoute("/_app/students/$id")({ component: StudentProfilePage });

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DOC_LABELS: Record<string, string> = {
  birth_certificate: "Birth Certificate",
  report_form: "Previous Report Form",
  passport_photo: "Passport Photo",
  medical_records: "Medical Records",
  transfer_letter: "Transfer Letter",
  national_id: "National ID",
  parent_id: "Parent/Guardian ID",
  other: "Other",
};

function StudentProfilePage() {
  const { id } = Route.useParams();
  const { isAdmin, hasRole } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const canEdit = isAdmin || hasRole("admission_officer") || hasRole("deputy_principal");
  const [editOpen, setEditOpen] = useState(false);

  const { data: student, isLoading } = useQuery({
    queryKey: ["student-profile", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*, classes(id, name, stream, year, class_teacher_id)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: attendance } = useQuery({
    queryKey: ["student-profile-attendance", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("id, date, status, remarks")
        .eq("student_id", id)
        .order("date", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!student,
  });

  const { data: invoices } = useQuery({
    queryKey: ["student-profile-invoices", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_no, amount, paid, status, due_date")
        .eq("student_id", id)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!student,
  });

  const { data: discipline } = useQuery({
    queryKey: ["student-profile-discipline", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discipline_records")
        .select("id, incident_date, category, severity, description, action_taken")
        .eq("student_id", id)
        .order("incident_date", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!student,
  });

  const { data: examResults } = useQuery({
    queryKey: ["student-profile-results", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_results")
        .select("id, score, grade, remarks, created_at, subjects(name, code), exams(id, name, term, year)")
        .eq("student_id", id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!student,
  });

  const { data: coCurricular } = useQuery({
    queryKey: ["student-profile-cc", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("student_co_curricular")
        .select("id, enrolled_on, co_curricular_activities(id, name, category, schedule_day, schedule_time)")
        .eq("student_id", id);
      if (error) return [];
      const rows = data ?? [];
      const activityIds = rows.map((r: any) => r.co_curricular_activities?.id).filter(Boolean);
      let coaches: any[] = [];
      if (activityIds.length) {
        const { data: cd } = await (supabase as any)
          .from("staff_co_curricular")
          .select("activity_id, role, staff(first_name, last_name)")
          .in("activity_id", activityIds);
        coaches = cd ?? [];
      }
      return rows.map((r: any) => ({
        ...r,
        coach: coaches.find((c: any) => c.activity_id === r.co_curricular_activities?.id),
      }));
    },
    enabled: !!student,
  });

  const { data: loans } = useQuery({
    queryKey: ["student-profile-library", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("book_loans")
        .select("id, borrowed_on, due_on, returned_on, status, books(title, author)")
        .eq("student_id", id)
        .order("borrowed_on", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!student,
  });

  const { data: clinic } = useQuery({
    queryKey: ["student-profile-clinic", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_visits")
        .select("id, visit_date, symptoms, diagnosis, treatment, referred_to")
        .eq("student_id", id)
        .order("visit_date", { ascending: false })
        .limit(20);
      if (error) return [];
      return data as any[];
    },
    enabled: !!student,
  });

  const { data: transport } = useQuery({
    queryKey: ["student-profile-transport", id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("transport_assignments")
        .select("*, transport_routes(name, driver_name, driver_phone, vehicle_reg)")
        .eq("student_id", id)
        .order("assigned_on", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
    enabled: !!student,
  });

  const { data: dorm } = useQuery({
    queryKey: ["student-profile-dorm", id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("dorm_assignments")
        .select("*, dormitories(name, gender)")
        .eq("student_id", id)
        .order("assigned_on", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
    enabled: !!student,
  });

  const { data: documents } = useQuery({
    queryKey: ["student-profile-documents", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("student_documents")
        .select("id, doc_type, file_name, file_path, mime_type, size_bytes, created_at")
        .eq("student_id", id)
        .order("created_at", { ascending: false });
      if (error) return [];
      return data as any[];
    },
    enabled: !!student,
  });

  const { data: timetable } = useQuery({
    queryKey: ["student-profile-timetable", student?.classes?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timetable_slots")
        .select("id, day_of_week, start_time, end_time, room, subjects(name), staff(first_name, last_name)")
        .eq("class_id", student.classes.id)
        .order("day_of_week")
        .order("start_time");
      if (error) return [];
      return data as any[];
    },
    enabled: !!student?.classes?.id,
  });

  if (isLoading) return <div className="h-screen grid place-items-center"><Loader2 className="animate-spin" /></div>;
  if (!student) return <div className="p-8">Student not found.</div>;

  const fullName = `${student.first_name} ${student.last_name}`;
  const balance = (invoices ?? []).reduce((sum, i: any) => sum + (Number(i.amount) - Number(i.paid)), 0);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button
          onClick={() => router.history.length > 1 ? router.history.back() : router.navigate({ to: "/students" })}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Back to students
        </button>
        <div className="flex items-center gap-2">
          <Link to="/ids/student/$id" params={{ id: student.id }}>
            <Button size="sm" variant="outline"><Printer className="w-4 h-4 mr-2" />ID Card</Button>
          </Link>
          {canEdit && (
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Pencil className="w-4 h-4 mr-2" />Edit</Button>
              </DialogTrigger>
              {editOpen && (
                <StudentWizard
                  existing={student}
                  onDone={() => {
                    setEditOpen(false);
                    qc.invalidateQueries({ queryKey: ["student-profile", id] });
                    qc.invalidateQueries({ queryKey: ["student-profile-cc", id] });
                  }}
                />
              )}
            </Dialog>
          )}
          {canEdit && (
            <LifecycleActions kind="student" id={student.id} currentStatus={student.lifecycle_status} queryKey="student-profile" />
          )}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="w-24 h-24 rounded-xl bg-muted overflow-hidden shrink-0 grid place-items-center">
              {student.photo_url ? (
                <img src={student.photo_url} alt={fullName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-semibold text-muted-foreground">
                  {student.first_name?.[0]}{student.last_name?.[0]}
                </span>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{fullName}</h1>
                <StatusBadge status={student.lifecycle_status} />
              </div>
              <p className="text-muted-foreground">
                {student.classes ? `${student.classes.name}${student.classes.stream ? " " + student.classes.stream : ""}` : "Unassigned class"}
              </p>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-1">
                <span className="inline-flex items-center gap-1"><IdCardIcon className="w-3.5 h-3.5" />{student.admission_no}</span>
                {student.unique_id && <span className="inline-flex items-center gap-1"><IdCardIcon className="w-3.5 h-3.5" />{student.unique_id}</span>}
                {student.parent_name && <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" />{student.parent_name}</span>}
                {student.parent_phone && <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{student.parent_phone}</span>}
                {student.parent_email && <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{student.parent_email}</span>}
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {student.gender && <Badge variant="secondary" className="capitalize">{student.gender}</Badge>}
                {student.level && <Badge variant="outline">{student.level}</Badge>}
                {student.admitted_on && <Badge variant="outline">Admitted {student.admitted_on}</Badge>}
                <Badge variant={balance > 0 ? "destructive" : "outline"}>
                  Balance KES {balance.toLocaleString()}
                </Badge>
                {dorm?.dormitories?.name && (
                  <Badge variant="outline" className="inline-flex items-center gap-1">
                    <Bed className="w-3 h-3" />{dorm.dormitories.name}{dorm.bed_no ? ` · Bed ${dorm.bed_no}` : ""}
                  </Badge>
                )}
                {transport?.transport_routes?.name && (
                  <Badge variant="outline" className="inline-flex items-center gap-1">
                    <Bus className="w-3 h-3" />{transport.transport_routes.name}
                  </Badge>
                )}
                {(coCurricular?.length ?? 0) > 0 && (
                  <Badge variant="outline" className="inline-flex items-center gap-1">
                    <Award className="w-3 h-3" />{coCurricular!.length} club{coCurricular!.length === 1 ? "" : "s"}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timetable">Timetable</TabsTrigger>
          <TabsTrigger value="academics">Academics</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="cocurricular">Co-curricular</TabsTrigger>
          <TabsTrigger value="fees">Fees</TabsTrigger>
          <TabsTrigger value="library">Library</TabsTrigger>
          <TabsTrigger value="discipline">Discipline</TabsTrigger>
          <TabsTrigger value="clinic">Clinic</TabsTrigger>
          <TabsTrigger value="transport">Transport</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Personal details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <Field label="Date of birth" value={student.date_of_birth} />
              <Field label="National ID" value={student.national_id} />
              <Field label="Address" value={student.address} />
              <Field label="Desk no" value={student.desk_no?.toString()} />
              <Field label="Parent email" value={student.parent_email} />
              <Field label="Unique ID" value={student.unique_id} />
            </CardContent>
          </Card>
          {student.medical_notes && (
            <Card>
              <CardHeader><CardTitle className="text-base">Medical notes</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">{student.medical_notes}</CardContent>
            </Card>
          )}
          {student.lifecycle_status !== "active" && student.lifecycle_reason && (
            <Card>
              <CardHeader><CardTitle className="text-base">Lifecycle note</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">{student.lifecycle_reason}</CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="timetable" className="pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Weekly timetable</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {!student.classes?.id ? (
                <p className="text-sm text-muted-foreground">No class assigned, so no timetable to show.</p>
              ) : (timetable ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No timetable published for this class yet.</p>
              ) : (
                [0, 1, 2, 3, 4, 5, 6].map((dow) => {
                  const slots = (timetable ?? []).filter((s: any) => s.day_of_week === dow);
                  if (slots.length === 0) return null;
                  return (
                    <div key={dow}>
                      <div className="font-medium text-sm mb-1">{DAYS[dow]}</div>
                      <div className="space-y-1">
                        {slots.map((s: any) => (
                          <div key={s.id} className="flex gap-3 text-sm border-b py-1">
                            <span className="font-mono text-xs text-muted-foreground w-24">{s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</span>
                            <span className="flex-1 truncate">{s.subjects?.name} {s.staff ? `· ${s.staff.first_name} ${s.staff.last_name}` : ""}</span>
                            <span className="text-xs text-muted-foreground">{s.room ?? ""}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="academics" className="pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Exam results</CardTitle></CardHeader>
            <CardContent>
              {examResults && examResults.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subject</TableHead>
                      <TableHead>Exam</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {examResults.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.subjects?.name}</TableCell>
                        <TableCell className="text-muted-foreground">{r.exams?.name} · {r.exams?.term} {r.exams?.year}</TableCell>
                        <TableCell className="font-mono">{r.score}</TableCell>
                        <TableCell>{r.grade && <Badge variant="secondary">{r.grade}</Badge>}</TableCell>
                        <TableCell className="text-right">
                          {r.exams?.id && (
                            <Button asChild size="sm" variant="ghost">
                              <Link to="/academics/report-card/$studentId/$examId" params={{ studentId: student.id, examId: r.exams.id }}>
                                Report card
                              </Link>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No exam results recorded yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Recent attendance</CardTitle></CardHeader>
            <CardContent>
              {attendance && attendance.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendance.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell>{a.date}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{a.status}</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{a.remarks || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No attendance records yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cocurricular" className="pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Award className="w-4 h-4" />Clubs & co-curricular activities</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(coCurricular ?? []).length === 0 && <p className="text-sm text-muted-foreground">Not enrolled in any clubs or co-curricular activities.</p>}
              {coCurricular?.map((c: any) => {
                const a = c.co_curricular_activities;
                const coach = c.coach?.staff;
                return (
                  <div key={c.id} className="border-b py-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{a?.name ?? "—"}</div>
                      {a?.category && <Badge variant="outline">{a.category}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {a?.schedule_day != null ? `${DAYS[a.schedule_day]} ` : ""}{a?.schedule_time ?? ""}
                      {coach ? ` · Coach: ${coach.first_name} ${coach.last_name}` : ""}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fees" className="pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Invoices</CardTitle></CardHeader>
            <CardContent>
              {invoices && invoices.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Due date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv: any) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono">{inv.invoice_no}</TableCell>
                        <TableCell>KES {Number(inv.amount).toLocaleString()}</TableCell>
                        <TableCell>KES {Number(inv.paid).toLocaleString()}</TableCell>
                        <TableCell>{inv.due_date || "—"}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{inv.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No invoices yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="library" className="pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><BookOpen className="w-4 h-4" />Book loans</CardTitle></CardHeader>
            <CardContent>
              {loans && loans.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Borrowed</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loans.map((l: any) => (
                      <TableRow key={l.id}>
                        <TableCell>{l.books?.title}<div className="text-xs text-muted-foreground">{l.books?.author}</div></TableCell>
                        <TableCell>{l.borrowed_on}</TableCell>
                        <TableCell>{l.due_on}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{l.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No library activity.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="discipline" className="pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Discipline records</CardTitle></CardHeader>
            <CardContent>
              {discipline && discipline.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Action taken</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {discipline.map((d: any) => (
                      <TableRow key={d.id}>
                        <TableCell>{d.incident_date}</TableCell>
                        <TableCell className="capitalize">{d.category}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{d.severity}</Badge></TableCell>
                        <TableCell className="text-muted-foreground max-w-xs truncate">{d.description}</TableCell>
                        <TableCell className="text-muted-foreground">{d.action_taken || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No discipline records.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clinic" className="pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Stethoscope className="w-4 h-4" />Clinic visits</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(clinic ?? []).length === 0 && <p className="text-sm text-muted-foreground">No clinic visits on record.</p>}
              {clinic?.map((v: any) => (
                <div key={v.id} className="border-b py-2 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">{v.symptoms}</span>
                    <span className="text-xs text-muted-foreground">{v.visit_date}</span>
                  </div>
                  {v.diagnosis && <div className="text-xs text-muted-foreground mt-1">Diagnosis: {v.diagnosis}</div>}
                  {v.treatment && <div className="text-xs text-muted-foreground">Treatment: {v.treatment}</div>}
                  {v.referred_to && <div className="text-xs text-muted-foreground">Referred to: {v.referred_to}</div>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transport" className="pt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bus className="w-4 h-4" />Transport</CardTitle></CardHeader>
            <CardContent>
              {!transport ? (
                <p className="text-sm text-muted-foreground">No transport route assigned.</p>
              ) : (
                <div className="space-y-1 text-sm">
                  <div className="font-medium">{transport.transport_routes?.name ?? "Route"}</div>
                  <div className="text-muted-foreground">Pickup: {transport.pickup_point ?? "—"}</div>
                  <div className="text-muted-foreground">Vehicle: {transport.transport_routes?.vehicle_reg ?? "—"}</div>
                  <div className="text-muted-foreground">
                    Driver: {transport.transport_routes?.driver_name ?? "—"}
                    {transport.transport_routes?.driver_phone ? ` · ${transport.transport_routes.driver_phone}` : ""}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Home className="w-4 h-4" />Boarding</CardTitle></CardHeader>
            <CardContent>
              {!dorm ? (
                <p className="text-sm text-muted-foreground">Day scholar — no dormitory assigned.</p>
              ) : (
                <div className="space-y-1 text-sm">
                  <div className="font-medium">{dorm.dormitories?.name}</div>
                  <div className="text-muted-foreground capitalize">{dorm.dormitories?.gender} dormitory{dorm.bed_no ? ` · Bed ${dorm.bed_no}` : ""}</div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4" />Documents</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(documents ?? []).length === 0 && <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>}
              {documents?.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between border-b py-2">
                  <Badge variant="secondary">{DOC_LABELS[d.doc_type] ?? d.doc_type}</Badge>
                  <span className="text-xs text-muted-foreground">{d.file_name}</span>
                  <Button
                    variant="ghost" size="sm"
                    onClick={async () => {
                      const { data } = await supabase.storage.from("student-documents").createSignedUrl(d.file_path, 60);
                      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                    }}
                  >
                    <ExternalLink className="w-4 h-4 mr-1" /> Open
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs uppercase">{label}</div>
      <div>{value || "—"}</div>
    </div>
  );
}
