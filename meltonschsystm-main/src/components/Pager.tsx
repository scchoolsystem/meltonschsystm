import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PagerProps {
  page: number;
  pageCount: number;
  total: number;
  onChange: (p: number) => void;
}

export function Pager({ page, pageCount, total, onChange }: PagerProps) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 pt-3 text-sm">
      <div className="text-muted-foreground">
        Page <span className="font-medium text-foreground">{page + 1}</span> of{" "}
        <span className="font-medium text-foreground">{pageCount}</span>
        <span className="mx-2">·</span>
        {total.toLocaleString()} records
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => onChange(Math.max(0, page - 1))}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Prev
        </Button>
        <Button size="sm" variant="outline" disabled={page + 1 >= pageCount} onClick={() => onChange(page + 1)}>
          Next <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
