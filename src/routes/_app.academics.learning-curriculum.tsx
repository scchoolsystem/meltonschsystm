/**
 * _app.academics.learning-curriculum.tsx — SmartDev Learning: Curriculum
 * Builder (school-admin console)
 *
 * Fills the gap flagged in _app.academics.learning-question-bank.tsx's own
 * header: that screen's substrand picker has nothing to list until this
 * tree exists somewhere other than raw SQL / RLS test fixtures.
 *
 * Builds the hierarchy: Curriculum → Grade → Subject → Strand → Sub-strand.
 * "Subject" here does NOT duplicate the existing ERP `subjects` table — it
 * links to it via subject_id (per spec §11: "Curriculum-specific metadata
 * can be stored separately and linked to the existing subject"). A free-text
 * fallback label is kept for universal/CBC learning areas that don't have a
 * matching row in this school's `subjects` table (e.g. a school hasn't
 * created "Creative Arts" as an ERP subject, but CBC still needs it).
 *
 * SCOPE NOTE (same caveat as the question-bank screen): everything created
 * here is school-scoped (`school_id` set). There's still no client-side
 * is_platform_admin() detection anywhere in this codebase, so a genuine
 * "Universal SmartDev Learning" curriculum console — where school_id is
 * NULL and content is shared across all schools — has to wait for that.
 * Until then, every school populates its own copy of the tree. Not a
 * long-term answer, just what's buildable today without inventing a
 * platform-admin auth path this screen has no business inventing.
 *
 * Assumes (pending confirmation from the live schema dump):
 *   curricula            (id, school_id, name, description)
 *   curriculum_grades    (id, curriculum_id, name, sort_order)
 *   curriculum_subjects  (id, grade_id, subject_id nullable→subjects.id,
 *                         name, sort_order)
 *   curriculum_strands   (id, subject_id→curriculum_subjects.id, name, sort_order)
 *   curriculum_substrands(id, strand_id→curriculum_strands.id, name, sort_order)
 * If the real column names differ once the schema dump comes back, only the
 * query/insert payloads below need adjusting — the UI shape stays the same.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Plus, Loader2, Trash2, ChevronRight, BookOpen, ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_app/academics/learning-curriculum")({
  component: () => (
    <FeatureGate feature="academics_subjects">
      <Page />
    </FeatureGate>
  ),
});

type Row = { id: string; name: string };
type CurriculumSubjectRow = Row & { subject_id: string | null };

// ── Generic level config: each of the 4 drill-down levels shares this shape ──
type LevelKey = "curricula" | "grades" | "subjects" | "strands" | "substrands";

function useSchoolId() {
  return useQuery({
    queryKey: ["current-school-id"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("current_user_school");
      if (error) throw error;
      return data as string;
    },
  });
}

function Page() {
  const qc = useQueryClient();
  const { data: schoolId } = useSchoolId();

  const [curriculumId, setCurriculumId] = useState<string | null>(null);
  const [gradeId, setGradeId] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [strandId, setStrandId] = useState<string | null>(null);

  // ── ERP subjects, for linking curriculum_subjects → subjects ───────────
  const { data: erpSubjects = [] } = useQuery({
    queryKey: ["erp-subjects-for-curriculum"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  // ── Level 1: curricula ───────────────────────────────────────────────
  const curricula = useQuery({
    queryKey: ["learning-curricula"],
    queryFn: async () => {
      const { data, error } = await supabase.from("curricula").select("id, name, description").order("name");
      if (error) throw error;
      return (data ?? []) as (Row & { description: string | null })[];
    },
  });

  // ── Level 2: grades (depends on curriculumId) ───────────────────────
  const grades = useQuery({
    queryKey: ["learning-curriculum-grades", curriculumId],
    enabled: !!curriculumId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("curriculum_grades")
        .select("id, name")
        .eq("curriculum_id", curriculumId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  // ── Level 3: subjects (depends on gradeId) ──────────────────────────
  const subjects = useQuery({
    queryKey: ["learning-curriculum-subjects", gradeId],
    enabled: !!gradeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("curriculum_subjects")
        .select("id, name, subject_id")
        .eq("grade_id", gradeId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CurriculumSubjectRow[];
    },
  });

  // ── Level 4: strands (depends on subjectId) ─────────────────────────
  const strands = useQuery({
    queryKey: ["learning-curriculum-strands", subjectId],
    enabled: !!subjectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("curriculum_strands")
        .select("id, name")
        .eq("subject_id", subjectId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  // ── Level 5: sub-strands (depends on strandId) ──────────────────────
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

  const selectedCurriculum = curricula.data?.find((c) => c.id === curriculumId);
  const selectedGrade = grades.data?.find((g) => g.id === gradeId);
  const selectedSubject = subjects.data?.find((s) => s.id === subjectId);
  const selectedStrand = strands.data?.find((s) => s.id === strandId);

  // ── Add dialogs ──────────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState<LevelKey | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [linkedSubjectId, setLinkedSubjectId] = useState("none");

  const resetForm = () => {
    setName("");
    setDescription("");
    setLinkedSubjectId("none");
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      if (addOpen === "curricula") {
        const { error } = await supabase
          .from("curricula")
          .insert([{ school_id: schoolId, name: name.trim(), description: description.trim() || null }]);
        if (error) throw error;
      } else if (addOpen === "grades") {
        const { error } = await supabase
          .from("curriculum_grades")
          .insert([{ curriculum_id: curriculumId, name: name.trim() }]);
        if (error) throw error;
      } else if (addOpen === "subjects") {
        const { error } = await supabase.from("curriculum_subjects").insert([{
          grade_id: gradeId,
          subject_id: linkedSubjectId === "none" ? null : linkedSubjectId,
          name: name.trim(),
        }]);
        if (error) throw error;
      } else if (addOpen === "strands") {
        const { error } = await supabase
          .from("curriculum_strands")
          .insert([{ subject_id: subjectId, name: name.trim() }]);
        if (error) throw error;
      } else if (addOpen === "substrands") {
        const { error } = await supabase
          .from("curriculum_substrands")
          .insert([{ strand_id: strandId, name: name.trim() }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Added");
      const level = addOpen;
      setAddOpen(null);
      resetForm();
      if (level === "curricula") qc.invalidateQueries({ queryKey: ["learning-curricula"] });
      if (level === "grades") qc.invalidateQueries({ queryKey: ["learning-curriculum-grades", curriculumId] });
      if (level === "subjects") qc.invalidateQueries({ queryKey: ["learning-curriculum-subjects", gradeId] });
      if (level === "strands") qc.invalidateQueries({ queryKey: ["learning-curriculum-strands", subjectId] });
      if (level === "substrands") qc.invalidateQueries({ queryKey: ["learning-curriculum-substrands", strandId] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to add"),
  });

  const deleteRow = useMutation({
    mutationFn: async ({ table, id }: { table: string; id: string }) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      toast.success("Deleted");
      if (vars.table === "curricula") {
        qc.invalidateQueries({ queryKey: ["learning-curricula"] });
        if (curriculumId === vars.id) { setCurriculumId(null); setGradeId(null); setSubjectId(null); setStrandId(null); }
      }
      if (vars.table === "curriculum_grades") {
        qc.invalidateQueries({ queryKey: ["learning-curriculum-grades", curriculumId] });
        if (gradeId === vars.id) { setGradeId(null); setSubjectId(null); setStrandId(null); }
      }
      if (vars.table === "curriculum_subjects") {
        qc.invalidateQueries({ queryKey: ["learning-curriculum-subjects", gradeId] });
        if (subjectId === vars.id) { setSubjectId(null); setStrandId(null); }
      }
      if (vars.table === "curriculum_strands") {
        qc.invalidateQueries({ queryKey: ["learning-curriculum-strands", subjectId] });
        if (strandId === vars.id) setStrandId(null);
      }
      if (vars.table === "curriculum_substrands") {
        qc.invalidateQueries({ queryKey: ["learning-curriculum-substrands", strandId] });
      }
    },
    onError: (e: any) => toast.error(e.message || "Failed to delete — it may be in use by questions"),
  });

  // ── Shared list-panel renderer for each level ───────────────────────
  function LevelPanel({
    title,
    rows,
    loading,
    selectedId,
    onSelect,
    onAdd,
    table,
    emptyHint,
    renderExtra,
  }: {
    title: string;
    rows: { id: string; name: string }[] | undefined;
    loading: boolean;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onAdd: () => void;
    table: string;
    emptyHint: string;
    renderExtra?: (id: string) => React.ReactNode;
  }) {
    return (
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
            <Button size="sm" variant="outline" onClick={onAdd}>
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
                <div
                  key={r.id}
                  onClick={() => onSelect(r.id)}
                  className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm ${
                    selectedId === r.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/60"
                  }`}
                >
                  <span className="truncate flex-1">{r.name}</span>
                  {renderExtra?.(r.id)}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteRow.mutate({ table, id: r.id }); }}
                    className="opacity-0 group-hover:opacity-100"
                  >
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
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <BookOpen className="w-5 h-5" /> SmartDev Learning — Curriculum Builder
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Curriculum → Grade → Subject → Strand → Sub-strand. Sub-strands are what the Question Bank tags
            questions against.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/academics/learning-question-bank">
            <ChevronLeft className="w-4 h-4 mr-1" /> Question Bank
          </Link>
        </Button>
      </div>

      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <span className={!curriculumId ? "font-medium text-foreground" : ""}>Curricula</span>
        {selectedCurriculum && (
          <>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className={!gradeId ? "font-medium text-foreground" : ""}>{selectedCurriculum.name}</span>
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
          rows={curricula.data}
          loading={curricula.isLoading}
          selectedId={curriculumId}
          onSelect={(id) => { setCurriculumId(id); setGradeId(null); setSubjectId(null); setStrandId(null); }}
          onAdd={() => setAddOpen("curricula")}
          table="curricula"
          emptyHint="No curricula yet — e.g. 'CBC' or 'CBE'."
        />

        {curriculumId && (
          <LevelPanel
            title={`Grades in ${selectedCurriculum?.name}`}
            rows={grades.data}
            loading={grades.isLoading}
            selectedId={gradeId}
            onSelect={(id) => { setGradeId(id); setSubjectId(null); setStrandId(null); }}
            onAdd={() => setAddOpen("grades")}
            table="curriculum_grades"
            emptyHint="No grades yet — e.g. 'Grade 7'."
          />
        )}

        {gradeId && (
          <LevelPanel
            title={`Subjects in ${selectedGrade?.name}`}
            rows={subjects.data}
            loading={subjects.isLoading}
            selectedId={subjectId}
            onSelect={(id) => { setSubjectId(id); setStrandId(null); }}
            onAdd={() => setAddOpen("subjects")}
            table="curriculum_subjects"
            emptyHint="No subjects linked yet."
            renderExtra={(id) => {
              const row = subjects.data?.find((s) => s.id === id);
              return row?.subject_id ? <Badge variant="outline" className="text-[10px]">ERP-linked</Badge> : null;
            }}
          />
        )}

        {subjectId && (
          <LevelPanel
            title={`Strands in ${selectedSubject?.name}`}
            rows={strands.data}
            loading={strands.isLoading}
            selectedId={strandId}
            onSelect={(id) => setStrandId(id)}
            onAdd={() => setAddOpen("strands")}
            table="curriculum_strands"
            emptyHint="No strands yet — e.g. 'Numbers'."
          />
        )}

        {strandId && (
          <LevelPanel
            title={`Sub-strands in ${selectedStrand?.name}`}
            rows={substrands.data}
            loading={substrands.isLoading}
            selectedId={null}
            onSelect={() => {}}
            onAdd={() => setAddOpen("substrands")}
            table="curriculum_substrands"
            emptyHint="No sub-strands yet — e.g. 'Fractions'. These are what the Question Bank tags questions against."
          />
        )}
      </div>

      {/* ── Add dialog (shared shape, content varies by level) ────────── */}
      <Dialog open={!!addOpen} onOpenChange={(open) => { if (!open) { setAddOpen(null); resetForm(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {addOpen === "curricula" && "Add curriculum"}
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
            {addOpen === "subjects" && (
              <div>
                <Label>Link to existing ERP subject (optional)</Label>
                <Select value={linkedSubjectId} onValueChange={setLinkedSubjectId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None — not in ERP subjects yet</SelectItem>
                    {erpSubjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Linking lets the AI combine this subject's official ERP results with its Learning progress.
                </p>
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
