import { useEffect, useRef } from "react";
import DOMPurify from "dompurify";
import { Bold, Italic, Underline, List, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";

// Small, dependency-free rich text editor for story bodies. Stores content
// as sanitized HTML (instead of the old plain-text Textarea), so writers can
// bold/italic/underline/list parts of a story. Deliberately minimal — this
// isn't a full document editor, just enough formatting for a "Full story"
// field: bold, italic, underline, bullet list, numbered list.
//
// Content is sanitized with DOMPurify both on the way in (when the value
// prop changes from outside, e.g. loading a saved story) and, just as
// importantly, wherever it's rendered publicly (see media_.$slug.tsx) —
// this field is filled in by school/platform admins and shown on the public
// site, so it's treated as untrusted HTML end to end.

const ALLOWED_TAGS = ["b", "strong", "i", "em", "u", "ul", "ol", "li", "br", "p", "div"];

export function sanitizeStoryHtml(html: string): string {
  return DOMPurify.sanitize(html || "", { ALLOWED_TAGS, ALLOWED_ATTR: [] });
}

function ToolbarButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      // Mousedown (not click) + preventDefault keeps the text selection in
      // the editor alive — a click would first steal focus/selection away
      // from the contentEditable area, and execCommand needs that selection.
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  rows = 5,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastValue = useRef<string>("");

  // Only push the value prop into the DOM when it changed from *outside*
  // this component (e.g. switching which story is being edited). Syncing on
  // every keystroke would fight the browser's own cursor position.
  useEffect(() => {
    if (!ref.current) return;
    const clean = sanitizeStoryHtml(value);
    if (clean !== lastValue.current) {
      ref.current.innerHTML = clean;
      lastValue.current = clean;
    }
  }, [value]);

  const emit = () => {
    if (!ref.current) return;
    const html = sanitizeStoryHtml(ref.current.innerHTML);
    lastValue.current = html;
    onChange(html);
  };

  const exec = (command: string) => {
    ref.current?.focus();
    document.execCommand(command);
    emit();
  };

  return (
    <div className="rounded-md border bg-background">
      <div className="flex items-center gap-0.5 border-b px-1.5 py-1">
        <ToolbarButton title="Bold" onClick={() => exec("bold")}>
          <Bold className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Italic" onClick={() => exec("italic")}>
          <Italic className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Underline" onClick={() => exec("underline")}>
          <Underline className="w-3.5 h-3.5" />
        </ToolbarButton>
        <div className="w-px h-4 bg-border mx-1" />
        <ToolbarButton title="Bullet list" onClick={() => exec("insertUnorderedList")}>
          <List className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Numbered list" onClick={() => exec("insertOrderedList")}>
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolbarButton>
      </div>
      <div
        ref={ref}
        contentEditable
        onInput={emit}
        onBlur={emit}
        data-placeholder={placeholder}
        className={cn(
          "px-3 py-2 text-sm focus:outline-none prose-sm max-w-none",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
        )}
        style={{ minHeight: `${rows * 1.5}rem` }}
      />
    </div>
  );
}
