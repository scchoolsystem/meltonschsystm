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
import { Plus, Loader2, CheckCircle, XCircle, Users, ScanLine, Camera, Printer, IdCard as IdCardIcon, ParkingSquare } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useTenant } from "@/hooks/use-tenant";
import { format } from "date-fns";
import { QRCodeSVG } from "qrcode.react";

export const Route = createFileRoute("/_app/security")({ component: () => (<FeatureGate feature="security"><Page /></FeatureGate>) });

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("security_admin") || hasRole("security_user");
  const canManageBays = isAdmin || hasRole("security_admin");

  const today = format(new Date(), "yyyy-MM-dd");

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

  const pendingPasses = useMemo(() => (gatePasses as any[]).filter(g => g.status === "pending"), [gatePasses]);
  const openGatePasses = useMemo(() => (gatePasses as any[]).filter(g => g.exit_time?.startsWith(today) && !g.actual_return), [gatePasses, today]);
  const studentsOnCampus = (typeof totalStudents === "number" ? totalStudents : 0) - openGatePasses.length;

  const approvalMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("gate_passes").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gate-passes-all"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const timeOutMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("visitor_log").update({ time_out: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visitor-log"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const vehicleTimeOutMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicle_log").update({ time_out: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicle-log"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const [addEntry, setAddEntry] = useState(false);
  const [lastIssuedCode, setLastIssuedCode] = useState<string | null>(null);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div><h1 className="text-3xl font-bold">Security</h1></div>
        {can && (
          <div className="flex gap-2">
            <Dialog open={addEntry} onOpenChange={setAddEntry}><DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Log Entry</Button></DialogTrigger>
              <LogEntryDialog onDone={(code) => {
                setAddEntry(false);
                setLastIssuedCode(code);
                qc.invalidateQueries({ queryKey: ["access-cards"] });
                qc.invalidateQueries({ queryKey: ["parking-bays"] });
                qc.invalidateQueries({ queryKey: ["parking-slots"] });
                qc.invalidateQueries({ queryKey: ["parking-bays-free"] });
                qc.invalidateQueries({ queryKey: ["visitor-log"] });
                qc.invalidateQueries({ queryKey: ["vehicle-log"] });
              }} />
            </Dialog>
          </div>
        )}
      </div>

      {/* On-campus count */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-4 flex items-center gap-4">
          <Users className="w-8 h-8 text-primary" />
          <div>
            <div className="text-2xl font-bold">{studentsOnCampus}</div>
            <div className="text-sm text-muted-foreground">Students currently on campus <span className="text-xs">({openGatePasses.length} off-campus today)</span></div>
          </div>
        </CardContent>
      </Card>

      {lastIssuedCode && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="pt-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-muted-foreground">Hand this card to them</div>
              <div className="text-2xl font-bold font-mono">{lastIssuedCode}</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setLastIssuedCode(null)}>Dismiss</Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="scan">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="scan" className="gap-1"><ScanLine className="w-3.5 h-3.5" />Scan</TabsTrigger>
          <TabsTrigger value="cards" className="gap-1"><IdCardIcon className="w-3.5 h-3.5" />Badges</TabsTrigger>
          <TabsTrigger value="parking" className="gap-1"><ParkingSquare className="w-3.5 h-3.5" />Parking</TabsTrigger>
          <TabsTrigger value="gatepasses">
            Gate Pass Queue
            {pendingPasses.length > 0 && <Badge variant="destructive" className="ml-2">{pendingPasses.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="allpasses">All Gate Passes</TabsTrigger>
          <TabsTrigger value="visitors">Visitors</TabsTrigger>
          <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
        </TabsList>

        <TabsContent value="scan">
          <ScanTab can={can} />
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
              <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Reason</TableHead><TableHead>Exit</TableHead><TableHead>Return</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {(gatePasses as any[]).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No gate passes.</TableCell></TableRow>}
                {(gatePasses as any[]).map((g: any) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.students?.first_name} {g.students?.last_name}</TableCell>
                    <TableCell>{g.reason}</TableCell>
                    <TableCell className="text-xs">{g.exit_time ? new Date(g.exit_time).toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-xs">{g.actual_return ? new Date(g.actual_return).toLocaleString() : "—"}</TableCell>
                    <TableCell><Badge variant={g.status === "approved" ? "default" : g.status === "denied" ? "destructive" : "secondary"}>{g.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="visitors">
          <Card><CardHeader /><CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Visitor</TableHead><TableHead>ID No</TableHead><TableHead>Visiting</TableHead><TableHead>Purpose</TableHead><TableHead>Time In</TableHead><TableHead>Time Out</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {(visitors as any[]).length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No visitor logs.</TableCell></TableRow>}
                {(visitors as any[]).map((v: any) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.visitor_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{v.id_number ?? "—"}</TableCell>
                    <TableCell>{v.visiting ?? "—"}</TableCell>
                    <TableCell>{v.purpose ?? "—"}</TableCell>
                    <TableCell className="text-xs">{new Date(v.time_in).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{v.time_out ? new Date(v.time_out).toLocaleString() : <Badge variant="secondary">On campus</Badge>}</TableCell>
                    <TableCell>
                      {can && !v.time_out && <Button size="sm" variant="outline" className="h-8" onClick={() => timeOutMutation.mutate(v.id)}>Sign Out</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="vehicles">
          <Card><CardHeader /><CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Reg</TableHead><TableHead>Driver</TableHead><TableHead>Purpose</TableHead><TableHead>Time In</TableHead><TableHead>Time Out</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {(vehicles as any[]).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No vehicle logs.</TableCell></TableRow>}
                {(vehicles as any[]).map((v: any) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.vehicle_reg}</TableCell>
                    <TableCell>{v.driver_name ?? "—"}</TableCell>
                    <TableCell>{v.purpose ?? "—"}</TableCell>
                    <TableCell className="text-xs">{new Date(v.time_in).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{v.time_out ? new Date(v.time_out).toLocaleString() : <Badge variant="secondary">On campus</Badge>}</TableCell>
                    <TableCell>
                      {can && !v.time_out && <Button size="sm" variant="outline" className="h-8" onClick={() => vehicleTimeOutMutation.mutate(v.id)}>Log Exit</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
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

function LogEntryDialog({ onDone }: { onDone: (cardCode: string) => void }) {
  const [f, setF] = useState({ holder_name: "", id_number: "", visiting: "", purpose: "" });
  const [hasVehicle, setHasVehicle] = useState(false);
  const [vehicleType, setVehicleType] = useState("car");
  const [vehicleReg, setVehicleReg] = useState("");
  const [bayId, setBayId] = useState("");

  const preferredType = useMemo(() => inferBayType(vehicleType, f.purpose), [vehicleType, f.purpose]);

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
      onDone(row?.card_code ?? "—");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Log Entry</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Name *</Label><Input required autoFocus value={f.holder_name} onChange={e => setF(p => ({ ...p, holder_name: e.target.value }))} /></div>
        <div><Label>ID Number</Label><Input value={f.id_number} onChange={e => setF(p => ({ ...p, id_number: e.target.value }))} /></div>
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
          <Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Log in & issue card</Button>
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
// Badges (Cards) tab — bulk-generate the printed card inventory
// and produce a print-ready QR sheet. Cards are immutable once
// printed; the only lifecycle action here is retiring a lost card.
// ============================================================

function CardsTab({ can }: { can: boolean }) {
  const qc = useQueryClient();
  const { school } = useTenant();
  const [qty, setQty] = useState("1000");
  const [printBatch, setPrintBatch] = useState<any[] | null>(null);

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ["access-cards"],
    queryFn: async () => (await supabase.from("access_cards").select("*").order("card_code")).data ?? [],
  });

  const counts = useMemo(() => {
    const c = { available: 0, assigned: 0, retired: 0 } as Record<string, number>;
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

      <div className="flex gap-3 text-sm">
        <Badge variant="secondary">{counts.available ?? 0} available</Badge>
        <Badge>{counts.assigned ?? 0} assigned</Badge>
        <Badge variant="outline">{counts.retired ?? 0} retired</Badge>
      </div>

      <Card><CardHeader /><CardContent>
        {isLoading ? <Loader2 className="animate-spin mx-auto" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Status</TableHead>{can && <TableHead className="text-right">Action</TableHead>}</TableRow></TableHeader>
            <TableBody>
              {(cards as any[]).length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No cards generated yet.</TableCell></TableRow>}
              {(cards as any[]).slice(0, 200).map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono">{c.card_code}</TableCell>
                  <TableCell><Badge variant={c.status === "available" ? "secondary" : c.status === "assigned" ? "default" : "outline"}>{c.status}</Badge></TableCell>
                  {can && (
                    <TableCell className="text-right">
                      {c.status !== "retired" && <Button size="sm" variant="outline" className="h-8" onClick={() => retireMutation.mutate(c.id)}>Retire</Button>}
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
    </div>
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
              <Card key={b.id} className={b.status === "out_of_service" ? "opacity-70" : undefined}>
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
                          className={`w-14 h-14 rounded-md border flex flex-col items-center justify-center text-xs font-medium ${color}`}
                        >
                          <span className="font-semibold">#{s.slot_number}</span>
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
