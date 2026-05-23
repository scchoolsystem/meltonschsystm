import { useEffect, useState } from "react";
import { Bell, Pin, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

type Announcement = { id:string; title:string; body:string; pinned:boolean; created_at:string; audience:string };
type Alert = { id:string; title:string; body:string|null; severity:string; category:string; resolved:boolean; created_at:string };

const SEEN_KEY = "notifications.lastSeenAt";
const SEV_COLOR: Record<string,string> = { critical:"text-destructive", high:"text-orange-500", medium:"text-yellow-500", low:"text-muted-foreground" };

export function NotificationsBell() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unread, setUnread] = useState(0);
  const [tab, setTab] = useState<"all"|"alerts">("all");

  const load = async () => {
    const [{ data: ann }, { data: alr }] = await Promise.all([
      supabase.from("announcements").select("id,title,body,pinned,created_at,audience").order("created_at",{ascending:false}).limit(15),
      supabase.from("smart_alerts").select("id,title,body,severity,category,resolved,created_at").eq("resolved",false).order("created_at",{ascending:false}).limit(20),
    ]);
    setAnnouncements((ann as Announcement[]) ?? []);
    setAlerts((alr as Alert[]) ?? []);
    const last = Number(localStorage.getItem(SEEN_KEY) || 0);
    const annUnread = ((ann ?? []) as Announcement[]).filter(r => new Date(r.created_at).getTime() > last).length;
    setUnread(annUnread + ((alr ?? []) as Alert[]).length);
  };

  const resolveAlert = async (id: string) => {
    await supabase.from("smart_alerts").update({ resolved: true, resolved_at: new Date().toISOString() }).eq("id", id);
    setAlerts(a => a.filter(x => x.id !== id));
    setUnread(u => Math.max(0, u-1));
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("notif")
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"announcements"},()=>load())
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"smart_alerts"},()=>load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const markSeen = () => { localStorage.setItem(SEEN_KEY, String(Date.now())); setUnread(alerts.length); };

  return (
    <Popover onOpenChange={o => o && markSeen()}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[9px] rounded-full w-4 h-4 grid place-items-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-3 py-2 border-b font-medium text-sm flex items-center justify-between">
          <div className="flex gap-3">
            <button onClick={()=>setTab("all")} className={"text-sm "+(tab==="all"?"font-bold text-foreground":"text-muted-foreground")}>Announcements</button>
            <button onClick={()=>setTab("alerts")} className={"text-sm flex items-center gap-1 "+(tab==="alerts"?"font-bold text-foreground":"text-muted-foreground")}>
              Alerts {alerts.length > 0 && <Badge variant="destructive" className="text-[9px] px-1 py-0">{alerts.length}</Badge>}
            </button>
          </div>
        </div>
        <ScrollArea className="max-h-96">
          {tab === "all" && (
            <>
              {announcements.length === 0 && <div className="p-4 text-xs text-muted-foreground text-center">No announcements yet.</div>}
              {announcements.map(n => (
                <div key={n.id} className="px-3 py-2 border-b last:border-0 hover:bg-muted/40">
                  <div className="flex items-center gap-1.5">
                    {n.pinned && <Pin className="w-3 h-3 text-primary" />}
                    <span className="text-sm font-medium truncate">{n.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>
                  <div className="text-[10px] text-muted-foreground mt-1">{n.audience} · {formatDistanceToNow(new Date(n.created_at),{addSuffix:true})}</div>
                </div>
              ))}
            </>
          )}
          {tab === "alerts" && (
            <>
              {alerts.length === 0 && <div className="p-4 text-xs text-muted-foreground text-center">No active alerts. ✅</div>}
              {alerts.map(a => (
                <div key={a.id} className="px-3 py-2 border-b last:border-0 hover:bg-muted/40">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className={"w-3 h-3 "+(SEV_COLOR[a.severity]??"")} />
                        <span className="text-sm font-medium">{a.title}</span>
                      </div>
                      {a.body && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{a.body}</p>}
                      <div className="text-[10px] text-muted-foreground mt-1">{a.category} · {a.severity} · {formatDistanceToNow(new Date(a.created_at),{addSuffix:true})}</div>
                    </div>
                    <button onClick={()=>resolveAlert(a.id)} title="Mark resolved" className="mt-0.5 text-green-600 hover:opacity-70 shrink-0"><CheckCircle2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}