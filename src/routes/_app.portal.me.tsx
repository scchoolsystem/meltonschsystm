import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CalendarDays, BookOpen, ClipboardList, Megaphone, Users,
  Mail, Phone, Building2, IdCard, Loader2, CheckCircle2, AlertCircle, XCircle,
} from "lucide-react";

function PayslipsTab({ staffId }: { staffId?: string }) {
  const { data: slips = [], isLoading, isError } = useQuery({
    queryKey: ["payslips", staffId],
    enabled: !!staffId,
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("payroll_slips")
          .select("id,month,year,net_pay,status,created_at")
          .eq("staff_id", staffId)
          .order("year", { ascending: false })
          .order("month", { ascending: false });
        if (error) return [];
        return data ?? [];
      } catch { return []; }
    },
  });
  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  if (isError || slips.length === 0) return (
    <Card><CardContent className="pt-6 text-sm text-muted-foreground">
      Payslips are not configured for your school yet. Contact your administrator.
    </CardContent></Card>
  );
  return (
    <Card><CardContent className="pt-6 overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left">
          <th className="pb-2">Month</th><th className="pb-2">Year</th>
          <th className="pb-2">Net Pay</th><th className="pb-2">Status</th>
        </tr></thead>
        <tbody>
          {(slips as any[]).map((s: any) => (
            <tr key={s.id} className="border-b last:border-0">
              <td className="py-2">{s.month}</td>
              <td className="py-2">{s.year}</td>
              <td className="py-2">KES {Number(s.net_pay ?? 0).toLocaleString()}</td>
              <td className="py-2"><span className="px-2 py-0.5 rounded-full text-xs border">{s.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardContent></Card>
  );
}

export const Route = createFileRoute("/_app/portal/me")({
  component: MyWorkspace,
});

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function MyWorkspace() {
  const { user, fullName, roles, hasRole } = useAuth();

  // Students/parents already have dedicated portals — redirect.
  if (hasRole("student") && !hasRole("staff") && !hasRole("teacher"))
    return <Navigate to="/portal/student" />;
  if (hasRole("parent") && !hasRole("staff") && !hasRole("teacher"))
    return <Navigate to="/portal/parent" />;

  const { data, isLoading } = useQuery({
    queryKey: ["my-workspace", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const uid = user!.id;
      const { data: staff } = await supabase
        .from("staff")
        .select("id, first_name, last_name, employee_no, unique_id, photo_url, email, phone, role, department, position_title, staff_category, admin_unit, shift, assigned_area, class_responsibility, departments(name), sub_departments(name)")
        .eq("user_id", uid)
        .maybeSingle();

      const today = new Date();
      const dow = today.getDay();
      const todayStr = today.toISOString().slice(0, 10);

      const staffId = (staff as any)?.id ?? null;

      const [
        classTeacherOf, subjectTaughtSlots, todayTT, weekTT, subjects, activities,
        recentMarks, recentAttendance, announcements, activeExams,
      ] = await Promise.all([
        staffId
          ? supabase.from("classes").select("id, name, level, stream, students(count)").eq("class_teacher_id", staffId)
          : Promise.resolve({ data: [] }),
        // Classes this teacher only teaches a subject in (not the class teacher)
        staffId
          ? supabase.from("timetable_slots").select("class_id, classes(id, name, level, stream, students(count))").eq("teacher_id", staffId)
          : Promise.resolve({ data: [] }),
        staffId
          ? supabase.from("timetable_slots")
              .select("start_time, end_time, room, classes(name), subjects(name)")
              .eq("teacher_id", staffId).eq("day_of_week", dow).order("start_time")
          : Promise.resolve({ data: [] }),
        staffId
          ? supabase.from("timetable_slots")
              .select("day_of_week, start_time, end_time, room, classes(name), subjects(name)")
              .eq("teacher_id", staffId).order("day_of_week").order("start_time")
          : Promise.resolve({ data: [] }),
        staffId
          ? supabase.from("teacher_subjects")
              .select("subject_id, subjects(id, name)").eq("staff_id", staffId)
          : Promise.resolve({ data: [] }),
        staffId
          ? supabase.from("staff_co_curricular")
              .select("role, co_curricular_activities(name, category)").eq("staff_id", staffId)
          : Promise.resolve({ data: [] }),
        supabase.from("exam_results")
          .select("id, score, created_at, subjects(name), exams(name)")
          .eq("recorded_by", uid).order("created_at", { ascending: false }).limit(10),
        supabase.from("attendance_records")
          .select("id, date, status, students(first_name, last_name)")
          .eq("recorded_by", uid).gte("date", todayStr).limit(20),
        supabase.from("announcements")
          .select("id, title, body, pinned, created_at")
          .order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(20),
        supabase.from("exams").select("id, name, term, year, status").neq("status", "completed").order("start_date", { ascending: true }),
      ]);

      // Merge class-teacher classes with subject-taught classes (dedupe by id),
      // tagging each so a class teacher gets the full attendance breakdown
      // and a subject-only teacher gets a general count.
      const classTeacherIds = new Set((classTeacherOf.data ?? []).map((c: any) => c.id));
      const mergedClassesMap = new Map<string, any>();
      (classTeacherOf.data ?? []).forEach((c: any) => mergedClassesMap.set(c.id, c));
      (subjectTaughtSlots.data ?? []).forEach((s: any) => {
        const c = s.classes;
        if (c && !mergedClassesMap.has(c.id)) mergedClassesMap.set(c.id, c);
      });
      const myClassesData = Array.from(mergedClassesMap.values()).map((c: any) => ({
        ...c,
        isClassTeacher: classTeacherIds.has(c.id),
      }));
      const classIds = myClassesData.map((c: any) => c.id);
      const totalStudentsCount = myClassesData.reduce((s: number, c: any) => s + (c.students?.[0]?.count ?? 0), 0);

      // Today's attendance summary, per class
      const classAttendance = classIds.length
        ? (await supabase.from("attendance_records").select("class_id, status").in("class_id", classIds).eq("date", todayStr)).data ?? []
        : [];
      const attendanceSummary = myClassesData.map((c: any) => {
        const recs = classAttendance.filter((r: any) => r.class_id === c.id);
        return {
          classId: c.id,
          className: c.name,
          isClassTeacher: c.isClassTeacher,
          total: c.students?.[0]?.count ?? 0,
          present: recs.filter((r: any) => r.status === "present").length,
          absent: recs.filter((r: any) => r.status === "absent").length,
          late: recs.filter((r: any) => r.status === "late").length,
          marked: recs.length,
        };
      });

      // Pending marks: for each (subject, exam) combo, count results entered
      const mySubjects = subjects.data ?? [];
      const exams = activeExams.data ?? [];
      const pendingMarks: any[] = [];
      for (const exam of exams) {
        for (const ts of mySubjects) {
          const subjectId = ts.subject_id;
          if (!subjectId) continue;
          const { count } = await supabase
            .from("exam_results")
            .select("id", { count: "exact", head: true })
            .eq("exam_id", exam.id)
            .eq("subject_id", subjectId);
          let status = "No results";
          if ((count ?? 0) > 0) status = (count ?? 0) >= totalStudentsCount && totalStudentsCount > 0 ? "Complete" : "Partial";
          pendingMarks.push({
            examId: exam.id, examName: exam.name, subjectId, subjectName: (ts as any).subjects?.name ?? "—", status,
          });
        }
      }

      return {
        staff,
        myClasses: myClassesData,
        todayTT: todayTT.data ?? [],
        weekTT: weekTT.data ?? [],
        subjects: mySubjects,
        activities: activities.data ?? [],
        recentMarks: recentMarks.data ?? [],
        recentAttendance: recentAttendance.data ?? [],
        announcements: announcements.data ?? [],
        attendanceSummary,
        pendingMarks,
      };
    },
  });

  if (isLoading) {
    return <div className="p-6 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const staff = (data?.staff as any) ?? null;
  const displayName = staff ? `${staff.first_name} ${staff.last_name}` : (fullName || user?.email || "You");
  const initials = displayName.split(" ").map((p: string) => p[0]).slice(0, 2).join("").toUpperCase();

  // "Up next" lesson
  const now = new Date();
  const hhmm = now.toTimeString().slice(0, 5);
  const upNext = (data?.todayTT ?? []).find((s: any) => (s.end_time ?? "").slice(0, 5) >= hhmm) ?? null;

  const totalStudents = (data?.myClasses ?? []).reduce(
    (s: number, c: any) => s + (c.students?.[0]?.count ?? 0), 0,
  );

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Identity */}
      <Card>
        <CardContent className="pt-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <Avatar className="w-20 h-20">
            {staff?.photo_url && <AvatarImage src={staff.photo_url} alt={displayName} />}
            <AvatarFallback className="text-xl bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate">Hello, {displayName.split(" ")[0]}</h1>
            <p className="text-sm text-muted-foreground">
              {staff?.position_title || roles.join(", ") || "Member"}
              {staff?.departments?.name ? ` · ${staff.departments.name}` : ""}
              {staff?.sub_departments?.name ? ` / ${staff.sub_departments.name}` : ""}
            </p>
            <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
              {staff?.unique_id && <span className="inline-flex items-center gap-1"><IdCard className="w-3 h-3" />{staff.unique_id}</span>}
              {staff?.employee_no && <span>· {staff.employee_no}</span>}
              {staff?.email && <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{staff.email}</span>}
              {staff?.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{staff.phone}</span>}
              {staff?.admin_unit && <span className="inline-flex items-center gap-1"><Building2 className="w-3 h-3" />{staff.admin_unit}</span>}
              {staff?.shift && <span>· {staff.shift} shift</span>}
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {roles.map((r) => <Badge key={r} variant="secondary" className="text-[10px]">{r}</Badge>)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Up next */}
      {upNext && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardDescription>Up next today</CardDescription>
            <CardTitle className="text-xl">
              {(upNext as any).subjects?.name ?? "Lesson"} · {(upNext as any).classes?.name ?? "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {(upNext as any).start_time?.slice(0, 5)} – {(upNext as any).end_time?.slice(0, 5)}
            {(upNext as any).room ? ` · Room ${(upNext as any).room}` : ""}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="My classes" value={data?.myClasses.length ?? 0} icon={BookOpen} />
        <Stat label="Students" value={totalStudents} icon={Users} />
        <Stat label="Lessons today" value={data?.todayTT.length ?? 0} icon={CalendarDays} />
        <Stat label="Marks entered (10)" value={data?.recentMarks.length ?? 0} icon={ClipboardList} />
      </div>

      <Tabs defaultValue="day">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="day">My day</TabsTrigger>
          <TabsTrigger value="myclasses">My Classes</TabsTrigger>
          <TabsTrigger value="timetable">My Timetable</TabsTrigger>
          <TabsTrigger value="classes">Classes & subjects</TabsTrigger>
          <TabsTrigger value="pending">Pending Marks</TabsTrigger>
          <TabsTrigger value="attendance">Attendance Summary</TabsTrigger>
          <TabsTrigger value="activity">My activity</TabsTrigger>
          <TabsTrigger value="payslips">Payslips</TabsTrigger>
          <TabsTrigger value="news">Announcements</TabsTrigger>
        </TabsList>

        <TabsContent value="day" className="space-y-3">
          <Card><CardHeader><CardTitle className="text-base">Today's lessons</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {(data?.todayTT ?? []).length === 0 && <Empty>No lessons scheduled today.</Empty>}
              {data?.todayTT.map((s: any, i: number) => (
                <div key={i} className="flex justify-between border-b py-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground w-24">{s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</span>
                  <span className="flex-1 truncate">{s.subjects?.name ?? "—"} · {s.classes?.name ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">{s.room ?? ""}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="myclasses">
          <Card><CardHeader><CardTitle className="text-base">My classes</CardTitle><CardDescription>Classes you're the class teacher of, or teach a subject in. Click one to open its full subject and student list.</CardDescription></CardHeader>
            <CardContent className="space-y-1">
              {(data?.myClasses ?? []).length === 0 && <Empty>No classes assigned.</Empty>}
              {data?.myClasses.map((c: any) => (
                <Link key={c.id} to="/classes" className="flex items-center justify-between border-b py-2 text-sm hover:bg-muted/40 -mx-2 px-2 rounded">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.level ?? "—"}{c.stream ? ` · ${c.stream}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.isClassTeacher && <Badge>Class teacher</Badge>}
                    <Badge variant="secondary">{c.students?.[0]?.count ?? 0} students</Badge>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timetable">
          <Card><CardHeader><CardTitle className="text-base">Weekly timetable</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {[1, 2, 3, 4, 5].map((d) => {
                const slots = (data?.weekTT ?? []).filter((s: any) => s.day_of_week === d);
                return (
                  <div key={d}>
                    <div className="font-medium text-sm mb-1">{DAYS[d]}</div>
                    {slots.length === 0 ? <p className="text-xs text-muted-foreground">No lessons</p> : (
                      <div className="space-y-1">
                        {slots.map((s: any, i: number) => (
                          <div key={i} className="flex gap-3 text-sm border-b py-1">
                            <span className="font-mono text-xs text-muted-foreground w-24">{s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</span>
                            <span className="flex-1 truncate">{s.subjects?.name} · {s.classes?.name}</span>
                            <span className="text-xs text-muted-foreground">{s.room ?? ""}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="classes" className="grid md:grid-cols-2 gap-3">
          <Card><CardHeader><CardTitle className="text-base">Classes I teach</CardTitle></CardHeader>
            <CardContent>
              {(data?.myClasses ?? []).length === 0 && <Empty>No classes assigned.</Empty>}
              {data?.myClasses.map((c: any) => (
                <Link key={c.id} to="/classes" className="flex justify-between py-2 border-b text-sm hover:bg-muted/40 -mx-2 px-2 rounded">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground">{c.students?.[0]?.count ?? 0} students</span>
                </Link>
              ))}
              {staff?.class_responsibility && (
                <p className="text-xs text-muted-foreground mt-3">Class teacher of <Badge variant="secondary">{staff.class_responsibility}</Badge></p>
              )}
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle className="text-base">Subjects & activities</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(data?.subjects ?? []).length === 0 && (data?.activities ?? []).length === 0 && <Empty>None assigned.</Empty>}
              {data?.subjects.map((s: any, i: number) => (
                <div key={`s-${i}`} className="text-sm flex justify-between border-b py-1">
                  <span>{s.subjects?.name ?? "—"}</span>
                  <span className="text-muted-foreground text-xs">{s.classes?.name ?? ""}</span>
                </div>
              ))}
              {data?.activities.map((a: any, i: number) => (
                <div key={`a-${i}`} className="text-sm flex justify-between border-b py-1">
                  <span>{a.co_curricular_activities?.name ?? "—"}</span>
                  <Badge variant="outline" className="text-[10px]">{a.role ?? a.co_curricular_activities?.category}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending">
          <Card><CardHeader><CardTitle className="text-base">Pending marks entry</CardTitle><CardDescription>Subject + exam combinations awaiting results for your subjects.</CardDescription></CardHeader>
            <CardContent className="space-y-1">
              {(data?.pendingMarks ?? []).length === 0 && <Empty>No active exams or assigned subjects.</Empty>}
              {data?.pendingMarks.map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between border-b py-2 text-sm">
                  <div>
                    <div className="font-medium">{p.subjectName}</div>
                    <div className="text-xs text-muted-foreground">{p.examName}</div>
                  </div>
                  <Badge
                    variant={p.status === "Complete" ? "default" : p.status === "Partial" ? "secondary" : "destructive"}
                    className="inline-flex items-center gap-1"
                  >
                    {p.status === "Complete" ? <CheckCircle2 className="w-3 h-3" /> : p.status === "Partial" ? <AlertCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {p.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance">
          <Card><CardHeader><CardTitle className="text-base">Today's attendance — my classes</CardTitle>
            <CardDescription>As class teacher you see the full breakdown; for classes where you only teach a subject you see a general count.</CardDescription>
          </CardHeader>
            <CardContent className="space-y-1">
              {(data?.attendanceSummary ?? []).length === 0 && <Empty>No classes assigned.</Empty>}
              {data?.attendanceSummary.map((s: any) => (
                <div key={s.classId} className="flex items-center justify-between border-b py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{s.className}</span>
                    {s.isClassTeacher && <Badge variant="outline" className="text-[10px]">Overall — class teacher</Badge>}
                  </div>
                  {s.isClassTeacher ? (
                    <div className="flex gap-2 text-xs">
                      <Badge variant="outline">{s.total} total</Badge>
                      <Badge variant="default">{s.present} present</Badge>
                      <Badge variant="destructive">{s.absent} absent</Badge>
                      <Badge variant="secondary">{s.late} late</Badge>
                    </div>
                  ) : (
                    <div className="flex gap-2 text-xs">
                      <Badge variant="outline">{s.marked}/{s.total} marked</Badge>
                      <Badge variant="default">{s.present} present</Badge>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="grid md:grid-cols-2 gap-3">
          <Card><CardHeader><CardTitle className="text-base">Recent marks entered</CardTitle></CardHeader>
            <CardContent>
              {(data?.recentMarks ?? []).length === 0 && <Empty>No marks recorded yet.</Empty>}
              {data?.recentMarks.map((m: any) => (
                <div key={m.id} className="flex justify-between border-b py-1 text-sm">
                  <span>{m.subjects?.name} · {m.exams?.name}</span>
                  <span className="font-mono">{m.score}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle className="text-base">Attendance I marked today</CardTitle></CardHeader>
            <CardContent>
              {(data?.recentAttendance ?? []).length === 0 && <Empty>No attendance marked today.</Empty>}
              {data?.recentAttendance.map((a: any) => (
                <div key={a.id} className="flex justify-between border-b py-1 text-sm">
                  <span>{a.students?.first_name} {a.students?.last_name}</span>
                  <Badge variant={a.status === "present" ? "default" : a.status === "absent" ? "destructive" : "secondary"}>{a.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payslips">
          <PayslipsTab staffId={staff?.id} />
        </TabsContent>
        <TabsContent value="news">
          <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Megaphone className="w-4 h-4" />Announcements</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(data?.announcements ?? []).length === 0 && <Empty>No announcements.</Empty>}
              {data?.announcements.map((a: any) => (
                <div key={a.id} className="border-b pb-3">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">{a.title}</div>
                    {a.pinned && <Badge variant="secondary">Pinned</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{a.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: number | string; icon: any }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-1">
        <CardDescription className="text-xs">{label}</CardDescription>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </CardHeader>
      <CardContent><div className="text-2xl font-bold">{value}</div></CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground py-3 text-center">{children}</p>;
}
