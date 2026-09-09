import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PlatformScopeGuard } from "@/components/security/PlatformScopeGuard";
import {
  platformListTeam,
  platformSearchUser,
  platformInviteAndGrant,
  platformRevokeRole,
  platformSetAnnouncement,
} from "@/lib/platform-admin.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, UserPlus, Trash2, Shield, ShieldCheck, Search, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/platform/team")({
  component: () => (
    <PlatformScopeGuard requirement="owner">
      <TeamPage />
    </PlatformScopeGuard>
  ),
});

function TeamPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Team & Access</h1>
        <p className="text-sm text-muted-foreground">
          Who has platform-level access, what they've done, and platform-wide announcements.
        </p>
      </div>
      <Tabs defaultValue="team">
        <TabsList>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
          <TabsTrigger value="announcement">Announcement</TabsTrigger>
        </TabsList>
        <TabsContent value="team" className="mt-4"><TeamTab /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditTab /></TabsContent>
        <TabsContent value="announcement" className="mt-4"><AnnouncementTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------

// Sections that can be granted on their own — one per platform admin page.
// Add more here as new pages get carved out (each new entry needs a
// matching "section:*" key on the right NAV row in platform.tsx, and a
// PlatformScopeGuard requirement={{ section: "..." }} on that page's route).
const PLATFORM_SECTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "operations", label: "Operations & Usage" },
  { key: "schools", label: "Schools" },
  { key: "invoices", label: "Billing / Invoices" },
  { key: "support", label: "Support tickets" },
  { key: "plans", label: "Plans & pricing" },
  { key: "website_media", label: "Website Content (Media & Stories)" },
];

