/** Tiny inline trend line (no axes). */
export function Sparkline({ data, width = 48, height = 14 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return <span style={{ width }} className="inline-block" />;
  const max = Math.max(...data) || 1;
  const min = Math.min(...data);
  const range = max - min || max || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - 1 - ((v - min) / range) * (height - 2)}`).join(" ");
  return (
    <svg width={width} height={height} className="inline-block overflow-visible align-middle">
      <polyline points={pts} fill="none" stroke="var(--primary)" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}

/** Horizontal usage bar; turns yellow > 75%, red > 90%. */
export function UsageBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = pct > 90 ? "bg-destructive" : pct > 75 ? "bg-primary" : "bg-emerald-400";
  return (
    <span className="inline-flex items-center gap-2" title={label}>
      <span className="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <span className={`block h-full ${color}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular-nums">{max > 0 ? `${pct.toFixed(0)}%` : "—"}</span>
    </span>
  );
}
