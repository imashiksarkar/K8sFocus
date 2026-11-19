import { useMemo, type ReactNode } from "react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { commonColumns } from "@/components/resource-table/columns";
import type { KObject, ResourceRef } from "@/lib/resources";
import { ResourceView } from "./ResourceView";

const helper = createColumnHelper<KObject>();

/** Column shorthand: col("id", "Header", o => value, optional cell renderer). */
export function col(id: string, header: string, get: (o: KObject) => any, cell?: (v: any, o: KObject) => ReactNode) {
  return helper.accessor(get, {
    id, header,
    cell: cell ? (i) => cell(i.getValue(), i.row.original) : (i) => String(i.getValue() ?? ""),
  }) as ColumnDef<KObject, any>;
}

/** Build a standard view: Name [Namespace] ...extra... Age. */
export function simpleView(resource: ResourceRef, extra: ColumnDef<KObject, any>[] = [], opts: {
  details?: (o: KObject) => ReactNode;
  actions?: (o: KObject) => ReactNode;
} = {}) {
  return function View(p: { context: string; namespaces: string[] }) {
    const columns = useMemo(() => {
      const k = commonColumns<KObject>();
      return [k.name, ...(resource.namespaced ? [k.namespace] : []), ...extra, k.age];
    }, []);
    return <ResourceView {...p} resource={resource} columns={columns} details={opts.details} actions={opts.actions} />;
  };
}
