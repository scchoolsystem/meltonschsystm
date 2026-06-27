import { useEffect, useState } from "react";
import { Bell, Pin, CheckCheck, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

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
  /** URL to navigate to when clicked (optional) */
  link?: string;
};

// ── Persistence keys ──────────────────────────────────────────────────────────
const SEEN_KEY = "notifications.lastSeenAt";
const READ_KEY = "notifications.readIds"; // comma-separated list of item IDs

function getReadIds(): Set<string> {
  try {
    return new Set((localStorage.getItem(READ_KEY) ?? "").split(",").filter(Boolean));
  } catch { return new Set(); }
}

function markItemRead(id: string) {
  try {
    const ids = getReadIds();
    ids.add(id);
    // Keep only the last 200 to avoid bloat
    const arr = Array.from(ids).slice(-200);
    localStorage.setItem(READ_KEY, arr.join(","));
  } catch { /* ignore */ }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function NotificationsBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data: schoolId } = await supabase.rpc("my_school_id");

    const [annRes, notifRes] = await Promise.all([
      supabase
        .from("announcements")
        .select("id,title,body,pinned,created_at,audience")
        .order("created_at", { ascending: false })
        .limit(20),
      schoolId
        ? supabase
            .from("notifications_log")
            .select("id,subject,body,created_at,channel")
            .eq("school_id", schoolId as any)
            .order("created_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const announcements: Item[] = ((annRes.data as any[]) || []).map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      pinned: r.pinned,
      created_at: r.created_at,
      audience: r.audience,
      source: "announcement" as const,
      link: "/announcements",
    }));

    const notifs: Item[] = ((notifRes.data as any[]) || []).map((r) => ({
      id: r.id,
      title: r.subject ?? "(no subject)",
      body: r.body ?? "",
      created_at: r.created_at,
      channel: r.channel,
      source: "notification" as const,
    }));

    const merged = [...announcements, ...notifs]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 25);

    setItems(merged);
    computeUnread(merged);
  };

  function computeUnread(list: Item[]) {
    const last = Number(localStorage.getItem(SEEN_KEY) || 0);
    const readIds = getReadIds();
    const count = list.filter(
      (r) => new Date(r.created_at).getTime() > last && !readIds.has(r.id)
    ).length;
    setUnread(count);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("notif-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "announcements" }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications_log" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  function handleOpen(o: boolean) {
    setOpen(o);
    if (o) {
      // Mark all currently visible as seen at the time-level
      localStorage.setItem(SEEN_KEY, String(Date.now()));
      setUnread(0);
    }
  }

  function handleItemClick(item: Item) {
    markItemRead(item.id);
    setItems((prev) => [...prev]); // trigger re-render
    computeUnread(items);
    if (item.link) window.location.href = item.link;
  }

  function markAllRead() {
    for (const item of items) markItemRead(item.id);
    localStorage.setItem(SEEN_KEY, String(Date.now()));
    setUnread(0);
    setItems((prev) => [...prev]);
  }

  const readIds = getReadIds();

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[9px] rounded-full w-4 h-4 grid place-items-center animate-pulse">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        {/* Header */}
        <div className="px-3 py-2 border-b font-medium text-sm flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bell className="w-3.5 h-3.5" />
            <span>Notifications</span>
            <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
          </div>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
              onClick={markAllRead}
            >
              <CheckCheck className="w-3 h-3" /> Mark all read
            </Button>
          )}
        </div>

        {/* List */}
        <ScrollArea className="max-h-[420px]">
          {items.length === 0 && (
            <div className="p-4 text-xs text-muted-foreground text-center">Nothing yet.</div>
          )}
          {items.map((n) => {
            const isRead = readIds.has(n.id);
            return (
              <div
                key={`${n.source}-${n.id}`}
                role={n.link ? "button" : undefined}
                tabIndex={n.link ? 0 : undefined}
                onClick={() => handleItemClick(n)}
                onKeyDown={(e) => e.key === "Enter" && handleItemClick(n)}
                className={cn(
                  "px-3 py-2.5 border-b last:border-0 transition-colors",
                  isRead ? "opacity-60" : "bg-primary/5 hover:bg-muted/60",
                  n.link && "cursor-pointer hover:bg-muted/60",
                )}
              >
                <div className="flex items-center gap-1.5">
                  {n.pinned && <Pin className="w-3 h-3 text-primary shrink-0" />}
                  {!isRead && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  )}
                  <span className="text-sm font-medium truncate flex-1">{n.title}</span>
                  <div className="flex items-center gap-1 ml-auto shrink-0">
                    {n.source === "notification" && n.channel && (
                      <Badge variant="secondary" className="text-[9px] uppercase">
                        {n.channel}
                      </Badge>
                    )}
                    {n.link && <ExternalLink className="w-3 h-3 text-muted-foreground" />}
                  </div>
                </div>
                {n.body && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 ml-4">{n.body}</p>
                )}
                <div className="text-[10px] text-muted-foreground mt-1 ml-4">
                  {n.audience ? `${n.audience} · ` : ""}
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </div>
              </div>
            );
          })}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
