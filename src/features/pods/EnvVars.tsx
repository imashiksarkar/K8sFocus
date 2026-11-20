import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, ChevronRight, Copy, Eye, EyeOff, Loader2 } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import type { KObject } from "@/lib/resources";
import { cn } from "@/lib/utils";

type SourceKind = "ConfigMap" | "Secret";
type Loaded = { data?: Record<string, string>; error?: string; loading?: boolean };

/** Session cache so several rows / containers referencing the same object fetch once. */
const cache = new Map<string, Promise<Record<string, string>>>();
function readSource(context: string, namespace: string, kind: SourceKind, name: string) {
  const key = `${context}|${namespace}|${kind}|${name}`;
  let p = cache.get(key);
  if (!p) {
    p = invoke<Record<string, string>>("read_env_source", { context, namespace, kind, name });
    cache.set(key, p);
    p.catch(() => cache.delete(key)); // allow retry after errors
  }
  return p;
}

/** Resolve a fieldRef path against the pod, e.g. metadata.labels['app'], status.podIP. */
function resolveField(pod: KObject, path: string): string | undefined {
  const m = /^metadata\.(labels|annotations)\['(.+)'\]$/.exec(path);
  if (m) return (pod.metadata as any)[m[1]]?.[m[2]];
  let cur: any = pod;
  for (const part of path.split(".")) cur = cur?.[part];
  if (Array.isArray(cur)) return cur.map((x) => (typeof x === "object" ? x.ip ?? JSON.stringify(x) : x)).join(",");
  return cur === undefined ? undefined : String(cur);
}

type Row = {
  name: string;
  /** literal/field/resource values are known; cm/secret values come from `source`. */
  value?: string;
  source?: { kind: SourceKind; name: string; key?: string; optional?: boolean };
  badge: string;
  overridden?: boolean;
};

