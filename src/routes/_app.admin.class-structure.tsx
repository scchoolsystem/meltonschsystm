import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Loader2, Plus, Trash2, GripVertical, GraduationCap,
  ArrowUp, ArrowDown, Info, Save,
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin/class-structure")({
  component: ClassStructurePage,
});

interface ClassLevel {
  id?: string;
  class_name: string;
  sort_order: number;
  is_terminal: boolean;
  _new?: boolean;
  _deleted?: boolean;
}

// Preset templates for quick setup
const TEMPLATES: Record<string, { name: string; classes: string[] }> = {
  primary: {
    name: "Primary School (Grade 1–8)",
    classes: ["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8"],
  },
  jss: {
    name: "Junior Secondary (JSS1–3)",
    classes: ["JSS1","JSS2","JSS3"],
  },
  sss: {
    name: "Senior Secondary (SS1–3)",
    classes: ["SS1","SS2","SS3"],
  },
  form: {
    name: "Form 1–4",
    classes: ["Form 1","Form 2","Form 3","Form 4"],
  },
  cambridge: {
    name: "Cambridge (Year 7–13)",
    classes: ["Year 7","Year 8","Year 9","Year 10","Year 11","Year 12","Year 13"],
  },
  cbc: {
    name: "CBC Kenya (PP1–Grade 9)",
    classes: ["PP1","PP2","Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9"],
  },
};

