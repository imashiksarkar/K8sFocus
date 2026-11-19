import { Badge } from "@/components/ui/badge";
import { Fields, KVChips, Section } from "@/components/details/parts";
import { col, simpleView } from "@/components/resource-view/simple";
import { R, type KObject } from "@/lib/resources";
import { cn } from "@/lib/utils";
import { ForwardButton } from "../portforward/ForwardButton";

const Muted = ({ children }: { children: React.ReactNode }) => <span className="text-muted-foreground">{children}</span>;

const svcPorts = (o: KObject) =>
  (o.spec?.ports ?? []).map((p: any) => `${p.port}${p.nodePort ? `:${p.nodePort}` : ""}/${p.protocol ?? "TCP"}`).join(", ");
const externalIPs = (o: KObject) =>
  [...(o.status?.loadBalancer?.ingress ?? []).map((i: any) => i.ip ?? i.hostname), ...(o.spec?.externalIPs ?? [])].join(", ");

export const ServicesView = simpleView(R.services, [
  col("type", "Type", (o) => o.spec?.type ?? ""),
  col("clusterIP", "Cluster IP", (o) => o.spec?.clusterIP ?? ""),
  col("ports", "Ports", svcPorts),
  col("externalIP", "External IP", externalIPs, (v, o) =>
    o.spec?.type === "LoadBalancer" && !v ? <span className="text-primary">&lt;pending&gt;</span> : v),
  col("selector", "Selector", (o) => Object.entries(o.spec?.selector ?? {}).map(([k, v]) => `${k}=${v}`).join(", "), (v) => <Muted>{v}</Muted>),
], {
  details: (o) => (
    <Section title="Service">
      <Fields rows={[
        ["Type", o.spec?.type],
        ["Cluster IPs", (o.spec?.clusterIPs ?? [o.spec?.clusterIP]).join(", ")],
        ["External", externalIPs(o) || o.spec?.externalName],
        ["Session affinity", o.spec?.sessionAffinity],
        ["Traffic policy", o.spec?.externalTrafficPolicy && `external: ${o.spec.externalTrafficPolicy}, internal: ${o.spec.internalTrafficPolicy ?? "Cluster"}`],
        ["Selector", <KVChips map={o.spec?.selector} />],
        ["Ports", (
          <table className="text-xs">
            <tbody>{(o.spec?.ports ?? []).map((p: any) => (
              <tr key={`${p.port}/${p.protocol}`}>
                <td className="pr-3">{p.name ?? "—"}</td>
                <td className="pr-3">{p.port}/{p.protocol ?? "TCP"}</td>
                <td className="pr-3">→ {p.targetPort}</td>
                <td className="pr-3">{p.nodePort && `node ${p.nodePort}`}</td>
                <td>{(p.protocol ?? "TCP") === "TCP" && o.spec?.selector && (
                  <ForwardButton kind="service" namespace={o.metadata.namespace!} name={o.metadata.name} port={p.port} />
                )}</td>
              </tr>
            ))}</tbody>
          </table>
        )],
      ]} />
    </Section>
  ),
});

const epAddresses = (o: any) =>
  (o.subsets ?? []).flatMap((s: any) => (s.addresses ?? []).flatMap((a: any) => (s.ports ?? [{ port: "" }]).map((p: any) => `${a.ip}:${p.port}`)));
export const EndpointsView = simpleView(R.endpoints, [
  col("endpoints", "Endpoints", (o) => epAddresses(o).join(", "), (v) => <Muted>{v || "<none>"}</Muted>),
], {
  details: (o: any) => (
    <Section title="Subsets">
      {(o.subsets ?? []).map((s: any, i: number) => (
        <Fields key={i} rows={[
          ["Ready", (s.addresses ?? []).map((a: any) => `${a.ip}${a.targetRef ? ` (${a.targetRef.name})` : ""}`).join(", ")],
          ["Not ready", (s.notReadyAddresses ?? []).map((a: any) => a.ip).join(", ")],
          ["Ports", (s.ports ?? []).map((p: any) => `${p.name ?? ""} ${p.port}/${p.protocol}`).join(", ")],
        ]} />
      ))}
    </Section>
  ),
});

