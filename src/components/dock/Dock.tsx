import { useRef } from "react";
import { ChevronDown, ChevronUp, Monitor, ScrollText, SquareTerminal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LogsView } from "./LogsView";
import { LocalTerminalView, ShellView } from "./ShellView";
import type { DockTab } from "./types";

/** Resizable bottom dock with tabs (roadmap T17). Inactive tabs stay mounted so streams keep running. */
export function Dock({ tabs, active, open, height, onActivate, onClose, onToggle, onResize }: {
  tabs: DockTab[]; active?: string; open: boolean; height: number;
  onActivate: (id: string) => void; onClose: (id: string) => void;
  onToggle: () => void; onResize: (h: number) => void;
}) {
  const drag = useRef<{ y: number; h: number } | null>(null);
  if (!tabs.length) return null;

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { y: e.clientY, h: height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const max = window.innerHeight - 160;
    onResize(Math.min(max, Math.max(120, drag.current.h + (drag.current.y - e.clientY))));
  }

  return (
    <div className="flex shrink-0 flex-col border-t bg-card" style={{ height: open ? height : 33 }}>
      {open && (
        <div className="h-1 cursor-row-resize hover:bg-primary/50" onPointerDown={onPointerDown}
          onPointerMove={onPointerMove} onPointerUp={() => (drag.current = null)} />
      )}
      <div className="flex h-8 shrink-0 items-center gap-1 border-b px-2">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <div key={t.id}
              className={cn("group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs",
                t.id === active ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-secondary/60")}
              onClick={() => { onActivate(t.id); if (!open) onToggle(); }}>
              {t.kind === "logs" ? <ScrollText className="size-3.5" /> : t.kind === "shell" ? <SquareTerminal className="size-3.5" /> : <Monitor className="size-3.5" />}
              <span className="max-w-56 truncate" title={t.title}>{t.title}</span>
              <X className="size-3 opacity-50 hover:opacity-100" onClick={(e) => { e.stopPropagation(); onClose(t.id); }} />
            </div>
          ))}
        </div>
        <Button variant="ghost" size="icon" className="size-6" onClick={onToggle} title={open ? "Minimize" : "Expand"}>
          {open ? <ChevronDown /> : <ChevronUp />}
        </Button>
      </div>
      <div className={cn("min-h-0 flex-1", !open && "hidden")}>
        {tabs.map((t) => (
          <div key={t.id} className={cn("h-full", t.id !== active && "hidden")}>
            {t.kind === "logs" && <LogsView tab={t} />}
            {t.kind === "shell" && <ShellView tab={t} />}
            {t.kind === "terminal" && <LocalTerminalView tab={t} />}
          </div>
        ))}
      </div>
    </div>
  );
}
