import { useEffect, useMemo, useState } from "react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Ban, CheckCircle2, Loader2, LogOut, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { commonColumns } from "@/components/resource-table/columns";
import { ResourceView } from "@/components/resource-view/ResourceView";
import { Conditions, Fields, KVChips, Section } from "@/components/details/parts";
import { ConfirmAction } from "@/components/editor/ConfirmAction";
import { useCluster } from "@/lib/cluster-context";
import { fmtBytes, k8sWrite, parseQuantity, type DrainPlan, type DrainResult } from "@/lib/k8s";
import { R, type KObject } from "@/lib/resources";
import { useWatch } from "@/lib/useWatch";
import { cn } from "@/lib/utils";
import { podStatus } from "../PodsView";
import { fmtCpu, fmtMem, useMetrics, type MetricsSnapshot } from "@/lib/metrics";
import { Sparkline, UsageBar } from "@/components/metrics/Sparkline";
import { MetricsHint } from "@/components/metrics/MetricsHint";
import { ErrorCard } from "@/components/ui/ErrorCard";

type ViewProps = { context: string; namespaces: string[] };
const c = createColumnHelper<KObject>();

const roles = (n: KObject) =>
  Object.keys(n.metadata.labels ?? {}).filter((l) => l.startsWith("node-role.kubernetes.io/"))
    .map((l) => l.split("/")[1]).join(", ") || "<none>";

export function nodeStatus(n: KObject): string {
  const ready = (n.status?.conditions ?? []).find((x: any) => x.type === "Ready");
  const s = ready?.status === "True" ? "Ready" : ready?.status === "False" ? "NotReady" : "Unknown";
  return n.spec?.unschedulable ? `${s},SchedulingDisabled` : s;
}
const problems = (n: KObject) =>
  (n.status?.conditions ?? []).filter((x: any) => x.type !== "Ready" && x.status === "True").map((x: any) => x.type);

const internalIP = (n: KObject) => (n.status?.addresses ?? []).find((a: any) => a.type === "InternalIP")?.address ?? "";

function nodeColumns(m: MetricsSnapshot): ColumnDef<KObject, any>[] {
  const k = commonColumns<KObject>();
  return [
    k.name,
    c.accessor((n) => parseQuantity(n.status?.allocatable?.cpu), {
      id: "cpu", header: "CPU", cell: (i) => `${+i.getValue().toFixed(2)} cores`,
    }),
    c.accessor((n) => parseQuantity(n.status?.allocatable?.memory), {
      id: "memory", header: "Memory", cell: (i) => fmtBytes(i.getValue()),
    }),
    c.accessor((n) => Number(n.status?.allocatable?.pods ?? 0), { id: "podsCap", header: "Max Pods" }),
    c.accessor((n) => {
      const u = m.usage.get(n.metadata.name);
      return u ? u.cpu / (parseQuantity(n.status?.allocatable?.cpu) || 1) : -1;
    }, {
      id: "cpuUsage", header: "CPU Usage", sortDescFirst: true,
      cell: (i) => {
        const n = i.row.original; const u = m.usage.get(n.metadata.name);
        return u ? <span className="inline-flex items-center gap-2"><Sparkline data={m.history.get(n.metadata.name)?.cpu ?? []} />
          <UsageBar value={u.cpu} max={parseQuantity(n.status?.allocatable?.cpu)} label={`${fmtCpu(u.cpu)} of ${n.status?.allocatable?.cpu}`} /></span>
          : <span className="text-muted-foreground">—</span>;
      },
    }),
    c.accessor((n) => {
      const u = m.usage.get(n.metadata.name);
      return u ? u.memory / (parseQuantity(n.status?.allocatable?.memory) || 1) : -1;
    }, {
      id: "memUsage", header: "Memory Usage", sortDescFirst: true,
      cell: (i) => {
        const n = i.row.original; const u = m.usage.get(n.metadata.name);
        return u ? <span className="inline-flex items-center gap-2"><Sparkline data={m.history.get(n.metadata.name)?.memory ?? []} />
          <UsageBar value={u.memory} max={parseQuantity(n.status?.allocatable?.memory)} label={`${fmtMem(u.memory)} of ${fmtBytes(parseQuantity(n.status?.allocatable?.memory))}`} /></span>
          : <span className="text-muted-foreground">—</span>;
      },
    }),
    c.accessor((n) => n.spec?.taints?.length ?? 0, { id: "taints", header: "Taints" }),
    c.accessor(roles, { id: "roles", header: "Roles" }),
    c.accessor((n) => n.status?.nodeInfo?.kubeletVersion ?? "", { id: "version", header: "Version" }),
    c.accessor(internalIP, { id: "ip", header: "Internal IP" }),
    c.accessor((n) => `${n.status?.nodeInfo?.operatingSystem ?? ""}/${n.status?.nodeInfo?.architecture ?? ""}`, { id: "os", header: "OS/Arch" }),
    k.age,
    c.accessor(nodeStatus, {
      id: "status", header: "Conditions",
      cell: (i) => {
        const s = i.getValue() as string;
        const extra = problems(i.row.original);
        return (
          <span className={cn(s.startsWith("Ready") ? (s.includes("Disabled") ? "text-primary" : "text-emerald-400") : "text-destructive")}>
            {s}{extra.length > 0 && <span className="text-destructive"> · {extra.join(", ")}</span>}
          </span>
        );
      },
    }),
  ];
}

