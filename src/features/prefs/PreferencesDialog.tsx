import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FileText, Folder, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { savePrefs, usePrefs, type Prefs } from "@/lib/prefs";

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] items-start gap-4 py-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

/** Preferences (roadmap T28). Saved to prefs.json in the app config dir. */
export function PreferencesDialog({ open, onOpenChange, onKubeconfigChanged }: {
  open: boolean; onOpenChange: (o: boolean) => void; onKubeconfigChanged?: () => void;
}) {
  const saved = usePrefs();
  const [p, setP] = useState<Prefs>(saved);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [helmVersion, setHelmVersion] = useState<string>();

  const refreshWarnings = () => invoke<string[]>("kubeconfig_warnings").then(setWarnings).catch(() => {});
  useEffect(() => {
    if (open) { setP(saved); setError(undefined); setHelmVersion(undefined); refreshWarnings(); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setP((x) => ({ ...x, [k]: v }));

  async function add(directory: boolean) {
    const sel = await openDialog({ directory, multiple: false, title: directory ? "Kubeconfig folder" : "Kubeconfig file" });
    if (typeof sel === "string" && !p.kubeconfigPaths.includes(sel)) set("kubeconfigPaths", [...p.kubeconfigPaths, sel]);
  }

  async function save() {
    setBusy(true); setError(undefined);
    try {
      const paths = p.kubeconfigPaths.map((x) => x.trim()).filter(Boolean);
      const kcChanged = JSON.stringify(paths) !== JSON.stringify(saved.kubeconfigPaths);
      await savePrefs({
        ...p,
        kubeconfigPaths: paths,
        terminalFontSize: clamp(p.terminalFontSize, 9, 24),
        metricsIntervalSecs: clamp(p.metricsIntervalSecs, 5, 300),
        helmPollSecs: clamp(p.helmPollSecs, 5, 300),
      });
      if (kcChanged) onKubeconfigChanged?.();
      onOpenChange(false);
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preferences</DialogTitle>
          <DialogDescription>Stored locally on this machine.</DialogDescription>
        </DialogHeader>

        <div className="divide-y">
          <Row label="Theme">
            <div className="flex gap-1">
              {(["dark", "light", "system"] as const).map((t) => (
                <Button key={t} size="sm" variant={p.theme === t ? "default" : "outline"} onClick={() => set("theme", t)} className="capitalize">{t}</Button>
              ))}
            </div>
          </Row>

          <Row label="Kubeconfig" hint="$KUBECONFIG or ~/.kube/config is always loaded. Extra files/folders are merged in.">
            <ul className="space-y-1">
              {p.kubeconfigPaths.map((path, i) => (
                <li key={i} className="flex items-center gap-1">
                  <Input value={path} className="h-8 font-mono text-xs"
                    onChange={(e) => set("kubeconfigPaths", p.kubeconfigPaths.map((x, j) => (j === i ? e.target.value : x)))} />
                  <Button variant="ghost" size="icon" className="size-8"
                    onClick={() => set("kubeconfigPaths", p.kubeconfigPaths.filter((_, j) => j !== i))}><Trash2 /></Button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => add(false)}><FileText /> Add file</Button>
              <Button size="sm" variant="outline" onClick={() => add(true)}><Folder /> Add folder</Button>
              <Button size="sm" variant="ghost" onClick={() => set("kubeconfigPaths", [...p.kubeconfigPaths, ""])}><Plus /> Type path</Button>
            </div>
            {warnings.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-primary">{warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>
            )}
          </Row>

          <Row label="helm binary" hint="Empty = helm from your PATH. Save first, then Test.">
            <div className="flex gap-2">
              <Input value={p.helmPath} placeholder="e.g. /opt/homebrew/bin/helm" className="h-8 font-mono text-xs"
                onChange={(e) => set("helmPath", e.target.value)} />
              <Button size="sm" variant="outline" onClick={() =>
                invoke<string>("helm_local_version").then(setHelmVersion).catch((e) => setHelmVersion(`✗ ${e}`))}>
                Test
              </Button>
            </div>
            {helmVersion && <p className={cn("mt-1 text-xs", helmVersion.startsWith("✗") ? "text-destructive" : "text-emerald-400")}>{helmVersion}</p>}
          </Row>

          <Row label="Terminal shell" hint="Empty = $SHELL (PowerShell on Windows). Applies to new terminals.">
            <Input value={p.shell} placeholder="/bin/zsh" className="h-8 font-mono text-xs" onChange={(e) => set("shell", e.target.value)} />
          </Row>

          <Row label="Terminal font size" hint="9–24. Applies to new terminals.">
            <Input type="number" min={9} max={24} value={p.terminalFontSize} className="h-8 w-24"
              onChange={(e) => set("terminalFontSize", Number(e.target.value))} />
          </Row>

          <Row label="Metrics refresh" hint="Seconds between metrics-server polls (5–300).">
            <Input type="number" min={5} max={300} value={p.metricsIntervalSecs} className="h-8 w-24"
              onChange={(e) => set("metricsIntervalSecs", Number(e.target.value))} />
          </Row>

          <Row label="Helm refresh" hint="Seconds between helm list polls (5–300).">
            <Input type="number" min={5} max={300} value={p.helmPollSecs} className="h-8 w-24"
              onChange={(e) => set("helmPollSecs", Number(e.target.value))} />
          </Row>
        </div>

        {error && <p className="rounded-md bg-destructive/15 p-2 text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setP(saved)}>Reset changes</Button>
          <Button onClick={save} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
