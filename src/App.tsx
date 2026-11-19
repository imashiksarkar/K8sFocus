import { useEffect, useState } from "react";
import { ChevronRight, Plus, Settings2, TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { NAV } from "@/components/layout/nav";
import { cn } from "@/lib/utils";
import { k8s, type ClusterInfo } from "@/lib/k8s";
import { AddClusterDialog } from "@/features/AddClusterDialog";
import { PodsView } from "@/features/PodsView";

/**
 * App shell skeleton (Task T0). Layout mirrors Lens:
 * hotbar | cluster sidebar | main view, with a dock (terminal/logs) and status bar.
 * Everything here is static placeholder data until the Rust kube backend lands (T1+).
 */
export default function App() {
  const [open, setOpen] = useState<string>("Workloads");
  const [active, setActive] = useState("Workloads/Pods");
  const [addOpen, setAddOpen] = useState(false);
  const [clusters, setClusters] = useState<ClusterInfo[]>([]);
  const [cluster, setCluster] = useState<ClusterInfo>();
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [namespace, setNamespace] = useState("");

  useEffect(() => {
    setNamespaces([]);
    setNamespace("");
    if (cluster) k8s.listNamespaces(cluster.context).then(setNamespaces).catch(() => {});
  }, [cluster]);

  function onConnected(c: ClusterInfo) {
    setClusters((cs) => (cs.some((x) => x.context === c.context) ? cs : [...cs, c]));
    setCluster(c);
    setActive("Workloads/Pods");
    setOpen("Workloads");
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col">
        <div className="flex min-h-0 flex-1">
          {/* Hotbar */}
          <aside className="flex w-14 flex-col items-center gap-2 border-r bg-sidebar py-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary font-bold text-primary-foreground">
              K
            </div>
            {clusters.map((c) => (
              <Tooltip key={c.context}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setCluster(c)}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-md bg-secondary text-xs font-semibold uppercase",
                      cluster?.context === c.context && "ring-2 ring-primary",
                    )}
                  >
                    {c.context.slice(0, 2)}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{c.context}</TooltipContent>
              </Tooltip>
            ))}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setAddOpen(true)}><Plus /></Button>
              </TooltipTrigger>
              <TooltipContent side="right">Add cluster</TooltipContent>
            </Tooltip>
            <div className="mt-auto">
              <Button variant="ghost" size="icon"><Settings2 /></Button>
            </div>
          </aside>

          {/* Cluster sidebar */}
          <nav className="flex w-60 flex-col border-r bg-sidebar">
            <div className="flex h-12 items-center gap-2 border-b px-4 text-sm font-semibold">
              <span className={cn("size-2 rounded-full", cluster ? "bg-emerald-400" : "bg-muted-foreground")} />
              <span className="truncate">{cluster?.context ?? "No cluster selected"}</span>
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
                  <select
                    value={namespace}
                    onChange={(e) => setNamespace(e.target.value)}
                    className="h-7 rounded-md border bg-background px-2 text-xs"
                  >
                    <option value="">All namespaces</option>
                    {namespaces.map((n) => <option key={n}>{n}</option>)}
                  </select>
                  <Badge variant="secondary" className="ml-auto">{cluster.version} · read-only</Badge>
                </>
              )}
            </header>
            {cluster && active === "Workloads/Pods" ? (
              <PodsView context={cluster.context} namespace={namespace} />
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
                <p className="mt-1 text-sm text-muted-foreground">
                  Connect a cluster from your kubeconfig to get started.
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
    </TooltipProvider>
  );
}
