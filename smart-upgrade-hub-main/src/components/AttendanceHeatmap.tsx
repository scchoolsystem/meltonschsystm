import { useMemo } from "react";

interface Record {
  date: string;
  status: string;
}

/** Compact 8-week heatmap (Mon–Sun rows). */
export function AttendanceHeatmap({ records, weeks = 8 }: { records: Record[]; weeks?: number }) {
  const cells = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of records) map.set(r.date, r.status);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dow = (today.getDay() + 6) % 7; // Mon=0
    const end = new Date(today);
    end.setDate(end.getDate() - dow + 6); // end at Sunday of this week
    const start = new Date(end);
    start.setDate(end.getDate() - (weeks * 7 - 1));
    const days: { date: string; status: string | null; future: boolean }[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      days.push({ date: iso, status: map.get(iso) ?? null, future: d > today });
    }
    return days;
  }, [records, weeks]);

  const color = (s: string | null, future: boolean) => {
    if (future) return "bg-muted/30";
    if (!s) return "bg-muted";
    if (s === "present") return "bg-emerald-500";
    if (s === "late") return "bg-amber-500";
    if (s === "absent") return "bg-destructive";
    return "bg-secondary";
  };

  return (
    <div>
      <div className="grid grid-flow-col grid-rows-7 gap-1">
        {cells.map((c) => (
          <div
            key={c.date}
            className={`w-3 h-3 rounded-sm ${color(c.status, c.future)}`}
            title={`${c.date}${c.status ? ` · ${c.status}` : ""}`}
          />
        ))}
      </div>
      <div className="flex gap-3 text-xs text-muted-foreground mt-3">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" />Present</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500" />Late</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-destructive" />Absent</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-muted" />No record</span>
      </div>
    </div>
  );
}
