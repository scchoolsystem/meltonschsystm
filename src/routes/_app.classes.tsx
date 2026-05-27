import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Users, Pencil, Trash2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/classes")({
  component: ClassesPage,
});

function useTeachers() {
  return useQuery({
    queryKey: ["teachers-for-classes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, first_name, last_name, role")
        .in("role", ["class_teacher", "subject_teacher", "teacher", "hod", "deputy_principal", "principal", "academic_master"])
        .order("first_name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

function ClassesPage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);

  const { data: classes = [], isLoading } = useQuery({
    queryKey: ["classes-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("*, students(count), class_teacher:staff!classes_class_teacher_id_fkey(id, first_name, last_name)")
        .order("level").order("name");
      if (error) {
        // Fallback if FK alias differs
        const fb = await supabase.from("classes").select("*, students(count)").order("level").order("name");
        if (fb.error) throw fb.error;
        return fb.data as any[];
      }
      return data as any[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["classes-full"] });
    qc.invalidateQueries({ queryKey: ["classes-min"] });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Classes</h1>
          <p className="text-sm text-muted-foreground mt-1">{classes.length} classes across primary and secondary</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />New Class</Button></DialogTrigger>
            <AddClassDialog onDone={() => { setOpen(false); refresh(); }} />
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="h-60 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : classes.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">No classes created yet.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((c) => {
            const count = c.students?.[0]?.count ?? 0;
            const fillPct = Math.min(100, Math.round((count / (c.capacity || 40)) * 100));
            const teacher = c.class_teacher;
            return (
              <Card key={c.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{c.name}</h3>
                      {c.stream && <p className="text-xs text-muted-foreground">Stream: {c.stream}</p>}
                    </div>
                    <Badge variant="outline" className="capitalize">{c.level}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Enrolment</span>
                    <span className="font-medium">{count} / {c.capacity}</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${fillPct}%` }} />
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <UserCheck className="w-3.5 h-3.5" />
                    {teacher ? `Class teacher: ${teacher.first_name} ${teacher.last_name}` : "No class teacher assigned"}
                  </div>
                  <div className="text-xs text-muted-foreground">Year {c.year}</div>
                  {isAdmin && (
                    <div className="flex gap-2 pt-2">
                      <EditClassDialog cls={c} onDone={refresh} />
                      <DeleteClassButton cls={c} count={count} onDone={refresh} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddClassDialog({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: "", level: "primary", stream: "", capacity: 40 });
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("classes").insert({
        name: form.name, level: form.level, stream: form.stream || null, capacity: form.capacity,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Class created"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New Class</DialogTitle></DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Class Name</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Grade 5 / Form 2" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Level</Label>
            <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="primary">Primary</SelectItem>
                <SelectItem value="secondary">Secondary</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Capacity</Label><Input type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: +e.target.value })} /></div>
        </div>
        <div><Label>Stream (optional)</Label><Input value={form.stream} onChange={(e) => setForm({ ...form, stream: e.target.value })} placeholder="e.g. North / Blue" /></div>
        <DialogFooter>
          <Button type="submit" disabled={m.isPending}>
            {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function EditClassDialog({ cls, onDone }: { cls: any; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const { data: teachers = [] } = useTeachers();
  const [form, setForm] = useState({
    name: cls.name ?? "",
    stream: cls.stream ?? "",
    capacity: cls.capacity ?? 40,
    class_teacher_id: cls.class_teacher_id ?? "none",
  });
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("classes")
        .update({
          name: form.name,
          stream: form.stream || null,
          capacity: form.capacity,
          class_teacher_id: form.class_teacher_id === "none" ? null : form.class_teacher_id,
        })
        .eq("id", cls.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Class updated"); setOpen(false); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="flex-1"><Pencil className="w-3.5 h-3.5 mr-1" />Edit</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Class — {cls.name}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <div><Label>Name</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Stream</Label><Input value={form.stream} onChange={(e) => setForm({ ...form, stream: e.target.value })} /></div>
            <div><Label>Capacity</Label><Input type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: +e.target.value })} /></div>
          </div>
          <div>
            <Label>Class Teacher</Label>
            <Select value={form.class_teacher_id} onValueChange={(v) => setForm({ ...form, class_teacher_id: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Unassigned —</SelectItem>
                {teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.first_name} {t.last_name} <span className="text-muted-foreground text-xs">({t.role.replace(/_/g, " ")})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={m.isPending}>
              {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteClassButton({ cls, count, onDone }: { cls: any; count: number; onDone: () => void }) {
  const m = useMutation({
    mutationFn: async () => {
      if (count > 0) throw new Error(`Cannot delete: ${count} student(s) still assigned to this class.`);
      const { error } = await supabase.from("classes").delete().eq("id", cls.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Class deleted"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Button
      size="sm"
      variant="outline"
      className="text-destructive hover:bg-destructive/10"
      disabled={m.isPending}
      onClick={() => {
        if (window.confirm(`Delete class "${cls.name}"? This cannot be undone.`)) m.mutate();
      }}
    >
      <Trash2 className="w-3.5 h-3.5 mr-1" />Delete
    </Button>
  );
}
