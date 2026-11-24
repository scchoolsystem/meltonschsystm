/**
 * MarksEntryPanel — bulk score entry grid.
 *
 * Pick exam + class + subject, type scores down the list (Enter moves to the
 * next student). Grades are auto-resolved from the school's grading scale.
 * Rows save on blur; "Save all" saves every changed row; "Import" accepts a
 * CSV/TSV file or pasted Excel columns (admission_no, score).
 *
 * Writes to exam_results via upsert on (exam_id, student_id, subject_id) —
 * the unique index `exam_results_unique_entry`. `verified` is never touched.
 */
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save, Upload, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { fallbackGrade } from "@/lib/grade-utils";

async function resolveGrade(score: number, subjectId: string, classId: string, schoolId: string | null): Promise<string> {
  try {
    if (!schoolId) return fallbackGrade(score);
    const { data: cg, error } = await (supabase as any).rpc("grade_for_class", {
      p_school_id: schoolId, p_score: score, p_subject_id: subjectId, p_class_id: classId,
    });
    if (!error && cg?.[0]?.grade) return cg[0].grade as string;
    const { data } = await supabase.rpc("grade_for", { p_school_id: schoolId, p_score: score, p_subject_id: subjectId });
    return (data as any)?.[0]?.grade ?? fallbackGrade(score);
  } catch {
    return fallbackGrade(score);
  }
}

/** Parse "admission_no,score" rows from CSV / TSV / pasted Excel. */
function parseRows(text: string): { adm: string; score: string }[] {
  const out: { adm: string; score: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = line.split(/\t|,|;/).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cells.length < 2) continue;
    const adm = cells[0];
    const score = cells[cells.length - 1];
    if (/adm|admission|reg/i.test(adm) && /score|mark/i.test(score)) continue; // header
    out.push({ adm, score });
  }
  return out;
}

