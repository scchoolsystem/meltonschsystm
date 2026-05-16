import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin/settings")({
  component: SettingsPage,
});

interface SchoolSettings {
  id: string;
  school_name: string;
  motto: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  primary_color: string | null;
  academic_year: number | null;
  current_term: string | null;
  email_domain: string;
  credential_delivery_mode: string;
}

function SettingsPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["school-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("school_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data as SchoolSettings | null;
    },
  });

  const [form, setForm] = useState<Partial<SchoolSettings>>({});
  const [uploading, setUploading] = useState(false);
  useEffect(() => { if (data) setForm(data); }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!data?.id) throw new Error("Settings row missing");
      const { error } = await supabase.from("school_settings").update({
        school_name: form.school_name,
        motto: form.motto,
        email: form.email,
        phone: form.phone,
        address: form.address,
        logo_url: form.logo_url,
        primary_color: form.primary_color,
        academic_year: form.academic_year,
        current_term: form.current_term,
        credential_delivery_mode: form.credential_delivery_mode,
      }).eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["school-settings"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!isAdmin) return <div className="p-6"><Card><CardContent className="py-12 text-center text-muted-foreground">Admins only.</CardContent></Card></div>;
  if (isLoading) return <div className="p-6 grid place-items-center h-60"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const set = (k: keyof SchoolSettings, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">School Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Central configuration — applied across admissions, finance & academics</p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save changes
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">School Identity</CardTitle>
          <CardDescription>Name, motto and branding shown across portals & receipts</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div><Label>School Name</Label><Input value={form.school_name ?? ""} onChange={(e) => set("school_name", e.target.value)} /></div>
          <div><Label>Motto</Label><Input value={form.motto ?? ""} onChange={(e) => set("motto", e.target.value)} /></div>
          <div><Label>Email</Label><Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} /></div>
          <div><Label>Phone</Label><Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></div>
          <div className="md:col-span-2"><Label>Address</Label><Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} /></div>
          <div className="md:col-span-2">
            <Label>School Logo</Label>
            <div className="flex items-center gap-4 mt-1">
              {form.logo_url ? (
                <img src={form.logo_url} alt="Logo preview" className="w-16 h-16 rounded-lg object-cover border" />
              ) : (
                <div className="w-16 h-16 rounded-lg border border-dashed grid place-items-center text-xs text-muted-foreground">No logo</div>
              )}
              <div className="flex-1 space-y-2">
                <Input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploading(true);
                    try {
                      const ext = file.name.split(".").pop() ?? "png";
                      const path = `school-logo/${Date.now()}.${ext}`;
                      const { error: upErr } = await supabase.storage.from("profile-photos").upload(path, file, { upsert: true, contentType: file.type });
                      if (upErr) throw upErr;
                      const { data: pub } = supabase.storage.from("profile-photos").getPublicUrl(path);
                      set("logo_url", pub.publicUrl);
                      toast.success("Logo uploaded — click Save changes");
                    } catch (err: any) {
                      toast.error(err.message ?? "Upload failed");
                    } finally {
                      setUploading(false);
                      e.target.value = "";
                    }
                  }}
                />
                {uploading && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Uploading…</p>}
                {form.logo_url && !uploading && (
                  <button type="button" onClick={() => set("logo_url", null)} className="text-xs text-destructive hover:underline">Remove logo</button>
                )}
              </div>
            </div>
          </div>
          <div>
            <Label>Primary Color</Label>
            <div className="flex gap-2 items-center">
              <Input type="color" value={form.primary_color ?? "#3b82f6"} onChange={(e) => set("primary_color", e.target.value)} className="w-16 h-10 p-1" />
              <Input value={form.primary_color ?? ""} onChange={(e) => set("primary_color", e.target.value)} placeholder="#3b82f6" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Academic Period</CardTitle>
          <CardDescription>Used by admissions, exams, fees and reports</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <div>
            <Label>Academic Year</Label>
            <Input type="number" value={form.academic_year ?? ""} onChange={(e) => set("academic_year", e.target.value ? Number(e.target.value) : null)} />
          </div>
          <div>
            <Label>Current Term</Label>
            <Select value={form.current_term ?? ""} onValueChange={(v) => set("current_term", v)}>
              <SelectTrigger><SelectValue placeholder="Select term" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Term 1">Term 1</SelectItem>
                <SelectItem value="Term 2">Term 2</SelectItem>
                <SelectItem value="Term 3">Term 3</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Credential Delivery</Label>
            <Select value={form.credential_delivery_mode ?? "hybrid"} onValueChange={(v) => set("credential_delivery_mode", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hybrid">Hybrid (print + digital)</SelectItem>
                <SelectItem value="print">Print only</SelectItem>
                <SelectItem value="digital">Digital only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
