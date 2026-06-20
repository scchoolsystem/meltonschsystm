import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { updateStudent } from "@/lib/admissions.functions";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhotoCapture, uploadPhotoDataUrl } from "@/components/PhotoCapture";
import { Loader2, Award } from "lucide-react";
import { toast } from "sonner";

interface ClassRow { id: string; name: string; stream: string | null; year: number }

export function StudentWizard({
  existing, onDone,
}: { existing: any; onDone: (result?: any) => void }) {
  const update = useServerFn(updateStudent);
  const [photo, setPhoto] = useState<string | null>(null);

  const [form, setForm] = useState({
    first_name: existing?.first_name ?? "",
    last_name: existing?.last_name ?? "",
    gender: existing?.gender ?? "",
    date_of_birth: existing?.date_of_birth ?? "",
    class_id: existing?.class_id ?? "",
    national_id: existing?.national_id ?? "",
    desk_no: existing?.desk_no != null ? String(existing.desk_no) : "",
    parent_name: existing?.parent_name ?? "",
    parent_phone: existing?.parent_phone ?? "",
    parent_email: existing?.parent_email ?? "",
    address: existing?.address ?? "",
    medical_notes: existing?.medical_notes ?? "",
  });

  const [activityIds, setActivityIds] = useState<string[]>([]);

  const { data: classes = [] } = useQuery({
    queryKey: ["classes-min-edit"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, name, stream, year").order("name").order("stream");
      return (data ?? []) as ClassRow[];
    },
  });

  const { data: ccActivities = [] } = useQuery({
    queryKey: ["cc-activities-edit"],
    queryFn: async () => {
      const { data } = await supabase.from("co_curricular_activities").select("id, name, category").order("name");
      return data ?? [];
    },
  });

  // Preload this student's current club / activity enrollments.
  useQuery({
    queryKey: ["student-activities", existing?.id],
    enabled: !!existing?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("student_co_curricular")
        .select("activity_id")
        .eq("student_id", existing.id);
      if (!error) setActivityIds((data ?? []).map((r: any) => r.activity_id));
      return true;
    },
  });

  const m = useMutation({
    mutationFn: async () => {
      let photo_url: string | undefined;
      if (photo) {
        photo_url = await uploadPhotoDataUrl(supabase, photo, "students", `${form.first_name}-${form.last_name}`.toLowerCase().replace(/\s+/g, "-"));
      }
      const payload: any = {
        id: existing.id,
        ...form,
        desk_no: form.desk_no ? Number(form.desk_no) : undefined,
        activity_ids: activityIds,
        photo_url,
      };
      // Clean empties so we don't overwrite fields the admin left untouched.
      Object.keys(payload).forEach((k) => { if (payload[k] === "") delete payload[k]; });
      await update({ data: payload });
      return { edited: true };
    },
    onSuccess: (res) => {
      toast.success("Student updated");
      onDone(res);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update student"),
  });

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Edit {existing?.first_name} {existing?.last_name}</DialogTitle>
      </DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-4">
        <div>
          <Label className="mb-2 block">Photo</Label>
          <PhotoCapture value={photo ?? existing?.photo_url ?? null} onChange={setPhoto} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><Label>First Name *</Label><Input required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
          <div><Label>Last Name *</Label><Input required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
          <div><Label>Date of Birth</Label><Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></div>
          <div>
            <Label>Gender</Label>
            <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Class / Stream</Label>
            <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v })}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}{c.stream ? ` ${c.stream}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Desk No</Label><Input type="number" min={0} value={form.desk_no} onChange={(e) => setForm({ ...form, desk_no: e.target.value })} /></div>
          <div><Label>National ID</Label><Input value={form.national_id} onChange={(e) => setForm({ ...form, national_id: e.target.value })} /></div>
        </div>

        <div className="border-t pt-3 space-y-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Parent / Guardian</div>
          <div><Label>Name</Label><Input value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Phone</Label><Input value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} /></div>
            <div><Label>Email</Label><Input type="email" value={form.parent_email} onChange={(e) => setForm({ ...form, parent_email: e.target.value })} /></div>
          </div>
          <div><Label>Address</Label><Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div><Label>Medical Notes</Label><Textarea rows={2} value={form.medical_notes} onChange={(e) => setForm({ ...form, medical_notes: e.target.value })} /></div>
        </div>

        <div className="border-t pt-3 space-y-2">
          <Label className="inline-flex items-center gap-1"><Award className="w-3.5 h-3.5" /> Clubs & Co-curricular Activities</Label>
          <div className="flex flex-wrap gap-2 p-2 border rounded-md max-h-32 overflow-y-auto">
            {ccActivities.length === 0 && <span className="text-xs text-muted-foreground">No activities defined yet.</span>}
            {ccActivities.map((a: any) => {
              const on = activityIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setActivityIds(on ? activityIds.filter((x) => x !== a.id) : [...activityIds, a.id])}
                  className={`text-xs px-2 py-1 rounded border ${on ? "bg-primary text-primary-foreground border-primary" : "hover:border-primary"}`}
                >
                  {a.name}
                </button>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button type="submit" disabled={m.isPending}>
            {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
