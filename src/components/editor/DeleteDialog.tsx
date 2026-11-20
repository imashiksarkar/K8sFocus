import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { k8sWrite, type ObjRef } from "@/lib/k8s";
import { ErrorCard } from "@/components/ui/ErrorCard";

/** Delete exactly one object; user must type its name. */
export function DeleteDialog({ context, obj, onClose }: { context: string; obj?: ObjRef; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => { setTyped(""); setError(undefined); }, [obj]);

  async function run() {
    if (!obj || typed !== obj.name) return;
    setBusy(true); setError(undefined);
    try {
      await k8sWrite.delete(context, obj);
      onClose();
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  return (
    <AlertDialog open={!!obj} onOpenChange={(o) => !o && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {obj?.kind} “{obj?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Context <b>{context}</b>{obj?.namespace && <>, namespace <b>{obj.namespace}</b></>}. This cannot be undone.
            Type the name to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={obj?.name}
          onKeyDown={(e) => e.key === "Enter" && run()} />
        <ErrorCard error={error} title="Delete failed" />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={busy || typed !== obj?.name} onClick={run}>
            {busy && <Loader2 className="animate-spin" />} Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