function ClassStructurePage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [rows, setRows] = useState<ClassLevel[]>([]);
  const [newName, setNewName] = useState("");
  const [dirty, setDirty] = useState(false);

  const { data: schoolId } = useQuery({
    queryKey: ["current-school-id"],
    queryFn: async () => {
      const { data } = await supabase.rpc("current_user_school");
      return data as string | null;
    },
  });

  const { data: structure = [], isLoading } = useQuery({
    queryKey: ["class-structure", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data, error } = await supabase
        .from("school_class_structure")
        .select("*")
        .eq("school_id", schoolId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as ClassLevel[];
    },
    enabled: !!schoolId,
  });

  useEffect(() => {
    if (structure.length > 0) setRows(structure);
  }, [structure]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("No school context");
      const active = rows.filter((r) => !r._deleted);

      // Delete removed rows that existed in DB
      const toDelete = rows.filter((r) => r._deleted && r.id);
      for (const r of toDelete) {
        const { error } = await supabase
          .from("school_class_structure")
          .delete()
          .eq("id", r.id!);
        if (error) throw error;
      }

      // Upsert remaining rows
      for (let i = 0; i < active.length; i++) {
        const r = active[i];
        const payload = {
          school_id: schoolId,
          class_name: r.class_name.trim(),
          sort_order: i + 1,
          is_terminal: i === active.length - 1 ? true : r.is_terminal,
        };
        if (r.id && !r._new) {
          const { error } = await supabase
            .from("school_class_structure")
            .update(payload)
            .eq("id", r.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("school_class_structure")
            .insert(payload);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success("Class structure saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["class-structure"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function addRow() {
    const name = newName.trim();
    if (!name) return;
    if (rows.some((r) => !r._deleted && r.class_name === name)) {
      toast.error("Class name already exists");
      return;
    }
    const next = rows.filter((r) => !r._deleted).length + 1;
    setRows((prev) => [
      ...prev,
      { class_name: name, sort_order: next, is_terminal: false, _new: true },
    ]);
    setNewName("");
    setDirty(true);
  }

  function removeRow(idx: number) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, _deleted: true } : r))
    );
    setDirty(true);
  }

  function moveUp(idx: number) {
    const active = rows.map((r, i) => ({ ...r, _origIdx: i })).filter((r) => !r._deleted);
    const pos = active.findIndex((r) => r._origIdx === idx);
    if (pos <= 0) return;
    const swapped = [...active];
    [swapped[pos - 1], swapped[pos]] = [swapped[pos], swapped[pos - 1]];
    // Rebuild full rows array
    const deletedRows = rows.filter((r) => r._deleted);
    setRows([...swapped.map((r) => ({ ...r })), ...deletedRows]);
    setDirty(true);
  }

  function moveDown(idx: number) {
    const active = rows.map((r, i) => ({ ...r, _origIdx: i })).filter((r) => !r._deleted);
    const pos = active.findIndex((r) => r._origIdx === idx);
    if (pos === -1 || pos >= active.length - 1) return;
    const swapped = [...active];
    [swapped[pos], swapped[pos + 1]] = [swapped[pos + 1], swapped[pos]];
    const deletedRows = rows.filter((r) => r._deleted);
    setRows([...swapped.map((r) => ({ ...r })), ...deletedRows]);
    setDirty(true);
  }

  function applyTemplate(key: string) {
    const tpl = TEMPLATES[key];
    if (!tpl) return;
    const newRows: ClassLevel[] = tpl.classes.map((cls, i) => ({
      class_name: cls,
      sort_order: i + 1,
      is_terminal: i === tpl.classes.length - 1,
      _new: true,
    }));
    setRows(newRows);
    setDirty(true);
    toast.info(`Template "${tpl.name}" loaded — click Save to apply`);
  }

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

  const activeRows = rows.filter((r) => !r._deleted);

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Class Structure</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define the ordered progression of classes in your school.
            The promotion engine uses this list to determine the next class for each student.
          </p>
        </div>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !dirty}>
          {saveMutation.isPending
            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            : <Save className="w-4 h-4 mr-2" />}
          Save Structure
        </Button>
      </div>

      {/* Quick-start templates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick-Start Templates</CardTitle>
          <CardDescription>
            Choose a curriculum template to pre-fill the class list. You can edit it afterwards.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Object.entries(TEMPLATES).map(([key, tpl]) => (
            <Button key={key} variant="outline" size="sm" onClick={() => applyTemplate(key)}>
              {tpl.name}
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Class list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Class Order</CardTitle>
          <CardDescription>
            Drag (or use arrows) to reorder. The last class is automatically treated as the
            <span className="font-medium"> graduating class</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="h-32 grid place-items-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : activeRows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
              No classes configured yet. Add classes below or choose a template above.
            </div>
          ) : (
            <div className="space-y-2">
              {activeRows.map((row, visIdx) => {
                const origIdx = rows.indexOf(row);
                const isLast = visIdx === activeRows.length - 1;
                return (
                  <div
                    key={`${row.id ?? "new"}-${visIdx}`}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border bg-card
                      ${isLast ? "border-amber-400 dark:border-amber-500" : "border-border"}`}
                  >
                    <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="w-6 text-xs font-mono text-muted-foreground shrink-0">
                      {visIdx + 1}.
                    </span>
                    <span className="flex-1 font-medium text-sm">{row.class_name}</span>
                    {isLast && (
                      <Badge variant="secondary" className="gap-1 shrink-0">
                        <GraduationCap className="w-3 h-3" />
                        Graduating
                      </Badge>
                    )}
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        disabled={visIdx === 0}
                        onClick={() => moveUp(origIdx)}
                      >
                        <ArrowUp className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        disabled={isLast}
                        onClick={() => moveDown(origIdx)}
                      >
                        <ArrowDown className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => removeRow(origIdx)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add new class */}
          <div className="flex gap-2 pt-2">
            <Input
              placeholder="Class name, e.g. Form 3 or Grade 5"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addRow()}
            />
            <Button onClick={addRow} disabled={!newName.trim()}>
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Info box */}
      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="pt-4 flex gap-3">
          <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <p className="font-medium">How the promotion engine uses this list</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs opacity-80">
              <li>The order here determines which class a student moves to after promotion.</li>
              <li>The last class in the list is automatically the <em>graduating class</em>.</li>
              <li>Class names must exactly match the names used in the <strong>Classes</strong> module.</li>
              <li>Students in unrecognised classes will be skipped during automatic promotion.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
