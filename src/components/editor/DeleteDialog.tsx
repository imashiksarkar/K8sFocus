import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { k8sWrite, type ObjRef } from "@/lib/k8s";
import { ErrorCard } from "@/components/ui/ErrorCard";

/** Copyable confirm phrase, so the user can paste it instead of retyping. */
function ConfirmPhrase({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy"
      onClick={() => navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1000); })}
      className="inline-flex max-w-full items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground select-text hover:bg-muted/70"
    >
      <span className="truncate">{text}</span>
      {copied ? <Check className="size-3 shrink-0" /> : <Copy className="size-3 shrink-0 opacity-60" />}
    </button>
  );
}

/**
 * Delete one or many objects. One object: type its name. Many: type "delete".
 * The confirm phrase is shown as a copy button.
 */
export function DeleteDialog({ context, objs, onClose }: { context: string; objs?: ObjRef[]; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const list = objs ?? [];
  const single = list.length === 1 ? list[0] : undefined;
  const phrase = single ? single.name : "delete";

  useEffect(() => { setTyped(""); setError(undefined); }, [objs]);

  async function run() {
    if (!list.length || typed !== phrase) return;
    setBusy(true); setError(undefined);
    const results = await Promise.allSettled(list.map((o) => k8sWrite.delete(context, o)));
    setBusy(false);
    const failed = results.flatMap((r, i) => r.status === "rejected" ? [`${list[i].kind} ${list[i].namespace ? list[i].namespace + "/" : ""}${list[i].name}: ${r.reason}`] : []);
    if (failed.length) setError(failed.join("\n"));
    else onClose();
  }

  const kinds = [...new Set(list.map((o) => o.kind))].join(", ");
  return (
    <AlertDialog open={list.length > 0} onOpenChange={(o) => !o && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {single ? <>Delete {single.kind} “{single.name}”?</> : <>Delete {list.length} {kinds} objects?</>}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>Context <b>{context}</b>{single?.namespace && <>, namespace <b>{single.namespace}</b></>}. This cannot be undone.</p>
              {!single && (
                <ul className="max-h-40 overflow-auto rounded-md border p-2 font-mono text-xs">
                  {list.map((o) => <li key={`${o.kind}/${o.namespace}/${o.name}`} className="truncate">{o.namespace ? `${o.namespace}/` : ""}{o.name}</li>)}
                </ul>
              )}
              <p className="flex flex-wrap items-center gap-1">Type <ConfirmPhrase text={phrase} /> to confirm.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={phrase}
          onKeyDown={(e) => e.key === "Enter" && run()} />
        <ErrorCard error={error} title="Delete failed" />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={busy || typed !== phrase} onClick={run}>
            {busy && <Loader2 className="animate-spin" />} Delete{!single && ` ${list.length}`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
