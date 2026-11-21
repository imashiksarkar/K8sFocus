import { useEffect, useState } from "react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { age } from "@/lib/k8s";
import type { KObject } from "@/lib/resources";

/** Re-renders every 5s so age columns stay current without new watch events. */
function LiveAge({ ts }: { ts?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);
  return <span title={ts}>{age(ts)}</span>;
}

/** Common columns every resource view uses. */
export function commonColumns<T extends KObject>() {
  const c = createColumnHelper<T>();
  return {
    name: c.accessor((o) => o.metadata.name, {
      id: "name", header: "Name", enableHiding: false, size: 280,
      cell: (i) => <span className="font-medium">{i.getValue()}</span>,
    }) as ColumnDef<T, any>,
    namespace: c.accessor((o) => o.metadata.namespace ?? "", {
      id: "namespace", header: "Namespace",
    }) as ColumnDef<T, any>,
    // sort by timestamp; newest = smallest age
    age: c.accessor((o) => o.metadata.creationTimestamp ?? "", {
      id: "age", header: "Age", sortDescFirst: true,
      cell: (i) => <LiveAge ts={i.getValue()} />,
    }) as ColumnDef<T, any>,
  };
}

export const searchKObject = (o: KObject) =>
  `${o.metadata.name} ${o.metadata.namespace ?? ""} ${Object.entries(o.metadata.labels ?? {}).map(([k, v]) => `${k}=${v}`).join(" ")}`;

export const kobjectId = (o: KObject) => o.metadata.uid;