export function EnvVars({ container, pod, context }: { container: any; pod: KObject; context: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const ns = pod.metadata.namespace!;
  const env: any[] = container.env ?? [];
  const envFrom: any[] = container.envFrom ?? [];
  const total = env.length + envFrom.length;

  const srcKey = (kind: SourceKind, name: string) => `${kind}/${name}`;
  function load(kind: SourceKind, name: string) {
    const k = srcKey(kind, name);
    if (loaded[k]?.data || loaded[k]?.loading) return;
    setLoaded((l) => ({ ...l, [k]: { loading: true } }));
    readSource(context, ns, kind, name)
      .then((data) => setLoaded((l) => ({ ...l, [k]: { data } })))
      .catch((e) => setLoaded((l) => ({ ...l, [k]: { error: String(e) } })));
  }

  // ConfigMaps are fetched when the list opens; Secrets only when revealed.
  useEffect(() => {
    if (!open) return;
    for (const e of env) if (e.valueFrom?.configMapKeyRef) load("ConfigMap", e.valueFrom.configMapKeyRef.name);
    for (const e of envFrom) if (e.configMapRef) load("ConfigMap", e.configMapRef.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const rows: Row[] = useMemo(() => {
    const explicit = new Set(env.map((e) => e.name));
    const out: Row[] = [];
    for (const e of env) {
      const vf = e.valueFrom;
      if (e.value !== undefined || !vf) out.push({ name: e.name, value: e.value ?? "", badge: "value" });
      else if (vf.configMapKeyRef) out.push({ name: e.name, badge: `configmap/${vf.configMapKeyRef.name}`,
        source: { kind: "ConfigMap", name: vf.configMapKeyRef.name, key: vf.configMapKeyRef.key, optional: vf.configMapKeyRef.optional } });
      else if (vf.secretKeyRef) out.push({ name: e.name, badge: `secret/${vf.secretKeyRef.name}`,
        source: { kind: "Secret", name: vf.secretKeyRef.name, key: vf.secretKeyRef.key, optional: vf.secretKeyRef.optional } });
      else if (vf.fieldRef) out.push({ name: e.name, value: resolveField(pod, vf.fieldRef.fieldPath) ?? "", badge: `field ${vf.fieldRef.fieldPath}` });
      else if (vf.resourceFieldRef) {
        const r = vf.resourceFieldRef;
        const c = r.containerName ? [...(pod.spec?.containers ?? [])].find((x: any) => x.name === r.containerName) : container;
        const [kind, res] = String(r.resource).split(".");
        out.push({ name: e.name, value: c?.resources?.[kind]?.[res] ?? "(unset — node allocatable)", badge: `resource ${r.resource}` });
      } else out.push({ name: e.name, value: "", badge: "unknown" });
    }
    for (const f of envFrom) {
      const kind: SourceKind = f.secretRef ? "Secret" : "ConfigMap";
      const ref = f.secretRef ?? f.configMapRef;
      const data = loaded[srcKey(kind, ref.name)]?.data;
      if (!data) {
        out.push({ name: `${f.prefix ?? ""}*`, badge: `all of ${kind === "Secret" ? "secret" : "configmap"}/${ref.name}`,
          source: { kind, name: ref.name, optional: ref.optional } });
        continue;
      }
      for (const k of Object.keys(data)) {
        const name = `${f.prefix ?? ""}${k}`;
        out.push({ name, badge: `${kind === "Secret" ? "secret" : "configmap"}/${ref.name}`,
          source: { kind, name: ref.name, key: k }, overridden: explicit.has(name) });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, pod, loaded]);

  if (!total) return <span className="text-muted-foreground">—</span>;

  return (
    <div className="min-w-0">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-primary hover:underline">
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        {open ? "Hide" : "Show"} {env.length} variable{env.length === 1 ? "" : "s"}
        {envFrom.length > 0 && ` + ${envFrom.length} source${envFrom.length === 1 ? "" : "s"}`}
      </button>
      {open && (
        <ul className="mt-2 divide-y rounded-md border text-xs">
          {rows.map((r, i) => <EnvRow key={`${r.name}-${i}`} r={r} loaded={loaded} revealed={revealed}
            onReveal={(k, v) => { setRevealed((x) => ({ ...x, [k]: v })); if (v && r.source) load(r.source.kind, r.source.name); }}
            onLoad={(kind, name) => load(kind, name)} />)}
        </ul>
      )}
    </div>
  );
}

function EnvRow({ r, loaded, revealed, onReveal, onLoad }: {
  r: Row;
  loaded: Record<string, Loaded>;
  revealed: Record<string, boolean>;
  onReveal: (rowKey: string, show: boolean) => void;
  onLoad: (kind: SourceKind, name: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const src = r.source;
  const isSecret = src?.kind === "Secret";
  const rowKey = `${r.badge}|${r.name}`;
  const state = src ? loaded[`${src.kind}/${src.name}`] : undefined;
  const shown = !isSecret || revealed[rowKey];

  let value: React.ReactNode;
  let plain: string | undefined;
  if (!src) { plain = r.value; value = r.value || <span className="text-muted-foreground">""</span>; }
  else if (!src.key) {
    // un-expanded envFrom group
    value = state?.loading ? <Loader2 className="size-3 animate-spin" />
      : state?.error ? <span className="text-destructive" title={state.error}>{friendlyError(state.error).title}{src.optional ? " (optional)" : ""}</span>
      : <button className="text-primary hover:underline" onClick={() => onLoad(src.kind, src.name)}>
          {isSecret ? "Reveal keys" : "Load keys"}
        </button>;
  } else if (!shown) value = <span className="tracking-widest text-muted-foreground">••••••••</span>;
  else if (state?.loading || !state) value = <Loader2 className="size-3 animate-spin" />;
  else if (state.error) value = <span className="text-destructive" title={state.error}>{friendlyError(state.error).title}</span>;
  else if (!(src.key in (state.data ?? {}))) value = <span className="text-primary">missing key “{src.key}”{src.optional ? " (optional)" : ""}</span>;
  else { plain = state.data![src.key]; value = plain || <span className="text-muted-foreground">""</span>; }

  return (
    <li className={cn("group grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-start gap-2 px-2 py-1.5", r.overridden && "opacity-50")}>
      <div className="min-w-0">
        <div className="truncate font-mono font-medium" title={r.name}>{r.name}</div>
        <div className="truncate text-[10px] text-muted-foreground" title={r.badge}>
          {r.badge}{r.overridden && " · overridden by env"}
        </div>
      </div>
      <div className="min-w-0 font-mono break-all whitespace-pre-wrap select-text">{value}</div>
      <div className="flex items-center gap-1">
        {isSecret && src?.key && (
          <button title={shown ? "Hide" : "Reveal"} className="text-muted-foreground hover:text-foreground" onClick={() => onReveal(rowKey, !shown)}>
            {shown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        )}
        {plain !== undefined && (
          <button title="Copy value" className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
            onClick={() => navigator.clipboard?.writeText(plain!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1000); })}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
        )}
      </div>
    </li>
  );
}
