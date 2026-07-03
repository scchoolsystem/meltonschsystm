import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createStaff, updateStaff } from "@/lib/admissions.functions";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhotoCapture, uploadPhotoDataUrl } from "@/components/PhotoCapture";
import { Loader2, GraduationCap, Briefcase, Wrench, Check } from "lucide-react";
import { toast } from "sonner";

type Category = "teaching" | "administration" | "support";

const ROLE_OPTIONS = [
  "principal","deputy_principal","class_teacher","subject_teacher","teacher","hod",
  "admission_officer","bursar","librarian","nurse","matron","sports","boarding",
  "kitchen_admin","kitchen_user","security_admin","security_user","transport_officer",
  "exams_admin","academic_master","staff",
];

const SHIFTS = ["Day", "Night", "Rotating"];

export function StaffWizard({
  existing, onDone,
}: { existing?: any; onDone: (result?: any) => void }) {
  const isEdit = !!existing;
  const create = useServerFn(createStaff);
  const update = useServerFn(updateStaff);

  const [step, setStep] = useState<1 | 2>(isEdit ? 2 : 1);
  const [category, setCategory] = useState<Category>(
    (existing?.staff_category as Category) || "teaching"
  );
  const [photo, setPhoto] = useState<string | null>(null);

  const [form, setForm] = useState({
    first_name: existing?.first_name ?? "",
    last_name: existing?.last_name ?? "",
    email: existing?.email ?? "",
    phone: existing?.phone ?? "",
    role: existing?.role ?? "teacher",
    hire_date: existing?.hire_date ?? "",
    department_id: existing?.department_id ?? "",
    sub_department_id: existing?.sub_department_id ?? "",
    class_responsibility: existing?.class_responsibility ?? "",
    admin_unit: existing?.admin_unit ?? "",
    position_title: existing?.position_title ?? "",
    oversight: (existing?.oversight as string[]) ?? [],
    support_unit: existing?.support_unit ?? "",
    assigned_area: existing?.assigned_area ?? "",
    shift: existing?.shift ?? "",
    cc_department_id: "",
  });

  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [activities, setActivities] = useState<Array<{ activity_id: string; role: string }>>([]);
  const [extraRoles, setExtraRoles] = useState<string[]>([]);

  // Load departments / subjects / activities
  const { data: depts = [] } = useQuery({
    queryKey: ["departments-wizard"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, kind, name").order("name");
      return data ?? [];
    },
  });
  const { data: subDepts = [] } = useQuery({
    queryKey: ["sub-departments", form.department_id],
    enabled: !!form.department_id,
    queryFn: async () => {
      const { data } = await supabase.from("sub_departments").select("id, name").eq("department_id", form.department_id).order("name");
      return data ?? [];
    },
  });
  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects-wizard"],
    queryFn: async () => {
      const { data } = await supabase.from("subjects").select("id, code, name").order("name");
      return data ?? [];
    },
  });
  const { data: ccActivities = [] } = useQuery({
    queryKey: ["cc-activities", form.cc_department_id],
    queryFn: async () => {
      let q = supabase.from("co_curricular_activities").select("id, name, department_id").order("name");
      if (form.cc_department_id) q = q.eq("department_id", form.cc_department_id);
      const { data } = await q;
      return data ?? [];
    },
  });

  // Preload existing links when editing
  useQuery({
    queryKey: ["staff-links", existing?.id],
    enabled: isEdit,
    queryFn: async () => {
      const [{ data: ts }, { data: sc }, { data: ur }] = await Promise.all([
        supabase.from("teacher_subjects").select("subject_id").eq("staff_id", existing.id),
        supabase.from("staff_co_curricular").select("activity_id, role").eq("staff_id", existing.id),
        existing?.user_id
          ? supabase.from("user_roles").select("role").eq("user_id", existing.user_id)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      setSubjectIds((ts ?? []).map((r: any) => r.subject_id));
      setActivities((sc ?? []).map((r: any) => ({ activity_id: r.activity_id, role: r.role })));
      const primary = existing?.role;
      const preserved = new Set(["super_admin", "platform_admin", "platform_owner"]);
      setExtraRoles((ur ?? [])
        .map((r: any) => r.role)
        .filter((r: string) => r !== primary && r !== "class_teacher" && !preserved.has(r)));
      return true;
    },
  });

  const acadDepts = useMemo(() => depts.filter((d: any) => d.kind === "academics"), [depts]);
  const adminDepts = useMemo(() => depts.filter((d: any) => d.kind === "administration"), [depts]);
  const ccDepts = useMemo(() => depts.filter((d: any) => d.kind === "co_curricular"), [depts]);
  const supportDepts = useMemo(() => depts.filter((d: any) => d.kind === "support"), [depts]);

  const m = useMutation({
    mutationFn: async () => {
      let photo_url: string | undefined;
      if (photo) {
        photo_url = await uploadPhotoDataUrl(supabase, photo, "staff", `${form.first_name}-${form.last_name}`.toLowerCase().replace(/\s+/g, "-"));
      }
      const payload: any = {
        ...form,
        staff_category: category,
        subject_ids: category === "teaching" ? subjectIds : [],
        activities: category === "teaching" ? activities : [],
        extra_roles: extraRoles.filter((r) => r !== form.role),
        photo_url,
      };
      // Clean empties
      Object.keys(payload).forEach((k) => { if (payload[k] === "") delete payload[k]; });
      delete payload.cc_department_id;

      if (isEdit) {
        await update({ data: { id: existing.id, ...payload } });
        return { edited: true };
      }
      const res = await create({ data: payload });
      return res;
    },
    onSuccess: (res) => {
      toast.success(isEdit ? "Staff updated" : "Staff created");
      onDone(res);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  if (step === 1 && !isEdit) {
    const opts: { value: Category; label: string; desc: string; Icon: any }[] = [
      { value: "teaching", label: "Teaching Staff", desc: "Teachers, HoDs, academic master", Icon: GraduationCap },
      { value: "administration", label: "Administration", desc: "Principal office, finance, HR", Icon: Briefcase },
      { value: "support", label: "Support Staff", desc: "Security, kitchen, clinic, transport", Icon: Wrench },
    ];
    return (
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Staff — Step 1 of 2</DialogTitle>
          <p className="text-sm text-muted-foreground">Choose the staff category</p>
        </DialogHeader>
        <div className="grid sm:grid-cols-3 gap-3 py-2">
          {opts.map(({ value, label, desc, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setCategory(value)}
              className={`rounded-lg border p-4 text-left hover:border-primary transition ${category === value ? "border-primary bg-primary/5" : ""}`}
            >
              <Icon className="w-6 h-6 mb-2 text-primary" />
              <div className="font-semibold text-sm">{label}</div>
              <div className="text-xs text-muted-foreground mt-1">{desc}</div>
              {category === value && <Check className="w-4 h-4 text-primary mt-2" />}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={() => setStep(2)}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>
          {isEdit ? `Edit Staff — ${existing.first_name} ${existing.last_name}` : "Add Staff — Step 2 of 2"}
        </DialogTitle>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="secondary" className="capitalize">{category}</Badge>
          {!isEdit && <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setStep(1)}>change</button>}
        </div>
      </DialogHeader>

      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-4">
        <div>
          <Label className="mb-2 block">Staff Photo</Label>
          <PhotoCapture value={photo ?? existing?.photo_url ?? null} onChange={setPhoto} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><Label>First Name *</Label><Input required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} disabled={isEdit} /></div>
          <div><Label>Last Name *</Label><Input required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} disabled={isEdit} /></div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div>
            <Label>Role *</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Hire Date</Label><Input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></div>
        </div>

        <div>
          <Label>Additional Roles <span className="text-xs text-muted-foreground">(optional — grants extra permissions on top of the primary role)</span></Label>
          <div className="flex flex-wrap gap-2 mt-1 p-2 border rounded-md max-h-32 overflow-y-auto">
            {ROLE_OPTIONS.filter((r) => r !== form.role).map((r) => {
              const on = extraRoles.includes(r);
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setExtraRoles(on ? extraRoles.filter((x) => x !== r) : [...extraRoles, r])}
                  className={`text-xs px-2 py-1 rounded border capitalize ${on ? "bg-primary text-primary-foreground border-primary" : "hover:border-primary"}`}
                >
                  {r.replace(/_/g, " ")}
                </button>
              );
            })}
          </div>
        </div>

        {category === "teaching" && (
          <div className="border-t pt-4 space-y-3">
            <div className="text-sm font-semibold">Teaching Assignment</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Academic Department</Label>
                <Select value={form.department_id} onValueChange={(v) => setForm({ ...form, department_id: v, sub_department_id: "" })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{acadDepts.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sub-department</Label>
                <Select value={form.sub_department_id} onValueChange={(v) => setForm({ ...form, sub_department_id: v })} disabled={!form.department_id || subDepts.length === 0}>
                  <SelectTrigger><SelectValue placeholder={subDepts.length ? "Select…" : "—"} /></SelectTrigger>
                  <SelectContent>{subDepts.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Subjects Taught</Label>
              <div className="flex flex-wrap gap-2 mt-1 p-2 border rounded-md max-h-32 overflow-y-auto">
                {subjects.length === 0 && <span className="text-xs text-muted-foreground">No subjects defined yet.</span>}
                {subjects.map((s: any) => {
                  const on = subjectIds.includes(s.id);
                  return (
                    <button key={s.id} type="button"
                      onClick={() => setSubjectIds(on ? subjectIds.filter((x) => x !== s.id) : [...subjectIds, s.id])}
                      className={`text-xs px-2 py-1 rounded border ${on ? "bg-primary text-primary-foreground border-primary" : "hover:border-primary"}`}>
                      {s.code ?? s.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div><Label>Class Responsibility</Label><Input value={form.class_responsibility} onChange={(e) => setForm({ ...form, class_responsibility: e.target.value })} placeholder="e.g. Form 1 North" /></div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Co-curricular Department</Label>
                <Select value={form.cc_department_id} onValueChange={(v) => setForm({ ...form, cc_department_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Any / all" /></SelectTrigger>
                  <SelectContent>{ccDepts.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Activities Coached</Label>
              <div className="flex flex-wrap gap-2 mt-1 p-2 border rounded-md max-h-32 overflow-y-auto">
                {ccActivities.length === 0 && <span className="text-xs text-muted-foreground">No activities defined.</span>}
                {ccActivities.map((a: any) => {
                  const on = activities.some((x) => x.activity_id === a.id);
                  return (
                    <button key={a.id} type="button"
                      onClick={() => setActivities(on ? activities.filter((x) => x.activity_id !== a.id) : [...activities, { activity_id: a.id, role: "coach" }])}
                      className={`text-xs px-2 py-1 rounded border ${on ? "bg-primary text-primary-foreground border-primary" : "hover:border-primary"}`}>
                      {a.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {category === "administration" && (
          <div className="border-t pt-4 space-y-3">
            <div className="text-sm font-semibold">Administrative Role</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Administrative Unit</Label>
                <Select value={form.department_id} onValueChange={(v) => setForm({ ...form, department_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{adminDepts.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Position Title</Label><Input value={form.position_title} onChange={(e) => setForm({ ...form, position_title: e.target.value })} placeholder="e.g. Bursar" /></div>
            </div>
            <div>
              <Label>Oversight Responsibilities</Label>
              <Input
                value={(form.oversight || []).join(", ")}
                onChange={(e) => setForm({ ...form, oversight: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                placeholder="Academics, Discipline, Boarding (comma-separated)"
              />
            </div>
          </div>
        )}

        {category === "support" && (
          <div className="border-t pt-4 space-y-3">
            <div className="text-sm font-semibold">Support Assignment</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Support Unit</Label>
                <Select value={form.department_id} onValueChange={(v) => setForm({ ...form, department_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{supportDepts.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Assigned Area</Label><Input value={form.assigned_area} onChange={(e) => setForm({ ...form, assigned_area: e.target.value })} placeholder="e.g. Main Gate" /></div>
              <div>
                <Label>Shift</Label>
                <Select value={form.shift} onValueChange={(v) => setForm({ ...form, shift: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{SHIFTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="submit" disabled={m.isPending}>
            {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Create staff account"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
