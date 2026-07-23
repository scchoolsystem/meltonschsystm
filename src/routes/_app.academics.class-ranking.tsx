import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useAuth } from "@/hooks/use-auth";
import { useTenant } from "@/hooks/use-tenant";
import { useTeacherScope } from "@/hooks/use-teacher-scope";
import { useQuery } from "@tanstack/react-query";
import { supabase, getSessionSafe } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, Printer, Trophy, ListChecks, ShieldCheck, Users,
} from "lucide-react";
import {
  buildClassRanking, ClassMeritListSheet, SubjectRankingSheet, CLASS_RANKING_PRINT_CSS,
} from "@/components/ClassRankingSheet";

export const Route = createFileRoute("/_app/academics/class-ranking")({
  beforeLoad: async () => {
    const { data, timedOut } = await getSessionSafe();
    if (timedOut) return; // defer to AppLayout's own client-side session check
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: () => (
    <FeatureGate feature="academics_results">
      <ClassRankingPage />
    </FeatureGate>
  ),
});

function classLabel(c?: { name?: string | null; stream?: string | null } | null) {
  if (!c) return "—";
  return `${c.name ?? ""}${c.stream ? " " + c.stream : ""}`.trim() || "—";
}

function ClassRankingPage() {
  const { isAdmin, hasRole } = useAuth();
  const { school } = useTenant();
  const { isTeacherScoped, classIds } = useTeacherScope();

  const can = isAdmin || hasRole("teacher") || hasRole("class_teacher") ||
    hasRole("subject_teacher") || hasRole("hod") || hasRole("academic_master") ||
    hasRole("exams_admin");

  const [classId, setClassId] = useState("");
  const [examId, setExamId] = useState("");
  const [rankBasis, setRankBasis] = useState<"mean" | "total">("mean");
  const [activeTab, setActiveTab] = useState("merit");
  const [subjectId, setSubjectId] = useState("");

  // ── Classes (scoped to the teacher's own classes if applicable) ─────────
  const { data: classes = [], isLoading: classesLoading } = useQuery({
    queryKey: ["cr-classes", isTeacherScoped, classIds.join(",")],
    queryFn: async () => {
      let q = supabase.from("classes").select("id,name,stream").order("name");
      if (isTeacherScoped) {
        if (classIds.length === 0) return [];
        q = q.in("id", classIds);
      }
      return (await q).data ?? [];
    },
  });

  const { data: exams = [], isLoading: examsLoading } = useQuery({
    queryKey: ["cr-exams"],
    queryFn: async () =>
      (await supabase.from("exams").select("id,name,term,year").order("start_date", { ascending: false })).data ?? [],
  });

  const classInfo = useMemo(
    () => (classes as any[]).find((c) => c.id === classId) ?? null,
    [classes, classId]
  );
  const exam = useMemo(
    () => (exams as any[]).find((e) => e.id === examId) ?? null,
    [exams, examId]
  );

  const classAllowed = !isTeacherScoped || (!!classId && classIds.includes(classId));

  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ["cr-students", classId],
    enabled: !!classId && classAllowed,
    queryFn: async () => (await supabase
      .from("students")
      .select("id,first_name,last_name,admission_no")
      .eq("class_id", classId)
      .eq("status", "active")
      .order("first_name")).data ?? [],
  });

  const studentIds = useMemo(() => (students as any[]).map((s) => s.id), [students]);

  const { data: results = [], isLoading: resultsLoading } = useQuery({
    queryKey: ["cr-results", examId, studentIds.join(",")],
    enabled: !!examId && studentIds.length > 0,
    queryFn: async () => (await supabase
      .from("exam_results")
      .select("student_id,subject_id,score,grade,subjects(name,code)")
      .eq("exam_id", examId)
      .in("student_id", studentIds)).data ?? [],
  });

  const isLoading = classesLoading || examsLoading || studentsLoading || resultsLoading;

  const ranking = useMemo(
    () => buildClassRanking(students as any[], results as any[], rankBasis),
    [students, results, rankBasis]
  );

  // Default the subject-ranking picker to the first available subject.
  useMemo(() => {
    if (!subjectId && ranking.subjectCols.length > 0) setSubjectId(ranking.subjectCols[0].id);
  }, [ranking.subjectCols, subjectId]);

  if (!can) {
    return (
      <div className="flex items-center justify-center h-64 p-6">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-3">
            <ShieldCheck className="w-12 h-12 mx-auto text-muted-foreground opacity-50" />
            <h2 className="font-semibold text-lg">Class Ranking</h2>
            <p className="text-sm text-muted-foreground">You don't have access to class ranking sheets.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const ready = !!classId && !!examId && classAllowed;

  return (
    <div className="space-y-6 print:space-y-0">
      <style>{CLASS_RANKING_PRINT_CSS}</style>

      {/* ── Header + picker (hidden on print) ───────────────────────────── */}
      <div className="no-print space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Class Ranking</h1>
            <p className="text-sm text-muted-foreground">
              Select a class and exam to see the full merit list — every subject plus overall
              position — or a single subject's ranking, ready to print.
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6 flex flex-col sm:flex-row gap-3 flex-wrap items-end">
            <div className="flex-1 min-w-[160px]">
              <Label className="text-xs mb-1.5 block">Class</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger><SelectValue placeholder={classesLoading ? "Loading…" : "Select a class"} /></SelectTrigger>
                <SelectContent>
                  {(classes as any[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{classLabel(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <Label className="text-xs mb-1.5 block">Exam</Label>
              <Select value={examId} onValueChange={setExamId}>
                <SelectTrigger><SelectValue placeholder={examsLoading ? "Loading…" : "Select an exam"} /></SelectTrigger>
                <SelectContent>
                  {(exams as any[]).map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name} — {e.term} {e.year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-36">
              <Label className="text-xs mb-1.5 block">Rank by</Label>
              <Select value={rankBasis} onValueChange={(v) => setRankBasis(v as "mean" | "total")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mean">Mean Score</SelectItem>
                  <SelectItem value="total">Total Score</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {ready && (
              <Button onClick={() => window.print()} disabled={isLoading || ranking.rows.length === 0} className="gap-1.5">
                <Printer className="w-4 h-4" /> Print
              </Button>
            )}
            {examId && (
              <Button asChild variant="outline" className="gap-1.5">
                <Link to="/academics/class-ranking/bulk" search={{ examId, rankBasis }}>
                  <Printer className="w-4 h-4" /> Print All Classes
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>

        {!classAllowed && classId && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              You aren't assigned to this class.
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {!ready ? (
        <Card className="no-print">
          <CardContent className="py-16 text-center text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
            Select a class and exam above to generate the ranking.
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-16 no-print">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="no-print">
            <TabsTrigger value="merit" className="gap-1.5 text-xs"><ListChecks className="w-3.5 h-3.5" /> Full Merit List</TabsTrigger>
            <TabsTrigger value="subject" className="gap-1.5 text-xs"><Trophy className="w-3.5 h-3.5" /> Subject Ranking</TabsTrigger>
          </TabsList>

          <TabsContent value="merit" className="mt-4">
            <ClassMeritListSheet
              school={school}
              classLabel={classLabel(classInfo)}
              exam={exam}
              ranking={ranking}
              rankBasis={rankBasis}
            />
          </TabsContent>

          <TabsContent value="subject" className="mt-4 space-y-3">
            <div className="no-print w-56">
              <Label className="text-xs mb-1.5 block">Subject</Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger><SelectValue placeholder="Select a subject" /></SelectTrigger>
                <SelectContent>
                  {ranking.subjectCols.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {subjectId && (
              <SubjectRankingSheet
                school={school}
                classLabel={classLabel(classInfo)}
                exam={exam}
                ranking={ranking}
                subjectId={subjectId}
              />
            )}
          </TabsContent>
        </Tabs>
      )}

      <div className="no-print">
        <Link to="/academics/results" className="text-xs text-muted-foreground hover:underline">
          ← Back to Results
        </Link>
      </div>
    </div>
  );
}
