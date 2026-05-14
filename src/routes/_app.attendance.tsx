import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/attendance")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("teacher") || hasRole("deputy_principal");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [classId, setClassId] = useState<string>("");

  const { data: classes = [] } = useQuery({ queryKey: ["classes-att"], queryFn: async () => (await supabase.from("classes").select("id,name").order("name")).data ?? [] });
  const { data: students = [] } = useQuery({
    queryKey: ["students-att", classId],
    enabled: !!classId,
    queryFn: async () => (await supabase.from("students").select("id, admission_no, first_name, last_name").eq("class_id", classId).order("admission_no")).data ?? [],
  });
  const { data: existing = [] } = useQuery({
    queryKey: ["att", classId, date],
    enabled: !!classId,
    queryFn: async () => (await supabase.from("attendance_records").select("*").eq("date", date).in("student_id", (students as any[]).map(s => s.id))).data ?? [],
  });

  const map = useMemo(() => {
    const m: Record<string, string> = {};
    (existing as any[]).forEach(r => { m[r.student_id] = r.status; });
    return m;
  }, [existing]);

  const [draft, setDraft] = useState<Record<string, string>>({});
  const get = (id: string) => draft[id] ?? map[id] ?? "present";

  const save = useMutation({
    mutationFn: async () => {
      const rows = (students as any[]).map(s => ({ student_id: s.id, class_id: classId, date, status: get(s.id) }));
      const { error } = await supabase.from("attendance_records").upsert(rows, { onConflict: "student_id,date" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Attendance saved"); qc.invalidateQueries({ queryKey: ["att", classId, date] }); setDraft({}); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div><h1 className="text-3xl font-bold">Attendance</h1><p className="text-sm text-muted-foreground mt-1">Mark daily attendance per class</p></div>
      <Card><CardHeader>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]"><Label>Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder="Choose class" /></SelectTrigger>
              <SelectContent>{(classes as any[]).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          {can && classId && <Button onClick={() => save.mutate()} disabled={save.isPending}><Save className="w-4 h-4 mr-2" />{save.isPending ? "Saving…" : "Save"}</Button>}
        </div>
      </CardHeader><CardContent>
        {!classId ? <p className="text-center text-muted-foreground py-8">Select a class to begin.</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>Adm No</TableHead><TableHead>Name</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {(students as any[]).length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No students in this class.</TableCell></TableRow>}
              {(students as any[]).map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.admission_no}</TableCell>
                  <TableCell className="font-medium">{s.first_name} {s.last_name}</TableCell>
                  <TableCell>
                    <Select value={get(s.id)} onValueChange={v => setDraft({ ...draft, [s.id]: v })} disabled={!can}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="present">Present</SelectItem>
                        <SelectItem value="absent">Absent</SelectItem>
                        <SelectItem value="late">Late</SelectItem>
                        <SelectItem value="excused">Excused</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  );
}
