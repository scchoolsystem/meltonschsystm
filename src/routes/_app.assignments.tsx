/**
 * _app.assignments.tsx  — Unified Assignments (v2)
 *
 * • Teacher/Admin: create assignments with questions (text, MCQ, diagram-upload)
 *   → auto-synced to classroom_posts so students see them in Classroom too
 * • Student: view assignments, answer questions inline, upload diagram images,
 *   attach file, see grade + per-question feedback
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, getSessionSafe } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Loader2, Plus, Upload, CheckCircle2, BookOpen, Users, Award,
  Pencil, ExternalLink, Trash2, Image as ImageIcon, FileText,
  AlignLeft, ListChecks, PenLine,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format, differenceInDays } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

type QuestionType = "text" | "mcq" | "diagram";

interface Question {
  id: string;
  type: QuestionType;
  text: string;
  options?: string[];   // MCQ only
  max_marks: number;
}

interface AnswerPayload {
  question_id: string;
  text?: string;
  diagram_url?: string;
  selected?: string;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_app/assignments")({
  beforeLoad: async () => {
    const { data, timedOut } = await getSessionSafe();
    if (timedOut) return; // defer to AppLayout's own client-side session check
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: AssignmentsPage,
});

function AssignmentsPage() {
  const { user, isAdmin, hasRole } = useAuth();
  const qc = useQueryClient();

  // Deliberately NOT useTenant().school here. useTenant() resolves the
  // school from the hostname's subdomain — which is meaningless on
  // app.smartdev.co.ke (a flat domain, explicitly excluded in
  // getSubdomainSlug), on Tauri desktop, and on the Capacitor Android app,
  // where there's no subdomain at all. On any of those, useTenant().school
  // is null, so school?.id was undefined, and every assignment insert/update
  // failed RLS — not because of bad data, but because the client was asking
  // a hostname-based question in a platform where hostname doesn't carry
  // that information.
  //
  // Ask the same question the database itself answers via
  // current_user_school() instead: which school is *this user* actually a
  // member of. Works identically across web (any domain), desktop, and
  // Android, and is guaranteed to match what RLS checks server-side.
  const { data: mySchoolId } = useQuery({
    queryKey: ["my-school-id", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("school_members")
        .select("school_id")
        .eq("user_id", user!.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data?.school_id ?? null;
    },
  });
  const school = mySchoolId ? { id: mySchoolId } : null;

  const isTeacher =
    isAdmin ||
    hasRole("teacher") ||
    hasRole("class_teacher") ||
    hasRole("subject_teacher") ||
    hasRole("hod");
  const isStudent = hasRole("student");

  if (isStudent) return <StudentView user={user} school={school} qc={qc} />;
  if (isTeacher)
    return <TeacherView user={user} school={school} qc={qc} isAdmin={isAdmin} />;

  return (
    <div className="p-6 text-center text-muted-foreground">
      <BookOpen className="w-12 h-12 mx-auto opacity-30 mb-3" />
      <p>You don't have access to assignments.</p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TEACHER VIEW
// ══════════════════════════════════════════════════════════════════════════════

function TeacherView({ user, school, qc, isAdmin }: any) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("assignments");

  // ── staff record ──────────────────────────────────────────────────────────
  const { data: staffRecord } = useQuery({
    queryKey: ["my-staff-record", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("staff")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
  });

  // ── dropdowns ─────────────────────────────────────────────────────────────
  const { data: classes = [] } = useQuery({
    queryKey: ["classes-list"],
    queryFn: async () =>
      (await supabase.from("classes").select("id, name, stream")).data ?? [],
  });
  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects-list"],
    queryFn: async () =>
      (await supabase.from("subjects").select("id, name, code")).data ?? [],
  });

  // ── assignments ───────────────────────────────────────────────────────────
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["assignments-teacher", staffRecord?.id],
    enabled: !!staffRecord || isAdmin,
    queryFn: async () => {
      let q = supabase
        .from("assignments")
        .select(
          "*, classes:class_id(name,stream), subjects:subject_id(name,code)"
        )
        .order("created_at", { ascending: false });
      if (!isAdmin && staffRecord) q = q.eq("teacher_id", staffRecord.id);
      const { data, error } = await q;
      if (error) { console.error(error); return []; }
      return data ?? [];
    },
  });

  // ── submissions for selected assignment ───────────────────────────────────
  const { data: submissions = [] } = useQuery({
    queryKey: ["submissions", selectedAssignment?.id],
    enabled: !!selectedAssignment,
    queryFn: async () => {
      const { data } = await supabase
        .from("assignment_submissions")
        .select(
          "*, students:student_id(first_name,last_name,admission_no,unique_id)"
        )
        .eq("assignment_id", selectedAssignment.id)
        .order("submitted_at", { ascending: false });
      return data ?? [];
    },
  });

  // ── grade mutation ────────────────────────────────────────────────────────
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [gradeMark, setGradeMark] = useState("");
  const [gradeFeedback, setGradeFeedback] = useState("");

  const gradeMutation = useMutation({
    mutationFn: async (submissionId: string) => {
      const { error } = await supabase
        .from("assignment_submissions")
        .update({
          marks_obtained: Number(gradeMark),
          feedback: gradeFeedback || null,
          graded_by: staffRecord?.id ?? null,
          graded_at: new Date().toISOString(),
          status: "graded",
        })
        .eq("id", submissionId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Submission graded");
      qc.invalidateQueries({ queryKey: ["submissions"] });
      setGradingId(null);
      setGradeMark("");
      setGradeFeedback("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const daysLeft = (due: string) =>
    differenceInDays(new Date(due), new Date());

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" /> Assignments
          </h1>
          <p className="text-sm text-muted-foreground">
            Create assignments with questions — auto-synced to Classroom
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-1.5">
              <Plus className="w-4 h-4" /> New Assignment
            </Button>
          </DialogTrigger>
          <AssignmentFormDialog
            editing={editing}
            classes={classes}
            subjects={subjects}
            staffId={staffRecord?.id}
            schoolId={school?.id}
            onDone={() => {
              setOpen(false);
              setEditing(null);
              qc.invalidateQueries({ queryKey: ["assignments-teacher"] });
            }}
          />
        </Dialog>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="assignments" className="gap-1.5">
            <BookOpen className="w-3.5 h-3.5" /> Assignments ({assignments.length})
          </TabsTrigger>
          {selectedAssignment && (
            <TabsTrigger value="submissions" className="gap-1.5">
              <Users className="w-3.5 h-3.5" /> Submissions — {selectedAssignment.title}
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── Assignments list ──────────────────────────────────────────── */}
        <TabsContent value="assignments" className="mt-4">
          {isLoading ? (
            <div className="h-40 grid place-items-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : assignments.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center space-y-3">
                <BookOpen className="w-12 h-12 mx-auto text-muted-foreground opacity-30" />
                <p className="text-muted-foreground">
                  No assignments yet. Create your first one.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {(assignments as any[]).map((a) => {
                const days = daysLeft(a.due_date);
                const overdue = days < 0;
                const questions: Question[] = a.questions ?? [];
                return (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Card className="hover:shadow-md transition-shadow">
                      <CardContent className="pt-4 pb-3">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold">{a.title}</h3>
                              <Badge
                                variant={
                                  a.status === "active"
                                    ? "default"
                                    : a.status === "closed"
                                    ? "secondary"
                                    : "outline"
                                }
                              >
                                {a.status}
                              </Badge>
                              {overdue && (
                                <Badge variant="destructive">Overdue</Badge>
                              )}
                              {questions.length > 0 && (
                                <Badge variant="outline" className="gap-1">
                                  <ListChecks className="w-3 h-3" />
                                  {questions.length} question
                                  {questions.length !== 1 ? "s" : ""}
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                              {a.classes && (
                                <span>
                                  {a.classes.name}
                                  {a.classes.stream ? ` ${a.classes.stream}` : ""}
                                </span>
                              )}
                              {a.subjects && <span>{a.subjects.name}</span>}
                              <span>
                                Due: {format(new Date(a.due_date), "dd MMM yyyy")}
                              </span>
                              <span
                                className={
                                  overdue
                                    ? "text-destructive font-semibold"
                                    : days <= 3
                                    ? "text-amber-600 font-semibold"
                                    : ""
                                }
                              >
                                {overdue
                                  ? `${Math.abs(days)} days overdue`
                                  : days === 0
                                  ? "Due today"
                                  : `${days} days left`}
                              </span>
                              <span>Max: {a.max_marks} marks</span>
                            </div>
                            {a.description && (
                              <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
                                {a.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedAssignment(a);
                                setActiveTab("submissions");
                              }}
                            >
                              <Users className="w-3.5 h-3.5 mr-1" /> Submissions
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => {
                                setEditing(a);
                                setOpen(true);
                              }}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Submissions grading ───────────────────────────────────────── */}
        <TabsContent value="submissions" className="mt-4">
          {selectedAssignment && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {selectedAssignment.title}
                </CardTitle>
                <CardDescription>
                  Due{" "}
                  {format(new Date(selectedAssignment.due_date), "dd MMM yyyy")}{" "}
                  · Max {selectedAssignment.max_marks} marks ·{" "}
                  {submissions.length} submission
                  {submissions.length !== 1 ? "s" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {submissions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No submissions yet.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {(submissions as any[]).map((sub) => {
                      const answers: AnswerPayload[] = sub.answers ?? [];
                      const questions: Question[] =
                        selectedAssignment.questions ?? [];
                      return (
                        <Card key={sub.id} className="border-muted">
                          <CardContent className="pt-4 space-y-3">
                            {/* Student header */}
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div>
                                <p className="font-medium text-sm">
                                  {sub.students?.first_name}{" "}
                                  {sub.students?.last_name}
                                </p>
                                <p className="text-xs text-muted-foreground font-mono">
                                  {sub.students?.admission_no}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={
                                    sub.status === "graded"
                                      ? "default"
                                      : sub.status === "late"
                                      ? "destructive"
                                      : "secondary"
                                  }
                                  className="text-xs"
                                >
                                  {sub.status}
                                </Badge>
                                {sub.marks_obtained !== null && (
                                  <span className="text-sm font-semibold">
                                    {sub.marks_obtained}/
                                    {selectedAssignment.max_marks}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Per-question answers */}
                            {questions.length > 0 && answers.length > 0 && (
                              <div className="space-y-2">
                                {questions.map((q, qi) => {
                                  const ans = answers.find(
                                    (a) => a.question_id === q.id
                                  );
                                  return (
                                    <div
                                      key={q.id}
                                      className="rounded-lg bg-muted/40 p-3 text-sm"
                                    >
                                      <p className="font-medium mb-1 text-xs text-muted-foreground">
                                        Q{qi + 1} · {q.text}{" "}
                                        <span className="ml-1 text-primary">
                                          ({q.max_marks} mk)
                                        </span>
                                      </p>
                                      {ans ? (
                                        <>
                                          {ans.text && (
                                            <p className="whitespace-pre-wrap">
                                              {ans.text}
                                            </p>
                                          )}
                                          {ans.selected && (
                                            <p className="text-primary font-medium">
                                              ✓ {ans.selected}
                                            </p>
                                          )}
                                          {ans.diagram_url && (
                                            <a
                                              href={ans.diagram_url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                                            >
                                              <ImageIcon className="w-3 h-3" />
                                              View diagram
                                            </a>
                                          )}
                                        </>
                                      ) : (
                                        <p className="text-muted-foreground italic text-xs">
                                          No answer
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* General text answer */}
                            {sub.content && questions.length === 0 && (
                              <p className="text-sm whitespace-pre-wrap bg-muted/30 rounded p-2">
                                {sub.content}
                              </p>
                            )}

                            {/* File */}
                            {sub.file_url && (
                              <a
                                href={sub.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                <ExternalLink className="w-3 h-3" />
                                {sub.file_name ?? "View attachment"}
                              </a>
                            )}

                            {/* Grading inline */}
                            {gradingId === sub.id ? (
                              <div className="flex flex-col gap-1.5 max-w-sm">
                                <Input
                                  type="number"
                                  placeholder="Marks"
                                  min={0}
                                  max={selectedAssignment.max_marks}
                                  value={gradeMark}
                                  onChange={(e) => setGradeMark(e.target.value)}
                                  className="h-8 text-sm"
                                />
                                <Textarea
                                  placeholder="Feedback (optional)"
                                  rows={2}
                                  value={gradeFeedback}
                                  onChange={(e) =>
                                    setGradeFeedback(e.target.value)
                                  }
                                  className="text-sm"
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => gradeMutation.mutate(sub.id)}
                                    disabled={
                                      !gradeMark || gradeMutation.isPending
                                    }
                                  >
                                    {gradeMutation.isPending ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="w-3 h-3 mr-1" />
                                    )}
                                    Save grade
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setGradingId(null)}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => {
                                  setGradingId(sub.id);
                                  setGradeMark(
                                    sub.marks_obtained !== null
                                      ? String(sub.marks_obtained)
                                      : ""
                                  );
                                  setGradeFeedback(sub.feedback ?? "");
                                }}
                              >
                                <Award className="w-3 h-3 mr-1" />
                                {sub.status === "graded"
                                  ? "Re-grade"
                                  : "Grade"}
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Assignment Create/Edit Form (with Questions builder)
// ──────────────────────────────────────────────────────────────────────────────

function AssignmentFormDialog({
  editing, classes, subjects, staffId, schoolId, onDone,
}: {
  editing: any;
  classes: any[];
  subjects: any[];
  staffId?: string;
  schoolId?: string;
  onDone: () => void;
}) {
  const [form, setForm] = useState(() => ({
    title: editing?.title ?? "",
    description: editing?.description ?? "",
    due_date: editing?.due_date ?? "",
    max_marks: String(editing?.max_marks ?? "100"),
    class_id: editing?.class_id ?? "",
    subject_id: editing?.subject_id ?? "",
    allow_late: editing?.allow_late_submission ?? false,
    status: editing?.status ?? "active",
  }));

  const [questions, setQuestions] = useState<Question[]>(
    editing?.questions ?? []
  );

  const addQuestion = (type: QuestionType) => {
    setQuestions((qs) => [
      ...qs,
      {
        id: crypto.randomUUID(),
        type,
        text: "",
        options: type === "mcq" ? ["", "", "", ""] : undefined,
        max_marks: 5,
      },
    ]);
  };

  const updateQuestion = (id: string, patch: Partial<Question>) =>
    setQuestions((qs) =>
      qs.map((q) => (q.id === id ? { ...q, ...patch } : q))
    );

  const removeQuestion = (id: string) =>
    setQuestions((qs) => qs.filter((q) => q.id !== id));

  const totalMarks = questions.reduce((s, q) => s + Number(q.max_marks), 0);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        school_id: schoolId,
        class_id: form.class_id || null,
        subject_id: form.subject_id || null,
        teacher_id: staffId ?? null,
        title: form.title,
        description: form.description || null,
        due_date: form.due_date,
        max_marks: questions.length > 0 ? totalMarks : Number(form.max_marks),
        allow_late_submission: form.allow_late,
        status: form.status,
        questions: questions.length > 0 ? questions : null,
      };
      if (editing) {
        const { error } = await supabase
          .from("assignments")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("assignments").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Assignment updated" : "Assignment created & synced to Classroom");
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>
          {editing ? "Edit Assignment" : "Create Assignment"}
        </DialogTitle>
        <p className="text-xs text-muted-foreground">
          This will also appear in the Classroom tab for your class.
        </p>
      </DialogHeader>

      <div className="space-y-4 py-2">
        {/* Basic info */}
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1">
            <Label>Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Essay on Kenya's Independence"
            />
          </div>
          <div className="space-y-1">
            <Label>Instructions</Label>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              placeholder="General instructions for students..."
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Class</Label>
            <Select
              value={form.class_id}
              onValueChange={(v) => setForm((f) => ({ ...f, class_id: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {(classes as any[]).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.stream ? ` ${c.stream}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Subject</Label>
            <Select
              value={form.subject_id}
              onValueChange={(v) => setForm((f) => ({ ...f, subject_id: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select subject" />
              </SelectTrigger>
              <SelectContent>
                {(subjects as any[]).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Due Date *</Label>
            <Input
              type="date"
              value={form.due_date}
              onChange={(e) =>
                setForm((f) => ({ ...f, due_date: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>
              Max Marks{" "}
              {questions.length > 0 && (
                <span className="text-muted-foreground text-xs">
                  (auto: {totalMarks} from questions)
                </span>
              )}
            </Label>
            <Input
              type="number"
              value={questions.length > 0 ? String(totalMarks) : form.max_marks}
              disabled={questions.length > 0}
              onChange={(e) =>
                setForm((f) => ({ ...f, max_marks: e.target.value }))
              }
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={form.allow_late}
              onChange={(e) =>
                setForm((f) => ({ ...f, allow_late: e.target.checked }))
              }
              className="w-4 h-4"
            />
            Allow late submissions
          </label>
          <div className="flex-1">
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft (hidden)</SelectItem>
                <SelectItem value="active">Active — visible to students</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Questions builder ─────────────────────────────────────────── */}
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              Questions{" "}
              <span className="text-muted-foreground font-normal">
                ({questions.length})
              </span>
            </p>
            <div className="flex gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => addQuestion("text")}
              >
                <AlignLeft className="w-3 h-3" /> Text
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => addQuestion("mcq")}
              >
                <ListChecks className="w-3 h-3" /> MCQ
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => addQuestion("diagram")}
              >
                <ImageIcon className="w-3 h-3" /> Diagram
              </Button>
            </div>
          </div>

          {questions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">
              No questions yet. Add text, MCQ, or diagram questions above.
              Students can also submit a file without questions.
            </p>
          ) : (
            <div className="space-y-3">
              {questions.map((q, i) => (
                <QuestionEditor
                  key={q.id}
                  index={i}
                  question={q}
                  onChange={(patch) => updateQuestion(q.id, patch)}
                  onRemove={() => removeQuestion(q.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !form.title || !form.due_date}
        >
          {mutation.isPending && (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          )}
          {editing ? "Update" : "Create & Publish"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Question Editor component
// ──────────────────────────────────────────────────────────────────────────────

function QuestionEditor({
  index, question, onChange, onRemove,
}: {
  index: number;
  question: Question;
  onChange: (patch: Partial<Question>) => void;
  onRemove: () => void;
}) {
  const typeLabel: Record<QuestionType, string> = {
    text: "Text answer",
    mcq: "Multiple choice",
    diagram: "Diagram / image",
  };

  return (
    <div className="border rounded-md p-3 space-y-2 bg-muted/20">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground w-6">
          Q{index + 1}
        </span>
        <Badge variant="outline" className="text-xs">
          {typeLabel[question.type]}
        </Badge>
        <div className="flex-1" />
        <Input
          type="number"
          min={1}
          value={question.max_marks}
          onChange={(e) => onChange({ max_marks: Number(e.target.value) })}
          className="h-6 w-16 text-xs text-right"
          placeholder="Marks"
        />
        <span className="text-xs text-muted-foreground">mk</span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-destructive hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      <Textarea
        rows={2}
        placeholder="Question text..."
        value={question.text}
        onChange={(e) => onChange({ text: e.target.value })}
        className="text-sm"
      />

      {question.type === "mcq" && (
        <div className="space-y-1.5 pl-2">
          {(question.options ?? ["", "", "", ""]).map((opt, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-4">
                {String.fromCharCode(65 + oi)}.
              </span>
              <Input
                value={opt}
                onChange={(e) => {
                  const opts = [...(question.options ?? [])];
                  opts[oi] = e.target.value;
                  onChange({ options: opts });
                }}
                placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                className="h-7 text-xs"
              />
            </div>
          ))}
        </div>
      )}

      {question.type === "diagram" && (
        <p className="text-xs text-muted-foreground pl-2">
          Students will upload an image (diagram, sketch, photo).
        </p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STUDENT VIEW
// ══════════════════════════════════════════════════════════════════════════════

function StudentView({ user, school, qc }: any) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [openSubmitId, setOpenSubmitId] = useState<string | null>(null);

  const { data: studentLink } = useQuery({
    queryKey: ["student-link", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("student_user_links")
        .select("student_id, students:student_id(class_id)")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
  });

  const studentId = studentLink?.student_id;
  const classId = (studentLink?.students as any)?.class_id;

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["assignments-student", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data } = await supabase
        .from("assignments")
        .select("*, subjects:subject_id(name), classes:class_id(name,stream)")
        .eq("class_id", classId)
        .eq("status", "active")
        .order("due_date", { ascending: true });
      return data ?? [];
    },
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ["my-submissions", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data } = await supabase
        .from("assignment_submissions")
        .select("*")
        .eq("student_id", studentId);
      return data ?? [];
    },
  });

  const mySubmission = (assignmentId: string) =>
    (submissions as any[]).find((s) => s.assignment_id === assignmentId);

  if (!studentLink) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground space-y-2">
            <BookOpen className="w-12 h-12 mx-auto opacity-30" />
            <p>Your account is not linked to a student record.</p>
            <p className="text-sm">Please contact your school admin.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-primary" /> My Assignments
        </h1>
        <p className="text-sm text-muted-foreground">
          View, answer, and submit your assignments
        </p>
      </div>

      {isLoading ? (
        <div className="h-40 grid place-items-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : assignments.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 opacity-40" />
            <p className="text-muted-foreground">
              No active assignments. Check back later.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(assignments as any[]).map((a) => {
            const sub = mySubmission(a.id);
            const days = differenceInDays(new Date(a.due_date), new Date());
            const overdue = days < 0 && !a.allow_late_submission;
            const questions: Question[] = a.questions ?? [];

            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className={overdue ? "border-destructive/50" : ""}>
                  <CardContent className="pt-4 pb-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold">{a.title}</h3>
                          {sub && (
                            <Badge
                              variant={
                                sub.status === "graded" ? "default" : "secondary"
                              }
                            >
                              {sub.status === "graded"
                                ? "✓ Graded"
                                : sub.status === "late"
                                ? "Late"
                                : "Submitted"}
                            </Badge>
                          )}
                          {!sub && overdue && (
                            <Badge variant="destructive">Overdue</Badge>
                          )}
                          {!sub && !overdue && days <= 3 && (
                            <Badge className="bg-amber-500">Due soon</Badge>
                          )}
                          {questions.length > 0 && (
                            <Badge variant="outline" className="gap-1 text-xs">
                              <ListChecks className="w-3 h-3" />
                              {questions.length} question{questions.length !== 1 ? "s" : ""}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                          {a.subjects && <span>{a.subjects.name}</span>}
                          <span>
                            Due: {format(new Date(a.due_date), "dd MMM yyyy")}
                          </span>
                          <span>Max: {a.max_marks} marks</span>
                          {a.allow_late_submission && (
                            <span className="text-blue-600">
                              Late submissions allowed
                            </span>
                          )}
                        </div>
                        {a.description && (
                          <p className="text-sm text-muted-foreground mt-1.5">
                            {a.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Graded result */}
                    {sub?.status === "graded" && (
                      <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                            Marks: {sub.marks_obtained}/{a.max_marks}
                          </span>
                          <Progress
                            value={(sub.marks_obtained / a.max_marks) * 100}
                            className="w-32 h-2"
                          />
                        </div>
                        {sub.feedback && (
                          <p className="text-xs text-muted-foreground italic border-l-2 border-emerald-400 pl-2">
                            {sub.feedback}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Submit / answer button */}
                    {!overdue && sub?.status !== "graded" && (
                      <>
                        <Button
                          size="sm"
                          variant={sub ? "outline" : "default"}
                          onClick={() => setOpenSubmitId(a.id)}
                          className="gap-1.5"
                        >
                          <PenLine className="w-4 h-4" />
                          {sub ? "Update answer" : "Answer & Submit"}
                        </Button>
                        {openSubmitId === a.id && (
                          <StudentSubmitDialog
                            assignment={a}
                            studentId={studentId}
                            schoolId={school?.id}
                            existingSub={sub}
                            onDone={() => {
                              setOpenSubmitId(null);
                              qc.invalidateQueries({
                                queryKey: ["my-submissions"],
                              });
                            }}
                            onClose={() => setOpenSubmitId(null)}
                          />
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Student Submit Dialog — answers + diagrams + file upload
// ──────────────────────────────────────────────────────────────────────────────

function StudentSubmitDialog({
  assignment, studentId, schoolId, existingSub, onDone, onClose,
}: {
  assignment: any;
  studentId: string;
  schoolId: string;
  existingSub: any;
  onDone: () => void;
  onClose: () => void;
}) {
  const questions: Question[] = assignment.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, AnswerPayload>>(() => {
    const existing: AnswerPayload[] = existingSub?.answers ?? [];
    return Object.fromEntries(existing.map((a) => [a.question_id, a]));
  });
  const [generalText, setGeneralText] = useState(existingSub?.content ?? "");
  const [fileUrl, setFileUrl] = useState(existingSub?.file_url ?? "");
  const [fileName, setFileName] = useState(existingSub?.file_name ?? "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const diagramRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const setAnswer = (qId: string, patch: Partial<AnswerPayload>) =>
    setAnswers((prev) => ({
      ...prev,
      [qId]: { question_id: qId, ...prev[qId], ...patch },
    }));

  async function uploadFile(file: File, prefix: string) {
    const ext = file.name.split(".").pop();
    const path = `${prefix}/${studentId}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("assignment-submissions")
      .upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage
      .from("assignment-submissions")
      .getPublicUrl(path);
    return { url: data.publicUrl, name: file.name };
  }

  const submitMutation = useMutation({
    mutationFn: async () => {
      const isLate =
        differenceInDays(new Date(), new Date(assignment.due_date)) > 0;
      const answersArray = Object.values(answers);
      const payload: any = {
        school_id: schoolId,
        assignment_id: assignment.id,
        student_id: studentId,
        content: generalText || null,
        file_url: fileUrl || null,
        file_name: fileName || null,
        answers: answersArray.length > 0 ? answersArray : null,
        submitted_at: new Date().toISOString(),
        status: isLate ? "late" : "submitted",
      };
      if (existingSub) {
        const { error } = await supabase
          .from("assignment_submissions")
          .update(payload)
          .eq("id", existingSub.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("assignment_submissions")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Assignment submitted!");
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{assignment.title}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Due {format(new Date(assignment.due_date), "dd MMM yyyy")} · Max{" "}
            {assignment.max_marks} marks
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {assignment.description && (
            <p className="text-sm bg-muted/30 rounded p-3">
              {assignment.description}
            </p>
          )}

          {/* Per-question answers */}
          {questions.map((q, i) => (
            <div key={q.id} className="border rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium">
                Q{i + 1}. {q.text}
                <span className="ml-2 text-xs text-muted-foreground">
                  ({q.max_marks} marks)
                </span>
              </p>

              {q.type === "text" && (
                <Textarea
                  rows={4}
                  placeholder="Your answer..."
                  value={answers[q.id]?.text ?? ""}
                  onChange={(e) => setAnswer(q.id, { text: e.target.value })}
                />
              )}

              {q.type === "mcq" && (
                <div className="space-y-2">
                  {(q.options ?? []).map((opt, oi) => (
                    <label
                      key={oi}
                      className="flex items-center gap-2 cursor-pointer text-sm"
                    >
                      <input
                        type="radio"
                        name={`mcq-${q.id}`}
                        value={opt}
                        checked={answers[q.id]?.selected === opt}
                        onChange={() => setAnswer(q.id, { selected: opt })}
                        className="w-4 h-4"
                      />
                      {String.fromCharCode(65 + oi)}. {opt}
                    </label>
                  ))}
                </div>
              )}

              {q.type === "diagram" && (
                <div className="space-y-2">
                  {answers[q.id]?.diagram_url ? (
                    <div className="flex items-center gap-2">
                      <a
                        href={answers[q.id].diagram_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <ImageIcon className="w-3 h-3" /> View uploaded diagram
                      </a>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs"
                        onClick={() =>
                          diagramRefs.current[q.id]?.click()
                        }
                      >
                        Replace
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => diagramRefs.current[q.id]?.click()}
                      disabled={uploading}
                    >
                      {uploading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ImageIcon className="w-3.5 h-3.5" />
                      )}
                      Upload diagram / sketch
                    </Button>
                  )}
                  <input
                    ref={(el) => { diagramRefs.current[q.id] = el; }}
                    type="file"
                    className="hidden"
                    accept="image/*,.pdf"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploading(true);
                      try {
                        const { url } = await uploadFile(
                          file,
                          `diagrams/${assignment.id}`
                        );
                        setAnswer(q.id, { diagram_url: url });
                        toast.success("Diagram uploaded");
                      } catch (err: any) {
                        toast.error(err.message);
                      } finally {
                        setUploading(false);
                        e.target.value = "";
                      }
                    }}
                  />
                </div>
              )}
            </div>
          ))}

          {/* General answer (no questions) */}
          {questions.length === 0 && (
            <div className="space-y-1">
              <Label>Your Answer</Label>
              <Textarea
                rows={5}
                placeholder="Write your answer here..."
                value={generalText}
                onChange={(e) => setGeneralText(e.target.value)}
              />
            </div>
          )}

          {/* File attachment */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Attach a file (PDF, Word, image) — optional
            </Label>
            {fileUrl ? (
              <div className="flex items-center gap-2 text-sm">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {fileName || "Attached file"}
                </a>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs"
                  onClick={() => fileRef.current?.click()}
                >
                  Replace
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                Attach file
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.zip"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploading(true);
                try {
                  const { url, name } = await uploadFile(
                    file,
                    `files/${assignment.id}`
                  );
                  setFileUrl(url);
                  setFileName(name);
                  toast.success("File attached");
                } catch (err: any) {
                  toast.error(err.message);
                } finally {
                  setUploading(false);
                  e.target.value = "";
                }
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending || uploading}
          >
            {submitMutation.isPending && (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            )}
            {existingSub ? "Update submission" : "Submit assignment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
