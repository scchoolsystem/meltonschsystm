/**
 * _app.academics.learning-curriculum.tsx — SmartDev Learning: Curriculum
 * Builder
 *
 * REWRITE (see chat): the previous version of this file was written before
 * the corrected SmartDev Learning architecture (spec §9-10) was finalised
 * and doesn't match the shipped schema. Concretely, it was wrong in three
 * ways:
 *
 *   1. It treated `curricula` as school-scoped (`school_id` on insert).
 *      The corrected schema has NO school_id on curricula/levels/grades/
 *      subjects/strands/substrands at all — the whole tree is universal,
 *      database-driven Kenyan-curriculum metadata (spec §10), readable by
 *      every authenticated user and writable only by platform admins
 *      ("read curriculum" / "platform admin manage curriculum" RLS
 *      policies, applied identically across all six tables).
 *   2. It skipped a whole tier: the real hierarchy is
 *      curricula → curriculum_levels → curriculum_grades →
 *      curriculum_subjects → curriculum_strands → curriculum_substrands
 *      (Curriculum → Level → Grade → Subject → Strand → Sub-strand).
 *      curriculum_grades.level_id points at curriculum_levels, not at
 *      curricula directly.
 *   3. It gave curriculum_subjects a direct `subject_id` column into the
 *      ERP `subjects` table. That's not how it shipped — curriculum_
 *      subjects has no subject_id at all. Per-school linking to the ERP
 *      subjects table happens through a separate join table,
 *      learning_subject_links(curriculum_subject_id, school_id,
 *      subject_id), because a curriculum subject is shared across every
 *      school but the ERP subject it maps to is school-specific.
 *
 * So this screen is now two things in one page:
 *   - A platform-admin-only editor for the universal curriculum tree
 *     (create/delete at every tier). Non-platform-admins get the same
 *     tree read-only — RLS would block their writes anyway, but the UI
 *     hides the controls so it doesn't look broken.
 *   - A school-admin "link your subjects" panel, shown once a Subject is
 *     selected, that manages this school's row in learning_subject_links
 *     so official ERP results and Learning mastery can be correlated
 *     (used by learning_ai_context()). Available to school admins
 *     (and platform admins) of whichever school they belong to.
 *
 * Platform-admin detection: roles.includes("platform_owner" |
 * "platform_support"), mirroring public.is_platform_admin() exactly —
 * this already exists in use-auth.tsx (see platform.schools.tsx,
 * platform.plans.tsx, etc.) and was simply never used from the two
 * Learning screens; it was NOT actually missing from the codebase as the
 * old header comment here claimed.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, ChevronRight, BookOpen, ChevronLeft, Link2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_app/academics/learning-curriculum")({
  component: () => (
    <FeatureGate feature="academics_subjects">
      <Page />
    </FeatureGate>
  ),
});

type Row = { id: string; name: string };

// ── The 6 drill-down tiers, in order. Each entry carries everything the
// generic panel/mutation code needs: table name, the column that points at
// its parent, and the query key it lives under. ──────────────────────────
type LevelKey = "curricula" | "levels" | "grades" | "subjects" | "strands" | "substrands";

const LEVEL_TABLE: Record<LevelKey, string> = {
  curricula: "curricula",
  levels: "curriculum_levels",
  grades: "curriculum_grades",
  subjects: "curriculum_subjects",
  strands: "curriculum_strands",
  substrands: "curriculum_substrands",
};

// Column on each table that holds the parent id (null for the root tier).
const LEVEL_PARENT_COL: Record<LevelKey, string | null> = {
  curricula: null,
  levels: "curriculum_id",
  grades: "level_id",
  subjects: "grade_id",
  strands: "curriculum_subject_id",
  substrands: "strand_id",
};

function useSchoolId() {
  return useQuery({
    queryKey: ["current-school-id"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("current_user_school");
      if (error) throw error;
      return data as string | null;
    },
  });
}

function Page() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const isPlatformAdmin = roles.includes("platform_owner") || roles.includes("platform_support");

  const { data: schoolId } = useSchoolId();

  const [curriculumId, setCurriculumId] = useState<string | null>(null);
  const [levelId, setLevelId] = useState<string | null>(null);
  const [gradeId, setGradeId] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [strandId, setStrandId] = useState<string | null>(null);

  // ── Level 1: curricula (root, universal) ─────────────────────────────
  const curricula = useQuery({
    queryKey: ["learning-curricula"],
    queryFn: async () => {
      const { data, error } = await supabase.from("curricula").select("id, name, description").order("name");
      if (error) throw error;
      return (data ?? []) as (Row & { description: string | null })[];
    },
  });

  // ── Level 2: curriculum_levels (depends on curriculumId) ─────────────
  const levels = useQuery({
    queryKey: ["learning-curriculum-levels", curriculumId],
    enabled: !!curriculumId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("curriculum_levels")
        .select("id, name")
        .eq("curriculum_id", curriculumId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  // ── Level 3: curriculum_grades (depends on levelId) ───────────────────
  const grades = useQuery({
    queryKey: ["learning-curriculum-grades", levelId],
    enabled: !!levelId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("curriculum_grades")
        .select("id, name")
        .eq("level_id", levelId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  // ── Level 4: curriculum_subjects (depends on gradeId) ─────────────────
  const subjects = useQuery({
    queryKey: ["learning-curriculum-subjects", gradeId],
    enabled: !!gradeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("curriculum_subjects")
        .select("id, name")
        .eq("grade_id", gradeId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  // ── Level 5: curriculum_strands (depends on subjectId) ────────────────
  const strands = useQuery({
    queryKey: ["learning-curriculum-strands", subjectId],
    enabled: !!subjectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("curriculum_strands")
        .select("id, name")
        .eq("curriculum_subject_id", subjectId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  // ── Level 6: curriculum_substrands (depends on strandId) ──────────────
  const substrands = useQuery({
    queryKey: ["learning-curriculum-substrands", strandId],
    enabled: !!strandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("curriculum_substrands")
        .select("id, name")
        .eq("strand_id", strandId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  // ── School ↔ ERP subject links, bulk-loaded for this school so the
  // Subjects panel can badge which rows are already linked. ─────────────
  const subjectLinks = useQuery({
    queryKey: ["learning-subject-links", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_subject_links")
        .select("id, curriculum_subject_id, subject_id")
        .eq("school_id", schoolId);
      if (error) throw error;
      return (data ?? []) as { id: string; curriculum_subject_id: string; subject_id: string }[];
    },
  });

  const { data: erpSubjects = [] } = useQuery({
    queryKey: ["erp-subjects-for-curriculum", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const selectedCurriculum = curricula.data?.find((c) => c.id === curriculumId);
  const selectedLevel = levels.data?.find((l) => l.id === levelId);
  const selectedGrade = grades.data?.find((g) => g.id === gradeId);
  const selectedSubject = subjects.data?.find((s) => s.id === subjectId);
  const selectedStrand = strands.data?.find((s) => s.id === strandId);

  // ── Add dialog (platform-admin only writes) ───────────────────────────
  const [addOpen, setAddOpen] = useState<LevelKey | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const resetForm = () => {
    setName("");
    setDescription("");
  };

  const invalidateFor = (level: LevelKey) => {
    if (level === "curricula") qc.invalidateQueries({ queryKey: ["learning-curricula"] });
    if (level === "levels") qc.invalidateQueries({ queryKey: ["learning-curriculum-levels", curriculumId] });
    if (level === "grades") qc.invalidateQueries({ queryKey: ["learning-curriculum-grades", levelId] });
    if (level === "subjects") qc.invalidateQueries({ queryKey: ["learning-curriculum-subjects", gradeId] });
    if (level === "strands") qc.invalidateQueries({ queryKey: ["learning-curriculum-strands", subjectId] });
    if (level === "substrands") qc.invalidateQueries({ queryKey: ["learning-curriculum-substrands", strandId] });
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
    onError: (e: any) => toast.error(e.message || "Failed to add — platform admin access is required"),
  });

  const deleteRow = useMutation({
    mutationFn: async ({ level, id }: { level: LevelKey; id: string }) => {
      const { error } = await supabase.from(LEVEL_TABLE[level]).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      toast.success("Deleted");
      invalidateFor(vars.level);
      if (vars.level === "curricula" && curriculumId === vars.id) {
        setCurriculumId(null); setLevelId(null); setGradeId(null); setSubjectId(null); setStrandId(null);
      }
      if (vars.level === "levels" && levelId === vars.id) {
        setLevelId(null); setGradeId(null); setSubjectId(null); setStrandId(null);
      }
      if (vars.level === "grades" && gradeId === vars.id) {
        setGradeId(null); setSubjectId(null); setStrandId(null);
      }
      if (vars.level === "subjects" && subjectId === vars.id) {
        setSubjectId(null); setStrandId(null);
      }
      if (vars.level === "strands" && strandId === vars.id) setStrandId(null);
    },
    onError: (e: any) => toast.error(e.message || "Failed to delete — it may be in use by questions"),
  });

  // ── Link-to-ERP-subject mutation (school admins, any school member's
  // read; write requires is_admin() at the DB per the learning_subject_
  // links RLS — RLS is the real enforcement, this UI just hides the
  // control for non-admins). ────────────────────────────────────────────
  const linkMutation = useMutation({
    mutationFn: async (erpSubjectId: string) => {
      if (!schoolId || !subjectId) return;
      const existing = subjectLinks.data?.find((l) => l.curriculum_subject_id === subjectId);
      if (erpSubjectId === "none") {
        if (existing) {
          const { error } = await supabase.from("learning_subject_links").delete().eq("id", existing.id);
          if (error) throw error;
        }
        return;
      }
      if (existing) {
        const { error } = await supabase
          .from("learning_subject_links")
          .update({ subject_id: erpSubjectId })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("learning_subject_links").insert([{
          curriculum_subject_id: subjectId, school_id: schoolId, subject_id: erpSubjectId,
        }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Subject link updated");
      qc.invalidateQueries({ queryKey: ["learning-subject-links", schoolId] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to update link"),
  });

  // ── Shared list-panel renderer for each level ───────────────────────
  function LevelPanel({
    title,
    level,
    rows,
    loading,
    selectedId,
    onSelect,
    emptyHint,
    renderExtra,
  }: {
    title: string;
    level: LevelKey;
    rows: Row[] | undefined;
    loading: boolean;
    selectedId: string | null;
    onSelect: (id: string) => void;
    emptyHint: string;
    renderExtra?: (id: string) => React.ReactNode;
  }) {
    return (
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
            {isPlatformAdmin && (
              <Button size="sm" variant="outline" onClick={() => setAddOpen(level)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add
              </Button>
            )}
          </div>
          {loading ? (
            <div className="grid place-items-center py-6"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : !rows || rows.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3">{emptyHint}</p>
          ) : (
            <div className="space-y-1">
              {rows.map((r) => (
                <div
                  key={r.id}
                  onClick={() => onSelect(r.id)}
                  className={`group flex items-center justify-between gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm ${
                    selectedId === r.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/60"
                  }`}
                >
                  <span className="truncate flex-1">{r.name}</span>
                  {renderExtra?.(r.id)}
                  {isPlatformAdmin && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteRow.mutate({ level, id: r.id }); }}
                      className="opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    </button>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const activeLink = subjectLinks.data?.find((l) => l.curriculum_subject_id === subjectId);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <BookOpen className="w-5 h-5" /> SmartDev Learning — Curriculum
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Curriculum → Level → Grade → Subject → Strand → Sub-strand. This tree is universal across every
            school; sub-strands are what the Question Bank tags questions against.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isPlatformAdmin ? (
            <Badge variant="outline" className="gap-1"><ShieldCheck className="w-3 h-3" /> Platform admin — editing</Badge>
          ) : (
            <Badge variant="outline">Read-only — browse only</Badge>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link to="/academics/learning-question-bank">
              <ChevronLeft className="w-4 h-4 mr-1" /> Question Bank
            </Link>
          </Button>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <span className={!curriculumId ? "font-medium text-foreground" : ""}>Curricula</span>
        {selectedCurriculum && (
          <>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className={!levelId ? "font-medium text-foreground" : ""}>{selectedCurriculum.name}</span>
          </>
        )}
        {selectedLevel && (
          <>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className={!gradeId ? "font-medium text-foreground" : ""}>{selectedLevel.name}</span>
          </>
        )}
        {selectedGrade && (
          <>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className={!subjectId ? "font-medium text-foreground" : ""}>{selectedGrade.name}</span>
          </>
        )}
        {selectedSubject && (
          <>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className={!strandId ? "font-medium text-foreground" : ""}>{selectedSubject.name}</span>
          </>
        )}
        {selectedStrand && (
          <>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="font-medium text-foreground">{selectedStrand.name}</span>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <LevelPanel
          title="Curricula"
          level="curricula"
          rows={curricula.data}
          loading={curricula.isLoading}
          selectedId={curriculumId}
          onSelect={(id) => { setCurriculumId(id); setLevelId(null); setGradeId(null); setSubjectId(null); setStrandId(null); }}
          emptyHint="No curricula yet — e.g. 'Competency Based Curriculum'."
        />

        {curriculumId && (
          <LevelPanel
            title={`Levels in ${selectedCurriculum?.name}`}
            level="levels"
            rows={levels.data}
            loading={levels.isLoading}
            selectedId={levelId}
            onSelect={(id) => { setLevelId(id); setGradeId(null); setSubjectId(null); setStrandId(null); }}
            emptyHint="No levels yet — e.g. 'Junior School' or 'Senior School'."
          />
        )}

        {levelId && (
          <LevelPanel
            title={`Grades in ${selectedLevel?.name}`}
            level="grades"
            rows={grades.data}
            loading={grades.isLoading}
            selectedId={gradeId}
            onSelect={(id) => { setGradeId(id); setSubjectId(null); setStrandId(null); }}
            emptyHint="No grades yet — e.g. 'Grade 7'."
          />
        )}

        {gradeId && (
          <LevelPanel
            title={`Subjects in ${selectedGrade?.name}`}
            level="subjects"
            rows={subjects.data}
            loading={subjects.isLoading}
            selectedId={subjectId}
            onSelect={(id) => setSubjectId(id)}
            emptyHint="No subjects yet — e.g. 'Mathematics'."
            renderExtra={(id) => {
              const linked = subjectLinks.data?.some((l) => l.curriculum_subject_id === id);
              return linked ? <Badge variant="outline" className="text-[10px] gap-1"><Link2 className="w-2.5 h-2.5" /> Linked</Badge> : null;
            }}
          />
        )}

        {subjectId && (
          <LevelPanel
            title={`Strands in ${selectedSubject?.name}`}
            level="strands"
            rows={strands.data}
            loading={strands.isLoading}
            selectedId={strandId}
            onSelect={(id) => setStrandId(id)}
            emptyHint="No strands yet — e.g. 'Numbers'."
          />
        )}

        {strandId && (
          <LevelPanel
            title={`Sub-strands in ${selectedStrand?.name}`}
            level="substrands"
            rows={substrands.data}
            loading={substrands.isLoading}
            selectedId={null}
            onSelect={() => {}}
            emptyHint="No sub-strands yet — e.g. 'Fractions'. These are what the Question Bank tags questions against."
          />
        )}
      </div>

      {/* ── ERP subject link (school-scoped, separate from the universal tree) ── */}
      {subjectId && schoolId && (
        <Card>
          <CardContent className="pt-4">
            <h3 className="text-sm font-semibold text-muted-foreground mb-1 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" /> Link "{selectedSubject?.name}" to your school's subject
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Lets the AI combine this curriculum subject's Learning mastery with your school's official ERP
              results for the matching subject. This link is per-school — other schools set their own.
            </p>
            <Select
              value={activeLink?.subject_id ?? "none"}
              onValueChange={(v) => linkMutation.mutate(v)}
              disabled={linkMutation.isPending}
            >
              <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not linked</SelectItem>
                {erpSubjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* ── Add dialog (platform-admin only; shared shape) ─────────────── */}
      <Dialog open={!!addOpen} onOpenChange={(open) => { if (!open) { setAddOpen(null); resetForm(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {addOpen === "curricula" && "Add curriculum"}
              {addOpen === "levels" && "Add level"}
              {addOpen === "grades" && "Add grade"}
              {addOpen === "subjects" && "Add subject"}
              {addOpen === "strands" && "Add strand"}
              {addOpen === "substrands" && "Add sub-strand"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            </div>
            {addOpen === "curricula" && (
              <div>
                <Label>Description (optional)</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(null); resetForm(); }}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={!name.trim() || addMutation.isPending}>
              {addMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
