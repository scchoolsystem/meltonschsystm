import { createFileRoute, Link } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveStudents } from "@/lib/students.functions";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Plus, Loader2, Search, Activity, BedDouble, Package,
  ClipboardList, Heart, AlertTriangle, CheckCircle2,
  Thermometer, User, Phone, Pill, FileText, Pencil,
  Trash2, Bell, ArrowUpRight, TrendingDown, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useTenant } from "@/hooks/use-tenant";
import { format, parseISO, isToday } from "date-fns";

export const Route = createFileRoute("/_app/clinic")({
  component: () => <FeatureGate feature="clinic"><Page /></FeatureGate>,
});

const COMPLAINT_TYPES = [
  { value: "illness", label: "Illness", color: "bg-yellow-100 text-yellow-800" },
  { value: "injury", label: "Injury", color: "bg-red-100 text-red-800" },
  { value: "emergency", label: "Emergency", color: "bg-red-600 text-white" },
  { value: "routine", label: "Routine Check", color: "bg-blue-100 text-blue-800" },
  { value: "follow_up", label: "Follow-Up", color: "bg-purple-100 text-purple-800" },
];

const REFERRAL_STATUSES = [
  { value: "none", label: "No Referral" },
  { value: "pending", label: "Pending" },
  { value: "sent", label: "Referred" },
  { value: "completed", label: "Completed" },
];

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"];

