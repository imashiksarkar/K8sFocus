import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/** Generic confirm dialog for a cluster mutation; shows the server error inline. */
export function ConfirmAction({ open, onOpenChange, title, description, children, confirmLabel, destructive, disabled, onConfirm }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  disabled?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function run() {
    setBusy(true); setError(undefined);
    try { await onConfirm(); onOpenChange(false); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!busy) { setError(undefined); onOpenChange(o); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild><div>{description}</div></AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {error && <p className="rounded-md bg-destructive/15 p-2 text-xs text-destructive select-text">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant={destructive ? "destructive" : "default"} disabled={busy || disabled} onClick={run}>
            {busy && <Loader2 className="animate-spin" />} {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
