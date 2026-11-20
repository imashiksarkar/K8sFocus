import "@/lib/monaco";
import { useEffect, useState } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { k8sWrite, type ObjRef } from "@/lib/k8s";
import { ErrorCard } from "@/components/ui/ErrorCard";

export type EditorTarget =
  | { mode: "edit"; obj: ObjRef }
  | { mode: "create"; template?: string; namespace?: string };

const CREATE_TEMPLATE = `apiVersion: v1
kind: ConfigMap
metadata:
  name: example
  namespace: default
data:
  key: value
`;

/**
 * Edit / create YAML (roadmap T8). Flow: edit → Review (server dry-run + diff) → Apply.
 * Nothing is persisted until "Apply" on the review screen.
 */
export function YamlEditor({ context, target, readOnly, onClose }: {
  context: string;
  target?: EditorTarget;
  readOnly: boolean;
  onClose: () => void;
}) {
  const [original, setOriginal] = useState("");
  const [text, setText] = useState("");
  const [review, setReview] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [force, setForce] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!target) return;
    setReview(undefined); setError(undefined); setForce(false); setDone(false);
    if (target.mode === "create") {
      const t = target.template ?? CREATE_TEMPLATE.replace("namespace: default", `namespace: ${target.namespace ?? "default"}`);
      setOriginal(""); setText(t);
      return;
    }
    setBusy("Loading…");
    k8sWrite.getYaml(context, target.obj)
      .then((y) => { setOriginal(y); setText(y); })
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(undefined));
  }, [context, target]);

  const defaultNamespace = target?.mode === "create" ? target.namespace : target?.obj.namespace;

  async function runReview() {
    setBusy("Validating with the API server (dry run)…"); setError(undefined);
    try {
      setReview(await k8sWrite.apply(context, text, { dryRun: true, force, defaultNamespace }));
    } catch (e) { setError(String(e)); } finally { setBusy(undefined); }
  }

  async function runApply() {
    setBusy("Applying…"); setError(undefined);
    try {
      await k8sWrite.apply(context, text, { dryRun: false, force, defaultNamespace });
      setDone(true);
      setTimeout(onClose, 700);
    } catch (e) { setError(String(e)); } finally { setBusy(undefined); }
  }

  const title = target?.mode === "edit" ? `Edit ${target.obj.kind}/${target.obj.name}` : "Create resource";
  const conflict = error?.includes("conflict");

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="flex h-[85vh] max-w-[90vw] flex-col gap-3 sm:max-w-[90vw]">
        <DialogHeader>
          <DialogTitle>{review !== undefined ? `Review changes — ${title}` : title}</DialogTitle>
          <DialogDescription>
            {review !== undefined
              ? "Left: current. Right: result after apply (server dry-run). Nothing has been changed yet."
              : `Context: ${context}${target?.mode === "edit" && target.obj.namespace ? ` · namespace: ${target.obj.namespace}` : ""}`}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
          {review !== undefined ? (
            <DiffEditor
              original={original}
              modified={review}
              language="yaml"
              theme="k8sfocus"
              options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false }, fontSize: 12 }}
            />
          ) : (
            <Editor
              value={text}
              onChange={(v) => setText(v ?? "")}
              language="yaml"
              theme="k8sfocus"
              options={{ minimap: { enabled: false }, fontSize: 12, tabSize: 2, scrollBeyondLastLine: false }}
            />
          )}
        </div>

        <ErrorCard error={error} className="max-h-48 overflow-auto" />

        <div className="flex items-center gap-2">
          {readOnly && (
            <span className="flex items-center gap-1 text-xs text-primary">
              <Lock className="size-3.5" /> Cluster is read-only — you can review, but not apply.
            </span>
          )}
          {conflict && (
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={force} onCheckedChange={(v) => setForce(!!v)} />
              Force (take ownership of conflicting fields)
            </label>
          )}
          {busy && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />{busy}</span>}
          {done && <span className="text-xs text-emerald-400">Applied ✓</span>}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={!!busy}>Cancel</Button>
            {review === undefined ? (
              <Button onClick={runReview} disabled={!!busy || !text.trim()}>Review changes</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setReview(undefined)} disabled={!!busy}><ArrowLeft /> Back to edit</Button>
                <Button onClick={runApply} disabled={!!busy || readOnly || done}>Apply</Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
