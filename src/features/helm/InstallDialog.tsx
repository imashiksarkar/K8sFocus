import "@/lib/monaco";
import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCluster } from "@/lib/cluster-context";
import { helm, helmCharts } from "./api";

export type InstallTarget = {
  mode: "install" | "upgrade";
  chart: string; version?: string;
  name?: string; namespace?: string;
};

/** Install / upgrade a chart: edit values → Preview (server dry-run) → Install. */
export function InstallDialog({ target, onClose, onDone }: { target?: InstallTarget; onClose: () => void; onDone?: () => void }) {
  const { context, readOnly } = useCluster();
  const [chart, setChart] = useState("");
  const [version, setVersion] = useState("");
  const [versions, setVersions] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [ns, setNs] = useState("default");
  const [createNs, setCreateNs] = useState(true);
  const [values, setValues] = useState("");
  const [preview, setPreview] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!target) return;
    setChart(target.chart); setVersion(target.version ?? ""); setName(target.name ?? target.chart.split("/").pop() ?? "");
    setNs(target.namespace ?? "default"); setPreview(undefined); setError(undefined); setDone(false); setValues("");
    setBusy("Loading values…");
    const load = target.mode === "upgrade" && target.name && target.namespace
      ? helm.get(context, { namespace: target.namespace, name: target.name, what: "values" }).then((v) => (v.trim() === "null" ? "" : v))
      : helmCharts.show(target.chart, "values", target.version);
    load.then(setValues).catch((e) => setError(String(e))).finally(() => setBusy(undefined));
  }, [target, context]);

  useEffect(() => {
    if (!target || !chart.includes("/") || chart.startsWith("oci://")) { setVersions([]); return; }
    helmCharts.search(chart, true)
      .then((r) => setVersions(r.filter((c) => c.name === chart).map((c) => c.version).slice(0, 50)))
      .catch(() => setVersions([]));
  }, [target, chart]);

  const req = (dryRun: boolean) => ({ name, namespace: ns, chart, version: version || undefined, values, createNamespace: createNs, dryRun });

  async function runPreview() {
    setBusy("Rendering with the API server (dry run)…"); setError(undefined);
    try { setPreview(await helmCharts.install(context, req(true))); }
    catch (e) { setError(String(e)); } finally { setBusy(undefined); }
  }
  async function runInstall() {
    setBusy(target?.mode === "upgrade" ? "Upgrading…" : "Installing…"); setError(undefined);
    try { await helmCharts.install(context, req(false)); setDone(true); onDone?.(); setTimeout(onClose, 800); }
    catch (e) { setError(String(e)); } finally { setBusy(undefined); }
  }

  const verb = target?.mode === "upgrade" ? "Upgrade" : "Install";
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="flex h-[88vh] max-w-[90vw] flex-col gap-3 sm:max-w-[90vw]">
        <DialogHeader>
          <DialogTitle>{preview !== undefined ? `Preview — ${verb.toLowerCase()} ${name}` : `${verb} chart`}</DialogTitle>
          <DialogDescription>
            {preview !== undefined ? "Rendered by the API server (dry run). Nothing has been changed yet." : <>Context <b>{context}</b>. Runs <code>helm upgrade --install</code>.</>}
          </DialogDescription>
        </DialogHeader>

        {preview === undefined && (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            <label className="text-xs text-muted-foreground lg:col-span-2">Chart
              <Input value={chart} onChange={(e) => setChart(e.target.value)} disabled={target?.mode === "install"} />
            </label>
            <label className="text-xs text-muted-foreground">Version
              <Input list="chart-versions" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="latest" />
              <datalist id="chart-versions">{versions.map((v) => <option key={v} value={v} />)}</datalist>
            </label>
            <label className="text-xs text-muted-foreground">Release name
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={target?.mode === "upgrade"} />
            </label>
            <label className="text-xs text-muted-foreground">Namespace
              <Input value={ns} onChange={(e) => setNs(e.target.value)} disabled={target?.mode === "upgrade"} />
            </label>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
          {preview !== undefined ? (
            <Editor value={preview} language="yaml" theme="k8sfocus"
              options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false }} />
          ) : (
            <Editor value={values} onChange={(v) => setValues(v ?? "")} language="yaml" theme="k8sfocus"
              options={{ minimap: { enabled: false }, fontSize: 12, tabSize: 2, scrollBeyondLastLine: false }} />
          )}
        </div>

        {error && <p className="max-h-32 overflow-auto rounded-md bg-destructive/15 p-2 text-xs whitespace-pre-wrap text-destructive select-text">{error}</p>}

        <div className="flex items-center gap-3">
          {target?.mode === "install" && preview === undefined && (
            <label className="flex items-center gap-2 text-xs"><Checkbox checked={createNs} onCheckedChange={(v) => setCreateNs(!!v)} />Create namespace if missing</label>
          )}
          {readOnly && <span className="flex items-center gap-1 text-xs text-primary"><Lock className="size-3.5" /> Cluster is read-only — preview only.</span>}
          {busy && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />{busy}</span>}
          {done && <span className="text-xs text-emerald-400">{verb} complete ✓</span>}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={!!busy}>Cancel</Button>
            {preview === undefined ? (
              <Button onClick={runPreview} disabled={!!busy || !name || !ns || !chart}>Preview</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setPreview(undefined)} disabled={!!busy}><ArrowLeft /> Back to values</Button>
                <Button onClick={runInstall} disabled={!!busy || readOnly || done}>{verb}</Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
