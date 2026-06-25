import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Plus, Loader2, Sparkles, CheckCircle2, AlertTriangle, CalendarDays,
  Pencil, Trash2, Clock, Copy, DoorOpen,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { generateTimetable } from "@/lib/timetable.functions";

export const Route = createFileRoute("/_app/timetable")({ component: Page });

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const ROOM_TYPES = [
  { value: "classroom", label: "Classroom" },
  { value: "science_lab", label: "Science Lab" },
  { value: "computer_lab", label: "Computer Lab" },
  { value: "art_room", label: "Art Room" },
  { value: "music_room", label: "Music Room" },
  { value: "gym", label: "Gym / PE Hall" },
  { value: "library", label: "Library" },
  { value: "other", label: "Other" },
];

function Page() {
  const qc = useQueryClient();
  const { isAdmin, roles } = useAuth();
  const canGenerate = isAdmin || (roles ?? []).some((r) => r === "academic_master");

  const [classId, setClassId] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  // School context comes from the logged-in user's session (my_school_id RPC),
  // NOT from useTenant()/subdomain — app.smartdev.co.ke is the shared host and
  // useTenant() always resolves to null there.
  const { data: schoolId } = useQuery({
    queryKey: ["my-school-id"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_school_id");
      if (error) throw error;
      return data as string | null;
    },
  });
  const { data: school } = useQuery({
    queryKey: ["school-brand", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (await supabase.from("schools").select("id,name,logo_url").eq("id", schoolId!).maybeSingle()).data ?? null,
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["classes-tt"],
    queryFn: async () =>
      (await supabase.from("classes").select("id,name,level").order("name")).data ?? [],
  });
  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects-tt"],
    queryFn: async () =>
      (await supabase.from("subjects").select("id,code,name").order("code")).data ?? [],
  });
  const { data: staff = [] } = useQuery({
    queryKey: ["staff-tt"],
    queryFn: async () =>
      (await supabase.from("staff").select("id,first_name,last_name").order("first_name")).data ?? [],
  });
  const { data: slots = [], refetch: refetchSlots } = useQuery({
    queryKey: ["tt", classId],
    enabled: !!classId,
    queryFn: async () =>
      (await supabase
        .from("timetable_slots")
        .select("*, subjects(code,name), staff(first_name,last_name)")
        .eq("class_id", classId)
        .order("day_of_week")
        .order("start_time")
      ).data ?? [],
  });

  const grid = useMemo(() => {
    const g: Record<number, any[]> = {};
    (slots as any[]).forEach((s) => { (g[s.day_of_week] ||= []).push(s); });
    return g;
  }, [slots]);

  const refreshGrid = () => {
    qc.removeQueries({ queryKey: ["tt", classId] });
    refetchSlots();
  };

  const printTimetable = () => {
    const cls = (classes as any[]).find((c) => c.id === classId);
    const w = window.open("", "_blank");
    if (!w) return;
    const rows = DAYS.map((d, i) => {
      const daySlots = grid[i + 1] ?? [];
      if (!daySlots.length) return "";
      return `<tr><td style="font-weight:600;padding:6px 8px;border:1px solid #ddd;white-space:nowrap">${d}</td>${daySlots.map((s: any) => `<td style="padding:6px 8px;border:1px solid #ddd"><b>${s.subjects?.code ?? ""}</b><br/><span style="font-size:11px;color:#555">${s.start_time?.slice(0,5)}–${s.end_time?.slice(0,5)}</span><br/><span style="font-size:11px">${s.staff ? `${s.staff.first_name} ${s.staff.last_name}` : ""}${s.room ? ` · ${s.room}` : ""}</span></td>`).join("")}</tr>`;
    }).filter(Boolean).join("");
    w.document.write(`<!DOCTYPE html><html><head><title>Timetable – ${cls?.name ?? ""}</title><style>body{font-family:sans-serif;padding:24px}table{border-collapse:collapse;width:100%}@media print{body{padding:0}}</style></head><body><div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">${school?.logo_url ? `<img src="${school.logo_url}" style="height:56px;object-fit:contain" alt="logo"/>` : ""}<div><h2 style="margin:0">${school?.name ?? "School"}</h2><p style="margin:2px 0;font-size:13px;color:#555">Timetable – ${cls?.name ?? ""}${cls?.level ? ` (${cls.level})` : ""}</p></div></div><table>${rows}</table></body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <CalendarDays className="w-7 h-7 text-primary" /> Timetable
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            View, edit, and auto-generate weekly class schedules.
          </p>
        </div>
      </div>

      <Tabs defaultValue="view" className="w-full">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="view">📅 Schedule</TabsTrigger>
          <TabsTrigger value="periods">
            <Clock className="w-3.5 h-3.5 mr-1.5" /> Periods
          </TabsTrigger>
          <TabsTrigger value="rooms">
            <DoorOpen className="w-3.5 h-3.5 mr-1.5" /> Rooms
          </TabsTrigger>
          {canGenerate && (
            <TabsTrigger value="generate">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generate
            </TabsTrigger>
          )}
        </TabsList>

        {/* ─── Schedule tab ─── */}
        <TabsContent value="view" className="mt-4">
          <div className="flex gap-2 items-end flex-wrap mb-4">
            <div className="min-w-[220px]">
              <Label>Class</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger><SelectValue placeholder="Choose class" /></SelectTrigger>
                <SelectContent>
                  {(classes as any[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.level ? ` — ${c.level}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {classId && (slots as any[]).length > 0 && (
              <Button variant="outline" onClick={printTimetable}>
                🖨 Print
              </Button>
            )}
            {isAdmin && classId && (
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="w-4 h-4 mr-2" />Add Slot</Button>
                </DialogTrigger>
                <SlotDialog
                  classId={classId}
                  subjects={subjects as any[]}
                  staff={staff as any[]}
                  onDone={() => { setAddOpen(false); refreshGrid(); }}
                />
              </Dialog>
            )}
          </div>

          {!classId ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Select a class to view its timetable.
              </CardContent>
            </Card>
          ) : (slots as any[]).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground space-y-2">
                <p>No slots for this class yet.</p>
                {canGenerate && (
                  <p className="text-xs">Switch to the <strong>Generate</strong> tab to auto-build a schedule.</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {DAYS.map((d, i) => (
                <Card key={d}>
                  <CardHeader className="pb-2">
                    <div className="font-semibold">{d}</div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {(grid[i + 1] ?? []).length === 0 && (
                      <p className="text-xs text-muted-foreground">No slots.</p>
                    )}
                    {(grid[i + 1] ?? []).map((s: any) => (
                      <SlotCard
                        key={s.id}
                        slot={s}
                        subjects={subjects as any[]}
                        staff={staff as any[]}
                        canEdit={!!isAdmin}
                        onChanged={refreshGrid}
                      />
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── Periods tab ─── */}
        <TabsContent value="periods" className="mt-4">
          <PeriodsPanel schoolId={schoolId ?? undefined} />
        </TabsContent>

        {/* ─── Rooms tab ─── */}
        <TabsContent value="rooms" className="mt-4">
          <RoomsPanel schoolId={schoolId ?? undefined} />
        </TabsContent>

        {/* ─── Generate tab ─── */}
        {canGenerate && (
          <TabsContent value="generate" className="mt-4">
            <GeneratePanel
              classes={classes as any[]}
              activeClassId={classId}
              onGenerated={(firstClassId) => {
                if (firstClassId) setClassId(firstClassId);
                refreshGrid();
              }}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

/* ─────────────────────────────── Periods Panel ─────────────────────────── */

function PeriodsPanel({ schoolId }: { schoolId?: string }) {
  const qc = useQueryClient();
  const [activeDay, setActiveDay] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ day_of_week: 1, period_index: 1, label: "", start_time: "08:00", end_time: "08:45", is_break: false });
  const [editId, setEditId] = useState<string | null>(null);

  const { data: periods = [], isLoading } = useQuery({
    queryKey: ["period_templates", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase.from("period_templates").select("*").eq("school_id", schoolId!).order("day_of_week").order("period_index");
      if (error) throw error;
      return data;
    },
  });

  const upsert = useMutation({
    mutationFn: async (p: any) => {
      const payload = { ...p, school_id: schoolId };
      const id = p.id; delete payload.id;
      if (id) { const { error } = await supabase.from("period_templates").update(payload).eq("id", id); if (error) throw error; }
      else { const { error } = await supabase.from("period_templates").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["period_templates", schoolId] }); setOpen(false); setEditId(null); toast.success("Period saved"); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("period_templates").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["period_templates", schoolId] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const copyToAll = useMutation({
    mutationFn: async () => {
      const monday = (periods as any[]).filter(p => p.day_of_week === 1);
      if (!monday.length) throw new Error("No Monday periods to copy");
      const inserts: any[] = [];
      for (let day = 2; day <= 5; day++)
        for (const p of monday)
          inserts.push({ school_id: schoolId, day_of_week: day, period_index: p.period_index, label: p.label, start_time: p.start_time, end_time: p.end_time, is_break: p.is_break });
      await supabase.from("period_templates").delete().eq("school_id", schoolId!).gte("day_of_week", 2).lte("day_of_week", 5);
      const { error } = await supabase.from("period_templates").insert(inserts);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["period_templates", schoolId] }); toast.success("Copied Mon → Tue–Fri"); },
    onError: (e: any) => toast.error(e.message),
  });

  const dayPeriods = (periods as any[]).filter(p => p.day_of_week === activeDay).sort((a, b) => a.period_index - b.period_index);

  const openAdd = () => {
    setForm({ day_of_week: activeDay, period_index: dayPeriods.length + 1, label: "", start_time: "08:00", end_time: "08:45", is_break: false });
    setEditId(null); setOpen(true);
  };
  const openEdit = (p: any) => {
    setForm({ day_of_week: p.day_of_week, period_index: p.period_index, label: p.label, start_time: p.start_time, end_time: p.end_time, is_break: p.is_break });
    setEditId(p.id); setOpen(true);
  };

  if (!schoolId) return <Card><CardContent className="py-12 text-center text-muted-foreground">No school loaded.</CardContent></Card>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2"><Clock className="w-5 h-5 text-primary" />Period Templates</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Define your school day structure. The timetable generator uses these slots to schedule classes.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => copyToAll.mutate()} disabled={copyToAll.isPending}>
            {copyToAll.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Copy className="w-4 h-4 mr-2" />}
            Copy Mon → Tue–Fri
          </Button>
          <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-2" />Add Period</Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {DAYS_FULL.map((d, i) => {
          const count = (periods as any[]).filter(p => p.day_of_week === i + 1).length;
          return (
            <button key={d} onClick={() => setActiveDay(i + 1)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeDay === i + 1 ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}>
              {d} <span className="ml-1 opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">{DAYS_FULL[activeDay - 1]}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && dayPeriods.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No periods yet for this day. Click "Add Period" to define your school timetable structure.
            </p>
          )}
          {dayPeriods.map((p: any) => (
            <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 cursor-pointer" onClick={() => openEdit(p)}>
              <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{p.label}</span>
                  {p.is_break && <Badge variant="secondary" className="text-xs">Break</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">{p.start_time?.slice(0,5)} – {p.end_time?.slice(0,5)}</div>
              </div>
              <span className="text-xs text-muted-foreground">#{p.period_index}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={e => { e.stopPropagation(); remove.mutate(p.id); }}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit Period" : "Add Period"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Label</Label>
              <Input placeholder="e.g. Period 1, Break, Lunch" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Start time</Label><Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} /></div>
              <div className="space-y-1"><Label>End time</Label><Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} /></div>
            </div>
            <div className="space-y-1">
              <Label>Period #</Label>
              <Input type="number" min={1} value={form.period_index} onChange={e => setForm({ ...form, period_index: parseInt(e.target.value) || 1 })} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="is_break" checked={form.is_break} onCheckedChange={v => setForm({ ...form, is_break: !!v })} />
              <Label htmlFor="is_break">This is a break / non-teaching slot</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { if (!form.label.trim()) return toast.error("Label required"); upsert.mutate(editId ? { ...form, id: editId } : form); }} disabled={upsert.isPending}>
              {upsert.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─────────────────────────────── Rooms Panel ───────────────────────────── */

const TYPE_COLORS: Record<string, string> = {
  classroom: "bg-blue-100 text-blue-800", science_lab: "bg-green-100 text-green-800",
  computer_lab: "bg-purple-100 text-purple-800", art_room: "bg-yellow-100 text-yellow-800",
  music_room: "bg-pink-100 text-pink-800", gym: "bg-orange-100 text-orange-800",
  library: "bg-teal-100 text-teal-800", other: "bg-gray-100 text-gray-800",
};

function RoomsPanel({ schoolId }: { schoolId?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", room_type: "classroom", capacity: 40, is_active: true });
  const [editId, setEditId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("all");

  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ["rooms", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms").select("*").eq("school_id", schoolId!).order("room_type").order("name");
      if (error) throw error;
      return data;
    },
  });

  const upsert = useMutation({
    mutationFn: async (r: any) => {
      const payload = { ...r, school_id: schoolId };
      const id = r.id; delete payload.id;
      if (id) { const { error } = await supabase.from("rooms").update(payload).eq("id", id); if (error) throw error; }
      else { const { error } = await supabase.from("rooms").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rooms", schoolId] }); setOpen(false); setEditId(null); toast.success("Room saved"); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("rooms").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rooms", schoolId] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = filterType === "all" ? rooms as any[] : (rooms as any[]).filter(r => r.room_type === filterType);

  if (!schoolId) return <Card><CardContent className="py-12 text-center text-muted-foreground">No school loaded.</CardContent></Card>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2"><DoorOpen className="w-5 h-5 text-primary" />Rooms</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Teaching spaces available to the timetable generator. Only active rooms are used.</p>
        </div>
        <Button size="sm" onClick={() => { setForm({ name: "", room_type: "classroom", capacity: 40, is_active: true }); setEditId(null); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" />Add Room
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilterType("all")} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterType === "all" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}>
          All ({(rooms as any[]).length})
        </button>
        {ROOM_TYPES.filter(t => (rooms as any[]).some(r => r.room_type === t.value)).map(t => (
          <button key={t.value} onClick={() => setFilterType(t.value)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterType === t.value ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}>
            {t.label} ({(rooms as any[]).filter(r => r.room_type === t.value).length})
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && filtered.length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No rooms yet. Click "Add Room" to add teaching spaces.</CardContent></Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((r: any) => (
          <Card key={r.id} className={!r.is_active ? "opacity-50" : ""}>
            <CardContent className="p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <DoorOpen className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{r.name}</div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[r.room_type] ?? TYPE_COLORS.other}`}>
                    {ROOM_TYPES.find(t => t.value === r.room_type)?.label ?? r.room_type}
                  </span>
                  <span className="text-xs text-muted-foreground">Cap: {r.capacity}</span>
                  {!r.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7"
                  onClick={() => { setForm({ name: r.name, room_type: r.room_type, capacity: r.capacity, is_active: r.is_active }); setEditId(r.id); setOpen(true); }}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove.mutate(r.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit Room" : "Add Room"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1"><Label>Room name</Label><Input placeholder="e.g. Room 4B, Science Lab 1" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1">
              <Label>Room type</Label>
              <Select value={form.room_type} onValueChange={v => setForm({ ...form, room_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROOM_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Capacity</Label><Input type="number" min={1} value={form.capacity} onChange={e => setForm({ ...form, capacity: parseInt(e.target.value) || 40 })} /></div>
            <div className="flex items-center gap-2">
              <Switch id="is_active" checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
              <Label htmlFor="is_active">Room is active (available to generator)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { if (!form.name.trim()) return toast.error("Name required"); upsert.mutate(editId ? { ...form, id: editId } : form); }} disabled={upsert.isPending}>
              {upsert.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─────────────────────────────── Slot Card ─────────────────────────────── */

function SlotCard({ slot, subjects, staff, canEdit, onChanged }: {
  slot: any; subjects: any[]; staff: any[]; canEdit: boolean; onChanged: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const deleteMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("timetable_slots").delete().eq("id", slot.id);
      if (error) throw error;
    },
    onMutate: () => setDeleted(true),
    onSuccess: () => { toast.success("Slot deleted"); onChanged(); },
    onError: (e: any) => { setDeleted(false); toast.error(e.message); },
  });

  if (deleted) return null;

  return (
    <div className="border rounded p-2 group relative">
      <div className="font-mono text-xs text-muted-foreground">
        {slot.start_time?.slice(0, 5)} – {slot.end_time?.slice(0, 5)}
      </div>
      <div className="font-medium">
        {slot.subjects?.code}{" "}
        <span className="text-xs text-muted-foreground font-normal">{slot.subjects?.name}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {slot.staff ? `${slot.staff.first_name} ${slot.staff.last_name}` : "—"}
        {slot.room && ` · ${slot.room}`}
      </div>
      {canEdit && (
        <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-6 w-6"><Pencil className="w-3 h-3" /></Button>
            </DialogTrigger>
            <SlotDialog classId={slot.class_id} subjects={subjects} staff={staff} existing={slot} onDone={() => { setEditOpen(false); onChanged(); }} />
          </Dialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive"><Trash2 className="w-3 h-3" /></Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete slot?</AlertDialogTitle>
                <AlertDialogDescription>
                  {slot.subjects?.name} on {DAYS[(slot.day_of_week ?? 1) - 1]} at {slot.start_time?.slice(0, 5)} will be removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── Slot Dialog ───────────────────────────── */

function SlotDialog({ classId, subjects, staff, existing, onDone }: {
  classId: string; subjects: any[]; staff: any[]; existing?: any; onDone: () => void;
}) {
  const isEdit = !!existing;
  const [f, setF] = useState({
    subject_id: existing?.subject_id ?? "",
    teacher_id: existing?.teacher_id ?? "__none__",
    day_of_week: existing?.day_of_week ?? 1,
    start_time: existing?.start_time?.slice(0, 5) ?? "07:30",
    end_time: existing?.end_time?.slice(0, 5) ?? "08:10",
    room: existing?.room ?? "",
  });

  const m = useMutation({
    mutationFn: async () => {
      const payload: any = { ...f, class_id: classId };
      if (!payload.teacher_id || payload.teacher_id === "__none__") delete payload.teacher_id;
      if (!payload.room) delete payload.room;
      const classQ = supabase.from("timetable_slots").select("id, subjects(name)").eq("class_id", classId).eq("day_of_week", f.day_of_week).lt("start_time", f.end_time).gt("end_time", f.start_time);
      if (isEdit) classQ.neq("id", existing.id);
      const { data: classConflicts } = await classQ;
      if (classConflicts?.length) throw new Error(`Class conflict: ${(classConflicts[0] as any).subjects?.name ?? "another subject"} already in this slot.`);
      if (payload.teacher_id) {
        const tQ = supabase.from("timetable_slots").select("id, classes(name)").eq("teacher_id", payload.teacher_id).eq("day_of_week", f.day_of_week).lt("start_time", f.end_time).gt("end_time", f.start_time);
        if (isEdit) tQ.neq("id", existing.id);
        const { data: teacherConflicts } = await tQ;
        if (teacherConflicts?.length) throw new Error(`Teacher conflict: already assigned to ${(teacherConflicts[0] as any).classes?.name ?? "another class"} at this time.`);
      }
      if (isEdit) { const { error } = await supabase.from("timetable_slots").update(payload).eq("id", existing.id); if (error) throw error; }
      else { const { error } = await supabase.from("timetable_slots").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success(isEdit ? "Slot updated" : "Slot added"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{isEdit ? "Edit Slot" : "Add Slot"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Day</Label>
            <Select value={String(f.day_of_week)} onValueChange={(v) => setF({ ...f, day_of_week: +v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DAYS.map((d, i) => <SelectItem key={d} value={String(i + 1)}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Room</Label>
            <Input value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} placeholder="e.g. Room 3" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Start</Label><Input type="time" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} /></div>
          <div><Label>End</Label><Input type="time" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} /></div>
        </div>
        <div>
          <Label>Subject</Label>
          <Select value={f.subject_id} onValueChange={(v) => setF({ ...f, subject_id: v })}>
            <SelectTrigger><SelectValue placeholder="Choose subject" /></SelectTrigger>
            <SelectContent>{subjects.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.code} – {s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Teacher</Label>
          <Select value={f.teacher_id} onValueChange={(v) => setF({ ...f, teacher_id: v })}>
            <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— None —</SelectItem>
              {staff.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !f.subject_id}>
            {m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
            {isEdit ? "Save changes" : "Add slot"}
          </Button>
        </DialogFooter>
      </div>
    </DialogContent>
  );
}

/* ─────────────────────────────── Generate Panel ────────────────────────── */

function GeneratePanel({ classes, activeClassId, onGenerated }: {
  classes: any[]; activeClassId: string; onGenerated: (firstId?: string) => void;
}) {
  const run = useServerFn(generateTimetable);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(activeClassId ? [activeClassId] : []));
  const [perWeek, setPerWeek] = useState(4);
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const toggle = (id: string) => { const next = new Set(selected); next.has(id) ? next.delete(id) : next.add(id); setSelected(next); };

  const submit = async () => {
    setBusy(true); setResult(null);
    try {
      const out = await run({ data: { classIds: [...selected], lessonsPerSubjectPerWeek: perWeek, replaceExisting: replace } });
      setResult(out);
      if (out.ok) { toast.success(`Generated ${out.inserted} slots across ${selected.size} class(es)`); onGenerated([...selected][0]); }
      else toast.error(out.error ?? "Generation failed");
    } catch (e: any) {
      toast.error(e.message ?? "Generation failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Smart Timetable Generator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Auto-builds a clash-free weekly schedule using the periods and rooms you configured in the tabs above.
            Make sure you've added <strong>Periods</strong> and at least one <strong>Room</strong> first.
          </p>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            <div>
              <Label>Lessons per subject / week</Label>
              <Input type="number" min={1} max={10} value={perWeek} onChange={(e) => setPerWeek(+e.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              <Checkbox id="rep" checked={replace} onCheckedChange={(v) => setReplace(!!v)} />
              <Label htmlFor="rep">Replace existing</Label>
            </div>
          </div>
          <div>
            <Label>Classes ({selected.size} selected)</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2 max-h-72 overflow-auto border rounded p-3">
              {classes.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                  {c.name} <span className="text-muted-foreground text-xs">{c.level}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" onClick={() => setSelected(new Set(classes.map((c) => c.id)))}>Select all</Button>
              <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          </div>
          <Button onClick={submit} disabled={busy || !selected.size} className="w-full md:w-auto">
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Generate timetable
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              Result
              {result.ok && <Badge variant="default" className="gap-1"><CheckCircle2 className="w-3 h-3" /> {result.inserted} slots inserted</Badge>}
              {result.conflicts?.length > 0 && <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" /> {result.conflicts.length} warnings</Badge>}
              {!result.ok && <Badge variant="destructive">Failed: {result.error}</Badge>}
            </CardTitle>
          </CardHeader>
          {result.conflicts?.length > 0 && (
            <CardContent>
              <div className="text-xs space-y-1 max-h-60 overflow-auto font-mono text-amber-600 dark:text-amber-400">
                {result.conflicts.map((c: string, i: number) => <div key={i}>⚠ {c}</div>)}
              </div>
            </CardContent>
          )}
          {result.summary && (
            <CardContent className="pt-0 text-xs text-muted-foreground">
              {result.summary.classes} class(es) · {result.summary.periodsAvailable} periods available · {result.summary.lessonsRequested} lessons requested
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
