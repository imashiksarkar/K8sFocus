import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Conditions, Fields, KVChips, Section } from "@/components/details/parts";
import { col, simpleView } from "@/components/resource-view/simple";
import { age } from "@/lib/k8s";
import { R } from "@/lib/resources";
import { cn } from "@/lib/utils";

const keys = (o?: Record<string, unknown>) => Object.keys(o ?? {});
const Muted = ({ children }: { children: React.ReactNode }) => <span className="text-muted-foreground">{children}</span>;

// ---------- ConfigMaps ----------
function DataEntries({ data, secret }: { data: Record<string, string>; secret?: boolean }) {
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const entries = Object.entries(data);
  if (!entries.length) return <Muted>No data.</Muted>;
  return (
    <ul className="space-y-2">
      {entries.map(([k, raw]) => {
        const value = secret ? decode(raw) : raw;
        const visible = !secret || shown[k];
        return (
          <li key={k}>
            <div className="flex items-center gap-1 text-xs">
              <span className="font-semibold">{k}</span>
              <Muted>· {value.length} bytes</Muted>
              {secret && (
                <Button variant="ghost" size="icon" className="ml-auto size-6" title={visible ? "Hide" : "Reveal"}
                  onClick={() => setShown((s) => ({ ...s, [k]: !s[k] }))}>
                  {visible ? <EyeOff /> : <Eye />}
                </Button>
              )}
              <Button variant="ghost" size="icon" className={cn("size-6", !secret && "ml-auto")} title="Copy value"
                onClick={() => navigator.clipboard?.writeText(value)}><Copy /></Button>
            </div>
            <pre className={cn("mt-1 max-h-60 overflow-auto rounded-md bg-muted p-2 font-mono text-xs whitespace-pre-wrap break-all select-text",
              !visible && "blur-sm select-none")}>
              {visible ? value : "•".repeat(Math.min(value.length, 32))}
            </pre>
          </li>
        );
      })}
    </ul>
  );
}
function decode(b64: string) {
  try {
    const bin = atob(b64);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch { return "<binary>"; }
}

export const ConfigMapsView = simpleView(R.configmaps, [
  col("keys", "Keys", (o: any) => [...keys(o.data), ...keys((o as any).binaryData)].join(", "), (v) => <Muted>{v}</Muted>),
], {
  details: (o: any) => (
    <Section title="Data">
      <DataEntries data={o.data ?? {}} />
      {keys(o.binaryData).length > 0 && <p className="mt-2 text-xs text-muted-foreground">Binary keys: {keys(o.binaryData).join(", ")}</p>}
    </Section>
  ),
});

// ---------- Secrets ----------
export const SecretsView = simpleView(R.secrets, [
  col("keys", "Keys", (o: any) => keys(o.data).join(", "), (v) => <Muted>{v}</Muted>),
  col("type", "Type", (o: any) => o.type ?? ""),
], {
  details: (o: any) => (
    <>
      <Section title="Secret"><Fields rows={[["Type", o.type]]} /></Section>
      <Section title="Data (hidden — click 👁 to reveal)"><DataEntries data={o.data ?? {}} secret /></Section>
    </>
  ),
});

// ---------- ResourceQuotas ----------
export const ResourceQuotasView = simpleView(R.resourcequotas, [], {
  details: (o) => {
    const hard = o.status?.hard ?? o.spec?.hard ?? {};
    const used = o.status?.used ?? {};
    return (
      <Section title="Quota">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground"><th className="font-normal">Resource</th><th className="font-normal">Used</th><th className="font-normal">Hard</th></tr></thead>
          <tbody>
            {Object.keys(hard).sort().map((k) => (
              <tr key={k}><td>{k}</td><td>{used[k] ?? "0"}</td><td>{hard[k]}</td></tr>
            ))}
          </tbody>
        </table>
        {o.spec?.scopes && <p className="mt-2 text-xs text-muted-foreground">Scopes: {o.spec.scopes.join(", ")}</p>}
      </Section>
    );
  },
});

// ---------- LimitRanges ----------
export const LimitRangesView = simpleView(R.limitranges, [
  col("types", "Types", (o) => (o.spec?.limits ?? []).map((l: any) => l.type).join(", ")),
], {
  details: (o) => (
    <Section title="Limits">
      {(o.spec?.limits ?? []).map((l: any, i: number) => (
        <div key={i} className="mb-3">
          <Badge variant="secondary">{l.type}</Badge>
          <Fields rows={(["min", "max", "default", "defaultRequest", "maxLimitRequestRatio"] as const).map((f) => [
            f, l[f] && Object.entries(l[f]).map(([k, v]) => `${k}: ${v}`).join(", "),
          ])} />
        </div>
      ))}
    </Section>
  ),
});

// ---------- HPA ----------
function metricText(m: any, cur?: any): string {
  const t = m[m.type.charAt(0).toLowerCase() + m.type.slice(1)];
  const name = t?.name ?? t?.metric?.name ?? m.type;
  const target = t?.target ?? {};
  const want = target.averageUtilization !== undefined ? `${target.averageUtilization}%` : target.averageValue ?? target.value ?? "?";
  const c = cur && cur[cur.type.charAt(0).toLowerCase() + cur.type.slice(1)]?.current;
  const have = c ? (c.averageUtilization !== undefined ? `${c.averageUtilization}%` : c.averageValue ?? c.value) : "<unknown>";
  return `${name}: ${have} / ${want}`;
}
export const HPAsView = simpleView(R.hpas, [
  col("metrics", "Metrics", (o) => (o.spec?.metrics ?? []).map((m: any, i: number) => metricText(m, o.status?.currentMetrics?.[i])).join("; ")),
  col("min", "Min", (o) => o.spec?.minReplicas ?? 1),
  col("max", "Max", (o) => o.spec?.maxReplicas),
  col("replicas", "Replicas", (o) => o.status?.currentReplicas ?? 0),
], {
  details: (o) => (
    <Section title="Autoscaler">
      <Fields rows={[
        ["Target", `${o.spec?.scaleTargetRef?.kind}/${o.spec?.scaleTargetRef?.name}`],
        ["Replicas", `${o.status?.currentReplicas ?? 0} current · ${o.status?.desiredReplicas ?? 0} desired · min ${o.spec?.minReplicas ?? 1} · max ${o.spec?.maxReplicas}`],
        ["Metrics", <ul>{(o.spec?.metrics ?? []).map((m: any, i: number) => <li key={i}>{metricText(m, o.status?.currentMetrics?.[i])}</li>)}</ul>],
        ["Last scale", o.status?.lastScaleTime && `${age(o.status.lastScaleTime)} ago`],
        ["Conditions", <Conditions items={o.status?.conditions} />],
      ]} />
    </Section>
  ),
});

// ---------- VPA (CRD; shows an error if not installed) ----------
export const VPAsView = simpleView(R.vpas, [
  col("target", "Target", (o) => `${o.spec?.targetRef?.kind ?? ""}/${o.spec?.targetRef?.name ?? ""}`),
  col("mode", "Mode", (o) => o.spec?.updatePolicy?.updateMode ?? "Auto"),
], {
  details: (o) => (
    <Section title="Recommendations">
      {(o.status?.recommendation?.containerRecommendations ?? []).map((r: any) => (
        <Fields key={r.containerName} rows={[
          ["Container", r.containerName],
          ["Target", Object.entries(r.target ?? {}).map(([k, v]) => `${k}: ${v}`).join(", ")],
          ["Lower bound", Object.entries(r.lowerBound ?? {}).map(([k, v]) => `${k}: ${v}`).join(", ")],
          ["Upper bound", Object.entries(r.upperBound ?? {}).map(([k, v]) => `${k}: ${v}`).join(", ")],
        ]} />
      ))}
      <div className="mt-2"><Conditions items={o.status?.conditions} /></div>
    </Section>
  ),
});

// ---------- PDB ----------
export const PDBsView = simpleView(R.pdbs, [
  col("minAvailable", "Min Available", (o) => o.spec?.minAvailable ?? "N/A"),
  col("maxUnavailable", "Max Unavailable", (o) => o.spec?.maxUnavailable ?? "N/A"),
  col("healthy", "Current Healthy", (o) => o.status?.currentHealthy ?? 0),
  col("desired", "Desired Healthy", (o) => o.status?.desiredHealthy ?? 0),
  col("allowed", "Allowed Disruptions", (o) => o.status?.disruptionsAllowed ?? 0,
    (v) => <span className={cn(v === 0 && "text-primary")}>{v}</span>),
], {
  details: (o) => (
    <Section title="Budget">
      <Fields rows={[
        ["Selector", <KVChips map={o.spec?.selector?.matchLabels} />],
        ["Expected pods", o.status?.expectedPods],
        ["Disruptions allowed", o.status?.disruptionsAllowed],
        ["Conditions", <Conditions items={o.status?.conditions} />],
      ]} />
    </Section>
  ),
});

// ---------- PriorityClasses / RuntimeClasses / Leases ----------
export const PriorityClassesView = simpleView(R.priorityclasses, [
  col("value", "Value", (o: any) => o.value ?? 0),
  col("globalDefault", "Global Default", (o: any) => String(!!o.globalDefault)),
  col("preemption", "Preemption", (o: any) => o.preemptionPolicy ?? "PreemptLowerPriority"),
], { details: (o: any) => <Section title="Priority"><Fields rows={[["Description", o.description]]} /></Section> });

export const RuntimeClassesView = simpleView(R.runtimeclasses, [
  col("handler", "Handler", (o: any) => o.handler ?? ""),
]);

export const LeasesView = simpleView(R.leases, [
  col("holder", "Holder", (o) => o.spec?.holderIdentity ?? ""),
  col("renew", "Renewed", (o) => o.spec?.renewTime ?? "", (v) => (v ? `${age(v)} ago` : "")),
]);

// ---------- Admission webhooks ----------
function WebhookList({ o }: { o: any }) {
  return (
    <Section title={`Webhooks (${o.webhooks?.length ?? 0})`}>
      {(o.webhooks ?? []).map((w: any) => (
        <div key={w.name} className="mb-3 border-b pb-3 last:border-0">
          <p className="mb-1 font-medium">{w.name}</p>
          <Fields rows={[
            ["Client", w.clientConfig?.service
              ? `service ${w.clientConfig.service.namespace}/${w.clientConfig.service.name}:${w.clientConfig.service.port ?? 443}${w.clientConfig.service.path ?? ""}`
              : w.clientConfig?.url],
            ["Failure policy", <span className={cn(w.failurePolicy === "Fail" && "text-primary")}>{w.failurePolicy}</span>],
            ["Side effects", w.sideEffects],
            ["Timeout", w.timeoutSeconds && `${w.timeoutSeconds}s`],
            ["Namespace selector", w.namespaceSelector?.matchLabels && <KVChips map={w.namespaceSelector.matchLabels} />],
            ["Rules", <ul className="font-mono text-xs">{(w.rules ?? []).map((r: any, i: number) => (
              <li key={i}>{r.operations?.join(",")} {r.apiGroups?.map((g: string) => g || "core").join(",")}/{r.resources?.join(",")}</li>
            ))}</ul>],
          ]} />
        </div>
      ))}
    </Section>
  );
}
const webhookCols = [col("webhooks", "Webhooks", (o: any) => o.webhooks?.length ?? 0)];
export const MutatingWebhooksView = simpleView(R.mutatingwebhooks, webhookCols, { details: (o) => <WebhookList o={o} /> });
export const ValidatingWebhooksView = simpleView(R.validatingwebhooks, webhookCols, { details: (o) => <WebhookList o={o} /> });
