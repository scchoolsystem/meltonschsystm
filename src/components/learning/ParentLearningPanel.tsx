// ─── SmartDev Learning — Parent Panel ─────────────────────────────────────
// Read-only view of a linked child's Learning progress: mastery by topic
// and pending recommendations. No quiz-taking here — that's student-only.
// RLS already scopes every query to children the signed-in parent is
// actually linked to (is_parent_of()), so this component doesn't need to
// re-check authorization itself; it just renders whatever comes back.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Target } from "lucide-react";

type MasteryRow = {
  substrand_id: string | null;
  mastery_score: number;
  status: "strong" | "improving" | "needs_practice" | "not_attempted";
  curriculum_substrands: { name: string } | null;
  curriculum_subjects: { name: string } | null;
};

type RecommendationRow = {
  id: string;
  topic: string | null;
  reason: string | null;
  priority: number;
};

const statusColor: Record<string, string> = {
  strong: "bg-emerald-100 text-emerald-700 border-emerald-200",
  improving: "bg-amber-100 text-amber-700 border-amber-200",
  needs_practice: "bg-red-100 text-red-700 border-red-200",
  not_attempted: "bg-slate-100 text-slate-600 border-slate-200",
};

export function ParentLearningPanel({ studentId }: { studentId: string }) {
  const [loading, setLoading] = useState(true);
  const [mastery, setMastery] = useState<MasteryRow[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationRow[]>([]);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const [{ data: masteryData }, { data: recData }] = await Promise.all([
        supabase
          .from("learning_mastery")
          .select("substrand_id, mastery_score, status, curriculum_substrands(name), curriculum_subjects(name)")
          .eq("student_id", studentId)
          .order("mastery_score", { ascending: true }),
        supabase
          .from("learning_recommendations")
          .select("id, topic, reason, priority")
          .eq("student_id", studentId)
          .eq("status", "pending")
          .order("priority", { ascending: true })
          .limit(10),
      ]);
      if (cancelled) return;
      setMastery((masteryData ?? []) as unknown as MasteryRow[]);
      setRecommendations((recData ?? []) as RecommendationRow[]);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  const strong = mastery.filter((m) => m.status === "strong");
  const needsPractice = mastery.filter((m) => m.status === "needs_practice");

  return (
    <div className="space-y-6">
      <Card className="border-blue-200 bg-blue-50/40">
        <CardContent className="pt-4 text-sm text-blue-900">
          This is revision/practice activity — separate from official exam results, which appear
          under the Results tab.
        </CardContent>
      </Card>

      {recommendations.length > 0 && (
        <Card className="border-violet-200 bg-violet-50/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-violet-600" /> AI recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recommendations.map((r) => (
              <div key={r.id} className="text-sm">
                <span className="font-medium">{r.topic ?? "Revision"}</span>
                {r.reason && <span className="text-muted-foreground"> — {r.reason}</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="w-4 h-4 text-emerald-600" /> Strong areas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {strong.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
            {strong.map((m, i) => (
              <div key={m.substrand_id ?? i} className="flex items-center justify-between text-sm">
                <span>{m.curriculum_substrands?.name ?? "Topic"}</span>
                <Badge variant="outline" className={statusColor.strong}>{m.mastery_score}%</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="w-4 h-4 text-red-500" /> Needs practice
            </CardTitle>
            <CardDescription>Where extra revision would help most.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {needsPractice.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing flagged right now.</p>
            )}
            {needsPractice.map((m, i) => (
              <div key={m.substrand_id ?? i} className="flex items-center justify-between text-sm">
                <span>{m.curriculum_substrands?.name ?? "Topic"}</span>
                <Badge variant="outline" className={statusColor.needs_practice}>{m.mastery_score}%</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
