import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Megaphone, Users, Crown, Plus, Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { formatDistanceToNow } from "date-fns";
import { getDepartments, getDepartmentMembers, getDepartmentCommunications } from "@/lib/departments.functions";

export const Route = createFileRoute("/_app/department")({ component: Page });

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [isCommOpen, setIsCommOpen] = useState(false);
  const [commTitle, setCommTitle] = useState("");
  const [commContent, setCommContent] = useState("");

  const { data: departments = [], isLoading: isDeptsLoading } = useQuery({
    queryKey: ["user-departments"],
    queryFn: getDepartments,
  });

  const activeDeptId = selectedDeptId || departments[0]?.id;

  const { data: members = [], isLoading: isMembersLoading } = useQuery({
    queryKey: ["dept-members", activeDeptId],
    queryFn: () => getDepartmentMembers(activeDeptId!),
    enabled: !!activeDeptId,
  });

  const { data: comms = [], isLoading: isCommsLoading } = useQuery({
    queryKey: ["dept-comms", activeDeptId],
    queryFn: () => getDepartmentCommunications(activeDeptId!),
    enabled: !!activeDeptId,
  });

  const postCommMutation = useMutation({
    mutationFn: async () => {
      // Look up the staff row linked to this auth user
      const { data: staffData } = await supabase
        .from("staff")
        .select("id, school_id")
        .eq("user_id", user?.id)
        .maybeSingle();

      // If no staff row exists (e.g. platform admin without a staff record),
      // give a clear, actionable error instead of a generic one.
      if (!staffData?.id) {
        throw new Error(
          "Your account is not linked to a staff record. Ask the school admin to link your user account to a staff profile before posting announcements."
        );
      }

      const { error } = await supabase.from("department_communications").insert([
        {
          department_id: activeDeptId,
          sender_id: staffData.id,
          school_id: staffData.school_id, // required for tenant-scoped RLS
          title: commTitle,
          content: commContent,
        },
      ]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Announcement posted successfully");
      setIsCommOpen(false);
      setCommTitle("");
      setCommContent("");
      queryClient.invalidateQueries({ queryKey: ["dept-comms", activeDeptId] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to post announcement");
    },
  });

  if (isDeptsLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Department Workspace</h1>
          <p className="text-muted-foreground">Collaborate, read updates, and browse resources.</p>
        </div>
        {departments.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Switch Department:</span>
            <select
              value={activeDeptId || ""}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="announcements" className="gap-1.5">
            <Megaphone className="h-3.5 w-3.5" /> Announcements
          </TabsTrigger>
          <TabsTrigger value="directory" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Directory
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-lg">Recent Announcements</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {isCommsLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : comms.length > 0 ? (
                  comms.slice(0, 3).map((c) => (
                    <div key={c.id} className="border-b pb-3 last:border-0 last:pb-0">
                      <h4 className="font-semibold text-sm">{c.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.content}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground italic">No recent announcements.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">Sub-departments</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {departments.find((d) => d.id === activeDeptId)?.sub_departments?.map((sub: any) => (
                    <Badge key={sub.id} variant="secondary" className="px-3 py-1 text-sm">
                      <Building2 className="h-3.5 w-3.5 mr-1" /> {sub.name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="announcements" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setIsCommOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Create Announcement
            </Button>
          </div>

          {isCommsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : comms.length > 0 ? (
            <div className="space-y-4">
              {comms.map((c) => (
                <Card key={c.id}>
                  <CardHeader>
                    <div>
                      <CardTitle className="text-xl">{c.title}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        Posted by {c.staff ? `${c.staff.first_name} ${c.staff.last_name}` : "System"}{" "}
                        · {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{c.content}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border rounded-lg border-dashed">
              <Megaphone className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No announcements have been made yet.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="directory">
          {isMembersLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : members.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {members.map((m) => (
                <Card key={m.id} className="flex items-center p-4 gap-4">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                    {m.staff?.photo_url ? (
                      <img src={m.staff.photo_url} alt="Profile" className="h-full w-full object-cover" />
                    ) : (
                      <Users className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="space-y-1 flex-1 min-w-0">
                    <h4 className="font-semibold text-sm truncate">{m.staff?.first_name} {m.staff?.last_name}</h4>
                    <p className="text-xs text-muted-foreground truncate">{m.staff?.position_title || "Staff Member"}</p>
                    <Badge variant={m.role === "head" ? "default" : "outline"} className="text-[10px] capitalize">
                      {m.role === "head" && <Crown className="h-2.5 w-2.5 mr-1" />} {m.role}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border rounded-lg border-dashed">
              <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No members listed in this department.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={isCommOpen} onOpenChange={setIsCommOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Post Announcement</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Announcement Title</Label>
              <Input
                id="title"
                value={commTitle}
                onChange={(e) => setCommTitle(e.target.value)}
                placeholder="e.g. End of term grading deadline"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={commContent}
                onChange={(e) => setCommContent(e.target.value)}
                placeholder="Write details here..."
                className="h-32"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCommOpen(false)}>Cancel</Button>
            <Button
              onClick={() => postCommMutation.mutate()}
              disabled={postCommMutation.isPending || !commTitle || !commContent}
            >
              {postCommMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
