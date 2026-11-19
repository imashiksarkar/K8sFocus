import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { KObject } from "@/lib/resources";
import { CopyText, Fields, KVChips, Section } from "./parts";
import { ObjectEvents } from "./ObjectEvents";

/**
 * Right-side details panel (roadmap T7). Generic metadata + events; resource-specific
 * sections are passed as children. `object` is the live copy from the watch, so it updates.
 */
export function DetailsPanel({ context, object, onClose, children, actions }: {
  context: string;
  object?: KObject;
  onClose: () => void;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!object) return null;
  const m = object.metadata;

  return (
    <aside className="flex w-[560px] max-w-[50%] shrink-0 flex-col border-l bg-card">
      <header className="flex h-12 items-center gap-2 border-b px-4">
        <span className="text-xs text-muted-foreground">{object.kind}</span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold" title={m.name}>{m.name}</h2>
        {actions}
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose} title="Close (Esc)"><X /></Button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {m.deletionTimestamp && (
          <p className="m-4 rounded-md bg-primary/15 p-2 text-xs text-primary">
            Being deleted since {new Date(m.deletionTimestamp).toLocaleString()}
          </p>
        )}
        <Section title="Metadata">
          <Fields rows={[
            ["Name", <CopyText text={m.name} />],
            ["Namespace", m.namespace],
            ["Created", m.creationTimestamp && new Date(m.creationTimestamp).toLocaleString()],
            ["UID", <CopyText text={m.uid} className="font-mono text-xs" />],
            ["Controlled by", m.ownerReferences?.map((o) => `${o.kind}/${o.name}`).join(", ")],
            ["Finalizers", m.finalizers?.join(", ")],
            ["Labels", <KVChips map={m.labels} />],
            ["Annotations", <KVChips map={filterAnnotations(m.annotations)} collapse />],
          ]} />
        </Section>
        {children}
        <Section title="Events">
          <ObjectEvents context={context} object={object} />
        </Section>
      </div>
    </aside>
  );
}

// kubectl's last-applied blob is huge and noisy; hide it like Lens does
function filterAnnotations(a?: Record<string, string>) {
  if (!a) return a;
  const { "kubectl.kubernetes.io/last-applied-configuration": _, ...rest } = a;
  return rest;
}
