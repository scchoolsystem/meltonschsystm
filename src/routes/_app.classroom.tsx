import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { joinClassByCode } from "@/lib/classroom.functions";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Plus, KeyRound, Megaphone, BookOpen, FileText, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

async function uploadClassroomFile(file: File, schoolId: string): Promise<string> {
  const ext = file.name.split(".").pop();
  const path = `${schoolId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from("classroom-attachments").upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("classroom-attachments").getPublicUrl(path);
  return data.publicUrl;
}


export const Route = createFileRoute("/_app/classroom")({ component: ClassroomPage });

const KIND_META: Record<string, { icon: any; label: string; color: string }> = {
  announcement: { icon: Megaphone, label: "Announcement", color: "bg-blue-500/10 text-blue-700" },
  material: { icon: BookOpen, label: "Material", color: "bg-emerald-500/10 text-emerald-700" },
  assignment: { icon: FileText, label: "Assignment", color: "bg-amber-500/10 text-amber-700" },
};

function ClassroomPage() {
  const { roles, isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const canPost = isAdmin || roles.some((r) =>
    ["teacher", "class_teacher", "subject_teacher", "hod", "academic_master"].includes(r as string),
  );
  const isStudent = roles.includes("student" as any);

  // Classes the user can see (RLS filters automatically for tenant)
  const { data: classes = [], isLoading: classesLoading } = useQuery({
    queryKey: ["classroom-classes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, level, stream, join_code, class_teacher_id")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const current = activeClassId ? classes.find((c: any) => c.id === activeClassId) : classes[0];
  const selectedId = current?.id;

  const { data: posts = [], isLoading: postsLoading } = useQuery({
    queryKey: ["classroom-posts", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classroom_posts")
        .select("*")
        .eq("class_id", selectedId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Classroom</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Announcements, materials, and assignments — organised by class.
          </p>
        </div>
        <div className="flex gap-2">
          {isStudent && <JoinClassDialog onJoined={() => qc.invalidateQueries({ queryKey: ["classroom-classes"] })} />}
          {canPost && selectedId && <NewPostDialog classId={selectedId} onCreated={() => qc.invalidateQueries({ queryKey: ["classroom-posts", selectedId] })} />}
        </div>
      </div>

      {classesLoading ? (
        <div className="h-40 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : classes.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          No classes yet. {isStudent ? "Use a join code from your teacher to get started." : "Ask an admin to create classes first."}
        </CardContent></Card>
      ) : (
        <Tabs value={selectedId} onValueChange={setActiveClassId}>
          <TabsList className="flex-wrap h-auto">
            {classes.map((c: any) => (
              <TabsTrigger key={c.id} value={c.id}>{c.name}</TabsTrigger>
            ))}
          </TabsList>

          {classes.map((c: any) => (
            <TabsContent key={c.id} value={c.id} className="space-y-4 mt-4">
              {canPost && <JoinCodeCard klass={c} />}

              {postsLoading ? (
                <div className="h-40 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : posts.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">
                  No posts in this class yet.{canPost && " Click \"New post\" above to share something."}
                </CardContent></Card>
              ) : (
                posts.map((p: any) => <PostCard key={p.id} post={p} canManage={canPost} onChanged={() => qc.invalidateQueries({ queryKey: ["classroom-posts", selectedId] })} />)
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

function JoinCodeCard({ klass }: { klass: any }) {
  const [copied, setCopied] = useState(false);
  if (!klass?.join_code) return null;
  return (
    <Card className="bg-muted/30">
      <CardContent className="py-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Class join code</div>
          <div className="font-mono text-2xl font-bold tracking-widest">{klass.join_code}</div>
        </div>
        <Button variant="outline" size="sm" onClick={() => {
          navigator.clipboard.writeText(klass.join_code);
          setCopied(true);
          toast.success("Join code copied");
          setTimeout(() => setCopied(false), 2000);
        }}>
          {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </CardContent>
    </Card>
  );
}

function PostCard({ post, canManage, onChanged }: { post: any; canManage: boolean; onChanged: () => void }) {
  const meta = KIND_META[post.kind] || KIND_META.announcement;
  const Icon = meta.icon;
  const [subOpen, setSubOpen] = useState(false);
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("classroom_posts").delete().eq("id", post.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Post deleted"); onChanged(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-8 h-8 rounded-md grid place-items-center ${meta.color}`}><Icon className="w-4 h-4" /></div>
            <div className="min-w-0">
              <CardTitle className="text-base truncate">{post.title}</CardTitle>
              <div className="text-xs text-muted-foreground">
                <Badge variant="secondary" className="mr-2">{meta.label}</Badge>
                {format(new Date(post.created_at), "PPp")}
                {post.due_date && <span className="ml-2">• Due {format(new Date(post.due_date), "PP")}</span>}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {post.kind === "assignment" && (
              <Button variant="outline" size="sm" onClick={() => setSubOpen(true)}>
                {canManage ? "Submissions" : "Submit"}
              </Button>
            )}
            {canManage && (
              <Button variant="ghost" size="sm" onClick={() => del.mutate()} disabled={del.isPending}>Delete</Button>
            )}
          </div>
        </div>
      </CardHeader>
      {(post.body || post.attachment_url) && (
        <CardContent className="pt-0">
          {post.body && <p className="text-sm whitespace-pre-wrap">{post.body}</p>}
          {post.attachment_url && (
            <a href={post.attachment_url} target="_blank" rel="noreferrer" className="text-sm text-primary underline mt-2 inline-block">
              View attachment
            </a>
          )}
        </CardContent>
      )}
      {post.kind === "assignment" && (
        <SubmissionsDialog open={subOpen} onOpenChange={setSubOpen} post={post} canManage={canManage} />
      )}
    </Card>
  );
}

