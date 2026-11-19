import { Copy, ExternalLink, Square } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { portForward, usePortForwards } from "./api";

/** Network → Port Forwarding: active forwards across all clusters. */
export function PortForwardsView({ context }: { context: string; namespaces: string[] }) {
  const all = usePortForwards();
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background text-left text-muted-foreground shadow-[0_1px_0_var(--border)]">
          <tr>{["Local", "Resource", "Namespace", "Pod", "Remote", "Connections", "Cluster", "Status", ""].map((h) => <th key={h} className="h-9 px-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {all.map((f) => (
            <tr key={f.id} className={cn("border-b", f.context !== context && "opacity-60")}>
              <td className="px-2 py-1.5 font-medium">localhost:{f.localPort}</td>
              <td className="px-2">{f.kind}/{f.name}:{f.requestedPort}</td>
              <td className="px-2">{f.namespace}</td>
              <td className="px-2 text-muted-foreground">{f.pod}</td>
              <td className="px-2">{f.remotePort}</td>
              <td className="px-2">{f.connections}</td>
              <td className="px-2 text-muted-foreground">{f.context}</td>
              <td className="max-w-64 truncate px-2" title={f.lastError}>
                {f.lastError ? <span className="text-destructive">{f.lastError}</span> : <span className="text-emerald-400">active</span>}
              </td>
              <td className="px-2 whitespace-nowrap">
                <Button variant="ghost" size="icon" className="size-7" title="Open in browser" onClick={() => openUrl(`http://localhost:${f.localPort}`)}><ExternalLink /></Button>
                <Button variant="ghost" size="icon" className="size-7" title="Copy address" onClick={() => navigator.clipboard?.writeText(`localhost:${f.localPort}`)}><Copy /></Button>
                <Button variant="ghost" size="icon" className="size-7 hover:text-destructive" title="Stop" onClick={() => portForward.stop(f.id)}><Square /></Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!all.length && <p className="p-8 text-center text-sm text-muted-foreground">No active port forwards. Start one from a pod's container ports or a service's ports.</p>}
    </div>
  );
}
