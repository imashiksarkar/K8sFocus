import "@/lib/monaco";
import { useCallback, useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { History, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResourceTable } from "@/components/resource-table/ResourceTable";
import { ConfirmAction } from "@/components/editor/ConfirmAction";
import { useCluster } from "@/lib/cluster-context";
import { age } from "@/lib/k8s";
import { cn } from "@/lib/utils";
import { helm, helmDate, type HelmRelease, type HelmRevision } from "./api";

const POLL = 10_000;
const c = createColumnHelper<HelmRelease>();
const statusColor = (s: string) =>
  s === "deployed" ? "text-emerald-400" : s === "failed" ? "text-destructive" : s.startsWith("pending") ? "text-primary" : "text-muted-foreground";
const relId = (r: HelmRelease) => `${r.namespace}/${r.name}`;

export function HelmReleasesView({ context, namespaces }: { context: string; namespaces: string[] }) {
  const [items, setItems] = useState<HelmRelease[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const single = namespaces.length === 1 ? namespaces[0] : undefined;

  const load = useCallback(() => {
    helm.list(context, single)
      .then((r) => { setItems(r); setError(undefined); })
      .catch((e) => setError(String(e)))
      .finally(() => setReady(true));
  }, [context, single]);

  useEffect(() => {
    setReady(false); load();
    const t = setInterval(load, POLL);
    return () => clearInterval(t);
  }, [load]);

  const shown = useMemo(
    () => (namespaces.length > 1 ? items.filter((r) => namespaces.includes(r.namespace)) : items),
    [items, namespaces],
  );
  const columns = useMemo(() => [
    c.accessor("name", { header: "Name", enableHiding: false, cell: (i) => <span className="font-medium">{i.getValue()}</span> }),
    c.accessor("namespace", { header: "Namespace" }),
    c.accessor("chart", { header: "Chart" }),
    c.accessor("app_version", { header: "App Version" }),
    c.accessor((r) => Number(r.revision), { id: "revision", header: "Revision" }),
    c.accessor((r) => helmDate(r.updated), { id: "updated", header: "Updated", sortDescFirst: true, cell: (i) => `${age(i.getValue())} ago` }),
    c.accessor("status", { header: "Status", cell: (i) => <span className={statusColor(i.getValue())}>{i.getValue()}</span> }),
  ] as ColumnDef<HelmRelease, any>[], []);

  const rel = selected ? shown.find((r) => relId(r) === selected) : undefined;

  return (
    <div className="flex min-h-0 flex-1">
      <ResourceTable
        id="helm-releases" items={shown} columns={columns} getRowId={relId}
        searchText={(r) => `${r.name} ${r.namespace} ${r.chart}`}
        ready={ready} error={error}
        defaultSort={[{ id: "namespace", desc: false }, { id: "name", desc: false }]}
        onRowClick={(r) => setSelected(relId(r) === selected ? undefined : relId(r))}
        selectedRowId={selected}
        toolbar={<Button variant="ghost" size="sm" className="h-7 text-xs" onClick={load}><RefreshCw /> Refresh</Button>}
      />
      {rel && <ReleasePanel key={relId(rel)} rel={rel} onClose={() => setSelected(undefined)} onChanged={load} />}
    </div>
  );
}

const TABS = [
  ["values", "Values"], ["allValues", "All values"], ["manifest", "Manifest"], ["notes", "Notes"], ["history", "History"],
] as const;

function ReleasePanel({ rel, onClose, onChanged }: { rel: HelmRelease; onClose: () => void; onChanged: () => void }) {
  const { context, readOnly } = useCluster();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("values");
  const [text, setText] = useState<string>();
  const [history, setHistory] = useState<HelmRevision[]>();
  const [error, setError] = useState<string>();
  const [uninstall, setUninstall] = useState(false);
  const [typed, setTyped] = useState("");
  const [rollbackTo, setRollbackTo] = useState<HelmRevision>();

  useEffect(() => {
    setText(undefined); setError(undefined);
    if (tab === "history") {
      helm.history(context, rel.namespace, rel.name)
        .then((h) => setHistory([...h].reverse())).catch((e) => setError(String(e)));
    } else {
      helm.get(context, { namespace: rel.namespace, name: rel.name, what: tab })
        .then(setText).catch((e) => setError(String(e)));
    }
  }, [tab, context, rel.namespace, rel.name, rel.revision]);

  return (
    <aside className="flex w-[640px] max-w-[55%] shrink-0 flex-col border-l bg-card">
      <header className="flex h-12 items-center gap-2 border-b px-4">
        <span className="text-xs text-muted-foreground">Release</span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{rel.name}</h2>
        <Button variant="ghost" size="icon" className="size-7 hover:text-destructive" disabled={readOnly}
          title={readOnly ? "Cluster is read-only" : "Uninstall"} onClick={() => { setTyped(""); setUninstall(true); }}><Trash2 /></Button>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose}><X /></Button>
      </header>
      <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 border-b px-4 py-3 text-sm">
        <span className="text-muted-foreground">Namespace</span><span>{rel.namespace}</span>
        <span className="text-muted-foreground">Chart</span><span>{rel.chart}</span>
        <span className="text-muted-foreground">App version</span><span>{rel.app_version}</span>
        <span className="text-muted-foreground">Revision</span><span>{rel.revision}</span>
        <span className="text-muted-foreground">Status</span><span className={statusColor(rel.status)}>{rel.status}</span>
        <span className="text-muted-foreground">Updated</span><span>{new Date(helmDate(rel.updated)).toLocaleString()}</span>
      </div>
      <div className="flex gap-1 border-b px-2 py-1">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn("rounded-md px-2 py-1 text-xs", tab === k ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-secondary/60")}>{l}</button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {error && <p className="m-3 rounded-md bg-destructive/15 p-2 text-xs text-destructive select-text">{error}</p>}
        {tab === "history" ? (
          !history ? <Loading /> : (
            <ul className="divide-y text-sm">
              {history.map((h) => (
                <li key={h.revision} className="flex items-center gap-2 px-4 py-2">
                  <Badge variant={String(h.revision) === rel.revision ? "default" : "secondary"}>#{h.revision}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{h.chart} <span className="text-muted-foreground">· app {h.app_version}</span></div>
                    <div className="truncate text-xs text-muted-foreground" title={h.description}>
                      <span className={statusColor(h.status)}>{h.status}</span> · {age(helmDate(h.updated))} ago · {h.description}
                    </div>
                  </div>
                  {String(h.revision) !== rel.revision && (
                    <Button variant="outline" size="sm" className="h-6 text-xs" disabled={readOnly}
                      title={readOnly ? "Cluster is read-only" : ""} onClick={() => setRollbackTo(h)}><History /> Roll back</Button>
                  )}
                </li>
              ))}
            </ul>
          )
        ) : text === undefined ? (!error && <Loading />) : (
          <Editor value={text || "# (empty)"} language={tab === "notes" ? "plaintext" : "yaml"} theme="k8sfocus" height="100%"
            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false, wordWrap: tab === "notes" ? "on" : "off" }} />
        )}
      </div>

      <ConfirmAction
        open={uninstall} onOpenChange={setUninstall}
        title={`Uninstall release “${rel.name}”?`}
        description={<>Context <b>{context}</b>, namespace <b>{rel.namespace}</b>. Runs <code>helm uninstall</code>: all resources of this release are deleted. Type the release name to confirm.</>}
        confirmLabel="Uninstall" destructive disabled={typed !== rel.name}
        onConfirm={async () => { await helm.uninstall(context, rel.namespace, rel.name); onChanged(); onClose(); }}
      >
        <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={rel.name} />
      </ConfirmAction>
      <ConfirmAction
        open={!!rollbackTo} onOpenChange={(o) => !o && setRollbackTo(undefined)}
        title={`Roll back “${rel.name}” to revision ${rollbackTo?.revision}?`}
        description={<>Context <b>{context}</b>, namespace <b>{rel.namespace}</b>. Runs <code>helm rollback {rel.name} {rollbackTo?.revision}</code> ({rollbackTo?.chart}). A new revision is created.</>}
        confirmLabel="Roll back"
        onConfirm={async () => { await helm.rollback(context, rel.namespace, rel.name, rollbackTo!.revision); onChanged(); }}
      />
    </aside>
  );
}

const Loading = () => <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</p>;
