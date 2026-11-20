import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { k8s, type ClusterInfo, type ContextInfo } from "@/lib/k8s";
import { ErrorCard } from "@/components/ui/ErrorCard";

type Props = { open: boolean; onOpenChange: (o: boolean) => void; onConnected: (c: ClusterInfo) => void };

export function AddClusterDialog({ open, onOpenChange, onConnected }: Props) {
  const [contexts, setContexts] = useState<ContextInfo[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setError(undefined);
    k8s.listContexts().then(setContexts).catch((e) => setError(String(e)));
  }, [open]);

  async function connect(name: string) {
    setBusy(name);
    setError(undefined);
    try {
      onConnected(await k8s.connect(name));
      onOpenChange(false);
    } catch (e) {
      setError(`${name}: ${e}`);
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add cluster</DialogTitle>
          <DialogDescription>Contexts from your kubeconfig (~/.kube/config or $KUBECONFIG).</DialogDescription>
        </DialogHeader>
        <ul className="max-h-80 space-y-1 overflow-auto">
          {contexts.map((c) => (
            <li key={c.name}>
              <button
                disabled={!!busy}
                onClick={() => connect(c.name)}
                className="flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm hover:border-primary hover:bg-accent disabled:opacity-60"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    cluster: {c.cluster} · user: {c.user}
                  </div>
                </div>
                {c.current && <Badge>current</Badge>}
                {busy === c.name && <Loader2 className="size-4 animate-spin" />}
              </button>
            </li>
          ))}
          {!contexts.length && !error && <li className="text-sm text-muted-foreground">No contexts found.</li>}
        </ul>
        <ErrorCard error={error} title="Couldn't connect" />
      </DialogContent>
    </Dialog>
  );
}
