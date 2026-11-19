import { useState } from "react";
import { Loader2, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SavedCluster } from "@/lib/k8s";
import { cn } from "@/lib/utils";

const COLORS = ["#facc15", "#38bdf8", "#4ade80", "#f472b6", "#a78bfa", "#fb923c"];

type Props = {
  clusters: SavedCluster[];
  active?: string;
  connecting?: string;
  onSelect: (c: SavedCluster) => void;
  onAdd: () => void;
  onChange: (clusters: SavedCluster[]) => void;
  onSettings: () => void;
};

function initials(name: string) {
  const parts = name.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

export function Hotbar({ clusters, active, connecting, onSelect, onAdd, onChange, onSettings }: Props) {
  const [editing, setEditing] = useState<SavedCluster>();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>();

  function saveEdit() {
    if (!editing) return;
    onChange(clusters.map((c) => (c.context === editing.context ? { ...c, name: name.trim() || c.context, color } : c)));
    setEditing(undefined);
  }

  return (
    <aside className="flex w-14 flex-col items-center gap-2 border-r bg-sidebar py-3">
      <div className="mb-1 flex size-9 items-center justify-center rounded-md bg-primary font-bold text-primary-foreground">K</div>
      {clusters.map((c) => (
        <ContextMenu key={c.context}>
          <Tooltip>
            <ContextMenuTrigger asChild>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onSelect(c)}
                  style={{ backgroundColor: c.color ?? undefined }}
                  className={cn(
                    "relative flex size-9 items-center justify-center rounded-md bg-secondary text-xs font-semibold",
                    c.color && "text-zinc-900",
                    active === c.context && "ring-2 ring-primary ring-offset-2 ring-offset-sidebar",
                  )}
                >
                  {connecting === c.context ? <Loader2 className="size-4 animate-spin" /> : initials(c.name)}
                </button>
              </TooltipTrigger>
            </ContextMenuTrigger>
            <TooltipContent side="right">{c.name}</TooltipContent>
          </Tooltip>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => onSelect(c)}>Connect</ContextMenuItem>
            <ContextMenuItem onSelect={() => { setEditing(c); setName(c.name); setColor(c.color); }}>
              Rename / color…
            </ContextMenuItem>
            <ContextMenuSeparator />
            {/* Only removes the shortcut from this app. Never touches the cluster or kubeconfig. */}
            <ContextMenuItem onSelect={() => onChange(clusters.filter((x) => x.context !== c.context))}>
              Remove from hotbar
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ))}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={onAdd}><Plus /></Button>
        </TooltipTrigger>
        <TooltipContent side="right">Add cluster</TooltipContent>
      </Tooltip>
      <div className="mt-auto">
        <Button variant="ghost" size="icon" title="Preferences (⌘,)" onClick={onSettings}><Settings2 /></Button>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(undefined)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Edit cluster</DialogTitle></DialogHeader>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEdit()} />
          <div className="flex gap-2">
            <button onClick={() => setColor(undefined)} className={cn("size-6 rounded-full border bg-secondary", !color && "ring-2 ring-primary")} />
            {COLORS.map((col) => (
              <button key={col} onClick={() => setColor(col)} style={{ backgroundColor: col }}
                className={cn("size-6 rounded-full", color === col && "ring-2 ring-foreground")} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Context: {editing?.context}</p>
          <DialogFooter><Button onClick={saveEdit}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
