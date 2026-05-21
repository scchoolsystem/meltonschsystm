import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/academics/subjects")({ component: Page });

interface Subject { id: string; code: string; name: string; level: string }

function Page() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("*").order("code");
      if (error) throw error;
      return data as Subject[];
    },
  });
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">Subjects</h1><p className="text-sm text-muted-foreground mt-1">{data.length} subjects defined</p></div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Add Subject</Button></DialogTrigger>
            <AddDialog onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["subjects"] }); }} />
          </Dialog>
        )}
      </div>
      <Card>
        <CardHeader />
        <CardContent>
          {isLoading ? <div className="h-40 grid place-items-center"><Loader2 className="animate-spin" /></div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Level</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No subjects yet.</TableCell></TableRow>}
                {data.map(s => <TableRow key={s.id}><TableCell className="font-mono">{s.code}</TableCell><TableCell className="font-medium">{s.name}</TableCell><TableCell className="capitalize">{s.level}</TableCell>{isAdmin && <TableCell><DeleteConfirmDialog label={s.name} isPending={false} onConfirm={async () => { const { data: sid } = await supabase.rpc("current_user_school"); if (sid) { await supabase.from("subjects").delete().eq("id", s.id); await supabase.from("activity_logs").insert({ action: "DELETE_SUBJECT", entity: "subject", entity_id: s.id, school_id: sid as string, metadata: { label: s.name } }); qc.invalidateQueries({ queryKey: ["subjects"] }); toast.success(`${s.name} deleted`); }}} /></TableCell>}</TableRow>)}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AddDialog({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ code: "", name: "", level: "secondary" });
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("subjects").insert(f);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Subject added"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New Subject</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Code</Label><Input required value={f.code} onChange={e => setF({ ...f, code: e.target.value })} placeholder="e.g. MATH" /></div>
        <div><Label>Name</Label><Input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
        <div><Label>Level</Label>
          <Select value={f.level} onValueChange={v => setF({ ...f, level: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="primary">Primary</SelectItem><SelectItem value="secondary">Secondary</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent>
          </Select>
        </div>
        <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Save</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
