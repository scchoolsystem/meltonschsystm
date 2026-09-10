/**
 * _app.academics.learning-content.tsx — SmartDev Learning: Content
 * (Lessons / Notes / Videos / Resources)
 *
 * New file — spec §2 / §34 nav ("Lessons, Notes, Videos, Resources") had no
 * screen at all yet; only the question bank and quiz system existed.
 * Manages the `learning_content` table exactly as it shipped in the
 * corrected-architecture migration:
 *
 *   learning_content(content_scope, school_id, owner_user_id,
 *     curriculum_grade_id, curriculum_subject_id, strand_id, substrand_id,
 *     content_type, title, body, media_url, status, created_by, ...)
 *
 * Three content_scope values are reachable from the UI:
 *   - "school"   — this school's teaching staff/admin author it for their
 *                  own students. Default tab, what most users will use.
 *   - "personal" — a private note/resource owned by the current user
 *                  (owner_user_id = auth.uid()), e.g. a teacher's own
 *                  scratch notes. Visible only to them.
 *   - "universal" — SmartDev-wide library, platform-admin only (mirrors
 *                  the gating already used in learning-curriculum.tsx).
 * "teacher" scope exists in the DB CHECK constraint too (school_id +
 * created_by required) but has no distinct UI here yet — content authored
 * by a teaching-staff member under "school" scope already satisfies that
 * shape server-side; a per-teacher-only visibility toggle is a follow-up,
 * not something this pass invents RLS for.
 *
 * Curriculum tagging (grade/subject/strand/substrand) is optional and uses
 * the same substrand-only picker as _app.academics.learning-question-bank
 * for consistency — pick a sub-strand and the grade/subject/strand chain
 * comes along with it via the FK, same nested-select pattern.
 */

import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus, Loader2, Trash2, BookOpen, FileText, Video, Link2,
  Globe, School, Lock, ShieldCheck, Eye, EyeOff,
} from "lucide-react";

export const Route = createFileRoute("/_app/academics/learning-content")({
  component: () => (
    <FeatureGate feature="academics_subjects">
      <Page />
    </FeatureGate>
  ),
});

type ContentScope = "universal" | "school" | "personal";
type ContentType = "lesson" | "note" | "video" | "resource";
type Status = "draft" | "published" | "archived";

type Substrand = {
  id: string;
  name: string;
  curriculum_strands: { name: string; curriculum_subjects: { name: string } | null } | null;
};

type ContentRow = {
  id: string;
  content_scope: ContentScope;
  content_type: ContentType;
  title: string;
  body: string | null;
  media_url: string | null;
  status: Status;
  substrand_id: string | null;
  created_at: string;
};

const TYPE_ICON: Record<ContentType, JSX.Element> = {
  lesson: <BookOpen className="w-3.5 h-3.5" />,
  note: <FileText className="w-3.5 h-3.5" />,
  video: <Video className="w-3.5 h-3.5" />,
  resource: <Link2 className="w-3.5 h-3.5" />,
};

const STATUS_COLOR: Record<Status, string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  published: "bg-emerald-100 text-emerald-700 border-emerald-200",
  archived: "bg-amber-100 text-amber-700 border-amber-200",
};

const emptyForm = {
  content_type: "lesson" as ContentType,
  title: "",
  body: "",
  media_url: "",
  substrand_id: "none",
};