function complainBadge(type: string) {
  const c = COMPLAINT_TYPES.find(x => x.value === type);
  return c ? (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.color}`}>{c.label}</span>
  ) : null;
}

/* ═══════════════════════ MAIN PAGE ═══════════════════════ */

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const { school } = useTenant();
  const can = isAdmin || hasRole("nurse") || hasRole("clinic_admin") || hasRole("clinic_user") || hasRole("matron");

  const [search, setSearch] = useState("");
  const [visitOpen, setVisitOpen] = useState(false);
  const [editVisit, setEditVisit] = useState<any>(null);
  const [detailStudent, setDetailStudent] = useState<any>(null);

  const { data: visits = [], isLoading } = useQuery({
    queryKey: ["clinic_visits"],
    queryFn: async () =>
      (await supabase
        .from("clinic_visits")
        .select("*, students(id,first_name,last_name,admission_no,photo_url,classes(name))")
        .order("visit_date", { ascending: false })
        .order("visit_time", { ascending: false })
        .limit(500)
      ).data ?? [],
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ["clinic_inventory"],
    queryFn: async () =>
      (await supabase.from("clinic_inventory").select("*").order("name")).data ?? [],
  });

  const today = format(new Date(), "yyyy-MM-dd");
  const todayVisits = useMemo(() =>
    (visits as any[]).filter(v => v.visit_date === today), [visits, today]);
  const observation = useMemo(() =>
    (visits as any[]).filter(v => v.under_observation && !v.discharge_date), [visits]);
  const followUps = useMemo(() =>
    (visits as any[]).filter(v => v.follow_up_date && !v.discharge_date && v.follow_up_date <= today), [visits, today]);
  const lowStock = useMemo(() =>
    (inventory as any[]).filter(i => i.quantity <= i.reorder_level), [inventory]);

  const filtered = useMemo(() => {
    if (!search.trim()) return visits as any[];
    const q = search.toLowerCase();
    return (visits as any[]).filter(v => {
      const name = `${v.students?.first_name ?? ""} ${v.students?.last_name ?? ""}`.toLowerCase();
      return name.includes(q) || (v.students?.admission_no ?? "").toLowerCase().includes(q)
        || (v.symptoms ?? "").toLowerCase().includes(q);
    });
  }, [visits, search]);

  const dischargeMut = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase.from("clinic_visits").update({
        discharge_date: today, discharge_notes: notes, under_observation: false,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clinic_visits"] }); toast.success("Student discharged"); },
    onError: (e: any) => toast.error(e.message),
  });

  const notifyMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clinic_visits").update({
        parent_notified: true, parent_notified_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clinic_visits"] }); toast.success("Parent notification recorded"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clinic_visits").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clinic_visits"] }); toast.success("Visit deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="w-7 h-7 text-red-500" /> Health Centre
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {school?.name} · School Medical Records & Clinic Management
          </p>
        </div>
        {can && (
          <div className="flex gap-2 flex-wrap">
            <Dialog open={visitOpen} onOpenChange={v => { setVisitOpen(v); if (!v) setEditVisit(null); }}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" />New Visit</Button>
              </DialogTrigger>
              <VisitDialog
                key={editVisit?.id ?? "new"}
                existing={editVisit}
                onDone={() => { setVisitOpen(false); setEditVisit(null); qc.invalidateQueries({ queryKey: ["clinic_visits"] }); }}
              />
            </Dialog>
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<ClipboardList className="w-5 h-5 text-blue-500" />}
          label="Today's Visits" value={todayVisits.length} color="border-l-blue-500" />
        <StatCard icon={<BedDouble className="w-5 h-5 text-orange-500" />}
          label="Under Observation" value={observation.length} color="border-l-orange-500"
          alert={observation.length > 0} />
        <StatCard icon={<Bell className="w-5 h-5 text-purple-500" />}
          label="Follow-Ups Due" value={followUps.length} color="border-l-purple-500"
          alert={followUps.length > 0} />
        <StatCard icon={<Package className="w-5 h-5 text-red-500" />}
          label="Low Stock Items" value={lowStock.length} color="border-l-red-500"
          alert={lowStock.length > 0} />
      </div>

      {/* Observation ward alert */}
      {observation.length > 0 && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <BedDouble className="w-4 h-4" /> Observation Ward — {observation.length} student{observation.length > 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {observation.map((v: any) => (
                <ObservationCard
                  key={v.id}
                  visit={v}
                  onDischarge={(notes) => dischargeMut.mutate({ id: v.id, notes })}
                  onNotify={() => notifyMut.mutate(v.id)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="visits">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="visits">
            <ClipboardList className="w-3.5 h-3.5 mr-1.5" />All Visits
          </TabsTrigger>
          <TabsTrigger value="today">
            Today {todayVisits.length > 0 && <Badge variant="secondary" className="ml-1.5">{todayVisits.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="followups">
            Follow-Ups {followUps.length > 0 && <Badge variant="destructive" className="ml-1.5">{followUps.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="health_records">
            <Heart className="w-3.5 h-3.5 mr-1.5" />Health Records
          </TabsTrigger>
          <TabsTrigger value="inventory">
            <Package className="w-3.5 h-3.5 mr-1.5" />Inventory
            {lowStock.length > 0 && <Badge variant="destructive" className="ml-1.5">{lowStock.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ── All Visits ── */}
        <TabsContent value="visits" className="mt-4 space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search student, symptoms…" className="pl-8"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <VisitsTable
            data={filtered} isLoading={isLoading} can={can}
            onEdit={v => { setEditVisit(v); setVisitOpen(true); }}
            onDelete={id => deleteMut.mutate(id)}
            onViewHistory={v => setDetailStudent(v.students)}
            onNotify={id => notifyMut.mutate(id)}
          />
        </TabsContent>

        {/* ── Today ── */}
        <TabsContent value="today" className="mt-4">
          <VisitsTable
            data={todayVisits} isLoading={isLoading} can={can}
            onEdit={v => { setEditVisit(v); setVisitOpen(true); }}
            onDelete={id => deleteMut.mutate(id)}
            onViewHistory={v => setDetailStudent(v.students)}
            onNotify={id => notifyMut.mutate(id)}
            emptyText="No visits logged today."
          />
        </TabsContent>

        {/* ── Follow-Ups ── */}
        <TabsContent value="followups" className="mt-4">
          <VisitsTable
            data={followUps} isLoading={isLoading} can={can}
            onEdit={v => { setEditVisit(v); setVisitOpen(true); }}
            onDelete={id => deleteMut.mutate(id)}
            onViewHistory={v => setDetailStudent(v.students)}
            onNotify={id => notifyMut.mutate(id)}
            emptyText="No follow-ups due."
          />
        </TabsContent>

        {/* ── Health Records ── */}
        <TabsContent value="health_records" className="mt-4">
          <HealthRecordsTab can={can} />
        </TabsContent>

        {/* ── Inventory ── */}
        <TabsContent value="inventory" className="mt-4">
          <InventoryTab inventory={inventory as any[]} can={can} />
        </TabsContent>
      </Tabs>

      {/* Student history sheet */}
      <Sheet open={!!detailStudent} onOpenChange={o => !o && setDetailStudent(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          {detailStudent && <StudentHistorySheet student={detailStudent} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ═══════════════════════ STAT CARD ═══════════════════════ */

function StatCard({ icon, label, value, color, alert }: {
  icon: React.ReactNode; label: string; value: number; color: string; alert?: boolean;
}) {
  return (
    <Card className={`border-l-4 ${color}`}>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-2xl font-bold ${alert && value > 0 ? "text-destructive" : ""}`}>{value}</p>
        </div>
        {icon}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════ OBSERVATION CARD ═══════════════════════ */

