import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ChevronsUpDown, Users } from "lucide-react";

/**
 * Multi-select picker for "specific students / their parents" as a
 * Communications audience. Filter by class first (optional), search by
 * name/admission no, check individual students, or "select all" whatever
 * the current class + search filter shows. Selected IDs are what
 * sendBulkSms/sendEmailBlast resolve to parent_phone/parent_email for.
 */
export function AudienceStudentPicker({
  value,
  onChange,
  classes,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  classes: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [classFilter, setClassFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["comm-audience-students", classFilter],
    queryFn: async () => {
      let q = supabase
        .from("students")
        .select("id, first_name, last_name, admission_no, class_id")
        .eq("status", "active")
        .order("first_name");
      if (classFilter !== "all") q = q.eq("class_id", classFilter);
      const { data } = await q;
      return data ?? [];
    },
    enabled: open, // don't fetch the whole roster until the picker is actually opened
    staleTime: 60_000,
  });

  const classById = useMemo(() => Object.fromEntries(classes.map((c) => [c.id, c.name])), [classes]);

  const filtered = useMemo(() => {
    if (!search.trim()) return students;
    const needle = search.toLowerCase();
    return students.filter((s: any) =>
      `${s.first_name} ${s.last_name} ${s.admission_no ?? ""}`.toLowerCase().includes(needle)
    );
  }, [students, search]);

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  const selectAllFiltered = () => {
    const ids = filtered.map((s: any) => s.id);
    onChange(Array.from(new Set([...value, ...ids])));
  };

  const clearFiltered = () => {
    const ids = new Set(filtered.map((s: any) => s.id));
    onChange(value.filter((v) => !ids.has(v)));
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-between font-normal">
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              {value.length > 0 ? `${value.length} selected` : "Choose students / parents"}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="p-2 border-b">
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search name or admission no…" value={search} onValueChange={setSearch} />
            <div className="flex justify-between px-3 py-1.5 border-b text-xs">
              <button type="button" className="text-primary hover:underline" onClick={selectAllFiltered}>
                Select all shown ({filtered.length})
              </button>
              <button type="button" className="text-muted-foreground hover:underline" onClick={clearFiltered}>
                Clear shown
              </button>
            </div>
            <CommandList>
              {isLoading && <div className="py-4 text-center text-sm text-muted-foreground">Loading…</div>}
              {!isLoading && <CommandEmpty>No students found.</CommandEmpty>}
              <CommandGroup>
                {filtered.map((s: any) => (
                  <CommandItem
                    key={s.id}
                    value={s.id}
                    onSelect={() => toggle(s.id)}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Checkbox checked={value.includes(s.id)} className="pointer-events-none" />
                    <span className="flex-1">{s.first_name} {s.last_name}</span>
                    <span className="text-xs text-muted-foreground">{classById[s.class_id] ?? ""}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary">{value.length} student{value.length !== 1 ? "s" : ""} selected</Badge>
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => onChange([])}>
            clear all
          </button>
        </div>
      )}
    </div>
  );
}
