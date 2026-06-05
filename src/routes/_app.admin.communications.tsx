import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Receipt, UserX, GraduationCap, Download } from "lucide-react";
import { sendBulkSms, sendEmailBlast } from "@/lib/sms.functions";
import { notifyFeeDue, notifyAttendanceAlert, notifyResultsPublished } from "@/lib/notifications.functions";
import { downloadCsv } from "@/lib/export-utils";

export const Route = createFileRoute("/_app/admin/communications")({
  component: CommunicationsPage,
});

type AudienceType = "all_students" | "all_parents" | "class" | "custom";

function statusBadge(status: string) {
  const map: Record<string, string> = {
    queued: "bg-muted text-muted-foreground",
    sent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  };
  return <span className={`px-2 py-0.5 rounded text-xs ${map[status] ?? "bg-muted"}`}>{status}</span>;
}

function AudiencePicker({
  type, setType, classId, setClassId, custom, setCustom, classes,
}: {
  type: AudienceType; setType: (t: AudienceType) => void;
  classId: string; setClassId: (s: string) => void;
  custom: string; setCustom: (s: string) => void;
  classes: any[];
}) {
  return (
    <div className="space-y-2">
      <Label>Audience</Label>
      <Select value={type} onValueChange={(v) => setType(v as AudienceType)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all_students">All students</SelectItem>
          <SelectItem value="all_parents">All parents</SelectItem>
          <SelectItem value="class">Specific class</SelectItem>
          <SelectItem value="custom">Paste phone list</SelectItem>
        </SelectContent>
      </Select>
      {type === "class" && (
        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger><SelectValue placeholder="Choose class" /></SelectTrigger>
          <SelectContent>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {type === "custom" && (
        <Textarea
          placeholder="Numbers separated by comma or newline"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          rows={3}
        />
      )}
    </div>
  );
}

function parseCustom(s: string): string[] {
  return s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
}

function CommunicationsPage() {
  const qc = useQueryClient();

  const { data: classes = [] } = useQuery({
    queryKey: ["comm-classes"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, name").order("name");
      return data ?? [];
    },
  });

  // ---- SMS tab ----
  const [smsMsg, setSmsMsg] = useState("");
  const [smsAud, setSmsAud] = useState<AudienceType>("all_parents");
  const [smsClass, setSmsClass] = useState("");
  const [smsCustom, setSmsCustom] = useState("");
  const sendSms = useServerFn(sendBulkSms);
  const smsMutation = useMutation({
    mutationFn: () =>
      sendSms({
        data: {
          message: smsMsg,
          audience: {
            type: smsAud,
            classId: smsAud === "class" ? smsClass : undefined,
            phones: smsAud === "custom" ? parseCustom(smsCustom) : undefined,
          },
        },
      }),
    onSuccess: (res) => {
      toast.success(`SMS ${res.status} — ${res.sent} recipients`);
      setSmsMsg("");
      qc.invalidateQueries({ queryKey: ["sms_queue"] });
      qc.invalidateQueries({ queryKey: ["notif_log"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const { data: smsRows = [] } = useQuery({
    queryKey: ["sms_queue"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("sms_queue").select("*").order("created_at", { ascending: false }).limit(20);
      return data ?? [];
    },
  });

  // ---- Email tab ----
  const [emSub, setEmSub] = useState("");
  const [emBody, setEmBody] = useState("");
  const [emAud, setEmAud] = useState<AudienceType>("all_parents");
  const [emClass, setEmClass] = useState("");
  const [emCustom, setEmCustom] = useState("");
  const sendEm = useServerFn(sendEmailBlast);
  const emMutation = useMutation({
    mutationFn: () =>
      sendEm({
        data: {
          subject: emSub,
          body: emBody,
          audience: {
            type: emAud,
            classId: emAud === "class" ? emClass : undefined,
            phones: emAud === "custom" ? parseCustom(emCustom) : undefined,
          },
        },
      }),
    onSuccess: (res) => {
      toast.success(`Email ${res.status} — ${res.sent} recipients`);
      setEmSub(""); setEmBody("");
      qc.invalidateQueries({ queryKey: ["notif_log"] });
      qc.invalidateQueries({ queryKey: ["notif_log_emails"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const { data: emailRows = [] } = useQuery({
    queryKey: ["notif_log_emails"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("notifications_log").select("*").eq("channel", "email")
        .order("created_at", { ascending: false }).limit(20);
      return data ?? [];
    },
  });

  // ---- Alerts ----
  const feeFn = useServerFn(notifyFeeDue);
  const attFn = useServerFn(notifyAttendanceAlert);
  const resFn = useServerFn(notifyResultsPublished);
  const feeM = useMutation({
    mutationFn: () => feeFn({} as any),
    onSuccess: (r) => toast.success(`Sent ${r.sent} reminders`),
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const attM = useMutation({
    mutationFn: () => attFn({} as any),
    onSuccess: (r) => toast.success(`Sent ${r.sent} alerts`),
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const [examId, setExamId] = useState("");
  const resM = useMutation({
    mutationFn: () => resFn({ data: { examId } }),
    onSuccess: (r) => toast.success(`Notified ${r.notified} students and parents`),
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const { data: exams = [] } = useQuery({
    queryKey: ["exams-not-published"],
    queryFn: async () => {
      const { data } = await supabase
        .from("exams").select("id, name, status, created_at")
        .neq("status", "published").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // ---- Log ----
  const [logChannel, setLogChannel] = useState<"all" | "sms" | "email">("all");
  const [logRange, setLogRange] = useState<"7" | "30" | "90">("30");
  const { data: logRows = [] } = useQuery({
    queryKey: ["notif_log", logChannel, logRange],
    queryFn: async () => {
      const since = new Date(Date.now() - parseInt(logRange) * 24 * 60 * 60 * 1000);
      let q = (supabase as any).from("notifications_log").select("*")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false });
      if (logChannel !== "all") q = q.eq("channel", logChannel);
      const { data } = await q;
      return data ?? [];
    },
  });

  const exportLogCsv = () => {
    downloadCsv("notifications-log", logRows, [
      { header: "Date", value: (r: any) => format(new Date(r.created_at), "dd/MM/yyyy HH:mm") },
      { header: "Channel", value: (r: any) => r.channel },
      { header: "Subject", value: (r: any) => r.subject ?? "" },
      { header: "Recipients", value: (r: any) => r.recipient_count },
      { header: "Status", value: (r: any) => r.status },
      { header: "Error", value: (r: any) => r.error ?? "" },
    ]);
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Communications</h1>
        <p className="text-muted-foreground">Send SMS, emails and automated alerts.</p>
      </div>

      <Tabs defaultValue="sms" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sms">SMS</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="alerts">Automated Alerts</TabsTrigger>
          <TabsTrigger value="log">Log</TabsTrigger>
        </TabsList>

        {/* SMS */}
        <TabsContent value="sms" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Bulk SMS</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Message</Label>
                <Textarea maxLength={160} value={smsMsg} onChange={(e) => setSmsMsg(e.target.value)} rows={4} />
                <p className="text-xs text-muted-foreground mt-1">{smsMsg.length} / 160</p>
              </div>
              <AudiencePicker type={smsAud} setType={setSmsAud} classId={smsClass} setClassId={setSmsClass} custom={smsCustom} setCustom={setSmsCustom} classes={classes} />
              <Button onClick={() => smsMutation.mutate()} disabled={!smsMsg.trim() || smsMutation.isPending}>
                {smsMutation.isPending ? "Sending..." : "Send SMS"}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Recent</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead><TableHead>Message</TableHead><TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead><TableHead>Failed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {smsRows.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>{format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                      <TableCell>{(r.message ?? "").slice(0, 60)}{(r.message ?? "").length > 60 ? "…" : ""}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell>{r.sent_count}</TableCell>
                      <TableCell>{r.failed_count}</TableCell>
                    </TableRow>
                  ))}
                  {smsRows.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No SMS sent yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email */}
        <TabsContent value="email" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Email Blast</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Subject</Label>
                <Input value={emSub} onChange={(e) => setEmSub(e.target.value)} />
              </div>
              <div>
                <Label>Body</Label>
                <Textarea value={emBody} onChange={(e) => setEmBody(e.target.value)} rows={6} />
              </div>
              <AudiencePicker type={emAud} setType={setEmAud} classId={emClass} setClassId={setEmClass} custom={emCustom} setCustom={setEmCustom} classes={classes} />
              <Button onClick={() => emMutation.mutate()} disabled={!emSub.trim() || !emBody.trim() || emMutation.isPending}>
                {emMutation.isPending ? "Sending..." : "Send Email"}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Recent</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead><TableHead>Subject</TableHead>
                    <TableHead>Recipients</TableHead><TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emailRows.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>{format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                      <TableCell>{(r.subject ?? "").slice(0, 60)}</TableCell>
                      <TableCell>{r.recipient_count}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                    </TableRow>
                  ))}
                  {emailRows.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No emails sent yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alerts */}
        <TabsContent value="alerts">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <Receipt className="w-8 h-8 text-primary mb-2" />
                <CardTitle>Fee Reminders</CardTitle>
                <CardDescription>Email parents of all students with unpaid invoices due within the next 7 days.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => feeM.mutate()} disabled={feeM.isPending}>
                  {feeM.isPending ? "Sending..." : "Send now"}
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <UserX className="w-8 h-8 text-primary mb-2" />
                <CardTitle>Attendance Alerts</CardTitle>
                <CardDescription>Email parents of students marked absent 3 or more consecutive days.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => attM.mutate()} disabled={attM.isPending}>
                  {attM.isPending ? "Sending..." : "Send now"}
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <GraduationCap className="w-8 h-8 text-primary mb-2" />
                <CardTitle>Results Published</CardTitle>
                <CardDescription>Notify students and parents when exam results are ready.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Select value={examId} onValueChange={setExamId}>
                  <SelectTrigger><SelectValue placeholder="Choose exam" /></SelectTrigger>
                  <SelectContent>
                    {exams.map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={() => resM.mutate()} disabled={!examId || resM.isPending}>
                  {resM.isPending ? "Sending..." : "Send now"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Log */}
        <TabsContent value="log" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex gap-2">
              <Select value={logChannel} onValueChange={(v) => setLogChannel(v as any)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
              <Select value={logRange} onValueChange={(v) => setLogRange(v as any)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={exportLogCsv}>
              <Download className="w-4 h-4 mr-2" />Export CSV
            </Button>
          </div>
          <Card><CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead><TableHead>Channel</TableHead>
                  <TableHead>Subject</TableHead><TableHead>Recipients</TableHead>
                  <TableHead>Status</TableHead><TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TooltipProvider>
                  {logRows.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>{format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                      <TableCell>
                        <Badge className={r.channel === "sms" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}>
                          {r.channel.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>{r.subject ?? ""}</TableCell>
                      <TableCell>{r.recipient_count}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell>
                        {r.error && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-red-600 text-xs cursor-help">error</span>
                            </TooltipTrigger>
                            <TooltipContent>{r.error}</TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TooltipProvider>
                {logRows.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No logs in range</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
