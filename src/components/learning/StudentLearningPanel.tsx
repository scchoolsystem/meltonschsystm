// ─── SmartDev Learning — Student Panel ────────────────────────────────────
// Self-contained component embedded as a new "Learning" tab in the existing
// student portal (_app.portal_.student.tsx). Deliberately kept out of that
// 3000+ line file — only a tab entry + <TabsContent> wrapper were added
// there, so this can be iterated on independently without touching the
// fragile monolith.
//
// Scope of this first slice: browse published universal + own-school
// quizzes, take one (MCQ / true-false rendering only — other question_types
// are stored but not yet rendered here), see the result, and see current
// mastery + pending recommendations. All writes go through the RPC
// functions from the SmartDev Learning migration — this component never
// writes learning_mastery / learning_quiz_answers / learning_question_attempts
// directly, matching the RLS design (those tables have no client write
// policy).

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  BookOpen, CheckCircle2, XCircle, Sparkles, Target, ArrowLeft,
  ArrowRight, Loader2, TrendingUp, Globe, School,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types (mirrors the learning_* schema; kept local — no generated types
// exist yet for these tables) ───────────────────────────────────────────
type QuizRow = {
  id: string;
  title: string;
  description: string | null;
  content_scope: "universal" | "school" | "teacher" | "personal";
  topic: string | null;
  mode: string;
  time_limit_seconds: number | null;
};

type QuizQuestionRow = {
  question_id: string;
  sort_order: number;
  learning_questions: {
    id: string;
    question_text: string;
    question_type: string;
    options: { id: string; text: string }[] | null;
    marks: number;
  };
};

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

export function StudentLearningPanel() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [mastery, setMastery] = useState<MasteryRow[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationRow[]>([]);

  // active quiz-taking state
  const [activeQuiz, setActiveQuiz] = useState<QuizRow | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestionRow[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null); // mcq option id, or "true"/"false"
  const [shortAnswerText, setShortAnswerText] = useState("");
  const [lastResult, setLastResult] = useState<{ correct: boolean; explanation: string | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [finalScore, setFinalScore] = useState<{ score: number; max: number; pct: number } | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const { data: quizData, error: quizErr } = await supabase
        .from("learning_quizzes")
        .select("id, title, description, content_scope, topic, mode, time_limit_seconds")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(30);
      if (quizErr) throw quizErr;
      setQuizzes((quizData ?? []) as QuizRow[]);

      const { data: masteryData, error: masteryErr } = await supabase
        .from("learning_mastery")
        .select("substrand_id, mastery_score, status, curriculum_substrands(name), curriculum_subjects(name)")
        .order("mastery_score", { ascending: true });
      if (masteryErr) throw masteryErr;
      setMastery((masteryData ?? []) as unknown as MasteryRow[]);

      const { data: recData, error: recErr } = await supabase
        .from("learning_recommendations")
        .select("id, topic, reason, priority")
        .eq("status", "pending")
        .order("priority", { ascending: true })
        .limit(10);
      if (recErr) throw recErr;
      setRecommendations((recData ?? []) as RecommendationRow[]);
    } catch (err: any) {
      console.error("[StudentLearningPanel] load failed", err);
      toast.error("Couldn't load Learning data", { description: err?.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadDashboard();
  }, [user, loadDashboard]);

  const startQuiz = async (quiz: QuizRow) => {
    try {
      const { data: newAttemptId, error: startErr } = await supabase.rpc("learning_quiz_start", {
        _quiz_id: quiz.id,
      });
      if (startErr) throw startErr;

      const { data: qData, error: qErr } = await supabase
        .from("learning_quiz_questions")
        .select("question_id, sort_order, learning_questions(id, question_text, question_type, options, marks)")
        .eq("quiz_id", quiz.id)
        .order("sort_order", { ascending: true });
      if (qErr) throw qErr;

      setActiveQuiz(quiz);
      setAttemptId(newAttemptId as string);
      setQuestions((qData ?? []) as unknown as QuizQuestionRow[]);
      setQIndex(0);
      setSelected(null);
      setShortAnswerText("");
      setLastResult(null);
      setFinalScore(null);
    } catch (err: any) {
      console.error("[StudentLearningPanel] start quiz failed", err);
      toast.error("Couldn't start this quiz", { description: err?.message });
    }
  };

  const currentQuestion = questions[qIndex]?.learning_questions;

  // Shape sent to learning_record_question_attempt must match what
  // learning_question_answers.correct_answer was stored as for this
  // question_type — {option}, {value}, or {text}. See
  // _app.academics.learning-question-bank.tsx for the write side.
  const buildSelectedAnswer = () => {
    if (!currentQuestion) return null;
    if (currentQuestion.question_type === "true_false") return { value: selected === "true" };
    // lowercased to match the case-insensitive normalization applied when
    // the correct answer was stored — see learning-question-bank.tsx
    if (currentQuestion.question_type === "short_answer") return { text: shortAnswerText.trim().toLowerCase() };
    return { option: selected };
  };

  const canSubmit =
    !!currentQuestion &&
    (currentQuestion.question_type === "short_answer" ? !!shortAnswerText.trim() : !!selected);

  const submitAnswer = async () => {
    if (!currentQuestion || !attemptId || !canSubmit) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("learning_record_question_attempt", {
        _question_id: currentQuestion.id,
        _selected_answer: buildSelectedAnswer(),
        _quiz_attempt_id: attemptId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setLastResult({ correct: !!row?.is_correct, explanation: row?.explanation ?? null });
    } catch (err: any) {
      console.error("[StudentLearningPanel] record attempt failed", err);
      toast.error("Couldn't submit that answer", { description: err?.message });
    } finally {
      setSubmitting(false);
    }
  };

  const nextQuestion = async () => {
    if (qIndex + 1 < questions.length) {
      setQIndex(qIndex + 1);
      setSelected(null);
      setShortAnswerText("");
      setLastResult(null);
      return;
    }
    // last question answered — finalise
    if (!attemptId) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("learning_quiz_submit", { _attempt_id: attemptId });
      if (error) throw error;
      const { data: attemptRow } = await supabase
        .from("learning_quiz_attempts")
        .select("score, max_score, percentage")
        .eq("id", attemptId)
        .single();
      setFinalScore({
        score: attemptRow?.score ?? 0,
        max: attemptRow?.max_score ?? 0,
        pct: attemptRow?.percentage ?? 0,
      });
      loadDashboard(); // refresh mastery + recommendations in the background
    } catch (err: any) {
      console.error("[StudentLearningPanel] submit quiz failed", err);
      toast.error("Couldn't finish the quiz", { description: err?.message });
    } finally {
      setSubmitting(false);
    }
  };

  const exitQuiz = () => {
    setActiveQuiz(null);
    setAttemptId(null);
    setQuestions([]);
    setFinalScore(null);
  };

  // ── Quiz-taking view ────────────────────────────────────────────────
  if (activeQuiz) {
    if (finalScore) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" /> {activeQuiz.title} — complete
            </CardTitle>
            <CardDescription>This is a revision score — it never affects your official results.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center py-6">
              <div className="text-4xl font-bold">{finalScore.pct}%</div>
              <div className="text-sm text-muted-foreground mt-1">
                {finalScore.score} / {finalScore.max} marks
              </div>
            </div>
            <Button onClick={exitQuiz} className="w-full">Back to Learning</Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{activeQuiz.title}</CardTitle>
            <Badge variant="outline">{qIndex + 1} / {questions.length}</Badge>
          </div>
          <Progress value={((qIndex + (lastResult ? 1 : 0)) / Math.max(questions.length, 1)) * 100} />
        </CardHeader>
        <CardContent className="space-y-4">
          {!currentQuestion ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <>
              <p className="font-medium">{currentQuestion.question_text}</p>

              {currentQuestion.question_type === "true_false" ? (
                <div className="flex gap-2">
                  {(["true", "false"] as const).map((v) => (
                    <button
                      key={v}
                      disabled={!!lastResult}
                      onClick={() => setSelected(v)}
                      className={`flex-1 text-center px-4 py-3 rounded-lg border text-sm capitalize transition-colors ${
                        selected === v ? "border-primary bg-primary/5" : "border-input hover:bg-muted/50"
                      } ${lastResult ? "opacity-80" : ""}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              ) : currentQuestion.question_type === "short_answer" ? (
                <Input
                  value={shortAnswerText}
                  onChange={(e) => setShortAnswerText(e.target.value)}
                  disabled={!!lastResult}
                  placeholder="Type your answer"
                />
              ) : (
                <div className="space-y-2">
                  {(currentQuestion.options ?? []).map((opt) => {
                    const isSelected = selected === opt.id;
                    const showResult = !!lastResult;
                    return (
                      <button
                        key={opt.id}
                        disabled={showResult}
                        onClick={() => setSelected(opt.id)}
                        className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-input hover:bg-muted/50"
                        } ${showResult ? "opacity-80" : ""}`}
                      >
                        {opt.text}
                      </button>
                    );
                  })}
                </div>
              )}

              {lastResult && (
                <div
                  className={`rounded-lg border p-3 text-sm flex gap-2 items-start ${
                    lastResult.correct
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  {lastResult.correct ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  )}
                  <div>
                    <div className="font-medium">{lastResult.correct ? "Correct!" : "Not quite"}</div>
                    {lastResult.explanation && <div className="mt-1 opacity-90">{lastResult.explanation}</div>}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <Button variant="ghost" size="sm" onClick={exitQuiz}>
                  <ArrowLeft className="w-4 h-4 mr-1" /> Exit
                </Button>
                {!lastResult ? (
                  <Button onClick={submitAnswer} disabled={!canSubmit || submitting}>
                    {submitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                    Check answer
                  </Button>
                ) : (
                  <Button onClick={nextQuestion} disabled={submitting}>
                    {submitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                    {qIndex + 1 < questions.length ? "Next question" : "Finish"}
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Dashboard view ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {recommendations.length > 0 && (
        <Card className="border-violet-200 bg-violet-50/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-violet-600" /> Recommended for you
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {recommendations.map((r) => (
              <Badge key={r.id} variant="outline" className="bg-white">
                {r.topic ?? "Revision"}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="w-4 h-4" /> Practice & revision quizzes
            </CardTitle>
            <CardDescription>Revision only — never affects your official results.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {quizzes.length === 0 && (
              <p className="text-sm text-muted-foreground">No quizzes published yet.</p>
            )}
            {quizzes.map((q) => (
              <div
                key={q.id}
                className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/40 transition-colors"
              >
                <div>
                  <div className="font-medium text-sm flex items-center gap-1.5">
                    {q.content_scope === "universal" ? (
                      <Globe className="w-3.5 h-3.5 text-blue-500" />
                    ) : (
                      <School className="w-3.5 h-3.5 text-emerald-600" />
                    )}
                    {q.title}
                  </div>
                  {q.topic && <div className="text-xs text-muted-foreground mt-0.5">{q.topic}</div>}
                </div>
                <Button size="sm" onClick={() => startQuiz(q)}>Start</Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="w-4 h-4" /> Mastery by topic
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {mastery.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Take a quiz to start building your mastery profile.
              </p>
            )}
            {mastery.map((m, i) => (
              <div key={m.substrand_id ?? i} className="flex items-center justify-between gap-2 py-1.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {m.curriculum_substrands?.name ?? "Topic"}
                  </div>
                  <div className="text-xs text-muted-foreground">{m.curriculum_subjects?.name}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold">{m.mastery_score}%</span>
                  <Badge className={statusColor[m.status]} variant="outline">
                    {m.status.replace("_", " ")}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
