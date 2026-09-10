// ─── SmartDev Learning — AI Insight card ──────────────────────────────────
// Thin card that POSTs to /api/ai-learning-insight (which calls the
// SELECT-only learning_ai_context() RPC, then Claude, to turn official ERP
// results + Learning mastery into a short narrative + suggested actions).
// Read-only end to end — see that route's header comment for why this can
// never touch official results. Used from StudentLearningPanel and
// ParentLearningPanel; not fetched until a studentId is available.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, AlertCircle } from "lucide-react";

export function AILearningInsight({ studentId }: { studentId: string | null | undefined }) {
  const [loading, setLoading] = useState(true);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr || !sessionData.session?.access_token) {
          throw new Error("Not authenticated — please log in again");
        }
        const resp = await fetch("/api/ai-learning-insight", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
          body: JSON.stringify({ student_id: studentId }),
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json.error ?? "AI insight failed");
        if (cancelled) return;
        setNarrative(json.narrative ?? null);
        setActions(Array.isArray(json.actions) ? json.actions : []);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Couldn't load AI insight");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [studentId]);

  if (!studentId) return null;

  return (
    <Card className="border-indigo-200 bg-indigo-50/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="w-4 h-4 text-indigo-600" /> AI Insight
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : error ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> {error}
          </p>
        ) : (
          <>
            <p className="text-sm leading-relaxed">{narrative}</p>
            {actions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {actions.map((a, i) => (
                  <Badge key={i} variant="outline" className="bg-white">{a}</Badge>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
