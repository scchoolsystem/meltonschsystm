import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { createStaff } from "@/lib/admissions.functions";
import { PhotoCapture, uploadPhotoDataUrl } from "@/components/PhotoCapture";
import { IdCard } from "@/components/IdCard";
import { LifecycleActions } from "@/components/LifecycleActions";
import { StatusBadge } from "@/components/StatusBadge";

export const Route = createFileRoute("/_app/staff")({
  component: StaffPage,
});

const ROLE_OPTIONS = [
  "principal","deputy_principal","class_teacher","subject_teacher","teacher","hod",
  "admission_officer","bursar","librarian","nurse","matron","sports","boarding",
  "kitchen_admin","kitchen_user","security_admin","security_user","transport_officer",
  "exams_admin","academic_master","staff",
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

  const { data: settings } = useQuery({
    queryKey: ["school-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("school_settings").select("school_name, academic_year, current_term").limit(1).maybeSingle();
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
          <Dialog open={open} onOpenChange={(o) => setOpen(o)}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Add Staff</Button></DialogTrigger>
            <AddStaffDialog settings={settings} onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["staff"] }); }} />
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
                    <TableHead>Unique ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.length === 0 && (
                    <TableRow><TableCell colSpan={isAdmin ? 8 : 7} className="text-center text-sm text-muted-foreground py-8">No staff yet.</TableCell></TableRow>
                  )}
                  {staff.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.employee_no}</TableCell>
                      <TableCell className="font-mono text-xs">{s.unique_id ?? "—"}</TableCell>
                      <TableCell className="font-medium flex items-center gap-2">
                        {s.photo_url && <img src={s.photo_url} alt="" className="w-7 h-7 rounded-full object-cover" />}
                        {s.first_name} {s.last_name}
                      </TableCell>
                      <TableCell><Badge variant="outline">{s.role.replace(/_/g, " ")}</Badge></TableCell>
                      <TableCell>{s.department ?? "—"}</TableCell>
                      <TableCell>{s.phone ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={s.lifecycle_status ?? s.status} /></TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <LifecycleActions kind="staff" id={s.id} currentStatus={s.lifecycle_status ?? "active"} queryKey="staff" />
                        </TableCell>
                      )}
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

function AddStaffDialog({ settings, onDone }: { settings: any; onDone: () => void }) {
  const create = useServerFn(createStaff);
  const [photo, setPhoto] = useState<string | null>(null);
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", phone: "", role: "staff", department: "",
  });
  const [result, setResult] = useState<null | { uniqueId: string; password: string; employee_no: string; full_name: string; role: string; photo_url: string | null }>(null);

  const m = useMutation({
    mutationFn: async () => {
      let photo_url: string | undefined;
      if (photo) {
        photo_url = await uploadPhotoDataUrl(supabase, photo, "staff", `${form.first_name}-${form.last_name}`.toLowerCase().replace(/\s+/g, "-"));
      }
      const res = await create({ data: { ...form, photo_url } as any });
      return { ...res, photo_url: photo_url ?? null };
    },
    onSuccess: (res) => {
      toast.success("Staff added");
      setResult({
        uniqueId: res.uniqueId,
        password: res.password,
        employee_no: res.staff.employee_no,
        full_name: `${res.staff.first_name} ${res.staff.last_name}`,
        role: res.staff.role,
        photo_url: res.photo_url,
      });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (result) {
    return (
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Staff added ✓</DialogTitle>
          <p className="text-xs text-muted-foreground">Share the credentials below — the password is shown only once.</p>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex justify-center">
            <IdCard
              schoolName={settings?.school_name ?? "School"}
              kind="STAFF"
              uniqueId={result.uniqueId}
              fullName={result.full_name}
              subtitle={result.role.replace(/_/g, " ")}
              photoUrl={result.photo_url}
              meta={[{ label: "EMP", value: result.employee_no }]}
              validUntil={settings?.academic_year ? `Dec ${settings.academic_year}` : undefined}
            />
          </div>
          <div className="rounded-md border bg-muted/40 p-3 text-sm font-mono space-y-1">
            <div>Login ID: <span className="font-bold">{result.uniqueId}</span></div>
            <div>Password: <span className="font-bold">{result.password}</span></div>
            <div>Employee #: {result.employee_no}</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => window.print()}>Print</Button>
          <Button onClick={onDone}>Done</Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Add Staff Member</DialogTitle>
        {settings && (
          <p className="text-xs text-muted-foreground">
            {settings.school_name} · {settings.current_term ?? ""} {settings.academic_year ?? ""}
          </p>
        )}
      </DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-4">
        <div>
          <Label className="mb-2 block">Staff Photo</Label>
          <PhotoCapture value={photo} onChange={setPhoto} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>First Name *</Label><Input required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
          <div><Label>Last Name *</Label><Input required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Contact Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Role *</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Mathematics" /></div>
        </div>
        <p className="text-xs text-muted-foreground">A unique Staff ID (STF-{settings?.academic_year ?? new Date().getFullYear()}-XXXXXX), employee number, and login password are generated automatically.</p>
        <DialogFooter>
          <Button type="submit" disabled={m.isPending}>
            {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Staff Account
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
