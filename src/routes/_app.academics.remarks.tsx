/**
 * src/routes/_app.academics.remarks.tsx
 *
 * SmartDev ERP V3 — Remarks Management
 *
 * Three remark types:
 *   1. Subject Teacher Remarks — per student per subject per exam
 *   2. Class Teacher Remarks   — per student per exam (one teacher per class)
 *   3. Principal Remarks       — per student per exam (principal/admin)
 *
 * Features:
 *   - Bulk entry with auto-save (debounced)
 *   - AI remark suggestions (calls Anthropic API)
 *   - Remark templates library
 *   - Scoped to teacher's allocated classes/subjects via use-teacher-scope
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, getSessionSafe } from "@/integrations/supabase/client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useTeacherScope } from "@/hooks/use-teacher-scope";
import {
  Loader2, Save, Sparkles, BookMarked, MessageSquarePlus, ChevronDown, Check,
} from "lucide-react";

export const Route = createFileRoute("/_app/academics/remarks")({
  beforeLoad: async () => {
    const { data, timedOut } = await getSessionSafe();
    if (timedOut) return; // defer to AppLayout's own client-side session check
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: () => (
    <FeatureGate feature="academics_remarks">
      <RemarksPage />
    </FeatureGate>
  ),
});

// ── Auto-save helper ──────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay = 1500): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── Main page ─────────────────────────────────────────────────────────────────

function RemarksPage() {
  const { isAdmin, hasRole } = useAuth();
  const { isTeacherScoped, classIds, allSubjectIds } = useTeacherScope();

  const isPrincipal = isAdmin || hasRole("principal") || hasRole("deputy_principal");
  const isClassTeacher = isAdmin || hasRole("class_teacher") || hasRole("teacher");
  const isSubjectTeacher = isAdmin || hasRole("teacher") || hasRole("subject_teacher") || hasRole("hod");
  const isExamsAdmin = isAdmin || hasRole("exams_admin") || hasRole("academic_master");

  const defaultTab =
    isExamsAdmin ? "subject" :
    isPrincipal ? "principal" :
    isClassTeacher ? "class" : "subject";

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Remarks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Write subject, class teacher, and principal remarks. These appear automatically on report cards.
        </p>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {(isSubjectTeacher || isExamsAdmin) && (
            <TabsTrigger value="subject">Subject Teacher Remarks</TabsTrigger>
          )}
          {(isClassTeacher || isExamsAdmin) && (
            <TabsTrigger value="class">Class Teacher Remarks</TabsTrigger>
          )}
          {(isPrincipal || isExamsAdmin) && (
            <TabsTrigger value="principal">Principal Remarks</TabsTrigger>
          )}
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        {(isSubjectTeacher || isExamsAdmin) && (
          <TabsContent value="subject" className="mt-4">
            <SubjectRemarksPanel isTeacherScoped={isTeacherScoped} classIds={classIds} allSubjectIds={allSubjectIds} />
          </TabsContent>
        )}
        {(isClassTeacher || isExamsAdmin) && (
          <TabsContent value="class" className="mt-4">
            <ClassTeacherRemarksPanel isTeacherScoped={isTeacherScoped} classIds={classIds} />
          </TabsContent>
        )}
        {(isPrincipal || isExamsAdmin) && (
          <TabsContent value="principal" className="mt-4">
            <PrincipalRemarksPanel />
          </TabsContent>
        )}
        <TabsContent value="templates" className="mt-4">
          <TemplatesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Shared exam + class selectors ─────────────────────────────────────────────

function useExams() {
  return useQuery({
    queryKey: ["remarks-exams"],
    queryFn: async () =>
      (await supabase.from("exams").select("id,name,term,year").order("year", { ascending: false })).data ?? [],
  });
}

function useClasses(isTeacherScoped: boolean, classIds: string[]) {
  return useQuery({
    queryKey: ["remarks-classes", isTeacherScoped, classIds.join(",")],
    queryFn: async () => {
      let q = supabase.from("classes").select("id,name,stream").order("name");
      if (isTeacherScoped && classIds.length > 0) q = q.in("id", classIds);
      else if (isTeacherScoped && classIds.length === 0) return [];
      return (await q).data ?? [];
    },
  });
}

// ── Upsert a remark ───────────────────────────────────────────────────────────

async function upsertRemark(params: {
  examId: string;
  studentId: string;
  remarkType: "subject_teacher" | "class_teacher" | "principal";
  subjectId?: string | null;
  text: string;
}) {
  const { data: schoolId } = await supabase.rpc("current_user_school");
  const { data: user } = await supabase.auth.getUser();

  const row: any = {
    school_id: schoolId,
    exam_id: params.examId,
    student_id: params.studentId,
    remark_type: params.remarkType,
    remark_text: params.text,
    written_by: user.user?.id,
    written_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  // subject_id must always be set explicitly (even to null) so behaviour is
  // deterministic.
  row.subject_id = params.remarkType === "subject_teacher" ? params.subjectId ?? null : null;

  // exam_remarks.subject_key is a generated column (COALESCE(subject_id,
  // sentinel)) backed by ONE plain unique constraint — see
  // fix_exam_remarks_generated_column.sql. Same conflict target works for
  // every remark_type now; no more branching needed, and unlike a partial
  // index this one IS usable as an ON CONFLICT arbiter via Supabase upsert.
  const conflictCols = "exam_id,student_id,remark_type,subject_key";

  const { error } = await (supabase as any)
    .from("exam_remarks")
    .upsert(row, { onConflict: conflictCols, ignoreDuplicates: false });
  if (error) throw error;
}

// ── AI Suggestion ─────────────────────────────────────────────────────────────

async function aiSuggestRemark(
  studentName: string,
  remarkType: string,
  grade?: string,
  subjectName?: string
): Promise<string> {
  const prompt =
    remarkType === "principal"
      ? `Write a concise, professional school principal's end-of-term remark for a Kenyan secondary school student named ${studentName}. The remark should be encouraging, 1-2 sentences, and suitable for a report card.`
      : remarkType === "class_teacher"
      ? `Write a class teacher's end-of-term remark for a Kenyan secondary school student named ${studentName}. Focus on character, behaviour, participation and overall performance. 1-2 sentences.`
      : `Write a subject teacher's remark for ${studentName} in ${subjectName ?? "the subject"}${grade ? ` who scored grade ${grade}` : ""}. Be specific and constructive, 1-2 sentences. Kenyan secondary school context.`;

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    throw new Error("Not authenticated — please log in again");
  }

  const resp = await fetch("/api/ai-remark", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
    body: JSON.stringify({ prompt }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error ?? "AI suggestion failed");
  }
  const json = await resp.json();
  return json.remark ?? "";
}

// ── Subject Teacher Remarks Panel ─────────────────────────────────────────────

function SubjectRemarksPanel({
  isTeacherScoped,
  classIds,
  allSubjectIds,
}: {
  isTeacherScoped: boolean;
  classIds: string[];
  allSubjectIds: string[];
}) {
  const [examId, setExamId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);

  const { data: exams = [] } = useExams();
  const { data: classes = [] } = useClasses(isTeacherScoped, classIds);

  const { data: subjects = [] } = useQuery({
    queryKey: ["remarks-subjects", isTeacherScoped, allSubjectIds.join(",")],
    queryFn: async () => {
      let q = supabase.from("subjects").select("id,name,code").order("name");
      if (isTeacherScoped && allSubjectIds.length > 0) q = q.in("id", allSubjectIds);
      else if (isTeacherScoped && allSubjectIds.length === 0) return [];
      return (await q).data ?? [];
    },
  });

  const { data: students = [] } = useQuery({
    queryKey: ["remarks-students", classId],
    enabled: !!classId,
    queryFn: async () =>
      (await supabase.from("students").select("id,first_name,last_name,admission_no").eq("class_id", classId).eq("status", "active").order("last_name")).data ?? [],
  });

  // Load existing remarks
  const { data: existing = [] } = useQuery({
    queryKey: ["subject-remarks", examId, classId, subjectId],
    enabled: !!(examId && classId && subjectId),
    queryFn: async () =>
      (await (supabase as any)
        .from("exam_remarks")
        .select("*")
        .eq("exam_id", examId)
        .in("student_id", (students as any[]).map((s: any) => s.id))
        .eq("remark_type", "subject_teacher")
        .eq("subject_id", subjectId)
      ).data ?? [],
  });

  // Load grades for context
  const { data: grades = [] } = useQuery({
    queryKey: ["remarks-grades", examId, subjectId],
    enabled: !!(examId && subjectId),
    queryFn: async () =>
      (await supabase.from("exam_results").select("student_id,grade,score").eq("exam_id", examId).eq("subject_id", subjectId)).data ?? [],
  });

  const existingMap = Object.fromEntries((existing as any[]).map((r: any) => [r.student_id, r.remark_text]));
  const gradeMap = Object.fromEntries((grades as any[]).map((r: any) => [r.student_id, r.grade ?? ""]));
  const get = (id: string) => drafts[id] ?? existingMap[id] ?? "";

  async function saveSingle(studentId: string) {
    if (!examId || !subjectId) return;
    setSavingIds((s) => new Set(s).add(studentId));
    try {
      await upsertRemark({ examId, studentId, remarkType: "subject_teacher", subjectId, text: get(studentId) });
      toast.success("Remark saved");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingIds((s) => { const n = new Set(s); n.delete(studentId); return n; });
    }
  }

  async function saveAll() {
    if (!examId || !subjectId) return;
    const toSave = (students as any[]).filter((s: any) => drafts[s.id] !== undefined);
    for (const s of toSave) await saveSingle(s.id);
    toast.success(`Saved remarks for ${toSave.length} students`);
  }

  async function aiSuggest(studentId: string, studentName: string) {
    setAiLoadingId(studentId);
    try {
      const sub = (subjects as any[]).find((s: any) => s.id === subjectId);
      const grade = gradeMap[studentId];
      const text = await aiSuggestRemark(studentName, "subject_teacher", grade, sub?.name);
      setDrafts((d) => ({ ...d, [studentId]: text }));
    } catch (e: any) {
      toast.error(e?.message ?? "AI suggestion failed");
    } finally {
      setAiLoadingId(null);
    }
  }

  const changed = (id: string) => drafts[id] !== undefined && drafts[id] !== (existingMap[id] ?? "");

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs font-medium mb-1 block text-muted-foreground">Exam</label>
              <Select value={examId} onValueChange={setExamId}>
                <SelectTrigger><SelectValue placeholder="Select exam" /></SelectTrigger>
                <SelectContent>
                  {(exams as any[]).map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.name} · {e.term} {e.year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs font-medium mb-1 block text-muted-foreground">Class</label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {(classes as any[]).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}{c.stream ? ` ${c.stream}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs font-medium mb-1 block text-muted-foreground">Subject</label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                <SelectContent>
                  {(subjects as any[]).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {examId && classId && subjectId && (
        <>
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{(students as any[]).length} students</p>
            {Object.keys(drafts).length > 0 && (
              <Button size="sm" onClick={saveAll}>
                <Save className="w-4 h-4 mr-1.5" />Save All Changes
              </Button>
            )}
          </div>

          <div className="space-y-3">
            {(students as any[]).map((student: any) => (
              <Card key={student.id} className={changed(student.id) ? "border-blue-500/50" : ""}>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="font-medium text-sm">{student.last_name}, {student.first_name}</span>
                        <span className="text-xs text-muted-foreground">{student.admission_no}</span>
                        {gradeMap[student.id] && (
                          <Badge variant="outline" className="text-xs">{gradeMap[student.id]}</Badge>
                        )}
                        {changed(student.id) && (
                          <Badge variant="outline" className="text-xs text-blue-600 border-blue-500/30">unsaved</Badge>
                        )}
                      </div>
                      <Textarea
                        placeholder="Write a remark…"
                        value={get(student.id)}
                        rows={2}
                        className="resize-none text-sm"
                        onChange={(e) => setDrafts((d) => ({ ...d, [student.id]: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 pt-6">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title="AI suggest"
                        disabled={aiLoadingId === student.id}
                        onClick={() => aiSuggest(student.id, `${student.first_name} ${student.last_name}`)}
                      >
                        {aiLoadingId === student.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Sparkles className="w-3.5 h-3.5" />}
                      </Button>
                      <Button
                        size="icon"
                        variant={changed(student.id) ? "default" : "ghost"}
                        className="h-8 w-8"
                        title="Save"
                        disabled={savingIds.has(student.id)}
                        onClick={() => saveSingle(student.id)}
                      >
                        {savingIds.has(student.id)
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Save className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {!(examId && classId && subjectId) && (
        <div className="text-center text-muted-foreground py-12">
          Select an exam, class, and subject to begin entering remarks.
        </div>
      )}
    </div>
  );
}

// ── Class Teacher Remarks Panel ───────────────────────────────────────────────

function ClassTeacherRemarksPanel({
  isTeacherScoped,
  classIds,
}: {
  isTeacherScoped: boolean;
  classIds: string[];
}) {
  const [examId, setExamId] = useState("");
  const [classId, setClassId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);

  const { data: exams = [] } = useExams();
  const { data: classes = [] } = useClasses(isTeacherScoped, classIds);

  const { data: students = [] } = useQuery({
    queryKey: ["remarks-ct-students", classId],
    enabled: !!classId,
    queryFn: async () =>
      (await supabase.from("students").select("id,first_name,last_name,admission_no").eq("class_id", classId).eq("status", "active").order("last_name")).data ?? [],
  });

  const { data: existing = [] } = useQuery({
    queryKey: ["class-remarks", examId, classId],
    enabled: !!(examId && classId),
    queryFn: async () =>
      (await (supabase as any)
        .from("exam_remarks")
        .select("*")
        .eq("exam_id", examId)
        .in("student_id", (students as any[]).map((s: any) => s.id))
        .eq("remark_type", "class_teacher")
      ).data ?? [],
  });

  const existingMap = Object.fromEntries((existing as any[]).map((r: any) => [r.student_id, r.remark_text]));
  const get = (id: string) => drafts[id] ?? existingMap[id] ?? "";
  const changed = (id: string) => drafts[id] !== undefined && drafts[id] !== (existingMap[id] ?? "");

  async function saveSingle(studentId: string) {
    setSavingIds((s) => new Set(s).add(studentId));
    try {
      await upsertRemark({ examId, studentId, remarkType: "class_teacher", text: get(studentId) });
      toast.success("Remark saved");
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingIds((s) => { const n = new Set(s); n.delete(studentId); return n; }); }
  }

  async function aiSuggest(studentId: string, name: string) {
    setAiLoadingId(studentId);
    try {
      const text = await aiSuggestRemark(name, "class_teacher");
      setDrafts((d) => ({ ...d, [studentId]: text }));
    } catch (e: any) { toast.error(e?.message ?? "AI suggestion failed"); }
    finally { setAiLoadingId(null); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs font-medium mb-1 block text-muted-foreground">Exam</label>
              <Select value={examId} onValueChange={setExamId}>
                <SelectTrigger><SelectValue placeholder="Select exam" /></SelectTrigger>
                <SelectContent>
                  {(exams as any[]).map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.name} · {e.term} {e.year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs font-medium mb-1 block text-muted-foreground">Class</label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {(classes as any[]).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {examId && classId && (
        <div className="space-y-3">
          {(students as any[]).map((student: any) => (
            <Card key={student.id} className={changed(student.id) ? "border-blue-500/50" : ""}>
              <CardContent className="pt-3 pb-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-medium text-sm">{student.last_name}, {student.first_name}</span>
                      <span className="text-xs text-muted-foreground">{student.admission_no}</span>
                      {changed(student.id) && (
                        <Badge variant="outline" className="text-xs text-blue-600 border-blue-500/30">unsaved</Badge>
                      )}
                    </div>
                    <Textarea
                      placeholder="Class teacher's remark…"
                      value={get(student.id)}
                      rows={2}
                      className="resize-none text-sm"
                      onChange={(e) => setDrafts((d) => ({ ...d, [student.id]: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 pt-6">
                    <Button size="icon" variant="ghost" className="h-8 w-8"
                      disabled={aiLoadingId === student.id}
                      onClick={() => aiSuggest(student.id, `${student.first_name} ${student.last_name}`)}>
                      {aiLoadingId === student.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    </Button>
                    <Button size="icon" variant={changed(student.id) ? "default" : "ghost"} className="h-8 w-8"
                      disabled={savingIds.has(student.id)} onClick={() => saveSingle(student.id)}>
                      {savingIds.has(student.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Principal Remarks Panel ───────────────────────────────────────────────────

function PrincipalRemarksPanel() {
  const [examId, setExamId] = useState("");
  const [classId, setClassId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const { data: exams = [] } = useExams();
  const { data: classes = [] } = useClasses(false, []);

  const { data: students = [] } = useQuery({
    queryKey: ["remarks-p-students", classId],
    enabled: !!classId,
    queryFn: async () =>
      (await supabase.from("students").select("id,first_name,last_name,admission_no").eq("class_id", classId).eq("status", "active").order("last_name")).data ?? [],
  });

  const { data: existing = [] } = useQuery({
    queryKey: ["principal-remarks", examId, classId],
    enabled: !!(examId && classId && (students as any[]).length > 0),
    queryFn: async () =>
      (await (supabase as any)
        .from("exam_remarks")
        .select("*")
        .eq("exam_id", examId)
        .in("student_id", (students as any[]).map((s: any) => s.id))
        .eq("remark_type", "principal")
      ).data ?? [],
  });

  const existingMap = Object.fromEntries((existing as any[]).map((r: any) => [r.student_id, r.remark_text]));
  const get = (id: string) => drafts[id] ?? existingMap[id] ?? "";

  async function saveSingle(studentId: string) {
    setSavingIds((s) => new Set(s).add(studentId));
    try {
      await upsertRemark({ examId, studentId, remarkType: "principal", text: get(studentId) });
      toast.success("Remark saved");
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingIds((s) => { const n = new Set(s); n.delete(studentId); return n; }); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs font-medium mb-1 block text-muted-foreground">Exam</label>
              <Select value={examId} onValueChange={setExamId}>
                <SelectTrigger><SelectValue placeholder="Select exam" /></SelectTrigger>
                <SelectContent>
                  {(exams as any[]).map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.name} · {e.term} {e.year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs font-medium mb-1 block text-muted-foreground">Class</label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {(classes as any[]).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {examId && classId && (
        <div className="space-y-3">
          {(students as any[]).map((student: any) => (
            <Card key={student.id}>
              <CardContent className="pt-3 pb-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-medium text-sm">{student.last_name}, {student.first_name}</span>
                      <span className="text-xs text-muted-foreground">{student.admission_no}</span>
                    </div>
                    <Textarea
                      placeholder="Principal's remark…"
                      value={get(student.id)}
                      rows={2}
                      className="resize-none text-sm"
                      onChange={(e) => setDrafts((d) => ({ ...d, [student.id]: e.target.value }))}
                    />
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8 mt-6"
                    disabled={savingIds.has(student.id)} onClick={() => saveSingle(student.id)}>
                    {savingIds.has(student.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Templates Panel ───────────────────────────────────────────────────────────

function TemplatesPanel() {
  const qc = useQueryClient();
  const [newText, setNewText] = useState("");
  const [newType, setNewType] = useState<string>("subject_teacher");
  const [newCat, setNewCat] = useState("excellent");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["remark-templates"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("remark_templates").select("*").eq("is_active", true).order("remark_type").order("category");
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { data: schoolId } = await supabase.rpc("current_user_school");
      const { error } = await (supabase as any).from("remark_templates").insert({
        school_id: schoolId,
        remark_type: newType,
        category: newCat,
        template_text: newText,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template saved");
      setNewText("");
      qc.invalidateQueries({ queryKey: ["remark-templates"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("remark_templates").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["remark-templates"] }); },
  });

  const grouped: Record<string, any[]> = {};
  for (const t of templates as any[]) {
    const k = t.remark_type;
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(t);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Add Template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            <Select value={newType} onValueChange={setNewType}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="subject_teacher">Subject Teacher</SelectItem>
                <SelectItem value="class_teacher">Class Teacher</SelectItem>
                <SelectItem value="principal">Principal</SelectItem>
              </SelectContent>
            </Select>
            <Select value={newCat} onValueChange={setNewCat}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="excellent">Excellent</SelectItem>
                <SelectItem value="good">Good</SelectItem>
                <SelectItem value="satisfactory">Satisfactory</SelectItem>
                <SelectItem value="needs_improvement">Needs Improvement</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea
            placeholder="Template text…"
            value={newText}
            rows={3}
            onChange={(e) => setNewText(e.target.value)}
          />
          <Button size="sm" onClick={() => add.mutate()} disabled={!newText.trim() || add.isPending}>
            {add.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <MessageSquarePlus className="w-3.5 h-3.5 mr-1.5" />}
            Add Template
          </Button>
        </CardContent>
      </Card>

      {Object.entries(grouped).map(([type, items]) => (
        <div key={type}>
          <h3 className="font-medium text-sm mb-2 capitalize">{type.replace(/_/g, " ")} templates</h3>
          <div className="space-y-2">
            {items.map((t: any) => (
              <Card key={t.id}>
                <CardContent className="pt-3 pb-3 flex items-start gap-3">
                  <div className="flex-1">
                    <Badge variant="outline" className="mb-1 text-xs">{t.category}</Badge>
                    <p className="text-sm">{t.template_text}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive"
                    onClick={() => remove.mutate(t.id)}>×</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
