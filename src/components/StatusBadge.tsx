import { Badge } from "@/components/ui/badge";

const MAP: Record<string, string> = {
  active: "bg-success/15 text-success border-success/30",
  suspended: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  expelled: "bg-destructive/15 text-destructive border-destructive/30",
  transferred: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  archived: "bg-muted text-muted-foreground border-muted-foreground/20",
};

export function StatusBadge({ status }: { status?: string | null }) {
  const s = (status ?? "active").toLowerCase();
  return <Badge variant="outline" className={MAP[s] ?? ""}>{s}</Badge>;
}
