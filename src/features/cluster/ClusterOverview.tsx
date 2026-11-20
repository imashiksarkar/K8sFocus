import { useMemo } from "react";
import { R, type KObject } from "@/lib/resources";
import { useWatch } from "@/lib/useWatch";
import { fmtCount, fmtCpuHuman, fmtMemHuman, useMetrics } from "@/lib/metrics";
import { parseQuantity } from "@/lib/k8s";
import { cn } from "@/lib/utils";
import { nodeStatus } from "../nodes/NodesView";
import { podStatus } from "../PodsView";
import { WarningEvents } from "../workloads/overview";
import { ErrorCard } from "@/components/ui/ErrorCard";

type ViewProps = { context: string; namespaces: string[]; navigate?: (key: string) => void };

function podResource(p: KObject, kind: "requests" | "limits", res: "cpu" | "memory") {
  const sum = (p.spec?.containers ?? []).reduce((n: number, c: any) => n + parseQuantity(c.resources?.[kind]?.[res]), 0);
  const init = Math.max(0, ...(p.spec?.initContainers ?? []).map((c: any) => parseQuantity(c.resources?.[kind]?.[res])));
  return Math.max(sum, init);
}
const active = (p: KObject) => !["Succeeded", "Failed"].includes(p.status?.phase);

function Ring({ pct }: { pct: number }) {
  const r = 40, c = 2 * Math.PI * r;
  const v = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
  const color = v > 90 ? "var(--destructive)" : v > 75 ? "var(--primary)" : "#34d399";
  const label = !Number.isFinite(pct) ? "—" : pct > 999 ? ">999%" : `${Math.round(pct)}%`;
  return (
    <svg viewBox="0 0 110 110" className="size-24 shrink-0" role="img" aria-label={`usage ${label}`}>
      <circle cx="55" cy="55" r={r} fill="none" stroke="var(--muted)" strokeWidth="10" />
      {Number.isFinite(pct) && (
        <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 55 55)" />
      )}
      <text x="55" y="55" textAnchor="middle" dominantBaseline="central"
        fontSize={label.length > 4 ? 18 : 22} fontWeight={600} fill="currentColor">{label}</text>
    </svg>
  );
}

