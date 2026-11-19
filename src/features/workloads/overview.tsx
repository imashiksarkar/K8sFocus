import { useMemo } from "react";
import { R, type KObject, type ResourceRef } from "@/lib/resources";
import { useWatch } from "@/lib/useWatch";
import { age } from "@/lib/k8s";
import { cn } from "@/lib/utils";
import { podStatus } from "../PodsView";
import { jobStatus } from "./batch";

type ViewProps = { context: string; namespaces: string[]; navigate?: (key: string) => void };
type Bucket = "ok" | "progress" | "bad" | "idle";
const COLORS: Record<Bucket, string> = {
  ok: "bg-emerald-400", progress: "bg-primary", bad: "bg-destructive", idle: "bg-muted-foreground/40",
};
const LABELS: Record<Bucket, string> = { ok: "OK", progress: "In progress", bad: "Failing", idle: "Idle" };

function podBucket(p: KObject): Bucket {
  const s = podStatus(p);
  if (s === "Running") {
    const cs: any[] = p.status?.containerStatuses ?? [];
    return cs.every((c) => c.ready) ? "ok" : "progress";
  }
  if (s === "Succeeded" || s === "Completed") return "idle";
  if (["Pending", "ContainerCreating", "PodInitializing", "Terminating"].includes(s)) return "progress";
  return "bad";
}
const replicaBucket = (ready = 0, want = 0): Bucket => (want === 0 ? "idle" : ready >= want ? "ok" : ready === 0 ? "bad" : "progress");

const KINDS: { key: string; label: string; res: ResourceRef; bucket: (o: KObject) => Bucket }[] = [
  { key: "Workloads/Pods", label: "Pods", res: R.pods, bucket: podBucket },
  { key: "Workloads/Deployments", label: "Deployments", res: R.deployments, bucket: (o) => replicaBucket(o.status?.readyReplicas, o.spec?.replicas) },
  { key: "Workloads/StatefulSets", label: "StatefulSets", res: R.statefulsets, bucket: (o) => replicaBucket(o.status?.readyReplicas, o.spec?.replicas) },
  { key: "Workloads/DaemonSets", label: "DaemonSets", res: R.daemonsets, bucket: (o) => replicaBucket(o.status?.numberReady, o.status?.desiredNumberScheduled) },
  { key: "Workloads/ReplicaSets", label: "ReplicaSets", res: R.replicasets, bucket: (o) => replicaBucket(o.status?.readyReplicas, o.spec?.replicas) },
  {
    key: "Workloads/Jobs", label: "Jobs", res: R.jobs,
    bucket: (o) => ({ Complete: "ok", Failed: "bad", Running: "progress", Suspended: "idle" } as const)[jobStatus(o)],
  },
  { key: "Workloads/CronJobs", label: "CronJobs", res: R.cronjobs, bucket: (o) => (o.spec?.suspend ? "idle" : "ok") },
];

function KindCard({ context, namespaces, kind, navigate }: ViewProps & { kind: (typeof KINDS)[number] }) {
  const { items, ready, error } = useWatch(context, kind.res, namespaces);
  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { ok: 0, progress: 0, bad: 0, idle: 0 };
    items.forEach((o) => c[kind.bucket(o)]++);
    return c;
  }, [items, kind]);
  const total = items.length;
  return (
    <button onClick={() => navigate?.(kind.key)}
      className="rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/60">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{kind.label}</span>
        <span className="text-2xl font-semibold tabular-nums">{ready ? total : "…"}</span>
      </div>
      {error ? <p className="mt-2 truncate text-xs text-destructive" title={error}>{error}</p> : (
        <>
          <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-muted">
            {(Object.keys(counts) as Bucket[]).map((b) => counts[b] > 0 && (
              <div key={b} className={COLORS[b]} style={{ width: `${(counts[b] / total) * 100}%` }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            {(Object.keys(counts) as Bucket[]).filter((b) => counts[b] > 0).map((b) => (
              <span key={b} className="flex items-center gap-1">
                <span className={cn("size-1.5 rounded-full", COLORS[b])} />{counts[b]} {LABELS[b]}
              </span>
            ))}
          </div>
        </>
      )}
    </button>
  );
}

function WarningEvents({ context, namespaces }: ViewProps) {
  const { items, ready } = useWatch(context, R.events, namespaces);
  const warnings = useMemo(
    () => items.filter((e: any) => e.type === "Warning")
      .sort((a: any, b: any) => t(b).localeCompare(t(a))).slice(0, 100),
    [items],
  );
  return (
    <section className="rounded-lg border bg-card">
      <h3 className="border-b px-4 py-2 text-sm font-medium">Warning events {ready && <span className="text-muted-foreground">({warnings.length})</span>}</h3>
      {ready && !warnings.length && <p className="p-4 text-sm text-muted-foreground">No warnings. 🎉</p>}
      <ul className="divide-y text-sm">
        {warnings.map((e: any) => (
          <li key={e.metadata.uid} className="flex gap-3 px-4 py-2">
            <span className="w-14 shrink-0 text-xs text-muted-foreground">{age(t(e))}</span>
            <div className="min-w-0 flex-1">
              <div className="text-xs">
                <span className="font-semibold text-primary">{e.reason}</span>{" "}
                <span className="text-muted-foreground">{e.involvedObject?.kind}/{e.involvedObject?.name} · {e.metadata.namespace}</span>
                {e.count > 1 && <span className="text-muted-foreground"> · ×{e.count}</span>}
              </div>
              <p className="break-words select-text">{e.message}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
const t = (e: any): string => e.lastTimestamp ?? e.eventTime ?? e.metadata?.creationTimestamp ?? "";

export function WorkloadsOverview(p: ViewProps) {
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {KINDS.map((k) => <KindCard key={k.key} {...p} kind={k} />)}
      </div>
      <WarningEvents {...p} />
    </div>
  );
}
