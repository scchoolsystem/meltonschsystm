import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Layers, Loader2, Plus, Trash2, ShieldCheck, Users, Check } from "lucide-react";
import { FeatureGate } from "@/components/FeatureGate";
import { useAuth } from "@/hooks/use-auth";
import { supabase, getSessionSafe } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveStudentOptions, bulkAssignOption } from "@/lib/subject-options.functions";
import {
  compulsorySubjects, groupsForClass, subjectsOfGroup, resolveStudentSubjects,
  type OptionData, type Enrolment,
} from "@/lib/subject-options";

export const Route = createFileRoute("/_app/academics/subject-options")({
  beforeLoad: async ({ location }) => {
    const { data, timedOut } = await getSessionSafe();
    if (timedOut) return;
    if (!data.session) throw redirect({ to: "/login", search: { redirect: location.pathname } });
  },
  component: () => (
    <FeatureGate feature="academics_subjects">
      <SubjectOptionsPage />
    </FeatureGate>
  ),
});

const classLabel = (c: any) => `${c.name ?? ""}${c.stream ? " " + c.stream : ""}`.trim();

function SubjectOptionsPage() {
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("principal") || hasRole("deputy_principal") || hasRole("academic_master") ||
    hasRole("exams_admin") || hasRole("school_admin");
  const qc = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());

  const { data: classes = [] } = useQuery({
    queryKey: ["so-classes"],
    queryFn: async () => (await supabase.from("classes").select("id,name,stream").order("name")).data ?? [],
  });
  const { data: opt, isLoading } = useQuery({
    queryKey: ["so-data"],
    queryFn: async (): Promise<OptionData> => {
      const [s, g, gc, gs] = await Promise.all([
        supabase.from("subjects").select("id,name,code").eq("is_examinable", true).order("name"),
        (supabase as any).from("subject_option_groups").select("id,name,pathway,pick_count").order("name"),
        (supabase as any).from("subject_option_group_classes").select("group_id,class_id"),
        (supabase as any).from("subject_option_group_subjects").select("group_id,subject_id"),
      ]);
      return { subjects: (s.data as any) ?? [], groups: g.data ?? [], groupClasses: gc.data ?? [], groupSubjects: gs.data ?? [] };
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["so-data"] }); qc.invalidateQueries({ queryKey: ["so-enrol"] }); };

  if (!can) {
    return (
      <div className="flex items-center justify-center h-64 p-6">
        <Card className="max-w-md w-full"><CardContent className="py-12 text-center space-y-3">
          <ShieldCheck className="w-12 h-12 mx-auto text-muted-foreground opacity-50" />
          <h2 className="font-semibold text-lg">Subject Options</h2>
          <p className="text-sm text-muted-foreground">Only admin or exams/academic staff can manage subject options.</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Layers className="w-5 h-5 text-primary" /></div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Subject Options</h1>
            <p className="text-sm text-muted-foreground">Compulsory and elective subjects. Set which classes choose, then record each student’s choice.</p>
          </div>
        </div>
        <div className="w-32">
          <Label className="text-xs mb-1.5 block">Academic year</Label>
          <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} />
        </div>
      </div>

      {isLoading || !opt ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <Tabs defaultValue="groups">
          <TabsList>
            <TabsTrigger value="groups" className="gap-1.5 text-xs"><Layers className="w-3.5 h-3.5" /> Option groups</TabsTrigger>
            <TabsTrigger value="enrol" className="gap-1.5 text-xs"><Users className="w-3.5 h-3.5" /> Student choices</TabsTrigger>
          </TabsList>
          <TabsContent value="groups" className="mt-4"><GroupsTab opt={opt} classes={classes as any[]} onChanged={refresh} /></TabsContent>
          <TabsContent value="enrol" className="mt-4"><EnrolTab opt={opt} classes={classes as any[]} year={year} onChanged={refresh} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ── Tab 1: define option groups ───────────────────────────────────────────────
function GroupsTab({ opt, classes, onChanged }: { opt: OptionData; classes: any[]; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [pathway, setPathway] = useState("");
  const [pick, setPick] = useState(1);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const toggle = (arr: string[], set: (v: string[]) => void, id: string) =>
    set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Give the group a name, e.g. “Technical option”.");
      if (classIds.length === 0) throw new Error("Select at least one class that can choose.");
      if (subjectIds.length < 2) throw new Error("Choose at least two subjects to pick between.");
      if (pick >= subjectIds.length) throw new Error("A student must pick fewer subjects than are on offer.");
      const { data: g, error } = await (supabase as any).from("subject_option_groups")
        .insert({ name: name.trim(), pathway: pathway.trim() || null, pick_count: pick }).select("id").single();
      if (error) throw new Error(error.message);
      const a = await (supabase as any).from("subject_option_group_classes").insert(classIds.map((class_id) => ({ group_id: g.id, class_id })));
      const b = await (supabase as any).from("subject_option_group_subjects").insert(subjectIds.map((subject_id) => ({ group_id: g.id, subject_id })));
      if (a.error || b.error) {
        await (supabase as any).from("subject_option_groups").delete().eq("id", g.id);
        throw new Error((a.error ?? b.error).message);
      }
    },
    onSuccess: () => { toast.success("Option group created"); setName(""); setPathway(""); setPick(1); setClassIds([]); setSubjectIds([]); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("subject_option_groups").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Group deleted (students’ choices in it were removed)"); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New option group</CardTitle>
          <CardDescription>
            Example: “Technical” — classes Form 1 and Form 2 — Computer or Music, pick 1. Or “Humanities” — Form 3 — History or Geography, pick 1.
            Subjects not offered by any group are compulsory for that class.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <div><Label className="text-xs mb-1.5 block">Group name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Technical option" /></div>
            <div><Label className="text-xs mb-1.5 block">Pathway (optional, for CBC)</Label><Input value={pathway} onChange={(e) => setPathway(e.target.value)} placeholder="STEM / Social Sciences / Arts & Sports" /></div>
            <div><Label className="text-xs mb-1.5 block">Subjects each student picks</Label><Input type="number" min={1} value={pick} onChange={(e) => setPick(Math.max(1, Number(e.target.value) || 1))} /></div>
          </div>
          <div>
            <Label className="text-xs mb-2 block">Classes that can choose</Label>
            <div className="flex flex-wrap gap-2">
              {classes.map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm cursor-pointer">
                  <Checkbox checked={classIds.includes(c.id)} onCheckedChange={() => toggle(classIds, setClassIds, c.id)} />{classLabel(c)}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs mb-2 block">Subjects on offer</Label>
            <div className="flex flex-wrap gap-2">
              {opt.subjects.map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm cursor-pointer">
                  <Checkbox checked={subjectIds.includes(s.id)} onCheckedChange={() => toggle(subjectIds, setSubjectIds, s.id)} />{s.name}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => create.mutate()} disabled={create.isPending} className="gap-1.5">
              {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create group
            </Button>
          </div>
        </CardContent>
      </Card>

      {opt.groups.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No option groups yet — every examinable subject is compulsory for every class.</p>
      ) : (
        <div className="space-y-3">
          {opt.groups.map((g) => {
            const cls = opt.groupClasses.filter((x) => x.group_id === g.id).map((x) => classes.find((c) => c.id === x.class_id)).filter(Boolean).map(classLabel);
            return (
              <Card key={g.id}><CardContent className="py-4 flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="font-medium flex items-center gap-2">{g.name}{g.pathway && <Badge variant="outline">{g.pathway}</Badge>}<Badge variant="secondary">pick {g.pick_count}</Badge></div>
                  <div className="text-sm text-muted-foreground">Subjects: {subjectsOfGroup(g.id, opt).map((s) => s.name).join(", ") || "—"}</div>
                  <div className="text-sm text-muted-foreground">Classes: {cls.join(", ") || "—"}</div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete “${g.name}”? Students’ choices in it will be removed.`)) remove.mutate(g.id); }}><Trash2 className="w-4 h-4" /></Button>
              </CardContent></Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tab 2: record student choices ─────────────────────────────────────────────
function EnrolTab({ opt, classes, year, onChanged }: { opt: OptionData; classes: any[]; year: number; onChanged: () => void }) {
  const [classId, setClassId] = useState("");
  const saveFn = useServerFn(saveStudentOptions);
  const bulkFn = useServerFn(bulkAssignOption);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string[]>>>({}); // studentId -> groupId -> subjectIds

  const groups = useMemo(() => (classId ? groupsForClass(classId, opt) : []), [classId, opt]);
  const compulsory = useMemo(() => (classId ? compulsorySubjects(classId, opt) : []), [classId, opt]);

  const { data: students = [] } = useQuery({
    queryKey: ["so-students", classId],
    enabled: !!classId,
    queryFn: async () => (await supabase.from("students").select("id,first_name,last_name,admission_no").eq("class_id", classId).eq("status", "active").order("first_name")).data ?? [],
  });
  const { data: enrolments = [] } = useQuery({
    queryKey: ["so-enrol", classId, year],
    enabled: !!classId && students.length > 0,
    queryFn: async () => ((await (supabase as any).from("student_subjects").select("student_id,subject_id,group_id")
      .eq("academic_year", year).in("student_id", (students as any[]).map((s) => s.id))).data ?? []) as Enrolment[],
  });

  const current = (studentId: string, groupId: string): string[] => {
    if (drafts[studentId]?.[groupId]) return drafts[studentId][groupId];
    const offered = new Set(subjectsOfGroup(groupId, opt).map((s) => s.id));
    return enrolments.filter((e) => e.student_id === studentId && offered.has(e.subject_id)).map((e) => e.subject_id);
  };
  const setChoice = (studentId: string, g: { id: string; pick_count: number }, subjectId: string) => {
    const cur = current(studentId, g.id);
    let next: string[];
    if (g.pick_count === 1) next = cur.includes(subjectId) ? [] : [subjectId];
    else next = cur.includes(subjectId) ? cur.filter((x) => x !== subjectId) : cur.length < g.pick_count ? [...cur, subjectId] : cur;
    setDrafts((d) => ({ ...d, [studentId]: { ...(d[studentId] ?? {}), [g.id]: next } }));
  };

  const save = useMutation({
    mutationFn: async (studentId: string) => {
      const d = drafts[studentId] ?? {};
      const choices = groups.map((g) => ({ groupId: g.id, subjectIds: d[g.id] ?? current(studentId, g.id) }));
      return saveFn({ data: { studentId, academicYear: year, choices } });
    },
    onSuccess: (_r, studentId) => {
      setDrafts((d) => { const n = { ...d }; delete n[studentId]; return n; });
      toast.success("Saved"); onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const bulk = useMutation({
    mutationFn: (v: { groupId: string; subjectId: string }) => bulkFn({ data: { classId, academicYear: year, ...v } }),
    onSuccess: (r: any) => { setDrafts({}); toast.success(`Assigned ${r.assigned}${r.skipped ? `, ${r.skipped} already full` : ""}`); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const pendingCount = (students as any[]).filter((s) =>
    resolveStudentSubjects(s.id, classId, opt, enrolments).pending.length > 0).length;

  return (
    <div className="space-y-4">
      <Card><CardContent className="pt-6 max-w-sm">
        <Label className="text-xs mb-1.5 block">Class</Label>
        <Select value={classId} onValueChange={(v) => { setClassId(v); setDrafts({}); }}>
          <SelectTrigger><SelectValue placeholder="Select a class" /></SelectTrigger>
          <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{classLabel(c)}</SelectItem>)}</SelectContent>
        </Select>
      </CardContent></Card>

      {classId && (
        <>
          <Card><CardContent className="py-4 text-sm space-y-1">
            <div><span className="text-muted-foreground">Compulsory for everyone: </span>{compulsory.map((s) => s.name).join(", ") || "—"}</div>
            {groups.length === 0 && <div className="text-muted-foreground">No elective choices for this class.</div>}
          </CardContent></Card>

          {groups.length > 0 && (
            <>
              {pendingCount > 0 && <Badge variant="secondary">{pendingCount} student(s) still to choose</Badge>}
              {groups.map((g) => (
                <Card key={g.id}><CardContent className="py-3 flex items-center gap-2 flex-wrap text-sm">
                  <span className="font-medium">{g.name}</span><span className="text-muted-foreground">— everyone takes:</span>
                  {subjectsOfGroup(g.id, opt).map((s) => (
                    <Button key={s.id} size="sm" variant="outline" disabled={bulk.isPending}
                      onClick={() => { if (confirm(`Put the whole class in ${s.name}?`)) bulk.mutate({ groupId: g.id, subjectId: s.id }); }}>{s.name}</Button>
                  ))}
                </CardContent></Card>
              ))}

              <Card><CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/40 text-left">
                    <th className="p-3">Student</th>
                    {groups.map((g) => <th key={g.id} className="p-3">{g.name} <span className="text-xs text-muted-foreground">(pick {g.pick_count})</span></th>)}
                    <th className="p-3" />
                  </tr></thead>
                  <tbody>
                    {(students as any[]).map((s) => (
                      <tr key={s.id} className="border-b align-top">
                        <td className="p-3 whitespace-nowrap">{s.first_name} {s.last_name}<div className="text-xs text-muted-foreground">{s.admission_no}</div></td>
                        {groups.map((g) => (
                          <td key={g.id} className="p-3">
                            <div className="flex flex-wrap gap-1.5">
                              {subjectsOfGroup(g.id, opt).map((sub) => {
                                const on = current(s.id, g.id).includes(sub.id);
                                return (
                                  <button key={sub.id} type="button" onClick={() => setChoice(s.id, g, sub.id)}
                                    className={`px-2 py-1 rounded-md border text-xs ${on ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                                    {on && <Check className="inline w-3 h-3 mr-1" />}{sub.name}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                        ))}
                        <td className="p-3 text-right">
                          <Button size="sm" disabled={!drafts[s.id] || save.isPending} onClick={() => save.mutate(s.id)}>Save</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent></Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
