import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Conditions, Fields, Section } from "@/components/details/parts";
import { col, simpleView } from "@/components/resource-view/simple";
import { ResourceView } from "@/components/resource-view/ResourceView";
import { commonColumns } from "@/components/resource-table/columns";
import { age } from "@/lib/k8s";
import { jsonPath } from "@/lib/jsonpath";
import { R, type KObject, type ResourceRef } from "@/lib/resources";

/** Served version to use for a CRD: storage version if served, else first served. */
export function crdVersion(crd: KObject) {
  const vs: any[] = crd.spec?.versions ?? [];
  return vs.find((v) => v.storage && v.served) ?? vs.find((v) => v.served) ?? vs[0];
}

export function crdResource(crd: KObject): ResourceRef {
  return {
    group: crd.spec.group,
    version: crdVersion(crd)?.name,
    kind: crd.spec.names.kind,
    plural: crd.spec.names.plural,
    namespaced: crd.spec.scope === "Namespaced",
  };
}

export const CRDsView = simpleView(R.crds, [
  col("group", "Group", (o) => o.spec?.group ?? ""),
  col("kind", "Kind", (o) => o.spec?.names?.kind ?? ""),
  col("version", "Version", (o) => crdVersion(o)?.name ?? ""),
  col("scope", "Scope", (o) => o.spec?.scope ?? ""),
], {
  details: (o) => (
    <Section title="Definition">
      <Fields rows={[
        ["Group", o.spec?.group],
        ["Kind", o.spec?.names?.kind],
        ["Plural / singular", `${o.spec?.names?.plural} / ${o.spec?.names?.singular}`],
        ["Short names", o.spec?.names?.shortNames?.join(", ")],
        ["Categories", o.spec?.names?.categories?.join(", ")],
        ["Scope", o.spec?.scope],
        ["Versions", (
          <div className="flex flex-wrap gap-1">
            {(o.spec?.versions ?? []).map((v: any) => (
              <Badge key={v.name} variant={v.storage ? "default" : "secondary"} className="font-normal">
                {v.name}{v.storage ? " (storage)" : ""}{!v.served ? " (not served)" : ""}{v.deprecated ? " deprecated" : ""}
              </Badge>
            ))}
          </div>
        )],
        ["Conditions", <Conditions items={o.status?.conditions} />],
      ]} />
    </Section>
  ),
});

function printerValue(v: unknown[], type: string): string {
  if (!v.length) return "";
  const s = v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(",");
  return type === "date" ? s : s;
}

/** Live table for any custom resource, using the CRD's additionalPrinterColumns. */
export function CustomResourceView({ crd, ...p }: { crd: KObject; context: string; namespaces: string[] }) {
  const resource = useMemo(() => crdResource(crd), [crd]);
  const printer: any[] = crdVersion(crd)?.additionalPrinterColumns ?? [];
  const columns = useMemo(() => {
    const k = commonColumns<KObject>();
    const extra: ColumnDef<KObject, any>[] = printer
      .filter((c) => c.jsonPath !== ".metadata.creationTimestamp")
      .map((c) => col(`pc:${c.name}`, c.name, (o) => printerValue(jsonPath(o, c.jsonPath), c.type),
        c.type === "date" ? (v) => (v ? age(v) : "") : undefined));
    return [k.name, ...(resource.namespaced ? [k.namespace] : []), ...extra, k.age];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crd.metadata.resourceVersion]);

  return (
    <ResourceView {...p} resource={resource} columns={columns}
      details={(o) => (
        <>
          {printer.length > 0 && (
            <Section title="Summary">
              <Fields rows={printer.map((c) => [c.name, printerValue(jsonPath(o, c.jsonPath), c.type)])} />
            </Section>
          )}
          {o.status?.conditions && <Section title="Conditions"><Conditions items={o.status.conditions} /></Section>}
          <Section title="Spec">
            <pre className="max-h-96 overflow-auto rounded-md bg-muted p-2 text-xs select-text">{JSON.stringify(o.spec ?? {}, null, 2)}</pre>
          </Section>
        </>
      )} />
  );
}
