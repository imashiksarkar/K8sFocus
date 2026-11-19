import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCluster } from "@/lib/cluster-context";
import type { ObjRef } from "@/lib/k8s";

/** Edit/Delete buttons for the details panel header. */
export function ObjectActions({ obj }: { obj: ObjRef }) {
  const { readOnly, openEditor, confirmDelete } = useCluster();
  return (
    <>
      <Button variant="ghost" size="icon" className="size-7" title="Edit YAML"
        onClick={() => openEditor({ mode: "edit", obj })}><Pencil /></Button>
      <Button variant="ghost" size="icon" className="size-7 hover:text-destructive"
        title={readOnly ? "Cluster is read-only" : "Delete"} disabled={readOnly}
        onClick={() => confirmDelete(obj)}><Trash2 /></Button>
    </>
  );
}
