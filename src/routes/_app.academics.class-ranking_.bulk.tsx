import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase, getSessionSafe } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/use-tenant";
import { useAuth } from "@/hooks/use-auth";
import { useTeacherScope } from "@/hooks/use-teacher-scope";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Printer, ArrowLeft, ShieldCheck } from "lucide-react";
import {
  buildClassRanking, ClassMeritListSheet, CLASS_RANKING_PRINT_CSS,
} from "@/components/ClassRankingSheet";

// /academics/class-ranking/bulk?examId=...&rankBasis=mean|total
export const Route = createFileRoute("/_app/academics/class-ranking/bulk")({
  beforeLoad: async () => {
    const { data, timedOut } = await getSessionSafe();
    if (timedOut) return;
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: () => (
    <FeatureGate feature="academics_results">
      <BulkClassRankingPage />
    </FeatureGate>
  ),
});

function classLabel(c?: { name?: string | null; stream?: string | null } | null) {
  if (!c) return "—";
  return `${c.name ?? ""}${c.stream ? " " + c.stream : ""}`.trim() || "—";
}

function BulkClassRankingPage() {
  const { examId, rankBasis: rankBasisParam } = Route.useSearch() as {
    examId?: string; rankBasis?: "mean" | "total";
  };
  const rankBasis: "mean" | "total" = rankBasisParam === "total" ? "total" : "mean";
  const navigate = useNavigate();
  const { school } = useTenant();
  const { isAdmin, hasRole } = useAuth();
  const { isTeacherScoped, classIds } = useTeacherScope();

  const can = isAdmin || hasRole("teacher") || hasRole("class_teacher") ||
    hasRole("subject_teacher") || hasRole("hod") || hasRole("academic_master") ||
    hasRole("exams_admin");

  const { data: exam } = useQuery({
    queryKey: ["crb-exam", examId],
    enabled: !!examId,
    queryFn: async () => (await supabase
      .from("exams").select("id,name,term,year").eq("id", examId!).single()).data,
  });

  // Every class this user is allowed to see — teacher-scoped users get only
  // classes they teach, same restriction as the single-class page.
  const { data: classes = [], isLoading: classesLoading } = useQuery({
    queryKey: ["crb-classes", isTeacherScoped, classIds.join(",")],
    queryFn: async () => {
      let q = supabase.from("classes").select("id,name,stream").order("name");
      if (isTeacherScoped) {
        if (classIds.length === 0) return [];
        q = q.in("id", classIds);
      }
      return (await q).data ?? [];
    },
  });

  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ["crb-students", classes.map((c: any) => c.id).join(",")],
    enabled: classes.length > 0,
    queryFn: async () => (await supabase
      .from("students")
      .select("id,first_name,last_name,admission_no,class_id")
      .in("class_id", (classes as any[]).map((c) => c.id))
      .eq("status", "active")
      .order("first_name")).data ?? [],
  });

  const studentIds = useMemo(() => (students as any[]).map((s) => s.id), [students]);

  const { data: results = [], isLoading: resultsLoading } = useQuery({
    queryKey: ["crb-results", examId, studentIds.join(",")],
    enabled: !!examId && studentIds.length > 0,
    queryFn: async () => (await supabase
      .from("exam_results")
      .select("student_id,subject_id,score,grade,subjects(name,code)")
      .eq("exam_id", examId!)
      .in("student_id", studentIds)).data ?? [],
  });

  const isLoading = classesLoading || studentsLoading || resultsLoading;

  // Group students + results by class, then build one ranking per class —
  // same anti-N×M-loop shape as the bulk report-cards route: fetch once,
  // group in memory, never re-query per class.
  const classRankings = useMemo(() => {
    const studentsByClass = new Map<string, any[]>();
    (students as any[]).forEach((s) => {
      if (!studentsByClass.has(s.class_id)) studentsByClass.set(s.class_id, []);
      studentsByClass.get(s.class_id)!.push(s);
    });
    const studentClassMap = new Map<string, string>();
    (students as any[]).forEach((s) => studentClassMap.set(s.id, s.class_id));

    const resultsByClass = new Map<string, any[]>();
    (results as any[]).forEach((r) => {
      const clsId = studentClassMap.get(r.student_id);
      if (!clsId) return;
      if (!resultsByClass.has(clsId)) resultsByClass.set(clsId, []);
      resultsByClass.get(clsId)!.push(r);
    });

    return (classes as any[])
      .map((c) => ({
        classInfo: c,
        ranking: buildClassRanking(
          studentsByClass.get(c.id) ?? [],
          resultsByClass.get(c.id) ?? [],
          rankBasis
        ),
      }))
      .filter((entry) => entry.ranking.rows.length > 0);
  }, [classes, students, results, rankBasis]);

  if (!can) {
    return (
      <div className="flex items-center justify-center h-64 p-6">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-3">
            <ShieldCheck className="w-12 h-12 mx-auto text-muted-foreground opacity-50" />
            <h2 className="font-semibold text-lg">Bulk Class Ranking</h2>
            <p className="text-sm text-muted-foreground">You don't have access to bulk-print class rankings.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!examId) {
    return (
      <div className="flex items-center justify-center h-64 p-6">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-3">
            <Printer className="w-12 h-12 mx-auto text-muted-foreground opacity-40" />
            <h2 className="font-semibold text-lg">Bulk Class Ranking</h2>
            <p className="text-sm text-muted-foreground">Pick an exam from the Class Ranking page first.</p>
            <Button variant="outline" onClick={() => navigate({ to: "/academics/class-ranking" })}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Class Ranking
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 print:bg-white print:py-0">
      <style>{CLASS_RANKING_PRINT_CSS}</style>

      {/* Toolbar — hidden on print */}
      <div className="max-w-[1100px] mx-auto px-4 print:hidden mb-4 space-y-3">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/academics/class-ranking" })} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <Card>
          <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">
                {exam?.name} ({exam?.term} {exam?.year}) · Ranked by {rankBasis === "mean" ? "Mean Score" : "Total Score"}
              </p>
              <p className="text-sm text-muted-foreground">
                {isLoading ? "Loading…" : `${classRankings.length} class merit list${classRankings.length === 1 ? "" : "s"} ready to print`}
              </p>
            </div>
            <Button onClick={() => window.print()} disabled={isLoading || classRankings.length === 0}>
              <Printer className="w-4 h-4 mr-2" /> Print All ({classRankings.length})
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Sheets */}
      <div className="max-w-[1100px] mx-auto px-4 print:px-0 space-y-6 print:space-y-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : classRankings.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">No results found for any class in this exam.</CardContent></Card>
        ) : (
          classRankings.map(({ classInfo, ranking }, i) => (
            <ClassMeritListSheet
              key={classInfo.id}
              school={school}
              classLabel={classLabel(classInfo)}
              exam={exam}
              ranking={ranking}
              rankBasis={rankBasis}
              pageBreakAfter={i < classRankings.length - 1}
            />
          ))
        )}
      </div>
    </div>
  );
}
