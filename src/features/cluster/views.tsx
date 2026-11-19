import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Fields, Section } from "@/components/details/parts";
import { col, simpleView } from "@/components/resource-view/simple";
import { ResourceView } from "@/components/resource-view/ResourceView";
import { commonColumns } from "@/components/resource-table/columns";
import { age } from "@/lib/k8s";
import { R, type KObject } from "@/lib/resources";
import { cn } from "@/lib/utils";

const Muted = ({ children }: { children: React.ReactNode }) => <span className="text-muted-foreground">{children}</span>;

// ---------- Namespaces ----------
export const NamespacesView = simpleView(R.namespaces, [
  col("status", "Status", (o) => o.status?.phase ?? "",
    (v) => <span className={cn(v === "Active" ? "text-emerald-400" : "text-primary")}>{v}</span>),
]);

// ---------- Events ----------
const lastSeen = (e: any): string => e.lastTimestamp ?? e.eventTime ?? e.metadata?.creationTimestamp ?? "";

export function EventsView(p: { context: string; namespaces: string[] }) {
  const columns = useMemo(() => {
    const k = commonColumns<KObject>();
    return [
      col("type", "Type", (e: any) => e.type ?? "", (v) => <span className={cn(v === "Warning" ? "text-primary" : "text-muted-foreground")}>{v}</span>),
      col("reason", "Reason", (e: any) => e.reason ?? ""),
      col("object", "Involved Object", (e: any) => `${e.involvedObject?.kind}/${e.involvedObject?.name}`),
      col("message", "Message", (e: any) => e.message ?? "", (v) => <span title={v}>{v}</span>),
      k.namespace,
      col("source", "Source", (e: any) => e.source?.component ?? e.reportingComponent ?? "", (v) => <Muted>{v}</Muted>),
      col("count", "Count", (e: any) => e.count ?? 1),
      col("lastSeen", "Last Seen", lastSeen, (v) => `${age(v)} ago`),
    ];
  }, []);
  return (
    <ResourceView {...p} resource={R.events} columns={columns} defaultSort={[{ id: "lastSeen", desc: true }]}
      details={(e: any) => (
        <Section title="Event">
          <Fields rows={[
            ["Type", e.type], ["Reason", e.reason], ["Message", e.message],
            ["Object", `${e.involvedObject?.kind}/${e.involvedObject?.name}${e.involvedObject?.fieldPath ? ` (${e.involvedObject.fieldPath})` : ""}`],
            ["Source", [e.source?.component, e.source?.host].filter(Boolean).join(" @ ")],
            ["Count", e.count], ["First seen", e.firstTimestamp && new Date(e.firstTimestamp).toLocaleString()],
            ["Last seen", lastSeen(e) && new Date(lastSeen(e)).toLocaleString()],
          ]} />
        </Section>
      )} />
  );
}

// ---------- Access control ----------
export const ServiceAccountsView = simpleView(R.serviceaccounts, [
  col("secrets", "Secrets", (o: any) => o.secrets?.length ?? 0),
], {
  details: (o: any) => (
    <Section title="Service account">
      <Fields rows={[
        ["Automount token", o.automountServiceAccountToken === undefined ? "default (true)" : String(o.automountServiceAccountToken)],
        ["Secrets", (o.secrets ?? []).map((s: any) => s.name).join(", ")],
        ["Image pull secrets", (o.imagePullSecrets ?? []).map((s: any) => s.name).join(", ")],
      ]} />
    </Section>
  ),
});

function Rules({ o }: { o: any }) {
  const rules: any[] = o.rules ?? [];
  return (
    <Section title={`Rules (${rules.length})`}>
      {o.aggregationRule && <p className="mb-2 text-xs text-muted-foreground">Aggregated from roles matching {JSON.stringify(o.aggregationRule.clusterRoleSelectors?.map((s: any) => s.matchLabels))}</p>}
      <table className="w-full text-xs">
        <thead><tr className="text-left text-muted-foreground"><th className="font-normal">Resources</th><th className="font-normal">Verbs</th><th className="font-normal">API groups</th></tr></thead>
        <tbody>
          {rules.map((r, i) => (
            <tr key={i} className="border-b align-top last:border-0">
              <td className="py-1 pr-2">{[...(r.resources ?? []), ...(r.nonResourceURLs ?? [])].join(", ")}{r.resourceNames && <Muted> ({r.resourceNames.join(", ")})</Muted>}</td>
              <td className="py-1 pr-2">
                {(r.verbs ?? []).map((v: string) => (
                  <Badge key={v} variant="outline" className={cn("mr-0.5 font-normal", (v === "*" || v === "delete" || v === "escalate" || v === "impersonate") && "border-primary/50 text-primary")}>{v}</Badge>
                ))}
              </td>
              <td className="py-1">{(r.apiGroups ?? []).map((g: string) => g || "core").join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
export const RolesView = simpleView(R.roles, [], { details: (o) => <Rules o={o} /> });
export const ClusterRolesView = simpleView(R.clusterroles, [], { details: (o) => <Rules o={o} /> });

function Binding({ o }: { o: any }) {
  return (
    <Section title="Binding">
      <Fields rows={[["Role", `${o.roleRef?.kind}/${o.roleRef?.name}`]]} />
      <table className="mt-2 w-full text-xs">
        <thead><tr className="text-left text-muted-foreground"><th className="font-normal">Kind</th><th className="font-normal">Name</th><th className="font-normal">Namespace</th></tr></thead>
        <tbody>{(o.subjects ?? []).map((s: any, i: number) => (
          <tr key={i}><td>{s.kind}</td><td>{s.name}</td><td>{s.namespace ?? ""}</td></tr>
        ))}</tbody>
      </table>
    </Section>
  );
}
const bindingCols = [
  col("role", "Role", (o: any) => `${o.roleRef?.kind}/${o.roleRef?.name}`),
  col("subjects", "Subjects", (o: any) => (o.subjects ?? []).map((s: any) => `${s.kind}:${s.name}`).join(", "), (v) => <Muted>{v}</Muted>),
];
export const RoleBindingsView = simpleView(R.rolebindings, bindingCols, { details: (o) => <Binding o={o} /> });
export const ClusterRoleBindingsView = simpleView(R.clusterrolebindings, bindingCols, { details: (o) => <Binding o={o} /> });
