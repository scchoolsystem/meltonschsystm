import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Loader2, GraduationCap, TrendingUp, RefreshCw,
  AlertTriangle, CheckCircle2, Edit2, Clock, History,
  ArrowRight, Shield, Search, ChevronDown, ChevronUp,
  FileText, Users,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_app/admin/promotion")({
  component: PromotionPage,
});

type Decision = "promote" | "repeat" | "graduate" | "transfer_out" | "inactive";

interface PreviewRow {
  student_id: string;
  student_name: string;
  admission_no: string;
  current_class_name: string;
  next_class_name: string | null;
  final_average: number;
  pass_threshold: number;
  is_terminal_class: boolean;
  suggested_decision: Decision;
  // UI overrides
  decision: Decision;
  override_reason?: string;
  is_overridden?: boolean;
}

const DECISION_META: Record<
  Decision,
  { label: string; color: string; badgeVariant: "default" | "secondary" | "destructive" | "outline" }
> = {
  promote: {
    label: "Promote",
    color: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
  },
  graduate: {
    label: "Graduate",
    color: "text-amber-600 dark:text-amber-400",
    badgeVariant: "secondary",
  },
  repeat: {
    label: "Repeat",
    color: "text-red-600 dark:text-red-400",
    badgeVariant: "destructive",
  },
  transfer_out: {
    label: "Transfer Out",
    color: "text-purple-600 dark:text-purple-400",
    badgeVariant: "outline",
  },
  inactive: {
    label: "Inactive",
    color: "text-slate-500",
    badgeVariant: "outline",
  },
};

function DecisionBadge({ decision }: { decision: Decision }) {
  const meta = DECISION_META[decision];
  return (
    <Badge variant={meta.badgeVariant} className="gap-1 font-medium">
      {decision === "promote" && <TrendingUp className="w-3 h-3" />}
      {decision === "graduate" && <GraduationCap className="w-3 h-3" />}
      {decision === "repeat" && <RefreshCw className="w-3 h-3" />}
      {meta.label}
    </Badge>
  );
}

