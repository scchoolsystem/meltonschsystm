/**
 * src/routes/_app.academics.oversight.tsx
 *
 * SmartDev ERP V3 — Exam Oversight
 *
 * Unified exam administration hub:
 *   Tab 1: Workflow  — moderation status per exam, approve, release results
 *   Tab 2: Missing Marks — which students/subjects still have no result
 *   Tab 3: Audit Log  — all mark entry / approval / release events
 *
 * Roles allowed: admin, principal, deputy_principal, exams_admin, academic_master
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, getSessionSafe } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { fallbackGrade } from "@/lib/grade-utils";
import {
  CheckCircle2, Lock, Unlock, AlertTriangle, Loader2, ClipboardCheck,
  Shield, BarChart3, RefreshCw, Download, Users, BookOpen, Eye,
  FileWarning, CheckSquare, XSquare, Clock,
} from "lucide-react";

export const Route = createFileRoute("/_app/academics/oversight")({
  beforeLoad: async () => {
    const { data, timedOut } = await getSessionSafe();
    if (timedOut) return; // defer to AppLayout's own client-side session check
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: () => (
    <FeatureGate feature="academics_oversight">
      <OversightPage />
    </FeatureGate>
  ),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const WORKFLOW_STEPS = ["planned", "ongoing", "completed", "approved", "released"] as const;

function workflowProgress(exam: any): number {
  if (exam.results_released) return 100;
  if (exam.approved) return 80;
  if (exam.status === "completed") return 60;
  if (exam.status === "ongoing") return 30;
  return 10;
}

function workflowStep(exam: any): string {
  if (exam.results_released) return "Results Released";
  if (exam.approved) return "Approved — Pending Release";
  if (exam.status === "completed") return "Awaiting Approval";
  if (exam.status === "ongoing") return "In Progress";
  return "Planned";
}

function workflowColor(exam: any): string {
  if (exam.results_released) return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
  if (exam.approved) return "bg-blue-500/15 text-blue-700 border-blue-500/30";
  if (exam.status === "completed") return "bg-amber-500/15 text-amber-700 border-amber-500/30";
  if (exam.status === "ongoing") return "bg-orange-500/15 text-orange-700 border-orange-500/30";
  return "bg-slate-500/15 text-slate-700 border-slate-500/30";
}

// ── Main component ────────────────────────────────────────────────────────────

function OversightPage() {
  const { isAdmin, hasRole } = useAuth();
  const canOversee =
    isAdmin ||
    hasRole("principal") ||
    hasRole("deputy_principal") ||
    hasRole("exams_admin") ||
    hasRole("academic_master");

  if (!canOversee) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <Alert variant="destructive">
          <Shield className="w-4 h-4" />
          <AlertDescription>
            Access restricted. Only principal, exams admin, or academic master can view this page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Exam Oversight</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Moderate marks, approve exams, release results, and track missing marks.
        </p>
      </div>

      <Tabs defaultValue="workflow">
        <TabsList>
          <TabsTrigger value="workflow">
            <ClipboardCheck className="w-4 h-4 mr-2" />Workflow
          </TabsTrigger>
          <TabsTrigger value="missing">
            <FileWarning className="w-4 h-4 mr-2" />Missing Marks
          </TabsTrigger>
          <TabsTrigger value="audit">
            <BarChart3 className="w-4 h-4 mr-2" />Audit Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workflow" className="mt-4">
          <WorkflowPanel isAdmin={isAdmin} hasRole={hasRole} />
        </TabsContent>

        <TabsContent value="missing" className="mt-4">
          <MissingMarksPanel />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <AuditLogPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Workflow Panel ────────────────────────────────────────────────────────────

function WorkflowPanel({
  isAdmin,
  hasRole,
}: {
  isAdmin: boolean;
  hasRole: (r: string) => boolean;
}) {
  const qc = useQueryClient();
  const canApprove = isAdmin || hasRole("principal") || hasRole("deputy_principal");
  const canModerate = canApprove || hasRole("exams_admin") || hasRole("academic_master");
  const [confirmExam, setConfirmExam] = useState<any>(null);
  const [confirmAction, setConfirmAction] = useState<"approve" | "release" | null>(null);

  const { data: exams = [], isLoading } = useQuery({
    queryKey: ["oversight-exams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("*")
        .order("year", { ascending: false })
        .order("term");
      if (error) throw error;
      return data as any[];
    },
  });

  // Per-exam result stats
  const { data: statsByExam = {} } = useQuery({
    queryKey: ["oversight-result-stats"],
    queryFn: async () => {
      const { data } = await supabase
        .from("exam_results")
        .select("exam_id, verified, moderation_status, is_released");
      const map: Record<string, { total: number; verified: number; pending: number; released: number }> = {};
      for (const r of data ?? []) {
        if (!map[r.exam_id]) map[r.exam_id] = { total: 0, verified: 0, pending: 0, released: 0 };
        map[r.exam_id].total++;
        if (r.verified) map[r.exam_id].verified++;
        if (r.moderation_status === "pending" || r.moderation_status === "submitted") map[r.exam_id].pending++;
        if (r.is_released) map[r.exam_id].released++;
      }
      return map;
    },
  });

  const approveExam = useMutation({
    mutationFn: async (examId: string) => {
      const { data, error } = await supabase.rpc("approve_exam", { p_exam_id: examId });
      if (error) throw error;
      if (!(data as any)?.ok) throw new Error((data as any)?.error ?? "Approval failed");
      return data;
    },
    onSuccess: () => {
      toast.success("Exam approved successfully");
      qc.invalidateQueries({ queryKey: ["oversight-exams"] });
      qc.invalidateQueries({ queryKey: ["oversight-result-stats"] });
      setConfirmExam(null);
      setConfirmAction(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const releaseResults = useMutation({
    mutationFn: async (examId: string) => {
      const { data, error } = await supabase.rpc("release_exam_results", { p_exam_id: examId });
      if (error) throw error;
      if (!(data as any)?.ok) throw new Error((data as any)?.error ?? "Release failed");
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Results released to ${(data as any).results_released ?? 0} students`);
      qc.invalidateQueries({ queryKey: ["oversight-exams"] });
      qc.invalidateQueries({ queryKey: ["oversight-result-stats"] });
      setConfirmExam(null);
      setConfirmAction(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="h-48 grid place-items-center">
        <Loader2 className="animate-spin w-6 h-6 text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4">
        {exams.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No exams found. Create exams first from the Exams page.
            </CardContent>
          </Card>
        )}

        {exams.map((exam) => {
          const stats = statsByExam[exam.id] ?? { total: 0, verified: 0, pending: 0, released: 0 };
          const progress = workflowProgress(exam);
          const step = workflowStep(exam);
          const color = workflowColor(exam);

          return (
            <motion.div
              key={exam.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{exam.name}</CardTitle>
                      <CardDescription>
                        {exam.term} · {exam.year}
                        {exam.start_date && ` · ${exam.start_date}`}
                        {exam.end_date && ` → ${exam.end_date}`}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className={`capitalize text-xs ${color}`}>
                      {step}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Workflow progress</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <div className="flex justify-between text-[10px] text-muted-foreground pt-0.5">
                      {WORKFLOW_STEPS.map((s) => (
                        <span key={s} className="capitalize">{s}</span>
                      ))}
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-4 gap-3 text-sm">
                    <div className="text-center">
                      <div className="font-bold text-lg">{stats.total}</div>
                      <div className="text-xs text-muted-foreground">Results</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-lg text-emerald-600">{stats.verified}</div>
                      <div className="text-xs text-muted-foreground">Verified</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-lg text-amber-600">{stats.pending}</div>
                      <div className="text-xs text-muted-foreground">Pending</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-lg text-blue-600">{stats.released}</div>
                      <div className="text-xs text-muted-foreground">Released</div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  {canModerate && (
                    <div className="flex gap-2 flex-wrap">
                      {/* Approve button: only when completed and not yet approved */}
                      {canApprove && exam.status === "completed" && !exam.approved && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => { setConfirmExam(exam); setConfirmAction("approve"); }}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                          Approve Exam
                        </Button>
                      )}

                      {/* Release button: only when approved and not yet released */}
                      {canApprove && exam.approved && !exam.results_released && (
                        <Button
                          size="sm"
                          variant="default"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => { setConfirmExam(exam); setConfirmAction("release"); }}
                        >
                          <Unlock className="w-3.5 h-3.5 mr-1.5" />
                          Release Results
                        </Button>
                      )}

                      {/* Released badge */}
                      {exam.results_released && (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Released {exam.released_at ? new Date(exam.released_at).toLocaleDateString() : ""}
                        </Badge>
                      )}

                      {/* Approved badge */}
                      {exam.approved && !exam.results_released && (
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/30 gap-1">
                          <CheckSquare className="w-3 h-3" />
                          Approved {exam.approved_at ? new Date(exam.approved_at).toLocaleDateString() : ""}
                        </Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Confirm Dialog */}
      <Dialog
        open={!!confirmExam && !!confirmAction}
        onOpenChange={(v) => { if (!v) { setConfirmExam(null); setConfirmAction(null); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction === "approve" ? "Approve Exam" : "Release Results"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            {confirmAction === "approve"
              ? `Are you sure you want to approve "${confirmExam?.name}"? This marks all moderated results as approved and confirms the exam is complete.`
              : `Are you sure you want to release results for "${confirmExam?.name}"? All approved results will become visible in the Student and Parent portals immediately.`}
          </p>
          {confirmAction === "release" && (
            <Alert>
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription>
                This action cannot be undone. Students and parents will receive a notification.
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setConfirmExam(null); setConfirmAction(null); }}
            >
              Cancel
            </Button>
            <Button
              disabled={approveExam.isPending || releaseResults.isPending}
              onClick={() => {
                if (!confirmExam) return;
                if (confirmAction === "approve") approveExam.mutate(confirmExam.id);
                else releaseResults.mutate(confirmExam.id);
              }}
            >
              {(approveExam.isPending || releaseResults.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {confirmAction === "approve" ? "Approve" : "Release Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Missing Marks Panel ───────────────────────────────────────────────────────

function MissingMarksPanel() {
  const [examId, setExamId] = useState<string>("");
  const [classId, setClassId] = useState<string>("all");

  const { data: exams = [] } = useQuery({
    queryKey: ["oversight-exams-list"],
    queryFn: async () =>
      (await supabase.from("exams").select("id,name,term,year").order("year", { ascending: false })).data ?? [],
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["oversight-classes"],
    queryFn: async () =>
      (await supabase.from("classes").select("id,name").order("name")).data ?? [],
  });

  // Query the missing marks view (filtered in JS for now; view uses school_id isolation)
  const { data: missing = [], isLoading } = useQuery({
    queryKey: ["missing-marks", examId, classId],
    enabled: !!examId,
    queryFn: async () => {
      if (!examId) return [];
      let q = (supabase as any)
        .from("v_missing_marks")
        .select("*")
        .eq("exam_id", examId)
        .order("class_name")
        .order("subject_name")
        .order("last_name");
      if (classId !== "all") q = q.eq("class_id", classId);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const grouped = useMemo(() => {
    const map: Record<string, { subject: string; class: string; students: any[] }> = {};
    for (const row of missing) {
      const key = `${row.class_id}::${row.subject_id}`;
      if (!map[key]) map[key] = { subject: row.subject_name, class: row.class_name, students: [] };
      map[key].students.push(row);
    }
    return Object.values(map);
  }, [missing]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-1 block">Exam</label>
              <Select value={examId} onValueChange={setExamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select exam" />
                </SelectTrigger>
                <SelectContent>
                  {(exams as any[]).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} · {e.term} {e.year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="text-sm font-medium mb-1 block">Class</label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger>
                  <SelectValue placeholder="All classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {(classes as any[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {!examId && (
        <div className="text-center text-muted-foreground py-12">
          Select an exam to see which marks are missing.
        </div>
      )}

      {examId && isLoading && (
        <div className="h-40 grid place-items-center">
          <Loader2 className="animate-spin w-6 h-6 text-muted-foreground" />
        </div>
      )}

      {examId && !isLoading && missing.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="font-medium">All marks entered</p>
            <p className="text-sm text-muted-foreground mt-1">
              No missing marks detected for this exam.
            </p>
          </CardContent>
        </Card>
      )}

      {grouped.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span>{missing.length} missing entries across {grouped.length} class/subject combinations</span>
          </div>

          {grouped.map((g, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                  {g.class} · {g.subject}
                  <Badge variant="outline" className="ml-auto text-amber-600 border-amber-500/30">
                    {g.students.length} missing
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {g.students.map((s: any) => (
                    <Badge key={s.student_id} variant="secondary" className="font-normal">
                      {s.first_name} {s.last_name} · {s.admission_no}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Audit Log Panel ───────────────────────────────────────────────────────────

function AuditLogPanel() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["oversight-audit"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("activity_logs")
        .select("*")
        .in("action", [
          "CREATE_RESULT", "UPDATE_RESULT",
          "APPROVE_EXAM", "RELEASE_RESULTS",
          "BULK_MARKS_ENTRY",
        ])
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Activity</CardTitle>
        <CardDescription>Last 200 mark entry, approval, and release events</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-40 grid place-items-center">
            <Loader2 className="animate-spin w-5 h-5 text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No events recorded yet.
                  </TableCell>
                </TableRow>
              )}
              {(logs as any[]).map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        log.action.includes("RELEASE")
                          ? "text-emerald-700 border-emerald-500/30"
                          : log.action.includes("APPROVE")
                          ? "text-blue-700 border-blue-500/30"
                          : "text-muted-foreground"
                      }
                    >
                      {log.action.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {log.entity}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(log.created_at).toLocaleString("en-KE", {
                      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell className="text-xs max-w-[240px] truncate text-muted-foreground">
                    {log.metadata ? JSON.stringify(log.metadata) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
