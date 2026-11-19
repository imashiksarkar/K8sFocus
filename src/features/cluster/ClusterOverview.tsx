import { useMemo } from "react";
import { R, type KObject } from "@/lib/resources";
import { useWatch } from "@/lib/useWatch";
import { fmtCpu, fmtMem, useMetrics } from "@/lib/metrics";
import { parseQuantity } from "@/lib/k8s";
import { cn } from "@/lib/utils";
import { nodeStatus } from "../nodes/NodesView";
import { podStatus } from "../PodsView";
import { WarningEvents } from "../workloads/overview";

type ViewProps = { context: string; namespaces: string[]; navigate?: (key: string) => void };

/** Sum container requests/limits of a pod for a resource (init containers: max, like the scheduler). */
function podResource(p: KObject, kind: "requests" | "limits", res: "cpu" | "memory") {
  const sum = (p.spec?.containers ?? []).reduce((n: number, c: any) => n + parseQuantity(c.resources?.[kind]?.[res]), 0);
  const init = Math.max(0, ...(p.spec?.initContainers ?? []).map((c: any) => parseQuantity(c.resources?.[kind]?.[res])));
  return Math.max(sum, init);
}
const active = (p: KObject) => !["Succeeded", "Failed"].includes(p.status?.phase);

function Ring({ pct, label, sub }: { pct: number; label: string; sub: string }) {
  const r = 42, c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, pct));
  const color = v > 90 ? "var(--destructive)" : v > 75 ? "var(--primary)" : "#34d399";
  return (
    <div className="flex flex-col items-center">
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} fill="none" stroke="var(--muted)" strokeWidth="10" />
        <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 55 55)" />
        <text x="55" y="60" textAnchor="middle" className="fill-foreground text-lg font-semibold">{isNaN(pct) ? "—" : `${pct.toFixed(0)}%`}</text>
      </svg>
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </div>
  );
}

function Bar({ label, value, max, fmt }: { label: string; value: number; max: number; fmt: (n: number) => string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{fmt(value)} / {fmt(max)} <span className="text-muted-foreground">({pct.toFixed(0)}%)</span></span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full", pct > 100 ? "bg-destructive" : pct > 75 ? "bg-primary" : "bg-emerald-400")} style={{ width: `${Math.min(100, pct)}%` }} />
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

  const hasMetrics = nodeMetrics.available === true;
  const ready = nodes.ready && pods.ready;

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
      {!ready && <p className="text-sm text-muted-foreground">Loading cluster data…</p>}
      {(nodes.error || pods.error) && <p className="rounded-md bg-destructive/15 p-2 text-xs text-destructive">{nodes.error ?? pods.error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {(["cpu", "memory"] as const).map((r) => {
          const fmt = r === "cpu" ? (n: number) => `${fmtCpu(n)}${n >= 1 ? " cores" : ""}` : fmtMem;
          return (
            <section key={r} className="rounded-lg border bg-card p-4">
              <h3 className="mb-3 text-sm font-medium">{r === "cpu" ? "CPU" : "Memory"}</h3>
              <div className="flex items-center gap-6">
                <Ring pct={hasMetrics ? (s.used[r] / s.alloc[r]) * 100 : NaN} label="Usage"
                  sub={hasMetrics ? `${fmt(s.used[r])} of ${fmt(s.alloc[r])}` : "metrics-server needed"} />
                <div className="min-w-0 flex-1 space-y-3">
                  {hasMetrics && <Bar label="Usage" value={s.used[r]} max={s.alloc[r]} fmt={fmt} />}
                  <Bar label="Requests" value={s.req[r]} max={s.alloc[r]} fmt={fmt} />
                  <Bar label="Limits" value={s.lim[r]} max={s.alloc[r]} fmt={fmt} />
                  <p className="text-xs text-muted-foreground">Allocatable across {nodes.items.length} node(s). Limits above 100% means overcommitted.</p>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Nodes" value={nodes.items.length} sub={s.badNodes.length ? `${s.badNodes.length} need attention` : "all ready"}
          bad={s.badNodes.length > 0} onClick={() => navigate?.("Nodes/Nodes")} />
        <Stat label="Pods" value={`${s.podsActive} / ${s.alloc.pods}`} sub="active / capacity" onClick={() => navigate?.("Workloads/Pods")} />
        <Stat label="Running" value={s.running} sub={`${s.pending} pending`} onClick={() => navigate?.("Workloads/Pods")} />
        <Stat label="Failing pods" value={s.failing} sub="CrashLoop, ImagePull, Error…" bad={s.failing > 0} onClick={() => navigate?.("Workloads/Overview")} />
      </div>

      {s.badNodes.length > 0 && (
        <section className="rounded-lg border border-primary/40 bg-card">
          <h3 className="border-b px-4 py-2 text-sm font-medium">Nodes needing attention</h3>
          <ul className="divide-y text-sm">
            {s.badNodes.map((n) => (
              <li key={n.metadata.uid} className="flex justify-between px-4 py-2">
                <span>{n.metadata.name}</span><span className="text-primary">{nodeStatus(n)}</span>
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
    <button onClick={onClick} className="rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/60">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-2xl font-semibold tabular-nums", bad && "text-primary")}>{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </button>
  );
}
