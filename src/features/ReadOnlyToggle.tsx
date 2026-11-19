import { useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** Per-cluster write switch. Turning writes ON asks for confirmation; turning OFF is instant. */
export function ReadOnlyToggle({ name, readOnly, onChange }: {
  name: string; readOnly: boolean; onChange: (readOnly: boolean) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <label
        className={cn("flex items-center gap-2 rounded-md border px-2 py-1 text-xs",
          readOnly ? "text-muted-foreground" : "border-primary/50 text-primary")}
        title={readOnly ? "Changes to this cluster are blocked" : "Changes to this cluster are allowed"}
      >
        {readOnly ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
        {readOnly ? "Read-only" : "Read-write"}
        <Switch checked={!readOnly} onCheckedChange={(on) => (on ? setConfirm(true) : onChange(true))} />
      </label>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Allow changes to “{name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              K8sFocus will be able to edit, create and delete resources in this cluster.
              Every change still needs a confirmation. You can switch back to read-only any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep read-only</AlertDialogCancel>
            <AlertDialogAction onClick={() => onChange(false)}>Allow changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
