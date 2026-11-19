import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { age, k8s, type PodRow } from "@/lib/k8s";
import { cn } from "@/lib/utils";

const phaseColor: Record<string, string> = {
  Running: "text-emerald-400", Succeeded: "text-muted-foreground",
  Pending: "text-primary", Failed: "text-destructive",
};

/** Read-only pods list. Live watch arrives in T5; for now: manual refresh. */
export function PodsView({ context, namespace }: { context: string; namespace: string }) {
  const [pods, setPods] = useState<PodRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError(undefined);
    k8s.listPods(context, namespace || undefined)
      .then(setPods)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [context, namespace]);

  useEffect(load, [load]);

  const rows = pods.filter((p) => p.name.includes(q) || p.namespace.includes(q));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pods…"
          className="h-8 w-64 rounded-md border bg-transparent px-2 text-sm outline-none focus:border-primary"
        />
        <span className="text-xs text-muted-foreground">{rows.length} items</span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh
        </Button>
      </div>
      {error && <p className="m-4 rounded-md bg-destructive/15 p-2 text-xs text-destructive">{error}</p>}
      <div className="min-h-0 flex-1 overflow-auto select-text">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead><TableHead>Namespace</TableHead><TableHead>Ready</TableHead>
              <TableHead>Restarts</TableHead><TableHead>Node</TableHead><TableHead>Age</TableHead><TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={`${p.namespace}/${p.name}`}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.namespace}</TableCell>
                <TableCell>{p.ready}</TableCell>
                <TableCell className={cn(p.restarts > 0 && "text-primary")}>{p.restarts}</TableCell>
                <TableCell className="text-muted-foreground">{p.node}</TableCell>
                <TableCell>{age(p.created)}</TableCell>
                <TableCell className={phaseColor[p.phase]}>{p.phase}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
