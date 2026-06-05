import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Pin } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/announcements")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => (await supabase.from("announcements").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false })).data ?? [],
  });
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">Announcements</h1><p className="text-sm text-muted-foreground mt-1">School-wide communication</p></div>
        {isAdmin && <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Post</Button></DialogTrigger>
          <AddDialog onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["announcements"] }); }} />
        </Dialog>}
      </div>
      {isLoading ? <Loader2 className="animate-spin mx-auto" /> : data.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No announcements yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {(data as any[]).map(a => (
            <Card key={a.id} className={a.pinned ? "border-primary/40" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <CardTitle className="text-lg flex items-center gap-2">{a.pinned && <Pin className="w-4 h-4 text-primary" />}{a.title}</CardTitle>
                  <div className="flex gap-2 items-center">
                    <Badge variant="outline" className="capitalize">{a.audience}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{a.body}</CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AddDialog({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const [f, setF] = useState({ title: "", body: "", audience: "all", pinned: false });
  const m = useMutation({ mutationFn: async () => { const { error } = await supabase.from("announcements").insert({ ...f, posted_by: user?.id }); if (error) throw error; }, onSuccess: () => { toast.success("Posted"); onDone(); }, onError: (e: any) => toast.error(e.message) });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New Announcement</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div><Label>Title</Label><Input required value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></div>
        <div><Label>Body</Label><Textarea required rows={5} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Audience</Label>
            <Select value={f.audience} onValueChange={v => setF({ ...f, audience: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="staff">Staff</SelectItem><SelectItem value="students">Students</SelectItem><SelectItem value="parents">Parents</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <input id="pin" type="checkbox" checked={f.pinned} onChange={e => setF({ ...f, pinned: e.target.checked })} className="w-4 h-4" />
            <Label htmlFor="pin">Pin to top</Label>
          </div>
        </div>
        <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}Post</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
