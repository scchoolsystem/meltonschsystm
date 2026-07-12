/**
 * _app.department.tsx — Department Workspace (v4 Role-Aware)
 *
 * Role access model:
 *  platform_owner / school_owner / school_admin / principal /
 *  deputy_principal / academic_master
 *    → "Admin tier": see ALL departments, dept switcher visible,
 *      full management (assign HOD, add/remove members, post anywhere)
 *
 *  hod (user with hod role AND is department_members.role='head' for active dept)
 *    → See own department only, can post announcements, can manage members
 *      within their dept
 *
 *  subject_teacher / class_teacher / teacher / staff / coordinator
 *    → See their own dept only (scoped by staff.department_id or membership),
 *      read-only (no management, no posting)
 *
 * Data sources — NO duplicate tables:
 *  Staff        → staff table, filtered by department_id
 *  Subjects     → teacher_subjects JOIN subjects
 *  Students     → exam_results → students
 *  Exams        → exam_results
 *  Announcements→ department_communications
 *  HOD / Members→ department_members
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend, AreaChart, Area,
} from "recharts";
import {
  Users, Crown, Megaphone, BookOpen, GraduationCap, BarChart3,
  Plus, Loader2, Building2, ChevronDown, UserCircle2, Search,
  CheckCircle2, AlertTriangle, TrendingUp, Star, Mail,
  CalendarDays, ClipboardList, Activity, Pencil, ShieldCheck,
  Trash2, UserPlus, Settings,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import {
  getMyDepartments,
  getDepartmentMembers,
  getDepartmentCommunications,
  upsertDepartmentMember,
  removeDepartmentMember,
  createDepartment,
  deleteDepartment,
  type Department,
  type DepartmentMember,
  type DeptRole,
} from "@/lib/departments.functions";
import { fadeUp, stagger } from "@/components/motion-variants";
import { AnimatedNumber } from "@/components/portal-shared";
import { StatusBadge } from "@/components/StatusBadge";
import { Pager } from "@/components/Pager";

export const Route = createFileRoute("/_app/department")({ component: Page });

// ── Helpers ────────────────────────────────────────────────────────────────────

const CHART_COLORS = ["#6366f1","#22c55e","#f97316","#06b6d4","#ec4899","#eab308","#8b5cf6"];

const ADMIN_TIER_ROLES = [
  "platform_owner","school_owner","school_admin","principal",
  "deputy_principal","academic_master","super_admin",
] as const;

function fallbackGrade(s: number) {
  if (s >= 80) return "A";  if (s >= 75) return "A-"; if (s >= 70) return "B+";
  if (s >= 65) return "B";  if (s >= 60) return "B-"; if (s >= 55) return "C+";
  if (s >= 50) return "C";  if (s >= 45) return "C-"; if (s >= 40) return "D+";
  return s >= 35 ? "D" : s >= 30 ? "D-" : "E";
}

function gradeColor(g: string) {
  if (["A","A-"].includes(g))         return "text-emerald-600";
  if (["B+","B","B-"].includes(g))    return "text-blue-600";
  if (["C+","C","C-"].includes(g))    return "text-amber-600";
  return "text-red-600";
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, color = "indigo" }: {
  icon: React.ReactNode; label: string; value: number | string;
  sub?: string; color?: string;
}) {
  const colors: Record<string, string> = {
    indigo:  "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600",
    emerald: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600",
    amber:   "bg-amber-50 dark:bg-amber-950/30 text-amber-600",
    red:     "bg-red-50 dark:bg-red-950/30 text-red-600",
    blue:    "bg-blue-50 dark:bg-blue-950/30 text-blue-600",
    violet:  "bg-violet-50 dark:bg-violet-950/30 text-violet-600",
  };
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" whileHover={{ y: -2 }}>
      <Card className="border-0 shadow-sm ring-1 ring-border/50 hover:shadow-md transition-shadow">
        <CardContent className="p-4 flex items-start gap-3">
          <div className={`p-2.5 rounded-xl shrink-0 ${colors[color] ?? colors.indigo}`}>{icon}</div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-2xl font-bold mt-0.5 leading-none tabular-nums">
              {typeof value === "number" ? <AnimatedNumber value={value} /> : value}
            </p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Section Card ───────────────────────────────────────────────────────────────

function SectionCard({ title, icon, children, className = "" }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show">
      <Card className={`border-0 shadow-sm ring-1 ring-border/50 ${className}`}>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <span className="text-primary">{icon}</span> {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 px-4 pb-4">{children}</CardContent>
      </Card>
    </motion.div>
  );
}

// ── HOD Profile Card ───────────────────────────────────────────────────────────

function HodCard({ hod }: { hod: DepartmentMember | null }) {
  if (!hod) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center">
          <Crown className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No Head of Department assigned.</p>
        </CardContent>
      </Card>
    );
  }
  const s = hod.staff;
  return (
    <Card className="border-0 shadow-sm ring-1 ring-border/50 bg-gradient-to-br from-primary/5 to-background">
      <CardContent className="p-5 flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-muted overflow-hidden shrink-0 ring-2 ring-primary/20">
          {s?.photo_url
            ? <img src={s.photo_url} alt="" className="h-full w-full object-cover" />
            : <div className="h-full w-full flex items-center justify-center">
                <Crown className="w-7 h-7 text-primary/60" />
              </div>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Crown className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Head of Department</span>
          </div>
          <h3 className="font-bold text-lg leading-tight">{s?.first_name} {s?.last_name}</h3>
          {s?.email && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Mail className="w-3 h-3" />{s.email}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Since {format(new Date(hod.joined_at), "MMM yyyy")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── New Department dialog ────────────────────────────────────────────────────

const DEPT_KINDS = [
  { value: "academics", label: "Academics" },
  { value: "administration", label: "Administration" },
  { value: "co_curricular", label: "Co-curricular" },
  { value: "support", label: "Support" },
] as const;

function NewDepartmentDialog({
  open, onOpenChange, name, setName, kind, setKind, onSubmit, pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  name: string;
  setName: (v: string) => void;
  kind: "academics" | "administration" | "co_curricular" | "support";
  setKind: (v: "academics" | "administration" | "co_curricular" | "support") => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Department</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              placeholder="e.g. Mathematics"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              If this is a single-subject academic department, matching it exactly to the
              subject name (e.g. "Mathematics") lets it auto-link on the Subjects tab.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEPT_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit} disabled={!name.trim() || pending}>
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDepartmentDialog({
  open, onOpenChange, department, onConfirm, pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  department: Department | null;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="w-4 h-4" /> Delete Department
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 text-sm">
          <p>
            Are you sure you want to permanently delete{" "}
            <span className="font-semibold">{department?.name ?? "this department"}</span>?
          </p>
          <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            This will remove its sub-departments, members, and announcements, and
            unassign any staff currently linked to it. This cannot be undone.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete Department"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Role badge helper ──────────────────────────────────────────────────────────

function RoleBadgeIndicator({ isAdminTier, isHOD }: { isAdminTier: boolean; isHOD: boolean }) {
  if (isAdminTier) return (
    <Badge className="gap-1 bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300">
      <ShieldCheck className="w-3 h-3" /> Admin View
    </Badge>
  );
  if (isHOD) return (
    <Badge className="gap-1 bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300">
      <Crown className="w-3 h-3" /> HOD
    </Badge>
  );
  return null;
}

// ── Page ───────────────────────────────────────────────────────────────────────

function Page() {
  const qc = useQueryClient();
  const { user, isAdmin, hasRole } = useAuth();

  // ── Role resolution ─────────────────────────────────────────────────────────
  const isAdminTier = isAdmin || ADMIN_TIER_ROLES.some((r) => hasRole(r as any));

  // ── State ───────────────────────────────────────────────────────────────────
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [staffPage, setStaffPage] = useState(0);
  const PAGE_SIZE = 20;

  // Announcement dialog
  const [commOpen, setCommOpen] = useState(false);
  const [commTitle, setCommTitle] = useState("");
  const [commBody, setCommBody] = useState("");

  // Member management dialog
  const [memberMgmtOpen, setMemberMgmtOpen] = useState(false);
  const [addMemberStaffId, setAddMemberStaffId] = useState("");
  const [addMemberRole, setAddMemberRole] = useState<DeptRole>("member");

  // New department dialog (admin tier only)
  const [newDeptOpen, setNewDeptOpen] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptKind, setNewDeptKind] = useState<"academics" | "administration" | "co_curricular" | "support">("academics");

  const createDeptMutation = useMutation({
    mutationFn: () => createDepartment(newDeptName, newDeptKind),
    onSuccess: (dept) => {
      toast.success(`${dept.name} department created`);
      qc.invalidateQueries({ queryKey: ["my-departments"] });
      setSelectedDeptId(dept.id);
      setNewDeptOpen(false);
      setNewDeptName("");
      setNewDeptKind("academics");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to create department"),
  });

  // Delete department (admin tier only)
  const [deleteDeptOpen, setDeleteDeptOpen] = useState(false);
  const deleteDeptMutation = useMutation({
    mutationFn: (departmentId: string) => deleteDepartment(departmentId),
    onSuccess: () => {
      toast.success("Department deleted");
      qc.invalidateQueries({ queryKey: ["my-departments"] });
      setSelectedDeptId(null);
      setDeleteDeptOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to delete department"),
  });

  // ── My departments (scoped by role) ─────────────────────────────────────────
  const { data: departments = [], isLoading: deptsLoading } = useQuery({
    queryKey: ["my-departments", user?.id, isAdminTier],
    queryFn: () => getMyDepartments(user!.id, isAdminTier),
    enabled: !!user?.id,
  });

  const activeDeptId = selectedDeptId ?? departments[0]?.id ?? null;
  const activeDept = departments.find((d) => d.id === activeDeptId) ?? null;

  // ── Department Members ──────────────────────────────────────────────────────
  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["dept-members", activeDeptId],
    queryFn: () => getDepartmentMembers(activeDeptId!),
    enabled: !!activeDeptId,
  });

  const hod = members.find((m) => m.role === "head") ?? null;

  // ── Derive: is the logged-in user the HOD of the active dept? ───────────────
  const { data: myStaffRow } = useQuery({
    queryKey: ["my-staff-row", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff")
        .select("id, department_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data ?? null;
    },
    enabled: !!user?.id,
  });

  const isHOD = useMemo(() => {
    if (!myStaffRow?.id) return false;
    return members.some((m) => m.staff_id === myStaffRow.id && m.role === "head");
  }, [members, myStaffRow]);

  // Combined permission flags
  const canManage = isAdminTier || isHOD;      // manage members, assign HOD
  const canPost   = isAdminTier || isHOD || hasRole("academic_master") || hasRole("principal");

  // ── Department Staff (via staff.department_id) ───────────────────────────────
  const { data: deptStaff = [], isLoading: staffLoading } = useQuery({
    queryKey: ["dept-staff", activeDeptId],
    enabled: !!activeDeptId,
    queryFn: async () => {
      const { data } = await supabase
        .from("staff")
        .select("id,first_name,last_name,employee_no,unique_id,email,photo_url,position_title,staff_category,lifecycle_status,department_id,department")
        .eq("department_id", activeDeptId!)
        .order("first_name");
      return data ?? [];
    },
  });

  // All staff in school for member-add dropdown (only loaded when manage dialog opens)
  const { data: allSchoolStaff = [] } = useQuery({
    queryKey: ["all-school-staff-for-dept"],
    enabled: memberMgmtOpen && canManage,
    queryFn: async () => {
      const { data } = await supabase
        .from("staff")
        .select("id, first_name, last_name, employee_no, department_id")
        .eq("lifecycle_status", "active")
        .order("first_name");
      return data ?? [];
    },
  });

  // ── Teacher-Subject links for this dept staff ────────────────────────────────
  const staffIds = useMemo(() => (deptStaff as any[]).map((s) => s.id), [deptStaff]);

  const { data: teacherSubjects = [] } = useQuery({
    queryKey: ["dept-teacher-subjects", staffIds.join(",")],
    enabled: staffIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("teacher_subjects")
        .select("staff_id, subjects(id,name,code)")
        .in("staff_id", staffIds);
      return data ?? [];
    },
  });

  const staffSubjectMap = useMemo(() => {
    const m: Record<string, any[]> = {};
    (teacherSubjects as any[]).forEach((ts) => {
      if (!m[ts.staff_id]) m[ts.staff_id] = [];
      if (ts.subjects) m[ts.staff_id].push(ts.subjects);
    });
    return m;
  }, [teacherSubjects]);

  // ── Department's own subject(s) ───────────────────────────────────────────────
  // Explicit link via department_subjects, NOT derived from teacher_subjects.
  // Deriving from teacher_subjects was the bug: a teacher assigned to this
  // department who also teaches an unrelated second subject elsewhere made
  // that unrelated subject show up here too (e.g. Agriculture teacher who
  // also teaches Biology made Biology appear under Agriculture).
  const { data: deptSubjects = [] } = useQuery({
    queryKey: ["dept-subjects", activeDeptId],
    enabled: !!activeDeptId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("department_subjects")
        .select("subjects(id,name,code)")
        .eq("department_id", activeDeptId!);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.subjects).filter(Boolean);
    },
  });

  const subjectIds = useMemo(() => deptSubjects.map((s: any) => s.id), [deptSubjects]);

  // ── Exam Results ─────────────────────────────────────────────────────────────
  const { data: examResults = [], isLoading: resultsLoading } = useQuery({
    queryKey: ["dept-exam-results", subjectIds.join(",")],
    enabled: subjectIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("exam_results")
        .select("id,score,grade,verified,subject_id,student_id,exam_id,exams(name,term,year),subjects(name,code),students(first_name,last_name,admission_no,classes(name,stream))")
        .in("subject_id", subjectIds)
        .order("created_at", { ascending: false })
        .limit(2000);
      return data ?? [];
    },
  });

  // ── Students connected via results ───────────────────────────────────────────
  const deptStudents = useMemo(() => {
    const map = new Map<string, any>();
    (examResults as any[]).forEach((r) => {
      if (r.student_id && !map.has(r.student_id)) {
        map.set(r.student_id, {
          id: r.student_id,
          name: `${r.students?.first_name ?? ""} ${r.students?.last_name ?? ""}`.trim(),
          adm: r.students?.admission_no ?? "",
          class: `${r.students?.classes?.name ?? ""}${r.students?.classes?.stream ? " " + r.students.classes.stream : ""}`.trim(),
        });
      }
    });
    return Array.from(map.values());
  }, [examResults]);

  // ── Analytics ─────────────────────────────────────────────────────────────────
  const subjectPerf = useMemo(() => {
    const m = new Map<string, { name: string; total: number; count: number; pass: number }>();
    (examResults as any[]).forEach((r) => {
      const id = r.subject_id;
      const name = r.subjects?.name ?? id;
      if (!m.has(id)) m.set(id, { name, total: 0, count: 0, pass: 0 });
      const e = m.get(id)!;
      const sc = Number(r.score);
      e.total += sc; e.count++; if (sc >= 40) e.pass++;
    });
    return Array.from(m.values())
      .map((s) => ({ ...s, avg: Math.round(s.total / s.count), passRate: Math.round((s.pass / s.count) * 100) }))
      .sort((a, b) => b.avg - a.avg);
  }, [examResults]);

  const overallAvg = useMemo(() =>
    (examResults as any[]).length
      ? Math.round((examResults as any[]).reduce((a, r) => a + Number(r.score), 0) / (examResults as any[]).length)
      : null,
    [examResults]);

  const passRate = useMemo(() =>
    (examResults as any[]).length
      ? Math.round((examResults as any[]).filter((r) => Number(r.score) >= 40).length / (examResults as any[]).length * 100)
      : null,
    [examResults]);

  const gradeDistrib = useMemo(() => {
    const b: Record<string, number> = {};
    (examResults as any[]).forEach((r) => {
      const g = r.grade ?? fallbackGrade(Number(r.score));
      b[g] = (b[g] ?? 0) + 1;
    });
    return Object.entries(b).map(([grade, count]) => ({ grade, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [examResults]);

  const studentAvgs = useMemo(() => {
    const m = new Map<string, { name: string; adm: string; cls: string; total: number; count: number }>();
    (examResults as any[]).forEach((r) => {
      const id = r.student_id;
      if (!id) return;
      if (!m.has(id)) m.set(id, {
        name: `${r.students?.first_name ?? ""} ${r.students?.last_name ?? ""}`.trim(),
        adm: r.students?.admission_no ?? "",
        cls: `${r.students?.classes?.name ?? ""}${r.students?.classes?.stream ? " " + r.students.classes.stream : ""}`.trim(),
        total: 0, count: 0,
      });
      const e = m.get(id)!;
      e.total += Number(r.score); e.count++;
    });
    return Array.from(m.values()).map((s) => ({ ...s, avg: Math.round(s.total / s.count) }));
  }, [examResults]);

  const topStudents   = useMemo(() => [...studentAvgs].sort((a, b) => b.avg - a.avg).slice(0, 10), [studentAvgs]);
  const weakStudents  = useMemo(() => [...studentAvgs].filter((s) => s.avg < 40).sort((a, b) => a.avg - b.avg).slice(0, 10), [studentAvgs]);

  // ── Announcements ─────────────────────────────────────────────────────────────
  const { data: comms = [], isLoading: commsLoading } = useQuery({
    queryKey: ["dept-comms", activeDeptId],
    queryFn: () => getDepartmentCommunications(activeDeptId!),
    enabled: !!activeDeptId,
  });

  const postMutation = useMutation({
    mutationFn: async () => {
      if (!myStaffRow?.id) throw new Error("Your account is not linked to a staff record.");
      const { data: staffCheck } = await supabase.from("staff").select("id,school_id").eq("id", myStaffRow.id).maybeSingle();
      if (!staffCheck?.id) throw new Error("Staff record not found.");
      const { error } = await supabase.from("department_communications").insert([{
        department_id: activeDeptId,
        sender_id: staffCheck.id,
        school_id: staffCheck.school_id,
        title: commTitle,
        content: commBody,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Announcement posted");
      setCommOpen(false); setCommTitle(""); setCommBody("");
      qc.invalidateQueries({ queryKey: ["dept-comms", activeDeptId] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to post"),
  });

  // ── Member management mutations ───────────────────────────────────────────────
  const addMemberMutation = useMutation({
    mutationFn: async () => {
      if (!addMemberStaffId) throw new Error("Select a staff member.");
      await upsertDepartmentMember(activeDeptId!, addMemberStaffId, addMemberRole);
    },
    onSuccess: () => {
      toast.success("Member added / role updated");
      setAddMemberStaffId(""); setAddMemberRole("member");
      qc.invalidateQueries({ queryKey: ["dept-members", activeDeptId] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to add member"),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => removeDepartmentMember(memberId),
    onSuccess: () => {
      toast.success("Member removed");
      qc.invalidateQueries({ queryKey: ["dept-members", activeDeptId] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to remove"),
  });

  const promoteToHODMutation = useMutation({
    mutationFn: async (staffId: string) => {
      // demote current HOD first
      if (hod) await upsertDepartmentMember(activeDeptId!, hod.staff_id, "coordinator");
      await upsertDepartmentMember(activeDeptId!, staffId, "head");
    },
    onSuccess: () => {
      toast.success("HOD updated");
      qc.invalidateQueries({ queryKey: ["dept-members", activeDeptId] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to update HOD"),
  });

  // ── Filtered staff ────────────────────────────────────────────────────────────
  const filteredStaff = useMemo(() => {
    const q = search.toLowerCase();
    return (deptStaff as any[]).filter((s) =>
      !q ||
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
      (s.employee_no ?? "").toLowerCase().includes(q) ||
      (s.email ?? "").toLowerCase().includes(q)
    );
  }, [deptStaff, search]);

  const staffPageCount = Math.max(1, Math.ceil(filteredStaff.length / PAGE_SIZE));
  const pagedStaff = filteredStaff.slice(staffPage * PAGE_SIZE, staffPage * PAGE_SIZE + PAGE_SIZE);

  // ── Loading / empty states ────────────────────────────────────────────────────
  if (deptsLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (departments.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <Card className="max-w-sm w-full">
          <CardContent className="py-10 text-center space-y-3">
            <Building2 className="w-10 h-10 mx-auto text-muted-foreground" />
            <h2 className="font-semibold text-lg">No Department Assigned</h2>
            <p className="text-sm text-muted-foreground">
              {isAdminTier
                ? "No departments have been created yet."
                : "Ask your administrator to assign you to a department."}
            </p>
            {isAdminTier && (
              <Button size="sm" className="gap-1.5" onClick={() => setNewDeptOpen(true)}>
                <Plus className="w-3.5 h-3.5" /> Add Department
              </Button>
            )}
          </CardContent>
        </Card>
        <NewDepartmentDialog
          open={newDeptOpen} onOpenChange={setNewDeptOpen}
          name={newDeptName} setName={setNewDeptName}
          kind={newDeptKind} setKind={setNewDeptKind}
          onSubmit={() => createDeptMutation.mutate()}
          pending={createDeptMutation.isPending}
        />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="w-7 h-7 text-primary" />
            {activeDept?.name ?? "Department"} Workspace
          </h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {activeDept?.kind && <Badge variant="outline" className="capitalize text-xs">{activeDept.kind}</Badge>}
            <RoleBadgeIndicator isAdminTier={isAdminTier} isHOD={isHOD} />
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-7 text-xs"
                onClick={() => setMemberMgmtOpen(true)}
              >
                <Settings className="w-3 h-3" /> Manage Members
              </Button>
            )}
            {isAdminTier && activeDept && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                onClick={() => setDeleteDeptOpen(true)}
              >
                <Trash2 className="w-3 h-3" /> Delete Department
              </Button>
            )}
          </div>
        </div>

        {/* Dept switcher — only for admin tier or users with multiple depts */}
        <div className="flex items-center gap-2 shrink-0">
          {departments.length > 1 && (
            <>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
              <Select value={activeDeptId ?? ""} onValueChange={(v) => { setSelectedDeptId(v); setActiveTab("overview"); }}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          {isAdminTier && (
            <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={() => setNewDeptOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> Add Department
            </Button>
          )}
        </div>
      </div>

      <NewDepartmentDialog
        open={newDeptOpen} onOpenChange={setNewDeptOpen}
        name={newDeptName} setName={setNewDeptName}
        kind={newDeptKind} setKind={setNewDeptKind}
        onSubmit={() => createDeptMutation.mutate()}
        pending={createDeptMutation.isPending}
      />

      <DeleteDepartmentDialog
        open={deleteDeptOpen} onOpenChange={setDeleteDeptOpen}
        department={activeDept}
        onConfirm={() => activeDeptId && deleteDeptMutation.mutate(activeDeptId)}
        pending={deleteDeptMutation.isPending}
      />

      {/* Sub-departments strip */}
      {(activeDept?.sub_departments?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeDept!.sub_departments!.map((sub: any) => (
            <Badge key={sub.id} variant="secondary" className="gap-1">
              <Building2 className="w-3 h-3" /> {sub.name}
            </Badge>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex w-auto min-w-full sm:min-w-0 h-auto flex-nowrap gap-0.5 p-1">
            <TabsTrigger value="overview" className="gap-1.5 whitespace-nowrap text-xs sm:text-sm">
              <Activity className="w-3.5 h-3.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="hod" className="gap-1.5 whitespace-nowrap text-xs sm:text-sm">
              <Crown className="w-3.5 h-3.5" /> HOD & Members
            </TabsTrigger>
            <TabsTrigger value="staff" className="gap-1.5 whitespace-nowrap text-xs sm:text-sm">
              <Users className="w-3.5 h-3.5" /> Staff
              {deptStaff.length > 0 && <Badge className="ml-1 text-[10px] px-1.5 py-0 h-4">{deptStaff.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="subjects" className="gap-1.5 whitespace-nowrap text-xs sm:text-sm">
              <BookOpen className="w-3.5 h-3.5" /> Subjects
            </TabsTrigger>
            <TabsTrigger value="students" className="gap-1.5 whitespace-nowrap text-xs sm:text-sm">
              <GraduationCap className="w-3.5 h-3.5" /> Students
            </TabsTrigger>
            <TabsTrigger value="exams" className="gap-1.5 whitespace-nowrap text-xs sm:text-sm">
              <ClipboardList className="w-3.5 h-3.5" /> Exams
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1.5 whitespace-nowrap text-xs sm:text-sm">
              <BarChart3 className="w-3.5 h-3.5" /> Analytics
            </TabsTrigger>
            <TabsTrigger value="announcements" className="gap-1.5 whitespace-nowrap text-xs sm:text-sm">
              <Megaphone className="w-3.5 h-3.5" /> Announcements
              {comms.length > 0 && <Badge className="ml-1 text-[10px] px-1.5 py-0 h-4">{comms.length}</Badge>}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── OVERVIEW ──────────────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="mt-4 space-y-6">
          <motion.div variants={stagger} initial="hidden" animate="show"
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard icon={<Users className="w-4 h-4" />} label="Staff Members" value={deptStaff.length} color="indigo" />
            <KpiCard icon={<BookOpen className="w-4 h-4" />} label="Subjects" value={deptSubjects.length} color="blue" />
            <KpiCard icon={<GraduationCap className="w-4 h-4" />} label="Students" value={deptStudents.length} color="violet" />
            <KpiCard icon={<BarChart3 className="w-4 h-4" />} label="Dept Avg" value={overallAvg !== null ? `${overallAvg}%` : "—"} color="emerald" />
            <KpiCard icon={<CheckCircle2 className="w-4 h-4" />} label="Pass Rate" value={passRate !== null ? `${passRate}%` : "—"} color="emerald" />
            <KpiCard icon={<Megaphone className="w-4 h-4" />} label="Announcements" value={comms.length} color="amber" />
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1">
              <HodCard hod={hod} />
            </div>
            <SectionCard title="Recent Announcements" icon={<Megaphone className="w-4 h-4" />} className="lg:col-span-2">
              {commsLoading ? <Loader2 className="animate-spin text-muted-foreground" /> :
               comms.length === 0 ? (
                <p className="text-sm text-muted-foreground italic text-center py-6">No announcements yet.</p>
              ) : (
                <div className="space-y-3">
                  {(comms as any[]).slice(0, 4).map((c) => (
                    <div key={c.id} className="flex gap-3 pb-3 border-b last:border-0 last:pb-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Megaphone className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">{c.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{c.content}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {c.staff ? `${c.staff.first_name} ${c.staff.last_name}` : "System"} ·{" "}
                          {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          {subjectPerf.length > 0 && (
            <SectionCard title="Subject Performance Overview" icon={<TrendingUp className="w-4 h-4" />}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={subjectPerf.slice(0, 10)} margin={{ top: 4, right: 12, left: -20, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                  <Tooltip formatter={(v) => [`${v}%`, "Avg"]} />
                  <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                    {subjectPerf.slice(0, 10).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>
          )}
        </TabsContent>

        {/* ── HOD & MEMBERS ─────────────────────────────────────────────────────── */}
        <TabsContent value="hod" className="mt-4 space-y-4">
          <HodCard hod={hod} />

          <SectionCard title="Department Members & Roles" icon={<Users className="w-4 h-4" />}>
            {canManage && (
              <div className="mb-3 flex justify-end">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMemberMgmtOpen(true)}>
                  <UserPlus className="w-3.5 h-3.5" /> Add / Manage Members
                </Button>
              </div>
            )}
            {membersLoading ? <Loader2 className="animate-spin text-muted-foreground" /> :
             members.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-6">
                No formal department membership records. Staff are linked via department assignment.
              </p>
            ) : (
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/40 transition-colors">
                    <div className="h-10 w-10 rounded-full bg-muted overflow-hidden shrink-0">
                      {m.staff?.photo_url
                        ? <img src={m.staff.photo_url} alt="" className="h-full w-full object-cover" />
                        : <div className="h-full w-full flex items-center justify-center"><UserCircle2 className="w-5 h-5 text-muted-foreground" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{m.staff?.first_name} {m.staff?.last_name}</p>
                      <p className="text-xs text-muted-foreground">{m.staff?.email}</p>
                    </div>
                    <Badge variant={m.role === "head" ? "default" : "outline"} className="capitalize text-xs">
                      {m.role === "head" && <Crown className="w-3 h-3 mr-1" />}{m.role}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground hidden sm:block">
                      Since {format(new Date(m.joined_at), "MMM yyyy")}
                    </span>
                    {/* HOD can promote/demote within their dept; admin tier always can */}
                    {canManage && m.role !== "head" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[10px] gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        onClick={() => promoteToHODMutation.mutate(m.staff_id)}
                        disabled={promoteToHODMutation.isPending}
                      >
                        <Crown className="w-3 h-3" /> Make HOD
                      </Button>
                    )}
                    {canManage && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                        onClick={() => removeMemberMutation.mutate(m.id)}
                        disabled={removeMemberMutation.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* ── STAFF ─────────────────────────────────────────────────────────────── */}
        <TabsContent value="staff" className="mt-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <h2 className="text-lg font-semibold">
              Department Staff <span className="text-muted-foreground text-sm font-normal ml-1">({deptStaff.length})</span>
            </h2>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search staff..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setStaffPage(0); }}
                className="pl-9"
              />
            </div>
          </div>

          {staffLoading ? (
            <div className="h-32 flex items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : filteredStaff.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center">
                <Users className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  {deptStaff.length === 0
                    ? "No staff assigned to this department. Assign via Staff module."
                    : "No staff match your search."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead>Name</TableHead>
                      <TableHead>Employee #</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Subjects</TableHead>
                      <TableHead>Dept Role</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedStaff.map((s: any) => {
                      const subs = staffSubjectMap[s.id] ?? [];
                      const deptMember = members.find((m) => m.staff_id === s.id);
                      return (
                        <TableRow key={s.id} className="hover:bg-muted/40 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-muted overflow-hidden shrink-0">
                                {s.photo_url
                                  ? <img src={s.photo_url} alt="" className="h-full w-full object-cover" />
                                  : <div className="h-full w-full flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                                      {s.first_name?.[0]}{s.last_name?.[0]}
                                    </div>}
                              </div>
                              <div>
                                <p className="font-medium text-sm">{s.first_name} {s.last_name}</p>
                                <p className="text-[10px] text-muted-foreground font-mono">{s.unique_id}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{s.employee_no}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs capitalize">{s.staff_category ?? "—"}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {subs.length > 0
                                ? subs.map((sub: any) => <Badge key={sub.id} variant="secondary" className="text-[10px] px-1.5">{sub.code}</Badge>)
                                : <span className="text-xs text-muted-foreground">—</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            {deptMember ? (
                              <Badge variant={deptMember.role === "head" ? "default" : "outline"} className="capitalize text-[10px]">
                                {deptMember.role === "head" && <Crown className="w-2.5 h-2.5 mr-1" />}
                                {deptMember.role}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{s.email ?? "—"}</TableCell>
                          <TableCell className="text-center">
                            <StatusBadge status={s.lifecycle_status} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <Pager page={staffPage} pageCount={staffPageCount} total={filteredStaff.length} onChange={setStaffPage} />
            </>
          )}
        </TabsContent>

        {/* ── SUBJECTS ──────────────────────────────────────────────────────────── */}
        <TabsContent value="subjects" className="mt-4 space-y-4">
          <h2 className="text-lg font-semibold">
            Department Subjects <span className="text-muted-foreground text-sm font-normal ml-1">({deptSubjects.length})</span>
          </h2>

          {deptSubjects.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center">
                <BookOpen className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No subjects linked to this department yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Assign staff to subjects in the Subjects module.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {deptSubjects.map((sub: any) => {
                const perf = subjectPerf.find((p) => p.name === sub.name);
                const teachers = (teacherSubjects as any[])
                  .filter((ts) => ts.subjects?.id === sub.id)
                  .map((ts) => {
                    const st = (deptStaff as any[]).find((s) => s.id === ts.staff_id);
                    return st ? `${st.first_name} ${st.last_name}` : null;
                  }).filter(Boolean);

                return (
                  <motion.div key={sub.id} variants={fadeUp} initial="hidden" animate="show">
                    <Card className="border-0 shadow-sm ring-1 ring-border/50 hover:shadow-md transition-shadow">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold text-sm">{sub.name}</h3>
                            <Badge variant="outline" className="text-[10px] font-mono mt-1">{sub.code}</Badge>
                          </div>
                          {perf && (
                            <div className="text-right shrink-0">
                              <p className={`text-lg font-bold ${perf.avg >= 70 ? "text-emerald-600" : perf.avg >= 40 ? "text-amber-600" : "text-red-600"}`}>
                                {perf.avg}%
                              </p>
                              <p className="text-[10px] text-muted-foreground">avg score</p>
                            </div>
                          )}
                        </div>
                        {perf && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                              <span>Pass rate</span><span>{perf.passRate}%</span>
                            </div>
                            <Progress value={perf.passRate} className="h-1.5" />
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {teachers.length > 0
                            ? <><span className="font-medium text-foreground">Teachers:</span> {teachers.join(", ")}</>
                            : "No teachers assigned"}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── STUDENTS ──────────────────────────────────────────────────────────── */}
        <TabsContent value="students" className="mt-4 space-y-4">
          <h2 className="text-lg font-semibold">
            Department Students <span className="text-muted-foreground text-sm font-normal ml-1">({deptStudents.length})</span>
          </h2>
          <p className="text-xs text-muted-foreground -mt-2">Students who have sat exams in department subjects.</p>

          {deptStudents.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center">
                <GraduationCap className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No student exam data for this department yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {studentAvgs.sort((a, b) => b.avg - a.avg).slice(0, 60).map((s) => {
                const g = fallbackGrade(s.avg);
                return (
                  <motion.div key={s.adm} variants={fadeUp} initial="hidden" animate="show">
                    <Card className="border-0 shadow-sm ring-1 ring-border/50 hover:shadow-md transition-shadow">
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <GraduationCap className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{s.name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{s.adm} · {s.cls || "—"}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`font-bold text-sm ${gradeColor(g)}`}>{g}</p>
                          <p className="text-[10px] text-muted-foreground">{s.avg}%</p>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
          {studentAvgs.length > 60 && (
            <p className="text-xs text-center text-muted-foreground">Showing top 60. Use the Exams tab for full results.</p>
          )}
        </TabsContent>

        {/* ── EXAMS ─────────────────────────────────────────────────────────────── */}
        <TabsContent value="exams" className="mt-4 space-y-4">
          <h2 className="text-lg font-semibold">
            Exam Results <span className="text-muted-foreground text-sm font-normal ml-1">({(examResults as any[]).length} records)</span>
          </h2>

          {resultsLoading ? (
            <div className="h-32 flex items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : (examResults as any[]).length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center">
                <ClipboardList className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No exam results for department subjects yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Exam</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-center">Grade</TableHead>
                    <TableHead className="text-center min-w-[80px]">Progress</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(examResults as any[]).slice(0, 300).map((r: any) => {
                    const g = r.grade ?? fallbackGrade(Number(r.score));
                    return (
                      <TableRow key={r.id} className="hover:bg-muted/40 transition-colors text-sm">
                        <TableCell className="font-medium">
                          {r.students?.first_name} {r.students?.last_name}
                          <br /><span className="text-[10px] text-muted-foreground font-mono">{r.students?.admission_no}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.students?.classes?.name}{r.students?.classes?.stream ? " " + r.students.classes.stream : ""}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.subjects?.name}
                          <br /><span className="text-muted-foreground font-mono text-[10px]">{r.subjects?.code}</span>
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.exams?.name}
                          <br /><span className="text-muted-foreground">{r.exams?.term} {r.exams?.year}</span>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{r.score}</TableCell>
                        <TableCell className="text-center">
                          <span className={`font-bold text-sm ${gradeColor(g)}`}>{g}</span>
                        </TableCell>
                        <TableCell className="min-w-[80px]">
                          <Progress value={Number(r.score)} max={100} className="h-1.5" />
                        </TableCell>
                        <TableCell className="text-center">
                          {r.verified
                            ? <Badge className="bg-emerald-600 text-[10px] py-0"><CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />Verified</Badge>
                            : <Badge variant="outline" className="text-[10px] py-0">Pending</Badge>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {(examResults as any[]).length > 300 && (
                <p className="text-xs text-center text-muted-foreground py-2">
                  Showing 300 of {(examResults as any[]).length}. Go to Academics → Results for full data.
                </p>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── ANALYTICS ─────────────────────────────────────────────────────────── */}
        <TabsContent value="analytics" className="mt-4 space-y-6">
          <motion.div variants={stagger} initial="hidden" animate="show"
            className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard icon={<BarChart3 className="w-4 h-4" />} label="Overall Avg" value={overallAvg !== null ? `${overallAvg}%` : "—"} color="indigo" />
            <KpiCard icon={<CheckCircle2 className="w-4 h-4" />} label="Pass Rate" value={passRate !== null ? `${passRate}%` : "—"} color="emerald" />
            <KpiCard icon={<Star className="w-4 h-4" />} label="Top Subject" value={(subjectPerf[0]?.name ?? "—").slice(0, 12)} sub={subjectPerf[0] ? `${subjectPerf[0].avg}%` : undefined} color="amber" />
            <KpiCard icon={<AlertTriangle className="w-4 h-4" />} label="Needs Attention" value={(subjectPerf[subjectPerf.length-1]?.name ?? "—").slice(0, 12)} sub={subjectPerf.length ? `${subjectPerf[subjectPerf.length-1].avg}%` : undefined} color="red" />
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Subject Average Scores" icon={<BarChart3 className="w-4 h-4" />}>
              {subjectPerf.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No exam data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={subjectPerf.slice(0, 10)} margin={{ top: 4, right: 12, left: -20, bottom: 35 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                    <Tooltip formatter={(v) => [`${v}%`]} />
                    <Bar dataKey="avg" radius={[4,4,0,0]}>
                      {subjectPerf.slice(0, 10).map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>

            <SectionCard title="Grade Distribution" icon={<Activity className="w-4 h-4" />}>
              {gradeDistrib.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No exam data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={gradeDistrib} dataKey="count" nameKey="grade" cx="50%" cy="50%" outerRadius={80} label={({ grade, count }) => `${grade}: ${count}`} labelLine={false}>
                      {gradeDistrib.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </SectionCard>
          </div>

          {subjectPerf.length > 0 && (
            <SectionCard title="Pass Rate by Subject" icon={<TrendingUp className="w-4 h-4" />}>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={subjectPerf.slice(0, 10)} margin={{ top: 4, right: 12, left: -20, bottom: 35 }}>
                  <defs>
                    <linearGradient id="passGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                  <Tooltip formatter={(v) => [`${v}%`, "Pass Rate"]} />
                  <Area type="monotone" dataKey="passRate" stroke="#22c55e" fill="url(#passGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </SectionCard>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title={`Top Performers (${topStudents.length})`} icon={<Star className="w-4 h-4 text-amber-500" />}>
              {topStudents.length === 0
                ? <p className="text-sm text-muted-foreground text-center py-6">No data.</p>
                : <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {topStudents.map((s, i) => (
                      <div key={s.adm} className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 text-sm">
                        <span className="w-5 text-center text-xs font-bold">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i+1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-xs">{s.name}</p>
                          <p className="text-[10px] text-muted-foreground">{s.cls} · {s.adm}</p>
                        </div>
                        <div className="w-16 shrink-0"><Progress value={s.avg} max={100} className="h-1.5" /></div>
                        <span className="font-bold text-emerald-600 text-xs w-9 text-right tabular-nums">{s.avg}%</span>
                      </div>
                    ))}
                  </div>
              }
            </SectionCard>

            <SectionCard title={`Needs Support (${weakStudents.length})`} icon={<AlertTriangle className="w-4 h-4 text-red-500" />}>
              {weakStudents.length === 0
                ? <p className="text-sm text-muted-foreground text-center py-6">No students below 40% — great!</p>
                : <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {weakStudents.map((s, i) => (
                      <div key={s.adm} className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-sm">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-xs">{s.name}</p>
                          <p className="text-[10px] text-muted-foreground">{s.cls} · {s.adm}</p>
                        </div>
                        <div className="w-16 shrink-0"><Progress value={s.avg} max={100} className="h-1.5" /></div>
                        <span className="font-bold text-red-600 text-xs w-9 text-right tabular-nums">{s.avg}%</span>
                      </div>
                    ))}
                  </div>
              }
            </SectionCard>
          </div>
        </TabsContent>

        {/* ── ANNOUNCEMENTS ─────────────────────────────────────────────────────── */}
        <TabsContent value="announcements" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Department Announcements</h2>
            {canPost && (
              <Button onClick={() => setCommOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" /> Post Announcement
              </Button>
            )}
          </div>

          {!canPost && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-4 py-2">
              Only the HOD and administrators can post announcements for this department.
            </p>
          )}

          {commsLoading ? (
            <div className="h-32 flex items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : (comms as any[]).length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Megaphone className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No announcements yet.</p>
                {canPost && <p className="text-xs text-muted-foreground mt-1">Post the first announcement for your team.</p>}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3 max-w-3xl">
              {(comms as any[]).map((c) => (
                <motion.div key={c.id} variants={fadeUp} initial="hidden" animate="show">
                  <Card className="border-0 shadow-sm ring-1 ring-border/50">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-bold text-base leading-snug">{c.title}</h3>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                          {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        By {c.staff ? `${c.staff.first_name} ${c.staff.last_name}` : "System"}
                      </p>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{c.content}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Post Announcement Dialog ────────────────────────────────────────────── */}
      <Dialog open={commOpen} onOpenChange={setCommOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Post Department Announcement</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={commTitle} onChange={(e) => setCommTitle(e.target.value)} placeholder="e.g. End of term grading deadline" />
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                value={commBody}
                onChange={(e) => setCommBody(e.target.value)}
                placeholder="Write your announcement here..."
                className="h-32"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCommOpen(false)}>Cancel</Button>
            <Button
              onClick={() => postMutation.mutate()}
              disabled={postMutation.isPending || !commTitle.trim() || !commBody.trim()}
            >
              {postMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Member Management Dialog ────────────────────────────────────────────── */}
      <Dialog open={memberMgmtOpen} onOpenChange={setMemberMgmtOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-4 h-4" /> Manage Department Members
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Add member */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Add / Update Member</h3>
              <div className="space-y-2">
                <Label>Staff Member</Label>
                <Select value={addMemberStaffId} onValueChange={setAddMemberStaffId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(allSchoolStaff as any[]).map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.first_name} {s.last_name}
                        {s.employee_no ? ` (${s.employee_no})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Role in Department</Label>
                <Select value={addMemberRole} onValueChange={(v) => setAddMemberRole(v as DeptRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="head">
                      <span className="flex items-center gap-2"><Crown className="w-3 h-3 text-amber-500" /> Head of Department</span>
                    </SelectItem>
                    <SelectItem value="coordinator">Coordinator</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full gap-2"
                onClick={() => addMemberMutation.mutate()}
                disabled={addMemberMutation.isPending || !addMemberStaffId}
              >
                {addMemberMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <UserPlus className="w-4 h-4" />}
                Add / Update Member
              </Button>
            </div>

            {/* Current members list */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Current Members ({members.length})</h3>
              {members.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No formal members yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg border">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{m.staff?.first_name} {m.staff?.last_name}</p>
                        <Badge variant={m.role === "head" ? "default" : "outline"} className="text-[10px] capitalize mt-0.5">
                          {m.role === "head" && <Crown className="w-2.5 h-2.5 mr-1" />}{m.role}
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50 shrink-0"
                        onClick={() => removeMemberMutation.mutate(m.id)}
                        disabled={removeMemberMutation.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberMgmtOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
