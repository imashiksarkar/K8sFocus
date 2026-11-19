import { useEffect, useMemo, useRef, useState } from "react";
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
import { VIEWS } from "@/features/registry";
import { CustomResourceView } from "@/features/crds/views";
import { CommandPalette, type PaletteAction } from "@/features/palette/CommandPalette";
import { PreferencesDialog } from "@/features/prefs/PreferencesDialog";
import { ShortcutsDialog } from "@/features/prefs/ShortcutsDialog";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useWatch } from "@/lib/useWatch";
import { Dock } from "@/components/dock/Dock";
import type { DockTab } from "@/components/dock/types";
import type { KObject } from "@/lib/resources";
import { R } from "@/lib/resources";
import { NamespacePicker } from "@/features/NamespacePicker";

/** App shell. Layout mirrors Lens: hotbar | cluster sidebar | main view | status bar. */
export default function App() {
  const [open, setOpen] = useState<string>("Workloads");
  const [active, setActive] = useState("Cluster/Overview");
  const [addOpen, setAddOpen] = useState(false);
  const [saved, setSaved] = useState<SavedCluster[]>([]);
  const [connecting, setConnecting] = useState<string>();
  const [connectError, setConnectError] = useState<string>();
  const [cluster, setCluster] = useState<ClusterInfo>();
  const [editorTarget, setEditorTarget] = useState<EditorTarget>();
  const [deleteTarget, setDeleteTarget] = useState<ObjRef>();
  // T17: bottom dock
  const [dockTabs, setDockTabs] = useState<DockTab[]>([]);
  // T27: command palette + shortcuts
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [focusUid, setFocusUid] = useState<string>();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [dockActive, setDockActive] = useState<string>();
  const [dockOpen, setDockOpen] = useState(true);
  const [dockHeight, setDockHeight] = useState(() => {
    try { return Number(localStorage.getItem("dockHeight")) || 320; } catch { return 320; }
  });
  function resizeDock(h: number) {
    setDockHeight(h);
    try { localStorage.setItem("dockHeight", String(h)); } catch { /* ignore */ }
  }
  function openPodTab(kind: "logs" | "shell", pod: KObject, container?: string) {
    if (!cluster) return;
    const containers = [
      ...(kind === "logs" ? (pod.spec?.initContainers ?? []).map((c: any) => c.name) : []),
      ...(pod.spec?.containers ?? []).map((c: any) => c.name),
    ];
    const c = container ?? pod.metadata.annotations?.["kubectl.kubernetes.io/default-container"] ?? pod.spec?.containers?.[0]?.name;
    // logs reuse an existing tab; every shell request opens a new session
    const id = kind === "logs"
      ? `logs:${cluster.context}/${pod.metadata.namespace}/${pod.metadata.name}/${c}`
      : `shell:${cluster.context}/${pod.metadata.namespace}/${pod.metadata.name}/${c}/${Date.now()}`;
    setDockTabs((tabs) => tabs.some((t) => t.id === id) ? tabs : [...tabs, {
      id, kind, title: `${kind === "shell" ? "sh: " : ""}${pod.metadata.name}${containers.length > 1 ? ` · ${c}` : ""}`,
      context: cluster.context, namespace: pod.metadata.namespace!, pod: pod.metadata.name, containers, container: c,
    }]);
    setDockActive(id);
    setDockOpen(true);
  }
  function openTerminal() {
    const n = dockTabs.filter((t) => t.kind === "terminal").length + 1;
    const id = `terminal:${Date.now()}`;
    setDockTabs((tabs) => [...tabs, { id, kind: "terminal", title: `Terminal ${n}`, context: cluster?.context }]);
    setDockActive(id);
    setDockOpen(true);
  }
  const openLogs = (pod: KObject, container?: string) => openPodTab("logs", pod, container);
  const openShell = (pod: KObject, container?: string) => openPodTab("shell", pod, container);
  function closeTab(id: string) {
    setDockTabs((tabs) => {
      const next = tabs.filter((t) => t.id !== id);
      if (dockActive === id) setDockActive(next[next.length - 1]?.id);
      return next;
    });
  }
  const savedCluster = cluster && saved.find((c) => c.context === cluster.context);
  // T16: CRDs drive a dynamic "Custom Resources" sidebar section
  const { items: crds } = useWatch(cluster?.context, R.crds);
  const crdGroups = useMemo(() => {
    const m = new Map<string, typeof crds>();
    for (const c of crds) {
      const g = c.spec?.group ?? "";
      m.set(g, [...(m.get(g) ?? []), c]);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([g, list]) => [g, list.sort((a, b) => a.spec.names.kind.localeCompare(b.spec.names.kind))] as const);
  }, [crds]);
  const activeCrd = active.startsWith("Custom Resources/crd:")
    ? crds.find((c) => c.metadata.name === active.slice("Custom Resources/crd:".length))
    : undefined;
  const title = activeCrd ? activeCrd.spec.names.kind : active.split("/")[1];
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
    setActive("Cluster/Overview");
  }

  const actions: PaletteAction[] = [
    { id: "terminal", label: "New local terminal", shortcut: "⌘T", run: openTerminal },
    { id: "dock", label: dockOpen ? "Hide dock" : "Show dock", shortcut: "⌘J", run: () => setDockOpen((o) => !o), disabled: !dockTabs.length },
    { id: "create", label: "Create resource from YAML", shortcut: "⌘N", run: () => setEditorTarget({ mode: "create" }), disabled: !cluster },
    { id: "add", label: "Add cluster…", run: () => setAddOpen(true) },
    { id: "prefs", label: "Preferences…", shortcut: "⌘,", run: () => setPrefsOpen(true) },
    { id: "shortcuts", label: "Keyboard shortcuts", run: () => setShortcutsOpen(true) },
    { id: "overview", label: "Go to cluster overview", run: () => setActive("Cluster/Overview"), disabled: !cluster },
  ];

  // T29: native menu → actions (menu owns ⌘K ⌘, ⌘J ⌘T ⌘N ⌘⇧O)
  const menuRef = useRef<(id: string) => void>(() => {});
  menuRef.current = (id: string) => {
    switch (id) {
      case "palette": setPaletteOpen((o) => !o); break;
      case "preferences": setPrefsOpen(true); break;
      case "dock": if (dockTabs.length) setDockOpen((o) => !o); break;
      case "terminal": openTerminal(); break;
      case "create": if (cluster) setEditorTarget({ mode: "create" }); break;
      case "add-cluster": setAddOpen(true); break;
      case "overview": if (cluster) setActive("Cluster/Overview"); break;
      case "shortcuts": setShortcutsOpen(true); break;
      case "roadmap": openUrl("https://github.com/imashiksarkar/K8sFocus").catch(() => {}); break;
    }
  };
  useEffect(() => {
    const un = listen<string>("menu", (e) => menuRef.current(e.payload));
    return () => { un.then((f) => f()); };
  }, []);

  // window title shows the active cluster
  const windowTitle = cluster ? `${savedCluster?.name ?? cluster.context} — K8sFocus` : "K8sFocus";
  useEffect(() => { getCurrentWindow().setTitle(windowTitle).catch(() => {}); }, [windowTitle]);

  // global shortcuts (skip when typing in an editor/terminal, except ⌘K)
  const shortcutRef = useRef<(e: KeyboardEvent) => void>(() => {});
  shortcutRef.current = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    const inEditor = !!(e.target as HTMLElement).closest?.(".monaco-editor, .xterm");
    // these are native menu accelerators; the menu fires them (avoid double-handling)
    if (["k", ",", "j", "t", "n"].includes(k)) { e.preventDefault(); return; }
    if (inEditor) return;
    if (/^[1-9]$/.test(k) && saved[Number(k) - 1]) { e.preventDefault(); selectSaved(saved[Number(k) - 1]); }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => shortcutRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

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
            onSettings={() => setPrefsOpen(true)}
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
                  const single = g.items.length === 1 && g.label !== "Custom Resources";
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
                                    !VIEWS[key] && "opacity-45",
                                    active === key && "bg-sidebar-accent text-primary",
                                  )}
                                >
                                  {it}
                                </button>
                              </li>
                            );
                          })}
                          {g.label === "Custom Resources" && crdGroups.map(([group, list]) => (
                            <li key={group}>
                              <p className="mt-2 truncate px-2 text-[11px] font-semibold text-muted-foreground" title={group}>{group}</p>
                              <ul>
                                {list.map((c) => {
                                  const key = `Custom Resources/crd:${c.metadata.name}`;
                                  return (
                                    <li key={key}>
                                      <button
                                        onClick={() => setActive(key)}
                                        title={c.metadata.name}
                                        className={cn(
                                          "w-full truncate rounded-md px-2 py-1 text-left text-sidebar-foreground/70 hover:bg-sidebar-accent",
                                          active === key && "bg-sidebar-accent text-primary",
                                        )}
                                      >
                                        {c.spec.names.kind}
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            </li>
                          ))}
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
              <h1 className="text-sm font-semibold">{title}</h1>
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
            {cluster && (VIEWS[active] || activeCrd) ? (
              <ClusterContext.Provider value={{
                context: cluster.context, readOnly,
                openEditor: setEditorTarget, confirmDelete: setDeleteTarget, openLogs, openShell,
                focusUid, clearFocus: () => setFocusUid(undefined),
              }}>
                {(() => {
                  if (activeCrd) {
                    return <CustomResourceView key={`${cluster.context}/${active}`} crd={activeCrd} context={cluster.context} namespaces={namespaces} />;
                  }
                  const View = VIEWS[active];
                  return <View key={`${cluster.context}/${active}`} context={cluster.context} namespaces={namespaces} navigate={setActive} />;
                })()}
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
            <Dock
              tabs={dockTabs} active={dockActive} open={dockOpen} height={dockHeight}
              onActivate={setDockActive} onClose={closeTab}
              onToggle={() => setDockOpen((o) => !o)} onResize={resizeDock}
            />
          </main>
        </div>

        {/* Status bar */}
        <footer className="flex h-6 items-center gap-3 border-t bg-sidebar px-3 text-xs text-muted-foreground">
          <button className="flex items-center gap-1 hover:text-foreground" onClick={openTerminal}
            title={cluster ? `New local terminal (kubectl → ${cluster.context})` : "New local terminal"}>
            <TerminalSquare className="size-3.5" />
            <span>Terminal</span>
          </button>
          {dockTabs.length > 0 && (
            <button className="hover:text-foreground" onClick={() => setDockOpen((o) => !o)} title="Show / hide dock">
              Dock ({dockTabs.length})
            </button>
          )}
          <button className="ml-auto hover:text-foreground" onClick={() => setPaletteOpen(true)}>⌘K Command palette</button>
          <span>v0.1.0</span>
        </footer>
      </div>
      <AddClusterDialog open={addOpen} onOpenChange={setAddOpen} onConnected={onConnected} />
      <PreferencesDialog open={prefsOpen} onOpenChange={setPrefsOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <CommandPalette
        open={paletteOpen} onOpenChange={setPaletteOpen}
        context={cluster?.context} clusters={saved} crds={crds} actions={actions}
        onNavigate={(key) => { setActive(key); const g = key.split("/")[0]; if (g !== active.split("/")[0]) setOpen(g); }}
        onCluster={selectSaved}
        onPickResource={(page, o) => { setActive(page); setOpen(page.split("/")[0]); setFocusUid(o.metadata.uid); }}
      />
      {cluster && (
        <>
          <YamlEditor context={cluster.context} target={editorTarget} readOnly={readOnly} onClose={() => setEditorTarget(undefined)} />
          <DeleteDialog context={cluster.context} obj={deleteTarget} onClose={() => setDeleteTarget(undefined)} />
        </>
      )}
    </TooltipProvider>
  );
}
