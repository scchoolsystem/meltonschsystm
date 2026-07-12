import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Globe, Image as ImageIcon, Users, Clock, Mail, Layers, Plus, Trash2,
  Upload, Loader2, Save, GripVertical,
} from "lucide-react";

export const Route = createFileRoute("/platform/website")({
  component: WebsiteEditor,
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function useLandingSection<T = any>(section: string, fallback: T) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["landing-content", section],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("landing_content")
        .select("content")
        .eq("section", section)
        .maybeSingle();
      if (error) throw error;
      return (data?.content as T) ?? fallback;
    },
  });

  const save = useMutation({
    mutationFn: async (content: T) => {
      const { error } = await (supabase as any)
        .from("landing_content")
        .upsert({ section, content }, { onConflict: "section" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved — live on the website now");
      qc.invalidateQueries({ queryKey: ["landing-content", section] });
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  return { data: data ?? fallback, isLoading, save };
}

async function uploadLandingImage(file: File, folder: string): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("landing-media").upload(path, file, {
    upsert: true,
    contentType: file.type,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("landing-media").getPublicUrl(path);
  return data.publicUrl;
}

function ImagePicker({ label, value, onChange, folder }: { label: string; value: string | null | undefined; onChange: (url: string) => void; folder: string }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <div className="flex items-center gap-3">
        <div className="w-20 h-20 rounded-lg border bg-muted overflow-hidden shrink-0 grid place-items-center">
          {value ? <img src={value} alt={label || "Preview"} className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6 text-muted-foreground" />}
        </div>
        <div className="flex-1 space-y-2">
          <Input value={value ?? ""} placeholder="Image URL (or upload below)" onChange={(e) => onChange(e.target.value)} />
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              try {
                const url = await uploadLandingImage(file, folder);
                onChange(url);
                toast.success("Image uploaded");
              } catch (err: any) {
                toast.error(err.message ?? "Upload failed");
              } finally {
                setUploading(false);
                e.target.value = "";
              }
            }}
          />
          <Button type="button" variant="outline" size="sm" className="gap-2" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Upload image
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function WebsiteEditor() {
  const { roles } = useAuth();
  const isOwner = roles.includes("platform_owner");

  if (!isOwner) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Only the platform owner can edit the public website content.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Globe className="h-6 w-6" /> Website content</h1>
        <p className="text-sm text-muted-foreground mt-1">Everything on smartdev.co.ke — text, images, story, pricing — editable here. Changes go live immediately.</p>
      </div>

      <Tabs defaultValue="site">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="site">Site &amp; Contact</TabsTrigger>
          <TabsTrigger value="hero">Hero</TabsTrigger>
          <TabsTrigger value="founder">Founder</TabsTrigger>
          <TabsTrigger value="story">Our Story</TabsTrigger>
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
          <TabsTrigger value="gallery">Photo Gallery</TabsTrigger>
          <TabsTrigger value="pricing">Pricing &amp; Modules</TabsTrigger>
        </TabsList>

        <TabsContent value="site" className="mt-4"><SiteMetaEditor /></TabsContent>
        <TabsContent value="hero" className="mt-4"><HeroEditor /></TabsContent>
        <TabsContent value="founder" className="mt-4"><FounderEditor /></TabsContent>
        <TabsContent value="story" className="mt-4"><StoryEditor /></TabsContent>
        <TabsContent value="milestones" className="mt-4"><MilestonesEditor /></TabsContent>
        <TabsContent value="gallery" className="mt-4"><GalleryEditor /></TabsContent>
        <TabsContent value="pricing" className="mt-4"><PricingEditor /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Site identity + contact info (used across header, footer, every page)
// ---------------------------------------------------------------------------

function SiteMetaEditor() {
  const fallback = {
    brand_name: "SMART DEV", tagline: "", footer_credit: "",
    email_hello: "", email_support: "", email_sales: "", email_legal: "", email_admin: "",
    phone_primary: "", phone_support: "", location: "Nairobi, Kenya",
  };
  const { data, isLoading, save } = useLandingSection("site_meta", fallback);
  const [form, setForm] = useState(fallback);
  useEffect(() => { if (!isLoading) setForm({ ...fallback, ...data }); }, [isLoading, data]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Site identity &amp; contact</CardTitle>
        <CardDescription>Brand name, footer credit and the contact details shown on every page (header, footer, contact page, pricing CTAs). Use one consistent phone number everywhere.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Brand name (shown in header/footer)</Label><Input value={form.brand_name} onChange={(e) => set("brand_name", e.target.value)} /></div>
              <div><Label>Tagline</Label><Input value={form.tagline} onChange={(e) => set("tagline", e.target.value)} /></div>
            </div>
            <div><Label>Footer credit line</Label><Input value={form.footer_credit} onChange={(e) => set("footer_credit", e.target.value)} placeholder="Developed by Melton Konchella · Founder & Developer · Nairobi, Kenya" /></div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Primary phone (used everywhere)</Label><Input value={form.phone_primary} onChange={(e) => { set("phone_primary", e.target.value); set("phone_support", e.target.value); }} placeholder="+254 792 991 222" /></div>
              <div><Label>Location</Label><Input value={form.location} onChange={(e) => set("location", e.target.value)} /></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>General enquiries email</Label><Input value={form.email_hello} onChange={(e) => set("email_hello", e.target.value)} /></div>
              <div><Label>Sales email</Label><Input value={form.email_sales} onChange={(e) => set("email_sales", e.target.value)} /></div>
              <div><Label>Support email</Label><Input value={form.email_support} onChange={(e) => set("email_support", e.target.value)} /></div>
              <div><Label>Admin / legal email</Label><Input value={form.email_admin} onChange={(e) => { set("email_admin", e.target.value); set("email_legal", e.target.value); }} placeholder="admin@smartdev.co.ke" /></div>
            </div>
            <p className="text-xs text-muted-foreground">One phone number and one admin/legal email are used across the whole site to avoid mismatched contact details.</p>
            <Button onClick={() => save.mutate(form)} disabled={save.isPending} className="gap-2"><Save className="w-4 h-4" /> Save changes</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Hero section
// ---------------------------------------------------------------------------

function HeroEditor() {
  const fallback = {
    badge: "", heading_line1: "One platform to run your", heading_highlight: "entire school",
    subheading: "", stats: [{ value: "35+", label: "Modules" }, { value: "20+", label: "User roles" }, { value: "M-Pesa", label: "Payments" }, { value: "100%", label: "Cloud-based" }],
  };
  const { data, isLoading, save } = useLandingSection("hero", fallback);
  const [form, setForm] = useState(fallback);
  useEffect(() => { if (!isLoading) setForm({ ...fallback, ...data }); }, [isLoading, data]);
  const { data: photos } = useGalleryPlacement("hero");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Hero text</CardTitle><CardDescription>The big headline visitors see first. Make "SMART DEV" and the value proposition clear and visible.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
            <>
              <div><Label>Badge text</Label><Input value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} /></div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div><Label>Heading (first line)</Label><Input value={form.heading_line1} onChange={(e) => setForm({ ...form, heading_line1: e.target.value })} /></div>
                <div><Label>Heading (highlighted word/phrase)</Label><Input value={form.heading_highlight} onChange={(e) => setForm({ ...form, heading_highlight: e.target.value })} /></div>
              </div>
              <div><Label>Subheading</Label><Textarea value={form.subheading} onChange={(e) => setForm({ ...form, subheading: e.target.value })} /></div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {form.stats.map((s: any, i: number) => (
                  <div key={i} className="space-y-1 rounded-lg border p-2">
                    <Input value={s.value} onChange={(e) => { const next = [...form.stats]; next[i] = { ...s, value: e.target.value }; setForm({ ...form, stats: next }); }} placeholder="Value" className="text-center font-semibold" />
                    <Input value={s.label} onChange={(e) => { const next = [...form.stats]; next[i] = { ...s, label: e.target.value }; setForm({ ...form, stats: next }); }} placeholder="Label" className="text-center text-xs" />
                  </div>
                ))}
              </div>
              <Button onClick={() => save.mutate(form)} disabled={save.isPending} className="gap-2"><Save className="w-4 h-4" /> Save changes</Button>
            </>
          )}
        </CardContent>
      </Card>
      <GalleryPlacementEditor placement="hero" title="Hero background photos" description="Rotating background images on the homepage. Use real Kenyan school photos." folder="hero" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Founder section (replaces the old generic team-card placeholders)
// ---------------------------------------------------------------------------

function FounderEditor() {
  const fallback = { name: "Melton Konchella", role: "Founder & Developer", photo_url: null as string | null, bio: "" };
  const { data, isLoading, save } = useLandingSection("founder", fallback);
  const [form, setForm] = useState(fallback);
  useEffect(() => { if (!isLoading) setForm({ ...fallback, ...data }); }, [isLoading, data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> Founder</CardTitle>
        <CardDescription>Shown on the Our Story page. Leave the photo empty to show a placeholder icon instead of a real photo until you're ready to add one.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Role / title</Label><Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></div>
            </div>
            <ImagePicker label="Photo (optional)" value={form.photo_url} onChange={(url) => setForm({ ...form, photo_url: url })} folder="founder" />
            <div><Label>Bio</Label><Textarea rows={4} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>
            <Button onClick={() => save.mutate(form)} disabled={save.isPending} className="gap-2"><Save className="w-4 h-4" /> Save changes</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Our Story page intro / mission / vision
// ---------------------------------------------------------------------------

function StoryEditor() {
  const fallback = {
    badge: "Our Story", heading: "", subheading: "", hero_image_url: null as string | null,
    mission_title: "Our Mission", mission_body: "", vision_title: "Our Vision", vision_body: "",
  };
  const { data, isLoading, save } = useLandingSection("story_intro", fallback);
  const [form, setForm] = useState(fallback);
  useEffect(() => { if (!isLoading) setForm({ ...fallback, ...data }); }, [isLoading, data]);

  return (
    <Card>
      <CardHeader><CardTitle>Our Story page</CardTitle><CardDescription>Intro heading, hero image, mission and vision text.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Badge text</Label><Input value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} /></div>
              <div><Label>Heading</Label><Input value={form.heading} onChange={(e) => setForm({ ...form, heading: e.target.value })} /></div>
            </div>
            <div><Label>Subheading</Label><Textarea value={form.subheading} onChange={(e) => setForm({ ...form, subheading: e.target.value })} /></div>
            <ImagePicker label="Story hero image" value={form.hero_image_url} onChange={(url) => setForm({ ...form, hero_image_url: url })} folder="story" />
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mission title</Label><Input value={form.mission_title} onChange={(e) => setForm({ ...form, mission_title: e.target.value })} />
                <Label>Mission body</Label><Textarea rows={4} value={form.mission_body} onChange={(e) => setForm({ ...form, mission_body: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Vision title</Label><Input value={form.vision_title} onChange={(e) => setForm({ ...form, vision_title: e.target.value })} />
                <Label>Vision body</Label><Textarea rows={4} value={form.vision_body} onChange={(e) => setForm({ ...form, vision_body: e.target.value })} />
              </div>
            </div>
            <Button onClick={() => save.mutate(form)} disabled={save.isPending} className="gap-2"><Save className="w-4 h-4" /> Save changes</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Story timeline / milestones (add, edit, remove, reorder)
// ---------------------------------------------------------------------------

function MilestonesEditor() {
  const fallback = { items: [] as { year: string; title: string; desc: string }[] };
  const { data, isLoading, save } = useLandingSection("story_milestones", fallback);
  const [items, setItems] = useState<{ year: string; title: string; desc: string }[]>([]);
  useEffect(() => { if (!isLoading) setItems(data.items ?? []); }, [isLoading, data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5" /> Timeline / milestones</CardTitle>
        <CardDescription>The "How we got here" timeline on the Our Story page. Add, edit, remove or reorder entries.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
          <>
            {items.map((m, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                  <Input className="w-24" value={m.year} placeholder="Year" onChange={(e) => { const n = [...items]; n[i] = { ...m, year: e.target.value }; setItems(n); }} />
                  <Input value={m.title} placeholder="Title" onChange={(e) => { const n = [...items]; n[i] = { ...m, title: e.target.value }; setItems(n); }} />
                  <Button variant="ghost" size="icon" onClick={() => setItems(items.filter((_, idx) => idx !== i))}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
                <Textarea value={m.desc} placeholder="Description" onChange={(e) => { const n = [...items]; n[i] = { ...m, desc: e.target.value }; setItems(n); }} />
              </div>
            ))}
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setItems([...items, { year: "", title: "", desc: "" }])}><Plus className="w-3.5 h-3.5" /> Add milestone</Button>
            <div><Button onClick={() => save.mutate({ items })} disabled={save.isPending} className="gap-2"><Save className="w-4 h-4" /> Save changes</Button></div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Photo gallery (generic, used for "gallery", "story_hero", "contact" too)
// ---------------------------------------------------------------------------

function useGalleryPlacement(placement: string) {
  return useQuery({
    queryKey: ["landing-gallery", placement],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("landing_gallery")
        .select("*")
        .eq("placement", placement)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

function GalleryPlacementEditor({ placement, title, description, folder }: { placement: string; title: string; description: string; folder: string }) {
  const qc = useQueryClient();
  const { data: photos, isLoading } = useGalleryPlacement(placement);

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await (supabase as any).from("landing_gallery").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["landing-gallery", placement] }),
    onError: (e: any) => toast.error(e.message),
  });

  const addSlot = useMutation({
    mutationFn: async () => {
      const nextOrder = (photos?.length ?? 0) + 1;
      const { error } = await (supabase as any).from("landing_gallery").insert({ placement, sort_order: nextOrder, image_url: null, caption: "" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["landing-gallery", placement] }),
  });

  const removeSlot = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("landing_gallery").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["landing-gallery", placement] }),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><ImageIcon className="w-5 h-5" /> {title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(photos ?? []).map((p: any) => (
                <div key={p.id} className="rounded-lg border p-3 space-y-2">
                  <ImagePicker label="" value={p.image_url} onChange={(url) => update.mutate({ id: p.id, patch: { image_url: url } })} folder={folder} />
                  <Input
                    defaultValue={p.caption ?? ""}
                    placeholder="Caption (optional)"
                    onBlur={(e) => { if (e.target.value !== (p.caption ?? "")) update.mutate({ id: p.id, patch: { caption: e.target.value } }); }}
                  />
                  <Button variant="ghost" size="sm" className="gap-2 text-destructive" onClick={() => removeSlot.mutate(p.id)}><Trash2 className="w-3.5 h-3.5" /> Remove slot</Button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => addSlot.mutate()}><Plus className="w-3.5 h-3.5" /> Add photo slot</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function GalleryEditor() {
  return (
    <div className="space-y-4">
      <GalleryPlacementEditor placement="gallery" title="Homepage photo gallery" description="The 'Built for schools like yours' section. Use real Kenyan school photos." folder="gallery" />
      <GalleryPlacementEditor placement="story_hero" title="Our Story hero image" description="Large banner image at the top of the Our Story page." folder="story" />
      <GalleryPlacementEditor placement="contact" title="Contact page image" description="Banner image at the bottom of the Contact page." folder="contact" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pricing: base plans (subscription_plans) + per-module add-on pricing
// ---------------------------------------------------------------------------

function PricingEditor() {
  const qc = useQueryClient();

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["all-plans-website"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subscription_plans").select("*").order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: modules, isLoading: modulesLoading } = useQuery({
    queryKey: ["module-addon-pricing"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("module_addon_pricing").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Which modules are free-included on which plan -- the single source of
  // truth shared with the public pricing page (public-plans / public-module-pricing
  // queries in routes/index.tsx). Keyed as "planId:featureKey".
  const { data: inclusionRows, isLoading: inclusionLoading } = useQuery({
    queryKey: ["plan-module-inclusion"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("plan_module_inclusion").select("*");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const inclusionMap = new Map(
    (inclusionRows ?? []).map((r: any) => [r.plan_id + ":" + r.feature_key, Boolean(r.included)])
  );
  const isPlanModuleIncluded = (planId: string, featureKey: string) =>
    inclusionMap.get(planId + ":" + featureKey) ?? false;

  const updatePlan = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await supabase.from("subscription_plans").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Plan updated"); qc.invalidateQueries({ queryKey: ["all-plans-website"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateModule = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await (supabase as any).from("module_addon_pricing").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["module-addon-pricing"] }),
    onError: (e: any) => toast.error(e.message),
  });

  // Toggling a plan/module cell upserts the join row that both this editor
  // and the public pricing page read — the two can no longer drift apart.
  const setPlanModuleIncluded = useMutation({
    mutationFn: async (vars: { planId: string; featureKey: string; included: boolean }) => {
      const { error } = await (supabase as any)
        .from("plan_module_inclusion")
        .upsert(
          { plan_id: vars.planId, feature_key: vars.featureKey, included: vars.included },
          { onConflict: "plan_id,feature_key" }
        );
      if (error) throw error;
    },
    onMutate: async (vars: { planId: string; featureKey: string; included: boolean }) => {
      await qc.cancelQueries({ queryKey: ["plan-module-inclusion"] });
      const previous = qc.getQueryData<any[]>(["plan-module-inclusion"]);
      qc.setQueryData<any[]>(["plan-module-inclusion"], (old = []) => {
        const exists = old.some((r) => r.plan_id === vars.planId && r.feature_key === vars.featureKey);
        if (exists) {
          return old.map((r) =>
            r.plan_id === vars.planId && r.feature_key === vars.featureKey ? { ...r, included: vars.included } : r
          );
        }
        return [...old, { plan_id: vars.planId, feature_key: vars.featureKey, included: vars.included }];
      });
      return { previous };
    },
    onError: (e: any, _vars, ctx) => {
      toast.error(e.message);
      if (ctx?.previous) qc.setQueryData(["plan-module-inclusion"], ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["plan-module-inclusion"] }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Base plans</CardTitle>
          <CardDescription>
            The base monthly fee for each plan. Modules already marked "included" below are free within that plan — every other module is billed as an add-on at the per-module price you set.
            Set prices that cover your actual hosting, SMS and M-Pesa costs before profit — review your real costs before publishing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {plansLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
            <div className="grid md:grid-cols-3 gap-4">
              {(plans ?? []).map((p: any) => (
                <div key={p.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Input className="font-semibold" defaultValue={p.name} onBlur={(e) => e.target.value !== p.name && updatePlan.mutate({ id: p.id, patch: { name: e.target.value } })} />
                    <Switch checked={p.is_active} onCheckedChange={(v) => updatePlan.mutate({ id: p.id, patch: { is_active: v } })} />
                  </div>
                  <div>
                    <Label className="text-xs">Base monthly fee (KES)</Label>
                    <Input type="number" defaultValue={p.monthly_fee} onBlur={(e) => Number(e.target.value) !== Number(p.monthly_fee) && updatePlan.mutate({ id: p.id, patch: { monthly_fee: Number(e.target.value) || 0 } })} />
                  </div>
                  <div>
                    <Label className="text-xs">Student limit (blank = unlimited)</Label>
                    <Input type="number" defaultValue={p.student_limit ?? ""} placeholder="Unlimited" onBlur={(e) => updatePlan.mutate({ id: p.id, patch: { student_limit: e.target.value ? Number(e.target.value) : null } })} />
                  </div>
                  <div>
                    <Label className="text-xs">Badge (e.g. "Most Popular")</Label>
                    <Input defaultValue={p.badge ?? ""} onBlur={(e) => e.target.value !== (p.badge ?? "") && updatePlan.mutate({ id: p.id, patch: { badge: e.target.value || null } })} />
                  </div>
                  <div>
                    <Label className="text-xs">Description</Label>
                    <Textarea defaultValue={p.description ?? ""} onBlur={(e) => e.target.value !== (p.description ?? "") && updatePlan.mutate({ id: p.id, patch: { description: e.target.value } })} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Layers className="w-5 h-5" /> Module add-on pricing</CardTitle>
          <CardDescription>
            Tick which plans already include each module for free, and set the monthly add-on price charged when a school on a plan that doesn't include it wants it anyway.
            This table has one column per plan above, so it always matches exactly what shows on the public pricing page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {modulesLoading || plansLoading || inclusionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-card">Module</TableHead>
                    {(plans ?? []).map((p: any) => (
                      <TableHead key={p.id} className="text-center whitespace-nowrap">
                        {p.name}
                        {!p.is_active && <span className="block text-[10px] font-normal text-muted-foreground">(inactive)</span>}
                      </TableHead>
                    ))}
                    <TableHead>Add-on price /mo (KES)</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(modules ?? []).map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium sticky left-0 bg-card">
                        {m.display_name}
                        <div className="text-xs text-muted-foreground">{m.category}</div>
                      </TableCell>
                      {(plans ?? []).map((p: any) => (
                        <TableCell key={p.id} className="text-center">
                          <Switch
                            checked={isPlanModuleIncluded(p.id, m.feature_key)}
                            onCheckedChange={(v) => setPlanModuleIncluded.mutate({ planId: p.id, featureKey: m.feature_key, included: v })}
                          />
                        </TableCell>
                      ))}
                      <TableCell>
                        <Input
                          type="number"
                          className="w-28"
                          defaultValue={m.monthly_price}
                          onBlur={(e) => Number(e.target.value) !== Number(m.monthly_price) && updateModule.mutate({ id: m.id, patch: { monthly_price: Number(e.target.value) || 0 } })}
                        />
                      </TableCell>
                      <TableCell><Switch checked={m.is_active} onCheckedChange={(v) => updateModule.mutate({ id: m.id, patch: { is_active: v } })} /></TableCell>
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
