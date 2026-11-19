import { useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type State =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "none"; current: string }
  | { kind: "available"; update: Update }
  | { kind: "downloading"; update: Update; done: number; total?: number }
  | { kind: "ready" }
  | { kind: "error"; message: string };

/**
 * Auto-update (roadmap T32) via tauri-plugin-updater + GitHub Releases latest.json.
 * Never installs without the user clicking "Install & restart".
 * `checkToken` changes → run a check; `manual` shows "up to date"/errors, automatic checks stay silent.
 */
export function UpdateDialog({ checkToken, manual }: { checkToken: number; manual: boolean }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [open, setOpen] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    if (!checkToken || busy.current) return;
    busy.current = true;
    if (manual) { setState({ kind: "checking" }); setOpen(true); }
    check()
      .then(async (u) => {
        if (u) { setState({ kind: "available", update: u }); setOpen(true); }
        else if (manual) setState({ kind: "none", current: await getVersion() });
      })
      .catch((e) => { if (manual) setState({ kind: "error", message: String(e) }); })
      .finally(() => { busy.current = false; });
  }, [checkToken, manual]);

  async function install(update: Update) {
    let done = 0;
    let total: number | undefined;
    setState({ kind: "downloading", update, done: 0 });
    try {
      await update.downloadAndInstall((ev) => {
        if (ev.event === "Started") total = ev.data.contentLength;
        else if (ev.event === "Progress") done += ev.data.chunkLength;
        setState({ kind: "downloading", update, done, total });
      });
      setState({ kind: "ready" });
      await relaunch();
    } catch (e) {
      setState({ kind: "error", message: String(e) });
    }
  }

  const s = state;
  const busyNow = s.kind === "checking" || s.kind === "downloading" || s.kind === "ready";
  return (
    <Dialog open={open} onOpenChange={(o) => !busyNow && setOpen(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {s.kind === "available" || s.kind === "downloading" ? `K8sFocus ${s.update.version} is available` : "Software update"}
          </DialogTitle>
          <DialogDescription>
            {s.kind === "checking" && "Checking for updates…"}
            {s.kind === "none" && `You're up to date (version ${s.current}).`}
            {(s.kind === "available" || s.kind === "downloading") && `You have ${s.update.currentVersion}.`}
            {s.kind === "ready" && "Update installed. Restarting…"}
            {s.kind === "error" && "The update check failed."}
          </DialogDescription>
        </DialogHeader>

        {(s.kind === "available" || s.kind === "downloading") && s.update.body && (
          <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap select-text">{s.update.body}</pre>
        )}
        {s.kind === "downloading" && (
          <div className="space-y-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: s.total ? `${(s.done / s.total) * 100}%` : "30%" }} />
            </div>
            <p className="text-xs text-muted-foreground">
              Downloading… {(s.done / 1048576).toFixed(1)} MB{s.total ? ` of ${(s.total / 1048576).toFixed(1)} MB` : ""}
            </p>
          </div>
        )}
        {s.kind === "error" && <p className="rounded-md bg-destructive/15 p-2 text-xs text-destructive select-text">{s.message}</p>}

        <DialogFooter>
          {s.kind === "available" ? (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>Later</Button>
              <Button onClick={() => install(s.update)}>Install &amp; restart</Button>
            </>
          ) : busyNow ? (
            <Button disabled><Loader2 className="animate-spin" /> Please wait</Button>
          ) : (
            <Button onClick={() => setOpen(false)}>OK</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
