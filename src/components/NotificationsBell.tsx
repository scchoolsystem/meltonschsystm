import { useEffect, useState } from "react";
import { Bell, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

type Item = { id: string; title: string; body: string; pinned: boolean; created_at: string; audience: string };

const SEEN_KEY = "notifications.lastSeenAt";

export function NotificationsBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);

  const load = async () => {
    const { data } = await supabase
      .from("announcements")
      .select("id,title,body,pinned,created_at,audience")
      .order("created_at", { ascending: false })
      .limit(15);
    const rows = (data as Item[]) || [];
    setItems(rows);
    const last = Number(localStorage.getItem(SEEN_KEY) || 0);
    setUnread(rows.filter((r) => new Date(r.created_at).getTime() > last).length);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("notif-announcements")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "announcements" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
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
            <div className="p-4 text-xs text-muted-foreground text-center">No announcements yet.</div>
          )}
          {items.map((n) => (
            <div key={n.id} className="px-3 py-2 border-b last:border-0 hover:bg-muted/40">
              <div className="flex items-center gap-1.5">
                {n.pinned && <Pin className="w-3 h-3 text-primary" />}
                <span className="text-sm font-medium truncate">{n.title}</span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>
              <div className="text-[10px] text-muted-foreground mt-1">
                {n.audience} · {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
              </div>
            </div>
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
