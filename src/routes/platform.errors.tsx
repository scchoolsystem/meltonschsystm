import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PlatformScopeGuard } from "@/components/security/PlatformScopeGuard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Check, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/platform/errors")({
  component: () => (
    <PlatformScopeGuard requirement={{ section: "errors" }}>
      <PlatformErrors />
    </PlatformScopeGuard>
  ),
});

type Row = {
  id: string;
  school_id: string | null;
  school_name: string | null;
  source: string;
  severity: "warning" | "error" | "critical";
  code: string | null;
  message: string;
  stack: string | null;
  context: Record<string, unknown>;
  url: string | null;
  occurrences: number;
  first_seen_at: string;
  last_seen_at: string;
  status: "open" | "acknowledged" | "resolved";
  resolution_note: string | null;
};

const SEVERITY_STYLE: Record<Row["severity"], string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  error: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
};

function PlatformErrors() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"open" | "acknowledged" | "resolved">("open");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["system-error-logs", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_error_logs")
        .select("*")
        .eq("status", tab)
        .order("last_seen_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: 20_000,
  });

  // Live-update the list as new failures come in, so this is a page an owner
  // can leave open and trust — not something they have to remember to refresh.
  useEffect(() => {
    const ch = supabase
      .channel("system-error-logs-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "system_error_logs" }, () =>
        qc.invalidateQueries({ queryKey: ["system-error-logs"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const setStatus = useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: Row["status"]; note?: string }) => {
      const patch: Record<string, unknown> =
        status === "acknowledged"
          ? { status, acknowledged_by: user?.id ?? null, acknowledged_at: new Date().toISOString() }
          : status === "resolved"
            ? { status, resolved_by: user?.id ?? null, resolved_at: new Date().toISOString(), resolution_note: note ?? null }
            : { status };
      const { error } = await supabase.from("system_error_logs").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["system-error-logs"] }),
    onError: (e: any) => toast.error(e.message ?? "Couldn't update this entry"),
  });

  const counts = useMemo(() => {
    const c: Record<Row["severity"], number> = { critical: 0, error: 0, warning: 0 };
    for (const r of rows ?? []) c[r.severity] += 1;
    return c;
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-destructive" />
          System errors
        </h1>
        <p className="text-sm text-muted-foreground">
          Every failure the app hits — live classes, payments, uncaught crashes — is logged here instead of being
          shown to the people using the app. If you're platform support with scoped access, this only shows the
          schools you're allocated to.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="open">
            Open {rows && tab === "open" ? `(${rows.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="acknowledged">Acknowledged</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-3">
          {tab === "open" && rows && rows.length > 0 && (
            <div className="flex gap-2 text-xs text-muted-foreground">
              {counts.critical > 0 && <span className="text-destructive font-medium">{counts.critical} critical</span>}
              {counts.error > 0 && <span>{counts.error} error</span>}
              {counts.warning > 0 && <span>{counts.warning} warning</span>}
            </div>
          )}

          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : !rows || rows.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground text-sm">
                {tab === "open" ? "Nothing open — all clear." : `No ${tab} entries.`}
              </CardContent>
            </Card>
          ) : (
            rows.map((r) => (
              <Card key={r.id} className={cn(r.severity === "critical" && r.status === "open" && "border-destructive/40")}>
                <CardHeader
                  className="cursor-pointer select-none py-4"
                  onClick={() => setExpanded((e) => (e === r.id ? null : r.id))}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={SEVERITY_STYLE[r.severity]}>{r.severity}</Badge>
                        <Badge variant="secondary">{r.source}</Badge>
                        {r.code && <span className="text-xs font-mono text-muted-foreground">{r.code}</span>}
                        {r.occurrences > 1 && (
                          <Badge variant="outline">×{r.occurrences}</Badge>
                        )}
                        {r.school_name && <Badge variant="outline">{r.school_name}</Badge>}
                      </div>
                      <CardTitle className="text-sm font-medium break-words">{r.message}</CardTitle>
                      <CardDescription className="text-xs">
                        First seen {formatDistanceToNow(new Date(r.first_seen_at), { addSuffix: true })} · last seen{" "}
                        {formatDistanceToNow(new Date(r.last_seen_at), { addSuffix: true })}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.status === "open" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); setStatus.mutate({ id: r.id, status: "acknowledged" }); }}
                        >
                          Acknowledge
                        </Button>
                      )}
                      {r.status !== "resolved" && (
                        <Button
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setStatus.mutate({ id: r.id, status: "resolved" }); }}
                        >
                          <Check className="w-4 h-4 mr-1" /> Resolve
                        </Button>
                      )}
                      {expanded === r.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>
                </CardHeader>

                {expanded === r.id && (
                  <CardContent className="pt-0 space-y-3 text-sm">
                    {r.url && <div><span className="text-muted-foreground">Page:</span> <span className="font-mono text-xs">{r.url}</span></div>}
                    {Object.keys(r.context ?? {}).length > 0 && (
                      <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto">{JSON.stringify(r.context, null, 2)}</pre>
                    )}
                    {r.stack && (
                      <details>
                        <summary className="text-xs text-muted-foreground cursor-pointer">Stack trace</summary>
                        <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto mt-2">{r.stack}</pre>
                      </details>
                    )}
                    {r.status !== "resolved" && (
                      <ResolveNote onResolve={(note) => setStatus.mutate({ id: r.id, status: "resolved", note })} />
                    )}
                    {r.resolution_note && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium">Resolution:</span> {r.resolution_note}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ResolveNote({ onResolve }: { onResolve: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <div className="flex gap-2 items-start">
      <Textarea
        placeholder="Optional note on what fixed this…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="text-xs min-h-16"
      />
      <Button size="sm" variant="outline" onClick={() => onResolve(note)} className="shrink-0">
        Mark resolved
      </Button>
    </div>
  );
}
