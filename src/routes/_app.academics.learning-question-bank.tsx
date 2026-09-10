/**
 * _app.academics.learning-question-bank.tsx — SmartDev Learning: Question
 * Bank & Quizzes (school-admin / teaching-staff console)
 *
 * Scope of this screen: author school-scoped MCQ/true-false questions with
 * their answer key, and build quizzes from them. Deliberately does NOT
 * expose "Universal" content_scope here — that requires platform-admin
 * authorization, and there's no frontend platform-admin detection wired up
 * anywhere in this codebase yet (is_platform_admin() only exists as a DB
 * function; nothing in use-auth.tsx / core/rbac.ts surfaces it client-side).
 * Building a Universal/platform console is a separate follow-up once that
 * exists.
 *
 * Also note: there's no curriculum-builder UI yet (curricula /
 * curriculum_grades / curriculum_strands / curriculum_substrands are only
 * populated by direct SQL or the RLS test fixtures so far). The substrand
 * picker below just lists whatever substrands already exist for the school's
 * curriculum and degrades to "no topic" if none do — mastery/revision won't
 * have anything to group by until that curriculum data exists. That's a
 * real gap, not an oversight: a curriculum management screen is the next
 * piece this needs.
 */

import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Loader2, BookOpen, ListChecks, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/academics/learning-question-bank")({
  component: () => (
    <FeatureGate feature="academics_subjects">
      <Page />
    </FeatureGate>
  ),
});

type Substrand = { id: string; name: string; curriculum_strands: { name: string; curriculum_subjects: { name: string } | null } | null };
type Question = {
  id: string;
  question_text: string;
  question_type: string;
  options: { id: string; text: string }[] | null;
  status: string;
  topic: string | null;
  substrand_id: string | null;
  marks: number;
};
type Quiz = { id: string; title: string; topic: string | null; status: string; mode: string };

type QuestionType = "mcq" | "true_false" | "short_answer";
const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "Multiple choice",
  true_false: "True / False",
  short_answer: "Short answer",
};

const BLANK_OPTIONS = [
  { id: "a", text: "" },
  { id: "b", text: "" },
];

