import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface StudentComboboxOption {
  id: string;
  admission_no?: string | null;
  first_name: string;
  last_name: string;
  gender?: string | null;
  /** Optional extra text shown muted after the name, e.g. class name */
  meta?: string | null;
}

/**
 * Fast, type-to-search student picker. Drop-in replacement for a plain
 * <Select> of students — avoids scrolling long dropdown lists.
 */
export function StudentCombobox({
  value,
  onChange,
  students,
  placeholder = "Search student…",
  disabled = false,
}: {
  value: string;
  onChange: (id: string) => void;
  students: StudentComboboxOption[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = students.find((s) => s.id === value);

  const label = (s: StudentComboboxOption) =>
    `${s.admission_no ? s.admission_no + " – " : ""}${s.first_name} ${s.last_name}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {selected ? label(selected) : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Type a name or admission no…" />
          <CommandList>
            <CommandEmpty>No matching student.</CommandEmpty>
            <CommandGroup>
              {students.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`${s.admission_no ?? ""} ${s.first_name} ${s.last_name}`}
                  onSelect={() => {
                    onChange(s.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === s.id ? "opacity-100" : "opacity-0")} />
                  {label(s)}
                  {s.gender && <span className="ml-2 text-xs text-muted-foreground">({s.gender})</span>}
                  {s.meta && <span className="ml-2 text-xs text-muted-foreground">{s.meta}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
