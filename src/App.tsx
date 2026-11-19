import { useEffect, useState } from "react";
import { ChevronRight, Plus, TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NAV } from "@/components/layout/nav";
import { cn } from "@/lib/utils";
import { catalog, isReadOnly, k8s, type ClusterInfo, type ObjRef, type SavedCluster } from "@/lib/k8s";
import { ClusterContext } from "@/lib/cluster-context";
import { YamlEditor, type EditorTarget } from "@/components/editor/YamlEditor";
import { DeleteDialog } from "@/components/editor/DeleteDialog";
import { ReadOnlyToggle } from "@/features/ReadOnlyToggle";
import { Hotbar } from "@/features/Hotbar";
import { AddClusterDialog } from "@/features/AddClusterDialog";
import { PodsView } from "@/features/PodsView";
import { NamespacePicker } from "@/features/NamespacePicker";

/** App shell. Layout mirrors Lens: hotbar | cluster sidebar | main view | status bar. */
export default function App() {
  const [open, setOpen] = useState<string>("Workloads");
  const [active, setActive] = useState("Workloads/Pods");
  const [addOpen, setAddOpen] = useState(false);
  const [saved, setSaved] = useState<SavedCluster[]>([]);
  const [connecting, setConnecting] = useState<string>();
  const [connectError, setConnectError] = useState<string>();
  const [cluster, setCluster] = useState<ClusterInfo>();
  const [editorTarget, setEditorTarget] = useState<EditorTarget>();
  const [deleteTarget, setDeleteTarget] = useState<ObjRef>();
  const savedCluster = cluster && saved.find((c) => c.context === cluster.context);
  const readOnly = isReadOnly(savedCluster);
  function setReadOnly(ro: boolean) {
    if (!cluster) return;
    updateSaved(saved.map((c) => (c.context === cluster.context ? { ...c, readOnly: ro } : c)));
  }
  // T4: namespace selection remembered per cluster (empty = all)
  const [nsByCluster, setNsByCluster] = useState<Record<string, string[]>>(() => {
    try { return JSON.parse(localStorage.getItem("nsByCluster") ?? "{}"); } catch { return {}; }
  });
  const namespaces = (cluster && nsByCluster[cluster.context]) || [];
  function setNamespaces(v: string[]) {
    if (!cluster) return;
    const next = { ...nsByCluster, [cluster.context]: v };
    setNsByCluster(next);
    try { localStorage.setItem("nsByCluster", JSON.stringify(next)); } catch { /* ignore */ }
  }

  useEffect(() => {
    catalog.load().then(setSaved).catch((e) => setConnectError(`Could not load saved clusters: ${e}`));
  }, []);

  function updateSaved(next: SavedCluster[]) {
    setSaved(next);
    catalog.save(next).catch((e) => setConnectError(`Could not save clusters: ${e}`));
    if (cluster && !next.some((c) => c.context === cluster.context)) setCluster(undefined);
  }

  async function selectSaved(c: SavedCluster) {
    if (cluster?.context === c.context) return;
    setConnecting(c.context);
    setConnectError(undefined);
    try {
      onConnected(await k8s.connect(c.context));
    } catch (e) {
      setConnectError(`${c.name}: ${e}`);
    } finally {
      setConnecting(undefined);
    }
  }

  function onConnected(c: ClusterInfo) {
    setSaved((cs) => {
      if (cs.some((x) => x.context === c.context)) return cs;
      const next = [...cs, { context: c.context, name: c.context }];
      catalog.save(next).catch(() => {});
      return next;
    });
    setConnectError(undefined);
    setCluster(c);
    setActive("Workloads/Pods");
    setOpen("Workloads");
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col">
        <div className="flex min-h-0 flex-1">
          <Hotbar
            clusters={saved}
            active={cluster?.context}
            connecting={connecting}
            onSelect={selectSaved}
            onAdd={() => setAddOpen(true)}
            onChange={updateSaved}
          />

          {/* Cluster sidebar */}
          <nav className="flex w-60 flex-col border-r bg-sidebar">
            <div className="flex h-12 items-center gap-2 border-b px-4 text-sm font-semibold">
              <span className={cn("size-2 rounded-full", cluster ? "bg-emerald-400" : "bg-muted-foreground")} />
              <span className="truncate">
                {cluster ? (saved.find((c) => c.context === cluster.context)?.name ?? cluster.context) : "No cluster selected"}
              </span>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <ul className="p-2 text-sm">
                {NAV.map((g) => {
                  const single = g.items.length === 1;
                  const expanded = open === g.label;
                  return (
                    <li key={g.label}>
                      <button
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sidebar-foreground/80 hover:bg-sidebar-accent",
                          single && active === `${g.label}/${g.items[0]}` && "bg-sidebar-accent text-primary",
                        )}
                        onClick={() => (single ? setActive(`${g.label}/${g.items[0]}`) : setOpen(expanded ? "" : g.label))}
                      >
                        <g.icon className="size-4" />
                        <span className="flex-1 text-left">{g.label}</span>
                        {!single && <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />}
                      </button>
                      {!single && expanded && (
                        <ul className="mb-1 ml-6 border-l pl-2">
                          {g.items.map((it) => {
                            const key = `${g.label}/${it}`;
                            return (
                              <li key={it}>
                                <button
                                  onClick={() => setActive(key)}
                                  className={cn(
                                    "w-full rounded-md px-2 py-1 text-left text-sidebar-foreground/70 hover:bg-sidebar-accent",
                                    active === key && "bg-sidebar-accent text-primary",
                                  )}
                                >
                                  {it}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          </nav>

          {/* Main */}
          <main className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-12 items-center gap-3 border-b px-4">
              <h1 className="text-sm font-semibold">{active.split("/")[1]}</h1>
              {cluster && (
                <>
                  <NamespacePicker context={cluster.context} value={namespaces} onChange={setNamespaces} />
                  <Button
                    variant="outline" size="sm" className="ml-auto h-7 text-xs"
                    onClick={() => setEditorTarget({ mode: "create", namespace: namespaces.length === 1 ? namespaces[0] : undefined })}
                  >
                    <Plus /> Create
                  </Button>
                  <ReadOnlyToggle name={savedCluster?.name ?? cluster.context} readOnly={readOnly} onChange={setReadOnly} />
                  <Badge variant="secondary">{cluster.version}</Badge>
                </>
              )}
            </header>
            {cluster && connectError && (
              <button
                onClick={() => setConnectError(undefined)}
                className="mx-4 mt-2 rounded-md bg-destructive/15 p-2 text-left text-xs whitespace-pre-wrap text-destructive"
              >
                {connectError} <span className="opacity-60">(click to dismiss)</span>
              </button>
            )}
            {cluster && active === "Workloads/Pods" ? (
              <ClusterContext.Provider value={{
                context: cluster.context, readOnly,
                openEditor: setEditorTarget, confirmDelete: setDeleteTarget,
              }}>
                <PodsView key={cluster.context} context={cluster.context} namespaces={namespaces} />
              </ClusterContext.Provider>
            ) : cluster ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Not implemented yet — see ROADMAP.md
              </div>
            ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <p className="text-lg font-semibold">
                  K8s<span className="text-primary">Focus</span>
                </p>
                {connectError && (
                  <p className="mx-auto mt-3 max-w-md whitespace-pre-wrap rounded-md bg-destructive/15 p-2 text-left text-xs text-destructive select-text">
                    {connectError}
                  </p>
                )}
                <p className="mt-1 text-sm text-muted-foreground">
                  {saved.length ? "Pick a cluster from the left bar, or add one." : "Connect a cluster from your kubeconfig to get started."}
                </p>
                <Button className="mt-4" onClick={() => setAddOpen(true)}><Plus /> Add cluster</Button>
              </div>
            </div>
            )}
          </main>
        </div>

        {/* Status bar */}
        <footer className="flex h-6 items-center gap-3 border-t bg-sidebar px-3 text-xs text-muted-foreground">
          <TerminalSquare className="size-3.5" />
          <span>Terminal</span>
          <span className="ml-auto">v0.1.0</span>
        </footer>
      </div>
      <AddClusterDialog open={addOpen} onOpenChange={setAddOpen} onConnected={onConnected} />
      {cluster && (
        <>
          <YamlEditor context={cluster.context} target={editorTarget} readOnly={readOnly} onClose={() => setEditorTarget(undefined)} />
          <DeleteDialog context={cluster.context} obj={deleteTarget} onClose={() => setDeleteTarget(undefined)} />
        </>
      )}
    </TooltipProvider>
  );
}