export const EndpointSlicesView = simpleView(R.endpointslices, [
  col("addressType", "Address Type", (o: any) => o.addressType ?? ""),
  col("ports", "Ports", (o: any) => (o.ports ?? []).map((p: any) => p.port).join(", ")),
  col("endpoints", "Endpoints", (o: any) => (o.endpoints ?? []).flatMap((e: any) => e.addresses).join(", "), (v) => <Muted>{v}</Muted>),
], {
  details: (o: any) => (
    <Section title="Endpoints">
      <ul className="space-y-1 text-sm">
        {(o.endpoints ?? []).map((e: any, i: number) => (
          <li key={i} className="flex gap-2">
            <span className="font-mono text-xs">{e.addresses?.join(", ")}</span>
            <span className={cn("text-xs", e.conditions?.ready ? "text-emerald-400" : "text-primary")}>{e.conditions?.ready ? "ready" : "not ready"}</span>
            <Muted>{e.targetRef?.name} {e.nodeName && `@ ${e.nodeName}`}</Muted>
          </li>
        ))}
      </ul>
    </Section>
  ),
});

const ingressRules = (o: KObject) =>
  (o.spec?.rules ?? []).flatMap((r: any) => (r.http?.paths ?? [{ path: "" }]).map((p: any) => ({
    host: r.host ?? "*", path: p.path ?? "/", backend: p.backend?.service ? `${p.backend.service.name}:${p.backend.service.port?.number ?? p.backend.service.port?.name}` : "",
  })));
export const IngressesView = simpleView(R.ingresses, [
  col("class", "Class", (o) => o.spec?.ingressClassName ?? o.metadata.annotations?.["kubernetes.io/ingress.class"] ?? ""),
  col("hosts", "Hosts", (o) => [...new Set(ingressRules(o).map((r: any) => r.host))].join(", ")),
  col("address", "Address", (o) => (o.status?.loadBalancer?.ingress ?? []).map((i: any) => i.ip ?? i.hostname).join(", ")),
], {
  details: (o) => (
    <Section title="Rules">
      <table className="w-full text-xs">
        <thead><tr className="text-left text-muted-foreground"><th className="font-normal">Host</th><th className="font-normal">Path</th><th className="font-normal">Backend</th></tr></thead>
        <tbody>{ingressRules(o).map((r: any, i: number) => (
          <tr key={i}><td>{r.host}</td><td>{r.path}</td><td>{r.backend}</td></tr>
        ))}</tbody>
      </table>
      {o.spec?.tls && <p className="mt-2 text-xs">TLS: {o.spec.tls.map((t: any) => `${t.hosts?.join(",")} → ${t.secretName}`).join("; ")}</p>}
    </Section>
  ),
});

export const IngressClassesView = simpleView(R.ingressclasses, [
  col("controller", "Controller", (o) => o.spec?.controller ?? ""),
  col("default", "Default", (o) => o.metadata.annotations?.["ingressclass.kubernetes.io/is-default-class"] === "true",
    (v) => (v ? <Badge>default</Badge> : "")),
]);

export const NetworkPoliciesView = simpleView(R.networkpolicies, [
  col("podSelector", "Pod Selector", (o) => Object.entries(o.spec?.podSelector?.matchLabels ?? {}).map(([k, v]) => `${k}=${v}`).join(", ") || "<all pods>"),
  col("types", "Policy Types", (o) => (o.spec?.policyTypes ?? []).join(", ")),
], {
  details: (o) => (
    <Section title="Policy">
      <Fields rows={[
        ["Pod selector", <KVChips map={o.spec?.podSelector?.matchLabels} />],
        ["Types", (o.spec?.policyTypes ?? []).join(", ")],
        ["Ingress rules", o.spec?.ingress && <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(o.spec.ingress, null, 1)}</pre>],
        ["Egress rules", o.spec?.egress && <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(o.spec.egress, null, 1)}</pre>],
      ]} />
    </Section>
  ),
});
