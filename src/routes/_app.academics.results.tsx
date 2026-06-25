import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useTeacherScope } from "@/hooks/use-teacher-scope";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from "recharts";
import { Plus, Loader2, Star, Pencil, CheckCircle2, UserSearch, TrendingUp, TrendingDown, AlertTriangle, BarChart3 } from "lucide-react";
import { StudentRouteGuard } from "@/components/security/StudentRouteGuard";

export const Route = createFileRoute("/_app/academics/results")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: ResultsGuard,
});

function ResultsGuard() {
  const { roles, rolesLoaded } = useAuth();
  if (!rolesLoaded) return null;

  // Pure student — redirect to their portal
  const pureStudent = roles.length === 1 && (roles as any[]).includes("student");
  if (pureStudent) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-6">
        <Card className="max-w-sm w-full">
          <CardContent className="py-10 text-center space-y-4">
            <BarChart3 className="w-10 h-10 mx-auto text-primary opacity-70" />
            <h2 className="font-semibold text-lg">Your Results Are in My Portal</h2>
            <p className="text-sm text-muted-foreground">
              Academic results, analytics, and report cards are available in your personal portal.
            </p>
            <Link to="/portal/student">
              <Button className="mt-2 w-full">Go to My Portal</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <Page />;
}

// ── Grade helpers ────────────────────────────────────────────────────────────
async function resolveGrade(score: number, subjectId: string): Promise<string> {
  try {
    const { data: schoolId } = await supabase.rpc("current_user_school");
    if (!schoolId) return fallbackGrade(score);
    const { data } = await supabase.rpc("grade_for", {
      p_school_id: schoolId as string,
      p_score: score,
      p_subject_id: subjectId,
    });
    return (data as any)?.[0]?.grade ?? fallbackGrade(score);
  } catch {
    return fallbackGrade(score);
  }
}

function fallbackGrade(s: number) {
  if (s >= 80) return "A";  if (s >= 75) return "A-"; if (s >= 70) return "B+";
  if (s >= 65) return "B";  if (s >= 60) return "B-"; if (s >= 55) return "C+";
  if (s >= 50) return "C";  if (s >= 45) return "C-"; if (s >= 40) return "D+";
  if (s >= 35) return "D";  if (s >= 30) return "D-"; return "E";
}

function gradeColor(g: string) {
  if (["A","A-"].includes(g)) return "text-emerald-600";
  if (["B+","B","B-"].includes(g)) return "text-blue-600";
  if (["C+","C","C-"].includes(g)) return "text-amber-600";
  return "text-red-600";
}

function classLabel(c?: { name?: string | null; stream?: string | null } | null) {
  if (!c) return "—";
  return `${c.name ?? ""}${c.stream ? " " + c.stream : ""}`.trim() || "—";
}

const GRADE_COLORS: Record<string, string> = {
  "A": "#16a34a", "A-": "#22c55e",
  "B+": "#2563eb", "B": "#3b82f6", "B-": "#60a5fa",
  "C+": "#d97706", "C": "#f59e0b", "C-": "#fbbf24",
  "D+": "#dc2626", "D": "#ef4444", "D-": "#f87171",
  "E": "#7c3aed",
};

