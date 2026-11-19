import { useCallback, useEffect, useMemo, useState } from "react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Database, Download, Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResourceTable } from "@/components/resource-table/ResourceTable";
import { cn } from "@/lib/utils";
import { helmCharts, type HelmChart, type HelmRepo } from "./api";
import { InstallDialog, type InstallTarget } from "./InstallDialog";

const c = createColumnHelper<HelmChart>();

export function HelmChartsView(_: { context: string; namespaces: string[] }) {
  const [charts, setCharts] = useState<HelmChart[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [reposOpen, setReposOpen] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [install, setInstall] = useState<InstallTarget>();

  const load = useCallback(() => {
    setReady(false);
    helmCharts.search("").then((r) => { setCharts(r); setError(undefined); })
      .catch((e) => setError(String(e))).finally(() => setReady(true));
  }, []);
  useEffect(load, [load]);

  const columns = useMemo(() => [
    c.accessor("name", { header: "Chart", enableHiding: false, cell: (i) => <span className="font-medium">{i.getValue()}</span> }),
    c.accessor((r) => r.name.split("/")[0], { id: "repo", header: "Repository" }),
    c.accessor("version", { header: "Version" }),
    c.accessor("app_version", { header: "App Version" }),
    c.accessor("description", { header: "Description", cell: (i) => <span className="text-muted-foreground" title={i.getValue()}>{i.getValue()}</span> }),
  ] as ColumnDef<HelmChart, any>[], []);

  const chart = selected ? charts.find((x) => x.name === selected) : undefined;

  return (
    <div className="flex min-h-0 flex-1">
      <ResourceTable
        id="helm-charts" items={charts} columns={columns} getRowId={(r) => r.name}
        searchText={(r) => `${r.name} ${r.description}`} ready={ready} error={error}
        defaultSort={[{ id: "name", desc: false }]}
        onRowClick={(r) => setSelected(r.name === selected ? undefined : r.name)} selectedRowId={selected}
        toolbar={<>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setReposOpen(true)}><Database /> Repositories</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={load}><RefreshCw /> Reload</Button>
        </>}
      />
      {chart && <ChartPanel key={chart.name} chart={chart} onClose={() => setSelected(undefined)}
        onInstall={() => setInstall({ mode: "install", chart: chart.name, version: chart.version })} />}
      <ReposDialog open={reposOpen} onOpenChange={setReposOpen} onChanged={load} />
      <InstallDialog target={install} onClose={() => setInstall(undefined)} />
    </div>
  );
}

function ChartPanel({ chart, onClose, onInstall }: { chart: HelmChart; onClose: () => void; onInstall: () => void }) {
  const [tab, setTab] = useState<"readme" | "values">("readme");
  const [text, setText] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    setText(undefined); setError(undefined);
    helmCharts.show(chart.name, tab, chart.version).then(setText).catch((e) => setError(String(e)));
  }, [chart.name, chart.version, tab]);
  return (
    <aside className="flex w-[600px] max-w-[50%] shrink-0 flex-col border-l bg-card">
      <header className="flex h-12 items-center gap-2 border-b px-4">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{chart.name} <span className="font-normal text-muted-foreground">{chart.version}</span></h2>
        <Button size="sm" className="h-7" onClick={onInstall}><Download /> Install</Button>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose}><X /></Button>
      </header>
      <p className="border-b px-4 py-2 text-sm text-muted-foreground">{chart.description}</p>
      <div className="flex gap-1 border-b px-2 py-1">
        {(["readme", "values"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("rounded-md px-2 py-1 text-xs", tab === t ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-secondary/60")}>
            {t === "readme" ? "README" : "Default values"}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {error && <p className="rounded-md bg-destructive/15 p-2 text-xs text-destructive">{error}</p>}
        {text === undefined && !error ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : (
          <pre className="font-mono text-xs whitespace-pre-wrap select-text">{text}</pre>
        )}
      </div>
    </aside>
  );
}

function ReposDialog({ open, onOpenChange, onChanged }: { open: boolean; onOpenChange: (o: boolean) => void; onChanged: () => void }) {
  const [repos, setRepos] = useState<HelmRepo[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const refresh = () => helmCharts.repos().then(setRepos).catch((e) => setError(String(e)));
  useEffect(() => { if (open) { setError(undefined); refresh(); } }, [open]);

  async function run(label: string, f: () => Promise<unknown>) {
    setBusy(label); setError(undefined);
    try { await f(); await refresh(); onChanged(); } catch (e) { setError(String(e)); } finally { setBusy(undefined); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Helm repositories</DialogTitle>
          <DialogDescription>Stored in your local helm config. Doesn't touch any cluster.</DialogDescription>
        </DialogHeader>
        <ul className="max-h-64 divide-y overflow-auto rounded-md border text-sm">
          {repos.map((r) => (
            <li key={r.name} className="flex items-center gap-2 px-3 py-1.5">
              <span className="font-medium">{r.name}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{r.url}</span>
              <Button variant="ghost" size="icon" className="size-7 hover:text-destructive" disabled={!!busy}
                onClick={() => run(`Removing ${r.name}…`, () => helmCharts.removeRepo(r.name))}><Trash2 /></Button>
            </li>
          ))}
          {!repos.length && <li className="px-3 py-2 text-muted-foreground">No repositories yet.</li>}
        </ul>
        <div className="flex gap-2">
          <Input placeholder="name (e.g. bitnami)" value={name} onChange={(e) => setName(e.target.value)} className="w-40" />
          <Input placeholder="https://charts.bitnami.com/bitnami" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button disabled={!!busy || !name || !url}
            onClick={() => run(`Adding ${name}…`, async () => { await helmCharts.addRepo(name, url); setName(""); setUrl(""); })}><Plus /> Add</Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={!!busy} onClick={() => run("Updating repositories…", helmCharts.updateRepos)}>
            <RefreshCw /> Update all
          </Button>
          {busy && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />{busy}</span>}
        </div>
        {error && <p className="rounded-md bg-destructive/15 p-2 text-xs text-destructive select-text">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