function ObservationCard({ visit, onDischarge, onNotify }: {
  visit: any; onDischarge: (notes: string) => void; onNotify: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [showDischarge, setShowDischarge] = useState(false);
  const admittedDays = visit.admitted_date
    ? Math.floor((Date.now() - new Date(visit.admitted_date).getTime()) / 86400000)
    : 0;

  return (
    <div className="bg-white dark:bg-card border rounded-lg p-3 min-w-[200px] space-y-2">
      <div className="flex items-center gap-2">
        {visit.students?.photo_url ? (
          <img src={visit.students.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-orange-200 flex items-center justify-center text-xs font-bold text-orange-800">
            {visit.students?.first_name?.[0]}{visit.students?.last_name?.[0]}
          </div>
        )}
        <div>
          <div className="font-medium text-sm">{visit.students?.first_name} {visit.students?.last_name}</div>
          <div className="text-xs text-muted-foreground">{visit.students?.classes?.name}</div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        {visit.admitted_date ? `Admitted ${admittedDays}d ago` : `Visit: ${visit.visit_date}`}
      </div>
      <div className="text-xs truncate">{visit.symptoms}</div>
      <div className="flex gap-1.5 flex-wrap">
        {!visit.parent_notified && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onNotify}>
            <Bell className="w-3 h-3 mr-1" />Notify Parent
          </Button>
        )}
        {visit.parent_notified && (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />Parent notified
          </span>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="default" className="h-7 text-xs bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="w-3 h-3 mr-1" />Discharge
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discharge {visit.students?.first_name}?</AlertDialogTitle>
              <AlertDialogDescription>Add discharge notes before releasing student.</AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea placeholder="Discharge notes, condition on leaving…" value={notes} onChange={e => setNotes(e.target.value)} />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDischarge(notes)} className="bg-green-600 hover:bg-green-700">
                Confirm Discharge
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

/* ═══════════════════════ VISITS TABLE ═══════════════════════ */

function VisitsTable({ data, isLoading, can, onEdit, onDelete, onViewHistory, onNotify, emptyText = "No visits found." }: {
  data: any[]; isLoading: boolean; can: boolean;
  onEdit: (v: any) => void;
  onDelete: (id: string) => void;
  onViewHistory: (v: any) => void;
  onNotify: (id: string) => void;
  emptyText?: string;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Date / Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Symptoms</TableHead>
                  <TableHead>Diagnosis</TableHead>
                  <TableHead>Vitals</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Referral</TableHead>
                  {can && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-10">{emptyText}</TableCell>
                  </TableRow>
                )}
                {data.map((v: any) => (
                  <TableRow key={v.id} className={v.complaint_type === "emergency" ? "bg-red-50 dark:bg-red-950/20" : ""}>
                    <TableCell>
                      <button className="flex items-center gap-2 hover:underline text-left" onClick={() => onViewHistory(v)}>
                        {v.students?.photo_url ? (
                          <img src={v.students.photo_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                            {v.students?.first_name?.[0]}{v.students?.last_name?.[0]}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-sm whitespace-nowrap">
                            {v.students?.first_name} {v.students?.last_name}
                          </div>
                          <div className="text-xs text-muted-foreground">{v.students?.classes?.name}</div>
                        </div>
                      </button>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      <div>{v.visit_date}</div>
                      {v.visit_time && <div className="text-muted-foreground">{v.visit_time?.slice(0,5)}</div>}
                    </TableCell>
                    <TableCell>{complainBadge(v.complaint_type ?? "illness")}</TableCell>
                    <TableCell className="max-w-[160px]">
                      <p className="text-sm truncate" title={v.symptoms}>{v.symptoms}</p>
                    </TableCell>
                    <TableCell className="max-w-[140px]">
                      <p className="text-sm truncate text-muted-foreground">{v.diagnosis ?? "—"}</p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div className="space-y-0.5">
                        {v.temperature && <div className="flex items-center gap-1"><Thermometer className="w-3 h-3" />{v.temperature}°C</div>}
                        {v.blood_pressure && <div>BP: {v.blood_pressure}</div>}
                        {v.pulse_rate && <div>PR: {v.pulse_rate} bpm</div>}
                        {!v.temperature && !v.blood_pressure && !v.pulse_rate && "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {v.under_observation && !v.discharge_date && (
                          <Badge variant="outline" className="border-orange-400 text-orange-600 text-xs w-fit">Admitted</Badge>
                        )}
                        {v.discharge_date && (
                          <Badge variant="outline" className="border-green-500 text-green-600 text-xs w-fit">Discharged</Badge>
                        )}
                        {v.follow_up_date && !v.discharge_date && (
                          <Badge variant="outline" className="text-xs w-fit border-purple-400 text-purple-600">
                            Follow-up {v.follow_up_date}
                          </Badge>
                        )}
                        {v.parent_notified && (
                          <span className="text-xs text-green-600 flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3" />Parent notified
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {v.referred_to ? (
                        <div className="text-xs">
                          <div className="font-medium truncate max-w-[100px]">{v.referred_to}</div>
                          <Badge variant="outline" className="text-xs mt-0.5">
                            {REFERRAL_STATUSES.find(r => r.value === v.referral_status)?.label ?? v.referral_status}
                          </Badge>
                        </div>
                      ) : "—"}
                    </TableCell>
                    {can && (
                      <TableCell>
                        <div className="flex gap-1">
                          {!v.parent_notified && v.under_observation && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Mark parent notified" onClick={() => onNotify(v.id)}>
                              <Bell className="w-3.5 h-3.5 text-orange-500" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(v)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this visit?</AlertDialogTitle>
                                <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => onDelete(v.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════ VISIT DIALOG ═══════════════════════ */

function VisitDialog({ existing, onDone }: { existing?: any; onDone: () => void }) {
  const isEdit = !!existing;
  const [f, setF] = useState({
    student_id:        existing?.student_id        ?? "",
    visit_date:        existing?.visit_date        ?? format(new Date(), "yyyy-MM-dd"),
    visit_time:        existing?.visit_time?.slice(0,5) ?? format(new Date(), "HH:mm"),
    complaint_type:    existing?.complaint_type    ?? "illness",
    symptoms:          existing?.symptoms          ?? "",
    diagnosis:         existing?.diagnosis         ?? "",
    treatment:         existing?.treatment         ?? "",
    medications:       existing?.medications       ?? "",
    notes:             existing?.notes             ?? "",
    temperature:       existing?.temperature       ?? "",
    weight_kg:         existing?.weight_kg         ?? "",
    height_cm:         existing?.height_cm         ?? "",
    blood_pressure:    existing?.blood_pressure    ?? "",
    pulse_rate:        existing?.pulse_rate        ?? "",
    spo2:              existing?.spo2              ?? "",
    referred_to:       existing?.referred_to       ?? "",
    referral_status:   existing?.referral_status   ?? "none",
    referral_letter:   existing?.referral_letter   ?? "",
    under_observation: existing?.under_observation ?? false,
    admitted_date:     existing?.admitted_date     ?? "",
    follow_up_date:    existing?.follow_up_date    ?? "",
    parent_notified:   existing?.parent_notified   ?? false,
  });

  const { data: students = [] } = useActiveStudents();

  const [stuSearch, setStuSearch] = useState(
    existing ? `${existing.students?.first_name ?? ""} ${existing.students?.last_name ?? ""}`.trim() : ""
  );
  const stuFiltered = useMemo(() => {
    if (!stuSearch.trim()) return students as any[];
    const q = stuSearch.toLowerCase();
    return (students as any[]).filter(s =>
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
      s.admission_no?.toLowerCase().includes(q)
    );
  }, [students, stuSearch]);

  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const payload: any = {
        ...f,
        attended_by: u.user?.id,
        temperature:  f.temperature  ? parseFloat(f.temperature)  : null,
        weight_kg:    f.weight_kg    ? parseFloat(f.weight_kg)    : null,
        height_cm:    f.height_cm    ? parseFloat(f.height_cm)    : null,
        pulse_rate:   f.pulse_rate   ? parseInt(f.pulse_rate)     : null,
        spo2:         f.spo2         ? parseInt(f.spo2)           : null,
      };
      // clean empty strings
      ["admitted_date","follow_up_date","blood_pressure","referred_to","referral_letter",
       "diagnosis","treatment","medications","notes","temperature","weight_kg","height_cm",
       "pulse_rate","spo2"].forEach(k => { if (!payload[k]) payload[k] = null; });
      if (!payload.under_observation) payload.admitted_date = null;
      if (payload.referral_status === "none") payload.referred_to = null;

      if (isEdit) {
        const { error } = await supabase.from("clinic_visits").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clinic_visits").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(isEdit ? "Visit updated" : "Visit logged"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit Visit" : "New Clinic Visit"}</DialogTitle>
      </DialogHeader>
      <div className="max-h-[75vh] overflow-y-auto pr-1 space-y-5">

        {/* Student */}
        <div className="space-y-1">
          <Label>Student *</Label>
          <Input
            placeholder="Search by name or admission no…"
            value={stuSearch}
            onChange={e => { setStuSearch(e.target.value); setF(p => ({ ...p, student_id: "" })); }}
          />
          {stuSearch && !f.student_id && stuFiltered.length > 0 && (
            <div className="border rounded-md mt-1 max-h-40 overflow-y-auto bg-popover shadow-md">
              {stuFiltered.slice(0,8).map((s: any) => (
                <button key={s.id} className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                  onClick={() => { setStuSearch(`${s.first_name} ${s.last_name}`); setF(p => ({ ...p, student_id: s.id })); }}>
                  <span className="font-medium">{s.first_name} {s.last_name}</span>
                  <span className="text-xs text-muted-foreground">{s.admission_no} · {s.classes?.name}</span>
                </button>
              ))}
            </div>
          )}
          {f.student_id && (
            <p className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />Student selected
            </p>
          )}
        </div>

        {/* Date/Time/Type */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>Visit Date</Label>
            <Input type="date" value={f.visit_date} onChange={e => setF(p => ({ ...p, visit_date: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Time</Label>
            <Input type="time" value={f.visit_time} onChange={e => setF(p => ({ ...p, visit_time: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={f.complaint_type} onValueChange={v => setF(p => ({ ...p, complaint_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COMPLAINT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Vitals */}
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Vitals</Label>
          <div className="grid grid-cols-3 gap-3 mt-2">
            <div className="space-y-1">
              <Label className="text-xs">Temp (°C)</Label>
              <Input type="number" step="0.1" placeholder="36.5" value={f.temperature} onChange={e => setF(p => ({ ...p, temperature: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">BP (mmHg)</Label>
              <Input placeholder="120/80" value={f.blood_pressure} onChange={e => setF(p => ({ ...p, blood_pressure: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Pulse (bpm)</Label>
              <Input type="number" placeholder="72" value={f.pulse_rate} onChange={e => setF(p => ({ ...p, pulse_rate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">SpO2 (%)</Label>
              <Input type="number" placeholder="98" value={f.spo2} onChange={e => setF(p => ({ ...p, spo2: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Weight (kg)</Label>
              <Input type="number" step="0.1" placeholder="55" value={f.weight_kg} onChange={e => setF(p => ({ ...p, weight_kg: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Height (cm)</Label>
              <Input type="number" placeholder="160" value={f.height_cm} onChange={e => setF(p => ({ ...p, height_cm: e.target.value }))} />
            </div>
          </div>
        </div>

        {/* Clinical notes */}
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Presenting Complaints / Symptoms *</Label>
            <Textarea rows={2} value={f.symptoms} onChange={e => setF(p => ({ ...p, symptoms: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Diagnosis</Label>
            <Textarea rows={2} value={f.diagnosis} onChange={e => setF(p => ({ ...p, diagnosis: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Treatment Given</Label>
            <Textarea rows={2} value={f.treatment} onChange={e => setF(p => ({ ...p, treatment: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Medications Dispensed</Label>
            <Input placeholder="e.g. Paracetamol 500mg × 6, ORS sachets × 2" value={f.medications} onChange={e => setF(p => ({ ...p, medications: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Clinical Notes</Label>
            <Textarea rows={2} value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>

        {/* Referral */}
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Referral</Label>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div className="space-y-1">
              <Label className="text-xs">Referred To</Label>
              <Input placeholder="Hospital / Specialist" value={f.referred_to} onChange={e => setF(p => ({ ...p, referred_to: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Referral Status</Label>
              <Select value={f.referral_status} onValueChange={v => setF(p => ({ ...p, referral_status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REFERRAL_STATUSES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {f.referred_to && (
            <div className="mt-2 space-y-1">
              <Label className="text-xs">Referral Letter Notes</Label>
              <Textarea rows={2} placeholder="Reason for referral, relevant history…" value={f.referral_letter} onChange={e => setF(p => ({ ...p, referral_letter: e.target.value }))} />
            </div>
          )}
        </div>

        {/* Observation / Follow-up */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Switch id="obs" checked={f.under_observation} onCheckedChange={v => setF(p => ({ ...p, under_observation: v }))} />
            <Label htmlFor="obs">Admit to Observation Ward</Label>
          </div>
          {f.under_observation && (
            <div className="space-y-1">
              <Label className="text-xs">Admission Date</Label>
              <Input type="date" value={f.admitted_date} onChange={e => setF(p => ({ ...p, admitted_date: e.target.value }))} />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Follow-Up Date</Label>
            <Input type="date" value={f.follow_up_date} onChange={e => setF(p => ({ ...p, follow_up_date: e.target.value }))} />
          </div>
          <div className="flex items-center gap-3">
            <Checkbox id="pnotify" checked={f.parent_notified} onCheckedChange={v => setF(p => ({ ...p, parent_notified: !!v }))} />
            <Label htmlFor="pnotify">Parent / Guardian notified</Label>
          </div>
        </div>
      </div>

      <DialogFooter className="mt-4">
        <Button onClick={() => m.mutate()} disabled={m.isPending || !f.student_id || !f.symptoms.trim()}>
          {m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
          {isEdit ? "Save Changes" : "Log Visit"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ═══════════════════════ STUDENT HISTORY SHEET ═══════════════════════ */

function StudentHistorySheet({ student }: { student: any }) {
  const { data: visits = [], isLoading } = useQuery({
    queryKey: ["clinic-history", student.id],
    queryFn: async () =>
      (await supabase.from("clinic_visits").select("*").eq("student_id", student.id)
        .order("visit_date", { ascending: false })).data ?? [],
    enabled: !!student?.id,
  });

  const { data: healthRecord } = useQuery({
    queryKey: ["health-record", student.id],
    queryFn: async () =>
      (await supabase.from("student_health_records").select("*").eq("student_id", student.id).single()).data,
    enabled: !!student?.id,
  });

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-3">
          {student.photo_url ? (
            <img src={student.photo_url} className="w-10 h-10 rounded-full object-cover" alt="" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold">
              {student.first_name?.[0]}{student.last_name?.[0]}
            </div>
          )}
          <div>
            <div>{student.first_name} {student.last_name}</div>
            <div className="text-xs font-normal text-muted-foreground">{student.admission_no} · {(visits as any[]).length} visit(s)</div>
          </div>
        </SheetTitle>
      </SheetHeader>

      {/* Permanent health record */}
      {healthRecord && (
        <div className="mt-4 p-3 border rounded-lg bg-muted/30 text-sm space-y-1">
          <div className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Health Profile</div>
          {healthRecord.blood_type && <div><span className="text-muted-foreground">Blood Type:</span> <strong>{healthRecord.blood_type}</strong></div>}
          {healthRecord.allergies && <div><span className="text-muted-foreground">Allergies:</span> {healthRecord.allergies}</div>}
          {healthRecord.chronic_conditions && <div><span className="text-muted-foreground">Conditions:</span> {healthRecord.chronic_conditions}</div>}
          {healthRecord.emergency_contact_name && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <Phone className="w-3 h-3" />{healthRecord.emergency_contact_name} · {healthRecord.emergency_contact_phone}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {isLoading ? <div className="flex justify-center"><Loader2 className="animate-spin" /></div>
          : (visits as any[]).length === 0 ? (
            <p className="text-sm text-muted-foreground">No clinic visits on record.</p>
          ) : (visits as any[]).map((v: any) => (
            <div key={v.id} className="border rounded-lg p-3 space-y-1.5 text-sm">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <div className="font-medium">{v.visit_date} {v.visit_time && `· ${v.visit_time.slice(0,5)}`}</div>
                {complainBadge(v.complaint_type ?? "illness")}
              </div>
              <div><span className="text-muted-foreground">Symptoms:</span> {v.symptoms}</div>
              {v.diagnosis && <div><span className="text-muted-foreground">Diagnosis:</span> {v.diagnosis}</div>}
              {v.treatment && <div><span className="text-muted-foreground">Treatment:</span> {v.treatment}</div>}
              {v.medications && <div className="flex items-center gap-1 text-xs"><Pill className="w-3 h-3" />{v.medications}</div>}
              {(v.temperature || v.blood_pressure || v.pulse_rate) && (
                <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
                  {v.temperature && <span><Thermometer className="w-3 h-3 inline" /> {v.temperature}°C</span>}
                  {v.blood_pressure && <span>BP: {v.blood_pressure}</span>}
                  {v.pulse_rate && <span>PR: {v.pulse_rate}bpm</span>}
                  {v.spo2 && <span>SpO2: {v.spo2}%</span>}
                </div>
              )}
              {v.under_observation && <Badge variant="outline" className="border-orange-400 text-orange-600 text-xs">Admitted {v.admitted_date}</Badge>}
              {v.discharge_date && <Badge variant="outline" className="border-green-500 text-green-600 text-xs">Discharged {v.discharge_date}</Badge>}
              {v.referred_to && <div className="text-xs text-muted-foreground flex items-center gap-1"><ArrowUpRight className="w-3 h-3" />Referred to {v.referred_to}</div>}
            </div>
          ))}
      </div>
    </>
  );
}

/* ═══════════════════════ HEALTH RECORDS TAB ═══════════════════════ */

function HealthRecordsTab({ can }: { can: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editRecord, setEditRecord] = useState<any>(null);
  const [editStudent, setEditStudent] = useState<any>(null);
  const [open, setOpen] = useState(false);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["health_records_all"],
    queryFn: async () =>
      (await supabase.from("student_health_records")
        .select("*, students(id,first_name,last_name,admission_no,photo_url,classes(name))")
        .order("created_at", { ascending: false })
      ).data ?? [],
  });

  const { data: students = [] } = useActiveStudents();

  const filtered = useMemo(() => {
    if (!search.trim()) return records as any[];
    const q = search.toLowerCase();
    return (records as any[]).filter(r =>
      `${r.students?.first_name} ${r.students?.last_name}`.toLowerCase().includes(q) ||
      r.students?.admission_no?.toLowerCase().includes(q)
    );
  }, [records, search]);

  const upsert = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from("student_health_records").upsert(data, { onConflict: "student_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["health_records_all"] });
      setOpen(false); setEditRecord(null); setEditStudent(null);
      toast.success("Health record saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search student…" className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {can && (
          <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditRecord(null); setEditStudent(null); } }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-2" />Add Health Record</Button>
            </DialogTrigger>
            <HealthRecordDialog
              students={students as any[]}
              existing={editRecord}
              existingStudent={editStudent}
              onDone={(data) => upsert.mutate(data)}
              isPending={upsert.isPending}
            />
          </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Blood Type</TableHead>
                  <TableHead>Allergies</TableHead>
                  <TableHead>Chronic Conditions</TableHead>
                  <TableHead>Emergency Contact</TableHead>
                  <TableHead>Insurance</TableHead>
                  {can && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No health records yet. Add one above.</TableCell></TableRow>
                )}
                {filtered.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {r.students?.photo_url ? (
                          <img src={r.students.photo_url} className="w-7 h-7 rounded-full object-cover" alt="" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                            {r.students?.first_name?.[0]}{r.students?.last_name?.[0]}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-sm">{r.students?.first_name} {r.students?.last_name}</div>
                          <div className="text-xs text-muted-foreground">{r.students?.classes?.name}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.blood_type ? <Badge variant="outline" className="font-mono">{r.blood_type}</Badge> : "—"}
                    </TableCell>
                    <TableCell className="text-sm max-w-[150px] truncate">{r.allergies ?? "None"}</TableCell>
                    <TableCell className="text-sm max-w-[150px] truncate">{r.chronic_conditions ?? "None"}</TableCell>
                    <TableCell className="text-xs">
                      {r.emergency_contact_name ? (
                        <div>
                          <div>{r.emergency_contact_name}</div>
                          <div className="text-muted-foreground">{r.emergency_contact_phone}</div>
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.insurance_provider ?? "—"}</TableCell>
                    {can && (
                      <TableCell>
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => { setEditRecord(r); setEditStudent(r.students); setOpen(true); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function HealthRecordDialog({ students, existing, existingStudent, onDone, isPending }: {
  students: any[]; existing?: any; existingStudent?: any;
  onDone: (data: any) => void; isPending: boolean;
}) {
  const [f, setF] = useState({
    student_id: existing?.student_id ?? existingStudent?.id ?? "",
    blood_type: existing?.blood_type ?? "",
    allergies: existing?.allergies ?? "",
    chronic_conditions: existing?.chronic_conditions ?? "",
    disabilities: existing?.disabilities ?? "",
    emergency_contact_name: existing?.emergency_contact_name ?? "",
    emergency_contact_phone: existing?.emergency_contact_phone ?? "",
    insurance_provider: existing?.insurance_provider ?? "",
    insurance_number: existing?.insurance_number ?? "",
    notes: existing?.notes ?? "",
  });

  const [stuSearch, setStuSearch] = useState(
    existingStudent ? `${existingStudent.first_name} ${existingStudent.last_name}` : ""
  );
  const stuFiltered = useMemo(() => {
    if (!stuSearch.trim()) return students;
    const q = stuSearch.toLowerCase();
    return students.filter(s =>
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
      s.admission_no?.toLowerCase().includes(q)
    );
  }, [students, stuSearch]);

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{existing ? "Edit Health Record" : "New Health Record"}</DialogTitle></DialogHeader>
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {!existing && (
          <div className="space-y-1">
            <Label>Student *</Label>
            <Input placeholder="Search student…" value={stuSearch}
              onChange={e => { setStuSearch(e.target.value); setF(p => ({ ...p, student_id: "" })); }} />
            {stuSearch && !f.student_id && (
              <div className="border rounded max-h-36 overflow-y-auto bg-popover shadow-md">
                {stuFiltered.slice(0, 6).map((s: any) => (
                  <button key={s.id} className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                    onClick={() => { setStuSearch(`${s.first_name} ${s.last_name}`); setF(p => ({ ...p, student_id: s.id })); }}>
                    {s.first_name} {s.last_name} <span className="text-xs text-muted-foreground">{s.admission_no}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="space-y-1">
          <Label>Blood Type</Label>
          <Select value={f.blood_type} onValueChange={v => setF(p => ({ ...p, blood_type: v }))}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>{BLOOD_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label>Allergies</Label><Textarea rows={2} placeholder="List any known allergies…" value={f.allergies} onChange={e => setF(p => ({ ...p, allergies: e.target.value }))} /></div>
        <div className="space-y-1"><Label>Chronic Conditions</Label><Textarea rows={2} placeholder="Asthma, diabetes, epilepsy…" value={f.chronic_conditions} onChange={e => setF(p => ({ ...p, chronic_conditions: e.target.value }))} /></div>
        <div className="space-y-1"><Label>Disabilities / Special Needs</Label><Input value={f.disabilities} onChange={e => setF(p => ({ ...p, disabilities: e.target.value }))} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Emergency Contact Name</Label><Input value={f.emergency_contact_name} onChange={e => setF(p => ({ ...p, emergency_contact_name: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Emergency Phone</Label><Input value={f.emergency_contact_phone} onChange={e => setF(p => ({ ...p, emergency_contact_phone: e.target.value }))} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Insurance Provider</Label><Input value={f.insurance_provider} onChange={e => setF(p => ({ ...p, insurance_provider: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Insurance Number</Label><Input value={f.insurance_number} onChange={e => setF(p => ({ ...p, insurance_number: e.target.value }))} /></div>
        </div>
        <div className="space-y-1"><Label>Notes</Label><Textarea rows={2} value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} /></div>
      </div>
      <DialogFooter>
        <Button onClick={() => onDone(f)} disabled={isPending || !f.student_id}>
          {isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save Record
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ═══════════════════════ INVENTORY TAB ═══════════════════════ */

function InventoryTab({ inventory, can }: { inventory: any[]; can: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [f, setF] = useState({ name: "", category: "medicine", unit: "tablets", quantity: 0, reorder_level: 10, expiry_date: "", notes: "" });

  const resetForm = () => setF({ name: "", category: "medicine", unit: "tablets", quantity: 0, reorder_level: 10, expiry_date: "", notes: "" });

  const upsert = useMutation({
    mutationFn: async () => {
      const payload: any = { ...f };
      if (!payload.expiry_date) payload.expiry_date = null;
      if (!payload.notes) payload.notes = null;
      if (editItem) {
        const { error } = await supabase.from("clinic_inventory").update(payload).eq("id", editItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clinic_inventory").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clinic_inventory"] }); setOpen(false); setEditItem(null); resetForm(); toast.success("Item saved"); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("clinic_inventory").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clinic_inventory"] }); toast.success("Item removed"); },
    onError: (e: any) => toast.error(e.message),
  });

  const adjustQty = useMutation({
    mutationFn: async ({ id, delta }: { id: string; delta: number }) => {
      const item = inventory.find(i => i.id === id);
      if (!item) return;
      const { error } = await supabase.from("clinic_inventory").update({ quantity: Math.max(0, item.quantity + delta) }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clinic_inventory"] }),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />Medicine & Supply Inventory
        </h2>
        {can && (
          <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditItem(null); resetForm(); } }}>
            <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-2" />Add Item</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editItem ? "Edit Item" : "Add Inventory Item"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name *</Label><Input value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Paracetamol 500mg" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Category</Label>
                    <Select value={f.category} onValueChange={v => setF(p => ({ ...p, category: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["medicine","bandage","equipment","supplement","other"].map(c =>
                          <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Unit</Label>
                    <Select value={f.unit} onValueChange={v => setF(p => ({ ...p, unit: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["tablets","capsules","ml","sachets","pieces","boxes","bottles"].map(u =>
                          <SelectItem key={u} value={u} className="capitalize">{u}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Quantity</Label><Input type="number" min={0} value={f.quantity} onChange={e => setF(p => ({ ...p, quantity: +e.target.value }))} /></div>
                  <div><Label>Reorder Level</Label><Input type="number" min={0} value={f.reorder_level} onChange={e => setF(p => ({ ...p, reorder_level: +e.target.value }))} /></div>
                </div>
                <div><Label>Expiry Date</Label><Input type="date" value={f.expiry_date} onChange={e => setF(p => ({ ...p, expiry_date: e.target.value }))} /></div>
                <div><Label>Notes</Label><Textarea rows={2} value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} /></div>
              </div>
              <DialogFooter>
                <Button onClick={() => upsert.mutate()} disabled={upsert.isPending || !f.name.trim()}>
                  {upsert.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {inventory.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No inventory items yet. Add medicines and supplies above.</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {inventory.map((item: any) => {
            const isLow = item.quantity <= item.reorder_level;
            const isOut = item.quantity === 0;
            const isExpiring = item.expiry_date && new Date(item.expiry_date) < new Date(Date.now() + 30 * 86400000);
            return (
              <Card key={item.id} className={isOut ? "border-red-400" : isLow ? "border-orange-300" : ""}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">{item.name}</div>
                      <div className="text-xs text-muted-foreground capitalize">{item.category} · {item.unit}</div>
                    </div>
                    {can && (
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-6 w-6"
                          onClick={() => { setEditItem(item); setF({ name: item.name, category: item.category, unit: item.unit, quantity: item.quantity, reorder_level: item.reorder_level, expiry_date: item.expiry_date ?? "", notes: item.notes ?? "" }); setOpen(true); }}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => remove.mutate(item.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => adjustQty.mutate({ id: item.id, delta: -1 })}>
                        <TrendingDown className="w-3 h-3" />
                      </Button>
                      <span className={`text-lg font-bold ${isOut ? "text-red-600" : isLow ? "text-orange-500" : "text-green-600"}`}>
                        {item.quantity}
                      </span>
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => adjustQty.mutate({ id: item.id, delta: 1 })}>
                        <TrendingUp className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">Min: {item.reorder_level}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {isOut && <Badge variant="destructive" className="text-xs">Out of stock</Badge>}
                    {!isOut && isLow && <Badge variant="outline" className="border-orange-400 text-orange-600 text-xs">Low stock</Badge>}
                    {isExpiring && <Badge variant="outline" className="border-yellow-500 text-yellow-600 text-xs">Expiring {item.expiry_date}</Badge>}
                    {!isLow && !isExpiring && <Badge variant="outline" className="border-green-500 text-green-600 text-xs">In stock</Badge>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
