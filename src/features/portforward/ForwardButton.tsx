import { useState } from "react";
import { ExternalLink, Loader2, Network } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCluster } from "@/lib/cluster-context";
import { portForward, usePortForwards, type ForwardInfo } from "./api";

/** "Forward" link next to a pod/service port. Shows the existing forward if there is one. */
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

  if (existing && !open) {
    return (
      <button className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
        title="Open in browser" onClick={() => openUrl(`http://localhost:${existing.localPort}`)}>
        localhost:{existing.localPort} <ExternalLink className="size-3" />
      </button>
    );
  }

  async function start() {
    setBusy(true); setError(undefined);
    try {
      const lp = local.trim() ? Number(local) : undefined;
      const f = await portForward.start(context, { namespace, kind, name, port, localPort: lp });
      setResult(f);
      if (openBrowser) openUrl(`http://localhost:${f.localPort}`).catch(() => {});
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <button className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => { setResult(undefined); setError(undefined); setLocal(""); setOpen(true); }}>
        <Network className="size-3" /> Forward
      </button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Port forward {kind}/{name}:{port}</DialogTitle>
            <DialogDescription>Listens on 127.0.0.1 only. Does not change anything in the cluster.</DialogDescription>
          </DialogHeader>
          {result ? (
            <p className="text-sm">
              Forwarding <b>localhost:{result.localPort}</b> → {result.pod}:{result.remotePort}{" "}
              <button className="text-primary hover:underline" onClick={() => openUrl(`http://localhost:${result.localPort}`)}>Open</button>
            </p>
          ) : (
            <>
              <Input type="number" placeholder={`Local port (empty = ${port}, or random if busy)`} value={local}
                onChange={(e) => setLocal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && start()} autoFocus />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={openBrowser} onCheckedChange={(v) => setOpenBrowser(!!v)} /> Open in browser
              </label>
            </>
          )}
          {error && <p className="rounded-md bg-destructive/15 p-2 text-xs text-destructive select-text">{error}</p>}
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
