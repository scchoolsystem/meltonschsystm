import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";

type Row = { kind: "student" | "staff" | "class"; id: string; label: string; sub?: string };

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    const t = setTimeout(async () => {
      if (!term) { setRows([]); return; }
      const like = `%${term}%`;
      const [s, st, c] = await Promise.all([
        supabase.from("students")
          .select("id,first_name,last_name,admission_no,unique_id")
          .or(`first_name.ilike.${like},last_name.ilike.${like},admission_no.ilike.${like},unique_id.ilike.${like}`)
          .limit(8),
        supabase.from("staff")
          .select("id,first_name,last_name,employee_no,unique_id,role")
          .or(`first_name.ilike.${like},last_name.ilike.${like},employee_no.ilike.${like},unique_id.ilike.${like}`)
          .limit(8),
        supabase.from("classes")
          .select("id,name,level,stream")
          .or(`name.ilike.${like},level.ilike.${like}`)
          .limit(8),
      ]);
      const out: Row[] = [];
      s.data?.forEach((r: any) => out.push({
        kind: "student", id: r.id,
        label: `${r.first_name} ${r.last_name}`, sub: r.unique_id || r.admission_no,
      }));
      st.data?.forEach((r: any) => out.push({
        kind: "staff", id: r.id,
        label: `${r.first_name} ${r.last_name}`, sub: `${r.role} · ${r.unique_id || r.employee_no}`,
      }));
      c.data?.forEach((r: any) => out.push({
        kind: "class", id: r.id,
        label: r.name, sub: [r.level, r.stream].filter(Boolean).join(" · "),
      }));
      setRows(out);
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  const go = (r: Row) => {
    setOpen(false);
    if (r.kind === "student") navigate({ to: "/ids/student/$id", params: { id: r.id } });
    else if (r.kind === "staff") navigate({ to: "/ids/staff/$id", params: { id: r.id } });
    else navigate({ to: "/classes" });
  };

  return (
    <>
      <Button
        variant="outline" size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 text-muted-foreground w-64 justify-start"
      >
        <Search className="w-4 h-4" />
        <span className="text-xs">Search students, staff, classes…</span>
        <kbd className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded">⌘K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput value={q} onValueChange={setQ} placeholder="Type a name, ID, or class…" />
        <CommandList>
          <CommandEmpty>{q ? "No matches." : "Start typing to search."}</CommandEmpty>
          {(["student", "staff", "class"] as const).map((kind) => {
            const items = rows.filter((r) => r.kind === kind);
            if (!items.length) return null;
            return (
              <CommandGroup key={kind} heading={kind.toUpperCase() + "S"}>
                {items.map((r) => (
                  <CommandItem key={`${kind}-${r.id}`} onSelect={() => go(r)} value={`${r.label} ${r.sub ?? ""}`}>
                    <div className="flex flex-col">
                      <span>{r.label}</span>
                      {r.sub && <span className="text-xs text-muted-foreground">{r.sub}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
}
