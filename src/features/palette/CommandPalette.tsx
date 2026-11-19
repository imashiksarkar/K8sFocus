import { useMemo, useState } from "react";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut,
} from "@/components/ui/command";
import { NAV } from "@/components/layout/nav";
import { VIEWS } from "@/features/registry";
import type { SavedCluster } from "@/lib/k8s";
import { R, type KObject, type ResourceRef } from "@/lib/resources";
import { useWatch } from "@/lib/useWatch";

export type PaletteAction = { id: string; label: string; shortcut?: string; run: () => void; disabled?: boolean };

/** Resources searchable by name from the palette → the page that shows them. */
const SEARCHABLE: { res: ResourceRef; page: string }[] = [
  { res: R.pods, page: "Workloads/Pods" },
  { res: R.deployments, page: "Workloads/Deployments" },
  { res: R.statefulsets, page: "Workloads/StatefulSets" },
  { res: R.daemonsets, page: "Workloads/DaemonSets" },
  { res: R.cronjobs, page: "Workloads/CronJobs" },
  { res: R.services, page: "Network/Services" },
  { res: R.ingresses, page: "Network/Ingresses" },
  { res: R.configmaps, page: "Config/ConfigMaps" },
  { res: R.secrets, page: "Config/Secrets" },
  { res: R.nodes, page: "Nodes/Nodes" },
  { res: R.namespaces, page: "Namespaces/Namespaces" },
];

function ResourceGroup({ context, res, page, onPick }: {
  context: string; res: ResourceRef; page: string; onPick: (page: string, o: KObject) => void;
}) {
  const { items } = useWatch(context, res);
  if (!items.length) return null;
  return (
    <CommandGroup heading={res.kind + "s"}>
      {items.slice(0, 2000).map((o) => (
        <CommandItem key={o.metadata.uid} value={`${res.kind} ${o.metadata.namespace ?? ""}/${o.metadata.name}`}
          onSelect={() => onPick(page, o)}>
          <span className="truncate">{o.metadata.name}</span>
          {o.metadata.namespace && <span className="ml-2 truncate text-xs text-muted-foreground">{o.metadata.namespace}</span>}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

export function CommandPalette({ open, onOpenChange, context, clusters, crds, actions, onNavigate, onCluster, onPickResource }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  context?: string;
  clusters: SavedCluster[];
  crds: KObject[];
  actions: PaletteAction[];
  onNavigate: (key: string) => void;
  onCluster: (c: SavedCluster) => void;
  onPickResource: (page: string, o: KObject) => void;
}) {
  const [q, setQ] = useState("");
  const pages = useMemo(
    () => NAV.flatMap((g) => g.items.map((it) => ({ key: `${g.label}/${it}`, label: g.items.length === 1 ? g.label : `${g.label} › ${it}` })))
      .filter((p) => VIEWS[p.key]),
    [],
  );
  const close = (f: () => void) => () => { onOpenChange(false); setQ(""); f(); };
  // resources only after 2 chars, to keep the list fast on big clusters
  const searchResources = !!context && q.trim().length >= 2;

  return (
    <CommandDialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setQ(""); }}
      title="Command palette" description="Jump to a page, cluster, resource or action">
      <CommandInput placeholder="Type a page, resource name, cluster or action…" value={q} onValueChange={setQ} />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Actions">
          {actions.filter((a) => !a.disabled).map((a) => (
            <CommandItem key={a.id} value={`action ${a.label}`} onSelect={close(a.run)}>
              {a.label}{a.shortcut && <CommandShortcut>{a.shortcut}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>
        {context && (
          <CommandGroup heading="Pages">
            {pages.map((p) => (
              <CommandItem key={p.key} value={`page ${p.label}`} onSelect={close(() => onNavigate(p.key))}>{p.label}</CommandItem>
            ))}
            {crds.map((c) => (
              <CommandItem key={c.metadata.uid} value={`page custom ${c.spec.names.kind} ${c.spec.group}`}
                onSelect={close(() => onNavigate(`Custom Resources/crd:${c.metadata.name}`))}>
                Custom Resources › {c.spec.names.kind} <span className="ml-2 text-xs text-muted-foreground">{c.spec.group}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Clusters">
          {clusters.map((c, i) => (
            <CommandItem key={c.context} value={`cluster ${c.name} ${c.context}`} onSelect={close(() => onCluster(c))}>
              {c.name}{c.context === context && <span className="ml-2 text-xs text-primary">current</span>}
              {i < 9 && <CommandShortcut>⌘{i + 1}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>
        {searchResources && SEARCHABLE.map((s) => (
          <ResourceGroup key={s.res.plural} context={context!} res={s.res} page={s.page}
            onPick={(page, o) => { onOpenChange(false); setQ(""); onPickResource(page, o); }} />
        ))}
      </CommandList>
    </CommandDialog>
  );
}
