/**
 * platform.learning.tsx — SmartDev Learning: Universal Learning (platform admin)
 *
 * GAP THIS FILLS: the corrected SmartDev Learning migration and the
 * school-side screens (_app/academics/learning-curriculum, -content,
 * -question-bank) already support content_scope = 'universal' at the data
 * layer, and learning-curriculum.tsx / learning-content.tsx already have
 * platform-admin-aware UI for it. But those routes live under `_app`,
 * which requires a resolved school tenant (see useTenant / PLATFORM_SLUG in
 * use-tenant.tsx) — platform admins sign in on the separate admin.smartdev
 * host and never get a school tenant, so they have no way to actually open
 * those screens. Universal question-bank/quiz management for platform
 * admins doesn't exist anywhere yet (learning-question-bank.tsx explicitly
 * only handles school-scoped content — see its own header comment). This
 * route is the platform-side home for all of it, reachable from
 * /platform/learning, gated by PlatformScopeGuard like every other
 * platform section.
 *
 * Sections:
 *   - Approvals   — every draft-status universal content/question/quiz in
 *                   one queue, so this is a genuine review step rather than
 *                   just another status toggle buried in a CRUD table.
 *   - Curriculum  — the universal Curriculum → Level → Grade → Subject →
 *                   Strand → Sub-strand tree (same 6 tables as
 *                   learning-curriculum.tsx; no school-linking panel here,
 *                   that's a school-console concern).
 *   - Content     — lessons/notes/videos/resources, content_scope='universal'
 *                   only (school_id always null, per the DB CHECK).
 *   - Question Bank — universal MCQ / true-false / short-answer questions
 *                   with their answer key, mirroring the school-side form.
 *   - Quizzes     — universal quizzes built from universal questions.
 *
 * All writes here rely on the "platform admin manage curriculum" /
 * "manage learning questions" / "manage learning quizzes" / "manage school
 * learning content" RLS policies, all of which check
 * public.is_platform_admin(auth.uid()) directly — no school_id or tenant
 * context required. That's what makes this route work at all for a user
 * with no school membership.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { platformGenerateLearningQuestions } from "@/lib/platform-admin.functions";
import { PlatformScopeGuard } from "@/components/security/PlatformScopeGuard";
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
import {
  Plus, Loader2, Trash2, ChevronRight, BookOpen, GraduationCap, FileText,
  Video, Link2, Eye, EyeOff, Archive, ClipboardCheck, ListChecks, Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/platform/learning")({
  component: () => (
    <PlatformScopeGuard requirement={{ section: "learning" }}>
      <UniversalLearning />
    </PlatformScopeGuard>
  ),
});

// ────────────────────────────────────────────────────────────────────────
// Shared types
// ────────────────────────────────────────────────────────────────────────
type Status = "draft" | "published" | "archived";
type Row = { id: string; name: string };
type Substrand = { id: string; name: string; curriculum_strands: { name: string; curriculum_subjects: { name: string } | null } | null };
type ContentType = "lesson" | "note" | "video" | "resource";
type ContentRow = {
  id: string; content_type: ContentType; title: string; body: string | null;
  media_url: string | null; status: Status; substrand_id: string | null; created_at: string;
};
type QuestionType = "mcq" | "true_false" | "short_answer";
type QuestionRow = {
  id: string; question_text: string; question_type: string;
  options: { id: string; text: string }[] | null; status: Status;
  topic: string | null; substrand_id: string | null; marks: number;
};
type QuizRow = { id: string; title: string; topic: string | null; status: Status; mode: string };

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "Multiple choice", true_false: "True / False", short_answer: "Short answer",
};
const STATUS_COLOR: Record<Status, string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  published: "bg-emerald-100 text-emerald-700 border-emerald-200",
  archived: "bg-amber-100 text-amber-700 border-amber-200",
};
const substrandLabel = (s?: Substrand | null) =>
  s ? `${s.curriculum_strands?.curriculum_subjects?.name ?? "?"} · ${s.curriculum_strands?.name ?? "?"} · ${s.name}` : "—";

function useSubstrands() {
  return useQuery({
    queryKey: ["platform-learning-substrands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("curriculum_substrands")
        .select("id, name, curriculum_strands(name, curriculum_subjects(name))")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Substrand[];
    },
  });
}

// ────────────────────────────────────────────────────────────────────────
// Page shell
// ────────────────────────────────────────────────────────────────────────
function UniversalLearning() {
  const [tab, setTab] = useState("approvals");

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <GraduationCap className="w-5 h-5" /> SmartDev Universal Learning
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          The SmartDev-wide learning library — curriculum, content, question bank and quizzes shared across
          every school. Learning activity here is revision-only and never touches any school's official ERP
          exam results.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="approvals" className="gap-1.5"><ClipboardCheck className="w-3.5 h-3.5" /> Approvals</TabsTrigger>
          <TabsTrigger value="curriculum" className="gap-1.5"><BookOpen className="w-3.5 h-3.5" /> Curriculum</TabsTrigger>
          <TabsTrigger value="content" className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Content</TabsTrigger>
          <TabsTrigger value="questions" className="gap-1.5"><ListChecks className="w-3.5 h-3.5" /> Question Bank</TabsTrigger>
          <TabsTrigger value="quizzes" className="gap-1.5"><GraduationCap className="w-3.5 h-3.5" /> Quizzes</TabsTrigger>
        </TabsList>

        <TabsContent value="approvals" className="mt-4"><ApprovalsQueue onJump={setTab} /></TabsContent>
        <TabsContent value="curriculum" className="mt-4"><CurriculumTree /></TabsContent>
        <TabsContent value="content" className="mt-4"><ContentManager /></TabsContent>
        <TabsContent value="questions" className="mt-4"><QuestionBank /></TabsContent>
        <TabsContent value="quizzes" className="mt-4"><Quizzes /></TabsContent>
      </Tabs>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Approvals — every draft-status universal item in one worklist
// ────────────────────────────────────────────────────────────────────────
function ApprovalsQueue({ onJump }: { onJump: (tab: string) => void }) {
  const qc = useQueryClient();

  const draftContent = useQuery({
    queryKey: ["platform-learning-approvals", "content"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_content").select("id, title, content_type, created_at")
        .eq("content_scope", "universal").eq("status", "draft")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const draftQuestions = useQuery({
    queryKey: ["platform-learning-approvals", "questions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_questions").select("id, question_text, question_type, created_at")
        .eq("content_scope", "universal").eq("status", "draft")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const draftQuizzes = useQuery({
    queryKey: ["platform-learning-approvals", "quizzes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_quizzes").select("id, title, mode, created_at")
        .eq("content_scope", "universal").eq("status", "draft")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const publish = useMutation({
    mutationFn: async ({ table, id }: { table: "learning_content" | "learning_questions" | "learning_quizzes"; id: string }) => {
      const { error } = await supabase.from(table).update({ status: "published" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Published");
      qc.invalidateQueries({ queryKey: ["platform-learning-approvals"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to publish"),
  });
  const archive = useMutation({
    mutationFn: async ({ table, id }: { table: "learning_content" | "learning_questions" | "learning_quizzes"; id: string }) => {
      const { error } = await supabase.from(table).update({ status: "archived" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Archived");
      qc.invalidateQueries({ queryKey: ["platform-learning-approvals"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to archive"),
  });

  const loading = draftContent.isLoading || draftQuestions.isLoading || draftQuizzes.isLoading;
  const totalPending = (draftContent.data?.length ?? 0) + (draftQuestions.data?.length ?? 0) + (draftQuizzes.data?.length ?? 0);

  const Row = ({ label, sub, table, id, onOpenTab }: { label: string; sub: string; table: "learning_content" | "learning_questions" | "learning_quizzes"; id: string; onOpenTab: string }) => (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b last:border-0">
      <div className="min-w-0">
        <button className="text-sm font-medium truncate text-left hover:underline" onClick={() => onJump(onOpenTab)}>{label}</button>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" variant="outline" onClick={() => publish.mutate({ table, id })} disabled={publish.isPending}>
          <Eye className="w-3.5 h-3.5 mr-1" /> Publish
        </Button>
        <Button size="sm" variant="ghost" onClick={() => archive.mutate({ table, id })} disabled={archive.isPending}>
          <Archive className="w-3.5 h-3.5 mr-1" /> Archive
        </Button>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4" /> Pending review
          {!loading && <Badge variant={totalPending > 0 ? "default" : "secondary"}>{totalPending}</Badge>}
        </CardTitle>
        <CardDescription>Draft universal content, questions and quizzes awaiting publish or archive.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid place-items-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : totalPending === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nothing pending — all caught up.</p>
        ) : (
          <div>
            {(draftContent.data ?? []).map((c: any) => (
              <Row key={c.id} label={c.title} sub={`Content · ${c.content_type}`} table="learning_content" id={c.id} onOpenTab="content" />
            ))}
            {(draftQuestions.data ?? []).map((q: any) => (
              <Row key={q.id} label={q.question_text} sub={`Question · ${QUESTION_TYPE_LABELS[q.question_type as QuestionType] ?? q.question_type}`} table="learning_questions" id={q.id} onOpenTab="questions" />
            ))}
            {(draftQuizzes.data ?? []).map((qz: any) => (
              <Row key={qz.id} label={qz.title} sub={`Quiz · ${qz.mode}`} table="learning_quizzes" id={qz.id} onOpenTab="quizzes" />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Curriculum tree — Curriculum → Level → Grade → Subject → Strand → Sub-strand
// ────────────────────────────────────────────────────────────────────────
type LevelKey = "curricula" | "levels" | "grades" | "subjects" | "strands" | "substrands";
const LEVEL_TABLE: Record<LevelKey, string> = {
  curricula: "curricula", levels: "curriculum_levels", grades: "curriculum_grades",
  subjects: "curriculum_subjects", strands: "curriculum_strands", substrands: "curriculum_substrands",
};
const LEVEL_PARENT_COL: Record<LevelKey, string | null> = {
  curricula: null, levels: "curriculum_id", grades: "level_id",
  subjects: "grade_id", strands: "curriculum_subject_id", substrands: "strand_id",
};

function CurriculumTree() {
  const qc = useQueryClient();
  const [curriculumId, setCurriculumId] = useState<string | null>(null);
  const [levelId, setLevelId] = useState<string | null>(null);
  const [gradeId, setGradeId] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [strandId, setStrandId] = useState<string | null>(null);

  const curricula = useQuery({
    queryKey: ["platform-curricula"],
    queryFn: async () => {
      const { data, error } = await supabase.from("curricula").select("id, name, description").order("name");
      if (error) throw error;
      return (data ?? []) as (Row & { description: string | null })[];
    },
  });
  const levels = useQuery({
    queryKey: ["platform-curriculum-levels", curriculumId],
    enabled: !!curriculumId,
    queryFn: async () => {
      const { data, error } = await supabase.from("curriculum_levels").select("id, name").eq("curriculum_id", curriculumId).order("sort_order");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const grades = useQuery({
    queryKey: ["platform-curriculum-grades", levelId],
    enabled: !!levelId,
    queryFn: async () => {
      const { data, error } = await supabase.from("curriculum_grades").select("id, name").eq("level_id", levelId).order("sort_order");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const subjects = useQuery({
    queryKey: ["platform-curriculum-subjects", gradeId],
    enabled: !!gradeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("curriculum_subjects").select("id, name").eq("grade_id", gradeId).order("sort_order");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const strands = useQuery({
    queryKey: ["platform-curriculum-strands", subjectId],
    enabled: !!subjectId,
    queryFn: async () => {
      const { data, error } = await supabase.from("curriculum_strands").select("id, name").eq("curriculum_subject_id", subjectId).order("sort_order");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const substrands = useQuery({
    queryKey: ["platform-curriculum-substrands", strandId],
    enabled: !!strandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("curriculum_substrands").select("id, name").eq("strand_id", strandId).order("sort_order");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const selectedCurriculum = curricula.data?.find((c) => c.id === curriculumId);
  const selectedLevel = levels.data?.find((l) => l.id === levelId);
  const selectedGrade = grades.data?.find((g) => g.id === gradeId);
  const selectedSubject = subjects.data?.find((s) => s.id === subjectId);
  const selectedStrand = strands.data?.find((s) => s.id === strandId);

  const [addOpen, setAddOpen] = useState<LevelKey | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const resetForm = () => { setName(""); setDescription(""); };

  const invalidateFor = (level: LevelKey) => {
    if (level === "curricula") qc.invalidateQueries({ queryKey: ["platform-curricula"] });
    if (level === "levels") qc.invalidateQueries({ queryKey: ["platform-curriculum-levels", curriculumId] });
    if (level === "grades") qc.invalidateQueries({ queryKey: ["platform-curriculum-grades", levelId] });
    if (level === "subjects") qc.invalidateQueries({ queryKey: ["platform-curriculum-subjects", gradeId] });
    if (level === "strands") qc.invalidateQueries({ queryKey: ["platform-curriculum-strands", subjectId] });
    if (level === "substrands") qc.invalidateQueries({ queryKey: ["platform-curriculum-substrands", strandId] });
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!addOpen) return;
      const table = LEVEL_TABLE[addOpen];
      const parentCol = LEVEL_PARENT_COL[addOpen];
      const parentId =
        addOpen === "levels" ? curriculumId :
        addOpen === "grades" ? levelId :
        addOpen === "subjects" ? gradeId :
        addOpen === "strands" ? subjectId :
        addOpen === "substrands" ? strandId : null;
      const payload: Record<string, unknown> = { name: name.trim() };
      if (parentCol && parentId) payload[parentCol] = parentId;
      if (addOpen === "curricula" && description.trim()) payload.description = description.trim();
      const { error } = await supabase.from(table).insert([payload]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Added");
      const level = addOpen;
      setAddOpen(null);
      resetForm();
      if (level) invalidateFor(level);
    },
    onError: (e: any) => toast.error(e.message || "Failed to add"),
  });

  const deleteRow = useMutation({
    mutationFn: async ({ level, id }: { level: LevelKey; id: string }) => {
      const { error } = await supabase.from(LEVEL_TABLE[level]).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success("Deleted");
      invalidateFor(vars.level);
      if (vars.level === "curricula" && curriculumId === vars.id) { setCurriculumId(null); setLevelId(null); setGradeId(null); setSubjectId(null); setStrandId(null); }
      if (vars.level === "levels" && levelId === vars.id) { setLevelId(null); setGradeId(null); setSubjectId(null); setStrandId(null); }
      if (vars.level === "grades" && gradeId === vars.id) { setGradeId(null); setSubjectId(null); setStrandId(null); }
      if (vars.level === "subjects" && subjectId === vars.id) { setSubjectId(null); setStrandId(null); }
      if (vars.level === "strands" && strandId === vars.id) setStrandId(null);
    },
    onError: (e: any) => toast.error(e.message || "Failed to delete — it may be in use by content/questions"),
  });

  function LevelPanel({ title, level, rows, loading, selectedId, onSelect, emptyHint }: {
    title: string; level: LevelKey; rows: Row[] | undefined; loading: boolean;
    selectedId: string | null; onSelect: (id: string) => void; emptyHint: string;
  }) {
    return (
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
            <Button size="sm" variant="outline" onClick={() => setAddOpen(level)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add
            </Button>
          </div>
          {loading ? (
            <div className="grid place-items-center py-6"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : !rows || rows.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3">{emptyHint}</p>
          ) : (
            <div className="space-y-1">
              {rows.map((r) => (
                <div key={r.id} onClick={() => onSelect(r.id)}
                  className={`group flex items-center justify-between gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm ${selectedId === r.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/60"}`}>
                  <span className="truncate flex-1">{r.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); deleteRow.mutate({ level, id: r.id }); }} className="opacity-0 group-hover:opacity-100">
                    <Trash2 className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  </button>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <span className={!curriculumId ? "font-medium text-foreground" : ""}>Curricula</span>
        {selectedCurriculum && (<><ChevronRight className="w-3.5 h-3.5" /><span className={!levelId ? "font-medium text-foreground" : ""}>{selectedCurriculum.name}</span></>)}
        {selectedLevel && (<><ChevronRight className="w-3.5 h-3.5" /><span className={!gradeId ? "font-medium text-foreground" : ""}>{selectedLevel.name}</span></>)}
        {selectedGrade && (<><ChevronRight className="w-3.5 h-3.5" /><span className={!subjectId ? "font-medium text-foreground" : ""}>{selectedGrade.name}</span></>)}
        {selectedSubject && (<><ChevronRight className="w-3.5 h-3.5" /><span className={!strandId ? "font-medium text-foreground" : ""}>{selectedSubject.name}</span></>)}
        {selectedStrand && (<><ChevronRight className="w-3.5 h-3.5" /><span className="font-medium text-foreground">{selectedStrand.name}</span></>)}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <LevelPanel title="Curricula" level="curricula" rows={curricula.data} loading={curricula.isLoading}
          selectedId={curriculumId} onSelect={(id) => { setCurriculumId(id); setLevelId(null); setGradeId(null); setSubjectId(null); setStrandId(null); }}
          emptyHint="No curricula yet — add one, e.g. Competency Based Curriculum." />
        {curriculumId && (
          <LevelPanel title={`Levels in ${selectedCurriculum?.name ?? "…"}`} level="levels" rows={levels.data} loading={levels.isLoading}
            selectedId={levelId} onSelect={(id) => { setLevelId(id); setGradeId(null); setSubjectId(null); setStrandId(null); }}
            emptyHint="No levels yet — e.g. Pre-Primary, Primary, Junior School." />
        )}
        {levelId && (
          <LevelPanel title={`Grades in ${selectedLevel?.name ?? "…"}`} level="grades" rows={grades.data} loading={grades.isLoading}
            selectedId={gradeId} onSelect={(id) => { setGradeId(id); setSubjectId(null); setStrandId(null); }}
            emptyHint="No grades yet — e.g. Grade 7." />
        )}
        {gradeId && (
          <LevelPanel title={`Subjects in ${selectedGrade?.name ?? "…"}`} level="subjects" rows={subjects.data} loading={subjects.isLoading}
            selectedId={subjectId} onSelect={(id) => { setSubjectId(id); setStrandId(null); }}
            emptyHint="No subjects yet — e.g. Mathematics." />
        )}
        {subjectId && (
          <LevelPanel title={`Strands in ${selectedSubject?.name ?? "…"}`} level="strands" rows={strands.data} loading={strands.isLoading}
            selectedId={strandId} onSelect={(id) => setStrandId(id)}
            emptyHint="No strands yet — e.g. Algebra." />
        )}
        {strandId && (
          <LevelPanel title={`Sub-strands in ${selectedStrand?.name ?? "…"}`} level="substrands" rows={substrands.data} loading={substrands.isLoading}
            selectedId={null} onSelect={() => {}}
            emptyHint="No sub-strands yet — this is the tier Content/Questions tag against." />
        )}
      </div>

      <Dialog open={!!addOpen} onOpenChange={(open) => { if (!open) { setAddOpen(null); resetForm(); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add {addOpen?.slice(0, -1) ?? ""}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            {addOpen === "curricula" && (
              <div><Label>Description (optional)</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(null); resetForm(); }}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={!name.trim() || addMutation.isPending}>
              {addMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Content — lessons / notes / videos / resources (universal only)
// ────────────────────────────────────────────────────────────────────────
const TYPE_ICON: Record<ContentType, JSX.Element> = {
  lesson: <BookOpen className="w-3.5 h-3.5" />, note: <FileText className="w-3.5 h-3.5" />,
  video: <Video className="w-3.5 h-3.5" />, resource: <Link2 className="w-3.5 h-3.5" />,
};
const emptyContentForm = { content_type: "lesson" as ContentType, title: "", body: "", media_url: "", substrand_id: "none" };

function ContentManager() {
  const qc = useQueryClient();
  const { data: substrands = [] } = useSubstrands();

  const content = useQuery({
    queryKey: ["platform-learning-content"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_content")
        .select("id, content_type, title, body, media_url, status, substrand_id, created_at")
        .eq("content_scope", "universal")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContentRow[];
    },
  });

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyContentForm);
  const resetForm = () => setForm(emptyContentForm);

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("learning_content").insert([{
        content_scope: "universal",
        school_id: null,
        content_type: form.content_type,
        title: form.title.trim(),
        body: form.body.trim() || null,
        media_url: form.media_url.trim() || null,
        substrand_id: form.substrand_id === "none" ? null : form.substrand_id,
        status: "draft",
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Added as draft");
      setAddOpen(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["platform-learning-content"] });
      qc.invalidateQueries({ queryKey: ["platform-learning-approvals"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to add content"),
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase.from("learning_content").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-learning-content"] });
      qc.invalidateQueries({ queryKey: ["platform-learning-approvals"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to update status"),
  });

  const deleteRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("learning_content").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["platform-learning-content"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to delete"),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add content</Button>
      </div>
      {content.isLoading ? (
        <div className="grid place-items-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (content.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Nothing here yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(content.data ?? []).map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">{TYPE_ICON[c.content_type]} {c.title}</CardTitle>
                  <Badge className={STATUS_COLOR[c.status]} variant="outline">{c.status}</Badge>
                </div>
                {c.substrand_id && <CardDescription className="text-xs">{substrandLabel(substrands.find((s) => s.id === c.substrand_id))}</CardDescription>}
              </CardHeader>
              <CardContent className="space-y-2">
                {c.body && <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">{c.body}</p>}
                {c.media_url && <a href={c.media_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline flex items-center gap-1"><Link2 className="w-3 h-3" /> Open media</a>}
                <div className="flex items-center gap-2 pt-1">
                  {c.status !== "published" ? (
                    <Button size="sm" variant="outline" onClick={() => toggleStatus.mutate({ id: c.id, status: "published" })}><Eye className="w-3.5 h-3.5 mr-1" /> Publish</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => toggleStatus.mutate({ id: c.id, status: "draft" })}><EyeOff className="w-3.5 h-3.5 mr-1" /> Unpublish</Button>
                  )}
                  {c.status !== "archived" && (
                    <Button size="sm" variant="outline" onClick={() => toggleStatus.mutate({ id: c.id, status: "archived" })}><Archive className="w-3.5 h-3.5 mr-1" /> Archive</Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => deleteRow.mutate(c.id)}><Trash2 className="w-3.5 h-3.5 mr-1" /> Delete</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add universal content</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Type</Label>
              <Select value={form.content_type} onValueChange={(v) => setForm((f) => ({ ...f, content_type: v as ContentType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lesson">Lesson</SelectItem><SelectItem value="note">Note</SelectItem>
                  <SelectItem value="video">Video</SelectItem><SelectItem value="resource">Resource</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Introduction to Fractions" /></div>
            <div><Label>Body (optional)</Label><Textarea rows={4} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} /></div>
            {(form.content_type === "video" || form.content_type === "resource") && (
              <div><Label>Media / link URL</Label><Input value={form.media_url} onChange={(e) => setForm((f) => ({ ...f, media_url: e.target.value }))} placeholder="https://..." /></div>
            )}
            <div>
              <Label>Sub-strand (optional)</Label>
              <Select value={form.substrand_id} onValueChange={(v) => setForm((f) => ({ ...f, substrand_id: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No topic</SelectItem>
                  {substrands.map((s) => <SelectItem key={s.id} value={s.id}>{substrandLabel(s)}</SelectItem>)}
                </SelectContent>
              </Select>
              {substrands.length === 0 && <p className="text-xs text-muted-foreground mt-1">No sub-strands yet — add some in the Curriculum tab first.</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={!form.title.trim() || addMutation.isPending}>
              {addMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Save as draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Question Bank — universal MCQ / true-false / short-answer + answer key
// ────────────────────────────────────────────────────────────────────────
const BLANK_OPTIONS = [{ id: "a", text: "" }, { id: "b", text: "" }];

// ────────────────────────────────────────────────────────────────────────
// AI question generator — drafts a batch of questions from a topic, admin
// reviews/edits/deselects before anything is saved. Saved rows go through
// the exact same insert path as the manual "Add question" form (draft by
// default, content_scope "universal"), so the existing Approvals/publish
// workflow is unchanged — this only makes filling the bank faster.
// ────────────────────────────────────────────────────────────────────────
type GeneratedQuestion = {
  question_type: QuestionType;
  question_text: string;
  options?: { id: string; text: string }[];
  correct_option?: string;
  correct_bool?: boolean;
  correct_text?: string;
  explanation?: string;
  marks?: number;
};
type GeneratedRow = GeneratedQuestion & { _selected: boolean };

function AIQuestionGenerator({ substrands, onSaved }: { substrands: Substrand[]; onSaved: () => void }) {
  const generateFn = useServerFn(platformGenerateLearningQuestions);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    topic: "", subject: "", grade_level: "", difficulty: "mixed" as "easy" | "medium" | "hard" | "mixed",
    count: 5, question_types: ["mcq"] as QuestionType[], substrand_id: "none", publishNow: false,
  });
  const [generated, setGenerated] = useState<GeneratedRow[] | null>(null);

  const toggleType = (t: QuestionType) =>
    setForm((f) => ({
      ...f,
      question_types: f.question_types.includes(t) ? f.question_types.filter((x) => x !== t) : [...f.question_types, t],
    }));

  const generate = useMutation({
    mutationFn: async () =>
      generateFn({
        data: {
          topic: form.topic.trim(),
          subject: form.subject.trim() || undefined,
          grade_level: form.grade_level.trim() || undefined,
          difficulty: form.difficulty,
          count: form.count,
          question_types: form.question_types.length ? form.question_types : ["mcq"],
        },
      }),
    onSuccess: (res) => setGenerated((res.questions as GeneratedQuestion[]).map((q) => ({ ...q, _selected: true }))),
    onError: (e: any) => toast.error(e.message || "AI generation failed"),
  });

  const save = useMutation({
    mutationFn: async () => {
      const selected = (generated ?? []).filter((q) => q._selected);
      const substrand_id = form.substrand_id === "none" ? null : form.substrand_id;
      const status = form.publishNow ? "published" : "draft";
      for (const q of selected) {
        const { data: inserted, error } = await supabase
          .from("learning_questions")
          .insert([{
            content_scope: "universal", school_id: null, substrand_id,
            topic: form.topic.trim() || null, question_type: q.question_type,
            question_text: q.question_text, options: q.options ?? null,
            marks: q.marks ?? 1, status,
          }])
          .select("id").single();
        if (error) throw error;

        const correct_answer =
          q.question_type === "mcq" ? { option: q.correct_option ?? "a" }
          : q.question_type === "true_false" ? { value: !!q.correct_bool }
          : { text: (q.correct_text ?? "").trim().toLowerCase() };

        const { error: answerErr } = await supabase.from("learning_question_answers").insert([{
          question_id: inserted.id, correct_answer, explanation: q.explanation ?? null,
        }]);
        if (answerErr) throw answerErr;
      }
      return selected.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} question${count === 1 ? "" : "s"} saved as ${form.publishNow ? "published" : "draft"}`);
      setOpen(false);
      setGenerated(null);
      setForm({ topic: "", subject: "", grade_level: "", difficulty: "mixed", count: 5, question_types: ["mcq"], substrand_id: "none", publishNow: false });
      onSaved();
    },
    onError: (e: any) => toast.error(e.message || "Failed to save questions"),
  });

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Sparkles className="w-4 h-4 mr-1" /> Generate with AI</Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setGenerated(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4" /> Generate questions with AI</DialogTitle></DialogHeader>

          {!generated ? (
            <div className="space-y-3">
              <div><Label>Topic *</Label><Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="e.g. Photosynthesis" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Subject (optional)</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Biology" /></div>
                <div><Label>Grade / level (optional)</Label><Input value={form.grade_level} onChange={(e) => setForm({ ...form, grade_level: e.target.value })} placeholder="e.g. Grade 7" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Difficulty</Label>
                  <Select value={form.difficulty} onValueChange={(v) => setForm({ ...form, difficulty: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                      <SelectItem value="mixed">Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>How many (1-20)</Label><Input type="number" min={1} max={20} value={form.count} onChange={(e) => setForm({ ...form, count: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} /></div>
              </div>
              <div>
                <Label>Question types</Label>
                <div className="flex gap-4 mt-1">
                  {(["mcq", "true_false", "short_answer"] as QuestionType[]).map((t) => (
                    <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={form.question_types.includes(t)} onCheckedChange={() => toggleType(t)} />
                      {QUESTION_TYPE_LABELS[t]}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label>Tag with sub-strand (optional — used for mastery-by-topic)</Label>
                <Select value={form.substrand_id} onValueChange={(v) => setForm({ ...form, substrand_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No topic</SelectItem>
                    {substrands.map((s) => <SelectItem key={s.id} value={s.id}>{substrandLabel(s)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => generate.mutate()}
                  disabled={!form.topic.trim() || form.question_types.length === 0 || generate.isPending}
                >
                  {generate.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Generate
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Review each question below — untick anything you don't want, edit the wording if needed, then save. Nothing is written until you save.
              </p>
              <div className="space-y-2 max-h-[45vh] overflow-y-auto">
                {generated.map((q, i) => (
                  <div key={i} className="flex gap-2 p-2 border rounded-md">
                    <Checkbox
                      className="mt-1"
                      checked={q._selected}
                      onCheckedChange={(v) => setGenerated((cur) => cur!.map((row, idx) => idx === i ? { ...row, _selected: !!v } : row))}
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">{QUESTION_TYPE_LABELS[q.question_type]}</Badge>
                        <span className="text-xs text-muted-foreground">{q.marks ?? 1} mark{(q.marks ?? 1) === 1 ? "" : "s"}</span>
                      </div>
                      <Textarea
                        value={q.question_text}
                        rows={2}
                        className="text-sm"
                        onChange={(e) => setGenerated((cur) => cur!.map((row, idx) => idx === i ? { ...row, question_text: e.target.value } : row))}
                      />
                      {q.question_type === "mcq" && q.options && (
                        <p className="text-xs text-muted-foreground">
                          {q.options.map((o) => `${o.id}) ${o.text}`).join("  ·  ")} — correct: {q.correct_option}
                        </p>
                      )}
                      {q.question_type === "true_false" && (
                        <p className="text-xs text-muted-foreground">Correct: {q.correct_bool ? "True" : "False"}</p>
                      )}
                      {q.question_type === "short_answer" && (
                        <p className="text-xs text-muted-foreground">Accepted answer: {q.correct_text}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Checkbox id="ai-publish-now" checked={form.publishNow} onCheckedChange={(v) => setForm({ ...form, publishNow: !!v })} />
                <Label htmlFor="ai-publish-now" className="text-sm font-normal cursor-pointer">
                  Publish selected questions immediately (skip draft/review)
                </Label>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setGenerated(null)}>Back</Button>
                <Button
                  onClick={() => save.mutate()}
                  disabled={generated.filter((q) => q._selected).length === 0 || save.isPending}
                >
                  {save.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  Save {generated.filter((q) => q._selected).length} question{generated.filter((q) => q._selected).length === 1 ? "" : "s"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function QuestionBank() {
  const qc = useQueryClient();
  const { data: substrands = [] } = useSubstrands();

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ["platform-learning-questions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_questions")
        .select("id, question_text, question_type, options, status, topic, substrand_id, marks")
        .eq("content_scope", "universal")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as QuestionRow[];
    },
  });

  const [addOpen, setAddOpen] = useState(false);
  const [qForm, setQForm] = useState({
    question_type: "mcq" as QuestionType, question_text: "", topic: "", substrand_id: "none", marks: 1,
    options: BLANK_OPTIONS, correct: "a", correctBool: "true", correctText: "", explanation: "", publishNow: false,
  });
  const resetQForm = () => setQForm({
    question_type: "mcq", question_text: "", topic: "", substrand_id: "none", marks: 1,
    options: BLANK_OPTIONS, correct: "a", correctBool: "true", correctText: "", explanation: "", publishNow: false,
  });

  const addQuestion = useMutation({
    mutationFn: async () => {
      const options = qForm.question_type === "mcq" ? qForm.options.filter((o) => o.text.trim()) : null;
      const { data: inserted, error } = await supabase
        .from("learning_questions")
        .insert([{
          content_scope: "universal",
          school_id: null,
          substrand_id: qForm.substrand_id === "none" ? null : qForm.substrand_id,
          topic: qForm.topic.trim() || null,
          question_type: qForm.question_type,
          question_text: qForm.question_text.trim(),
          options,
          marks: qForm.marks,
          status: qForm.publishNow ? "published" : "draft",
        }])
        .select("id").single();
      if (error) throw error;

      const correct_answer =
        qForm.question_type === "mcq" ? { option: qForm.correct }
        : qForm.question_type === "true_false" ? { value: qForm.correctBool === "true" }
        : { text: qForm.correctText.trim().toLowerCase() };

      const { error: answerErr } = await supabase.from("learning_question_answers").insert([{
        question_id: inserted.id, correct_answer, explanation: qForm.explanation.trim() || null,
      }]);
      if (answerErr) throw answerErr;
    },
    onSuccess: () => {
      if (qForm.publishNow) {
        toast.success("Question added and published");
      } else {
        toast.success("Question added as draft", {
          description: "It won't reach schools yet — publish it here or from Approvals, then add it to a published quiz.",
        });
      }
      setAddOpen(false);
      resetQForm();
      qc.invalidateQueries({ queryKey: ["platform-learning-questions"] });
      qc.invalidateQueries({ queryKey: ["platform-learning-approvals"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to add question"),
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase.from("learning_questions").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-learning-questions"] });
      qc.invalidateQueries({ queryKey: ["platform-learning-approvals"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to update status"),
  });

  const deleteQuestion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("learning_questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Question deleted");
      qc.invalidateQueries({ queryKey: ["platform-learning-questions"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to delete — it may be in use by a quiz"),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <AIQuestionGenerator substrands={substrands} onSaved={() => {
          qc.invalidateQueries({ queryKey: ["platform-learning-questions"] });
          qc.invalidateQueries({ queryKey: ["platform-learning-approvals"] });
        }} />
        <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add question</Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="grid place-items-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : questions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No universal questions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead><TableHead>Type</TableHead><TableHead>Topic</TableHead>
                  <TableHead>Marks</TableHead><TableHead>Status</TableHead><TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {questions.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="max-w-md truncate">{q.question_text}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{QUESTION_TYPE_LABELS[q.question_type as QuestionType] ?? q.question_type}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{q.topic ?? "—"}</TableCell>
                    <TableCell>{q.marks}</TableCell>
                    <TableCell><Badge className={STATUS_COLOR[q.status]} variant="outline">{q.status}</Badge></TableCell>
                    <TableCell className="flex items-center gap-1">
                      {q.status !== "published" ? (
                        <Button variant="ghost" size="icon" title="Publish" onClick={() => toggleStatus.mutate({ id: q.id, status: "published" })}><Eye className="w-4 h-4" /></Button>
                      ) : (
                        <Button variant="ghost" size="icon" title="Unpublish" onClick={() => toggleStatus.mutate({ id: q.id, status: "draft" })}><EyeOff className="w-4 h-4" /></Button>
                      )}
                      <Button variant="ghost" size="icon" title="Delete" onClick={() => deleteQuestion.mutate(q.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add universal question</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Question type</Label>
              <Select value={qForm.question_type} onValueChange={(v) => setQForm({ ...qForm, question_type: v as QuestionType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => <SelectItem key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Question text</Label>
              <Textarea value={qForm.question_text} onChange={(e) => setQForm({ ...qForm, question_text: e.target.value })}
                placeholder={qForm.question_type === "true_false" ? "e.g. Nairobi is the capital of Kenya." : qForm.question_type === "short_answer" ? "e.g. What is the capital of Kenya?" : "e.g. What is 2 + 2?"} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Topic (free text)</Label><Input value={qForm.topic} onChange={(e) => setQForm({ ...qForm, topic: e.target.value })} placeholder="e.g. Linear Equations" /></div>
              <div>
                <Label>Curriculum sub-strand (optional)</Label>
                <Select value={qForm.substrand_id} onValueChange={(v) => setQForm({ ...qForm, substrand_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {substrands.map((s) => <SelectItem key={s.id} value={s.id}>{substrandLabel(s)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {qForm.question_type === "mcq" && (
              <div className="space-y-2">
                <Label>Options (mark the correct one)</Label>
                {qForm.options.map((opt, i) => (
                  <div key={opt.id} className="flex items-center gap-2">
                    <input type="radio" checked={qForm.correct === opt.id} onChange={() => setQForm({ ...qForm, correct: opt.id })} />
                    <Input value={opt.text} onChange={(e) => { const next = [...qForm.options]; next[i] = { ...opt, text: e.target.value }; setQForm({ ...qForm, options: next }); }} placeholder={`Option ${opt.id.toUpperCase()}`} />
                  </div>
                ))}
                {qForm.options.length < 4 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setQForm({ ...qForm, options: [...qForm.options, { id: String.fromCharCode(97 + qForm.options.length), text: "" }] })}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add option
                  </Button>
                )}
              </div>
            )}
            {qForm.question_type === "true_false" && (
              <div>
                <Label>Correct answer</Label>
                <div className="flex gap-4 mt-1">
                  <label className="flex items-center gap-2 text-sm"><input type="radio" checked={qForm.correctBool === "true"} onChange={() => setQForm({ ...qForm, correctBool: "true" })} /> True</label>
                  <label className="flex items-center gap-2 text-sm"><input type="radio" checked={qForm.correctBool === "false"} onChange={() => setQForm({ ...qForm, correctBool: "false" })} /> False</label>
                </div>
              </div>
            )}
            {qForm.question_type === "short_answer" && (
              <div>
                <Label>Accepted answer</Label>
                <Input value={qForm.correctText} onChange={(e) => setQForm({ ...qForm, correctText: e.target.value })} placeholder="e.g. Nairobi" />
                <p className="text-xs text-muted-foreground mt-1">Graded case-insensitively against exactly this text.</p>
              </div>
            )}
            <div><Label>Explanation (shown after answering)</Label><Textarea value={qForm.explanation} onChange={(e) => setQForm({ ...qForm, explanation: e.target.value })} /></div>
            <div className="w-24"><Label>Marks</Label><Input type="number" min={1} value={qForm.marks} onChange={(e) => setQForm({ ...qForm, marks: Number(e.target.value) || 1 })} /></div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox id="q-publish-now" checked={qForm.publishNow} onCheckedChange={(v) => setQForm({ ...qForm, publishNow: !!v })} />
              <Label htmlFor="q-publish-now" className="text-sm font-normal cursor-pointer">
                Publish immediately (skip the draft/review step)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => addQuestion.mutate()} disabled={
              !qForm.question_text.trim() ||
              (qForm.question_type === "mcq" && qForm.options.filter((o) => o.text.trim()).length < 2) ||
              (qForm.question_type === "short_answer" && !qForm.correctText.trim()) ||
              addQuestion.isPending
            }>
              {addQuestion.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} {qForm.publishNow ? "Save & publish" : "Save as draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Quizzes — universal quizzes built from universal questions
// ────────────────────────────────────────────────────────────────────────
function Quizzes() {
  const qc = useQueryClient();

  const { data: questions = [] } = useQuery({
    queryKey: ["platform-learning-questions-for-quiz"],
    queryFn: async () => {
      const { data, error } = await supabase.from("learning_questions").select("id, question_text").eq("content_scope", "universal").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; question_text: string }[];
    },
  });

  const { data: quizzes = [], isLoading } = useQuery({
    queryKey: ["platform-learning-quizzes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("learning_quizzes").select("id, title, topic, status, mode").eq("content_scope", "universal").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as QuizRow[];
    },
  });

  const [addOpen, setAddOpen] = useState(false);
  const [quizForm, setQuizForm] = useState({ title: "", topic: "", mode: "practice", time_limit: "", max_attempts: "", publishNow: false });
  const [quizQuestionIds, setQuizQuestionIds] = useState<Set<string>>(new Set());

  const addQuiz = useMutation({
    mutationFn: async () => {
      const { data: inserted, error } = await supabase
        .from("learning_quizzes")
        .insert([{
          content_scope: "universal",
          school_id: null,
          title: quizForm.title.trim(),
          topic: quizForm.topic.trim() || null,
          mode: quizForm.mode,
          time_limit_seconds: quizForm.time_limit ? Number(quizForm.time_limit) * 60 : null,
          max_attempts: quizForm.max_attempts ? Number(quizForm.max_attempts) : null,
          status: quizForm.publishNow ? "published" : "draft",
        }])
        .select("id").single();
      if (error) throw error;
      if (quizQuestionIds.size > 0) {
        const rows = Array.from(quizQuestionIds).map((question_id, i) => ({ quiz_id: inserted.id, question_id, sort_order: i }));
        const { error: linkErr } = await supabase.from("learning_quiz_questions").insert(rows);
        if (linkErr) throw linkErr;
      }
    },
    onSuccess: () => {
      if (quizForm.publishNow) {
        toast.success("Quiz created and published — students can see it now");
      } else {
        toast.success("Quiz created as draft", {
          description: "Publish it here (the eye icon) or from Approvals before students can take it.",
        });
      }
      setAddOpen(false);
      setQuizForm({ title: "", topic: "", mode: "practice", time_limit: "", max_attempts: "", publishNow: false });
      setQuizQuestionIds(new Set());
      qc.invalidateQueries({ queryKey: ["platform-learning-quizzes"] });
      qc.invalidateQueries({ queryKey: ["platform-learning-approvals"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to create quiz"),
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase.from("learning_quizzes").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-learning-quizzes"] });
      qc.invalidateQueries({ queryKey: ["platform-learning-approvals"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to update status"),
  });

  const deleteQuiz = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("learning_quizzes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Quiz deleted"); qc.invalidateQueries({ queryKey: ["platform-learning-quizzes"] }); },
    onError: (e: any) => toast.error(e.message || "Failed to delete quiz"),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1" /> Create quiz</Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="grid place-items-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : quizzes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No universal quizzes yet.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Topic</TableHead><TableHead>Mode</TableHead><TableHead>Status</TableHead><TableHead className="w-40" /></TableRow></TableHeader>
              <TableBody>
                {quizzes.map((quiz) => (
                  <TableRow key={quiz.id}>
                    <TableCell>{quiz.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{quiz.topic ?? "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{quiz.mode}</Badge></TableCell>
                    <TableCell><Badge className={STATUS_COLOR[quiz.status]} variant="outline">{quiz.status}</Badge></TableCell>
                    <TableCell className="flex items-center gap-1">
                      {quiz.status !== "published" ? (
                        <Button variant="ghost" size="icon" title="Publish" onClick={() => toggleStatus.mutate({ id: quiz.id, status: "published" })}><Eye className="w-4 h-4" /></Button>
                      ) : (
                        <Button variant="ghost" size="icon" title="Unpublish" onClick={() => toggleStatus.mutate({ id: quiz.id, status: "draft" })}><EyeOff className="w-4 h-4" /></Button>
                      )}
                      <Button variant="ghost" size="icon" title="Delete" onClick={() => deleteQuiz.mutate(quiz.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create universal quiz</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={quizForm.title} onChange={(e) => setQuizForm({ ...quizForm, title: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Topic</Label><Input value={quizForm.topic} onChange={(e) => setQuizForm({ ...quizForm, topic: e.target.value })} /></div>
              <div>
                <Label>Mode</Label>
                <Select value={quizForm.mode} onValueChange={(v) => setQuizForm({ ...quizForm, mode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="practice">Practice</SelectItem>
                    <SelectItem value="daily_revision">Daily revision</SelectItem>
                    <SelectItem value="weak_area">Weak-area revision</SelectItem>
                    <SelectItem value="topic_practice">Topic practice</SelectItem>
                    <SelectItem value="adaptive">Adaptive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Time limit (minutes, optional)</Label><Input type="number" value={quizForm.time_limit} onChange={(e) => setQuizForm({ ...quizForm, time_limit: e.target.value })} /></div>
              <div><Label>Max attempts (optional)</Label><Input type="number" value={quizForm.max_attempts} onChange={(e) => setQuizForm({ ...quizForm, max_attempts: e.target.value })} /></div>
            </div>
            <div>
              <Label>Questions ({quizQuestionIds.size} selected)</Label>
              <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
                {questions.length === 0 && <p className="text-sm text-muted-foreground p-3">Add some universal questions first.</p>}
                {questions.map((q) => (
                  <label key={q.id} className="flex items-center gap-2 p-2 text-sm hover:bg-muted/40 cursor-pointer">
                    <Checkbox checked={quizQuestionIds.has(q.id)} onCheckedChange={(checked) => { const next = new Set(quizQuestionIds); if (checked) next.add(q.id); else next.delete(q.id); setQuizQuestionIds(next); }} />
                    <span className="truncate">{q.question_text}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox id="quiz-publish-now" checked={quizForm.publishNow} onCheckedChange={(v) => setQuizForm({ ...quizForm, publishNow: !!v })} />
              <Label htmlFor="quiz-publish-now" className="text-sm font-normal cursor-pointer">
                Publish immediately (skip the draft/review step)
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Adding a question here does not publish it on its own — a quiz only reaches students once the
              <span className="font-medium"> quiz itself</span> is published. Individual questions can stay in
              draft; they're still usable inside a published quiz.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => addQuiz.mutate()} disabled={!quizForm.title.trim() || addQuiz.isPending}>
              {addQuiz.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} {quizForm.publishNow ? "Create & publish" : "Create quiz"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