function CordonButton({ node }: { node: KObject }) {
  const { context, readOnly } = useCluster();
  const [open, setOpen] = useState(false);
  const cordoned = !!node.spec?.unschedulable;
  return (
    <>
      <Button variant="ghost" size="icon" className="size-7" disabled={readOnly}
        title={readOnly ? "Cluster is read-only" : cordoned ? "Uncordon" : "Cordon"} onClick={() => setOpen(true)}>
        {cordoned ? <CheckCircle2 /> : <Ban />}
      </Button>
      <ConfirmAction
        open={open} onOpenChange={setOpen}
        title={`${cordoned ? "Uncordon" : "Cordon"} node “${node.metadata.name}”?`}
        description={cordoned
          ? <>New pods can be scheduled on this node again.</>
          : <>No new pods will be scheduled on this node. Existing pods keep running.</>}
        confirmLabel={cordoned ? "Uncordon" : "Cordon"}
        onConfirm={() => k8sWrite.cordon(context, node.metadata.name, !cordoned)}
      />
    </>
  );
}

function DrainButton({ node }: { node: KObject }) {
  const { context, readOnly } = useCluster();
  const name = node.metadata.name;
  const [open, setOpen] = useState(false);
  const [emptyDir, setEmptyDir] = useState(false);
  const [force, setForce] = useState(false);
  const [plan, setPlan] = useState<DrainPlan[]>();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [results, setResults] = useState<DrainResult[]>();

  useEffect(() => {
    if (!open || results) return;
    setPlan(undefined); setError(undefined);
    k8sWrite.drainPlan(context, name, emptyDir, force).then(setPlan).catch((e) => setError(String(e)));
  }, [open, context, name, emptyDir, force, results]);

  function reset(o: boolean) {
    if (busy) return;
    setOpen(o);
    if (!o) { setResults(undefined); setTyped(""); setEmptyDir(false); setForce(false); }
  }

  async function run() {
    setBusy(true); setError(undefined);
    try { setResults(await k8sWrite.drain(context, name, emptyDir, force)); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  const evict = plan?.filter((p) => p.action === "evict") ?? [];
  const skip = plan?.filter((p) => p.action === "skip") ?? [];
  const failed = results?.filter((r) => !r.ok) ?? [];

  return (
    <>
      <Button variant="ghost" size="icon" className="size-7 hover:text-destructive" disabled={readOnly}
        title={readOnly ? "Cluster is read-only" : "Drain"} onClick={() => setOpen(true)}>
        <LogOut />
      </Button>
      <Dialog open={open} onOpenChange={reset}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{results ? "Drain result" : `Drain node “${name}”?`}</DialogTitle>
            <DialogDescription>
              {results
                ? `${results.length - failed.length} evicted, ${failed.length} failed. The node stays cordoned — uncordon it when maintenance is done.`
                : <>Context <b>{context}</b>. The node is cordoned, then the pods below are evicted (PodDisruptionBudgets are respected).</>}
            </DialogDescription>
          </DialogHeader>

          {!results && (
            <div className="flex flex-col gap-1.5 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox checked={emptyDir} onCheckedChange={(v) => setEmptyDir(!!v)} />
                Delete emptyDir data <span className="text-xs text-muted-foreground">(--delete-emptydir-data)</span>
              </label>
              <label className="flex items-center gap-2">
                <Checkbox checked={force} onCheckedChange={(v) => setForce(!!v)} />
                Evict pods without a controller <span className="text-xs text-muted-foreground">(--force — they will not come back)</span>
              </label>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto rounded-md border text-sm">
            {results ? (
              <ul className="divide-y">
                {results.map((r) => (
                  <li key={`${r.namespace}/${r.name}`} className="flex items-center gap-2 px-3 py-1.5">
                    {r.ok ? <CheckCircle2 className="size-4 text-emerald-400" /> : <XCircle className="size-4 text-destructive" />}
                    <span className="min-w-0 flex-1 truncate">{r.namespace}/{r.name}</span>
                    <span className={cn("text-xs", r.ok ? "text-muted-foreground" : "text-destructive")}>{r.message}</span>
                  </li>
                ))}
                {!results.length && <li className="p-3 text-muted-foreground">Nothing to evict.</li>}
              </ul>
            ) : !plan ? (
              <p className="flex items-center gap-2 p-3 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Checking pods…</p>
            ) : (
              <ul className="divide-y">
                {[...evict, ...skip].map((p) => (
                  <li key={`${p.namespace}/${p.name}`} className={cn("flex items-center gap-2 px-3 py-1.5", p.action === "skip" && "opacity-60")}>
                    <Badge variant={p.action === "evict" ? "destructive" : "secondary"} className="w-12 justify-center">{p.action}</Badge>
                    <span className="min-w-0 flex-1 truncate">{p.namespace}/{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!results && plan && (
            <p className="text-xs text-muted-foreground">
              {evict.length} pod(s) will be evicted, {skip.length} skipped. Type <b>{name}</b> to confirm.
            </p>
          )}
          {!results && <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} />}
          <ErrorCard error={error} />

          <DialogFooter>
            {results ? (
              <>
                {failed.length > 0 && <Button variant="outline" onClick={() => { setResults(undefined); setTyped(""); }}>Back</Button>}
                <Button onClick={() => reset(false)}>Close</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => reset(false)} disabled={busy}>Cancel</Button>
                <Button variant="destructive" disabled={busy || !plan || typed !== name} onClick={run}>
                  {busy && <Loader2 className="animate-spin" />} Drain
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NodePods({ node }: { node: KObject }) {
  const { context } = useCluster();
  const { items, ready } = useWatch(context, R.pods, [], { fieldSelector: `spec.nodeName=${node.metadata.name}` });
  const pods = useMemo(() => [...items].sort((a, b) =>
    `${a.metadata.namespace}/${a.metadata.name}`.localeCompare(`${b.metadata.namespace}/${b.metadata.name}`)), [items]);
  return (
    <Section title={`Pods (${pods.length})`}>
      {!ready ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <ul className="space-y-1 text-sm">
          {pods.map((p) => {
            const s = podStatus(p);
            return (
              <li key={p.metadata.uid} className="flex gap-2">
                <span className="min-w-0 flex-1 truncate">{p.metadata.name}</span>
                <span className="text-muted-foreground">{p.metadata.namespace}</span>
                <span className={cn(s === "Running" ? "text-emerald-400" : s === "Completed" ? "text-muted-foreground" : "text-primary")}>{s}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function NodeDetails({ node }: { node: KObject }) {
  const { context } = useCluster();
  const usage = useMetrics(context, "nodes").usage.get(node.metadata.name);
  const st = node.status ?? {};
  const info = st.nodeInfo ?? {};
  const res = (k: string, f: (q: string) => string) => `${f(st.capacity?.[k])} capacity · ${f(st.allocatable?.[k])} allocatable`;
  return (
    <>
      <Section title="Node">
        <Fields rows={[
          ["Status", nodeStatus(node)],
          ["Roles", roles(node)],
          ["Addresses", (st.addresses ?? []).map((a: any) => `${a.type}: ${a.address}`).join(", ")],
          ["CPU usage", usage && <UsageBar value={usage.cpu} max={parseQuantity(st.allocatable?.cpu)} label={fmtCpu(usage.cpu)} />],
          ["Memory usage", usage && <UsageBar value={usage.memory} max={parseQuantity(st.allocatable?.memory)} label={fmtMem(usage.memory)} />],
          ["CPU", res("cpu", (q) => `${+parseQuantity(q).toFixed(2)}`)],
          ["Memory", res("memory", (q) => fmtBytes(parseQuantity(q)))],
          ["Ephemeral storage", res("ephemeral-storage", (q) => fmtBytes(parseQuantity(q)))],
          ["Pods", res("pods", (q) => q ?? "")],
          ["Pod CIDR", node.spec?.podCIDR],
          ["Provider ID", node.spec?.providerID],
          ["Taints", node.spec?.taints?.length ? (
            <ul className="font-mono text-xs">{node.spec.taints.map((t: any) => (
              <li key={`${t.key}:${t.effect}`}>{t.key}{t.value ? `=${t.value}` : ""}:{t.effect}</li>
            ))}</ul>
          ) : undefined],
          ["Conditions", <Conditions items={st.conditions} />],
        ]} />
      </Section>
      <Section title="System">
        <Fields rows={[
          ["OS image", info.osImage],
          ["Kernel", info.kernelVersion],
          ["Arch", `${info.operatingSystem}/${info.architecture}`],
          ["Container runtime", info.containerRuntimeVersion],
          ["Kubelet", info.kubeletVersion],
          ["Labels", <KVChips map={node.metadata.labels} collapse />],
        ]} />
      </Section>
      <NodePods node={node} />
    </>
  );
}

export function NodesView(p: ViewProps) {
  const metrics = useMetrics(p.context, "nodes");
  const columns = useMemo(() => nodeColumns(metrics), [metrics]);
  return (
    <ResourceView {...p} resource={R.nodes} columns={columns}
      details={(n) => <NodeDetails node={n} />}
      actions={(n) => <><CordonButton node={n} /><DrainButton node={n} /></>}
      toolbar={<MetricsHint m={metrics} />} />
  );
}
