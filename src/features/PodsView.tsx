import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { age } from "@/lib/k8s";
import { R, type KObject } from "@/lib/resources";
import { useWatch } from "@/lib/useWatch";
import { cn } from "@/lib/utils";

/** Status the way kubectl/Lens show it (CrashLoopBackOff, Terminating, ...). */
function podStatus(p: KObject): string {
  if (p.metadata.deletionTimestamp) return "Terminating";
  const cs: any[] = p.status?.containerStatuses ?? [];
  for (const c of cs) {
    if (c.state?.waiting?.reason) return c.state.waiting.reason;
    if (c.state?.terminated?.reason && p.status?.phase !== "Succeeded") return c.state.terminated.reason;
  }
  return p.status?.reason ?? p.status?.phase ?? "Unknown";
}

const statusColor = (s: string) =>
  s === "Running" ? "text-emerald-400"
  : s === "Succeeded" || s === "Completed" ? "text-muted-foreground"
  : s === "Pending" || s === "ContainerCreating" || s === "Terminating" ? "text-primary"
  : "text-destructive";

/** Live, read-only pods list. */
export function PodsView({ context, namespaces }: { context: string; namespaces: string[] }) {
  const { items, ready, error } = useWatch(context, R.pods, namespaces);
  const [q, setQ] = useState("");
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 5000); return () => clearInterval(t); }, []);

  const rows = items
    .filter((p) => p.metadata.name.includes(q) || (p.metadata.namespace ?? "").includes(q))
    .sort((a, b) => (a.metadata.namespace ?? "").localeCompare(b.metadata.namespace ?? "") || a.metadata.name.localeCompare(b.metadata.name));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pods…"
          className="h-8 w-64 rounded-md border bg-transparent px-2 text-sm outline-none focus:border-primary"
        />
        <span className="text-xs text-muted-foreground">{rows.length} items</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          {ready ? <><span className="size-1.5 animate-pulse rounded-full bg-emerald-400" /> live</>
                 : <><Loader2 className="size-3 animate-spin" /> loading</>}
        </span>
      </div>
      {error && <p className="mx-4 mt-2 rounded-md bg-destructive/15 p-2 text-xs text-destructive select-text">{error}</p>}
      <div className="min-h-0 flex-1 overflow-auto select-text">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead><TableHead>Namespace</TableHead><TableHead>Ready</TableHead>
              <TableHead>Restarts</TableHead><TableHead>Node</TableHead><TableHead>Age</TableHead><TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => {
              const cs: any[] = p.status?.containerStatuses ?? [];
              const restarts = cs.reduce((n, c) => n + (c.restartCount ?? 0), 0);
              const status = podStatus(p);
              return (
                <TableRow key={p.metadata.uid}>
                  <TableCell className="font-medium">{p.metadata.name}</TableCell>
                  <TableCell>{p.metadata.namespace}</TableCell>
                  <TableCell>{cs.filter((c) => c.ready).length}/{p.spec?.containers?.length ?? cs.length}</TableCell>
                  <TableCell className={cn(restarts > 0 && "text-primary")}>{restarts}</TableCell>
                  <TableCell className="text-muted-foreground">{p.spec?.nodeName}</TableCell>
                  <TableCell>{age(p.metadata.creationTimestamp)}</TableCell>
                  <TableCell className={statusColor(status)}>{status}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
