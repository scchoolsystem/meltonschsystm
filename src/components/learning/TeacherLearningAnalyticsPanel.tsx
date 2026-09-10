// ─── SmartDev Learning — Teacher Analytics Panel ──────────────────────────
// Per-class roster view of Learning (revision) performance: average mastery
// per student and the topics most in need of attention across the class.
// This is Learning data, not official results — it reads learning_mastery,
// never exam_results.
//
// RLS note: learning_mastery's teacher-read policy is school-scoped, not
// class-scoped (the migration's documented simplification — tightening to
// true per-class authorization needs a join through teacher_class_assignments
// that doesn't exist for Learning yet). This component filters to the
// teacher's own classIds client-side for display; the RLS boundary itself
// is still "any teaching staff at this school", not "only this teacher".

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Target, Users } from "lucide-react";

type ClassOption = { id: string; name: string };

type StudentRow = { id: string; first_name: string; last_name: string; class_id: string | null };

type MasteryRow = {
  student_id: string;
  mastery_score: number;
  status: string;
  curriculum_substrands: { name: string } | null;
};

export function TeacherLearningAnalyticsPanel({ classes }: { classes: ClassOption[] }) {
  const classIds = classes.map((c) => c.id);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["teacher-learning-analytics", classIds],
    enabled: classIds.length > 0,
    queryFn: async () => {
      const { data: students, error: studentsErr } = await supabase
        .from("students")
        .select("id, first_name, last_name, class_id")
        .in("class_id", classIds);
      if (studentsErr) throw studentsErr;

      const studentIds = (students ?? []).map((s: StudentRow) => s.id);
      if (studentIds.length === 0) return { students: [] as StudentRow[], mastery: [] as MasteryRow[] };

      const { data: mastery, error: masteryErr } = await supabase
        .from("learning_mastery")
        .select("student_id, mastery_score, status, curriculum_substrands(name)")
        .in("student_id", studentIds);
      if (masteryErr) throw masteryErr;

      return { students: (students ?? []) as StudentRow[], mastery: (mastery ?? []) as unknown as MasteryRow[] };
    },
  });

  if (classIds.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          No classes assigned yet — Learning analytics will appear once you're on a timetable.
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return <div className="p-6 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  if (isError || !data) {
    return <Card><CardContent className="pt-6 text-sm text-muted-foreground">Couldn't load Learning analytics.</CardContent></Card>;
  }

  const byStudent = new Map<string, number[]>();
  for (const m of data.mastery) {
    const arr = byStudent.get(m.student_id) ?? [];
    arr.push(m.mastery_score);
    byStudent.set(m.student_id, arr);
  }

  const topicTotals = new Map<string, { sum: number; count: number }>();
  for (const m of data.mastery) {
    const name = m.curriculum_substrands?.name;
    if (!name) continue;
    const cur = topicTotals.get(name) ?? { sum: 0, count: 0 };
    cur.sum += m.mastery_score;
    cur.count += 1;
    topicTotals.set(name, cur);
  }
  const weakTopics = Array.from(topicTotals.entries())
    .map(([name, { sum, count }]) => ({ name, avg: Math.round(sum / count) }))
    .filter((t) => t.avg < 55)
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 6);

  const roster = data.students
    .map((s) => {
      const scores = byStudent.get(s.id) ?? [];
      const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
      return { ...s, avg, attempts: scores.length };
    })
    .sort((a, b) => (a.avg ?? -1) - (b.avg ?? -1));

  return (
    <div className="space-y-6">
      {weakTopics.length > 0 && (
        <Card className="border-red-200 bg-red-50/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="w-4 h-4 text-red-500" /> Topics needing attention
            </CardTitle>
            <CardDescription>Class-wide average mastery, from revision activity.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {weakTopics.map((t) => (
              <Badge key={t.name} variant="outline" className="bg-white border-red-200 text-red-700">
                {t.name} · {t.avg}%
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4" /> Learning progress by student
          </CardTitle>
          <CardDescription>Average mastery across all topics attempted — revision only.</CardDescription>
        </CardHeader>
        <CardContent>
          {roster.length === 0 ? (
            <p className="text-sm text-muted-foreground">No students found for your classes.</p>
          ) : (
            <div className="space-y-1">
              {roster.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-1.5 text-sm border-b last:border-0">
                  <span>{s.first_name} {s.last_name}</span>
                  <span className="flex items-center gap-2">
                    {s.avg === null ? (
                      <span className="text-xs text-muted-foreground">No activity yet</span>
                    ) : (
                      <>
                        <span className="text-xs text-muted-foreground">{s.attempts} topic{s.attempts === 1 ? "" : "s"}</span>
                        <Badge variant="outline">{s.avg}%</Badge>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
