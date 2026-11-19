import { useMemo } from "react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { commonColumns } from "@/components/resource-table/columns";
import { ResourceView } from "@/components/resource-view/ResourceView";
import { R, type KObject, type ResourceRef } from "@/lib/resources";
import { cn } from "@/lib/utils";
import { RestartButton, ScaleButton } from "./actions";
import { DeploymentHistory, WorkloadPods, WorkloadSummary } from "./details";

type ViewProps = { context: string; namespaces: string[] };
const c = createColumnHelper<KObject>();

const ratio = (id: string, header: string, ready: (o: KObject) => number, want: (o: KObject) => number) =>
  c.accessor(ready, {
    id, header,
    cell: (i) => {
      const w = want(i.row.original);
      return <span className={cn(i.getValue() < w && "text-primary")}>{i.getValue()}/{w}</span>;
    },
  }) as ColumnDef<KObject, any>;

const num = (id: string, header: string, f: (o: KObject) => number | undefined) =>
  c.accessor((o) => f(o) ?? 0, { id, header }) as ColumnDef<KObject, any>;

const conditions = c.accessor(
  (o) => (o.status?.conditions ?? []).filter((x: any) => x.status === "True").map((x: any) => x.type).join(" "),
  {
    id: "conditions", header: "Conditions",
    cell: (i) => <span className="text-muted-foreground">{i.getValue()}</span>,
  },
) as ColumnDef<KObject, any>;

function details(resource: ResourceRef) {
  return (o: KObject) => (
    <>
      <WorkloadSummary obj={o} />
      {resource.kind === "Deployment" && <DeploymentHistory deployment={o} />}
      <WorkloadPods obj={o} />
    </>
  );
}

export function DeploymentsView(p: ViewProps) {
  const columns = useMemo(() => {
    const k = commonColumns<KObject>();
    return [
      k.name, k.namespace,
      ratio("pods", "Pods", (o) => o.status?.readyReplicas ?? 0, (o) => o.spec?.replicas ?? 0),
      num("replicas", "Replicas", (o) => o.spec?.replicas),
      num("upToDate", "Up-to-date", (o) => o.status?.updatedReplicas),
      num("available", "Available", (o) => o.status?.availableReplicas),
      k.age, conditions,
    ];
  }, []);
  return (
    <ResourceView {...p} resource={R.deployments} columns={columns} details={details(R.deployments)}
      actions={(o) => <><ScaleButton resource={R.deployments} obj={o} /><RestartButton resource={R.deployments} obj={o} /></>} />
  );
}

export function StatefulSetsView(p: ViewProps) {
  const columns = useMemo(() => {
    const k = commonColumns<KObject>();
    return [
      k.name, k.namespace,
      ratio("pods", "Pods", (o) => o.status?.readyReplicas ?? 0, (o) => o.spec?.replicas ?? 0),
      num("replicas", "Replicas", (o) => o.spec?.replicas),
      k.age,
    ];
  }, []);
  return (
    <ResourceView {...p} resource={R.statefulsets} columns={columns} details={details(R.statefulsets)}
      actions={(o) => <><ScaleButton resource={R.statefulsets} obj={o} /><RestartButton resource={R.statefulsets} obj={o} /></>} />
  );
}

export function DaemonSetsView(p: ViewProps) {
  const columns = useMemo(() => {
    const k = commonColumns<KObject>();
    return [
      k.name, k.namespace,
      ratio("pods", "Pods", (o) => o.status?.numberReady ?? 0, (o) => o.status?.desiredNumberScheduled ?? 0),
      num("current", "Current", (o) => o.status?.currentNumberScheduled),
      num("upToDate", "Up-to-date", (o) => o.status?.updatedNumberScheduled),
      num("available", "Available", (o) => o.status?.numberAvailable),
      c.accessor((o) => Object.entries(o.spec?.template?.spec?.nodeSelector ?? {}).map(([a, b]) => `${a}=${b}`).join(", "),
        { id: "nodeSelector", header: "Node Selector" }) as ColumnDef<KObject, any>,
      k.age,
    ];
  }, []);
  return (
    <ResourceView {...p} resource={R.daemonsets} columns={columns} details={details(R.daemonsets)}
      actions={(o) => <RestartButton resource={R.daemonsets} obj={o} />} />
  );
}

export function ReplicaSetsView(p: ViewProps) {
  const columns = useMemo(() => {
    const k = commonColumns<KObject>();
    return [
      k.name, k.namespace,
      num("desired", "Desired", (o) => o.spec?.replicas),
      num("current", "Current", (o) => o.status?.replicas),
      num("ready", "Ready", (o) => o.status?.readyReplicas),
      c.accessor((o) => o.metadata.ownerReferences?.map((r) => `${r.kind}/${r.name}`).join(", ") ?? "",
        { id: "owner", header: "Controlled By", cell: (i) => <span className="text-muted-foreground">{i.getValue()}</span> }) as ColumnDef<KObject, any>,
      k.age,
    ];
  }, []);
  return (
    <ResourceView {...p} resource={R.replicasets} columns={columns} details={details(R.replicasets)}
      actions={(o) => <ScaleButton resource={R.replicasets} obj={o} />} />
  );
}
