import { useState } from "react";
import { History, RotateCw, Scaling } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmAction } from "@/components/editor/ConfirmAction";
import { useCluster } from "@/lib/cluster-context";
import { k8sWrite } from "@/lib/k8s";
import { refOf, type KObject, type ResourceRef } from "@/lib/resources";

const where = (o: KObject, context: string) => (
  <>Context <b>{context}</b>, namespace <b>{o.metadata.namespace}</b>.</>
);

export function ScaleButton({ resource, obj }: { resource: ResourceRef; obj: KObject }) {
  const { context, readOnly } = useCluster();
  const current = obj.spec?.replicas ?? 0;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(current));
  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 0 && n <= 1000;
  return (
    <>
      <Button variant="ghost" size="icon" className="size-7" disabled={readOnly}
        title={readOnly ? "Cluster is read-only" : "Scale"} onClick={() => { setValue(String(current)); setOpen(true); }}>
        <Scaling />
      </Button>
      <ConfirmAction
        open={open} onOpenChange={setOpen}
        title={`Scale ${resource.kind} “${obj.metadata.name}”`}
        description={<>{where(obj, context)} Current replicas: <b>{current}</b>.</>}
        confirmLabel={n === 0 ? "Scale to 0" : "Scale"}
        destructive={n === 0}
        disabled={!valid || n === current}
        onConfirm={() => k8sWrite.scale(context, refOf(resource, obj), n)}
      >
        <Input type="number" min={0} max={1000} autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
        {n === 0 && <p className="text-xs text-primary">Scaling to 0 stops all pods of this workload.</p>}
      </ConfirmAction>
    </>
  );
}

export function RestartButton({ resource, obj }: { resource: ResourceRef; obj: KObject }) {
  const { context, readOnly } = useCluster();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" className="size-7" disabled={readOnly}
        title={readOnly ? "Cluster is read-only" : "Restart (rolling)"} onClick={() => setOpen(true)}>
        <RotateCw />
      </Button>
      <ConfirmAction
        open={open} onOpenChange={setOpen}
        title={`Restart ${resource.kind} “${obj.metadata.name}”?`}
        description={<>{where(obj, context)} Pods are replaced with a rolling update, same as <code>kubectl rollout restart</code>.</>}
        confirmLabel="Restart"
        onConfirm={() => k8sWrite.restart(context, refOf(resource, obj))}
      />
    </>
  );
}

export function RollbackButton({ deployment, rs, revision }: { deployment: KObject; rs: KObject; revision: string }) {
  const { context, readOnly } = useCluster();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" className="h-6 text-xs" disabled={readOnly}
        title={readOnly ? "Cluster is read-only" : `Roll back to revision ${revision}`} onClick={() => setOpen(true)}>
        <History /> Roll back
      </Button>
      <ConfirmAction
        open={open} onOpenChange={setOpen}
        title={`Roll back “${deployment.metadata.name}” to revision ${revision}?`}
        description={<>{where(deployment, context)} The pod template is replaced with the one from ReplicaSet <b>{rs.metadata.name}</b>, same as <code>kubectl rollout undo --to-revision={revision}</code>.</>}
        confirmLabel="Roll back"
        onConfirm={() => k8sWrite.rollback(context, deployment.metadata.namespace!, deployment.metadata.name, rs.metadata.name)}
      />
    </>
  );
}
