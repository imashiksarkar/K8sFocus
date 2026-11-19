import { Badge } from "@/components/ui/badge";
import { Conditions, Fields, KVChips, Section } from "@/components/details/parts";
import type { KObject } from "@/lib/resources";
import { cn } from "@/lib/utils";
import { podStatus } from "./PodsView";

/** Pod-specific sections for the details panel. Never resolves secret values. */
export function PodDetails({ pod }: { pod: KObject }) {
  const spec = pod.spec ?? {};
  const st = pod.status ?? {};
  const statuses: any[] = [...(st.initContainerStatuses ?? []), ...(st.containerStatuses ?? [])];
  const statusOf = (name: string) => statuses.find((s) => s.name === name);

  return (
    <>
      <Section title="Pod">
        <Fields rows={[
          ["Status", podStatus(pod)],
          ["Node", spec.nodeName],
          ["Pod IP", (st.podIPs ?? []).map((i: any) => i.ip).join(", ") || st.podIP],
          ["Host IP", st.hostIP],
          ["QoS class", st.qosClass],
          ["Service account", spec.serviceAccountName],
          ["Priority class", spec.priorityClassName],
          ["Restart policy", spec.restartPolicy],
          ["Node selector", spec.nodeSelector && <KVChips map={spec.nodeSelector} />],
          ["Tolerations", spec.tolerations?.length
            ? spec.tolerations.map((t: any) => [t.key ?? "*", t.operator, t.value, t.effect].filter(Boolean).join(" ")).join("; ")
            : undefined],
          ["Conditions", <Conditions items={st.conditions} />],
        ]} />
      </Section>

      {(spec.initContainers ?? []).map((c: any) => (
        <Container key={`init-${c.name}`} c={c} status={statusOf(c.name)} init />
      ))}
      {(spec.containers ?? []).map((c: any) => (
        <Container key={c.name} c={c} status={statusOf(c.name)} />
      ))}

      {spec.volumes?.length > 0 && (
        <Section title="Volumes">
          <ul className="space-y-1 text-sm">
            {spec.volumes.map((v: any) => {
              const type = Object.keys(v).find((k) => k !== "name") ?? "";
              const src = v[type] ?? {};
              const ref = src.claimName ?? src.secretName ?? src.name ?? src.path ?? "";
              return (
                <li key={v.name} className="flex gap-2">
                  <span className="font-medium">{v.name}</span>
                  <span className="text-muted-foreground">{type}{ref && `: ${ref}`}</span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </>
  );
}

function stateText(s: any): { text: string; ok: boolean } {
  if (!s?.state) return { text: "unknown", ok: false };
  if (s.state.running) return { text: `running since ${new Date(s.state.running.startedAt).toLocaleString()}`, ok: true };
  if (s.state.waiting) return { text: `waiting: ${s.state.waiting.reason ?? ""}`, ok: false };
  const t = s.state.terminated;
  return { text: `terminated: ${t.reason ?? ""} (exit ${t.exitCode})`, ok: t.exitCode === 0 };
}

function Container({ c, status, init }: { c: any; status?: any; init?: boolean }) {
  const state = stateText(status);
  const last = status?.lastState?.terminated;
  return (
    <Section title={`${init ? "Init container" : "Container"} · ${c.name}`}>
      <Fields rows={[
        ["State", <span className={cn(state.ok ? "text-emerald-400" : "text-primary")}>{state.text}</span>],
        ["Last state", last && `terminated: ${last.reason ?? ""} (exit ${last.exitCode}) at ${new Date(last.finishedAt).toLocaleString()}`],
        ["Ready", status && String(status.ready)],
        ["Restarts", status?.restartCount],
        ["Image", <span className="font-mono text-xs">{c.image}</span>],
        ["Image ID", status?.imageID && <span className="font-mono text-xs break-all">{status.imageID}</span>],
        ["Command", c.command?.join(" ")],
        ["Args", c.args?.join(" ")],
        ["Ports", c.ports?.map((p: any) => `${p.name ? p.name + ":" : ""}${p.containerPort}/${p.protocol ?? "TCP"}`).join(", ")],
        ["Requests", fmtRes(c.resources?.requests)],
        ["Limits", fmtRes(c.resources?.limits)],
        ["Liveness", probe(c.livenessProbe)],
        ["Readiness", probe(c.readinessProbe)],
        ["Startup", probe(c.startupProbe)],
        ["Mounts", c.volumeMounts?.length ? (
          <ul>{c.volumeMounts.map((m: any) => (
            <li key={m.mountPath} className="font-mono text-xs">
              {m.mountPath} <span className="text-muted-foreground">← {m.name}{m.subPath ? `/${m.subPath}` : ""}{m.readOnly ? " (ro)" : ""}</span>
            </li>
          ))}</ul>
        ) : undefined],
        ["Environment", c.env?.length || c.envFrom?.length ? <Env env={c.env} envFrom={c.envFrom} /> : undefined],
      ]} />
    </Section>
  );
}

function Env({ env = [], envFrom = [] }: { env?: any[]; envFrom?: any[] }) {
  return (
    <ul className="space-y-0.5 font-mono text-xs">
      {env.map((e) => (
        <li key={e.name} className="break-all">
          <span>{e.name}</span>=
          {e.value !== undefined ? <span className="text-muted-foreground">{e.value}</span> : <Ref v={e.valueFrom} />}
        </li>
      ))}
      {envFrom.map((e, i) => (
        <li key={`from-${i}`}>
          <Badge variant="outline" className="font-normal">
            all from {e.secretRef ? `secret/${e.secretRef.name}` : `configmap/${e.configMapRef?.name}`}
            {e.prefix ? ` (prefix ${e.prefix})` : ""}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function Ref({ v }: { v: any }) {
  const text = v?.secretKeyRef ? `secret ${v.secretKeyRef.name}.${v.secretKeyRef.key}`
    : v?.configMapKeyRef ? `configmap ${v.configMapKeyRef.name}.${v.configMapKeyRef.key}`
    : v?.fieldRef ? `field ${v.fieldRef.fieldPath}`
    : v?.resourceFieldRef ? `resource ${v.resourceFieldRef.resource}`
    : "?";
  return <span className="text-primary">&lt;{text}&gt;</span>;
}

const fmtRes = (r?: Record<string, string>) =>
  r && Object.keys(r).length ? Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(", ") : undefined;

function probe(p: any) {
  if (!p) return undefined;
  const how = p.httpGet ? `http-get ${p.httpGet.scheme?.toLowerCase() ?? "http"}://:${p.httpGet.port}${p.httpGet.path ?? ""}`
    : p.tcpSocket ? `tcp :${p.tcpSocket.port}`
    : p.exec ? `exec ${p.exec.command?.join(" ")}`
    : p.grpc ? `grpc :${p.grpc.port}` : "";
  return `${how} delay=${p.initialDelaySeconds ?? 0}s timeout=${p.timeoutSeconds ?? 1}s period=${p.periodSeconds ?? 10}s #fail=${p.failureThreshold ?? 3}`;
}
