import { useCallback, useState, type ReactNode } from "react";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { ResourceTable } from "@/components/resource-table/ResourceTable";
import { kobjectId, searchKObject } from "@/components/resource-table/columns";
import { DetailsPanel } from "@/components/details/DetailsPanel";
import { ObjectActions } from "@/components/details/ObjectActions";
import { refOf, type KObject, type ResourceRef } from "@/lib/resources";
import { useWatch } from "@/lib/useWatch";

export type ResourceViewProps = {
  context: string;
  namespaces: string[];
  resource: ResourceRef;
  columns: ColumnDef<KObject, any>[];
  defaultSort?: SortingState;
  /** Resource-specific sections in the details panel. */
  details?: (o: KObject) => ReactNode;
  /** Extra header buttons in the details panel (scale, restart, ...). */
  actions?: (o: KObject) => ReactNode;
};

/** Live table + details panel for any resource. Edit/Delete come for free. */
export function ResourceView({ context, namespaces, resource, columns, defaultSort, details, actions }: ResourceViewProps) {
  const { items, ready, error } = useWatch(context, resource, namespaces);
  const [selected, setSelected] = useState<string>();
  const close = useCallback(() => setSelected(undefined), []);
  const obj = selected ? items.find((o) => o.metadata.uid === selected) : undefined;

  return (
    <div className="flex min-h-0 flex-1">
      <ResourceTable
        id={resource.plural}
        items={items}
        columns={columns}
        getRowId={kobjectId}
        searchText={searchKObject}
        ready={ready}
        error={error}
        defaultSort={defaultSort ?? (resource.namespaced
          ? [{ id: "namespace", desc: false }, { id: "name", desc: false }]
          : [{ id: "name", desc: false }])}
        onRowClick={(o) => setSelected(o.metadata.uid === selected ? undefined : o.metadata.uid)}
        selectedRowId={selected}
      />
      <DetailsPanel
        context={context}
        object={obj && { ...obj, kind: resource.kind }}
        onClose={close}
        actions={obj && <>{actions?.(obj)}<ObjectActions obj={refOf(resource, obj)} /></>}
      >
        {obj && details?.(obj)}
      </DetailsPanel>
    </div>
  );
}