function TeamTab() {
  const { roles } = useAuth();
  const isOwner = roles.includes("platform_owner" as any);
  const qc = useQueryClient();
  const listTeam = useServerFn(platformListTeam);
  const searchUser = useServerFn(platformSearchUser);
  const inviteAndGrant = useServerFn(platformInviteAndGrant);
  const revokeRole = useServerFn(platformRevokeRole);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"platform_owner" | "platform_support">("platform_support");
  const [found, setFound] = useState<{ user_id: string; email: string; full_name: string } | null | undefined>(undefined);
  const [newAccountResult, setNewAccountResult] = useState<{ email: string; temp_password: string } | null>(null);

  // Restriction picker state — only relevant when role === "platform_support"
  const [restricted, setRestricted] = useState(false);
  const [sections, setSections] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["platform-team"],
    queryFn: async () => (await listTeam({ data: undefined })).members,
  });

  const search = useMutation({
    mutationFn: async () => searchUser({ data: { email } }),
    onSuccess: (res) => {
      setFound(res as any);
      if (!res) toast.error("No account found with that email — they need to sign up first.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // One-step add: works whether or not the person already has an account.
  // Creates it on the spot if not, then grants the role either way.
  const addByEmail = useMutation({
    mutationFn: async () =>
      inviteAndGrant({
        data: {
          email,
          full_name: fullName || undefined,
          role,
          scopes: role === "platform_support" && restricted ? { sections, school_ids: [] } : undefined,
        },
      }),
    onSuccess: (res) => {
      if (res.created) {
        toast.success(`Account created and granted ${role.replace("platform_", "")} access`);
        setNewAccountResult({ email: res.email, temp_password: res.temp_password! });
      } else {
        toast.success(`Granted ${role.replace("platform_", "")} access`);
      }
      setEmail(""); setFullName(""); setFound(undefined);
      setRestricted(false); setSections([]);
      qc.invalidateQueries({ queryKey: ["platform-team"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: async (m: { user_id: string; role: string }) =>
      revokeRole({ data: { user_id: m.user_id, role: m.role as any } }),
    onSuccess: () => {
      toast.success("Access revoked");
      qc.invalidateQueries({ queryKey: ["platform-team"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleSection = (key: string) =>
    setSections((s) => (s.includes(key) ? s.filter((x) => x !== key) : [...s, key]));

  return (
    <div className="space-y-4">
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add someone</CardTitle>
            <CardDescription>Type their email and grant access directly — if they don't have an account yet, one is created for them automatically.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {newAccountResult && (
              <div className="p-3 rounded-md border border-primary/30 bg-primary/5 text-sm space-y-1">
                <p className="font-medium">New account created for {newAccountResult.email}</p>
                <p className="text-xs text-muted-foreground">
                  One-time temporary password — share it with them now, this won't be shown again:
                </p>
                <div className="flex items-center gap-2">
                  <code className="px-2 py-1 rounded bg-muted text-sm font-mono">{newAccountResult.temp_password}</code>
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => { navigator.clipboard.writeText(newAccountResult.temp_password); toast.success("Copied"); }}
                  >
                    Copy
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setNewAccountResult(null)}>Dismiss</Button>
                </div>
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              <Input
                placeholder="their.email@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFound(undefined); }}
                className="max-w-sm"
              />
              <Input
                placeholder="Full name (optional)"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="max-w-xs"
              />
              <Button
                variant="outline"
                onClick={() => search.mutate()}
                disabled={!email || search.isPending}
                title="Check whether this email already has an account"
              >
                {search.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
            {found !== undefined && (
              <p className="text-xs text-muted-foreground">
                {found
                  ? `Existing account found: ${found.full_name || found.email}. Granting access below won't create a new one.`
                  : "No existing account with that email — one will be created automatically when you grant access."}
              </p>
            )}

            <div className="space-y-3 p-3 rounded-md border bg-muted/40">
              <Select value={role} onValueChange={(v) => { setRole(v as any); setRestricted(false); }}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="platform_support">Platform support</SelectItem>
                  <SelectItem value="platform_owner">Platform owner</SelectItem>
                </SelectContent>
              </Select>

              {role === "platform_support" && (
                <div className="flex items-center gap-2">
                  <Checkbox id="restrict" checked={restricted} onCheckedChange={(v) => setRestricted(!!v)} />
                  <Label htmlFor="restrict" className="text-sm font-normal cursor-pointer">
                    Restrict this person to specific areas (default is full support access)
                  </Label>
                </div>
              )}

              {role === "platform_support" && restricted && (
                <div className="space-y-3 pl-1">
                  <div>
                    <Label className="text-xs text-muted-foreground">Pages they can access</Label>
                    <div className="flex flex-col gap-1 mt-1">
                      {PLATFORM_SECTIONS.map((s) => (
                        <div key={s.key} className="flex items-center gap-2">
                          <Checkbox
                            id={`sec-${s.key}`}
                            checked={sections.includes(s.key)}
                            onCheckedChange={() => toggleSection(s.key)}
                          />
                          <Label htmlFor={`sec-${s.key}`} className="text-sm font-normal cursor-pointer">{s.label}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  {sections.length === 0 && (
                    <p className="text-xs text-destructive">Pick at least one page, or this person will have no access at all.</p>
                  )}
                </div>
              )}

              <Button
                size="sm"
                onClick={() => addByEmail.mutate()}
                disabled={
                  !email || addByEmail.isPending ||
                  (role === "platform_support" && restricted && sections.length === 0)
                }
              >
                {addByEmail.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <UserPlus className="w-4 h-4 mr-1" />}
                Add & grant access
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Current team</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody has platform access yet — that shouldn't be possible if you're viewing this page.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Person</TableHead><TableHead>Role</TableHead><TableHead>Since</TableHead><TableHead className="text-right">Action</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {data.map((m) => (
                  <TableRow key={`${m.user_id}-${m.role}`}>
                    <TableCell>
                      <div className="font-medium">{m.full_name || m.email}</div>
                      <div className="text-xs text-muted-foreground">{m.email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.role === "platform_owner" ? "default" : "secondary"} className="inline-flex items-center gap-1">
                        {m.role === "platform_owner" ? <ShieldCheck className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                        {m.role === "platform_owner" ? "Owner" : (m.scopes?.length ? "Support (restricted)" : "Support")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(m.granted_at), "PP")}</TableCell>
                    <TableCell className="text-right">
                      {isOwner && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove {m.role === "platform_owner" ? "owner" : "support"} access?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {m.full_name || m.email} will immediately lose access to the platform admin panel. This doesn't affect any school-level account they might also have.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => revoke.mutate(m)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Remove access
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isOwner && (
            <p className="text-xs text-muted-foreground mt-3">Only platform owners can add or remove people — you have support access, so you can view but not edit this list.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AuditTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["platform-audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent activity</CardTitle>
        <CardDescription>Last 200 platform-level actions — role changes, school suspensions, announcement edits.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity logged yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>Action</TableHead><TableHead>Details</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {(data as any[]).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-sm whitespace-nowrap">{format(new Date(row.created_at), "PP p")}</TableCell>
                  <TableCell className="text-sm">{row.actor_email ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{row.action.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-md truncate" title={JSON.stringify(row.details)}>
                    {Object.entries(row.details || {}).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function AnnouncementTab() {
  const { roles } = useAuth();
  const isOwner = roles.includes("platform_owner" as any);
  const qc = useQueryClient();
  const setAnnouncement = useServerFn(platformSetAnnouncement);

  const { data: current, isLoading } = useQuery({
    queryKey: ["platform-announcement"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "announcement")
        .maybeSingle();
      if (error) throw error;
      return (data?.value as { message?: string; active?: boolean; severity?: string }) ?? {};
    },
  });

  const [message, setMessage] = useState("");
  const [active, setActive] = useState(false);
  const [severity, setSeverity] = useState<"info" | "warning" | "critical">("info");
  const [hydrated, setHydrated] = useState(false);

  if (!hydrated && current) {
    setMessage(current.message ?? "");
    setActive(current.active ?? false);
    setSeverity((current.severity as any) ?? "info");
    setHydrated(true);
  }

  const save = useMutation({
    mutationFn: async () => setAnnouncement({ data: { message, active, severity } }),
    onSuccess: () => {
      toast.success("Announcement saved");
      qc.invalidateQueries({ queryKey: ["platform-announcement"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Megaphone className="w-4 h-4" /> Platform-wide announcement</CardTitle>
        <CardDescription>Shows as a banner to every school, every user, while active — e.g. "Maintenance tonight 11pm–1am".</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Message</Label>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={3} disabled={!isOwner} />
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} disabled={!isOwner} />
            <Label>Active</Label>
          </div>
          <div className="flex items-center gap-2">
            <Label>Severity</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as any)} disabled={!isOwner}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {isOwner ? (
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save announcement
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Only platform owners can edit the announcement.</p>
        )}
      </CardContent>
    </Card>
  );
}
