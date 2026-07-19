/**
 * _app.academics.subjects.tsx — Subjects (v2)
 *
 * Upgrades over v1:
 *  • Search + level filter
 *  • Edit subject (name, code, level, lessons_per_week, allow_double_period, preferred_time_of_day)
 *  • Teacher assignment — manage teacher_subjects rows inline
 *  • Per-subject stats: teacher count, timetable slot count, exam result avg/pass rate
 *  • KPI strip at top
 *  • Card view + table view toggle
 *  • Full add dialog with all columns
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useTeacherScope } from "@/hooks/use-teacher-scope";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { fadeUp, stagger } from "@/components/motion-variants";
import { AnimatedNumber } from "@/components/portal-shared";
import {
  Plus, Loader2, Search, BookOpen, Users, BarChart3,
  MoreVertical, Pencil, Trash2, LayoutGrid, List,
  UserPlus, X, Clock, CalendarDays, CheckCircle2,
  GraduationCap, ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/_app/academics/subjects")({
  component: () => (
    <FeatureGate feature="academics_subjects">
      <Page />
    </FeatureGate>
  ),
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface Subject {
  id: string; code: string; name: string; level: string;
  lessons_per_week: number; allow_double_period: boolean;
  preferred_time_of_day: string; school_id: string; created_at: string;
}

const LEVELS = ["primary", "secondary", "both"] as const;
const TIMES  = ["morning", "afternoon", "any"] as const;

const BLANK_FORM = {
  code: "", name: "", level: "secondary",
  lessons_per_week: 5, allow_double_period: false, preferred_time_of_day: "any",
};

function fallbackGrade(s: number) {
  if (s >= 80) return "A"; if (s >= 75) return "A-"; if (s >= 70) return "B+";
  if (s >= 65) return "B"; if (s >= 60) return "B-"; if (s >= 55) return "C+";
  if (s >= 50) return "C"; if (s >= 45) return "C-"; if (s >= 40) return "D+";
  return s >= 35 ? "D" : s >= 30 ? "D-" : "E";
}

// ── KPI box ───────────────────────────────────────────────────────────────────

function KpiBox({ label, value, icon, color = "indigo" }: {
  label: string; value: number | string; icon: React.ReactNode; color?: string;
}) {
  const c: Record<string, string> = {
    indigo:  "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600",
    emerald: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600",
    amber:   "bg-amber-50 dark:bg-amber-950/30 text-amber-600",
    blue:    "bg-blue-50 dark:bg-blue-950/30 text-blue-600",
  };
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show">
      <Card className="border-0 shadow-sm ring-1 ring-border/50">
        <CardContent className="p-4 flex items-center gap-3">
          <div className={`p-2.5 rounded-xl shrink-0 ${c[color]}`}>{icon}</div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold leading-none mt-0.5 tabular-nums">
              {typeof value === "number" ? <AnimatedNumber value={value} /> : value}
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("academic_master") || hasRole("exams_admin");
  const { isTeacherScoped, allSubjectIds } = useTeacherScope();

  const [view, setView]           = useState<"cards" | "table">("cards");
  const [search, setSearch]       = useState("");
  const [levelFilter, setLevel]   = useState("all");

  // Dialogs
  const [addOpen, setAddOpen]       = useState(false);
  const [editOpen, setEditOpen]     = useState(false);
  const [editSubject, setEditSub]   = useState<Subject | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSub, setDetailSub]   = useState<Subject | null>(null);
  const [teacherOpen, setTeacherOpen] = useState(false);
  const [teacherSub, setTeacherSub] = useState<Subject | null>(null);

  // Forms
  const [addForm, setAddForm] = useState({ ...BLANK_FORM });
  const [editForm, setEditForm] = useState({ ...BLANK_FORM });

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ["subjects", isTeacherScoped, allSubjectIds.join(",")],
    enabled: !isTeacherScoped || allSubjectIds.length > 0,
    queryFn: async () => {
      let q = supabase.from("subjects").select("*").order("code");
      if (isTeacherScoped) q = q.in("id", allSubjectIds);
      const { data, error } = await q;
      if (error) throw error;
      return data as Subject[];
    },
  });

  // Teacher-subject links
  const { data: teacherSubjects = [] } = useQuery({
    queryKey: ["teacher-subjects-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("teacher_subjects")
        .select("id, staff_id, subject_id, staff(id,first_name,last_name,employee_no,photo_url)");
      return data ?? [];
    },
  });

  // Timetable slot counts per subject
  const { data: slotCounts = [] } = useQuery({
    queryKey: ["subject-slot-counts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("timetable_slots")
        .select("subject_id");
      return data ?? [];
    },
  });

  // Classes teaching this subject (class_subjects link)
  const { data: classLinks = [] } = useQuery({
    queryKey: ["subject-class-links"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_subjects")
        .select("id, subject_id, class_id, lessons_per_week, classes(id,name,stream)");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Exam result stats per subject
  const { data: examStats = [] } = useQuery({
    queryKey: ["subject-exam-stats"],
    queryFn: async () => {
      const { data } = await supabase
        .from("exam_results")
        .select("subject_id, score");
      return data ?? [];
    },
  });

  // All staff for teacher assignment
  const { data: allStaff = [] } = useQuery({
    queryKey: ["staff-lite-subjects"],
    enabled: teacherOpen,
    queryFn: async () => {
      const { data } = await supabase
        .from("staff")
        .select("id,first_name,last_name,employee_no")
        .eq("lifecycle_status", "active")
        .order("first_name");
      return data ?? [];
    },
  });

  // ── Derived stats maps ─────────────────────────────────────────────────────

  const teacherMap = useMemo(() => {
    const m: Record<string, any[]> = {};
    (teacherSubjects as any[]).forEach((ts) => {
      if (!m[ts.subject_id]) m[ts.subject_id] = [];
      m[ts.subject_id].push(ts);
    });
    return m;
  }, [teacherSubjects]);

  const slotMap = useMemo(() => {
    const m: Record<string, number> = {};
    (slotCounts as any[]).forEach((s) => { m[s.subject_id] = (m[s.subject_id] ?? 0) + 1; });
    return m;
  }, [slotCounts]);

  const classLinkMap = useMemo(() => {
    const m: Record<string, any[]> = {};
    (classLinks as any[]).forEach((cl) => {
      if (!m[cl.subject_id]) m[cl.subject_id] = [];
      m[cl.subject_id].push(cl);
    });
    return m;
  }, [classLinks]);

  const examMap = useMemo(() => {
    const m: Record<string, { total: number; count: number; pass: number }> = {};
    (examStats as any[]).forEach((r) => {
      const id = r.subject_id;
      if (!m[id]) m[id] = { total: 0, count: 0, pass: 0 };
      const sc = Number(r.score);
      m[id].total += sc; m[id].count++;
      if (sc >= 40) m[id].pass++;
    });
    return m;
  }, [examStats]);

  // ── Filtered subjects ──────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return subjects.filter((s) => {
      if (levelFilter !== "all" && s.level !== levelFilter) return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.code.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [subjects, search, levelFilter]);

  // KPIs
  // When teacher-scoped, `subjects` is already restricted to the teacher's own
  // subjects — but teacherMap/slotMap are built from unfiltered school-wide
  // queries, so KPIs must be re-restricted to this teacher's subject ids or
  // they'll silently show whole-school totals inside "My Subjects".
  const scopedSubjectIds = isTeacherScoped ? new Set(subjects.map((s) => s.id)) : null;
  const inScope = (id: string) => !scopedSubjectIds || scopedSubjectIds.has(id);
  const totalTeacherLinks = Object.entries(teacherMap)
    .filter(([id]) => inScope(id)).reduce((a, [, v]) => a + v.length, 0);
  const subjectsWithTeacher = Object.entries(teacherMap)
    .filter(([id, v]) => inScope(id) && v.length > 0).length;
  const totalSlots = Object.entries(slotMap)
    .filter(([id]) => inScope(id)).reduce((a, [, v]) => a + v, 0);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("subjects").insert([{
        code: addForm.code.trim().toUpperCase(),
        name: addForm.name.trim(),
        level: addForm.level,
        lessons_per_week: addForm.lessons_per_week,
        allow_double_period: addForm.allow_double_period,
        preferred_time_of_day: addForm.preferred_time_of_day,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Subject added");
      setAddOpen(false); setAddForm({ ...BLANK_FORM });
      qc.invalidateQueries({ queryKey: ["subjects"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to add subject"),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("subjects").update({
        code: editForm.code.trim().toUpperCase(),
        name: editForm.name.trim(),
        level: editForm.level,
        lessons_per_week: editForm.lessons_per_week,
        allow_double_period: editForm.allow_double_period,
        preferred_time_of_day: editForm.preferred_time_of_day,
      }).eq("id", editSubject!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Subject updated");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["subjects"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to update"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: sid } = await supabase.rpc("current_user_school");
      await supabase.from("subjects").delete().eq("id", id);
      if (sid) {
        await supabase.from("activity_logs").insert({
          action: "DELETE_SUBJECT", entity: "subject", entity_id: id,
          school_id: sid as string,
          metadata: { label: subjects.find((s) => s.id === id)?.name },
        });
      }
    },
    onSuccess: () => {
      toast.success("Subject deleted");
      qc.invalidateQueries({ queryKey: ["subjects"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to delete"),
  });

  // Teacher assignment mutations
  const assignTeacher = useMutation({
    mutationFn: async (staffId: string) => {
      // Check not already assigned
      const already = (teacherSubjects as any[]).find(
        (ts) => ts.subject_id === teacherSub!.id && ts.staff_id === staffId
      );
      if (already) { toast.info("Already assigned"); return; }
      const { error } = await supabase.from("teacher_subjects").insert([{
        subject_id: teacherSub!.id, staff_id: staffId,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Teacher assigned");
      qc.invalidateQueries({ queryKey: ["teacher-subjects-all"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed"),
  });

  const removeTeacher = useMutation({
    mutationFn: async (tsId: string) => {
      const { error } = await supabase.from("teacher_subjects").delete().eq("id", tsId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Teacher removed");
      qc.invalidateQueries({ queryKey: ["teacher-subjects-all"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed"),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function openEdit(s: Subject) {
    setEditSub(s);
    setEditForm({
      code: s.code, name: s.name, level: s.level,
      lessons_per_week: s.lessons_per_week,
      allow_double_period: s.allow_double_period,
      preferred_time_of_day: s.preferred_time_of_day,
    });
    setEditOpen(true);
  }

  function openDetail(s: Subject) { setDetailSub(s); setDetailOpen(true); }
  function openTeachers(s: Subject) { setTeacherSub(s); setTeacherOpen(true); }

  function SubjectForm({ form, setForm }: { form: typeof BLANK_FORM; setForm: (f: any) => void }) {
    return (
      <div className="space-y-4 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Code <span className="text-destructive">*</span></Label>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="e.g. MATH"
              className="uppercase"
            />
          </div>
          <div className="space-y-2">
            <Label>Level <span className="text-destructive">*</span></Label>
            <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEVELS.map((l) => <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Subject Name <span className="text-destructive">*</span></Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Mathematics"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Lessons per Week</Label>
            <Input
              type="number" min={1} max={20}
              value={form.lessons_per_week}
              onChange={(e) => setForm({ ...form, lessons_per_week: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label>Preferred Time</Label>
            <Select value={form.preferred_time_of_day} onValueChange={(v) => setForm({ ...form, preferred_time_of_day: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg border">
          <Switch
            id="double"
            checked={form.allow_double_period}
            onCheckedChange={(v) => setForm({ ...form, allow_double_period: v })}
          />
          <Label htmlFor="double" className="cursor-pointer">
            Allow double periods
            <span className="block text-xs text-muted-foreground font-normal">Allow two consecutive slots for this subject</span>
          </Label>
        </div>
      </div>
    );
  }

  // ── Subject card ───────────────────────────────────────────────────────────

  function SubjectCard({ s }: { s: Subject }) {
    const teachers  = teacherMap[s.id] ?? [];
    const slots     = slotMap[s.id] ?? 0;
    const stats     = examMap[s.id];
    const avg       = stats ? Math.round(stats.total / stats.count) : null;
    const passRate  = stats ? Math.round((stats.pass / stats.count) * 100) : null;

    return (
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <Card className="border-0 shadow-sm ring-1 ring-border/50 hover:shadow-md transition-shadow h-full flex flex-col">
          <CardContent className="p-4 flex-1 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="font-mono text-xs">{s.code}</Badge>
                  <Badge variant="secondary" className="text-[10px] capitalize">{s.level}</Badge>
                </div>
                <h3
                  className="font-bold text-sm leading-snug cursor-pointer hover:text-primary transition-colors"
                  onClick={() => openDetail(s)}
                >
                  {s.name}
                </h3>
              </div>
              {can && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(s)}>
                      <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openTeachers(s)}>
                      <UserPlus className="w-3.5 h-3.5 mr-2" /> Manage Teachers
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openDetail(s)}>
                      <ChevronRight className="w-3.5 h-3.5 mr-2" /> View Details
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => deleteMutation.mutate(s.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted/50 p-2">
                <p className="text-xs font-bold">{teachers.length}</p>
                <p className="text-[10px] text-muted-foreground">Teachers</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2">
                <p className="text-xs font-bold">{slots}</p>
                <p className="text-[10px] text-muted-foreground">Slots/wk</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2">
                <p className={`text-xs font-bold ${avg !== null ? (avg >= 70 ? "text-emerald-600" : avg >= 40 ? "text-amber-600" : "text-red-600") : ""}`}>
                  {avg !== null ? `${avg}%` : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">Avg score</p>
              </div>
            </div>

            {/* Pass rate bar */}
            {passRate !== null && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Pass rate</span><span>{passRate}%</span>
                </div>
                <Progress value={passRate} className="h-1.5" />
              </div>
            )}

            {/* Teacher chips */}
            {teachers.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {teachers.slice(0, 3).map((ts: any) => (
                  <Badge key={ts.id} variant="outline" className="text-[10px] gap-1 font-normal">
                    <Users className="w-2.5 h-2.5" />
                    {ts.staff?.first_name} {ts.staff?.last_name?.slice(0, 1)}.
                  </Badge>
                ))}
                {teachers.length > 3 && (
                  <Badge variant="outline" className="text-[10px]">+{teachers.length - 3} more</Badge>
                )}
              </div>
            )}

            {/* Timetable metadata */}
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1 border-t">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> {s.lessons_per_week}×/wk
              </span>
              <span className="flex items-center gap-1 capitalize">
                <CalendarDays className="w-3 h-3" /> {s.preferred_time_of_day}
              </span>
              {s.allow_double_period && (
                <Badge variant="outline" className="text-[10px] px-1 py-0">Double ✓</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{isTeacherScoped ? "My Subjects" : "Subjects"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isTeacherScoped
              ? `${subjects.length} subject${subjects.length === 1 ? "" : "s"} you teach`
              : `${subjects.length} subjects defined`}
          </p>
        </div>
        {can && (
          <Button onClick={() => setAddOpen(true)} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" /> Add Subject
          </Button>
        )}
      </div>

      {/* KPIs */}
      <motion.div variants={stagger} initial="hidden" animate="show"
        className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiBox label="Total Subjects"   value={subjects.length}       icon={<BookOpen className="w-4 h-4" />} color="indigo" />
        <KpiBox label="With Teachers"    value={subjectsWithTeacher}   icon={<Users className="w-4 h-4" />}    color="emerald" />
        <KpiBox label="Teacher Links"    value={totalTeacherLinks}     icon={<UserPlus className="w-4 h-4" />} color="blue" />
        <KpiBox label="Timetable Slots"  value={totalSlots}            icon={<CalendarDays className="w-4 h-4" />} color="amber" />
      </motion.div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search code or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={levelFilter} onValueChange={setLevel}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            {LEVELS.map((l) => <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-1 ml-auto">
          <Button
            variant={view === "cards" ? "default" : "outline"}
            size="icon" className="h-9 w-9"
            onClick={() => setView("cards")}
          >
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button
            variant={view === "table" ? "default" : "outline"}
            size="icon" className="h-9 w-9"
            onClick={() => setView("table")}
          >
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="h-48 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <BookOpen className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {subjects.length === 0
                ? (isTeacherScoped
                    ? "You aren't assigned to any subject or timetable slot yet. Ask the academic master to add you."
                    : "No subjects yet.")
                : "No subjects match your search."}
            </p>
          </CardContent>
        </Card>
      ) : view === "cards" ? (
        <motion.div variants={stagger} initial="hidden" animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((s) => <SubjectCard key={s.id} s={s} />)}
        </motion.div>
      ) : (
        /* Table view */
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Level</TableHead>
                <TableHead className="text-center">Lessons/wk</TableHead>
                <TableHead className="text-center">Double</TableHead>
                <TableHead className="text-center">Teachers</TableHead>
                <TableHead className="text-center">Slots</TableHead>
                <TableHead className="text-center">Avg Score</TableHead>
                <TableHead className="text-center">Pass Rate</TableHead>
                {can && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => {
                const teachers = teacherMap[s.id] ?? [];
                const slots    = slotMap[s.id] ?? 0;
                const stats    = examMap[s.id];
                const avg      = stats ? Math.round(stats.total / stats.count) : null;
                const pr       = stats ? Math.round((stats.pass / stats.count) * 100) : null;
                return (
                  <TableRow key={s.id} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="font-mono font-semibold">{s.code}</TableCell>
                    <TableCell>
                      <button
                        className="font-medium text-sm hover:text-primary transition-colors"
                        onClick={() => openDetail(s)}
                      >
                        {s.name}
                      </button>
                    </TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs capitalize">{s.level}</Badge></TableCell>
                    <TableCell className="text-center text-sm">{s.lessons_per_week}</TableCell>
                    <TableCell className="text-center">
                      {s.allow_double_period
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      <button
                        className="text-sm font-medium hover:text-primary transition-colors"
                        onClick={() => can ? openTeachers(s) : undefined}
                      >
                        {teachers.length}
                      </button>
                    </TableCell>
                    <TableCell className="text-center text-sm">{slots}</TableCell>
                    <TableCell className="text-center">
                      {avg !== null
                        ? <span className={`font-semibold text-sm ${avg >= 70 ? "text-emerald-600" : avg >= 40 ? "text-amber-600" : "text-red-600"}`}>{avg}%</span>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      {pr !== null
                        ? <span className="text-sm">{pr}%</span>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    {can && (
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openTeachers(s)}>
                            <UserPlus className="w-3.5 h-3.5" />
                          </Button>
                          <DeleteConfirmDialog
                            label={s.name}
                            isPending={deleteMutation.isPending}
                            onConfirm={() => deleteMutation.mutate(s.id)}
                          />
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Add Subject Dialog ───────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Subject</DialogTitle></DialogHeader>
          <SubjectForm form={addForm} setForm={setAddForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending || !addForm.code.trim() || !addForm.name.trim()}
            >
              {addMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Subject Dialog ──────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Subject — {editSubject?.name}</DialogTitle></DialogHeader>
          <SubjectForm form={editForm} setForm={setEditForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              onClick={() => editMutation.mutate()}
              disabled={editMutation.isPending || !editForm.code.trim() || !editForm.name.trim()}
            >
              {editMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Subject Detail Sheet ─────────────────────────────────────────────── */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {detailSub && (() => {
            const teachers = teacherMap[detailSub.id] ?? [];
            const slots    = slotMap[detailSub.id] ?? 0;
            const stats    = examMap[detailSub.id];
            const avg      = stats ? Math.round(stats.total / stats.count) : null;
            const pr       = stats ? Math.round((stats.pass / stats.count) * 100) : null;
            return (
              <>
                <SheetHeader className="pb-4">
                  <SheetTitle className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono">{detailSub.code}</Badge>
                    {detailSub.name}
                  </SheetTitle>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="secondary" className="capitalize">{detailSub.level}</Badge>
                    {detailSub.allow_double_period && <Badge variant="outline">Double periods ✓</Badge>}
                    <Badge variant="outline" className="capitalize">{detailSub.preferred_time_of_day}</Badge>
                  </div>
                </SheetHeader>

                <div className="space-y-5">
                  {/* Timetable config */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border p-3 text-center">
                      <p className="text-2xl font-bold">{detailSub.lessons_per_week}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Lessons / week</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <p className="text-2xl font-bold">{slots}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Timetable slots</p>
                    </div>
                  </div>

                  {/* Classes teaching this subject */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">
                        Classes ({(classLinkMap[detailSub.id] ?? []).length})
                      </p>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
                        <Link to="/timetable">
                          <BookOpen className="w-3 h-3" /> Manage in Timetable
                        </Link>
                      </Button>
                    </div>
                    {(classLinkMap[detailSub.id] ?? []).length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        Not assigned to any class yet — add it from the Timetable page's Class Subjects tab.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {(classLinkMap[detailSub.id] ?? []).map((cl: any) => (
                          <Badge key={cl.id} variant="outline" className="font-normal">
                            {cl.classes?.name}{cl.classes?.stream ? ` - ${cl.classes.stream}` : ""}
                            <span className="text-muted-foreground ml-1">· {cl.lessons_per_week}/wk</span>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Performance */}
                  {stats ? (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold">Exam Performance</p>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="rounded-lg border p-3">
                          <p className={`text-xl font-bold ${avg! >= 70 ? "text-emerald-600" : avg! >= 40 ? "text-amber-600" : "text-red-600"}`}>{avg}%</p>
                          <p className="text-[10px] text-muted-foreground">Average</p>
                        </div>
                        <div className="rounded-lg border p-3">
                          <p className="text-xl font-bold">{pr}%</p>
                          <p className="text-[10px] text-muted-foreground">Pass rate</p>
                        </div>
                        <div className="rounded-lg border p-3">
                          <p className="text-xl font-bold">{stats.count}</p>
                          <p className="text-[10px] text-muted-foreground">Results</p>
                        </div>
                      </div>
                      <Progress value={pr!} className="h-2" />
                    </div>
                  ) : (
                    <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
                      No exam results recorded yet.
                    </div>
                  )}

                  {/* Teachers */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Assigned Teachers ({teachers.length})</p>
                      {can && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setDetailOpen(false); openTeachers(detailSub); }}>
                          <UserPlus className="w-3 h-3" /> Manage
                        </Button>
                      )}
                    </div>
                    {teachers.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No teachers assigned.</p>
                    ) : (
                      <div className="space-y-2">
                        {teachers.map((ts: any) => (
                          <div key={ts.id} className="flex items-center gap-2 p-2 rounded-lg border">
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
                              {ts.staff?.first_name?.[0]}{ts.staff?.last_name?.[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{ts.staff?.first_name} {ts.staff?.last_name}</p>
                              <p className="text-[10px] text-muted-foreground font-mono">{ts.staff?.employee_no}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* ── Teacher Assignment Dialog ────────────────────────────────────────── */}
      <Dialog open={teacherOpen} onOpenChange={setTeacherOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-4 h-4" /> Teachers — {teacherSub?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Currently assigned */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Currently Assigned</p>
              {(teacherMap[teacherSub?.id ?? ""] ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground italic">None assigned yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {(teacherMap[teacherSub?.id ?? ""] ?? []).map((ts: any) => (
                    <div key={ts.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                      <div className="flex-1 text-sm">
                        {ts.staff?.first_name} {ts.staff?.last_name}
                        <span className="text-[10px] text-muted-foreground font-mono ml-2">{ts.staff?.employee_no}</span>
                      </div>
                      <Button
                        size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => removeTeacher.mutate(ts.id)}
                        disabled={removeTeacher.isPending}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add a teacher */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add Teacher</p>
              <Select
                value=""
                onValueChange={(staffId) => { if (staffId) assignTeacher.mutate(staffId); }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a staff member to assign…" />
                </SelectTrigger>
                <SelectContent>
                  {(allStaff as any[])
                    .filter((st) => !(teacherMap[teacherSub?.id ?? ""] ?? []).some((ts: any) => ts.staff_id === st.id))
                    .map((st) => (
                      <SelectItem key={st.id} value={st.id}>
                        {st.first_name} {st.last_name} ({st.employee_no})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setTeacherOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
