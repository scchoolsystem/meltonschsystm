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
  Pencil, Trash2, Clock, Copy, DoorOpen, BookOpen, Users,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { generateTimetable } from "@/lib/timetable.functions";
import { groupTimetableSlots, staffName } from "@/lib/timetable-display";
import { FeatureGate } from "@/components/FeatureGate";

export const Route = createFileRoute("/_app/timetable")({
  component: () => (
    <FeatureGate feature="timetable">
      <Page />
    </FeatureGate>
  ),
});

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
  // Period templates (incl. breaks) for the school — used to build the
  // print grid so breaks show and adjacent double-lessons can be merged.
  const { data: periods = [] } = useQuery({
    queryKey: ["period-templates-tt", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (await supabase
        .from("period_templates")
        .select("*")
        .eq("school_id", schoolId!)
        .order("day_of_week")
        .order("period_index")
      ).data ?? [],
  });

  const grid = useMemo(() => {
    const g: Record<number, any[]> = {};
    (slots as any[]).forEach((s) => { (g[s.day_of_week] ||= []).push(s); });
    const blocksByDay: Record<number, ReturnType<typeof groupTimetableSlots>> = {};
    Object.entries(g).forEach(([dow, daySlots]) => {
      blocksByDay[+dow] = groupTimetableSlots(daySlots);
    });
    return blocksByDay;
  }, [slots]);

  const refreshGrid = () => {
    qc.removeQueries({ queryKey: ["tt", classId] });
    refetchSlots();
  };

  const printTimetable = () => {
    const cls = (classes as any[]).find((c) => c.id === classId);
    const w = window.open("", "_blank");
    if (!w) return;

    const daysToShow = [1, 2, 3, 4, 5]; // Mon–Fri

    // Periods (incl. breaks) grouped per day, sorted by period_index.
    const periodsByDay: Record<number, any[]> = {};
    daysToShow.forEach((d) => {
      periodsByDay[d] = (periods as any[])
        .filter((p) => p.day_of_week === d)
        .sort((a, b) => a.period_index - b.period_index);
    });

    // Union of period_index values across every day, so a period that only
    // exists Mon–Thu (e.g. Friday is shorter) still gets its own row.
    const allIndexes = Array.from(
      new Set((periods as any[]).map((p) => p.period_index))
    ).sort((a, b) => a - b);

    // Fast lookup: day + period_template_id -> ALL lessons booked there.
    // Electives put 2+ subjects in the exact same day/period for one class
    // (different students take different options in parallel), so this must
    // collect every slot into a list rather than keep only the last one —
    // otherwise parallel options silently overwrite each other, or end up
    // rendered as if they were separate, conflicting periods.
    const slotByDayPeriod: Record<string, any[]> = {};
    (slots as any[]).forEach((s: any) => {
      if (s.period_template_id) {
        const key = `${s.day_of_week}-${s.period_template_id}`;
        (slotByDayPeriod[key] ||= []).push(s);
      }
    });

    // day-period_index pairs already swallowed into a rowspan above them.
    const consumed = new Set<string>();

    const renderCell = (day: number, idx: number): string => {
      const key = `${day}-${idx}`;
      if (consumed.has(key)) return ""; // covered by rowspan from the row above

      const p = periodsByDay[day]?.find((pp) => pp.period_index === idx);
      if (!p) return `<td style="padding:6px 8px;border:1px solid #ddd;background:#fafafa"></td>`;

      if (p.is_break) {
        return `<td style="padding:6px 8px;border:1px solid #ddd;background:#f3f3f3;text-align:center;font-size:11px;color:#666;font-style:italic">${p.label || "Break"}<br/>${p.start_time?.slice(0,5)}–${p.end_time?.slice(0,5)}</td>`;
      }

      const slotsHere = slotByDayPeriod[`${day}-${p.id}`];
      if (!slotsHere?.length) return `<td style="padding:6px 8px;border:1px solid #ddd"></td>`;
      const slot = slotsHere[0]; // used for timing/rowspan-walk purposes below

      // Parallel elective options sharing this exact slot are rendered
      // together in one cell (one line per option) instead of one winning
      // and the rest disappearing, or each getting pushed to its own cell.
      const isElectiveBlock = slotsHere.length > 1 || !!slot.elective_group;

      // Walk forward merging wall-clock-adjacent periods that carry the
      // exact same set of subjects+teachers+rooms into one spanning cell
      // (double lessons in a single box instead of two).
      let rowspan = 1;
      let endTime = slot.end_time;
      const dayPeriods = periodsByDay[day] ?? [];
      let curIdx = idx;
      const sameSlotSignature = (arr: any[]) =>
        arr.map((s) => `${s.subject_id}|${s.teacher_id ?? ""}|${s.room ?? ""}`).sort().join(",");
      while (true) {
        const curPeriod = dayPeriods.find((pp) => pp.period_index === curIdx);
        const nextPeriod = dayPeriods.find((pp) => pp.period_index === curIdx + 1);
        if (!curPeriod || !nextPeriod || nextPeriod.is_break) break;
        if (curPeriod.end_time !== nextPeriod.start_time) break; // gap -> not truly adjacent
        const nextSlotsHere = slotByDayPeriod[`${day}-${nextPeriod.id}`];
        if (!nextSlotsHere?.length) break;
        const sameLesson = sameSlotSignature(nextSlotsHere) === sameSlotSignature(slotsHere);
        if (!sameLesson) break;
        consumed.add(`${day}-${nextPeriod.period_index}`);
        endTime = nextSlotsHere[0].end_time;
        rowspan++;
        curIdx = nextPeriod.period_index;
      }

      const optionsHtml = isElectiveBlock
        ? `<table style="width:100%;border-collapse:collapse;margin-top:2px">
             <tbody>
               ${slotsHere.map((s: any) => `
                 <tr>
                   <td style="padding:1px 3px 1px 0;font-weight:600;white-space:nowrap">${s.subjects?.code ?? ""}</td>
                   <td style="padding:1px 3px;color:#555;font-size:10px">${s.staff ? `${s.staff.first_name} ${s.staff.last_name}` : ""}</td>
                   <td style="padding:1px 0 1px 3px;color:#555;font-size:10px;white-space:nowrap">${s.room ?? ""}</td>
                 </tr>`).join("")}
             </tbody>
           </table>`
        : `<b>${slot.subjects?.code ?? ""}</b>${slot.staff ? ` <span style="font-size:11px">(${slot.staff.first_name} ${slot.staff.last_name})</span>` : ""}${slot.room ? ` <span style="font-size:11px">· ${slot.room}</span>` : ""}`;

      return `<td rowspan="${rowspan}" style="padding:6px 8px;border:1px solid #ddd;vertical-align:top">${isElectiveBlock ? `<div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.02em">Elective options</div>` : ""}${optionsHtml}<br/><span style="font-size:11px;color:#555">${slot.start_time?.slice(0,5)}–${endTime?.slice(0,5)}</span></td>`;
    };

    const header = `<tr><th style="padding:6px 8px;border:1px solid #ddd;background:#f0f0f0;text-align:left">Period</th>${daysToShow.map((d) => `<th style="padding:6px 8px;border:1px solid #ddd;background:#f0f0f0;text-align:left">${DAYS_FULL[d - 1]}</th>`).join("")}</tr>`;

    const bodyRows = allIndexes.map((idx) => {
      const labelSource = daysToShow
        .map((d) => periodsByDay[d]?.find((p) => p.period_index === idx))
        .find(Boolean);
      const rowLabel = labelSource ? (labelSource.label || (labelSource.is_break ? "Break" : `Period ${idx}`)) : `Period ${idx}`;
      const cells = daysToShow.map((d) => renderCell(d, idx)).join("");
      return `<tr><td style="font-weight:600;padding:6px 8px;border:1px solid #ddd;white-space:nowrap;background:#fafafa">${rowLabel}</td>${cells}</tr>`;
    }).join("");

    w.document.write(`<!DOCTYPE html><html><head><title>Timetable – ${cls?.name ?? ""}</title><style>body{font-family:sans-serif;padding:24px}table{border-collapse:collapse;width:100%}@media print{body{padding:0}}</style></head><body><div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">${school?.logo_url ? `<img src="${school.logo_url}" style="height:56px;object-fit:contain" alt="logo"/>` : ""}<div><h2 style="margin:0">${school?.name ?? "School"}</h2><p style="margin:2px 0;font-size:13px;color:#555">Timetable – ${cls?.name ?? ""}${cls?.level ? ` (${cls.level})` : ""}</p></div></div><table>${header}${bodyRows}</table></body></html>`);
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
          <TabsTrigger value="class-subjects">
            <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Class Subjects
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
                    {(grid[i + 1] ?? []).map((block) =>
                      block.isElective ? (
                        <ElectiveBlockTable
                          key={`${block.day_of_week}-${block.start_time}`}
                          block={block}
                          subjects={subjects as any[]}
                          staff={staff as any[]}
                          canEdit={!!isAdmin}
                          onChanged={refreshGrid}
                        />
                      ) : (
                        <SlotCard
                          key={block.options[0].id}
                          slot={block.options[0]}
                          subjects={subjects as any[]}
                          staff={staff as any[]}
                          canEdit={!!isAdmin}
                          onChanged={refreshGrid}
                        />
                      )
                    )}
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

        {/* ─── Class Subjects tab ─── */}
        <TabsContent value="class-subjects" className="mt-4">
          <ClassSubjectsPanel
            classes={classes as any[]}
            subjects={subjects as any[]}
            staff={staff as any[]}
            schoolId={schoolId ?? undefined}
          />
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
      <div className="font-medium flex items-center gap-1.5 flex-wrap">
        {slot.subjects?.code}{" "}
        <span className="text-xs text-muted-foreground font-normal">{slot.subjects?.name}</span>
        {slot.elective_group && <Badge variant="outline" className="text-xs">Elective: {slot.elective_group}</Badge>}
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

/* ─────────────────────────── Elective Block Table ──────────────────────── */
// Renders 2+ subjects that share the exact same day/time for a class (each
// taught to a different subset of students) as one table — Subject / Teacher
// / Room per row — instead of scattering them across separate cards.

function ElectiveBlockTable({ block, subjects, staff, canEdit, onChanged }: {
  block: ReturnType<typeof groupTimetableSlots>[number]; subjects: any[]; staff: any[]; canEdit: boolean; onChanged: () => void;
}) {
  const [editing, setEditing] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("timetable_slots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, id) => { toast.success("Slot deleted"); setDeletedIds((p) => new Set(p).add(id)); onChanged(); },
    onError: (e: any) => toast.error(e.message),
  });

  const options = block.options.filter((o: any) => !deletedIds.has(o.id));
  if (options.length === 0) return null;

  return (
    <div className="border rounded p-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="font-mono text-xs text-muted-foreground">
          {block.start_time?.slice(0, 5)} – {block.end_time?.slice(0, 5)}
        </div>
        <Badge variant="outline" className="text-xs">Elective options</Badge>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="text-left font-normal pb-1">Subject</th>
            <th className="text-left font-normal pb-1">Teacher</th>
            <th className="text-left font-normal pb-1">Room</th>
            {canEdit && <th className="w-14" />}
          </tr>
        </thead>
        <tbody>
          {options.map((s: any) => (
            <tr key={s.id} className="group border-t">
              <td className="py-1 pr-2">
                <div className="font-medium">{s.subjects?.code}</div>
                <div className="text-xs text-muted-foreground">{s.subjects?.name}</div>
              </td>
              <td className="py-1 pr-2 text-xs text-muted-foreground">{staffName(s.staff) || "—"}</td>
              <td className="py-1 pr-2 text-xs text-muted-foreground">{s.room ?? "—"}</td>
              {canEdit && (
                <td className="py-1">
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(s)}><Pencil className="w-3 h-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(s)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <SlotDialog classId={editing.class_id} subjects={subjects} staff={staff} existing={editing} onDone={() => { setEditing(null); onChanged(); }} />
        )}
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete slot?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.subjects?.name} on {block.start_time?.slice(0, 5)} will be removed from this elective group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteTarget) { deleteMut.mutate(deleteTarget.id); setDeleteTarget(null); } }}
              disabled={deleteMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
    elective_group: existing?.elective_group ?? "",
  });

  const m = useMutation({
    mutationFn: async () => {
      const payload: any = { ...f, class_id: classId };
      if (!payload.teacher_id || payload.teacher_id === "__none__") delete payload.teacher_id;
      if (!payload.room) delete payload.room;
      const group = payload.elective_group?.trim();
      if (group) payload.elective_group = group; else delete payload.elective_group;
      // Overlapping slots for the same class are normally a conflict, EXCEPT
      // when both slots share the same elective group — those are meant to
      // run in parallel (different subject per student subset) in one shared
      // block, not pushed into separate time cells.
      const classQ = supabase.from("timetable_slots").select("id, subjects(name), elective_group").eq("class_id", classId).eq("day_of_week", f.day_of_week).lt("start_time", f.end_time).gt("end_time", f.start_time);
      if (isEdit) classQ.neq("id", existing.id);
      const { data: classConflictsRaw } = await classQ;
      const classConflicts = (classConflictsRaw ?? []).filter((c: any) => !(group && c.elective_group === group));
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
        <div>
          <Label>Elective group (optional)</Label>
          <Input
            value={f.elective_group}
            onChange={(e) => setF({ ...f, elective_group: e.target.value })}
            placeholder="e.g. Humanities Options"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Give two or more subjects at this class the same elective group name to schedule
            them in this exact same day/time as parallel options — they'll share one slot
            instead of conflicting or being pushed to separate cells.
          </p>
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
// NOTE: "Lessons per subject / week" and "Replace existing" controls were
// removed — they didn't match the real generateTimetable() signature anyway
// (lesson counts come from the Class Subjects tab per class/subject, and
// existing slots for the selected classes are always replaced).

function GeneratePanel({ classes, activeClassId, onGenerated }: {
  classes: any[]; activeClassId: string; onGenerated: (firstId?: string) => void;
}) {
  const run = useServerFn(generateTimetable);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(activeClassId ? [activeClassId] : []));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const toggle = (id: string) => { const next = new Set(selected); next.has(id) ? next.delete(id) : next.add(id); setSelected(next); };

  const submit = async () => {
    setBusy(true); setResult(null);
    try {
      const out = await run({ data: { classIds: [...selected], replaceExisting: true, maxLessonsPerTeacherPerDay: 6 } });
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
            Auto-builds a clash-free weekly schedule from the <strong>Class Subjects</strong> tab —
            lesson counts, double-lesson requirements, preferred rooms and elective groups are all
            read from there. Double lessons are always scheduled back-to-back, science subjects
            auto-match their lab (Chemistry → Lab 1, Biology → Lab 2, Physics → Lab 3), and
            elective-group subjects are blocked into the same shared slot across every class in
            the group. Existing slots for the selected classes are always replaced. Make sure
            you've set up <strong>Periods</strong> and at least one <strong>Room</strong> first.
          </p>
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
              {result.summary.classes} class(es) · {result.summary.periodsAvailable} periods available
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}

/* ─────────────────────────────── Class Subjects Panel ──────────────────── */

function ClassSubjectsPanel({
  classes, subjects, staff, schoolId,
}: {
  classes: any[]; subjects: any[]; staff: any[]; schoolId?: string;
}) {
  const qc = useQueryClient();
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [editRow, setEditRow] = useState<any | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: rooms = [] } = useQuery({
    queryKey: ["rooms", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (await supabase.from("rooms").select("id,name").eq("school_id", schoolId!).eq("is_active", true).order("name")).data ?? [],
  });

  // teacher_subjects: subject_id -> staff[] (qualified teachers per subject)
  const { data: teacherSubjectRows = [] } = useQuery({
    queryKey: ["teacher-subjects", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (await supabase.from("teacher_subjects").select("staff_id,subject_id").eq("school_id", schoolId!)).data ?? [],
  });

  // Build map: subject_id -> staff names
  const qualifiedTeacherMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const ts of teacherSubjectRows as any[]) {
      const s = (staff as any[]).find((st) => st.id === ts.staff_id);
      if (!s) continue;
      const arr = map.get(ts.subject_id) ?? [];
      arr.push(`${s.first_name} ${s.last_name}`);
      map.set(ts.subject_id, arr);
    }
    return map;
  }, [teacherSubjectRows, staff]);

  const { data: classSubjects = [], isLoading } = useQuery({
    queryKey: ["class-subjects", classId],
    enabled: !!classId,
    queryFn: async () =>
      (await supabase
        .from("class_subjects")
        .select("*, subjects(id,code,name), rooms:preferred_room_id(id,name)")
        .eq("class_id", classId)
        .order("created_at")
      ).data ?? [],
  });

  const assignedIds = new Set((classSubjects as any[]).map((cs: any) => cs.subject_id));

  const upsert = useMutation({
    mutationFn: async (row: any) => {
      const payload: any = {
        class_id: classId,
        school_id: schoolId,
        subject_id: row.subject_id,
        lessons_per_week: row.lessons_per_week,
        requires_double_lesson: row.requires_double_lesson,
        requires_triple_lesson: row.requires_triple_lesson,
        priority: row.priority ?? 1,
      };
      if (row.preferred_room_id && row.preferred_room_id !== "__none__") payload.preferred_room_id = row.preferred_room_id;
      if (row.elective_group?.trim()) payload.elective_group = row.elective_group.trim();
      if (row.id) {
        const { error } = await supabase.from("class_subjects").update(payload).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("class_subjects").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class-subjects", classId] });
      setDialogOpen(false);
      setEditRow(null);
      toast.success("Saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("class_subjects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class-subjects", classId] });
      toast.success("Removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openAdd = () => {
    setEditRow({
      subject_id: "", preferred_room_id: "__none__",
      lessons_per_week: 4, requires_double_lesson: false,
      requires_triple_lesson: false, elective_group: "", priority: 1,
    });
    setDialogOpen(true);
  };

  const openEdit = (cs: any) => {
    setEditRow({
      id: cs.id,
      subject_id: cs.subject_id,
      preferred_room_id: cs.preferred_room_id ?? "__none__",
      lessons_per_week: cs.lessons_per_week ?? 4,
      requires_double_lesson: cs.requires_double_lesson ?? false,
      requires_triple_lesson: cs.requires_triple_lesson ?? false,
      elective_group: cs.elective_group ?? "",
      priority: cs.priority ?? 1,
    });
    setDialogOpen(true);
  };

  const currentClass = classes.find((c) => c.id === classId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" /> Class Subjects
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Assign subjects and weekly lesson counts per class. Teachers are linked
            via <strong>Staff → Subjects Taught</strong> and auto-assigned by the generator.
          </p>
        </div>
        {classId && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="w-4 h-4 mr-2" /> Add Subject
          </Button>
        )}
      </div>

      {/* Class picker */}
      <div className="flex gap-2 flex-wrap">
        {classes.map((c) => {
          const count = classId === c.id ? (classSubjects as any[]).length : null;
          return (
            <button
              key={c.id}
              onClick={() => setClassId(c.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                classId === c.id ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
              }`}
            >
              {c.name}
              {c.level ? <span className="ml-1 opacity-60 text-xs">{c.level}</span> : null}
              {count !== null && <span className="ml-2 opacity-70">({count})</span>}
            </button>
          );
        })}
      </div>

      {!classId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Select a class above to manage its subjects.
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          </CardContent>
        </Card>
      ) : (classSubjects as any[]).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground space-y-2">
            <BookOpen className="w-8 h-8 mx-auto opacity-30" />
            <p>No subjects assigned to <strong>{currentClass?.name}</strong> yet.</p>
            <p className="text-xs">Click "Add Subject" to configure which subjects are taught in this class.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-3 font-medium">Subject</th>
                  <th className="text-left px-4 py-3 font-medium">Qualified teachers</th>
                  <th className="text-center px-3 py-3 font-medium">Lessons/wk</th>
                  <th className="text-left px-3 py-3 font-medium hidden md:table-cell">Options</th>
                  <th className="text-left px-3 py-3 font-medium hidden lg:table-cell">Preferred room</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {(classSubjects as any[]).map((cs: any) => {
                  const teachers = qualifiedTeacherMap.get(cs.subject_id) ?? [];
                  return (
                    <tr key={cs.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="font-medium">{cs.subjects?.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{cs.subjects?.code}</div>
                      </td>
                      <td className="px-4 py-3">
                        {teachers.length === 0 ? (
                          <span className="text-xs text-amber-500 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> None assigned in Staff
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {teachers.map((t) => (
                              <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Badge variant="secondary">{cs.lessons_per_week ?? "—"}</Badge>
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        <div className="flex gap-1 flex-wrap">
                          {cs.requires_double_lesson && <Badge variant="outline" className="text-xs">Double</Badge>}
                          {cs.requires_triple_lesson && <Badge variant="outline" className="text-xs">Triple</Badge>}
                          {cs.elective_group && <Badge variant="outline" className="text-xs">Elective: {cs.elective_group}</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground hidden lg:table-cell">
                        {cs.rooms?.name ?? "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(cs)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove subject?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Remove <strong>{cs.subjects?.name}</strong> from <strong>{currentClass?.name}</strong>?
                                  This won't delete any timetable slots already generated.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => remove.mutate(cs.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditRow(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editRow?.id ? "Edit subject assignment" : "Add subject to class"}</DialogTitle>
          </DialogHeader>
          {editRow && (
            <div className="space-y-4 py-1">
              {/* Subject */}
              <div className="space-y-1">
                <Label>Subject</Label>
                <Select
                  value={editRow.subject_id}
                  onValueChange={(v) => setEditRow({ ...editRow, subject_id: v })}
                  disabled={!!editRow.id}
                >
                  <SelectTrigger><SelectValue placeholder="Choose subject" /></SelectTrigger>
                  <SelectContent>
                    {subjects
                      .filter((s: any) => editRow.id ? true : !assignedIds.has(s.id))
                      .map((s: any) => {
                        const teachers = qualifiedTeacherMap.get(s.id) ?? [];
                        return (
                          <SelectItem key={s.id} value={s.id}>
                            {s.code} – {s.name}
                            {teachers.length === 0 && " ⚠ no teacher"}
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
                {editRow.subject_id && (qualifiedTeacherMap.get(editRow.subject_id) ?? []).length === 0 && (
                  <p className="text-xs text-amber-500 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    No teachers assigned to this subject yet. Go to Staff → edit a staff member → Subjects Taught.
                  </p>
                )}
                {editRow.subject_id && (qualifiedTeacherMap.get(editRow.subject_id) ?? []).length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Qualified: {(qualifiedTeacherMap.get(editRow.subject_id) ?? []).join(", ")}
                  </p>
                )}
              </div>

              {/* Lessons per week + priority */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Lessons per week</Label>
                  <Input
                    type="number" min={1} max={20}
                    value={editRow.lessons_per_week}
                    onChange={(e) => setEditRow({ ...editRow, lessons_per_week: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Priority</Label>
                  <Input
                    type="number" min={1} max={10}
                    value={editRow.priority}
                    onChange={(e) => setEditRow({ ...editRow, priority: parseInt(e.target.value) || 1 })}
                  />
                  <p className="text-xs text-muted-foreground">1 = highest</p>
                </div>
              </div>

              {/* Preferred room */}
              <div className="space-y-1">
                <Label>Preferred room (optional)</Label>
                <Select value={editRow.preferred_room_id} onValueChange={(v) => setEditRow({ ...editRow, preferred_room_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Any available room" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Any room —</SelectItem>
                    {(rooms as any[]).map((r: any) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Elective group */}
              <div className="space-y-1">
                <Label>Elective group (optional)</Label>
                <Input
                  placeholder="e.g. Science, Arts — leave blank if compulsory"
                  value={editRow.elective_group}
                  onChange={(e) => setEditRow({ ...editRow, elective_group: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Subjects sharing the same elective group across 2+ classes are scheduled into the
                  same shared slot, so students can be regrouped between classes for that period.
                </p>
              </div>

              {/* Double / triple lesson toggles */}
              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    id="double"
                    checked={editRow.requires_double_lesson}
                    onCheckedChange={(v) => setEditRow({ ...editRow, requires_double_lesson: v, requires_triple_lesson: v ? false : editRow.requires_triple_lesson })}
                  />
                  <Label htmlFor="double">Double lesson</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="triple"
                    checked={editRow.requires_triple_lesson}
                    onCheckedChange={(v) => setEditRow({ ...editRow, requires_triple_lesson: v, requires_double_lesson: v ? false : editRow.requires_double_lesson })}
                  />
                  <Label htmlFor="triple">Triple lesson</Label>
                </div>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                For core subjects, "Double lesson" also lets the generator place an extra lesson on
                one day when the weekly lesson count is higher than the number of school days
                (e.g. 6 lessons/week over 5 days) — instead of leaving the last lesson unscheduled.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditRow(null); }}>Cancel</Button>
            <Button
              onClick={() => { if (!editRow?.subject_id) return toast.error("Select a subject"); upsert.mutate(editRow); }}
              disabled={upsert.isPending}
            >
              {upsert.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
