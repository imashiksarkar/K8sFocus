import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Conditions, Fields, KVChips, Section } from "@/components/details/parts";
import { age } from "@/lib/k8s";
import { R, type KObject } from "@/lib/resources";
import { useWatch } from "@/lib/useWatch";
import { useCluster } from "@/lib/cluster-context";
import { cn } from "@/lib/utils";
import { podStatus } from "../PodsView";
import { RollbackButton } from "./actions";

const REV = "deployment.kubernetes.io/revision";

/** matchLabels-only selector match (matchExpressions are rare on workloads; shown in YAML). */
function matches(selector: any, labels: Record<string, string> = {}) {
  const ml: Record<string, string> = selector?.matchLabels ?? {};
  const keys = Object.keys(ml);
  return keys.length > 0 && keys.every((k) => labels[k] === ml[k]);
}

export function WorkloadSummary({ obj }: { obj: KObject }) {
  const s = obj.spec ?? {};
  const st = obj.status ?? {};
  const images = (s.template?.spec?.containers ?? []).map((c: any) => c.image);
  return (
    <Section title="Workload">
      <Fields rows={[
        ["Replicas", s.replicas !== undefined
          ? `${s.replicas} desired · ${st.updatedReplicas ?? 0} updated · ${st.readyReplicas ?? 0} ready · ${st.availableReplicas ?? 0} available`
          : undefined],
        ["Scheduled", st.desiredNumberScheduled !== undefined
          ? `${st.desiredNumberScheduled} desired · ${st.currentNumberScheduled} current · ${st.numberReady} ready · ${st.numberAvailable ?? 0} available`
          : undefined],
        ["Strategy", s.strategy?.type ?? s.updateStrategy?.type],
        ["Service name", s.serviceName],
        ["Revision", obj.metadata.annotations?.[REV]],
        ["Selector", <KVChips map={s.selector?.matchLabels} />],
        ["Node selector", s.template?.spec?.nodeSelector && <KVChips map={s.template.spec.nodeSelector} />],
        ["Images", <ul className="font-mono text-xs">{images.map((i: string) => <li key={i}>{i}</li>)}</ul>],
        ["Conditions", st.conditions && <Conditions items={st.conditions} />],
      ]} />
    </Section>
  );
}

/** Pods selected by this workload (live). */
export function WorkloadPods({ obj }: { obj: KObject }) {
  const { context } = useCluster();
  const { items, ready } = useWatch(context, R.pods, obj.metadata.namespace ? [obj.metadata.namespace] : []);
  const pods = useMemo(
    () => items.filter((p) => matches(obj.spec?.selector, p.metadata.labels)).sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)),
    [items, obj.spec?.selector],
  );
  return (
    <Section title={`Pods (${pods.length})`}>
      {!ready ? <p className="text-sm text-muted-foreground">Loading…</p>
        : !pods.length ? <p className="text-sm text-muted-foreground">No pods.</p>
        : (
          <ul className="space-y-1 text-sm">
            {pods.map((p) => {
              const s = podStatus(p);
              return (
                <li key={p.metadata.uid} className="flex gap-2">
                  <span className="min-w-0 flex-1 truncate">{p.metadata.name}</span>
                  <span className="text-muted-foreground">{p.spec?.nodeName}</span>
                  <span className={cn(s === "Running" ? "text-emerald-400" : "text-primary")}>{s}</span>
                </li>
              );
            })}
          </ul>
        )}
    </Section>
  );
}

/** Deployment revision history from owned ReplicaSets, with rollback. */
export function DeploymentHistory({ deployment }: { deployment: KObject }) {
  const { context } = useCluster();
  const { items } = useWatch(context, R.replicasets, [deployment.metadata.namespace!]);
  const current = deployment.metadata.annotations?.[REV];
  const revisions = useMemo(
    () => items
      .filter((rs) => rs.metadata.ownerReferences?.some((o) => o.uid === deployment.metadata.uid))
      .sort((a, b) => Number(b.metadata.annotations?.[REV] ?? 0) - Number(a.metadata.annotations?.[REV] ?? 0)),
    [items, deployment.metadata.uid],
  );
  if (!revisions.length) return null;
  return (
    <Section title="Revisions">
      <ul className="space-y-1.5 text-sm">
        {revisions.map((rs) => {
          const rev = rs.metadata.annotations?.[REV] ?? "?";
          const images = (rs.spec?.template?.spec?.containers ?? []).map((c: any) => c.image).join(", ");
          return (
            <li key={rs.metadata.uid} className="flex items-center gap-2">
              <Badge variant={rev === current ? "default" : "secondary"}>#{rev}</Badge>
              <span className="min-w-0 flex-1 truncate font-mono text-xs" title={images}>{images}</span>
              <span className="text-xs text-muted-foreground">{age(rs.metadata.creationTimestamp)}</span>
              {rev === current
                ? <span className="w-[86px] text-center text-xs text-primary">current</span>
                : <RollbackButton deployment={deployment} rs={rs} revision={rev} />}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
