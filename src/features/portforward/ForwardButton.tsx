import { useState } from "react";
import { ExternalLink, Loader2, Network, Pause, Play } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { useCluster } from "@/lib/cluster-context";
import { cn } from "@/lib/utils";
import { portForward, usePortForwards, type ForwardInfo } from "./api";

/**
 * "Forward" link next to a pod/service port. If this port is already saved, shows its state
 * inline: active → open link + pause, paused/error → resume.
 */
export function ForwardButton({ kind, namespace, name, port }: {
  kind: "pod" | "service"; namespace: string; name: string; port: number;
}) {
  const { context } = useCluster();
  const existing = usePortForwards().find((f) =>
    f.context === context && f.kind === kind && f.namespace === namespace && f.name === name && f.requestedPort === port);
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState("");
  const [openBrowser, setOpenBrowser] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<ForwardInfo>();

  if (existing && !open) return <ForwardState f={existing} />;

  async function start() {
    setBusy(true); setError(undefined);
    try {
      const lp = local.trim() ? Number(local) : undefined;
      const f = await portForward.start(context, { namespace, kind, name, port, localPort: lp });
      setResult(f);
      if (openBrowser && f.localPort) openUrl(`http://localhost:${f.localPort}`).catch(() => {});
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <button className="inline-flex items-center gap-1 text-primary hover:underline"
        onClick={() => { setResult(undefined); setError(undefined); setLocal(""); setOpen(true); }}>
        <Network className="size-3" /> Forward
      </button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Port forward {kind}/{name}:{port}</DialogTitle>
            <DialogDescription>
              Listens on 127.0.0.1 only and doesn't change the cluster. It's saved and restored when K8sFocus restarts; pause or remove it under Network → Port Forwarding.
            </DialogDescription>
          </DialogHeader>
          {result ? (
            <p className="text-sm">
              Forwarding <b>localhost:{result.localPort}</b> → {result.pod}:{result.remotePort}{" "}
              <button className="text-primary hover:underline" onClick={() => openUrl(`http://localhost:${result.localPort}`)}>Open</button>
            </p>
          ) : (
            <>
              <Input type="number" placeholder={`Local port (empty = ${port}, or a free one if busy)`} value={local}
                onChange={(e) => setLocal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && start()} autoFocus />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={openBrowser} onCheckedChange={(v) => setOpenBrowser(!!v)} /> Open in browser
              </label>
            </>
          )}
          <ErrorCard error={error} title="Couldn't start port forward" />
          <DialogFooter>
            {result ? <Button onClick={() => setOpen(false)}>Done</Button> : (
              <Button onClick={start} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Start</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Inline state of a saved forward: link + pause, or resume. */
export function ForwardState({ f }: { f: ForwardInfo }) {
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<unknown>) => { setBusy(true); fn().catch(() => {}).finally(() => setBusy(false)); };
  if (f.status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button className="inline-flex items-center gap-1 text-emerald-400 hover:underline" title="Open in browser"
          onClick={() => openUrl(`http://localhost:${f.localPort}`)}>
          localhost:{f.localPort} <ExternalLink className="size-3" />
        </button>
        <button title="Pause" disabled={busy} className="text-muted-foreground hover:text-foreground" onClick={() => run(() => portForward.pause(f.id))}>
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Pause className="size-3" />}
        </button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("text-xs", f.status === "error" ? "text-destructive" : "text-muted-foreground")} title={f.lastError}>
        localhost:{f.localPort ?? "?"} · {f.status}
      </span>
      <button title="Resume" disabled={busy} className="text-primary hover:text-foreground" onClick={() => run(() => portForward.resume(f.id))}>
        {busy ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
      </button>
    </span>
  );
}