export function MarksEntryPanel({
  isTeacherScoped, classIds, subjectIdsByClass, allSubjectIds,
}: {
  isTeacherScoped: boolean;
  classIds: string[];
  subjectIdsByClass: Record<string, string[]>;
  allSubjectIds: string[];
}) {
  const qc = useQueryClient();
  const [examId, setExamId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: schoolId = null } = useQuery({
    queryKey: ["marks-entry-school"],
    queryFn: async () => ((await supabase.rpc("current_user_school")).data as string | null) ?? null,
  });

  const { data: exams = [] } = useQuery({
    queryKey: ["marks-entry-exams"],
    queryFn: async () => (await supabase.from("exams").select("id,name,term,year").order("year", { ascending: false })).data ?? [],
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["marks-entry-classes", isTeacherScoped, classIds.join(",")],
    queryFn: async () => {
      let q = supabase.from("classes").select("id,name,stream").order("name");
      if (isTeacherScoped) {
        if (classIds.length === 0) return [];
        q = q.in("id", classIds);
      }
      return (await q).data ?? [];
    },
  });

  const subjectFilter = useMemo(() => {
    if (!isTeacherScoped) return null;
    if (classId) return subjectIdsByClass[classId] ?? [];
    return allSubjectIds;
  }, [isTeacherScoped, classId, subjectIdsByClass, allSubjectIds]);

  const { data: subjects = [] } = useQuery({
    queryKey: ["marks-entry-subjects", (subjectFilter ?? ["all"]).join(",")],
    queryFn: async () => {
      let q = supabase.from("subjects").select("id,name,code").order("name");
      if (subjectFilter) {
        if (subjectFilter.length === 0) return [];
        q = q.in("id", subjectFilter);
      }
      return (await q).data ?? [];
    },
  });

  const { data: students = [], isLoading: loadingStudents } = useQuery({
    queryKey: ["marks-entry-students", classId],
    enabled: !!classId,
    queryFn: async () =>
      (await supabase.from("students").select("id,first_name,last_name,admission_no")
        .eq("class_id", classId).eq("status", "active").order("last_name")).data ?? [],
  });

  const { data: existing = [] } = useQuery({
    queryKey: ["marks-entry-existing", examId, subjectId, classId],
    enabled: !!(examId && subjectId && classId),
    queryFn: async () =>
      (await supabase.from("exam_results").select("student_id,score,grade,verified")
        .eq("exam_id", examId).eq("subject_id", subjectId)).data ?? [],
  });

  const existingMap = useMemo(
    () => Object.fromEntries((existing as any[]).map((r) => [r.student_id, r])), [existing],
  );
  const valueOf = (id: string) => drafts[id] ?? (existingMap[id]?.score != null ? String(existingMap[id].score) : "");
  const isDirty = (id: string) => drafts[id] !== undefined && drafts[id] !== (existingMap[id]?.score != null ? String(existingMap[id].score) : "");
  const invalid = (v: string) => v !== "" && (isNaN(Number(v)) || Number(v) < 0 || Number(v) > 100);

  async function saveRows(ids: string[]) {
    if (!examId || !subjectId || !classId) return;
    const rows: any[] = [];
    for (const id of ids) {
      const v = valueOf(id);
      if (v === "" || invalid(v)) continue;
      const score = Number(v);
      rows.push({
        exam_id: examId, subject_id: subjectId, student_id: id, score,
        grade: await resolveGrade(score, subjectId, classId, schoolId),
      });
    }
    if (rows.length === 0) return 0;
    setSaving((s) => new Set([...s, ...rows.map((r) => r.student_id)]));
    try {
      const { error } = await supabase.from("exam_results").upsert(rows, { onConflict: "exam_id,student_id,subject_id" });
      if (error) throw error;
      setDrafts((d) => { const n = { ...d }; rows.forEach((r) => delete n[r.student_id]); return n; });
      await qc.invalidateQueries({ queryKey: ["marks-entry-existing"] });
      qc.invalidateQueries({ queryKey: ["exam_results"] });
      return rows.length;
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
      return 0;
    } finally {
      setSaving((s) => { const n = new Set(s); rows.forEach((r) => n.delete(r.student_id)); return n; });
    }
  }

  async function saveAll() {
    const ids = (students as any[]).filter((s) => isDirty(s.id)).map((s) => s.id);
    if (ids.length === 0) return toast.info("Nothing to save");
    const n = await saveRows(ids);
    if (n) toast.success(`Saved ${n} mark${n === 1 ? "" : "s"}`);
  }

  function applyImport(text: string) {
    const rows = parseRows(text);
    const byAdm = new Map((students as any[]).map((s) => [String(s.admission_no).trim().toLowerCase(), s.id]));
    const next: Record<string, string> = {};
    const unmatched: string[] = [];
    let bad = 0;
    for (const r of rows) {
      const id = byAdm.get(r.adm.toLowerCase());
      if (!id) { unmatched.push(r.adm); continue; }
      if (invalid(r.score) || r.score === "") { bad++; continue; }
      next[id] = r.score;
    }
    setDrafts((d) => ({ ...d, ...next }));
    setImportOpen(false);
    setPasted("");
    const n = Object.keys(next).length;
    toast.success(`${n} mark${n === 1 ? "" : "s"} loaded — review, then press Save all`);
    if (unmatched.length) toast.warning(`Not in this class: ${unmatched.slice(0, 6).join(", ")}${unmatched.length > 6 ? ` +${unmatched.length - 6} more` : ""}`);
    if (bad) toast.warning(`${bad} row(s) skipped (score must be 0–100)`);
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    applyImport(await f.text());
  }

  const ready = !!(examId && classId && subjectId);
  const dirtyCount = (students as any[]).filter((s) => isDirty(s.id)).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[180px]">
              <Select value={examId} onValueChange={setExamId}>
                <SelectTrigger><SelectValue placeholder="Select exam" /></SelectTrigger>
                <SelectContent>{(exams as any[]).map((e) => <SelectItem key={e.id} value={e.id}>{e.name} — {e.term} {e.year}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <Select value={classId} onValueChange={(v) => { setClassId(v); setSubjectId(""); setDrafts({}); }}>
                <SelectTrigger><SelectValue placeholder={isTeacherScoped && (classes as any[]).length === 0 ? "No classes assigned" : "Select class"} /></SelectTrigger>
                <SelectContent>{(classes as any[]).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.stream ? ` ${c.stream}` : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <Select value={subjectId} onValueChange={(v) => { setSubjectId(v); setDrafts({}); }} disabled={!classId}>
                <SelectTrigger><SelectValue placeholder={!classId ? "Pick a class first" : (subjects as any[]).length === 0 ? "No subjects assigned" : "Select subject"} /></SelectTrigger>
                <SelectContent>{(subjects as any[]).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button variant="outline" disabled={!ready} onClick={() => setImportOpen(true)}><Upload className="w-4 h-4 mr-2" />Import</Button>
            <Button disabled={!ready || dirtyCount === 0} onClick={saveAll}><Save className="w-4 h-4 mr-2" />Save all{dirtyCount ? ` (${dirtyCount})` : ""}</Button>
          </div>
        </CardContent>
      </Card>

      {!ready ? (
        <p className="text-center text-muted-foreground py-12 text-sm">Select an exam, class and subject to start entering marks.</p>
      ) : loadingStudents ? (
        <div className="h-40 grid place-items-center"><Loader2 className="animate-spin" /></div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Adm No</TableHead>
                  <TableHead className="w-32">Score (0–100)</TableHead>
                  <TableHead className="w-20">Grade</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(students as any[]).length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No active students in this class.</TableCell></TableRow>
                )}
                {(students as any[]).map((s, i, arr) => {
                  const v = valueOf(s.id);
                  const ex = existingMap[s.id];
                  const dirty = isDirty(s.id);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{s.first_name} {s.last_name}</TableCell>
                      <TableCell className="font-mono text-xs">{s.admission_no}</TableCell>
                      <TableCell>
                        <Input
                          ref={(el) => { inputRefs.current[s.id] = el; }}
                          type="number" inputMode="decimal" min={0} max={100} step="0.01"
                          value={v}
                          className={invalid(v) ? "border-destructive" : ""}
                          onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                          onBlur={() => { if (isDirty(s.id)) saveRows([s.id]); }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              inputRefs.current[arr[i + 1]?.id]?.focus();
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-bold">{dirty ? "" : ex?.grade ?? ""}</TableCell>
                      <TableCell>
                        {saving.has(s.id) ? <Loader2 className="w-4 h-4 animate-spin" />
                          : invalid(v) ? <Badge variant="destructive">Invalid</Badge>
                          : dirty ? <Badge variant="outline">Unsaved</Badge>
                          : ex ? (ex.verified ? <Badge className="bg-green-600">Verified</Badge> : <Badge variant="secondary"><Check className="w-3 h-3 mr-1" />Saved</Badge>)
                          : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Import marks</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Two columns: <b>admission number</b> and <b>score</b>. Upload a CSV (in Excel: Save As → CSV) or paste the two columns straight from Excel. Marks load into the grid for you to review before saving.
            </p>
            <Input type="file" accept=".csv,.tsv,.txt" onChange={(e) => onFile(e.target.files?.[0])} />
            <Textarea rows={6} placeholder={"1001\t78\n1002\t64"} value={pasted} onChange={(e) => setPasted(e.target.value)} />
          </div>
          <DialogFooter><Button disabled={!pasted.trim()} onClick={() => applyImport(pasted)}>Load pasted marks</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
