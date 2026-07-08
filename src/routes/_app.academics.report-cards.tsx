import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase, getSessionSafe } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useTeacherScope } from "@/hooks/use-teacher-scope";
import {
  Loader2, Search, ClipboardList, LayoutDashboard, FileText,
  GraduationCap, ChevronRight,
} from "lucide-react";

// ─── Route ──────────────────────────────────────────────────────────────────
export const Route = createFileRoute("/_app/academics/report-cards")({
  beforeLoad: async () => {
    const { data, timedOut } = await getSessionSafe();
    if (timedOut) return; // defer to AppLayout's own client-side session check
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: ReportCardsPicker,
});

// ─── Helpers ────────────────────────────────────────────────────────────────
function fallbackGrade(s: number): string {
  if (s >= 80) return "A";  if (s >= 75) return "A-"; if (s >= 70) return "B+";
  if (s >= 65) return "B";  if (s >= 60) return "B-"; if (s >= 55) return "C+";
  if (s >= 50) return "C";  if (s >= 45) return "C-"; if (s >= 40) return "D+";
  if (s >= 35) return "D";  if (s >= 30) return "D-"; return "E";
}

function gradeColor(grade: string): string {
  if (["A", "A-"].includes(grade)) return "#16a34a";
  if (["B+", "B", "B-"].includes(grade)) return "#2563eb";
  if (["C+", "C", "C-"].includes(grade)) return "#d97706";
  if (["D+", "D", "D-"].includes(grade)) return "#ea580c";
  return "#dc2626";
}

function initials(first?: string, last?: string) {
  return `${(first ?? "?")[0] ?? ""}${(last ?? "")[0] ?? ""}`.toUpperCase();
}

// ─── Main picker page ───────────────────────────────────────────────────────
function ReportCardsPicker() {
  const { isAdmin, hasRole } = useAuth();
  const { isTeacherScoped, classIds } = useTeacherScope();
  const canBrowse = isAdmin || hasRole("teacher") || hasRole("class_teacher") ||
    hasRole("subject_teacher") || hasRole("hod") || hasRole("academic_master") ||
    hasRole("exams_admin") || hasRole("principal") || hasRole("deputy_principal");

  const [classId, setClassId] = useState<string>("");
  const [examId, setExamId] = useState<string>("");
  const [search, setSearch] = useState("");

  // ── Classes (scoped to the teacher's own classes if applicable) ─────────
  const { data: classes = [], isLoading: classesLoading } = useQuery({
    queryKey: ["rc-picker-classes", isTeacherScoped, classIds.join(",")],
    queryFn: async () => {
      let q = supabase.from("classes").select("id,name,stream,year").order("name");
      if (isTeacherScoped) {
        if (classIds.length === 0) return [];
        q = q.in("id", classIds);
      }
      const { data } = await q;
      return data ?? [];
    },
  });

  // ── Exams ────────────────────────────────────────────────────────────────
  const { data: exams = [], isLoading: examsLoading } = useQuery({
    queryKey: ["rc-picker-exams"],
    queryFn: async () =>
      (await supabase.from("exams").select("id,name,term,year").order("start_date", { ascending: false })).data ?? [],
  });

  // Default to the most recent exam once loaded
  useMemo(() => {
    if (!examId && exams.length > 0) setExamId(exams[0].id);
  }, [exams, examId]);

  // ── Students in selected class ──────────────────────────────────────────
  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ["rc-picker-students", classId],
    enabled: !!classId,
    queryFn: async () =>
      (await supabase
        .from("students")
        .select("id,first_name,last_name,admission_no,photo_url")
        .eq("class_id", classId)
        .order("first_name")).data ?? [],
  });

  // ── Exam results for selected class + exam (for quick average badge) ────
  const studentIds = useMemo(() => students.map((s: any) => s.id), [students]);
  const { data: results = [] } = useQuery({
    queryKey: ["rc-picker-results", examId, studentIds.join(",")],
    enabled: !!examId && studentIds.length > 0,
    queryFn: async () =>
      (await supabase
        .from("exam_results")
        .select("student_id,score")
        .eq("exam_id", examId)
        .in("student_id", studentIds)).data ?? [],
  });

  const averages = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    (results as any[]).forEach((r) => {
      const cur = map.get(r.student_id) ?? { total: 0, count: 0 };
      cur.total += Number(r.score) || 0;
      cur.count += 1;
      map.set(r.student_id, cur);
    });
    const out = new Map<string, number>();
    map.forEach((v, k) => out.set(k, v.count ? v.total / v.count : 0));
    return out;
  }, [results]);

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return students;
    return (students as any[]).filter((s) =>
      `${s.first_name} ${s.last_name} ${s.admission_no}`.toLowerCase().includes(term)
    );
  }, [students, search]);

  if (!canBrowse) {
    return (
      <div className="flex items-center justify-center h-64 p-6 animate-in fade-in duration-300">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-3">
            <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground opacity-50" />
            <h2 className="font-semibold text-lg">Report Cards</h2>
            <p className="text-sm text-muted-foreground">
              You don't have access to view student report cards.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <ClipboardList className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Report Cards</h1>
          <p className="text-sm text-muted-foreground">
            Pick a class and exam, then choose a student to view their report card or full dashboard.
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="animate-in fade-in slide-in-from-bottom-1 duration-300 delay-75">
        <CardContent className="pt-6 flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Class</label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder={classesLoading ? "Loading…" : "Select a class"} /></SelectTrigger>
              <SelectContent>
                {(classes as any[]).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}{c.stream ? ` — ${c.stream}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Exam</label>
            <Select value={examId} onValueChange={setExamId}>
              <SelectTrigger><SelectValue placeholder={examsLoading ? "Loading…" : "Select an exam"} /></SelectTrigger>
              <SelectContent>
                {(exams as any[]).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name} — {e.term} {e.year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Search student</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Name or admission no."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
                disabled={!classId}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Student list */}
      {!classId ? (
        <Card className="animate-in fade-in duration-300">
          <CardContent className="py-16 text-center text-muted-foreground">
            <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-40" />
            Select a class above to see its students.
          </CardContent>
        </Card>
      ) : studentsLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredStudents.length === 0 ? (
        <Card className="animate-in fade-in duration-300">
          <CardContent className="py-16 text-center text-muted-foreground">
            No students match your search.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredStudents.map((s: any, i: number) => {
            const avg = averages.get(s.id);
            const grade = avg !== undefined ? fallbackGrade(avg) : null;
            return (
              <Card
                key={s.id}
                className="group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 animate-in fade-in slide-in-from-bottom-2"
                style={{ animationDelay: `${Math.min(i * 40, 400)}ms`, animationDuration: "300ms" }}
              >
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-11 w-11">
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                        {initials(s.first_name, s.last_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{s.first_name} {s.last_name}</p>
                      <p className="text-xs text-muted-foreground">Adm. {s.admission_no}</p>
                    </div>
                    {grade && (
                      <Badge
                        className="font-bold"
                        style={{ backgroundColor: `${gradeColor(grade)}1a`, color: gradeColor(grade), borderColor: "transparent" }}
                      >
                        {grade}
                      </Badge>
                    )}
                  </div>

                  <div className="flex gap-2 pt-1">
                    {examId ? (
                      <Button asChild size="sm" variant="outline" className="flex-1 gap-1.5 text-xs">
                        <Link to="/academics/report-card/$studentId/$examId" params={{ studentId: s.id, examId }}>
                          <FileText className="w-3.5 h-3.5" /> Report Card
                        </Link>
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-xs" disabled>
                        <FileText className="w-3.5 h-3.5" /> Report Card
                      </Button>
                    )}
                    <Button asChild size="sm" className="flex-1 gap-1.5 text-xs">
                      <Link to="/portal/student" search={{ studentId: s.id }}>
                        <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
