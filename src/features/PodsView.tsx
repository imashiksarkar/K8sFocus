import { useMemo } from "react";
import { PodDetails } from "./PodDetails";
import { ResourceView } from "@/components/resource-view/ResourceView";
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

function podColumns(): ColumnDef<KObject, any>[] {
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
  const columns = useMemo(podColumns, []);
  return (
    <ResourceView
      context={context}
      namespaces={namespaces}
      resource={R.pods}
      columns={columns}
      details={(p) => <PodDetails pod={p} />}
    />
  );
}
