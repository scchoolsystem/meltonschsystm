import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, MessageSquare, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_app/admin/support")({ component: SupportPage });

const STATUS_STYLE: Record<string, string> = {
  open: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  in_progress: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  resolved: "bg-green-500/15 text-green-700 border-green-500/30",
};

function SupportPage() {
  return <SupportInner />;
}

function SupportInner() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("tickets");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [form, setForm] = useState({ subject: "", category: "general", message: "" });
  const [busy, setBusy] = useState(false);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["support-tickets"],
    queryFn: async () => {
      const { data: schoolId } = await supabase.rpc("my_school_id");
      if (!schoolId) return [];
      const { data } = await supabase
        .from("support_tickets")
        .select("id,subject,status,category,created_at")
        .eq("school_id", schoolId as any)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["support-messages", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const { data } = await supabase
        .from("support_messages")
        .select("id,body,sender_role,created_at")
        .eq("ticket_id", selectedId)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
    enabled: !!selectedId,
  });

  const selectedTicket = (tickets as any[]).find((t) => t.id === selectedId);

  const sendReply = async () => {
    if (!replyText.trim() || !selectedId) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("support_messages").insert({
      ticket_id: selectedId, body: replyText.trim(), sender_role: "school", sent_by: user?.id,
    } as any);
    if (error) { toast.error("Failed to send"); return; }
    setReplyText("");
    qc.invalidateQueries({ queryKey: ["support-messages", selectedId] });
  };

  const submitTicket = async () => {
    if (!form.subject.trim() || !form.message.trim()) { toast.error("Subject and message required"); return; }
    setBusy(true);
    try {
      const { data: schoolId } = await supabase.rpc("my_school_id");
      const { data: { user } } = await supabase.auth.getUser();
      const { data: ticket, error } = await supabase
        .from("support_tickets")
        .insert({ school_id: schoolId as any, subject: form.subject, category: form.category, status: "open" } as any)
        .select("id").single();
      if (error) throw error;
      await supabase.from("support_messages").insert({
        ticket_id: ticket.id, body: form.message, sender_role: "school", sent_by: user?.id,
      } as any);
      toast.success("Ticket submitted");
      setForm({ subject: "", category: "general", message: "" });
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
      setTab("tickets");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to submit");
    } finally { setBusy(false); }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <MessageSquare className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Support</h1>
          <p className="text-sm text-muted-foreground">Contact SmartDev platform support</p>
        </div>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="tickets">My Tickets</TabsTrigger>
          <TabsTrigger value="new"><Plus className="w-3.5 h-3.5 mr-1" />New Ticket</TabsTrigger>
        </TabsList>
        <TabsContent value="tickets" className="mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Tickets</CardTitle></CardHeader>
              <CardContent className="p-0">
                {isLoading
                  ? <div className="p-4 flex justify-center"><Loader2 className="w-4 h-4 animate-spin" /></div>
                  : (tickets as any[]).length === 0
                    ? <div className="p-4 text-sm text-muted-foreground">No tickets yet.</div>
                    : <ScrollArea className="max-h-96">
                        {(tickets as any[]).map((t) => (
                          <div key={t.id} onClick={() => setSelectedId(t.id)}
                            className={`p-3 border-b cursor-pointer hover:bg-muted/40 ${selectedId === t.id ? "bg-muted" : ""}`}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium truncate">{t.subject}</span>
                              <Badge variant="outline" className={`text-[10px] shrink-0 ${STATUS_STYLE[t.status] ?? ""}`}>{t.status}</Badge>
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {t.category} · {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                            </div>
                          </div>
                        ))}
                      </ScrollArea>
                }
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{selectedTicket ? selectedTicket.subject : "Select a ticket"}</CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex flex-col">
                {!selectedId
                  ? <div className="p-4 text-sm text-muted-foreground">Select a ticket to view the thread.</div>
                  : <>
                      <ScrollArea className="max-h-72 p-3">
                        {(messages as any[]).length === 0 && <div className="text-sm text-muted-foreground">No messages yet.</div>}
                        {(messages as any[]).map((m) => (
                          <div key={m.id} className={`flex mb-2 ${m.sender_role === "school" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.sender_role === "school" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                              {m.body}
                              <div className="text-[9px] opacity-60 mt-0.5">
                                {m.sender_role === "platform" ? "SmartDev Support" : "You"} · {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </ScrollArea>
                      {selectedTicket?.status !== "resolved" && (
                        <div className="p-3 border-t flex gap-2">
                          <Textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                            placeholder="Type your reply…" rows={2} className="resize-none text-sm" />
                          <Button size="icon" onClick={sendReply} disabled={!replyText.trim()}>
                            <Send className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </>
                }
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="new" className="mt-4">
          <Card className="max-w-lg">
            <CardHeader><CardTitle>New Support Ticket</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Subject</Label>
                <Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Brief description of your issue" />
              </div>
              <div><Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="billing">Billing</SelectItem>
                    <SelectItem value="technical">Technical</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Message</Label>
                <Textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                  placeholder="Describe your issue in detail…" rows={5} />
              </div>
              <Button onClick={submitTicket} disabled={busy} className="w-full">
                {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                Submit Ticket
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
