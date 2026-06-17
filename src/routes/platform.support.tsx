import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { LifeBuoy } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/platform/support")({
  component: PlatformSupport,
});

function PlatformSupport() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  const { data: tickets } = useQuery({
    queryKey: ["support-tickets"],
    queryFn: async () => {
      const { data } = await supabase
        .from("support_tickets")
        .select("*, schools(name, slug)")
        // Internal school-only categories (e.g. teacher "Raise Concern" tickets)
        // must never reach the platform inbox — only genuine platform-facing
        // tickets do.
        .in("category", ["billing", "technical", "general"])
        .order("updated_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["support-messages", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data } = await supabase
        .from("support_messages")
        .select("*")
        .eq("ticket_id", selectedId!)
        .order("created_at");
      return data ?? [];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("support_tickets").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
    },
  });

  const sendReply = useMutation({
    mutationFn: async () => {
      if (!reply.trim() || !selectedId || !user) throw new Error("Type a reply");
      const { error } = await supabase.from("support_messages").insert({
        ticket_id: selectedId,
        author_id: user.id,
        body: reply.trim(),
        is_platform_reply: true,
      });
      if (error) throw error;
      // bump ticket updated_at
      await supabase.from("support_tickets").update({ updated_at: new Date().toISOString() }).eq("id", selectedId);
    },
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["support-messages", selectedId] });
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const selected = tickets?.find((t: any) => t.id === selectedId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <LifeBuoy className="h-6 w-6" /> Support
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Tickets opened by schools across the platform.</p>
      </div>

      <div className="grid lg:grid-cols-[1fr_2fr] gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Tickets</CardTitle></CardHeader>
          <CardContent className="space-y-1 max-h-[600px] overflow-auto">
            {(tickets ?? []).map((t: any) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left p-3 rounded-md border text-sm transition-colors ${selectedId === t.id ? "bg-muted" : "hover:bg-muted/50"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{t.subject}</span>
                  <Badge variant={t.status === "open" ? "destructive" : t.status === "resolved" ? "default" : "secondary"}>
                    {t.status}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center justify-between gap-2">
                  <span className="truncate">{t.schools?.name}</span>
                  <span className="shrink-0">{formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}</span>
                </div>
              </button>
            ))}
            {(!tickets || tickets.length === 0) && (
              <p className="text-sm text-muted-foreground p-4 text-center">No tickets yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          {selected ? (
            <>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{selected.subject}</CardTitle>
                    <CardDescription>
                      {selected.schools?.name} · Priority: <strong>{selected.priority}</strong>
                    </CardDescription>
                  </div>
                  <Select value={selected.status} onValueChange={(v) => setStatus.mutate({ id: selected.id, status: v })}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 rounded-md bg-muted/50 text-sm whitespace-pre-wrap">{selected.body}</div>
                <div className="space-y-3">
                  {(messages ?? []).map((m: any) => (
                    <div key={m.id} className={`p-3 rounded-md text-sm ${m.is_platform_reply ? "bg-primary/10 border border-primary/20" : "bg-muted/50"}`}>
                      <div className="text-xs text-muted-foreground mb-1">
                        {m.is_platform_reply ? "Platform reply" : "School"} · {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                      </div>
                      <div className="whitespace-pre-wrap">{m.body}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-2 border-t pt-4">
                  <Textarea placeholder="Type your reply..." value={reply} onChange={e => setReply(e.target.value)} rows={3} />
                  <Button onClick={() => sendReply.mutate()} disabled={sendReply.isPending || !reply.trim()}>
                    {sendReply.isPending ? "Sending..." : "Send reply"}
                  </Button>
                </div>
              </CardContent>
            </>
          ) : (
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              Select a ticket to view the conversation
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
