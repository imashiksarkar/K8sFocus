import { useMemo } from "react";
import { PodDetails } from "./PodDetails";
import { ResourceView } from "@/components/resource-view/ResourceView";
import { ScrollText, SquareTerminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCluster } from "@/lib/cluster-context";
import { fmtCpu, fmtMem, useMetrics, type MetricsSnapshot } from "@/lib/metrics";
import { Sparkline } from "@/components/metrics/Sparkline";
import { MetricsHint } from "@/components/metrics/MetricsHint";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { commonColumns } from "@/components/resource-table/columns";
import { R, type KObject } from "@/lib/resources";
import { cn } from "@/lib/utils";

/** Status the way kubectl/Lens show it (CrashLoopBackOff, Terminating, ...). */
export function podStatus(p: KObject): string {
  if (p.metadata.deletionTimestamp) return "Terminating";
  const cs: any[] = p.status?.containerStatuses ?? [];
  for (const c of cs) {
    if (c.state?.waiting?.reason) return c.state.waiting.reason;
    if (c.state?.terminated?.reason && p.status?.phase !== "Succeeded") return c.state.terminated.reason;
  }
  return p.status?.reason ?? p.status?.phase ?? "Unknown";
}

const statusColor = (s: string) =>
  s === "Running" ? "text-emerald-400"
  : s === "Succeeded" || s === "Completed" ? "text-muted-foreground"
  : s === "Pending" || s === "ContainerCreating" || s === "PodInitializing" || s === "Terminating" ? "text-primary"
  : "text-destructive";

const containers = (p: KObject): any[] => p.status?.containerStatuses ?? [];
const restarts = (p: KObject) => containers(p).reduce((n, c) => n + (c.restartCount ?? 0), 0);

function podColumns(m: MetricsSnapshot): ColumnDef<KObject, any>[] {
  const c = createColumnHelper<KObject>();
  const common = commonColumns<KObject>();
  return [
    common.name,
    common.namespace,
    c.accessor((p) => containers(p).filter((x) => x.ready).length, {
      id: "ready", header: "Ready",
      cell: (i) => `${i.getValue()}/${i.row.original.spec?.containers?.length ?? 0}`,
    }),
    c.accessor(restarts, {
      id: "restarts", header: "Restarts",
      cell: (i) => <span className={cn(i.getValue() > 0 && "text-primary")}>{i.getValue()}</span>,
    }),
    c.accessor((p) => p.metadata.labels?.["app.kubernetes.io/name"] ?? p.metadata.labels?.app ?? "", {
      id: "controlledBy", header: "Controlled By",
      cell: (i) => {
        const o = i.row.original.metadata as any;
        const ref = o.ownerReferences?.[0];
        return <span className="text-muted-foreground">{ref ? `${ref.kind}` : ""}</span>;
      },
    }),
    c.accessor((p) => m.usage.get(`${p.metadata.namespace}/${p.metadata.name}`)?.cpu ?? -1, {
      id: "cpu", header: "CPU", sortDescFirst: true,
      cell: (i) => i.getValue() < 0 ? <span className="text-muted-foreground">—</span> : (
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <Sparkline data={m.history.get(`${i.row.original.metadata.namespace}/${i.row.original.metadata.name}`)?.cpu ?? []} />
          {fmtCpu(i.getValue())}
        </span>
      ),
    }),
    c.accessor((p) => m.usage.get(`${p.metadata.namespace}/${p.metadata.name}`)?.memory ?? -1, {
      id: "memory", header: "Memory", sortDescFirst: true,
      cell: (i) => i.getValue() < 0 ? <span className="text-muted-foreground">—</span> : (
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <Sparkline data={m.history.get(`${i.row.original.metadata.namespace}/${i.row.original.metadata.name}`)?.memory ?? []} />
          {fmtMem(i.getValue())}
        </span>
      ),
    }),
    c.accessor((p) => p.spec?.nodeName ?? "", {
      id: "node", header: "Node", cell: (i) => <span className="text-muted-foreground">{i.getValue()}</span>,
    }),
    c.accessor((p) => p.status?.qosClass ?? "", { id: "qos", header: "QoS" }),
    common.age,
    c.accessor(podStatus, {
      id: "status", header: "Status",
      cell: (i) => <span className={statusColor(i.getValue())}>{i.getValue()}</span>,
    }),
  ];
}

export function PodsView({ context, namespaces }: { context: string; namespaces: string[] }) {
  const metrics = useMetrics(context, "pods");
  const columns = useMemo(() => podColumns(metrics), [metrics]);
  return (
    <ResourceView
      context={context}
      namespaces={namespaces}
      resource={R.pods}
      columns={columns}
      details={(p) => <PodDetails pod={p} />}
      actions={(p) => <><ShellButton pod={p} /><LogsButton pod={p} /></>}
      toolbar={<MetricsHint m={metrics} />}
    />
  );
}

function LogsButton({ pod }: { pod: KObject }) {
  const { openLogs } = useCluster();
  return (
    <Button variant="ghost" size="icon" className="size-7" title="Logs" onClick={() => openLogs(pod)}>
      <ScrollText />
    </Button>
  );
}

function ShellButton({ pod }: { pod: KObject }) {
  const { openShell, readOnly } = useCluster();
  const running = pod.status?.phase === "Running";
  return (
    <Button variant="ghost" size="icon" className="size-7" disabled={readOnly || !running}
      title={readOnly ? "Cluster is read-only (a shell can change the container)" : !running ? "Pod is not running" : "Shell"}
      onClick={() => openShell(pod)}>
      <SquareTerminal />
    </Button>
  );
}
