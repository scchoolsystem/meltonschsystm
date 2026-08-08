import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, CheckCircle, XCircle, Users, ScanLine, Camera, Printer, IdCard as IdCardIcon, ParkingSquare, LogIn, LogOut, MessageSquareWarning, UserCheck, Car, AlertTriangle, Search, ShieldCheck, Inbox, Download } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useTenant } from "@/hooks/use-tenant";
import { StudentCombobox } from "@/components/StudentCombobox";
import { useActiveStudents } from "@/lib/students.functions";
import { useServerFn } from "@tanstack/react-start";
import { logStudentGateScan } from "@/lib/gate-scan.functions";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";

export const Route = createFileRoute("/_app/security")({ component: () => (<FeatureGate feature="security"><Page /></FeatureGate>) });

// A single stat in the live overview strip. The value pops with a small
// scale/fade whenever it changes (keyed on the value itself), so a fresh
// scan or checkout at any terminal visibly registers here in real time
// rather than just silently updating.
function LiveStat({ icon: Icon, label, value, tone = "default", sub }: { icon: any; label: string; value: number | string; tone?: "default" | "warn" | "danger"; sub?: string }) {
  const accent =
    tone === "danger" ? "before:bg-destructive" :
    tone === "warn" ? "before:bg-amber-500" :
    "before:bg-primary";
  const chipClasses =
    tone === "danger" ? "bg-destructive/10 text-destructive" :
    tone === "warn" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
    "bg-primary/10 text-primary";
  return (
    <Card className={`relative overflow-hidden pl-1 transition-all hover:-translate-y-0.5 hover:shadow-md before:absolute before:inset-y-0 before:left-0 before:w-1 ${accent}`}>
      <CardContent className="pt-4 pb-4 flex items-center gap-3">
        <div className={`shrink-0 rounded-full p-2 ${chipClasses}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={String(value)}
              initial={{ opacity: 0, y: -6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.25 }}
              className="text-2xl font-bold leading-none tabular-nums"
            >
              {value}
            </motion.div>
          </AnimatePresence>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate mt-1">{label}{sub && <span className="ml-1 normal-case font-normal">{sub}</span>}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// Friendly, in-voice empty state for a table/list — an invitation to act
// rather than a bare "no data" message.
function EmptyState({ icon: Icon = Inbox, title, hint }: { icon?: any; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="rounded-full bg-muted p-3"><Icon className="w-5 h-5 text-muted-foreground" /></div>
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {hint && <p className="text-xs text-muted-foreground max-w-xs">{hint}</p>}
    </div>
  );
}

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const { school } = useTenant();
  const can = isAdmin || hasRole("security_admin") || hasRole("security_user");
  const canManageBays = isAdmin || hasRole("security_admin");

  const { data: gatePasses = [], isLoading: gpLoading } = useQuery({
    queryKey: ["gate-passes-all"],
    queryFn: async () => (await supabase.from("gate_passes").select("*, students(first_name,last_name,admission_no)").order("exit_time", { ascending: false }).limit(100)).data ?? [],
  });
  const { data: visitors = [] } = useQuery({
    queryKey: ["visitor-log"],
    queryFn: async () => (await supabase.from("visitor_log").select("*").order("time_in", { ascending: false }).limit(100)).data ?? [],
  });
  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicle-log"],
    queryFn: async () => (await supabase.from("vehicle_log").select("*").order("time_in", { ascending: false }).limit(100)).data ?? [],
  });
  const { data: totalStudents = 0 } = useQuery({
    queryKey: ["total-active-students"],
    queryFn: async () => { const { count } = await supabase.from("students").select("id", { count: "exact", head: true }).eq("status", "active"); return count ?? 0; },
  });

  const { data: allCards = [] } = useQuery({
    queryKey: ["access-cards"],
    queryFn: async () => (await supabase.from("access_cards").select("*").order("card_code")).data ?? [],
  });

  const { data: incidents = [] } = useQuery({
    queryKey: ["security-incidents"],
    queryFn: async () => (await supabase.from("security_incidents").select("*").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  const openIncidents = useMemo(() => (incidents as any[]).filter(i => i.status === "open"), [incidents]);
  const activePanics = useMemo(() => openIncidents.filter(i => i.type === "panic"), [openIncidents]);

  const prevPanicCount = useRef(0);
  useEffect(() => {
    if (activePanics.length > prevPanicCount.current) {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        [880, 660].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = freq;
          osc.type = "sine";
          gain.gain.setValueAtTime(0.001, ctx.currentTime + i * 0.22);
          gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.22 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.22 + 0.2);
          osc.connect(gain).connect(ctx.destination);
          osc.start(ctx.currentTime + i * 0.22);
          osc.stop(ctx.currentTime + i * 0.22 + 0.22);
        });
      } catch { /* audio not available — the visual banner still shows */ }
    }
    prevPanicCount.current = activePanics.length;
  }, [activePanics.length]);

  const pendingPasses = useMemo(() => (gatePasses as any[]).filter(g => g.status === "pending"), [gatePasses]);
  const openGatePasses = useMemo(() => (gatePasses as any[]).filter(g => g.status === "out" && !g.actual_return), [gatePasses]);
  const overdueGatePasses = useMemo(
    () => openGatePasses.filter(g => g.expected_return && new Date(g.expected_return).getTime() < Date.now()),
    [openGatePasses]
  );
  const studentsOnCampus = (typeof totalStudents === "number" ? totalStudents : 0) - openGatePasses.length;
  const visitorsOnSite = useMemo(() => (visitors as any[]).filter(v => !v.time_out).length, [visitors]);
  const vehiclesOnSite = useMemo(() => (vehicles as any[]).filter(v => !v.time_out).length, [vehicles]);
  const cardsInUse = useMemo(() => (allCards as any[]).filter(c => c.status === "assigned").length, [allCards]);

  // Live updates: every open Security tab — front gate, parking booth,
  // admin office — reflects new scans, check-ins, and checkouts within a
  // second or two, without anyone hitting refresh. Requires these tables
  // to be on the supabase_realtime publication (see
  // 20260807010000_security_realtime.sql).
  useEffect(() => {
    if (!school?.id) return;
    const invalidate = (keys: string[]) => keys.forEach(k => qc.invalidateQueries({ queryKey: [k] }));
    const ch = supabase
      .channel(`security-live-${school.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "access_cards", filter: `school_id=eq.${school.id}` },
        () => invalidate(["access-cards"]))
      .on("postgres_changes", { event: "*", schema: "public", table: "card_assignments", filter: `school_id=eq.${school.id}` },
        () => invalidate(["access-cards", "active-bay-assignments"]))
      .on("postgres_changes", { event: "*", schema: "public", table: "parking_slots", filter: `school_id=eq.${school.id}` },
        () => invalidate(["parking-slots", "parking-bays", "parking-bays-free"]))
      .on("postgres_changes", { event: "*", schema: "public", table: "gate_passes", filter: `school_id=eq.${school.id}` },
        () => invalidate(["gate-passes-all"]))
      .on("postgres_changes", { event: "*", schema: "public", table: "visitor_log", filter: `school_id=eq.${school.id}` },
        () => invalidate(["visitor-log"]))
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicle_log", filter: `school_id=eq.${school.id}` },
        () => invalidate(["vehicle-log"]))
      .on("postgres_changes", { event: "*", schema: "public", table: "student_gate_scans", filter: `school_id=eq.${school.id}` },
        () => invalidate(["student-gate-scans-recent"]))
      .on("postgres_changes", { event: "*", schema: "public", table: "security_incidents", filter: `school_id=eq.${school.id}` },
        () => invalidate(["security-incidents"]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [school?.id, qc]);

  const approvalMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("gate_passes").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gate-passes-all"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const returnMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("gate_passes").update({ actual_return: new Date().toISOString(), status: "returned" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Marked as returned"); qc.invalidateQueries({ queryKey: ["gate-passes-all"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const timeOutMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("checkout_visitor_log", { p_visitor_log_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visitor-log"] });
      qc.invalidateQueries({ queryKey: ["access-cards"] });
      qc.invalidateQueries({ queryKey: ["parking-bays"] });
      qc.invalidateQueries({ queryKey: ["parking-slots"] });
      qc.invalidateQueries({ queryKey: ["parking-bays-free"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const vehicleTimeOutMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("checkout_vehicle_log", { p_vehicle_log_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicle-log"] });
      qc.invalidateQueries({ queryKey: ["access-cards"] });
      qc.invalidateQueries({ queryKey: ["parking-bays"] });
      qc.invalidateQueries({ queryKey: ["parking-slots"] });
      qc.invalidateQueries({ queryKey: ["parking-bays-free"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [addEntry, setAddEntry] = useState(false);
  const [addGatePass, setAddGatePass] = useState(false);
  const [exportDay, setExportDay] = useState(false);
  const [activeTab, setActiveTab] = useState("scan");
  const [flagTarget, setFlagTarget] = useState<{ name: string; idNumber?: string | null } | null>(null);

  const panicMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("security_incidents").insert({
        school_id: school?.id,
        type: "panic",
        severity: "critical",
        title: "Panic alert triggered at the gate",
        status: "open",
        reported_by: (await supabase.auth.getUser()).data.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Panic alert sent — visible to everyone on this page"); qc.invalidateQueries({ queryKey: ["security-incidents"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const [visitorSearch, setVisitorSearch] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [lastIssued, setLastIssued] = useState<{ code: string; name: string; type: string; vehicleReg?: string | null } | null>(null);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 text-primary p-2.5 shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Security</h1>
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                Live
              </span>
            </div>
            <p className="text-sm text-muted-foreground">Gate control, visitor &amp; vehicle logging, parking, and campus access</p>
          </div>
        </div>
        {can && (
          <div className="flex gap-2">
            <Dialog open={addEntry} onOpenChange={setAddEntry}><DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Log Entry</Button></DialogTrigger>
              <LogEntryDialog onDone={(issued) => {
                setAddEntry(false);
                setLastIssued(issued);
                qc.invalidateQueries({ queryKey: ["access-cards"] });
                qc.invalidateQueries({ queryKey: ["parking-bays"] });
                qc.invalidateQueries({ queryKey: ["parking-slots"] });
                qc.invalidateQueries({ queryKey: ["parking-bays-free"] });
                qc.invalidateQueries({ queryKey: ["visitor-log"] });
                qc.invalidateQueries({ queryKey: ["vehicle-log"] });
              }} />
            </Dialog>
            <Dialog open={addGatePass} onOpenChange={setAddGatePass}>
              <DialogTrigger asChild><Button variant="outline"><Plus className="w-4 h-4 mr-2" />Log Gate Pass</Button></DialogTrigger>
              <LogGatePassDialog schoolId={school?.id} onDone={() => { setAddGatePass(false); qc.invalidateQueries({ queryKey: ["gate-passes-all"] }); }} />
            </Dialog>
            <Dialog open={exportDay} onOpenChange={setExportDay}>
              <DialogTrigger asChild><Button variant="outline"><Download className="w-4 h-4 mr-2" />Export Day</Button></DialogTrigger>
              <DailyLogDialog schoolName={school?.name ?? "School"} />
            </Dialog>
            <Button
              variant="destructive"
              onClick={() => { if (confirm("Send a panic alert? This notifies everyone with the Security page open right now.")) panicMutation.mutate(); }}
              disabled={panicMutation.isPending}
            >
              <AlertTriangle className="w-4 h-4 mr-2" />Panic
            </Button>
          </div>
        )}
      </div>

      <QuickFind
        onJump={(tab, prefill) => {
          setActiveTab(tab);
          if (tab === "visitors") setVisitorSearch(prefill ?? "");
          if (tab === "vehicles") setVehicleSearch(prefill ?? "");
        }}
      />

      <AnimatePresence>
        {activePanics.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="rounded-lg border border-destructive bg-destructive text-destructive-foreground px-4 py-3 flex items-center gap-3 animate-pulse">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <div className="text-sm font-medium">
                {activePanics.length === 1 ? "Panic alert active" : `${activePanics.length} panic alerts active`} — go to the Incidents tab to acknowledge.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <LiveStat icon={Users} label="On campus" value={studentsOnCampus} sub={`(${openGatePasses.length} out)`} />
        <LiveStat icon={UserCheck} label="Visitors on site" value={visitorsOnSite} />
        <LiveStat icon={Car} label="Vehicles on site" value={vehiclesOnSite} />
        <LiveStat icon={IdCardIcon} label="Cards in use" value={cardsInUse} sub={`/ ${(allCards as any[]).length}`} />
        <LiveStat
          icon={overdueGatePasses.length > 0 ? AlertTriangle : CheckCircle}
          label="Overdue gate passes"
          value={overdueGatePasses.length}
          tone={overdueGatePasses.length > 0 ? "danger" : "default"}
        />
        <LiveStat
          icon={AlertTriangle}
          label="Open incidents"
          value={openIncidents.length}
          tone={activePanics.length > 0 ? "danger" : openIncidents.length > 0 ? "warn" : "default"}
        />
      </div>

      <AnimatePresence>
        {lastIssued && (
          <motion.div initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <Card className="border-emerald-500/40 bg-emerald-500/5">
              <CardContent className="pt-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Hand this card to them</div>
                  <div className="text-2xl font-bold font-mono text-red-600 dark:text-red-500">{lastIssued.code}</div>
                  <div className="text-sm font-medium mt-0.5">
                    {lastIssued.name}
                    <span className="text-muted-foreground font-normal"> · {lastIssued.type === "vehicle" ? "Driver" : "Visitor"}</span>
                    {lastIssued.vehicleReg && <span className="text-muted-foreground font-normal"> · {lastIssued.vehicleReg}</span>}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setLastIssued(null)}>Dismiss</Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap h-auto gap-0.5 p-1">
          <TabsTrigger value="scan" className="gap-1 shrink-0"><ScanLine className="w-3.5 h-3.5" />Scan</TabsTrigger>
          <TabsTrigger value="studentgate" className="gap-1 shrink-0"><LogIn className="w-3.5 h-3.5" />Student Gate</TabsTrigger>
          <TabsTrigger value="cards" className="gap-1 shrink-0"><IdCardIcon className="w-3.5 h-3.5" />Badges</TabsTrigger>
          <TabsTrigger value="parking" className="gap-1 shrink-0"><ParkingSquare className="w-3.5 h-3.5" />Parking</TabsTrigger>
          <TabsTrigger value="gatepasses" className="shrink-0">
            Gate Pass Queue
            {pendingPasses.length > 0 && <Badge variant="destructive" className="ml-2">{pendingPasses.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="allpasses" className="shrink-0">All Gate Passes</TabsTrigger>
          <TabsTrigger value="visitors" className="shrink-0">Visitors</TabsTrigger>
          <TabsTrigger value="vehicles" className="shrink-0">Vehicles</TabsTrigger>
          <TabsTrigger value="incidents" className="gap-1.5 shrink-0">
            Incidents
            {openIncidents.length > 0 && <Badge variant={activePanics.length > 0 ? "destructive" : "secondary"} className="h-4 px-1.5 text-[10px]">{openIncidents.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scan">
          <ScanTab can={can} />
        </TabsContent>

        <TabsContent value="studentgate">
          <StudentGateTab />
        </TabsContent>

        <TabsContent value="cards">
          <CardsTab can={can} />
        </TabsContent>

        <TabsContent value="parking">
          <ParkingTab can={canManageBays} />
        </TabsContent>

        <TabsContent value="gatepasses">
          <Card><CardHeader><CardTitle className="text-base">Pending Gate Pass Approvals</CardTitle></CardHeader><CardContent>
            {gpLoading ? <Loader2 className="animate-spin mx-auto" /> : pendingPasses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No pending gate passes.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Reason</TableHead><TableHead>Exit Time</TableHead><TableHead>Return Time</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {pendingPasses.map((g: any) => (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{g.students?.first_name} {g.students?.last_name}<div className="text-xs text-muted-foreground">{g.students?.admission_no}</div></TableCell>
                      <TableCell>{g.reason}</TableCell>
                      <TableCell className="text-xs">{g.exit_time ? new Date(g.exit_time).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-xs">{g.actual_return ? new Date(g.actual_return).toLocaleString() : "—"}</TableCell>
                      <TableCell>
                        {can && (
                          <div className="flex gap-2">
                            <Button size="sm" className="h-8 gap-1" onClick={() => approvalMutation.mutate({ id: g.id, status: "approved" })}><CheckCircle className="w-3 h-3" />Approve</Button>
                            <Button size="sm" variant="destructive" className="h-8 gap-1" onClick={() => approvalMutation.mutate({ id: g.id, status: "denied" })}><XCircle className="w-3 h-3" />Deny</Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="allpasses">
          <Card><CardHeader /><CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Reason</TableHead><TableHead>Exit</TableHead><TableHead>Return</TableHead><TableHead>Status</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {(gatePasses as any[]).length === 0 && <TableRow><TableCell colSpan={6}><EmptyState title="No gate passes yet" hint="Passes logged for students leaving campus will show up here." /></TableCell></TableRow>}
                {(gatePasses as any[]).map((g: any) => {
                  const isOverdue = g.status === "out" && !g.actual_return && g.expected_return && new Date(g.expected_return).getTime() < Date.now();
                  return (
                  <TableRow key={g.id} className={isOverdue ? "bg-destructive/5" : undefined}>
                    <TableCell className="font-medium">{g.students?.first_name} {g.students?.last_name}</TableCell>
                    <TableCell>{g.reason}</TableCell>
                    <TableCell className="text-xs">{g.exit_time ? new Date(g.exit_time).toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-xs">{g.actual_return ? new Date(g.actual_return).toLocaleString() : "—"}</TableCell>
                    <TableCell className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant={g.status === "out" ? "destructive" : g.status === "returned" ? "secondary" : g.status === "denied" ? "outline" : "default"}>{g.status}</Badge>
                      {isOverdue && <Badge variant="outline" className="border-destructive/50 text-destructive gap-1"><AlertTriangle className="w-3 h-3" />overdue</Badge>}
                    </TableCell>
                    <TableCell>
                      {can && g.status === "out" && !g.actual_return && <Button size="sm" variant="outline" className="h-8" onClick={() => returnMutation.mutate(g.id)}>Mark Returned</Button>}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="visitors">
          <Card><CardHeader className="flex-row items-center justify-between gap-3 flex-wrap space-y-0">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{visitorsOnSite} on site</Badge>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8 h-8" placeholder="Search visitors…" value={visitorSearch} onChange={e => setVisitorSearch(e.target.value)} />
            </div>
          </CardHeader><CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Visitor</TableHead><TableHead>ID No</TableHead><TableHead>Visiting</TableHead><TableHead>Purpose</TableHead><TableHead>Time In</TableHead><TableHead>Time Out</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {(() => {
                  const q = visitorSearch.trim().toLowerCase();
                  const filtered = q ? (visitors as any[]).filter(v => [v.visitor_name, v.id_number, v.visiting, v.purpose].some((f: any) => f?.toLowerCase?.().includes(q))) : (visitors as any[]);
                  if (filtered.length === 0) return <TableRow><TableCell colSpan={7}><EmptyState icon={UserCheck} title={q ? "No matching visitors" : "No visitor logs yet"} hint={q ? "Try a different name, ID, or purpose." : "Entries from Log Entry will appear here."} /></TableCell></TableRow>;
                  return filtered.map((v: any) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.visitor_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{v.id_number ?? "—"}</TableCell>
                      <TableCell>{v.visiting ?? "—"}</TableCell>
                      <TableCell>{v.purpose ?? "—"}</TableCell>
                      <TableCell className="text-xs">{new Date(v.time_in).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{v.time_out ? new Date(v.time_out).toLocaleString() : <Badge variant="secondary">On campus</Badge>}</TableCell>
                      <TableCell className="space-x-2">
                        {can && !v.time_out && <Button size="sm" variant="outline" className="h-8" onClick={() => timeOutMutation.mutate(v.id)}>Sign Out</Button>}
                        {can && <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" onClick={() => setFlagTarget({ name: v.visitor_name, idNumber: v.id_number })}>Flag</Button>}
                      </TableCell>
                    </TableRow>
                  ));
                })()}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="vehicles">
          <Card><CardHeader className="flex-row items-center justify-between gap-3 flex-wrap space-y-0">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{vehiclesOnSite} on site</Badge>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8 h-8" placeholder="Search vehicles…" value={vehicleSearch} onChange={e => setVehicleSearch(e.target.value)} />
            </div>
          </CardHeader><CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Reg</TableHead><TableHead>Driver</TableHead><TableHead>Purpose</TableHead><TableHead>Time In</TableHead><TableHead>Time Out</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {(() => {
                  const q = vehicleSearch.trim().toLowerCase();
                  const filtered = q ? (vehicles as any[]).filter(v => [v.vehicle_reg, v.driver_name, v.purpose].some((f: any) => f?.toLowerCase?.().includes(q))) : (vehicles as any[]);
                  if (filtered.length === 0) return <TableRow><TableCell colSpan={6}><EmptyState icon={Car} title={q ? "No matching vehicles" : "No vehicle logs yet"} hint={q ? "Try a different reg, driver, or purpose." : "Entries from Log Entry will appear here."} /></TableCell></TableRow>;
                  return filtered.map((v: any) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.vehicle_reg}</TableCell>
                    <TableCell>{v.driver_name ?? "—"}</TableCell>
                    <TableCell>{v.purpose ?? "—"}</TableCell>
                    <TableCell className="text-xs">{new Date(v.time_in).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{v.time_out ? new Date(v.time_out).toLocaleString() : <Badge variant="secondary">On campus</Badge>}</TableCell>
                    <TableCell className="space-x-2">
                      {can && !v.time_out && <Button size="sm" variant="outline" className="h-8" onClick={() => vehicleTimeOutMutation.mutate(v.id)}>Log Exit</Button>}
                      {can && <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" onClick={() => setFlagTarget({ name: v.driver_name || v.vehicle_reg, idNumber: v.vehicle_reg })}>Flag</Button>}
                    </TableCell>
                  </TableRow>
                  ));
                })()}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="incidents">
          <IncidentsTab can={can} incidents={incidents as any[]} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!flagTarget} onOpenChange={o => !o && setFlagTarget(null)}>
        {flagTarget && (
          <FlagPersonDialog
            target={flagTarget}
            schoolId={school?.id}
            onDone={() => { setFlagTarget(null); qc.invalidateQueries({ queryKey: ["security-incidents"] }); }}
          />
        )}
      </Dialog>
    </div>
  );
}

// ============================================================
// Shared bay-matching helper — used by both the unified Log Entry
// dialog and the Scan tab's issue form. Bays are zoned by bay_type
// (general/visitor/staff/delivery); this just ranks free bays so the
// zone matching the vehicle/purpose shows up first and gets
// pre-selected, without hiding the others in case the guard needs
// to override it.
// ============================================================

function inferBayType(vehicleType: string, purpose: string): string {
  const p = (purpose || "").toLowerCase();
  if (vehicleType === "lorry" || /deliver|supply|stock|goods|store/.test(p)) return "delivery";
  if (/staff|teacher|employee/.test(p)) return "staff";
  return "visitor";
}

function rankBaysByType(bays: any[], preferredType: string): any[] {
  const rank = (t: string) => (t === preferredType ? 0 : t === "general" ? 1 : 2);
  return [...bays].sort((a, b) => rank(a.bay_type) - rank(b.bay_type) || a.bay_code.localeCompare(b.bay_code));
}

const VEHICLE_TYPES = [
  { value: "car", label: "Car" },
  { value: "motorbike", label: "Motorbike" },
  { value: "van", label: "Van" },
  { value: "lorry", label: "Lorry / Truck" },
  { value: "other", label: "Other" },
];

function LogEntryDialog({ onDone }: { onDone: (issued: { code: string; name: string; type: string; vehicleReg?: string | null }) => void }) {
  const [f, setF] = useState({ holder_name: "", id_number: "", visiting: "", purpose: "" });
  const [hasVehicle, setHasVehicle] = useState(false);
  const [vehicleType, setVehicleType] = useState("car");
  const [vehicleReg, setVehicleReg] = useState("");
  const [bayId, setBayId] = useState("");

  const preferredType = useMemo(() => inferBayType(vehicleType, f.purpose), [vehicleType, f.purpose]);

  // Live watchlist check: debounced against name/id/vehicle reg so a guard
  // sees an open flag before they finish issuing the card, not after.
  const [watchQuery, setWatchQuery] = useState<{ name: string; idNumber: string; vehicleReg: string }>({ name: "", idNumber: "", vehicleReg: "" });
  useEffect(() => {
    const t = setTimeout(() => setWatchQuery({ name: f.holder_name.trim(), idNumber: f.id_number.trim(), vehicleReg: vehicleReg.trim() }), 350);
    return () => clearTimeout(t);
  }, [f.holder_name, f.id_number, vehicleReg]);

  const { data: watchHits = [] } = useQuery({
    queryKey: ["watchlist-check", watchQuery.name, watchQuery.idNumber, watchQuery.vehicleReg],
    queryFn: async () => {
      const terms = [watchQuery.name, watchQuery.idNumber, watchQuery.vehicleReg].filter(t => t.length >= 2);
      if (terms.length === 0) return [];
      const or = terms.flatMap(t => [`related_name.ilike.%${t}%`, `related_id_number.ilike.%${t}%`]).join(",");
      return (await supabase.from("security_incidents").select("*").eq("type", "flagged_visitor").eq("status", "open").or(or)).data ?? [];
    },
    enabled: watchQuery.name.length >= 2 || watchQuery.idNumber.length >= 2 || watchQuery.vehicleReg.length >= 2,
  });

  // Same class of bug as the gate pass one: nothing stops the same reg
  // being logged in twice while it's still on site, which would leave two
  // open vehicle_log rows with no clean way to know which one a "Log Exit"
  // should close. Warn as soon as a match shows up.
  const { data: alreadyOnSite } = useQuery({
    queryKey: ["vehicle-onsite-check", watchQuery.vehicleReg],
    queryFn: async () => (await supabase.from("vehicle_log").select("id, time_in, driver_name").eq("vehicle_reg", watchQuery.vehicleReg).is("time_out", null).maybeSingle()).data ?? null,
    enabled: hasVehicle && watchQuery.vehicleReg.length >= 3,
  });

  const { data: freeBays = [] } = useQuery({
    queryKey: ["parking-bays-free"],
    queryFn: async () => (await supabase.from("parking_bay_availability").select("*").eq("bay_status", "free").gt("free_slots", 0).order("bay_code")).data ?? [],
    enabled: hasVehicle,
  });

  const rankedBays = useMemo(() => rankBaysByType(freeBays as any[], preferredType), [freeBays, preferredType]);

  // Auto-select the top-ranked bay whenever the ranking changes and nothing's
  // been explicitly chosen yet, so the common case needs zero extra clicks.
  useEffect(() => {
    if (hasVehicle && !bayId && rankedBays.length > 0) setBayId(rankedBays[0].bay_id);
  }, [hasVehicle, rankedBays, bayId]);

  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("issue_card_assignment", {
        p_card_id: null,
        p_holder_type: hasVehicle && !f.visiting ? "vehicle" : "visitor",
        p_holder_name: f.holder_name,
        p_id_number: f.id_number || null,
        p_visiting: f.visiting || null,
        p_purpose: f.purpose || null,
        p_vehicle_reg: hasVehicle ? (vehicleReg || null) : null,
        p_vehicle_type: hasVehicle ? vehicleType : null,
        p_parking_bay_id: hasVehicle && bayId ? bayId : null,
      });
      if (error) throw error;
      return data?.[0];
    },
    onSuccess: (row) => {
      toast.success("Entry logged");
      onDone({
        code: row?.card_code ?? "—",
        name: f.holder_name,
        type: hasVehicle ? "vehicle" : "visitor",
        vehicleReg: hasVehicle ? vehicleReg : null,
      });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Log Entry</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Name *</Label><Input required autoFocus value={f.holder_name} onChange={e => setF(p => ({ ...p, holder_name: e.target.value }))} /></div>
        <div><Label>ID Number</Label><Input value={f.id_number} onChange={e => setF(p => ({ ...p, id_number: e.target.value }))} /></div>

        {(watchHits as any[]).length > 0 && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-2.5 space-y-1">
            <div className="flex items-center gap-1.5 text-sm font-medium text-destructive"><AlertTriangle className="w-4 h-4" />Watchlist match</div>
            {(watchHits as any[]).map(h => (
              <div key={h.id} className="text-xs text-muted-foreground">{h.title}{h.details ? ` — ${h.details}` : ""}</div>
            ))}
          </div>
        )}

        <div><Label>Visiting</Label><Input value={f.visiting} onChange={e => setF(p => ({ ...p, visiting: e.target.value }))} placeholder="Who / which office" /></div>
        <div><Label>Purpose</Label><Input value={f.purpose} onChange={e => setF(p => ({ ...p, purpose: e.target.value }))} /></div>

        <div className="flex items-center gap-2">
          <Checkbox id="has-vehicle" checked={hasVehicle} onCheckedChange={c => setHasVehicle(c === true)} />
          <Label htmlFor="has-vehicle" className="font-normal">Has a vehicle</Label>
        </div>

        {hasVehicle && (
          <>
            <div>
              <Label>Vehicle Type</Label>
              <Select value={vehicleType} onValueChange={v => { setVehicleType(v); setBayId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{VEHICLE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Vehicle Reg *</Label><Input required value={vehicleReg} onChange={e => setVehicleReg(e.target.value)} /></div>
            {alreadyOnSite && (
              <div className="rounded-md border border-destructive/50 bg-destructive/5 p-2.5 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-destructive">Already on site</span> — this reg checked in at {new Date(alreadyOnSite.time_in).toLocaleTimeString()}{alreadyOnSite.driver_name ? ` (${alreadyOnSite.driver_name})` : ""} and hasn't logged an exit yet.
                </div>
              </div>
            )}
            <div>
              <Label>Parking Bay</Label>
              <Select value={bayId} onValueChange={setBayId}>
                <SelectTrigger><SelectValue placeholder={rankedBays.length ? "Choose a free bay" : "No free bays"} /></SelectTrigger>
                <SelectContent>
                  {rankedBays.map(b => (
                    <SelectItem key={b.bay_id} value={b.bay_id}>
                      {b.bay_code}{b.zone ? ` — ${b.zone}` : ""} · {b.free_slots} free {b.bay_type === preferredType ? "· suggested" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        <DialogFooter>
          <Button type="submit" disabled={m.isPending || !!alreadyOnSite}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Log in & issue card</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

// ============================================================
// Log Gate Pass — a guard logging a student leaving campus in
// person. Written straight in as status "out" (that's the real
// default/lifecycle for this table) rather than routed through
// a pending-approval queue, since the guard is standing right
// there authorizing it.
// ============================================================

function LogGatePassDialog({ onDone, schoolId }: { onDone: () => void; schoolId?: string }) {
  const [studentId, setStudentId] = useState("");
  const [reason, setReason] = useState("");
  const [expectedReturn, setExpectedReturn] = useState("");
  const { data: students = [] } = useActiveStudents();

  // Guard against logging a second exit for a student who's already off
  // campus — easy to do by accident at a busy gate, and it would leave two
  // "out" rows with no way to tell which one a return should close.
  const { data: existingOpenPass } = useQuery({
    queryKey: ["open-gate-pass-check", studentId],
    queryFn: async () => (await supabase.from("gate_passes").select("id, exit_time, reason").eq("student_id", studentId).eq("status", "out").is("actual_return", null).maybeSingle()).data ?? null,
    enabled: !!studentId,
  });

  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("gate_passes").insert({
        student_id: studentId,
        reason,
        expected_return: expectedReturn ? new Date(expectedReturn).toISOString() : null,
        exit_time: new Date().toISOString(),
        status: "out",
        authorized_by: u.user?.id,
        school_id: schoolId,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Gate pass logged"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Log Gate Pass</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div>
          <Label>Student *</Label>
          <StudentCombobox value={studentId} onChange={setStudentId} students={students as any[]} />
        </div>
        {existingOpenPass && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-2.5 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-destructive">Already off-campus</span> — left at {new Date(existingOpenPass.exit_time).toLocaleTimeString()} for "{existingOpenPass.reason}". Mark that pass returned first, in All Gate Passes.
            </div>
          </div>
        )}
        <div><Label>Reason *</Label><Input required autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="Medical appointment, home early, etc." /></div>
        <div><Label>Expected Return</Label><Input type="datetime-local" value={expectedReturn} onChange={e => setExpectedReturn(e.target.value)} /></div>
        <p className="text-xs text-muted-foreground">Exit time is recorded as now. The student is on record as off-campus until this pass is marked returned.</p>
        <DialogFooter>
          <Button type="submit" disabled={m.isPending || !studentId || !!existingOpenPass}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Log exit</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

// ============================================================
// Scan tab — the core new capability. A guard scans (USB scanner
// or camera) or types a card_code; the UI branches on the card's
// current status. Fast, minimal-click, kiosk-friendly.
// ============================================================

type ScanResult = { card: any; assignment: any | null } | null;

function ScanTab({ can }: { can: boolean }) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<ScanResult>(null);
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [result, notFoundCode]);

  const lookupMutation = useMutation({
    mutationFn: async (cardCode: string): Promise<ScanResult | "not_found"> => {
      const trimmed = cardCode.trim();
      const { data: card, error } = await supabase.from("access_cards").select("*").eq("card_code", trimmed).maybeSingle();
      if (error) throw error;
      if (!card) return "not_found";
      if (card.status === "assigned") {
        const { data: assignment, error: aErr } = await supabase
          .from("card_assignments")
          .select("*, parking_slots(slot_number, parking_bays(bay_code,zone))")
          .eq("card_id", card.id)
          .is("checked_out_at", null)
          .maybeSingle();
        if (aErr) throw aErr;
        return { card, assignment };
      }
      return { card, assignment: null };
    },
    onSuccess: (res, cardCode) => {
      if (res === "not_found") { setNotFoundCode(cardCode.trim()); setResult(null); }
      else { setNotFoundCode(null); setResult(res); }
      setCode("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const checkoutMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.rpc("checkout_card_assignment", { p_assignment_id: assignmentId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Card checked out and cleared");
      qc.invalidateQueries({ queryKey: ["parking-bays"] });
      qc.invalidateQueries({ queryKey: ["parking-slots"] });
      qc.invalidateQueries({ queryKey: ["parking-bays-free"] });
      qc.invalidateQueries({ queryKey: ["access-cards"] });
      qc.invalidateQueries({ queryKey: ["visitor-log"] });
      qc.invalidateQueries({ queryKey: ["vehicle-log"] });
      reset();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const reset = () => { setResult(null); setNotFoundCode(null); setCode(""); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || lookupMutation.isPending) return;
    lookupMutation.mutate(code);
  };

  const handleDetected = (text: string) => {
    setCameraOpen(false);
    if (!text.trim() || lookupMutation.isPending) return;
    lookupMutation.mutate(text);
  };

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ScanLine className="w-4 h-4" />Scan a card</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={handleSubmit} className="flex gap-2">
            {/* USB/Bluetooth handheld scanners behave like a keyboard: they type
               the decoded string fast, then send Enter — which submits this form
               natively, no extra keystroke-timing logic needed. */}
            <Input
              ref={inputRef}
              autoFocus
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="Scan or type card code (e.g. SDV-000427)"
              className="font-mono"
            />
            <Button type="submit" disabled={lookupMutation.isPending}>
              {lookupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Look up"}
            </Button>
          </form>
          {!cameraOpen ? (
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setCameraOpen(true)}>
              <Camera className="w-3.5 h-3.5" />Scan with camera
            </Button>
          ) : (
            <CameraScanner onDetected={handleDetected} onClose={() => setCameraOpen(false)} />
          )}
        </CardContent>
      </Card>

      {notFoundCode && (
        <Card className="border-destructive/40">
          <CardContent className="pt-4 text-center space-y-2">
            <XCircle className="w-8 h-8 text-destructive mx-auto" />
            <p className="font-medium">Unknown card</p>
            <p className="text-sm text-muted-foreground">"{notFoundCode}" doesn't match any printed card. Check the code and try again.</p>
            <Button variant="outline" size="sm" onClick={reset}>Try again</Button>
          </CardContent>
        </Card>
      )}

      {result?.card?.status === "retired" && (
        <Card className="border-destructive/40">
          <CardContent className="pt-4 text-center space-y-2">
            <XCircle className="w-8 h-8 text-destructive mx-auto" />
            <p className="font-medium">This card has been retired</p>
            <p className="text-sm text-muted-foreground font-mono">{result.card.card_code}</p>
            <Button variant="outline" size="sm" onClick={reset}>Scan another</Button>
          </CardContent>
        </Card>
      )}

      {result?.card?.status === "available" && (
        can ? (
          <IssueCardForm card={result.card} onDone={() => {
            qc.invalidateQueries({ queryKey: ["access-cards"] });
            qc.invalidateQueries({ queryKey: ["parking-bays"] });
            qc.invalidateQueries({ queryKey: ["parking-slots"] });
            qc.invalidateQueries({ queryKey: ["parking-bays-free"] });
            qc.invalidateQueries({ queryKey: ["visitor-log"] });
            qc.invalidateQueries({ queryKey: ["vehicle-log"] });
            reset();
          }} onCancel={reset} />
        ) : (
          <Card className="border-emerald-500/30"><CardContent className="pt-4 text-center space-y-1">
            <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto" />
            <p className="font-medium font-mono">{result.card.card_code}</p>
            <p className="text-sm text-muted-foreground">Available — ready to issue.</p>
          </CardContent></Card>
        )
      )}

      {result?.card?.status === "assigned" && result.assignment && (
        <HolderPanel
          card={result.card}
          assignment={result.assignment}
          can={can}
          checkingOut={checkoutMutation.isPending}
          onCheckout={() => checkoutMutation.mutate(result.assignment.id)}
          onDismiss={reset}
        />
      )}
    </div>
  );
}

function IssueCardForm({ card, onDone, onCancel }: { card: any; onDone: () => void; onCancel: () => void }) {
  const [holderType, setHolderType] = useState<"visitor" | "vehicle">("visitor");
  const [broughtVehicle, setBroughtVehicle] = useState(false);
  const [f, setF] = useState({ holder_name: "", id_number: "", visiting: "", purpose: "", vehicle_reg: "", parking_bay_id: "" });

  const needsBay = holderType === "vehicle" || broughtVehicle;

  const { data: freeBays = [] } = useQuery({
    queryKey: ["parking-bays-free"],
    queryFn: async () => (await supabase.from("parking_bay_availability").select("*").eq("bay_status", "free").gt("free_slots", 0).order("bay_code")).data ?? [],
    enabled: needsBay,
  });

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("issue_card_assignment", {
        p_card_id: card.id,
        p_holder_type: holderType,
        p_holder_name: f.holder_name,
        p_id_number: f.id_number || null,
        p_visiting: f.visiting || null,
        p_purpose: f.purpose || null,
        p_vehicle_reg: needsBay ? (f.vehicle_reg || null) : null,
        p_parking_bay_id: needsBay && f.parking_bay_id ? f.parking_bay_id : null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(`${card.card_code} issued`); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="font-mono">{card.card_code}</span>
          <Badge variant="secondary">Available — issue now</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <RadioGroup value={holderType} onValueChange={v => setHolderType(v as "visitor" | "vehicle")} className="flex gap-6">
            <div className="flex items-center gap-2"><RadioGroupItem value="visitor" id="ht-visitor" /><Label htmlFor="ht-visitor" className="font-normal">Visitor (on foot)</Label></div>
            <div className="flex items-center gap-2"><RadioGroupItem value="vehicle" id="ht-vehicle" /><Label htmlFor="ht-vehicle" className="font-normal">Driver / vehicle</Label></div>
          </RadioGroup>

          <div><Label>Name *</Label><Input required autoFocus value={f.holder_name} onChange={e => setF(p => ({ ...p, holder_name: e.target.value }))} /></div>
          <div><Label>ID Number</Label><Input value={f.id_number} onChange={e => setF(p => ({ ...p, id_number: e.target.value }))} /></div>
          <div><Label>Visiting</Label><Input value={f.visiting} onChange={e => setF(p => ({ ...p, visiting: e.target.value }))} placeholder="Who / which office" /></div>
          <div><Label>Purpose</Label><Input value={f.purpose} onChange={e => setF(p => ({ ...p, purpose: e.target.value }))} /></div>

          {holderType === "visitor" && (
            <div className="flex items-center gap-2">
              <Checkbox id="brought-vehicle" checked={broughtVehicle} onCheckedChange={c => setBroughtVehicle(c === true)} />
              <Label htmlFor="brought-vehicle" className="font-normal">Brought a vehicle</Label>
            </div>
          )}

          {needsBay && (
            <>
              <div><Label>Vehicle Reg{holderType === "vehicle" ? " *" : ""}</Label><Input required={holderType === "vehicle"} value={f.vehicle_reg} onChange={e => setF(p => ({ ...p, vehicle_reg: e.target.value }))} /></div>
              <div>
                <Label>Parking Bay</Label>
                <Select value={f.parking_bay_id} onValueChange={v => setF(p => ({ ...p, parking_bay_id: v }))}>
                  <SelectTrigger><SelectValue placeholder={(freeBays as any[]).length ? "Choose a free bay" : "No free bays"} /></SelectTrigger>
                  <SelectContent>
                    {(freeBays as any[]).map(b => <SelectItem key={b.bay_id} value={b.bay_id}>{b.bay_code}{b.zone ? ` — ${b.zone}` : ""} · {b.free_slots} free</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Issue this card</Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function HolderPanel({ card, assignment, can, checkingOut, onCheckout, onDismiss }: {
  card: any; assignment: any; can: boolean; checkingOut: boolean; onCheckout: () => void; onDismiss: () => void;
}) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const tick = () => {
      const mins = Math.max(0, Math.floor((Date.now() - new Date(assignment.checked_in_at).getTime()) / 60000));
      setElapsed(mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [assignment.checked_in_at]);

  const slot = assignment.parking_slots;
  const bay = slot?.parking_bays;

  return (
    <Card className="border-amber-500/40">
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="font-mono">{card.card_code}</span>
          <Badge>Currently held</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{assignment.holder_name}</span></div>
          <div><span className="text-muted-foreground">Type:</span> {assignment.holder_type === "vehicle" ? "Driver" : "Visitor"}</div>
          <div><span className="text-muted-foreground">ID No:</span> {assignment.id_number ?? "—"}</div>
          <div><span className="text-muted-foreground">Visiting:</span> {assignment.visiting ?? "—"}</div>
          <div className="col-span-2"><span className="text-muted-foreground">Purpose:</span> {assignment.purpose ?? "—"}</div>
          <div><span className="text-muted-foreground">Vehicle:</span> {assignment.vehicle_reg ?? "—"}</div>
          <div><span className="text-muted-foreground">Parking:</span> {bay ? `${bay.bay_code} · slot ${slot.slot_number}${bay.zone ? ` (${bay.zone})` : ""}` : "—"}</div>
          <div className="col-span-2"><span className="text-muted-foreground">Checked in:</span> {new Date(assignment.checked_in_at).toLocaleTimeString()} · {elapsed} ago</div>
        </div>
        <div className="flex gap-2 pt-2">
          {can && (
            <Button variant="destructive" className="flex-1" onClick={onCheckout} disabled={checkingOut}>
              {checkingOut && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Check out & clear card
            </Button>
          )}
          <Button variant="outline" onClick={onDismiss}>Close</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CameraScanner({ onDetected, onClose }: { onDetected: (text: string) => void; onClose: () => void }) {
  const containerId = useRef(`qr-reader-${Math.random().toString(36).slice(2)}`).current;
  const scannerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Html5Qrcode(containerId);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 220 },
          (decodedText: string) => onDetected(decodedText),
          () => { /* per-frame decode misses are expected, ignore */ },
        );
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Couldn't access the camera. Check permissions.");
      }
    })();
    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) {
        s.stop().then(() => s.clear()).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <div id={containerId} className="w-full max-w-xs mx-auto rounded-md overflow-hidden border" />
      )}
      <Button variant="outline" size="sm" className="w-full" onClick={onClose}>Cancel</Button>
    </div>
  );
}

// ============================================================
// Student Gate tab — scan a student's ID (their existing card QR
// encodes /verify?code=<unique_id>, plain admission numbers work too)
// to sign them in or out. Direction toggles automatically off their
// own last scan. Parent gets an SMS the moment the scan is logged.
// Distinct from the Gate Pass flow above: this is the everyday
// "scan at the gate" attendance log, not a pre-authorized leave.
// ============================================================

function StudentGateTab() {
  const qc = useQueryClient();
  const logScan = useServerFn(logStudentGateScan);
  const [code, setCode] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof logScan>> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, [lastResult]);

  const { data: recent = [] } = useQuery({
    queryKey: ["student-gate-scans-recent"],
    queryFn: async () => (await supabase.from("student_gate_scans").select("*, students(first_name,last_name,admission_no)").order("scanned_at", { ascending: false }).limit(15)).data ?? [],
  });

  const scanMutation = useMutation({
    mutationFn: (scannedCode: string) => logScan({ data: { scannedCode } }),
    onSuccess: (res) => {
      setLastResult(res);
      setCode("");
      if (!res.found) toast.error("No student matches that code");
      qc.invalidateQueries({ queryKey: ["student-gate-scans-recent"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || scanMutation.isPending) return;
    scanMutation.mutate(code);
  };

  const handleDetected = (text: string) => {
    setCameraOpen(false);
    if (!text.trim() || scanMutation.isPending) return;
    scanMutation.mutate(text);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ScanLine className="w-4 h-4" />Scan student ID</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                ref={inputRef}
                autoFocus
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="Scan ID card or type admission no."
                className="font-mono"
              />
              <Button type="submit" disabled={scanMutation.isPending}>
                {scanMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Log"}
              </Button>
            </form>
            {!cameraOpen ? (
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setCameraOpen(true)}>
                <Camera className="w-3.5 h-3.5" />Scan with camera
              </Button>
            ) : (
              <CameraScanner onDetected={handleDetected} onClose={() => setCameraOpen(false)} />
            )}
          </CardContent>
        </Card>

        {lastResult && (
          lastResult.found ? (
            <Card className={lastResult.direction === "in" ? "border-emerald-500/40" : "border-amber-500/40"}>
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center gap-2">
                  {lastResult.direction === "in" ? <LogIn className="w-6 h-6 text-emerald-500" /> : <LogOut className="w-6 h-6 text-amber-500" />}
                  <div>
                    <div className="font-semibold">{lastResult.student.name}</div>
                    <div className="text-xs text-muted-foreground">{lastResult.student.admissionNo}{lastResult.student.className ? ` · ${lastResult.student.className}` : ""}</div>
                  </div>
                </div>
                <Badge variant={lastResult.direction === "in" ? "default" : "secondary"}>
                  {lastResult.direction === "in" ? "Signed in" : "Signed out"}
                </Badge>
                {lastResult.notified ? (
                  <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" />Parent notified by SMS</p>
                ) : (
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><MessageSquareWarning className="w-3.5 h-3.5" />Not notified — {lastResult.notifyError ?? "unknown reason"}</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-destructive/40">
              <CardContent className="pt-4 text-center space-y-1">
                <XCircle className="w-8 h-8 text-destructive mx-auto" />
                <p className="font-medium">No student found for that code</p>
              </CardContent>
            </Card>
          )
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent scans</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Direction</TableHead><TableHead>Time</TableHead><TableHead>Notified</TableHead></TableRow></TableHeader>
            <TableBody>
              {(recent as any[]).length === 0 && <TableRow><TableCell colSpan={4}><EmptyState icon={ScanLine} title="No scans yet" hint="Scan a student ID above to log them in or out." /></TableCell></TableRow>}
              {(recent as any[]).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.students?.first_name} {r.students?.last_name}<div className="text-xs text-muted-foreground">{r.students?.admission_no}</div></TableCell>
                  <TableCell><Badge variant={r.direction === "in" ? "default" : "secondary"}>{r.direction === "in" ? "In" : "Out"}</Badge></TableCell>
                  <TableCell className="text-xs">{new Date(r.scanned_at).toLocaleTimeString()}</TableCell>
                  <TableCell>{r.notified ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <MessageSquareWarning className="w-4 h-4 text-muted-foreground" />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Badges (Cards) tab — bulk-generate the printed card inventory
// and produce a print-ready QR sheet. Cards are immutable once
// printed; the only lifecycle action here is retiring a lost card.
// ============================================================

function CardsTab({ can }: { can: boolean }) {
  const qc = useQueryClient();
  const { school } = useTenant();
  const [qty, setQty] = useState("1000");
  const [printBatch, setPrintBatch] = useState<any[] | null>(null);
  const [reportCard, setReportCard] = useState<any | null>(null);

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ["access-cards"],
    queryFn: async () => (await supabase.from("access_cards").select("*").order("card_code")).data ?? [],
  });

  const counts = useMemo(() => {
    const c = { available: 0, assigned: 0, retired: 0, lost: 0, stolen: 0 } as Record<string, number>;
    (cards as any[]).forEach(row => { c[row.status] = (c[row.status] ?? 0) + 1; });
    return c;
  }, [cards]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const n = Math.max(1, Math.min(5000, Number(qty) || 0));
      const existingCodes = (cards as any[]).map(c => c.card_code as string).filter(c => /^SDV-\d+$/.test(c));
      const maxSeq = existingCodes.reduce((mx, c) => Math.max(mx, parseInt(c.split("-")[1], 10)), 0);
      const rows = Array.from({ length: n }, (_, i) => ({
        card_code: `SDV-${String(maxSeq + i + 1).padStart(6, "0")}`,
        status: "available",
      }));
      const { data, error } = await supabase.from("access_cards").insert(rows).select("*");
      if (error) throw error;
      return data ?? [];
    },
    onSuccess: (data) => { toast.success(`${data.length} card${data.length === 1 ? "" : "s"} generated`); qc.invalidateQueries({ queryKey: ["access-cards"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const retireMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("access_cards").update({ status: "retired" }).eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Card retired"); qc.invalidateQueries({ queryKey: ["access-cards"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const statusVariant = (s: string) =>
    s === "available" ? "secondary" : s === "assigned" ? "default" : s === "lost" || s === "stolen" ? "destructive" : "outline";

  return (
    <div className="space-y-4">
      {can && (
        <Card>
          <CardHeader><CardTitle className="text-base">Generate cards</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div><Label>Quantity</Label><Input type="number" min={1} max={5000} className="w-32" value={qty} onChange={e => setQty(e.target.value)} /></div>
            <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
              {generateMutation.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Generate
            </Button>
            <Button variant="outline" onClick={() => setPrintBatch(cards as any[])} disabled={(cards as any[]).length === 0}>
              <Printer className="w-4 h-4 mr-2" />Print sheet ({(cards as any[]).length})
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3 text-sm flex-wrap">
        <Badge variant="secondary">{counts.available ?? 0} available</Badge>
        <Badge>{counts.assigned ?? 0} assigned</Badge>
        <Badge variant="outline">{counts.retired ?? 0} retired</Badge>
        {(counts.lost > 0 || counts.stolen > 0) && (
          <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" />{(counts.lost ?? 0) + (counts.stolen ?? 0)} lost/stolen</Badge>
        )}
      </div>

      <Card><CardHeader /><CardContent>
        {isLoading ? <Loader2 className="animate-spin mx-auto" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Status</TableHead>{can && <TableHead className="text-right">Action</TableHead>}</TableRow></TableHeader>
            <TableBody>
              {(cards as any[]).length === 0 && <TableRow><TableCell colSpan={3}><EmptyState icon={IdCardIcon} title="No cards generated yet" hint="Generate a batch above to start issuing badges." /></TableCell></TableRow>}
              {(cards as any[]).slice(0, 200).map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono">{c.card_code}</TableCell>
                  <TableCell><Badge variant={statusVariant(c.status)}>{c.status}</Badge></TableCell>
                  {can && (
                    <TableCell className="text-right space-x-2">
                      {c.status !== "retired" && c.status !== "lost" && c.status !== "stolen" && (
                        <>
                          <Button size="sm" variant="outline" className="h-8" onClick={() => retireMutation.mutate(c.id)}>Retire</Button>
                          <Button size="sm" variant="outline" className="h-8 text-destructive hover:text-destructive" onClick={() => setReportCard(c)}>Report Lost/Stolen</Button>
                        </>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {(cards as any[]).length > 200 && (
          <p className="text-xs text-muted-foreground text-center pt-2">Showing first 200 of {(cards as any[]).length}. Use "Print sheet" for the full batch.</p>
        )}
      </CardContent></Card>

      {printBatch && <PrintSheet cards={printBatch} schoolName={school?.name ?? "School"} onClose={() => setPrintBatch(null)} />}

      <Dialog open={!!reportCard} onOpenChange={o => !o && setReportCard(null)}>
        {reportCard && (
          <ReportCardLostDialog
            card={reportCard}
            onDone={() => {
              setReportCard(null);
              qc.invalidateQueries({ queryKey: ["access-cards"] });
              qc.invalidateQueries({ queryKey: ["security-incidents"] });
              qc.invalidateQueries({ queryKey: ["parking-bays"] });
              qc.invalidateQueries({ queryKey: ["parking-slots"] });
              qc.invalidateQueries({ queryKey: ["visitor-log"] });
              qc.invalidateQueries({ queryKey: ["vehicle-log"] });
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function ReportCardLostDialog({ card, onDone }: { card: any; onDone: () => void }) {
  const [type, setType] = useState<"lost" | "stolen">("lost");
  const [details, setDetails] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("report_card_lost", { p_card_id: card.id, p_type: type, p_details: details || null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(`Card reported ${type}`); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Report Card {card.card_code}</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div>
          <Label>Type *</Label>
          <Select value={type} onValueChange={v => setType(v as "lost" | "stolen")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="lost">Lost / misplaced</SelectItem>
              <SelectItem value="stolen">Stolen</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Details</Label><Input value={details} onChange={e => setDetails(e.target.value)} placeholder="Where/when it went missing, etc." /></div>
        {card.status === "assigned" && (
          <p className="text-xs text-muted-foreground">This card is currently assigned — reporting it will check out the current holder, freeing their parking slot and closing their visitor/vehicle log entry.</p>
        )}
        <DialogFooter>
          <Button type="submit" variant="destructive" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Report {type}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function PrintSheet({ cards, schoolName, onClose }: { cards: any[]; schoolName: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-background overflow-auto">
      <div className="print:hidden sticky top-0 bg-background border-b p-3 flex items-center justify-between z-10">
        <div className="font-medium">Print sheet — {cards.length} card{cards.length === 1 ? "" : "s"}</div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" />Print</Button>
        </div>
      </div>
      <div className="p-6 grid grid-cols-2 gap-4 max-w-3xl mx-auto print:max-w-none print:mx-0 print:grid-cols-2">
        {cards.map(c => (
          <div key={c.id} className="border rounded-lg p-3 flex items-center gap-3 break-inside-avoid">
            <div className="bg-white p-1 rounded border shrink-0">
              <QRCodeSVG value={c.card_code} size={64} level="M" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate">{schoolName}</div>
              <div className="text-[10px] text-muted-foreground tracking-wide">ACCESS CARD</div>
              <div className="font-mono text-sm font-bold mt-1">{c.card_code}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Parking tab — live bay occupancy board. Bay CRUD is admin-only;
// occupancy itself only ever changes through issue/checkout above.
// ============================================================

function ParkingTab({ can }: { can: boolean }) {
  const qc = useQueryClient();
  const { school } = useTenant();
  const [addBay, setAddBay] = useState(false);
  const [editCapacity, setEditCapacity] = useState<any | null>(null);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["parking-bays"] });
    qc.invalidateQueries({ queryKey: ["parking-slots"] });
  };

  const { data: bays = [], isLoading } = useQuery({
    queryKey: ["parking-bays"],
    queryFn: async () => (await supabase.from("parking_bays").select("*").order("bay_code")).data ?? [],
  });

  const { data: slots = [] } = useQuery({
    queryKey: ["parking-slots"],
    queryFn: async () => (await supabase.from("parking_slots").select("*").order("slot_number")).data ?? [],
  });

  // Every occupant is looked up by the specific slot they hold, not the bay —
  // several holders can be "in" the same bay/lot at once now.
  const { data: activeAssignments = [] } = useQuery({
    queryKey: ["active-bay-assignments"],
    queryFn: async () => (await supabase.from("card_assignments").select("*, access_cards(card_code)").is("checked_out_at", null).not("parking_slot_id", "is", null)).data ?? [],
  });

  const bySlot = useMemo(() => {
    const m = new Map<string, any>();
    (activeAssignments as any[]).forEach(a => m.set(a.parking_slot_id, a));
    return m;
  }, [activeAssignments]);

  const slotsByBay = useMemo(() => {
    const m = new Map<string, any[]>();
    (slots as any[]).forEach(s => { const arr = m.get(s.bay_id) ?? []; arr.push(s); m.set(s.bay_id, arr); });
    return m;
  }, [slots]);

  const slotStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("parking_slots").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Slot updated"); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });

  const bayStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("parking_bays").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Bay updated"); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });

  const allSlots = slots as any[];
  const free = allSlots.filter(s => s.status === "free").length;
  const occupied = allSlots.filter(s => s.status === "occupied").length;
  const outOfService = allSlots.filter(s => s.status === "out_of_service").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-3 text-sm">
          <Badge variant="secondary">{free} free</Badge>
          <Badge>{occupied} occupied</Badge>
          {outOfService > 0 && <Badge variant="outline">{outOfService} out of service</Badge>}
        </div>
        {can && (
          <Dialog open={addBay} onOpenChange={setAddBay}>
            <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-2" />Bay</Button></DialogTrigger>
            <BayDialog schoolId={school?.id} onDone={() => { setAddBay(false); invalidateAll(); }} />
          </Dialog>
        )}
      </div>

      {isLoading ? <Loader2 className="animate-spin mx-auto" /> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(bays as any[]).map(b => {
            const bSlots = (slotsByBay.get(b.id) ?? []).slice().sort((x, y) => x.slot_number - y.slot_number);
            const bFree = bSlots.filter(s => s.status === "free").length;
            return (
              <Card key={b.id} className={`transition-shadow hover:shadow-md ${b.status === "out_of_service" ? "opacity-70" : ""}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <div>
                      {b.bay_code}
                      {b.zone && <span className="text-xs font-normal text-muted-foreground ml-2">{b.zone}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{bFree}/{bSlots.length} free</Badge>
                      {b.status === "out_of_service" && <Badge variant="outline">bay disabled</Badge>}
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {bSlots.map(s => {
                      const assignment = bySlot.get(s.id);
                      const color = s.status === "occupied" ? "bg-amber-500/15 border-amber-500/50 text-amber-700 dark:text-amber-400"
                        : s.status === "out_of_service" ? "bg-muted border-border text-muted-foreground"
                        : "bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-400";
                      return (
                        <div
                          key={s.id}
                          title={assignment ? `${assignment.holder_name} · ${assignment.vehicle_reg ?? "—"} · card ${assignment.access_cards?.card_code ?? "—"}` : s.status === "out_of_service" ? "Out of service" : "Free"}
                          className={`w-14 h-14 rounded-md border flex flex-col items-center justify-center text-xs font-medium transition-transform hover:scale-105 ${color}`}
                        >
                          <span className="font-semibold flex items-center gap-0.5">{assignment && <Car className="w-2.5 h-2.5" />}#{s.slot_number}</span>
                          {assignment ? (
                            <span className="text-[10px] leading-tight text-center px-0.5 truncate max-w-[3.2rem]">{assignment.vehicle_reg ?? assignment.holder_name}</span>
                          ) : (
                            <span className="text-[10px] leading-tight">{s.status === "out_of_service" ? "n/a" : "free"}</span>
                          )}
                        </div>
                      );
                    })}
                    {bSlots.length === 0 && <p className="text-xs text-muted-foreground">No slots configured.</p>}
                  </div>

                  {can && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditCapacity(b)}>
                        Edit slot count
                      </Button>
                      {b.status !== "out_of_service" ? (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bayStatusMutation.mutate({ id: b.id, status: "out_of_service" })}>
                          Disable whole bay
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bayStatusMutation.mutate({ id: b.id, status: "free" })}>
                          Reactivate bay
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {(bays as any[]).length === 0 && <p className="text-sm text-muted-foreground col-span-full py-8 text-center">No parking bays configured yet.</p>}
        </div>
      )}

      <Dialog open={!!editCapacity} onOpenChange={o => !o && setEditCapacity(null)}>
        {editCapacity && (
          <BayCapacityDialog
            bay={editCapacity}
            onDone={() => { setEditCapacity(null); invalidateAll(); }}
          />
        )}
      </Dialog>
    </div>
  );
}

function BayDialog({ onDone, schoolId }: { onDone: () => void; schoolId?: string }) {
  const [f, setF] = useState({ bay_code: "", zone: "", bay_type: "general", total_slots: "1" });
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("create_parking_bay", {
        p_school_id: schoolId,
        p_bay_code: f.bay_code,
        p_zone: f.zone || null,
        p_bay_type: f.bay_type,
        p_total_slots: Number(f.total_slots) || 1,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Bay added"); onDone(); }, onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent><DialogHeader><DialogTitle>Add Parking Bay</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Bay / Lot Name *</Label><Input required value={f.bay_code} onChange={e => setF(p => ({ ...p, bay_code: e.target.value }))} placeholder="Front Lobby" /></div>
        <div><Label>Zone</Label><Input value={f.zone} onChange={e => setF(p => ({ ...p, zone: e.target.value }))} placeholder="Front lot" /></div>
        <div>
          <Label>Bay Type</Label>
          <Select value={f.bay_type} onValueChange={v => setF(p => ({ ...p, bay_type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="visitor">Visitor</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
              <SelectItem value="delivery">Delivery</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Number of Slots *</Label><Input required type="number" min={1} value={f.total_slots} onChange={e => setF(p => ({ ...p, total_slots: e.target.value }))} placeholder="10" /></div>
        <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function BayCapacityDialog({ bay, onDone }: { bay: any; onDone: () => void }) {
  const [totalSlots, setTotalSlots] = useState(String(bay.total_slots ?? 1));
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("set_bay_total_slots", { p_bay_id: bay.id, p_total_slots: Number(totalSlots) || 1 });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Slot count updated"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Edit Slot Count — {bay.bay_code}</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div>
          <Label>Number of Slots *</Label>
          <Input required type="number" min={1} value={totalSlots} onChange={e => setTotalSlots(e.target.value)} />
          <p className="text-xs text-muted-foreground mt-1">Shrinking will fail if any of the slots being removed are currently occupied.</p>
        </div>
        <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

// ============================================================
// Incidents — unified log behind lost/stolen cards, flagged
// visitors/vehicles, and panic alerts. Realtime-backed so a
// panic alert or a fresh flag shows up here on every other open
// Security tab within a second or two.
// ============================================================

function IncidentsTab({ can, incidents }: { can: boolean; incidents: any[] }) {
  const qc = useQueryClient();
  const [showResolved, setShowResolved] = useState(false);

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("security_incidents").update({ status: "resolved", resolved_by: u.user?.id, resolved_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Marked resolved"); qc.invalidateQueries({ queryKey: ["security-incidents"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const visible = showResolved ? incidents : incidents.filter(i => i.status === "open");

  const typeLabel: Record<string, string> = { lost_card: "Lost card", stolen_card: "Stolen card", flagged_visitor: "Flagged", panic: "Panic", other: "Other" };
  const severityVariant = (s: string) => s === "critical" || s === "high" ? "destructive" : s === "medium" ? "default" : "secondary";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-2 text-sm">
          <Badge variant={incidents.some(i => i.status === "open") ? "destructive" : "secondary"}>{incidents.filter(i => i.status === "open").length} open</Badge>
          <Badge variant="outline">{incidents.filter(i => i.status === "resolved").length} resolved</Badge>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowResolved(s => !s)}>{showResolved ? "Hide resolved" : "Show resolved"}</Button>
      </div>

      <div className="space-y-2">
        {visible.length === 0 && (
          <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No {showResolved ? "" : "open "}incidents.</CardContent></Card>
        )}
        {visible.map(i => (
          <Card key={i.id} className={i.status === "open" && (i.severity === "critical" || i.severity === "high") ? "border-destructive/50" : undefined}>
            <CardContent className="pt-4 flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={severityVariant(i.severity)}>{typeLabel[i.type] ?? i.type}</Badge>
                  <Badge variant="outline" className="capitalize">{i.severity}</Badge>
                  {i.status === "resolved" && <Badge variant="secondary">resolved</Badge>}
                </div>
                <div className="font-medium">{i.title}</div>
                {i.details && <div className="text-sm text-muted-foreground">{i.details}</div>}
                {(i.related_name || i.related_id_number) && (
                  <div className="text-xs text-muted-foreground">{[i.related_name, i.related_id_number].filter(Boolean).join(" · ")}</div>
                )}
                <div className="text-xs text-muted-foreground">{new Date(i.created_at).toLocaleString()}</div>
              </div>
              {can && i.status === "open" && (
                <Button size="sm" variant="outline" onClick={() => resolveMutation.mutate(i.id)}>Resolve</Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function FlagPersonDialog({ target, schoolId, onDone }: { target: { name: string; idNumber?: string | null }; schoolId?: string; onDone: () => void }) {
  const [severity, setSeverity] = useState("medium");
  const [details, setDetails] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("security_incidents").insert({
        school_id: schoolId,
        type: "flagged_visitor",
        severity,
        title: `Flagged: ${target.name}`,
        details: details || null,
        related_name: target.name,
        related_id_number: target.idNumber || null,
        reported_by: u.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Flag recorded"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Flag {target.name}</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div>
          <Label>Severity</Label>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low — note for the record</SelectItem>
              <SelectItem value="medium">Medium — watch next time</SelectItem>
              <SelectItem value="high">High — restrict entry</SelectItem>
              <SelectItem value="critical">Critical — do not admit</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Details *</Label><Input required autoFocus value={details} onChange={e => setDetails(e.target.value)} placeholder="What happened…" /></div>
        <p className="text-xs text-muted-foreground">Anyone logging a new visitor with a matching name or ID will see this flag before issuing a card.</p>
        <DialogFooter>
          <Button type="submit" variant="destructive" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Flag</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

// ============================================================
// Export Day — a printable/CSV daily log combining gate passes,
// visitor log, vehicle log, and incidents for a chosen date.
// Kenyan schools generally need a physical/paper trail for
// visitor and gate activity, so this exists alongside the live
// in-app views rather than replacing them.
// ============================================================

function DailyLogDialog({ schoolName }: { schoolName: string }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayStr);

  const { data, isLoading } = useQuery({
    queryKey: ["daily-log-export", date],
    queryFn: async () => {
      const dayStart = new Date(`${date}T00:00:00`).toISOString();
      const dayEnd = new Date(`${date}T23:59:59.999`).toISOString();
      const [gp, vis, veh, inc] = await Promise.all([
        supabase.from("gate_passes").select("*, students(first_name,last_name,admission_no)").gte("exit_time", dayStart).lte("exit_time", dayEnd).order("exit_time"),
        supabase.from("visitor_log").select("*").gte("time_in", dayStart).lte("time_in", dayEnd).order("time_in"),
        supabase.from("vehicle_log").select("*").gte("time_in", dayStart).lte("time_in", dayEnd).order("time_in"),
        supabase.from("security_incidents").select("*").gte("created_at", dayStart).lte("created_at", dayEnd).order("created_at"),
      ]);
      return {
        gatePasses: gp.data ?? [],
        visitors: vis.data ?? [],
        vehicles: veh.data ?? [],
        incidents: inc.data ?? [],
      };
    },
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const out: { category: string; time: string; who: string; detail: string; status: string }[] = [];
    data.gatePasses.forEach((g: any) => out.push({
      category: "Gate Pass",
      time: new Date(g.exit_time).toLocaleTimeString(),
      who: `${g.students?.first_name ?? ""} ${g.students?.last_name ?? ""}`.trim() || "—",
      detail: g.reason ?? "—",
      status: g.actual_return ? `Returned ${new Date(g.actual_return).toLocaleTimeString()}` : g.status,
    }));
    data.visitors.forEach((v: any) => out.push({
      category: "Visitor",
      time: new Date(v.time_in).toLocaleTimeString(),
      who: v.visitor_name,
      detail: [v.visiting, v.purpose].filter(Boolean).join(" — ") || "—",
      status: v.time_out ? `Out ${new Date(v.time_out).toLocaleTimeString()}` : "On campus",
    }));
    data.vehicles.forEach((v: any) => out.push({
      category: "Vehicle",
      time: new Date(v.time_in).toLocaleTimeString(),
      who: `${v.vehicle_reg}${v.driver_name ? ` (${v.driver_name})` : ""}`,
      detail: v.purpose ?? "—",
      status: v.time_out ? `Out ${new Date(v.time_out).toLocaleTimeString()}` : "On campus",
    }));
    data.incidents.forEach((i: any) => out.push({
      category: "Incident",
      time: new Date(i.created_at).toLocaleTimeString(),
      who: i.related_name ?? "—",
      detail: i.title,
      status: i.status,
    }));
    return out.sort((a, b) => a.time.localeCompare(b.time));
  }, [data]);

  const handlePrint = () => {
    const win = window.open("", "_blank");
    if (!win) { toast.error("Pop-up blocked — allow pop-ups to print"); return; }
    const bodyRows = rows.map(r => `<tr><td>${r.category}</td><td>${r.time}</td><td>${escapeHtml(r.who)}</td><td>${escapeHtml(r.detail)}</td><td>${escapeHtml(r.status)}</td></tr>`).join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Security Log — ${date}</title><style>
      body{font-family:system-ui,sans-serif;padding:24px;color:#111}
      h1{font-size:18px;margin-bottom:0}
      p{color:#555;margin-top:4px}
      table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
      th{background:#f3f3f3}
      @media print{a{display:none}}
    </style></head><body>
      <h1>${escapeHtml(schoolName)} — Security Log</h1>
      <p>${date} · ${rows.length} entries</p>
      <table><thead><tr><th>Category</th><th>Time</th><th>Who</th><th>Detail</th><th>Status</th></tr></thead><tbody>${bodyRows || `<tr><td colspan="5">No activity recorded.</td></tr>`}</tbody></table>
      <script>window.onload = () => window.print();</script>
    </body></html>`);
    win.document.close();
  };

  const handleCsv = () => {
    const header = "Category,Time,Who,Detail,Status\n";
    const body = rows.map(r => [r.category, r.time, r.who, r.detail, r.status].map(csvField).join(",")).join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `security-log-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Export Day</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="flex items-end gap-3">
          <div><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} max={todayStr} /></div>
          <Badge variant="secondary">{rows.length} entries</Badge>
        </div>

        <div className="max-h-72 overflow-y-auto border rounded-md">
          {isLoading ? <Loader2 className="animate-spin mx-auto my-8" /> : rows.length === 0 ? (
            <EmptyState title="No activity that day" hint="Pick a different date, or check back once entries are logged." />
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Time</TableHead><TableHead>Who</TableHead><TableHead>Detail</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell><Badge variant="outline">{r.category}</Badge></TableCell>
                    <TableCell className="text-xs">{r.time}</TableCell>
                    <TableCell className="font-medium">{r.who}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.detail}</TableCell>
                    <TableCell className="text-xs">{r.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={handleCsv} disabled={rows.length === 0}><Download className="w-4 h-4 mr-2" />Download CSV</Button>
        <Button onClick={handlePrint} disabled={rows.length === 0}><Printer className="w-4 h-4 mr-2" />Print</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function csvField(v: string): string {
  if (v == null) return "";
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// ============================================================
// Quick Find — one search box across cards, visitors, vehicles,
// gate passes, and incidents. A guard asking "has this person
// been here before / are they on site right now" shouldn't have
// to check five tabs one at a time.
// ============================================================

function QuickFind({ onJump }: { onJump: (tab: string, prefill?: string) => void }) {
  const [raw, setRaw] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(raw.trim()), 300);
    return () => clearTimeout(t);
  }, [raw]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["quick-find", query],
    queryFn: async () => {
      const q = `%${query}%`;
      const [cards, visitors, vehicles, gatePasses, incidents] = await Promise.all([
        supabase.from("access_cards").select("id, card_code, status").ilike("card_code", q).limit(5),
        supabase.from("visitor_log").select("id, visitor_name, id_number, time_in, time_out").or(`visitor_name.ilike.${q},id_number.ilike.${q}`).order("time_in", { ascending: false }).limit(5),
        supabase.from("vehicle_log").select("id, vehicle_reg, driver_name, time_in, time_out").or(`vehicle_reg.ilike.${q},driver_name.ilike.${q}`).order("time_in", { ascending: false }).limit(5),
        supabase.from("gate_passes").select("id, reason, status, exit_time, students(first_name,last_name,admission_no)").order("exit_time", { ascending: false }).limit(30),
        supabase.from("security_incidents").select("id, title, type, status, related_name").or(`title.ilike.${q},related_name.ilike.${q}`).order("created_at", { ascending: false }).limit(5),
      ]);
      const gpFiltered = (gatePasses.data ?? []).filter((g: any) => `${g.students?.first_name ?? ""} ${g.students?.last_name ?? ""}`.toLowerCase().includes(query.toLowerCase())).slice(0, 5);
      return {
        cards: cards.data ?? [],
        visitors: visitors.data ?? [],
        vehicles: vehicles.data ?? [],
        gatePasses: gpFiltered,
        incidents: incidents.data ?? [],
      };
    },
    enabled: query.length >= 2,
  });

  const totalHits = data ? data.cards.length + data.visitors.length + data.vehicles.length + data.gatePasses.length + data.incidents.length : 0;

  const jump = (tab: string, prefill?: string) => { onJump(tab, prefill); setOpen(false); setRaw(""); };

  return (
    <div ref={boxRef} className="relative max-w-md">
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pl-9"
        placeholder="Quick find — name, card code, plate…"
        value={raw}
        onChange={e => { setRaw(e.target.value); setOpen(true); }}
        onFocus={() => raw.length >= 2 && setOpen(true)}
      />
      {open && query.length >= 2 && (
        <div className="absolute z-20 mt-1.5 w-full max-h-96 overflow-y-auto rounded-lg border bg-popover shadow-lg">
          {isFetching ? (
            <div className="p-4 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>
          ) : totalHits === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">No matches for "{query}".</div>
          ) : (
            <div className="py-1">
              {data!.cards.length > 0 && (
                <div className="px-2 py-1">
                  <div className="px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cards</div>
                  {data!.cards.map((c: any) => (
                    <button key={c.id} onClick={() => jump("cards")} className="w-full text-left px-2 py-1.5 rounded-md hover:bg-accent text-sm flex items-center justify-between">
                      <span className="font-mono">{c.card_code}</span>
                      <Badge variant={c.status === "available" ? "secondary" : c.status === "assigned" ? "default" : "destructive"} className="text-[10px]">{c.status}</Badge>
                    </button>
                  ))}
                </div>
              )}
              {data!.visitors.length > 0 && (
                <div className="px-2 py-1">
                  <div className="px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Visitors</div>
                  {data!.visitors.map((v: any) => (
                    <button key={v.id} onClick={() => jump("visitors", v.visitor_name)} className="w-full text-left px-2 py-1.5 rounded-md hover:bg-accent text-sm flex items-center justify-between">
                      <span>{v.visitor_name}</span>
                      <Badge variant={v.time_out ? "outline" : "secondary"} className="text-[10px]">{v.time_out ? "past" : "on site"}</Badge>
                    </button>
                  ))}
                </div>
              )}
              {data!.vehicles.length > 0 && (
                <div className="px-2 py-1">
                  <div className="px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Vehicles</div>
                  {data!.vehicles.map((v: any) => (
                    <button key={v.id} onClick={() => jump("vehicles", v.vehicle_reg)} className="w-full text-left px-2 py-1.5 rounded-md hover:bg-accent text-sm flex items-center justify-between">
                      <span>{v.vehicle_reg}{v.driver_name ? ` — ${v.driver_name}` : ""}</span>
                      <Badge variant={v.time_out ? "outline" : "secondary"} className="text-[10px]">{v.time_out ? "past" : "on site"}</Badge>
                    </button>
                  ))}
                </div>
              )}
              {data!.gatePasses.length > 0 && (
                <div className="px-2 py-1">
                  <div className="px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Gate Passes</div>
                  {data!.gatePasses.map((g: any) => (
                    <button key={g.id} onClick={() => jump("allpasses")} className="w-full text-left px-2 py-1.5 rounded-md hover:bg-accent text-sm flex items-center justify-between">
                      <span>{g.students?.first_name} {g.students?.last_name}</span>
                      <Badge variant={g.status === "out" ? "destructive" : "outline"} className="text-[10px]">{g.status}</Badge>
                    </button>
                  ))}
                </div>
              )}
              {data!.incidents.length > 0 && (
                <div className="px-2 py-1">
                  <div className="px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Incidents</div>
                  {data!.incidents.map((i: any) => (
                    <button key={i.id} onClick={() => jump("incidents")} className="w-full text-left px-2 py-1.5 rounded-md hover:bg-accent text-sm flex items-center justify-between">
                      <span className="truncate">{i.title}</span>
                      <Badge variant={i.status === "open" ? "destructive" : "outline"} className="text-[10px]">{i.status}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
