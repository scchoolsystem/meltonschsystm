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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/staff")({
  component: StaffPage,
});

const ROLE_OPTIONS = [
  "principal","deputy_principal","class_teacher","subject_teacher","hod",
  "admission_officer","bursar","librarian","sports","boarding","staff",
];

function StaffPage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("*").order("employee_no", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Staff</h1>
          <p className="text-sm text-muted-foreground mt-1">{staff.length} members</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Add Staff</Button></DialogTrigger>
            <AddStaffDialog onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["staff"] }); }} />
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <p className="text-sm text-muted-foreground">All staff members across departments</p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-60 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee #</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">No staff yet.</TableCell></TableRow>
                  )}
                  {staff.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.employee_no}</TableCell>
                      <TableCell className="font-medium">{s.first_name} {s.last_name}</TableCell>
                      <TableCell><Badge variant="outline">{s.role.replace(/_/g, " ")}</Badge></TableCell>
                      <TableCell>{s.department ?? "—"}</TableCell>
                      <TableCell>{s.phone ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          s.status === "active" ? "bg-success/15 text-success border-success/30" :
                          s.status === "on_leave" ? "bg-warning/15 text-warning-foreground border-warning/30" : ""
                        }>{s.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AddStaffDialog({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", phone: "", role: "staff", department: "",
  });
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("staff").insert(form as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Staff added"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Add Staff Member</DialogTitle></DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>First Name</Label><Input required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
          <div><Label>Last Name</Label><Input required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Mathematics" /></div>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={m.isPending}>
            {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
