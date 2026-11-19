import { useCallback, useMemo, useState } from "react";
import { DetailsPanel } from "@/components/details/DetailsPanel";
import { PodDetails } from "./PodDetails";
import { ObjectActions } from "@/components/details/ObjectActions";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { ResourceTable } from "@/components/resource-table/ResourceTable";
import { commonColumns, kobjectId, searchKObject } from "@/components/resource-table/columns";
import { R, refOf, type KObject } from "@/lib/resources";
import { useWatch } from "@/lib/useWatch";
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

/** Live, read-only pods list. */
export function PodsView({ context, namespaces }: { context: string; namespaces: string[] }) {
  const { items, ready, error } = useWatch(context, R.pods, namespaces);
  const columns = useMemo(podColumns, []);
  const [selected, setSelected] = useState<string>();
  const close = useCallback(() => setSelected(undefined), []);
  // live copy from the watch; disappears (panel closes) if the pod is deleted
  const pod = selected ? items.find((p) => p.metadata.uid === selected) : undefined;

  return (
    <div className="flex min-h-0 flex-1">
      <ResourceTable
        id="pods"
        items={items}
        columns={columns}
        getRowId={kobjectId}
        searchText={searchKObject}
        ready={ready}
        error={error}
        defaultSort={[{ id: "namespace", desc: false }, { id: "name", desc: false }]}
        onRowClick={(p) => setSelected(p.metadata.uid === selected ? undefined : p.metadata.uid)}
        selectedRowId={selected}
      />
      <DetailsPanel
        context={context}
        object={pod && { kind: "Pod", ...pod }}
        onClose={close}
        actions={pod && <ObjectActions obj={refOf(R.pods, pod)} />}
      >
        {pod && <PodDetails pod={pod} />}
      </DetailsPanel>
    </div>
  );
}