function Page() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("questions");

  // ── Shared: substrands for tagging ──────────────────────────────────
  const { data: substrands = [] } = useQuery({
    queryKey: ["learning-substrands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("curriculum_substrands")
        .select("id, name, curriculum_strands(name, curriculum_subjects(name))")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Substrand[];
    },
  });

  // ── Questions ────────────────────────────────────────────────────────
  const { data: questions = [], isLoading: qLoading } = useQuery({
    queryKey: ["learning-questions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_questions")
        .select("id, question_text, question_type, options, status, topic, substrand_id, marks")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Question[];
    },
  });

  const [addQOpen, setAddQOpen] = useState(false);
  const [qForm, setQForm] = useState({
    question_type: "mcq" as QuestionType,
    question_text: "",
    topic: "",
    substrand_id: "none",
    marks: 1,
    options: BLANK_OPTIONS,
    correct: "a",          // mcq: option id
    correctBool: "true",   // true_false: "true" | "false"
    correctText: "",       // short_answer: accepted answer (exact-ish match, case-insensitive at grading time)
    explanation: "",
  });
  const resetQForm = () =>
    setQForm({
      question_type: "mcq", question_text: "", topic: "", substrand_id: "none", marks: 1,
      options: BLANK_OPTIONS, correct: "a", correctBool: "true", correctText: "", explanation: "",
    });

  const addQuestion = useMutation({
    mutationFn: async () => {
      const { data: schoolId, error: schoolErr } = await supabase.rpc("current_user_school");
      if (schoolErr) throw schoolErr;

      // Options only apply to MCQ — true/false and short answer don't store
      // an options array (nothing for the student to pick from).
      const options = qForm.question_type === "mcq" ? qForm.options.filter((o) => o.text.trim()) : null;

      const { data: inserted, error } = await supabase
        .from("learning_questions")
        .insert([{
          content_scope: "school",
          school_id: schoolId,
          substrand_id: qForm.substrand_id === "none" ? null : qForm.substrand_id,
          topic: qForm.topic.trim() || null,
          question_type: qForm.question_type,
          question_text: qForm.question_text.trim(),
          options,
          marks: qForm.marks,
          status: "published",
        }])
        .select("id")
        .single();
      if (error) throw error;

      // Shape of correct_answer depends on question_type — kept as a small
      // discriminated JSON blob rather than three separate columns, since
      // the grading function (learning_record_question_attempt) can switch
      // on question_type to interpret it either way.
      const correct_answer =
        qForm.question_type === "mcq" ? { option: qForm.correct }
        : qForm.question_type === "true_false" ? { value: qForm.correctBool === "true" }
        // Normalized to lowercase+trimmed so this actually matches what the
        // student submits — learning_record_question_attempt() does exact
        // jsonb equality (v_correct_answer = _selected_answer), which is
        // case-sensitive on the raw text. Case-insensitivity has to happen
        // here and in StudentLearningPanel.tsx's submit, not in the SQL.
        : { text: qForm.correctText.trim().toLowerCase() };

      const { error: answerErr } = await supabase.from("learning_question_answers").insert([{
        question_id: inserted.id,
        correct_answer,
        explanation: qForm.explanation.trim() || null,
      }]);
      if (answerErr) throw answerErr;
    },
    onSuccess: () => {
      toast.success("Question added");
      setAddQOpen(false);
      resetQForm();
      qc.invalidateQueries({ queryKey: ["learning-questions"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to add question"),
  });

  const deleteQuestion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("learning_questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Question deleted");
      qc.invalidateQueries({ queryKey: ["learning-questions"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to delete — it may be in use by a quiz"),
  });

  // ── Quizzes ──────────────────────────────────────────────────────────
  const { data: quizzes = [], isLoading: quizLoading } = useQuery({
    queryKey: ["learning-quizzes-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_quizzes")
        .select("id, title, topic, status, mode")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Quiz[];
    },
  });

  const [addQuizOpen, setAddQuizOpen] = useState(false);
  const [quizForm, setQuizForm] = useState({ title: "", topic: "", mode: "practice", time_limit: "", max_attempts: "" });
  const [quizQuestionIds, setQuizQuestionIds] = useState<Set<string>>(new Set());

  const addQuiz = useMutation({
    mutationFn: async () => {
      const { data: schoolId, error: schoolErr } = await supabase.rpc("current_user_school");
      if (schoolErr) throw schoolErr;

      const { data: inserted, error } = await supabase
        .from("learning_quizzes")
        .insert([{
          content_scope: "school",
          school_id: schoolId,
          title: quizForm.title.trim(),
          topic: quizForm.topic.trim() || null,
          mode: quizForm.mode,
          time_limit_seconds: quizForm.time_limit ? Number(quizForm.time_limit) * 60 : null,
          max_attempts: quizForm.max_attempts ? Number(quizForm.max_attempts) : null,
          status: "published",
        }])
        .select("id")
        .single();
      if (error) throw error;

      if (quizQuestionIds.size > 0) {
        const rows = Array.from(quizQuestionIds).map((question_id, i) => ({
          quiz_id: inserted.id, question_id, sort_order: i,
        }));
        const { error: linkErr } = await supabase.from("learning_quiz_questions").insert(rows);
        if (linkErr) throw linkErr;
      }
    },
    onSuccess: () => {
      toast.success("Quiz created");
      setAddQuizOpen(false);
      setQuizForm({ title: "", topic: "", mode: "practice", time_limit: "", max_attempts: "" });
      setQuizQuestionIds(new Set());
      qc.invalidateQueries({ queryKey: ["learning-quizzes-admin"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to create quiz"),
  });

  const deleteQuiz = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("learning_quizzes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Quiz deleted");
      qc.invalidateQueries({ queryKey: ["learning-quizzes-admin"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to delete quiz"),
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <BookOpen className="w-5 h-5" /> SmartDev Learning — Question Bank & Quizzes
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Revision content for your school. This never affects official exam results.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="questions">Question Bank</TabsTrigger>
          <TabsTrigger value="quizzes">Quizzes</TabsTrigger>
        </TabsList>

        {/* ── Questions tab ────────────────────────────────────────── */}
        <TabsContent value="questions" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setAddQOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add question</Button>
          </div>
          <Card>
            <CardContent className="pt-6">
              {qLoading ? (
                <div className="grid place-items-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : questions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No questions yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Question</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Topic</TableHead>
                      <TableHead>Marks</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {questions.map((q) => (
                      <TableRow key={q.id}>
                        <TableCell className="max-w-md truncate">{q.question_text}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]">
                            {QUESTION_TYPE_LABELS[q.question_type as QuestionType] ?? q.question_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{q.topic ?? "—"}</TableCell>
                        <TableCell>{q.marks}</TableCell>
                        <TableCell><Badge variant="outline">{q.status}</Badge></TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => deleteQuestion.mutate(q.id)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Quizzes tab ──────────────────────────────────────────── */}
        <TabsContent value="quizzes" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setAddQuizOpen(true)}><Plus className="w-4 h-4 mr-1" /> Create quiz</Button>
          </div>
          <Card>
            <CardContent className="pt-6">
              {quizLoading ? (
                <div className="grid place-items-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : quizzes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No quizzes yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Topic</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quizzes.map((quiz) => (
                      <TableRow key={quiz.id}>
                        <TableCell>{quiz.title}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{quiz.topic ?? "—"}</TableCell>
                        <TableCell><Badge variant="secondary">{quiz.mode}</Badge></TableCell>
                        <TableCell><Badge variant="outline">{quiz.status}</Badge></TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => deleteQuiz.mutate(quiz.id)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Add question dialog ──────────────────────────────────────── */}
      <Dialog open={addQOpen} onOpenChange={setAddQOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add question</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Question type</Label>
              <Select
                value={qForm.question_type}
                onValueChange={(v) => setQForm({ ...qForm, question_type: v as QuestionType })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => (
                    <SelectItem key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Question text</Label>
              <Textarea
                value={qForm.question_text}
                onChange={(e) => setQForm({ ...qForm, question_text: e.target.value })}
                placeholder={
                  qForm.question_type === "true_false" ? "e.g. Nairobi is the capital of Kenya."
                  : qForm.question_type === "short_answer" ? "e.g. What is the capital of Kenya?"
                  : "e.g. What is 2 + 2?"
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Topic (free text)</Label>
                <Input value={qForm.topic} onChange={(e) => setQForm({ ...qForm, topic: e.target.value })} placeholder="e.g. Linear Equations" />
              </div>
              <div>
                <Label>Curriculum sub-strand (optional)</Label>
                <Select value={qForm.substrand_id} onValueChange={(v) => setQForm({ ...qForm, substrand_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {substrands.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.curriculum_strands?.curriculum_subjects?.name ? `${s.curriculum_strands.curriculum_subjects.name} · ` : ""}
                        {s.curriculum_strands?.name ? `${s.curriculum_strands.name} · ` : ""}{s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── Answer section — shape depends on question_type ─────── */}
            {qForm.question_type === "mcq" && (
              <div className="space-y-2">
                <Label>Options (mark the correct one)</Label>
                {qForm.options.map((opt, i) => (
                  <div key={opt.id} className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={qForm.correct === opt.id}
                      onChange={() => setQForm({ ...qForm, correct: opt.id })}
                    />
                    <Input
                      value={opt.text}
                      onChange={(e) => {
                        const next = [...qForm.options];
                        next[i] = { ...opt, text: e.target.value };
                        setQForm({ ...qForm, options: next });
                      }}
                      placeholder={`Option ${opt.id.toUpperCase()}`}
                    />
                  </div>
                ))}
                {qForm.options.length < 4 && (
                  <Button
                    type="button" variant="outline" size="sm"
                    onClick={() =>
                      setQForm({
                        ...qForm,
                        options: [...qForm.options, { id: String.fromCharCode(97 + qForm.options.length), text: "" }],
                      })
                    }
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add option
                  </Button>
                )}
              </div>
            )}

            {qForm.question_type === "true_false" && (
              <div>
                <Label>Correct answer</Label>
                <div className="flex gap-4 mt-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={qForm.correctBool === "true"} onChange={() => setQForm({ ...qForm, correctBool: "true" })} />
                    True
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={qForm.correctBool === "false"} onChange={() => setQForm({ ...qForm, correctBool: "false" })} />
                    False
                  </label>
                </div>
              </div>
            )}

            {qForm.question_type === "short_answer" && (
              <div>
                <Label>Accepted answer</Label>
                <Input
                  value={qForm.correctText}
                  onChange={(e) => setQForm({ ...qForm, correctText: e.target.value })}
                  placeholder="e.g. Nairobi"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Graded case-insensitively against exactly this text — no partial-match or synonym support yet.
                </p>
              </div>
            )}

            <div>
              <Label>Explanation (shown after answering)</Label>
              <Textarea value={qForm.explanation} onChange={(e) => setQForm({ ...qForm, explanation: e.target.value })} />
            </div>

            <div className="w-24">
              <Label>Marks</Label>
              <Input type="number" min={1} value={qForm.marks} onChange={(e) => setQForm({ ...qForm, marks: Number(e.target.value) || 1 })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddQOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addQuestion.mutate()}
              disabled={
                !qForm.question_text.trim() ||
                (qForm.question_type === "mcq" && qForm.options.filter((o) => o.text.trim()).length < 2) ||
                (qForm.question_type === "short_answer" && !qForm.correctText.trim()) ||
                addQuestion.isPending
              }
            >
              {addQuestion.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Save question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create quiz dialog ───────────────────────────────────────── */}
      <Dialog open={addQuizOpen} onOpenChange={setAddQuizOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create quiz</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input value={quizForm.title} onChange={(e) => setQuizForm({ ...quizForm, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Topic</Label>
                <Input value={quizForm.topic} onChange={(e) => setQuizForm({ ...quizForm, topic: e.target.value })} />
              </div>
              <div>
                <Label>Mode</Label>
                <Select value={quizForm.mode} onValueChange={(v) => setQuizForm({ ...quizForm, mode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="practice">Practice</SelectItem>
                    <SelectItem value="daily_revision">Daily revision</SelectItem>
                    <SelectItem value="weak_area">Weak-area revision</SelectItem>
                    <SelectItem value="topic_practice">Topic practice</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Time limit (minutes, optional)</Label>
                <Input type="number" value={quizForm.time_limit} onChange={(e) => setQuizForm({ ...quizForm, time_limit: e.target.value })} />
              </div>
              <div>
                <Label>Max attempts (optional)</Label>
                <Input type="number" value={quizForm.max_attempts} onChange={(e) => setQuizForm({ ...quizForm, max_attempts: e.target.value })} />
              </div>
            </div>

            <div>
              <Label>Questions ({quizQuestionIds.size} selected)</Label>
              <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
                {questions.length === 0 && (
                  <p className="text-sm text-muted-foreground p-3">Add some questions first.</p>
                )}
                {questions.map((q) => (
                  <label key={q.id} className="flex items-center gap-2 p-2 text-sm hover:bg-muted/40 cursor-pointer">
                    <Checkbox
                      checked={quizQuestionIds.has(q.id)}
                      onCheckedChange={(checked) => {
                        const next = new Set(quizQuestionIds);
                        if (checked) next.add(q.id); else next.delete(q.id);
                        setQuizQuestionIds(next);
                      }}
                    />
                    <span className="truncate">{q.question_text}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddQuizOpen(false)}>Cancel</Button>
            <Button onClick={() => addQuiz.mutate()} disabled={!quizForm.title.trim() || addQuiz.isPending}>
              {addQuiz.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Create quiz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