function PromotionPage() {
  const { isAdmin, session } = useAuth();
  const qc = useQueryClient();

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDecision, setFilterDecision] = useState<string>("all");
  const [filterClass, setFilterClass] = useState<string>("all");
  const [overrideTarget, setOverrideTarget] = useState<PreviewRow | null>(null);
  const [overrideDecision, setOverrideDecision] = useState<Decision>("promote");
  const [overrideReason, setOverrideReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sortField, setSortField] = useState<"name" | "class" | "avg" | "decision">("class");
  const [sortAsc, setSortAsc] = useState(true);

  // School context
  const { data: schoolId } = useQuery({
    queryKey: ["current-school-id"],
    queryFn: async () => {
      const { data } = await supabase.rpc("current_user_school");
      return data as string | null;
    },
  });

  // Promotion settings
  const { data: settings } = useQuery({
    queryKey: ["promotion-settings", schoolId],
    queryFn: async () => {
      if (!schoolId) return null;
      const { data } = await supabase
        .from("school_promotion_settings")
        .select("*")
        .eq("school_id", schoolId)
        .maybeSingle();
      return data;
    },
    enabled: !!schoolId,
  });

  // Class structure
  const { data: classStructure = [] } = useQuery({
    queryKey: ["class-structure", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase
        .from("school_class_structure")
        .select("*")
        .eq("school_id", schoolId)
        .order("sort_order");
      return data ?? [];
    },
    enabled: !!schoolId,
  });

  // History
  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ["promotion-history", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data, error } = await supabase
        .from("student_promotion_history")
        .select(`
          *,
          students!student_id(first_name, last_name, admission_no)
        `)
        .eq("school_id", schoolId)
        .order("finalised_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!schoolId,
  });

  // Preview RPC
  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("No school context");
      const { data, error } = await supabase.rpc("preview_promotion", {
        p_school_id: schoolId,
        p_academic_year: selectedYear,
      });
      if (error) throw error;
      return (data ?? []) as Omit<PreviewRow, "decision" | "is_overridden">[];
    },
    onSuccess: (data) => {
      const mapped: PreviewRow[] = data.map((r) => ({
        ...r,
        decision: r.suggested_decision as Decision,
        is_overridden: false,
        override_reason: "",
      }));
      setRows(mapped);
      setLoaded(true);
      toast.success(`Loaded ${mapped.length} students`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Run promotion
  const runMutation = useMutation({
    mutationFn: async () => {
      if (!schoolId || !session?.user?.id) throw new Error("No school/user context");
      const decisions = rows.map((r) => ({
        student_id: r.student_id,
        decision: r.decision,
        reason: r.override_reason ?? "",
      }));
      const { data, error } = await supabase.rpc("run_promotion", {
        p_school_id: schoolId,
        p_academic_year: selectedYear,
        p_decisions: decisions,
        p_actor_id: session.user.id,
      });
      if (error) throw error;
      return data as { processed: number; errors: number; error_list: any[] };
    },
    onSuccess: (result) => {
      setConfirmOpen(false);
      if (result.errors > 0) {
        toast.warning(`Promotion completed with ${result.errors} errors. ${result.processed} students processed.`);
      } else {
        toast.success(`Promotion complete! ${result.processed} students processed.`);
      }
      setRows([]);
      setLoaded(false);
      qc.invalidateQueries({ queryKey: ["promotion-history"] });
      qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function applyOverride() {
    if (!overrideTarget) return;
    if (!overrideReason.trim()) {
      toast.error("Please provide a reason for the override");
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.student_id === overrideTarget.student_id
          ? {
              ...r,
              decision: overrideDecision,
              override_reason: overrideReason,
              is_overridden: r.suggested_decision !== overrideDecision,
            }
          : r
      )
    );
    setOverrideTarget(null);
    setOverrideReason("");
    toast.success("Override applied — confirm to finalise");
  }

  // Distinct classes for filter
  const classOptions = useMemo(
    () => [...new Set(rows.map((r) => r.current_class_name))].sort(),
    [rows]
  );

  // Filtered + sorted rows
  const displayRows = useMemo(() => {
    let list = [...rows];
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (r) =>
          r.student_name.toLowerCase().includes(q) ||
          r.admission_no.toLowerCase().includes(q)
      );
    }
    if (filterDecision !== "all") list = list.filter((r) => r.decision === filterDecision);
    if (filterClass !== "all") list = list.filter((r) => r.current_class_name === filterClass);

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") cmp = a.student_name.localeCompare(b.student_name);
      else if (sortField === "class") cmp = a.current_class_name.localeCompare(b.current_class_name);
      else if (sortField === "avg") cmp = a.final_average - b.final_average;
      else if (sortField === "decision") cmp = a.decision.localeCompare(b.decision);
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [rows, searchTerm, filterDecision, filterClass, sortField, sortAsc]);

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortAsc((a) => !a);
    else { setSortField(field); setSortAsc(true); }
  }

  function SortIcon({ field }: { field: typeof sortField }) {
    if (sortField !== field) return null;
    return sortAsc
      ? <ChevronUp className="w-3 h-3 inline ml-1" />
      : <ChevronDown className="w-3 h-3 inline ml-1" />;
  }

  // Summary counts
  const summary = useMemo(() => ({
    total: rows.length,
    promote: rows.filter((r) => r.decision === "promote").length,
    repeat: rows.filter((r) => r.decision === "repeat").length,
    graduate: rows.filter((r) => r.decision === "graduate").length,
    other: rows.filter((r) => !["promote", "repeat", "graduate"].includes(r.decision)).length,
    overrides: rows.filter((r) => r.is_overridden).length,
  }), [rows]);

  const hasClassStructure = classStructure.length > 0;
  const hasSettings = !!settings;

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Admins only.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Academic Year Promotion</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Preview, adjust, and finalise student promotion decisions at the end of an academic year.
        </p>
      </div>

      <Tabs defaultValue="run">
        <TabsList>
          <TabsTrigger value="run" className="gap-2">
            <TrendingUp className="w-4 h-4" /> Run Promotion
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="w-4 h-4" /> History
          </TabsTrigger>
        </TabsList>

        {/* ── RUN PROMOTION TAB ── */}
        <TabsContent value="run" className="space-y-5 mt-5">

          {/* Setup warnings */}
          {!hasClassStructure && (
            <Alert variant="destructive">
              <AlertTriangle className="w-4 h-4" />
              <AlertTitle>Class Structure Not Configured</AlertTitle>
              <AlertDescription>
                Please configure your{" "}
                <a href="/admin/class-structure" className="underline font-medium">
                  Class Structure
                </a>{" "}
                before running promotion. The engine needs the ordered class list to determine
                the next class for each student.
              </AlertDescription>
            </Alert>
          )}

          {!hasSettings && hasClassStructure && (
            <Alert>
              <Info className="w-4 h-4" />
              <AlertTitle>Using Default Settings</AlertTitle>
              <AlertDescription>
                No promotion settings found — defaulting to 50% pass threshold, Final Average method.{" "}
                <a href="/admin/promotion-settings" className="underline font-medium">
                  Configure settings →
                </a>
              </AlertDescription>
            </Alert>
          )}

          {/* Controls row */}
          <Card>
            <CardContent className="pt-4 flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label>Academic Year</Label>
                <Select
                  value={selectedYear.toString()}
                  onValueChange={(v) => {
                    setSelectedYear(parseInt(v));
                    setRows([]);
                    setLoaded(false);
                  }}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                      <SelectItem key={y} value={y.toString()}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={() => previewMutation.mutate()}
                disabled={previewMutation.isPending || !hasClassStructure}
                variant="outline"
              >
                {previewMutation.isPending
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <Search className="w-4 h-4 mr-2" />}
                Load Preview
              </Button>

              {loaded && rows.length > 0 && (
                <Button
                  onClick={() => setConfirmOpen(true)}
                  disabled={runMutation.isPending}
                  className="ml-auto"
                >
                  {runMutation.isPending
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Confirm & Run Promotion
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Summary cards */}
          {loaded && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Total Students", value: summary.total, icon: <Users className="w-4 h-4" />, cls: "" },
                { label: "Promote", value: summary.promote, icon: <TrendingUp className="w-4 h-4" />, cls: "text-emerald-600 dark:text-emerald-400" },
                { label: "Repeat", value: summary.repeat, icon: <RefreshCw className="w-4 h-4" />, cls: "text-red-600 dark:text-red-400" },
                { label: "Graduate", value: summary.graduate, icon: <GraduationCap className="w-4 h-4" />, cls: "text-amber-600 dark:text-amber-400" },
                { label: "Other", value: summary.other, icon: <ArrowRight className="w-4 h-4" />, cls: "text-purple-600" },
                { label: "Overrides", value: summary.overrides, icon: <Shield className="w-4 h-4" />, cls: "text-blue-600" },
              ].map((s) => (
                <Card key={s.label} className="text-center">
                  <CardContent className="pt-4 pb-3">
                    <div className={`flex justify-center mb-1 ${s.cls || "text-muted-foreground"}`}>
                      {s.icon}
                    </div>
                    <div className={`text-2xl font-bold ${s.cls}`}>{s.value}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Filters */}
          {loaded && rows.length > 0 && (
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search name or admission no…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-56"
                />
              </div>
              <Select value={filterDecision} onValueChange={setFilterDecision}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All decisions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All decisions</SelectItem>
                  {Object.entries(DECISION_META).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {classOptions.length > 1 && (
                <Select value={filterClass} onValueChange={setFilterClass}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="All classes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All classes</SelectItem>
                    {classOptions.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                {displayRows.length} of {rows.length} students
              </span>
            </div>
          )}

          {/* Preview table */}
          {!loaded && !previewMutation.isPending && (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select an academic year and click <strong>Load Preview</strong> to see promotion suggestions.</p>
              </CardContent>
            </Card>
          )}

          {previewMutation.isPending && (
            <div className="h-48 grid place-items-center">
              <div className="text-center space-y-3">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground">Calculating promotion decisions…</p>
              </div>
            </div>
          )}

          {loaded && rows.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                No active students found for {selectedYear}.
              </CardContent>
            </Card>
          )}

          {loaded && rows.length > 0 && (
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-base">Promotion Preview — {selectedYear}</CardTitle>
                <CardDescription>
                  Review and adjust decisions before confirming. Click <strong>Override</strong> to change any outcome.
                  Every change is logged.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead
                          className="cursor-pointer select-none whitespace-nowrap"
                          onClick={() => toggleSort("name")}
                        >
                          Student <SortIcon field="name" />
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none whitespace-nowrap"
                          onClick={() => toggleSort("class")}
                        >
                          Current Class <SortIcon field="class" />
                        </TableHead>
                        <TableHead className="whitespace-nowrap">Next Class</TableHead>
                        <TableHead
                          className="cursor-pointer select-none whitespace-nowrap"
                          onClick={() => toggleSort("avg")}
                        >
                          Final Avg <SortIcon field="avg" />
                        </TableHead>
                        <TableHead className="whitespace-nowrap">Threshold</TableHead>
                        <TableHead
                          className="cursor-pointer select-none whitespace-nowrap"
                          onClick={() => toggleSort("decision")}
                        >
                          Decision <SortIcon field="decision" />
                        </TableHead>
                        <TableHead>Override</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayRows.map((row) => (
                        <TableRow
                          key={row.student_id}
                          className={row.is_overridden ? "bg-blue-50/40 dark:bg-blue-950/20" : ""}
                        >
                          <TableCell>
                            <div className="font-medium text-sm">{row.student_name}</div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {row.admission_no}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{row.current_class_name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {row.decision === "promote"
                              ? row.next_class_name ?? <span className="italic text-amber-500">No next class</span>
                              : row.decision === "graduate"
                              ? <span className="text-amber-600 dark:text-amber-400 font-medium">Graduate</span>
                              : <span className="text-muted-foreground/60">—</span>}
                          </TableCell>
                          <TableCell>
                            <span
                              className={
                                row.final_average >= row.pass_threshold
                                  ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                                  : "text-red-600 dark:text-red-400 font-semibold"
                              }
                            >
                              {row.final_average}%
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {row.pass_threshold}%
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <DecisionBadge decision={row.decision} />
                              {row.is_overridden && (
                                <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300">
                                  Overridden
                                </Badge>
                              )}
                            </div>
                            {row.override_reason && (
                              <div className="text-xs text-muted-foreground mt-0.5 max-w-[200px] truncate">
                                {row.override_reason}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {settings?.manual_override_allowed !== false && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1.5 text-xs"
                                onClick={() => {
                                  setOverrideTarget(row);
                                  setOverrideDecision(row.decision);
                                  setOverrideReason(row.override_reason ?? "");
                                }}
                              >
                                <Edit2 className="w-3 h-3" />
                                Override
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── HISTORY TAB ── */}
        <TabsContent value="history" className="space-y-5 mt-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="w-4 h-4" />
                Promotion History
              </CardTitle>
              <CardDescription>
                Permanent record of all promotion decisions. Exam results and historical records
                are never altered.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="h-40 grid place-items-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : history.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  <FileText className="w-8 h-8 mx-auto mb-3 opacity-30" />
                  No promotion history yet. Run the first promotion above.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Year</TableHead>
                        <TableHead>From Class</TableHead>
                        <TableHead>To Class</TableHead>
                        <TableHead>Avg</TableHead>
                        <TableHead>Threshold</TableHead>
                        <TableHead>Decision</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((h: any) => (
                        <TableRow key={h.id}>
                          <TableCell>
                            <div className="font-medium text-sm">
                              {h.students
                                ? `${h.students.first_name} ${h.students.last_name}`
                                : "—"}
                            </div>
                            <div className="text-xs font-mono text-muted-foreground">
                              {h.students?.admission_no}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{h.from_academic_year}</TableCell>
                          <TableCell className="text-sm">{h.from_class_name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {h.to_class_name ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm font-semibold">
                            {h.final_average != null ? `${h.final_average}%` : "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {h.promotion_threshold != null ? `${h.promotion_threshold}%` : "—"}
                          </TableCell>
                          <TableCell>
                            <DecisionBadge decision={h.decision as Decision} />
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {h.is_automatic ? "Auto" : "Manual"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {h.finalised_at
                              ? format(new Date(h.finalised_at), "d MMM yyyy")
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Override Dialog ── */}
      <Dialog open={!!overrideTarget} onOpenChange={(o) => !o && setOverrideTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Override Decision</DialogTitle>
            <DialogDescription>
              Change the promotion outcome for{" "}
              <strong>{overrideTarget?.student_name}</strong>. This override
              will be logged with your identity, timestamp, and reason.
            </DialogDescription>
          </DialogHeader>

          {overrideTarget && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/30 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Current class</div>
                  <div className="font-medium">{overrideTarget.current_class_name}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Final average</div>
                  <div className="font-medium">{overrideTarget.final_average}%</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Suggested</div>
                  <DecisionBadge decision={overrideTarget.suggested_decision} />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Current</div>
                  <DecisionBadge decision={overrideTarget.decision} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>New Decision</Label>
                <Select
                  value={overrideDecision}
                  onValueChange={(v) => setOverrideDecision(v as Decision)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DECISION_META).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  Reason <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  placeholder="Explain why this decision is being changed…"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={applyOverride}
              disabled={!overrideReason.trim()}
            >
              Apply Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Final Confirmation Dialog ── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Confirm Year Promotion — {selectedYear}
            </DialogTitle>
            <DialogDescription>
              This action is <strong>irreversible</strong>. All decisions will be applied,
              students will be moved to their new classes, and the history will be permanently recorded.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary.promote}</div>
                <div className="text-xs text-muted-foreground">Promoted</div>
              </div>
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">{summary.repeat}</div>
                <div className="text-xs text-muted-foreground">Repeat</div>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{summary.graduate}</div>
                <div className="text-xs text-muted-foreground">Graduate</div>
              </div>
            </div>

            {summary.overrides > 0 && (
              <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                <Shield className="w-4 h-4 shrink-0" />
                {summary.overrides} manual override{summary.overrides > 1 ? "s" : ""} included and will be logged.
              </div>
            )}

            <div className="flex items-start gap-2 text-sm text-muted-foreground p-3 rounded-lg bg-muted/40 border">
              <Clock className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                The entire operation runs in a single database transaction.
                If any error occurs, all changes will be rolled back automatically.
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
            >
              {runMutation.isPending
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Confirm Promotion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Inline Info icon used in Alert above
function Info({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}
