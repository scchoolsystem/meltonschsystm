import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Loader2, ShieldCheck, MessageSquare, Mail, Bell, AlertTriangle } from "lucide-react";
import { FeatureGate } from "@/components/FeatureGate";
import { useAuth } from "@/hooks/use-auth";
import { supabase, getSessionSafe } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { previewResultsSend, sendResultsBatch } from "@/lib/results-notify.functions";

export const Route = createFileRoute("/_app/academics/send-results")({
  beforeLoad: async () => {
    const { data, timedOut } = await getSessionSafe();
    if (timedOut) return;
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: () => (
    <FeatureGate feature="academics_results">
      <SendResultsPage />
    </FeatureGate>
  ),
});

const ALL = "__all__";

function SendResultsPage() {
  const { isAdmin, hasRole } = useAuth();
  const can = isAdmin || hasRole("principal") || hasRole("deputy_principal") ||
    hasRole("academic_master") || hasRole("exams_admin") || hasRole("school_admin");

  const [examId, setExamId] = useState("");
  const [classId, setClassId] = useState(ALL);
  const [sms, setSms] = useState(true);
  const [email, setEmail] = useState(true);
  const [bell, setBell] = useState(true);
  const [smsWithSubjects, setSmsWithSubjects] = useState(false);
  const [includeUnverified, setIncludeUnverified] = useState(false);
  const [resend, setResend] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<{ sms: number; email: number; bell: number; skipped: number; failures: string[] } | null>(null);

  const previewFn = useServerFn(previewResultsSend);
  const sendFn = useServerFn(sendResultsBatch);
  const cls = classId === ALL ? undefined : classId;

  const { data: exams = [] } = useQuery({
    queryKey: ["send-results-exams"],
    queryFn: async () =>
      (await supabase.from("exams").select("id,name,term,year,status").order("start_date", { ascending: false })).data ?? [],
  });
  const { data: classes = [] } = useQuery({
    queryKey: ["send-results-classes"],
    queryFn: async () => (await supabase.from("classes").select("id,name,stream").order("name")).data ?? [],
  });

  const preview = useQuery({
    queryKey: ["send-results-preview", examId, cls],
    enabled: !!examId && can,
    queryFn: () => previewFn({ data: { examId, classId: cls } }),
  });
  const p = preview.data;

  const send = useMutation({
    mutationFn: async () => {
      const agg = { sms: 0, email: 0, bell: 0, skipped: 0, failures: [] as string[] };
      let offset = 0;
      setSummary(null);
      for (;;) {
        const r = await sendFn({ data: { examId, classId: cls, offset, sms, email, bell, smsWithSubjects, includeUnverified, resend } });
        agg.sms += r.sms; agg.email += r.email; agg.bell += r.bell; agg.skipped += r.skipped;
        agg.failures.push(...r.failures);
        offset = r.nextOffset;
        setProgress({ done: Math.min(offset, r.total), total: r.total });
        if (r.done) break;
      }
      return agg;
    },
    onSuccess: (agg) => {
      setSummary(agg);
      toast.success(`Sent: ${agg.sms} SMS, ${agg.email} emails, ${agg.bell} in-app`);
      preview.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Sending failed"),
    onSettled: () => setProgress(null),
  });

  if (!can) {
    return (
      <div className="flex items-center justify-center h-64 p-6">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-3">
            <ShieldCheck className="w-12 h-12 mx-auto text-muted-foreground opacity-50" />
            <h2 className="font-semibold text-lg">Send Results</h2>
            <p className="text-sm text-muted-foreground">Only admin or exams staff can send results.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const anyChannel = sms || email || bell;
  const ready = !!p && p.sendable && p.total > 0 && anyChannel;
  const smsSample = smsWithSubjects ? p?.sampleSmsWithSubjects : p?.sampleSms;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Send className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Send Results</h1>
          <p className="text-sm text-muted-foreground">
            Send each parent their own child's results by SMS, email and the in-app bell. Positions are within the class, by mean score.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs mb-1.5 block">Exam</Label>
            <Select value={examId} onValueChange={(v) => { setExamId(v); setSummary(null); }}>
              <SelectTrigger><SelectValue placeholder="Select an exam" /></SelectTrigger>
              <SelectContent>
                {(exams as any[]).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name} — {e.term} {e.year} ({e.status})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <Label className="text-xs mb-1.5 block">Class</Label>
            <Select value={classId} onValueChange={(v) => { setClassId(v); setSummary(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All classes</SelectItem>
                {(classes as any[]).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{`${c.name}${c.stream ? " " + c.stream : ""}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {examId && preview.isLoading && (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      )}
      {preview.error && (
        <Card className="border-destructive/30"><CardContent className="py-4 text-sm text-destructive">
          {(preview.error as Error).message}
        </CardContent></Card>
      )}

      {p && (
        <>
          {!p.sendable && (
            <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
              <CardContent className="py-4 flex gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
                This exam is “{p.exam.status}”. Mark it <strong>completed</strong> in Academics → Exams before sending, so draft marks aren’t sent out.
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Who will be messaged</CardTitle>
              <CardDescription>{p.exam.name} — {p.exam.term} {p.exam.year}</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              {[
                ["Students with results", p.total],
                ["Parents with phone", p.withPhone],
                ["Parents with email", p.withEmail],
                ["Already sent", p.alreadySent],
              ].map(([label, n]) => (
                <div key={label as string} className="rounded-lg border p-3">
                  <div className="text-2xl font-bold">{n}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Channels</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Row icon={<MessageSquare className="w-4 h-4" />} label="SMS" hint="Mean, grade and position. Costs SMS units." checked={sms} onChange={setSms} />
              {sms && <Row indent label="Include subject marks in SMS" hint="Longer message; may use 2 SMS parts." checked={smsWithSubjects} onChange={setSmsWithSubjects} />}
              <Row icon={<Mail className="w-4 h-4" />} label="Email" hint="Full per-subject table." checked={email} onChange={setEmail} />
              <Row icon={<Bell className="w-4 h-4" />} label="In-app bell" hint="Linked parent and student logins." checked={bell} onChange={setBell} />
              <div className="border-t pt-4 space-y-4">
                <Row label="Include students with unverified marks" hint={`${p.unverified} student(s) have unverified marks and are skipped by default.`} checked={includeUnverified} onChange={setIncludeUnverified} />
                <Row label="Resend to students already notified" hint="Off: only new or failed recipients are sent." checked={resend} onChange={setResend} />
              </div>
            </CardContent>
          </Card>

          {p.sampleSms && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Message preview</CardTitle>
                <CardDescription>Example for {p.sampleStudent}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="rounded-lg bg-muted p-3 text-sm">{smsSample}</div>
                <div className="text-xs text-muted-foreground">{(smsSample ?? "").length} characters · {Math.ceil((smsSample ?? "").length / 160)} SMS part(s)</div>
              </CardContent>
            </Card>
          )}

          {progress && (
            <Card><CardContent className="py-4 space-y-2">
              <div className="text-sm">Sending… {progress.done} / {progress.total}</div>
              <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
            </CardContent></Card>
          )}

          {summary && (
            <Card><CardContent className="py-4 space-y-2 text-sm">
              <div><strong>Done.</strong> SMS {summary.sms} · Email {summary.email} · In-app {summary.bell} · Skipped {summary.skipped}</div>
              {summary.failures.length > 0 && (
                <div className="text-destructive">
                  {summary.failures.length} problem(s). Fix the contact details and run again (only unsent recipients are retried):
                  <ul className="list-disc pl-5 mt-1 text-xs max-h-40 overflow-auto">
                    {summary.failures.slice(0, 50).map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}
            </CardContent></Card>
          )}

          <div className="flex justify-end">
            <Button disabled={!ready || send.isPending} onClick={() => setConfirmOpen(true)} className="gap-1.5">
              {send.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send results
            </Button>
          </div>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Send results to parents?</AlertDialogTitle>
                <AlertDialogDescription>
                  {resend ? p.total : Math.max(p.total - p.alreadySent, 0)} student(s) via {[sms && "SMS", email && "email", bell && "in-app"].filter(Boolean).join(", ")}.
                  SMS messages use units and cannot be recalled.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => send.mutate()}>Send now</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}

function Row({ icon, label, hint, checked, onChange, indent }: {
  icon?: React.ReactNode; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; indent?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 ${indent ? "pl-6" : ""}`}>
      <div>
        <div className="text-sm font-medium flex items-center gap-2">{icon}{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