function Page() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const isPlatformAdmin = roles.includes("platform_owner") || roles.includes("platform_support");

  const [tab, setTab] = useState<ContentScope>("school");

  const { data: schoolId } = useQuery({
    queryKey: ["current-school-id"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("current_user_school");
      if (error) throw error;
      return data as string | null;
    },
  });

  // ── substrands for optional curriculum tagging (same shape as the
  // question bank's picker) ─────────────────────────────────────────────
  const { data: substrands = [] } = useQuery({
    queryKey: ["learning-substrands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("curriculum_substrands")
        .select("id, name, curriculum_strands(name, curriculum_subjects(name))")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Substrand[];
    },
  });
  const substrandLabel = (s: Substrand) =>
    `${s.curriculum_strands?.curriculum_subjects?.name ?? "?"} · ${s.curriculum_strands?.name ?? "?"} · ${s.name}`;

  const content = useQuery({
    queryKey: ["learning-content", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_content")
        .select("id, content_scope, content_type, title, body, media_url, status, substrand_id, created_at")
        .eq("content_scope", tab)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContentRow[];
    },
  });

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const resetForm = () => setForm(emptyForm);

  const addMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        content_scope: tab,
        content_type: form.content_type,
        title: form.title.trim(),
        body: form.body.trim() || null,
        media_url: form.media_url.trim() || null,
        substrand_id: form.substrand_id === "none" ? null : form.substrand_id,
        status: "draft",
      };
      if (tab === "school") {
        if (!schoolId) throw new Error("No school context found");
        payload.school_id = schoolId;
      } else if (tab === "personal") {
        const { data: auth } = await supabase.auth.getUser();
        payload.owner_user_id = auth.user?.id;
      }
      // universal: school_id/owner_user_id stay null per the scope-shape
      // CHECK constraint; RLS rejects the insert outright for non-platform-
      // admins, which is the real enforcement here.
      const { error } = await supabase.from("learning_content").insert([payload]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Added as draft");
      setAddOpen(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["learning-content", tab] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to add content"),
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase.from("learning_content").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["learning-content", tab] }),
    onError: (e: any) => toast.error(e.message || "Failed to update status"),
  });

  const deleteRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("learning_content").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["learning-content", tab] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to delete"),
  });

  // Universal writes require platform admin; school/personal writes are
  // offered to everyone and left to RLS (is_admin/is_teaching_staff for
  // school, owner match for personal) to actually gate.
  const canWriteThisTab = tab !== "universal" || isPlatformAdmin;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <BookOpen className="w-5 h-5" /> SmartDev Learning — Content
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Lessons, notes, videos and resources — revision material, separate from official ERP academics.
          </p>
        </div>
        {canWriteThisTab && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add content
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ContentScope)}>
        <TabsList>
          <TabsTrigger value="school" className="gap-1.5"><School className="w-3.5 h-3.5" /> School</TabsTrigger>
          <TabsTrigger value="personal" className="gap-1.5"><Lock className="w-3.5 h-3.5" /> Personal</TabsTrigger>
          <TabsTrigger value="universal" className="gap-1.5"><Globe className="w-3.5 h-3.5" /> Universal</TabsTrigger>
        </TabsList>

        {(["school", "personal", "universal"] as ContentScope[]).map((scope) => (
          <TabsContent key={scope} value={scope} className="mt-4 space-y-3">
            {scope === "universal" && !isPlatformAdmin && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Read-only — only platform admins can add or edit universal content.
              </p>
            )}
            {content.isLoading && tab === scope ? (
              <div className="grid place-items-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : (content.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nothing here yet.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {(content.data ?? []).map((c) => (
                  <Card key={c.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                          {TYPE_ICON[c.content_type]} {c.title}
                        </CardTitle>
                        <Badge className={STATUS_COLOR[c.status]} variant="outline">{c.status}</Badge>
                      </div>
                      {c.substrand_id && (
                        <CardDescription className="text-xs">
                          {substrandLabel(substrands.find((s) => s.id === c.substrand_id) ?? { id: "", name: "", curriculum_strands: null })}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {c.body && <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">{c.body}</p>}
                      {c.media_url && (
                        <a href={c.media_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline flex items-center gap-1">
                          <Link2 className="w-3 h-3" /> Open media
                        </a>
                      )}
                      {canWriteThisTab && (
                        <div className="flex items-center gap-2 pt-1">
                          {c.status !== "published" ? (
                            <Button size="sm" variant="outline" onClick={() => toggleStatus.mutate({ id: c.id, status: "published" })}>
                              <Eye className="w-3.5 h-3.5 mr-1" /> Publish
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => toggleStatus.mutate({ id: c.id, status: "draft" })}>
                              <EyeOff className="w-3.5 h-3.5 mr-1" /> Unpublish
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => deleteRow.mutate(c.id)}>
                            <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* ── Add dialog ───────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Add {tab === "universal" ? "universal" : tab === "personal" ? "personal" : "school"} content
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Type</Label>
              <Select value={form.content_type} onValueChange={(v) => setForm((f) => ({ ...f, content_type: v as ContentType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lesson">Lesson</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="resource">Resource</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Introduction to Fractions" />
            </div>
            <div>
              <Label>Body (optional)</Label>
              <Textarea rows={4} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="Lesson text or notes" />
            </div>
            {(form.content_type === "video" || form.content_type === "resource") && (
              <div>
                <Label>Media / link URL</Label>
                <Input value={form.media_url} onChange={(e) => setForm((f) => ({ ...f, media_url: e.target.value }))} placeholder="https://..." />
              </div>
            )}
            <div>
              <Label>Sub-strand (optional)</Label>
              <Select value={form.substrand_id} onValueChange={(v) => setForm((f) => ({ ...f, substrand_id: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No topic</SelectItem>
                  {substrands.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{substrandLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {substrands.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  No sub-strands yet — add some in the Curriculum Builder to enable tagging.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={!form.title.trim() || addMutation.isPending}>
              {addMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Save as draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
