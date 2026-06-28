import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTenant } from "@/hooks/use-tenant";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Loader2, Plus, Upload, CheckCircle2, Clock, AlertTriangle,
  FileText, BookOpen, Users, Award, Pencil, ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format, differenceInDays } from "date-fns";

export const Route = createFileRoute("/_app/assignments")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: AssignmentsPage,
});

function AssignmentsPage() {
  const { user, isAdmin, hasRole } = useAuth();
  const { school } = useTenant();
  const qc = useQueryClient();

  const isTeacher = isAdmin || hasRole("teacher") || hasRole("class_teacher") || hasRole("subject_teacher") || hasRole("hod");
  const isStudent = hasRole("student");

  if (isStudent) return <StudentView user={user} school={school} qc={qc} />;
  if (isTeacher) return <TeacherView user={user} school={school} qc={qc} isAdmin={isAdmin} />;

  return (
    <div className="p-6 text-center text-muted-foreground">
      <BookOpen className="w-12 h-12 mx-auto opacity-30 mb-3" />
      <p>You don't have access to assignments.</p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// TEACHER VIEW — Add assignments, mark submissions
// ────────────────────────────────────────────────────────────

function TeacherView({ user, school, qc, isAdmin }: any) {
  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [gradeMark, setGradeMark] = useState("");
  const [gradeFeedback, setGradeFeedback] = useState("");
  const [activeTab, setActiveTab] = useState("assignments");

  // Form state
  const [form, setForm] = useState({
    title: "", description: "", due_date: "", max_marks: "100",
    class_id: "", subject_id: "", allow_late: false, status: "active",
  });

  // ── My staff record ───────────────────────────────────────────────────
  const { data: staffRecord } = useQuery({
    queryKey: ["my-staff-record", user?.id],
    enabled:  !!user,
    queryFn:  async () => {
      const { data } = await supabase
        .from("staff")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
  });

  // ── Dropdowns ─────────────────────────────────────────────────────────
  const { data: classes = [] } = useQuery({
    queryKey: ["classes-list"],
    queryFn:  async () => (await supabase.from("classes").select("id, name, stream")).data ?? [],
  });
  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects-list"],
    queryFn:  async () => (await supabase.from("subjects").select("id, name, code")).data ?? [],
  });

  // ── Assignments ────────────────────────────────────────────────────────
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["assignments-teacher", staffRecord?.id],
    enabled:  !!staffRecord || isAdmin,
    queryFn:  async () => {
      let q = supabase
        .from("assignments")
        .select("*, classes:class_id(name, stream), subjects:subject_id(name, code)")
        .order("created_at", { ascending: false });
      if (!isAdmin && staffRecord) q = q.eq("teacher_id", staffRecord.id);
      const { data, error } = await q;
      if (error) { console.error("assignments error:", error); return []; }
      return data ?? [];
    },
  });

  // ── Submissions for selected assignment ───────────────────────────────
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const { data: submissions = [] } = useQuery({
    queryKey: ["submissions", selectedAssignment?.id],
    enabled:  !!selectedAssignment,
    queryFn:  async () => {
      const { data } = await supabase
        .from("assignment_submissions")
        .select(`
          *,
          students:student_id(first_name, last_name, admission_no, unique_id)
        `)
        .eq("assignment_id", selectedAssignment.id)
        .order("submitted_at", { ascending: false });
      return data ?? [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!staffRecord && !isAdmin) throw new Error("No staff record linked");
      const payload = {
        school_id:             school.id,
        class_id:              form.class_id || null,
        subject_id:            form.subject_id || null,
        teacher_id:            staffRecord?.id ?? null,
        title:                 form.title,
        description:           form.description || null,
        due_date:              form.due_date,
        max_marks:             Number(form.max_marks),
        allow_late_submission: form.allow_late,
        status:                form.status,
      };
      if (editing) {
        const { error } = await supabase.from("assignments").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("assignments").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Assignment updated" : "Assignment created");
      qc.invalidateQueries({ queryKey: ["assignments-teacher"] });
      setOpen(false);
      setEditing(null);
      setForm({ title: "", description: "", due_date: "", max_marks: "100", class_id: "", subject_id: "", allow_late: false, status: "active" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const gradeMutation = useMutation({
    mutationFn: async (submissionId: string) => {
      const { error } = await supabase
        .from("assignment_submissions")
        .update({
          marks_obtained: Number(gradeMark),
          feedback:       gradeFeedback || null,
          graded_by:      staffRecord?.id ?? null,
          graded_at:      new Date().toISOString(),
          status:         "graded",
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

  const daysLeft = (due: string) => differenceInDays(new Date(due), new Date());

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" /> Assignments
          </h1>
          <p className="text-sm text-muted-foreground">Manage assignments and mark student submissions</p>
        </div>

        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); } }}>
          <DialogTrigger asChild>
            <Button className="gap-1.5"><Plus className="w-4 h-4" /> New Assignment</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Assignment" : "Create Assignment"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>Title *</Label>
                <Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Essay on Kenya's Independence" />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea rows={3} value={form.description}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Instructions for students..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Class</Label>
                  <Select value={form.class_id} onValueChange={(v) => setForm(f => ({ ...f, class_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                    <SelectContent>
                      {(classes as any[]).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}{c.stream ? ` ${c.stream}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Subject</Label>
                  <Select value={form.subject_id} onValueChange={(v) => setForm(f => ({ ...f, subject_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                    <SelectContent>
                      {(subjects as any[]).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Due Date *</Label>
                  <Input type="date" value={form.due_date}
                    onChange={(e) => setForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Max Marks</Label>
                  <Input type="number" value={form.max_marks}
                    onChange={(e) => setForm(f => ({ ...f, max_marks: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="late" checked={form.allow_late}
                  onChange={(e) => setForm(f => ({ ...f, allow_late: e.target.checked }))} />
                <Label htmlFor="late" className="cursor-pointer">Allow late submissions</Label>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active (visible to students)</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !form.title || !form.due_date}>
                {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                {editing ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

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

        {/* Assignments list */}
        <TabsContent value="assignments" className="mt-4">
          {isLoading ? (
            <div className="h-40 grid place-items-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : assignments.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center space-y-3">
                <BookOpen className="w-12 h-12 mx-auto text-muted-foreground opacity-30" />
                <p className="text-muted-foreground">No assignments yet. Create your first one.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {(assignments as any[]).map((a) => {
                const days = daysLeft(a.due_date);
                const overdue = days < 0;
                return (
                  <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <Card className="hover:shadow-md transition-shadow">
                      <CardContent className="pt-4 pb-3">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold">{a.title}</h3>
                              <Badge variant={a.status === "active" ? "default" : a.status === "closed" ? "secondary" : "outline"}>
                                {a.status}
                              </Badge>
                              {overdue && <Badge variant="destructive">Overdue</Badge>}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                              {a.classes && <span>{a.classes.name}{a.classes.stream ? ` ${a.classes.stream}` : ""}</span>}
                              {a.subjects && <span>{a.subjects.name}</span>}
                              <span>Due: {format(new Date(a.due_date), "dd MMM yyyy")}</span>
                              <span className={overdue ? "text-destructive font-semibold" : days <= 3 ? "text-amber-600 font-semibold" : ""}>
                                {overdue ? `${Math.abs(days)} days overdue` : days === 0 ? "Due today" : `${days} days left`}
                              </span>
                              <span>Max: {a.max_marks} marks</span>
                            </div>
                            {a.description && (
                              <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{a.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              size="sm" variant="outline"
                              onClick={() => { setSelectedAssignment(a); setActiveTab("submissions"); }}
                            >
                              <Users className="w-3.5 h-3.5 mr-1" /> View Submissions
                            </Button>
                            <Button
                              size="icon" variant="ghost" className="h-8 w-8"
                              onClick={() => {
                                setEditing(a);
                                setForm({
                                  title: a.title, description: a.description ?? "",
                                  due_date: a.due_date, max_marks: String(a.max_marks),
                                  class_id: a.class_id ?? "", subject_id: a.subject_id ?? "",
                                  allow_late: a.allow_late_submission, status: a.status,
                                });
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

        {/* Submissions grading */}
        <TabsContent value="submissions" className="mt-4">
          {!selectedAssignment ? null : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{selectedAssignment.title}</CardTitle>
                <CardDescription>
                  Due {format(new Date(selectedAssignment.due_date), "dd MMM yyyy")} ·
                  Max {selectedAssignment.max_marks} marks ·
                  {submissions.length} submission{submissions.length !== 1 ? "s" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {submissions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No submissions yet.
                  </p>
                ) : (
                  <div className="rounded-lg border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-xs">
                          <TableHead>Student</TableHead>
                          <TableHead>Submitted</TableHead>
                          <TableHead>File</TableHead>
                          <TableHead className="text-right">Marks</TableHead>
                          <TableHead>Feedback</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(submissions as any[]).map((sub) => (
                          <TableRow key={sub.id} className="text-sm">
                            <TableCell className="font-medium">
                              {sub.students?.first_name} {sub.students?.last_name}
                              <br />
                              <span className="text-xs text-muted-foreground font-mono">
                                {sub.students?.admission_no}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {sub.submitted_at ? format(new Date(sub.submitted_at), "dd MMM, HH:mm") : "—"}
                            </TableCell>
                            <TableCell>
                              {sub.file_url ? (
                                <a href={sub.file_url} target="_blank" rel="noopener noreferrer"
                                  className="text-xs text-primary hover:underline flex items-center gap-1">
                                  <ExternalLink className="w-3 h-3" />
                                  {sub.file_name ?? "View File"}
                                </a>
                              ) : (
                                <span className="text-xs text-muted-foreground">No file</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {sub.marks_obtained !== null
                                ? `${sub.marks_obtained}/${selectedAssignment.max_marks}`
                                : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">
                              {sub.feedback ?? "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={
                                sub.status === "graded" ? "default" :
                                sub.status === "late" ? "destructive" : "secondary"
                              } className="text-xs">
                                {sub.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {gradingId === sub.id ? (
                                <div className="flex flex-col gap-1.5 min-w-[180px]">
                                  <Input
                                    type="number" placeholder="Marks"
                                    min={0} max={selectedAssignment.max_marks}
                                    value={gradeMark}
                                    onChange={(e) => setGradeMark(e.target.value)}
                                    className="h-7 text-xs"
                                  />
                                  <Input
                                    placeholder="Feedback (optional)"
                                    value={gradeFeedback}
                                    onChange={(e) => setGradeFeedback(e.target.value)}
                                    className="h-7 text-xs"
                                  />
                                  <div className="flex gap-1">
                                    <Button
                                      size="sm" className="h-7 text-xs flex-1"
                                      onClick={() => gradeMutation.mutate(sub.id)}
                                      disabled={!gradeMark || gradeMutation.isPending}
                                    >
                                      {gradeMutation.isPending
                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                        : <CheckCircle2 className="w-3 h-3 mr-0.5" />
                                      }
                                      Save
                                    </Button>
                                    <Button
                                      size="sm" variant="outline" className="h-7 text-xs"
                                      onClick={() => setGradingId(null)}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <Button
                                  size="sm" variant="outline" className="h-7 text-xs"
                                  onClick={() => {
                                    setGradingId(sub.id);
                                    setGradeMark(sub.marks_obtained !== null ? String(sub.marks_obtained) : "");
                                    setGradeFeedback(sub.feedback ?? "");
                                  }}
                                >
                                  <Award className="w-3 h-3 mr-1" />
                                  {sub.status === "graded" ? "Re-grade" : "Grade"}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
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

// ────────────────────────────────────────────────────────────
// STUDENT VIEW — See assignments, upload submissions
// ────────────────────────────────────────────────────────────

function StudentView({ user, school, qc }: any) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  // Get student record via student_user_links
  const { data: studentLink } = useQuery({
    queryKey: ["student-link", user?.id],
    enabled:  !!user,
    queryFn:  async () => {
      const { data } = await supabase
        .from("student_user_links")
        .select("student_id, students:student_id(class_id)")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
  });

  const studentId = studentLink?.student_id;
  const classId   = (studentLink?.students as any)?.class_id;

  // Assignments for student's class
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["assignments-student", classId],
    enabled:  !!classId,
    queryFn:  async () => {
      const { data } = await supabase
        .from("assignments")
        .select("*, subjects:subject_id(name), classes:class_id(name, stream)")
        .eq("class_id", classId)
        .eq("status", "active")
        .order("due_date", { ascending: true });
      return data ?? [];
    },
  });

  // Student's own submissions
  const { data: submissions = [] } = useQuery({
    queryKey: ["my-submissions", studentId],
    enabled:  !!studentId,
    queryFn:  async () => {
      const { data } = await supabase
        .from("assignment_submissions")
        .select("*")
        .eq("student_id", studentId);
      return data ?? [];
    },
  });

  const mySubmission = (assignmentId: string) =>
    (submissions as any[]).find((s) => s.assignment_id === assignmentId);

  async function handleUpload(assignmentId: string, file: File) {
    if (!studentId) return;
    setUploadingId(assignmentId);
    try {
      // Upload file to Supabase Storage
      const ext = file.name.split(".").pop();
      const path = `assignments/${assignmentId}/${studentId}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("assignment-submissions")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage
        .from("assignment-submissions")
        .getPublicUrl(path);

      // Upsert submission record
      const existing = mySubmission(assignmentId);
      const isLate = differenceInDays(new Date(), new Date(
        (assignments as any[]).find(a => a.id === assignmentId)?.due_date ?? new Date()
      )) > 0;

      if (existing) {
        const { error } = await supabase
          .from("assignment_submissions")
          .update({
            file_url: urlData.publicUrl,
            file_name: file.name,
            submitted_at: new Date().toISOString(),
            status: isLate ? "late" : "submitted",
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("assignment_submissions")
          .insert({
            school_id:     school.id,
            assignment_id: assignmentId,
            student_id:    studentId,
            file_url:      urlData.publicUrl,
            file_name:     file.name,
            submitted_at:  new Date().toISOString(),
            status:        isLate ? "late" : "submitted",
          });
        if (error) throw error;
      }

      toast.success("Assignment submitted!");
      qc.invalidateQueries({ queryKey: ["my-submissions"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploadingId(null);
    }
  }

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
        <p className="text-sm text-muted-foreground">View and submit your assignments</p>
      </div>

      {isLoading ? (
        <div className="h-40 grid place-items-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : assignments.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 opacity-40" />
            <p className="text-muted-foreground">No active assignments. Check back later.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(assignments as any[]).map((a) => {
            const sub    = mySubmission(a.id);
            const days   = differenceInDays(new Date(a.due_date), new Date());
            const overdue = days < 0 && !a.allow_late_submission;
            const isUploading = uploadingId === a.id;

            return (
              <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <Card className={`${overdue ? "border-destructive/50" : ""}`}>
                  <CardContent className="pt-4 pb-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold">{a.title}</h3>
                          {sub && (
                            <Badge variant={sub.status === "graded" ? "default" : "secondary"}>
                              {sub.status === "graded" ? "✓ Graded" : sub.status === "late" ? "Late" : "Submitted"}
                            </Badge>
                          )}
                          {!sub && overdue && <Badge variant="destructive">Overdue</Badge>}
                          {!sub && !overdue && days <= 3 && (
                            <Badge className="bg-amber-500">Due soon</Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                          {a.subjects && <span>{a.subjects.name}</span>}
                          <span>Due: {format(new Date(a.due_date), "dd MMM yyyy")}</span>
                          <span>Max: {a.max_marks} marks</span>
                          {a.allow_late_submission && (
                            <span className="text-blue-600">Late submissions allowed</span>
                          )}
                        </div>
                        {a.description && (
                          <p className="text-sm text-muted-foreground mt-1.5">{a.description}</p>
                        )}
                      </div>
                    </div>

                    {/* Submission status / graded result */}
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

                    {/* Current file */}
                    {sub?.file_url && sub.status !== "graded" && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <FileText className="w-3.5 h-3.5" />
                        <span>Submitted: {sub.file_name ?? "file"}</span>
                        <a href={sub.file_url} target="_blank" rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" /> View
                        </a>
                      </div>
                    )}

                    {/* Upload button */}
                    {!overdue && sub?.status !== "graded" && (
                      <div>
                        <input
                          ref={fileRef}
                          type="file"
                          className="hidden"
                          accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.zip"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUpload(a.id, f);
                            e.target.value = "";
                          }}
                        />
                        <Button
                          size="sm" variant={sub ? "outline" : "default"}
                          disabled={isUploading}
                          onClick={() => fileRef.current?.click()}
                          className="gap-1.5"
                        >
                          {isUploading
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Upload className="w-4 h-4" />
                          }
                          {sub ? "Re-submit" : "Submit Assignment"}
                        </Button>
                        <span className="text-xs text-muted-foreground ml-2">
                          PDF, Word, images accepted
                        </span>
                      </div>
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