function SubmissionsDialog({ open, onOpenChange, post, canManage }: { open: boolean; onOpenChange: (v: boolean) => void; post: any; canManage: boolean }) {
  const qc = useQueryClient();
  const [content, setContent] = useState("");
  const [attachment, setAttachment] = useState("");
  const [grades, setGrades] = useState<Record<string, { grade: string; feedback: string }>>({});

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["submissions", post.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classroom_submissions")
        .select("id, student_id, content, attachment_url, status, grade, feedback, submitted_at, graded_at, students!inner(first_name, last_name, unique_id)")
        .eq("post_id", post.id)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      // resolve current user's linked student
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data: link } = await supabase.from("student_user_links").select("student_id").eq("user_id", user.id).maybeSingle();
      if (!link) throw new Error("No student record linked to your account");
      const { error } = await supabase.from("classroom_submissions").upsert({
        post_id: post.id,
        student_id: link.student_id,
        content: content.trim() || null,
        attachment_url: attachment.trim() || null,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      } as any, { onConflict: "post_id,student_id" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Submitted"); setContent(""); setAttachment(""); qc.invalidateQueries({ queryKey: ["submissions", post.id] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const grade = useMutation({
    mutationFn: async ({ id, grade, feedback }: { id: string; grade: string; feedback: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("classroom_submissions").update({
        grade: grade ? Number(grade) : null,
        feedback: feedback || null,
        status: "graded",
        graded_by: user?.id ?? null,
        graded_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["submissions", post.id] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const myExisting = !canManage ? (subs as any[]).find((s) => s) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{post.title} — {canManage ? "Submissions" : "Submit your work"}</DialogTitle></DialogHeader>
        {!canManage && post.due_date && (
          <p className="text-sm text-muted-foreground px-6 -mt-2">Due: {format(new Date(post.due_date), "dd MMM yyyy")}</p>
        )}
        {!canManage && (
          <div className="space-y-3">
            {myExisting && (
              <Card className="bg-muted/30">
                <CardContent className="py-3 text-sm">
                  <div className="font-medium">Your submission</div>
                  <div className="text-xs text-muted-foreground mb-1">Status: {myExisting.status}{myExisting.grade != null && ` • Grade: ${myExisting.grade}`}</div>
                  {myExisting.content && <p className="whitespace-pre-wrap">{myExisting.content}</p>}
                  {myExisting.feedback && <p className="mt-2 text-xs italic">Feedback: {myExisting.feedback}</p>}
                </CardContent>
              </Card>
            )}
            <Textarea placeholder="Your answer / notes" rows={5} value={content} onChange={(e) => setContent(e.target.value)} />
            <Input placeholder="Attachment URL (optional)" value={attachment} onChange={(e) => setAttachment(e.target.value)} />
            <DialogFooter>
              <Button onClick={() => submit.mutate()} disabled={submit.isPending || (!content.trim() && !attachment.trim())}>
                {submit.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{myExisting ? "Resubmit" : "Submit"}
              </Button>
            </DialogFooter>
          </div>
        )}
        {canManage && (
          <div className="space-y-3">
            {isLoading ? (
              <div className="h-24 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : subs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No submissions yet.</p>
            ) : (
              (subs as any[]).map((s) => {
                const g = grades[s.id] ?? { grade: s.grade?.toString() ?? "", feedback: s.feedback ?? "" };
                return (
                  <Card key={s.id}>
                    <CardContent className="py-3 space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="text-sm font-medium">{s.students?.first_name} {s.students?.last_name} <span className="text-xs text-muted-foreground">({s.students?.unique_id})</span></div>
                        <Badge variant={s.status === "graded" ? "default" : "secondary"}>{s.status}</Badge>
                      </div>
                      {s.content && <p className="text-sm whitespace-pre-wrap">{s.content}</p>}
                      {s.attachment_url && <a className="text-xs text-primary underline" href={s.attachment_url} target="_blank" rel="noreferrer">Attachment</a>}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                        <Input placeholder="Grade" inputMode="numeric" value={g.grade} onChange={(e) => setGrades({ ...grades, [s.id]: { ...g, grade: e.target.value } })} />
                        <Input className="sm:col-span-2" placeholder="Feedback" value={g.feedback} onChange={(e) => setGrades({ ...grades, [s.id]: { ...g, feedback: e.target.value } })} />
                      </div>
                      <div className="flex justify-end">
                        <Button size="sm" onClick={() => grade.mutate({ id: s.id, grade: g.grade, feedback: g.feedback })} disabled={grade.isPending}>Save grade</Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewPostDialog({ classId, onCreated }: { classId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("announcement");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [dueDate, setDueDate] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("classroom_posts").insert({
        class_id: classId,
        kind,
        title: title.trim(),
        body: body.trim() || null,
        attachment_url: attachmentUrl.trim() || null,
        due_date: kind === "assignment" && dueDate ? dueDate : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Post published");
      setOpen(false);
      setTitle(""); setBody(""); setAttachmentUrl(""); setDueDate("");
      onCreated();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />New post</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New classroom post</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="announcement">Announcement</SelectItem>
              <SelectItem value="material">Material</SelectItem>
              <SelectItem value="assignment">Assignment</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea placeholder="Details (optional)" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
          <Input placeholder="Resource link (optional)" value={attachmentUrl} onChange={(e) => setAttachmentUrl(e.target.value)} />
              <p className="text-xs text-muted-foreground">Paste a Google Drive, YouTube, or any public link.</p>
          {kind === "assignment" && (
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JoinClassDialog({ onJoined }: { onJoined: () => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const join = useServerFn(joinClassByCode);
  const m = useMutation({
    mutationFn: () => join({ data: { code } }),
    onSuccess: (r: any) => {
      toast.success(`Joined ${r.class_name}`);
      setOpen(false); setCode("");
      onJoined();
    },
    onError: (e: any) => toast.error(e.message || "Failed to join"),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><KeyRound className="w-4 h-4 mr-2" />Join class</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Join a class</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Enter the 6-character code from your teacher.</p>
        <Input
          placeholder="ABC123"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="font-mono tracking-widest text-center text-lg"
          maxLength={12}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={code.length < 4 || m.isPending} onClick={() => m.mutate()}>
            {m.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Join
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
