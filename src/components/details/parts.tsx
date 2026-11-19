import { useState, type ReactNode } from "react";
import { Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b px-4 py-3">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** Two-column key/value grid. Rows with empty values are skipped. */
export function Fields({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5 text-sm">
      {rows.filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words select-text">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Label/annotation chips. Long values collapse; click copies `key=value`. */
export function KVChips({ map, collapse = false }: { map?: Record<string, string>; collapse?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const entries = Object.entries(map ?? {});
  if (!entries.length) return <span className="text-sm text-muted-foreground">—</span>;
  const shown = collapse && !expanded ? entries.slice(0, 5) : entries;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map(([k, v]) => (
        <Badge
          key={k}
          variant="secondary"
          title={`${k}=${v}\n(click to copy)`}
          onClick={() => navigator.clipboard?.writeText(`${k}=${v}`)}
          className="max-w-full cursor-pointer font-mono text-[11px] font-normal"
        >
          <span className="truncate">{k}={v.length > 80 ? v.slice(0, 80) + "…" : v}</span>
        </Badge>
      ))}
      {collapse && entries.length > 5 && (
        <button className="text-xs text-primary" onClick={() => setExpanded(!expanded)}>
          {expanded ? "show less" : `+${entries.length - 5} more`}
        </button>
      )}
    </div>
  );
}

export function CopyText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("group inline-flex items-center gap-1", className)}>
      <span className="select-text">{text}</span>
      <Copy
        className="size-3 cursor-pointer opacity-0 group-hover:opacity-60"
        onClick={() => navigator.clipboard?.writeText(text)}
      />
    </span>
  );
}

export type Condition = { type: string; status: string; reason?: string; message?: string; lastTransitionTime?: string };

export function Conditions({ items }: { items?: Condition[] }) {
  if (!items?.length) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((c) => (
        <Badge
          key={c.type}
          variant="outline"
          title={[c.reason, c.message, c.lastTransitionTime].filter(Boolean).join("\n")}
          className={cn(
            "font-normal",
            c.status === "True" ? "border-emerald-500/40 text-emerald-400" : "border-destructive/40 text-destructive",
          )}
        >
          {c.type}
        </Badge>
      ))}
    </div>
  );
}