// ── Main page ────────────────────────────────────────────────────────────────
function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const { isTeacherScoped, classIds, allSubjectIds } = useTeacherScope();
  const can = isAdmin || hasRole("teacher") || hasRole("exams_admin") || hasRole("academic_master");

  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [filterExam, setFilterExam]     = useState<string>("all");
  const [filterSubject, setFilterSubject] = useState<string>("all");
  const [filterClass, setFilterClass]   = useState<string>("all");
  const [search, setSearch]   = useState("");
  const [activeTab, setActiveTab] = useState("results");

  // ── Scoped student IDs (teacher-scoped access) ─────────────────────────
  const { data: scopedStudentIds = [] } = useQuery({
    queryKey: ["results-scope-students", classIds.join(",")],
    enabled: isTeacherScoped,
    queryFn: async () => {
      if (classIds.length === 0) return [];
      const { data } = await supabase.from("students").select("id").in("class_id", classIds);
      return (data ?? []).map((s: any) => s.id);
    },
  });

  // ── Results data ───────────────────────────────────────────────────────
  const { data = [], isLoading } = useQuery({
    queryKey: ["exam_results", isTeacherScoped, scopedStudentIds.length, allSubjectIds.join(",")],
    queryFn: async () => {
      let q = supabase
        .from("exam_results")
        .select(
          "id,score,grade,verified,remarks,exam_id,student_id,subject_id," +
          "exams(name,term,year),students(first_name,last_name,admission_no,classes(name,stream))," +
          "subjects(code,name)"
        )
        .order("created_at", { ascending: false })
        .limit(500);

      if (isTeacherScoped) {
        if (scopedStudentIds.length === 0) return [];
        q = q.in("student_id", scopedStudentIds).in("subject_id", allSubjectIds);
      }
      return (await q).data ?? [];
    },
  });

  const { data: exams = [] } = useQuery({
    queryKey: ["exams-list"],
    queryFn: async () => (await supabase.from("exams").select("id,name,term,year").order("start_date", { ascending: false })).data ?? [],
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects-list"],
    queryFn: async () => (await supabase.from("subjects").select("id,name,code")).data ?? [],
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["classes-list"],
    queryFn: async () => (await supabase.from("classes").select("id,name,stream")).data ?? [],
  });

  // ── Filtered results ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return (data as any[]).filter((r) => {
      if (filterExam    !== "all" && r.exam_id    !== filterExam)    return false;
      if (filterSubject !== "all" && r.subject_id !== filterSubject) return false;
      if (filterClass   !== "all") {
        const classId = (r.students as any)?.class_id;
        if (classId !== filterClass) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const name = `${r.students?.first_name ?? ""} ${r.students?.last_name ?? ""}`.toLowerCase();
        const adm  = (r.students?.admission_no ?? "").toLowerCase();
        if (!name.includes(q) && !adm.includes(q)) return false;
      }
      return true;
    });
  }, [data, filterExam, filterSubject, filterClass, search]);

  // ── Analytics ──────────────────────────────────────────────────────────
  const gradeDistribution = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (const r of filtered) {
      const g = (r as any).grade ?? fallbackGrade(Number((r as any).score));
      buckets[g] = (buckets[g] ?? 0) + 1;
    }
    return Object.entries(buckets)
      .map(([grade, count]) => ({ grade, count }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  const subjectAverages = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    for (const r of filtered) {
      const id   = (r as any).subject_id;
      const name = (r as any).subjects?.name ?? id;
      if (!map.has(id)) map.set(id, { name, total: 0, count: 0 });
      const e = map.get(id)!;
      e.total += Number((r as any).score);
      e.count++;
    }
    return Array.from(map.values())
      .map((s) => ({ name: s.name, avg: Math.round(s.total / s.count) }))
      .sort((a, b) => b.avg - a.avg);
  }, [filtered]);

  const riskStudents = useMemo(() => {
    // Students with average below 40 across filtered results
    const map = new Map<string, { name: string; adm: string; total: number; count: number }>();
    for (const r of filtered) {
      const id   = (r as any).student_id;
      const name = `${(r as any).students?.first_name ?? ""} ${(r as any).students?.last_name ?? ""}`.trim();
      const adm  = (r as any).students?.admission_no ?? "";
      if (!map.has(id)) map.set(id, { name, adm, total: 0, count: 0 });
      const s = map.get(id)!;
      s.total += Number((r as any).score);
      s.count++;
    }
    return Array.from(map.values())
      .map((s) => ({ ...s, avg: Math.round(s.total / s.count) }))
      .filter((s) => s.avg < 40)
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 10);
  }, [filtered]);

  const overallAvg = useMemo(() =>
    filtered.length ? Math.round(filtered.reduce((a, r) => a + Number((r as any).score), 0) / filtered.length) : null,
    [filtered]
  );

  const passRate = useMemo(() => {
    if (!filtered.length) return null;
    const pass = filtered.filter((r) => Number((r as any).score) >= 40).length;
    return Math.round((pass / filtered.length) * 100);
  }, [filtered]);

  // ── Mark entry form ────────────────────────────────────────────────────
  const { data: students = [] } = useQuery({
    queryKey: ["students-lite"],
    queryFn: async () => {
      let q = supabase.from("students").select("id,first_name,last_name,admission_no");
      if (isTeacherScoped && scopedStudentIds.length > 0)
        q = q.in("id", scopedStudentIds);
      return (await q.limit(200)).data ?? [];
    },
  });

  const [form, setForm] = useState({
    student_id: "", exam_id: "", subject_id: "",
    score: "", remarks: "", verified: false,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const score = Number(form.score);
      const grade = await resolveGrade(score, form.subject_id);
      const payload = {
        student_id: form.student_id,
        exam_id: form.exam_id,
        subject_id: form.subject_id,
        score,
        grade,
        remarks: form.remarks || null,
        verified: form.verified,
      };
      if (editing) {
        const { error } = await supabase.from("exam_results").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("exam_results").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exam_results"] });
      toast.success(editing ? "Result updated" : "Result saved");
      setOpen(false);
      setEditing(null);
      setForm({ student_id: "", exam_id: "", subject_id: "", score: "", remarks: "", verified: false });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function openEdit(r: any) {
    setEditing(r);
    setForm({
      student_id: r.student_id,
      exam_id: r.exam_id,
      subject_id: r.subject_id,
      score: String(r.score),
      remarks: r.remarks ?? "",
      verified: r.verified ?? false,
    });
    setOpen(true);
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Block hidden — students are already redirected above */}
      <StudentRouteGuard />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Academic Results</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} results</p>
        </div>
        {can && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => { setEditing(null); setForm({ student_id: "", exam_id: "", subject_id: "", score: "", remarks: "", verified: false }); }}>
                <Plus className="w-4 h-4 mr-1" /> Add Result
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Result</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                {[
                  { label: "Student", field: "student_id", items: students, labelFn: (s: any) => `${s.first_name} ${s.last_name} (${s.admission_no})` },
                  { label: "Exam",    field: "exam_id",    items: exams,    labelFn: (e: any) => `${e.name} — ${e.term} ${e.year}` },
                  { label: "Subject", field: "subject_id", items: subjects, labelFn: (s: any) => `${s.name} ${s.code ? "(" + s.code + ")" : ""}` },
                ].map(({ label, field, items, labelFn }) => (
                  <div key={field} className="space-y-1">
                    <Label>{label}</Label>
                    <Select value={(form as any)[field]} onValueChange={(v) => setForm((f) => ({ ...f, [field]: v }))}>
                      <SelectTrigger><SelectValue placeholder={`Select ${label}`} /></SelectTrigger>
                      <SelectContent>
                        {(items as any[]).map((it) => (
                          <SelectItem key={it.id} value={it.id}>{labelFn(it)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                <div className="space-y-1">
                  <Label>Score (0–100)</Label>
                  <Input type="number" min={0} max={100} value={form.score}
                    onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Remarks</Label>
                  <Textarea rows={2} value={form.remarks}
                    onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.verified}
                    onChange={(e) => setForm((f) => ({ ...f, verified: e.target.checked }))} />
                  Mark as verified
                </label>
              </div>
              <DialogFooter>
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.student_id || !form.exam_id || !form.subject_id || !form.score}>
                  {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  {editing ? "Update" : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* ── Analytics KPI row ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Results", value: filtered.length.toString(), icon: <BarChart3 className="w-4 h-4" />, color: "text-indigo-600" },
          { label: "Class Average",  value: overallAvg !== null ? `${overallAvg}%` : "—", icon: <TrendingUp className="w-4 h-4" />, color: "text-emerald-600" },
          { label: "Pass Rate",      value: passRate !== null ? `${passRate}%` : "—", icon: <CheckCircle2 className="w-4 h-4" />, color: passRate !== null && passRate >= 70 ? "text-emerald-600" : "text-amber-600" },
          { label: "At-Risk Students", value: riskStudents.length.toString(), icon: <AlertTriangle className="w-4 h-4" />, color: "text-red-500" },
        ].map(({ label, value, icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted/50 ${color}`}>{icon}</div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-bold">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Filters ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Exam</Label>
          <Select value={filterExam} onValueChange={setFilterExam}>
            <SelectTrigger className="w-48 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Exams</SelectItem>
              {(exams as any[]).map((e) => <SelectItem key={e.id} value={e.id}>{e.name} — {e.term}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Subject</Label>
          <Select value={filterSubject} onValueChange={setFilterSubject}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subjects</SelectItem>
              {(subjects as any[]).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Search student</Label>
          <div className="relative">
            <UserSearch className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-7 h-8 text-xs w-44" placeholder="Name / adm no"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        {(filterExam !== "all" || filterSubject !== "all" || search) && (
          <Button size="sm" variant="ghost" className="h-8 text-xs"
            onClick={() => { setFilterExam("all"); setFilterSubject("all"); setSearch(""); }}>
            Clear
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-auto">
          <TabsTrigger value="results" className="text-xs">Results Table</TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs">Analytics</TabsTrigger>
          {riskStudents.length > 0 && (
            <TabsTrigger value="risk" className="text-xs text-destructive">
              <AlertTriangle className="w-3 h-3 mr-1" /> At Risk ({riskStudents.length})
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── Results table ────────────────────────────────────────────── */}
        <TabsContent value="results" className="mt-3">
          {isLoading ? (
            <div className="h-40 grid place-items-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="h-40 grid place-items-center text-sm text-muted-foreground">No results found.</div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Exam</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-center">Grade</TableHead>
                    <TableHead className="text-center">Progress</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    {can && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 200).map((r: any) => {
                    const g   = r.grade ?? fallbackGrade(r.score);
                    const gc  = gradeColor(g);
                    return (
                      <TableRow key={r.id} className="text-sm">
                        <TableCell className="font-medium">
                          {r.students?.first_name} {r.students?.last_name}
                          <br />
                          <span className="text-[10px] text-muted-foreground font-mono">{r.students?.admission_no}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{classLabel(r.students?.classes)}</TableCell>
                        <TableCell className="text-xs">{r.exams?.name}<br /><span className="text-muted-foreground">{r.exams?.term} {r.exams?.year}</span></TableCell>
                        <TableCell className="text-xs">{r.subjects?.name}<br /><span className="text-muted-foreground font-mono text-[10px]">{r.subjects?.code}</span></TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{r.score}</TableCell>
                        <TableCell className="text-center">
                          <span className={`font-bold text-sm ${gc}`}>{g}</span>
                        </TableCell>
                        <TableCell className="min-w-[80px]">
                          <Progress value={r.score} max={100} className="h-1.5" />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{r.remarks || "—"}</TableCell>
                        <TableCell className="text-center">
                          {r.verified
                            ? <Badge className="bg-emerald-600 text-[10px] py-0"><CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />Verified</Badge>
                            : <Badge variant="outline" className="text-[10px] py-0">Pending</Badge>}
                        </TableCell>
                        {can && (
                          <TableCell>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {filtered.length > 200 && (
                <p className="text-xs text-center text-muted-foreground py-2">
                  Showing 200 of {filtered.length}. Use filters to narrow down.
                </p>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── Analytics tab ────────────────────────────────────────────── */}
        <TabsContent value="analytics" className="mt-3 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Grade distribution */}
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" /> Grade Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={gradeDistribution} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                    <XAxis dataKey="grade" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]} name="Students">
                      {gradeDistribution.map((d, i) => (
                        <Cell key={i} fill={GRADE_COLORS[d.grade] ?? "#6366f1"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Subject averages */}
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" /> Subject Averages
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {subjectAverages.slice(0, 8).map((s) => (
                  <div key={s.name} className="flex items-center gap-3 text-sm">
                    <span className="w-32 truncate text-xs text-muted-foreground">{s.name}</span>
                    <Progress value={s.avg} max={100} className="flex-1 h-2" />
                    <span className="w-10 text-right font-semibold text-xs">{s.avg}%</span>
                    <span className={`w-6 text-xs font-bold ${gradeColor(fallbackGrade(s.avg))}`}>
                      {fallbackGrade(s.avg)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── At-risk tab ──────────────────────────────────────────────── */}
        {riskStudents.length > 0 && (
          <TabsContent value="risk" className="mt-3">
            <Card className="border-destructive/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-4 h-4" /> Students At Risk (average below 40%)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {riskStudents.map((s, i) => (
                    <div key={i} className="flex items-center gap-4 text-sm p-2 rounded-lg bg-destructive/5 border border-destructive/20">
                      <span className="font-medium flex-1">{s.name}</span>
                      <span className="text-xs text-muted-foreground font-mono">{s.adm}</span>
                      <div className="w-24">
                        <Progress value={s.avg} max={100} className="h-1.5" />
                      </div>
                      <span className="font-bold text-destructive w-10 text-right">{s.avg}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// ── GRADE_COLORS for Bar chart cells ────────────────────────────────────────
const GRADE_COLORS: Record<string, string> = {
  "A": "#16a34a", "A-": "#22c55e",
  "B+": "#2563eb", "B": "#3b82f6", "B-": "#60a5fa",
  "C+": "#d97706", "C": "#f59e0b", "C-": "#fbbf24",
  "D+": "#dc2626", "D": "#ef4444", "D-": "#f87171",
  "E": "#7c3aed",
};
