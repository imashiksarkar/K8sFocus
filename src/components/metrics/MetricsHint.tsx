import type { MetricsSnapshot } from "@/lib/metrics";

/** Small toolbar note when metrics-server is missing. */
export function MetricsHint({ m }: { m: MetricsSnapshot }) {
  if (m.available !== false) return null;
  return (
    <span className="text-xs text-muted-foreground" title={m.error}>
      · CPU/memory unavailable (metrics-server not installed)
    </span>
  );
}
