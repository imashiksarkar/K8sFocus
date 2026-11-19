import { useMemo } from "react";
import { age } from "@/lib/k8s";
import { R, type KObject } from "@/lib/resources";
import { useWatch } from "@/lib/useWatch";
import { cn } from "@/lib/utils";

/** Live events whose involvedObject is this object (server-side field selector). */
export function ObjectEvents({ context, object }: { context: string; object: KObject }) {
  const ns = object.metadata.namespace;
  const { items, ready, error } = useWatch(context, R.events, ns ? [ns] : [], {
    fieldSelector: `involvedObject.uid=${object.metadata.uid}`,
  });
  const sorted = useMemo(
    () => [...items].sort((a: any, b: any) => time(b).localeCompare(time(a))),
    [items],
  );
  if (error) return <p className="text-xs text-destructive">{error}</p>;
  if (!ready) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!sorted.length) return <p className="text-sm text-muted-foreground">No events.</p>;
  return (
    <ul className="space-y-2">
      {sorted.map((e: any) => (
        <li key={e.metadata.uid} className="rounded-md border p-2 text-sm">
          <div className="flex items-center gap-2 text-xs">
            <span className={cn("font-semibold", e.type === "Warning" ? "text-primary" : "text-muted-foreground")}>
              {e.reason}
            </span>
            <span className="text-muted-foreground">
              {e.count > 1 ? `×${e.count} · ` : ""}{age(time(e))} ago
            </span>
            <span className="ml-auto truncate text-muted-foreground">{e.source?.component ?? e.reportingComponent}</span>
          </div>
          <p className="mt-1 break-words select-text">{e.message}</p>
        </li>
      ))}
    </ul>
  );
}

function time(e: any): string {
  return e.lastTimestamp ?? e.eventTime ?? e.metadata?.creationTimestamp ?? "";
}
