import { useEffect, useState } from "react";
import { Bell, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

type Source = "announcement" | "notification";
type Item = {
  id: string;
  title: string;
  body: string;
  pinned?: boolean;
  created_at: string;
  audience?: string;
  channel?: string;
  source: Source;
};

const SEEN_KEY = "notifications.lastSeenAt";

export function NotificationsBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);

  const load = async () => {
    const { data: schoolId } = await supabase.rpc("my_school_id");

    const [annRes, notifRes] = await Promise.all([
      supabase
        .from("announcements")
        .select("id,title,body,pinned,created_at,audience")
        .order("created_at", { ascending: false })
        .limit(15),
      schoolId
        ? supabase
            .from("notifications_log")
            .select("id,subject,body,created_at,channel")
            .eq("school_id", schoolId as any)
            .order("created_at", { ascending: false })
            .limit(15)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const announcements: Item[] = ((annRes.data as any[]) || []).map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      pinned: r.pinned,
      created_at: r.created_at,
      audience: r.audience,
      source: "announcement",
    }));
    const notifs: Item[] = ((notifRes.data as any[]) || []).map((r) => ({
      id: r.id,
      title: r.subject ?? "(no subject)",
      body: r.body ?? "",
      created_at: r.created_at,
      channel: r.channel,
      source: "notification",
    }));

    const merged = [...announcements, ...notifs]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 20);

    setItems(merged);
    const last = Number(localStorage.getItem(SEEN_KEY) || 0);
    setUnread(merged.filter((r) => new Date(r.created_at).getTime() > last).length);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("notif-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "announcements" }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications_log" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const markSeen = () => {
    localStorage.setItem(SEEN_KEY, String(Date.now()));
    setUnread(0);
  };

  return (
    <Popover onOpenChange={(o) => o && markSeen()}>
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
          <span>Notifications</span>
          <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 && (
            <div className="p-4 text-xs text-muted-foreground text-center">Nothing yet.</div>
          )}
          {items.map((n) => (
            <div key={`${n.source}-${n.id}`} className="px-3 py-2 border-b last:border-0 hover:bg-muted/40">
              <div className="flex items-center gap-1.5">
                {n.pinned && <Pin className="w-3 h-3 text-primary" />}
                <span className="text-sm font-medium truncate">{n.title}</span>
                {n.source === "notification" && n.channel && (
                  <Badge variant="secondary" className="text-[9px] uppercase ml-auto">
                    {n.channel}
                  </Badge>
                )}
              </div>
              {n.body && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>}
              <div className="text-[10px] text-muted-foreground mt-1">
                {n.audience ? `${n.audience} · ` : ""}
                {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
              </div>
            </div>
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
