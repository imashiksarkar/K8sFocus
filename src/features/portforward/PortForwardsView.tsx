import { useState } from "react";
import { Copy, ExternalLink, Loader2, Pause, Play, Trash2 } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { portForward, usePortForwards, type ForwardInfo } from "./api";

const STATUS: Record<ForwardInfo["status"], string> = {
  active: "border-emerald-500/40 text-emerald-400",
  paused: "text-muted-foreground",
  error: "border-destructive/40 text-destructive",
};

/** Network → Port Forwarding: saved forwards across all clusters (restored on restart). */
export function PortForwardsView({ context }: { context: string; namespaces: string[] }) {
  const all = usePortForwards();
  const [busy, setBusy] = useState<number>();
  const run = (id: number, fn: () => Promise<unknown>) => {
    setBusy(id);
    fn().catch(() => {}).finally(() => setBusy(undefined));
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <p className="border-b px-4 py-2 text-xs text-muted-foreground">
        Forwards are saved and restored when K8sFocus starts. Paused forwards keep their local port.
      </p>
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background text-left text-muted-foreground shadow-[0_1px_0_var(--border)]">
          <tr>{["Local", "Target", "Namespace", "Pod", "Cluster", "Conns", "Status", ""].map((h) => (
            <th key={h} className="h-9 px-2 font-medium whitespace-nowrap">{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {all.map((f) => {
            const err = f.lastError ? friendlyError(f.lastError) : undefined;
            const isBusy = busy === f.id;
            return (
              <tr key={f.id} className={cn("border-b align-top", f.context !== context && "opacity-60")}>
                <td className="px-2 py-2 font-medium whitespace-nowrap">localhost:{f.localPort ?? "—"}</td>
                <td className="max-w-56 truncate px-2 py-2" title={`${f.kind}/${f.name}:${f.requestedPort}`}>
                  {f.kind}/{f.name}:{f.requestedPort}
                </td>
                <td className="px-2 py-2">{f.namespace}</td>
                <td className="max-w-48 truncate px-2 py-2 text-muted-foreground" title={f.pod}>
                  {f.pod ? `${f.pod}:${f.remotePort}` : "—"}
                </td>
                <td className="max-w-40 truncate px-2 py-2 text-muted-foreground" title={f.context}>{f.context}</td>
                <td className="px-2 py-2 tabular-nums">{f.connections}</td>
                <td className="px-2 py-2">
                  <Badge variant="outline" className={cn("font-normal", STATUS[f.status])}>{f.status}</Badge>
                  {err && (
                    <div className="mt-1 max-w-64 text-xs" title={err.raw}>
                      <span className="text-destructive">{err.title}</span>
                      {err.hint && <span className="block text-muted-foreground">{err.hint}</span>}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {isBusy ? <Loader2 className="m-1.5 inline size-4 animate-spin" /> : f.status === "active" ? (
                    <Button variant="ghost" size="icon" className="size-7" title="Pause"
                      onClick={() => run(f.id, () => portForward.pause(f.id))}><Pause /></Button>
                  ) : (
                    <Button variant="ghost" size="icon" className="size-7 text-primary" title={f.status === "error" ? "Retry" : "Resume"}
                      onClick={() => run(f.id, () => portForward.resume(f.id))}><Play /></Button>
                  )}
                  <Button variant="ghost" size="icon" className="size-7" title="Open in browser" disabled={f.status !== "active"}
                    onClick={() => openUrl(`http://localhost:${f.localPort}`)}><ExternalLink /></Button>
                  <Button variant="ghost" size="icon" className="size-7" title="Copy address" disabled={!f.localPort}
                    onClick={() => navigator.clipboard?.writeText(`localhost:${f.localPort}`)}><Copy /></Button>
                  <Button variant="ghost" size="icon" className="size-7 hover:text-destructive" title="Remove"
                    onClick={() => run(f.id, () => portForward.remove(f.id))}><Trash2 /></Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!all.length && (
        <p className="p-8 text-center text-sm text-muted-foreground">
          No port forwards yet. Start one from a pod's <b>Ports</b> or a service's ports.
        </p>
      )}
    </div>
  );
}
