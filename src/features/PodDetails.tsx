import { Conditions, Fields, KVChips, Section } from "@/components/details/parts";
import type { KObject } from "@/lib/resources";
import { cn } from "@/lib/utils";
import { podStatus } from "./PodsView";
import { useCluster } from "@/lib/cluster-context";
import { ForwardButton } from "./portforward/ForwardButton";
import { EnvVars } from "./pods/EnvVars";
import { fmtCpu, fmtMem, useMetrics, type Usage } from "@/lib/metrics";
import { parseQuantity } from "@/lib/k8s";

/** Pod-specific sections for the details panel. Never resolves secret values. */
export function PodDetails({ pod }: { pod: KObject }) {
  const { openLogs, context } = useCluster();
  const usage = useMetrics(context, "pods").usage.get(`${pod.metadata.namespace}/${pod.metadata.name}`);
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
          ["Ports", <PodPorts pod={pod} />],
          ["Conditions", <Conditions items={st.conditions} />],
        ]} />
      </Section>

      {(spec.initContainers ?? []).map((c: any) => (
        <Container key={`init-${c.name}`} c={c} status={statusOf(c.name)} init onLogs={() => openLogs(pod, c.name)} pod={pod} context={context} />
      ))}
      {(spec.containers ?? []).map((c: any) => (
        <Container key={c.name} c={c} status={statusOf(c.name)} onLogs={() => openLogs(pod, c.name)} pod={pod} context={context} usage={usage?.containers?.[c.name]} />
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

function Container({ c, status, init, onLogs, pod, context, usage }: {
  c: any; status?: any; init?: boolean; onLogs: () => void; pod: KObject; context: string; usage?: Usage;
}) {
  const state = stateText(status);
  const last = status?.lastState?.terminated;
  return (
    <Section title={`${init ? "Init container" : "Container"} · ${c.name}`}>
      <Fields rows={[
        ["State", <span className={cn(state.ok ? "text-emerald-400" : "text-primary")}>{state.text}</span>],
        ["Logs", <button className="text-primary hover:underline" onClick={onLogs}>View logs</button>],
        ["Last state", last && `terminated: ${last.reason ?? ""} (exit ${last.exitCode}) at ${new Date(last.finishedAt).toLocaleString()}`],
        ["Ready", status && String(status.ready)],
        ["Restarts", status?.restartCount],
        ["Image", <span className="font-mono text-xs">{c.image}</span>],
        ["Image ID", status?.imageID && <span className="font-mono text-xs break-all">{status.imageID}</span>],
        ["Command", c.command?.join(" ")],
        ["Args", c.args?.join(" ")],
        ["Ports", c.ports?.length ? (
          <ul>{c.ports.map((p: any) => (
            <li key={`${p.containerPort}/${p.protocol}`} className="flex gap-3">
              <span>{p.name ? `${p.name}: ` : ""}{p.containerPort}/{p.protocol ?? "TCP"}</span>
              {pod && pod.status?.phase === "Running" && (p.protocol ?? "TCP") === "TCP" && (
                <ForwardButton kind="pod" namespace={pod.metadata.namespace!} name={pod.metadata.name} port={p.containerPort} />
              )}
            </li>
          ))}</ul>
        ) : undefined],
        ["CPU usage", usage && usageVs(fmtCpu(usage.cpu), usage.cpu, c.resources?.requests?.cpu, c.resources?.limits?.cpu)],
        ["Memory usage", usage && usageVs(fmtMem(usage.memory), usage.memory, c.resources?.requests?.memory, c.resources?.limits?.memory)],
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
        ["Environment", c.env?.length || c.envFrom?.length ? <EnvVars container={c} pod={pod} context={context} /> : undefined],
      ]} />
    </Section>
  );
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

function usageVs(text: string, used: number, req?: string, lim?: string) {
  const pct = (q?: string) => (q ? `${Math.round((used / parseQuantity(q)) * 100)}% of ${q}` : undefined);
  const limPct = lim ? used / parseQuantity(lim) : 0;
  return (
    <span className={cn(limPct > 0.9 ? "text-destructive" : limPct > 0.75 ? "text-primary" : undefined)}>
      {text}
      <span className="text-muted-foreground">{[req && ` · ${pct(req)} request`, lim && ` · ${pct(lim)} limit`].filter(Boolean).join("")}</span>
    </span>
  );
}

/** All ports exposed by the pod's containers, each with Forward / Pause / Resume (like Lens). */
function PodPorts({ pod }: { pod: KObject }) {
  const ports = (pod.spec?.containers ?? []).flatMap((c: any) =>
    (c.ports ?? []).map((p: any) => ({ ...p, container: c.name })));
  if (!ports.length) return <span className="text-muted-foreground">none declared</span>;
  const running = pod.status?.phase === "Running";
  const multi = (pod.spec?.containers ?? []).length > 1;
  return (
    <ul className="space-y-1">
      {ports.map((p: any) => {
        const tcp = (p.protocol ?? "TCP") === "TCP";
        return (
          <li key={`${p.container}/${p.containerPort}/${p.protocol}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="font-mono text-xs">
              {p.name && <span className="text-muted-foreground">{p.name}: </span>}{p.containerPort}/{p.protocol ?? "TCP"}
              {multi && <span className="text-muted-foreground"> · {p.container}</span>}
            </span>
            {tcp && running && (
              <ForwardButton kind="pod" namespace={pod.metadata.namespace!} name={pod.metadata.name} port={p.containerPort} />
            )}
            {!tcp && <span className="text-[11px] text-muted-foreground">(UDP can't be forwarded)</span>}
          </li>
        );
      })}
    </ul>
  );
}