function Bar({ label, value, max, fmt }: { label: string; value: number; max: number; fmt: (n: number) => string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span className="shrink-0 text-muted-foreground">{label}</span>
        <span className="tabular-nums whitespace-nowrap">
          <span className="font-medium">{fmt(value)}</span>
          <span className="text-muted-foreground"> / {fmt(max)} · {pct > 999 ? ">999" : Math.round(pct)}%</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full transition-all", pct > 100 ? "bg-destructive" : pct > 75 ? "bg-primary" : "bg-emerald-400")}
          style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

export function ClusterOverview({ context, navigate }: ViewProps) {
  const nodes = useWatch(context, R.nodes);
  const pods = useWatch(context, R.pods);
  const nodeMetrics = useMetrics(context, "nodes");

  const s = useMemo(() => {
    const alloc = { cpu: 0, memory: 0, pods: 0 };
    for (const n of nodes.items) {
      alloc.cpu += parseQuantity(n.status?.allocatable?.cpu);
      alloc.memory += parseQuantity(n.status?.allocatable?.memory);
      alloc.pods += Number(n.status?.allocatable?.pods ?? 0);
    }
    const used = { cpu: 0, memory: 0 };
    for (const u of nodeMetrics.usage.values()) { used.cpu += u.cpu; used.memory += u.memory; }
    const act = pods.items.filter(active);
    const sum = (k: "requests" | "limits", r: "cpu" | "memory") => act.reduce((n, p) => n + podResource(p, k, r), 0);
    const statuses = pods.items.map(podStatus);
    return {
      alloc, used,
      req: { cpu: sum("requests", "cpu"), memory: sum("requests", "memory") },
      lim: { cpu: sum("limits", "cpu"), memory: sum("limits", "memory") },
      podsActive: act.length,
      running: statuses.filter((x) => x === "Running").length,
      pending: statuses.filter((x) => ["Pending", "ContainerCreating", "PodInitializing"].includes(x)).length,
      failing: statuses.filter((x) => !["Running", "Pending", "ContainerCreating", "PodInitializing", "Completed", "Succeeded", "Terminating"].includes(x)).length,
      badNodes: nodes.items.filter((n) => !nodeStatus(n).startsWith("Ready") || nodeStatus(n).includes("Disabled")),
    };
  }, [nodes.items, pods.items, nodeMetrics.usage]);

  const hasMetrics = nodeMetrics.available === true && s.alloc.cpu > 0;
  const ready = nodes.ready && pods.ready;

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
      {!ready && <p className="text-sm text-muted-foreground">Loading cluster data…</p>}
      {(nodes.error || pods.error) && (
        <ErrorCard title="Couldn't load the cluster overview" error={nodes.error ?? pods.error} />
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {(["cpu", "memory"] as const).map((r) => {
          const fmt = r === "cpu" ? fmtCpuHuman : fmtMemHuman;
          const usagePct = hasMetrics && s.alloc[r] > 0 ? (s.used[r] / s.alloc[r]) * 100 : NaN;
          return (
            <section key={r} className="@container min-w-0 rounded-lg border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold">{r === "cpu" ? "CPU" : "Memory"}</h3>
              <div className="flex flex-col items-center gap-4 @md:flex-row @md:items-center @md:gap-6">
                <div className="flex w-32 shrink-0 flex-col items-center text-center">
                  <Ring pct={usagePct} />
                  <span className="mt-1 text-xs font-medium">Usage</span>
                  <span className="text-[11px] leading-tight text-muted-foreground">
                    {hasMetrics ? <>{fmt(s.used[r])}<br />of {fmt(s.alloc[r])}</> : "needs metrics-server"}
                  </span>
                </div>
                <div className="w-full min-w-0 flex-1 space-y-3">
                  {hasMetrics && <Bar label="Usage" value={s.used[r]} max={s.alloc[r]} fmt={fmt} />}
                  <Bar label="Requests" value={s.req[r]} max={s.alloc[r]} fmt={fmt} />
                  <Bar label="Limits" value={s.lim[r]} max={s.alloc[r]} fmt={fmt} />
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Of {fmt(s.alloc[r])} allocatable on {nodes.items.length} node{nodes.items.length === 1 ? "" : "s"}.
                    {s.lim[r] > s.alloc[r] && <> Limits exceed capacity (overcommitted).</>}
                  </p>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Nodes" value={fmtCount(nodes.items.length)} sub={s.badNodes.length ? `${s.badNodes.length} need attention` : "all ready"}
          bad={s.badNodes.length > 0} onClick={() => navigate?.("Nodes/Nodes")} />
        <Stat label="Pods" value={<>{fmtCount(s.podsActive)}<span className="text-base font-medium text-muted-foreground"> / {fmtCount(s.alloc.pods)}</span></>} sub="active / capacity" onClick={() => navigate?.("Workloads/Pods")} />
        <Stat label="Running" value={fmtCount(s.running)} sub={`${s.pending} pending`} onClick={() => navigate?.("Workloads/Pods")} />
        <Stat label="Failing pods" value={fmtCount(s.failing)} sub="CrashLoop, ImagePull…" bad={s.failing > 0} onClick={() => navigate?.("Workloads/Overview")} />
      </div>

      {s.badNodes.length > 0 && (
        <section className="rounded-lg border border-primary/40 bg-card">
          <h3 className="border-b px-4 py-2 text-sm font-medium">Nodes needing attention</h3>
          <ul className="divide-y text-sm">
            {s.badNodes.map((n) => (
              <li key={n.metadata.uid} className="flex justify-between gap-3 px-4 py-2">
                <span className="min-w-0 truncate" title={n.metadata.name}>{n.metadata.name}</span>
                <span className="shrink-0 text-primary">{nodeStatus(n)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <WarningEvents context={context} namespaces={[]} />
    </div>
  );
}

function Stat({ label, value, sub, bad, onClick }: { label: string; value: React.ReactNode; sub: string; bad?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="min-w-0 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/60">
      <div className="truncate text-xs font-medium text-muted-foreground">{label}</div>
      <div className={cn("mt-1 truncate text-2xl font-semibold tabular-nums", bad && "text-primary")}>{value}</div>
      <div className="truncate text-[11px] text-muted-foreground" title={sub}>{sub}</div>
    </button>
  );
}
