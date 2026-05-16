import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { computeSchoolBrain } from "@/lib/brain.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Brain, TrendingUp, AlertTriangle, ShieldCheck, Lock, Unlock, History, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/admin/brain")({ component: BrainPage });

function BrainPage() {
  const { isAdmin } = useAuth();
  const fn = useServerFn(computeSchoolBrain);
  const { data, isLoading } = useQuery({
    queryKey: ["school-brain"],
    queryFn: () => fn({} as any),
    enabled: isAdmin,
  });

  if (!isAdmin) return <div className="p-6 text-muted-foreground">Admin only.</div>;
  if (isLoading || !data) return <div className="h-64 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const sev: Record<string, string> = {
    info: "bg-muted text-muted-foreground",
    warn: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    high: "bg-destructive/15 text-destructive border-destructive/30",
    critical: "bg-destructive text-destructive-foreground",
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <Brain className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">School Brain</h1>
          <p className="text-sm text-muted-foreground">Predictive health indices and smart alerts</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          ["School Health", data.indices.schoolHealth],
          ["Academic", data.indices.academicHealth],
          ["Finance", data.indices.financeStability],
          ["Attendance", data.indices.attendanceStability],
          ["Discipline", data.indices.disciplineRisk],
        ].map(([label, v]) => (
          <Card key={String(label)}>
            <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">{label}</CardTitle></CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{v as number}</div>
              <div className="text-xs text-muted-foreground">out of 100</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Object.entries(data.counts).map(([k, v]) => (
          <Card key={k}>
            <CardContent className="py-4">
              <div className="text-xs text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1").trim()}</div>
              <div className="text-2xl font-bold flex items-center gap-2"><TrendingUp className="w-4 h-4 opacity-50" />{v as number}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="w-4 h-4" />Governance & permissions</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <Stat icon={<Lock className="w-4 h-4" />} label="Locked fields" value={data.governance?.locked ?? 0} />
            <Stat icon={<ShieldCheck className="w-4 h-4" />} label="Restricted fields" value={data.governance?.restricted ?? 0} />
            <Stat icon={<Unlock className="w-4 h-4" />} label="Editable fields" value={data.governance?.editable ?? 0} />
            <Stat icon={<History className="w-4 h-4" />} label="Overrides (7d)" value={data.governance?.overrides7d ?? 0} />
            <Stat icon={<TrendingUp className="w-4 h-4" />} label="Field edits (30d)" value={data.governance?.edits30d ?? 0} />
            <Stat icon={<Users className="w-4 h-4" />} label="Pending parent links" value={data.governance?.pendingParentLinks ?? 0} />
            <Stat icon={<History className="w-4 h-4" />} label="Lifecycle changes (30d)" value={data.governance?.lifecycleChanges30d ?? 0} />
            <Stat icon={<ShieldCheck className="w-4 h-4" />} label="Total policies" value={data.governance?.totalPolicies ?? 0} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-2">Top override actors (7d)</div>
              {(data.topOverrideActors ?? []).length === 0 && <div className="text-xs text-muted-foreground">No overrides recorded.</div>}
              <div className="space-y-1">
                {(data.topOverrideActors ?? []).map((a: any) => (
                  <div key={a.actor} className="flex justify-between text-sm border rounded px-2 py-1">
                    <span className="font-mono">{a.actor}</span>
                    <Badge variant="secondary">{a.count}</Badge>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-2">Recent overrides</div>
              {(data.recentOverrides ?? []).length === 0 && <div className="text-xs text-muted-foreground">None.</div>}
              <div className="space-y-1 max-h-56 overflow-auto">
                {(data.recentOverrides ?? []).map((o: any, i: number) => (
                  <div key={i} className="text-xs border rounded px-2 py-1">
                    <div className="flex justify-between">
                      <span className="font-mono">{o.actor}</span>
                      <span className="text-muted-foreground">{new Date(o.at).toLocaleString()}</span>
                    </div>
                    <div className="text-muted-foreground truncate">{o.resource}.{o.field} — {o.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Smart alerts</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data.alerts.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">No alerts. School operating in normal range.</div>}
          {data.alerts.map((a, i) => (
            <div key={i} className="flex items-start justify-between gap-4 p-3 rounded-md border">
              <div>
                <div className="font-medium text-sm">{a.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{a.body}</div>
              </div>
              <Badge variant="outline" className={sev[a.severity] ?? ""}>{a.category}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="border rounded-md p-3">
      <div className="text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
