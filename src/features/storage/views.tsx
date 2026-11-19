import { Badge } from "@/components/ui/badge";
import { Conditions, Fields, Section } from "@/components/details/parts";
import { col, simpleView } from "@/components/resource-view/simple";
import { R } from "@/lib/resources";
import { cn } from "@/lib/utils";

const phase = (v: string) => (
  <span className={cn(v === "Bound" ? "text-emerald-400" : v === "Available" ? "text-muted-foreground" : v === "Pending" ? "text-primary" : "text-destructive")}>{v}</span>
);

export const PVCsView = simpleView(R.pvcs, [
  col("storageClass", "Storage Class", (o) => o.spec?.storageClassName ?? ""),
  col("size", "Size", (o) => o.status?.capacity?.storage ?? o.spec?.resources?.requests?.storage ?? ""),
  col("access", "Access", (o) => (o.spec?.accessModes ?? []).join(", ")),
  col("volume", "Volume", (o) => o.spec?.volumeName ?? ""),
  col("status", "Status", (o) => o.status?.phase ?? "", phase),
], {
  details: (o) => (
    <Section title="Claim">
      <Fields rows={[
        ["Status", o.status?.phase],
        ["Volume", o.spec?.volumeName],
        ["Requested", o.spec?.resources?.requests?.storage],
        ["Capacity", o.status?.capacity?.storage],
        ["Access modes", (o.spec?.accessModes ?? []).join(", ")],
        ["Volume mode", o.spec?.volumeMode],
        ["Storage class", o.spec?.storageClassName],
        ["Conditions", o.status?.conditions && <Conditions items={o.status.conditions} />],
      ]} />
    </Section>
  ),
});

export const PVsView = simpleView(R.pvs, [
  col("storageClass", "Storage Class", (o) => o.spec?.storageClassName ?? ""),
  col("capacity", "Capacity", (o) => o.spec?.capacity?.storage ?? ""),
  col("claim", "Claim", (o) => (o.spec?.claimRef ? `${o.spec.claimRef.namespace}/${o.spec.claimRef.name}` : "")),
  col("reclaim", "Reclaim", (o) => o.spec?.persistentVolumeReclaimPolicy ?? "",
    (v) => <span className={cn(v === "Delete" && "text-primary")}>{v}</span>),
  col("status", "Status", (o) => o.status?.phase ?? "", phase),
], {
  details: (o) => {
    const src = Object.keys(o.spec ?? {}).find((k) => ["csi", "hostPath", "nfs", "local", "awsElasticBlockStore", "gcePersistentDisk", "azureDisk"].includes(k));
    return (
      <Section title="Volume">
        <Fields rows={[
          ["Status", o.status?.phase],
          ["Capacity", o.spec?.capacity?.storage],
          ["Access modes", (o.spec?.accessModes ?? []).join(", ")],
          ["Reclaim policy", o.spec?.persistentVolumeReclaimPolicy],
          ["Claim", o.spec?.claimRef && `${o.spec.claimRef.namespace}/${o.spec.claimRef.name}`],
          ["Source", src && `${src}: ${o.spec[src].driver ?? o.spec[src].path ?? o.spec[src].server ?? ""} ${o.spec[src].volumeHandle ?? ""}`],
        ]} />
      </Section>
    );
  },
});

export const StorageClassesView = simpleView(R.storageclasses, [
  col("provisioner", "Provisioner", (o: any) => o.provisioner ?? ""),
  col("reclaim", "Reclaim", (o: any) => o.reclaimPolicy ?? "Delete"),
  col("binding", "Binding Mode", (o: any) => o.volumeBindingMode ?? "Immediate"),
  col("expansion", "Expansion", (o: any) => String(!!o.allowVolumeExpansion)),
  col("default", "Default", (o) => o.metadata.annotations?.["storageclass.kubernetes.io/is-default-class"] === "true",
    (v) => (v ? <Badge>default</Badge> : "")),
], {
  details: (o: any) => (
    <Section title="Parameters">
      <Fields rows={Object.entries(o.parameters ?? {}).map(([k, v]) => [k, String(v)])} />
    </Section>
  ),
});
