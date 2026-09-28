import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Open (unacknowledged) system_error_logs count. RLS on that table already
// restricts rows to platform_owner (all) / platform_support (schools they're
// allocated to), so this naturally scopes itself per viewer — no extra
// filtering needed here.
function useOpenErrorCount() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { count: c } = await supabase
        .from("system_error_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "open");
      if (!cancelled) setCount(c ?? 0);
    };

    load();
    const ch = supabase
      .channel("system-error-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "system_error_logs" }, load)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, []);

  return count;
}

/** Small count pill for the sidebar "System errors" nav link. */
export function PlatformErrorBadge({ className }: { className?: string }) {
  const count = useOpenErrorCount();
  if (!count) return null;
  return (
    <Badge variant="destructive" className={cn("ml-auto h-5 min-w-5 justify-center px-1 text-[10px]", className)}>
      {count > 99 ? "99+" : count}
    </Badge>
  );
}

/**
 * Persistent banner shown on EVERY platform page (not just /platform/errors)
 * so an open failure is visible "at all times", not only when the owner
 * happens to click into the errors page.
 */
export function PlatformErrorBanner() {
  const count = useOpenErrorCount();
  if (!count) return null;
  return (
    <Link
      to="/platform/errors"
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-destructive/10 text-destructive border-b border-destructive/20 hover:bg-destructive/15 transition-colors"
    >
      <AlertTriangle className="w-4 h-4 shrink-0" />
      {count} open system error{count === 1 ? "" : "s"} — click to review
    </Link>
  );
}
