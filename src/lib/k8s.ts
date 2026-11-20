import { invoke } from "@tauri-apps/api/core";

// Typed wrappers around the Rust commands in src-tauri/src/kube.rs (all read-only).
export type ContextInfo = { name: string; cluster: string; user: string; namespace?: string; current: boolean };
export type ClusterInfo = { context: string; version: string; platform: string };

export const k8s = {
  listContexts: () => invoke<ContextInfo[]>("list_contexts"),
  connect: (context: string) => invoke<ClusterInfo>("connect", { context }),
};

/** Human duration between two ISO times (or now). */
export function duration(from?: string, to?: string) {
  if (!from) return "";
  const s = Math.max(0, ((to ? new Date(to) : new Date()).getTime() - new Date(from).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${Math.floor(s % 60)}s`;
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
}

export function age(iso?: string) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** readOnly defaults to true (also enforced in Rust). */
export type SavedCluster = { context: string; name: string; color?: string; readOnly?: boolean };
export const isReadOnly = (c?: SavedCluster) => c?.readOnly !== false;

export type ObjRef = { apiVersion: string; kind: string; namespace?: string; name: string };

export type DrainPlan = { namespace: string; name: string; action: "evict" | "skip"; reason: string };
export type DrainResult = { namespace: string; name: string; ok: boolean; message: string };

/** Parse Kubernetes quantities ("3880Mi", "4", "250m", "4942184515n") into base units (bytes / cores). */
export function parseQuantity(q?: string): number {
  if (!q) return 0;
  const m = /^([0-9.]+)([a-zA-Z]*)$/.exec(q);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  // Kubernetes suffixes: n=nanocores, u=micro, m=milli, k=kilo(1000), M=mega, G=giga, T=tera
  // and binary: Ki/Mi/Gi/Ti. Note: "m" is milli (1e-3), NOT the variable name.
  const mult: Record<string, number> = {
    "": 1, n: 1e-9, u: 1e-6, m: 1e-3, k: 1e3, M: 1e6, G: 1e9, T: 1e12,
    Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4,
  };
  return n * (mult[m[2]] ?? 1);
}
export const fmtBytes = (b: number) =>
  b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)}GiB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(0)}MiB` : `${b}B`;

/** Mutations — Rust refuses these unless the cluster is switched to read-write. */
export const k8sWrite = {
  getYaml: (context: string, obj: ObjRef) => invoke<string>("get_yaml", { context, obj }),
  apply: (context: string, yaml: string, opts: { dryRun: boolean; force?: boolean; defaultNamespace?: string }) =>
    invoke<string>("apply_yaml", {
      context, yaml, dryRun: opts.dryRun, force: opts.force ?? false, defaultNamespace: opts.defaultNamespace,
    }),
  delete: (context: string, obj: ObjRef, dryRun = false) => invoke<void>("delete_resource", { context, obj, dryRun }),
  scale: (context: string, obj: ObjRef, replicas: number) => invoke<void>("scale_resource", { context, obj, replicas }),
  restart: (context: string, obj: ObjRef) => invoke<void>("restart_workload", { context, obj }),
  rollback: (context: string, namespace: string, name: string, replicaSet: string) =>
    invoke<void>("rollback_deployment", { context, namespace, name, replicaSet }),
  cordon: (context: string, node: string, cordon: boolean) => invoke<void>("cordon_node", { context, node, cordon }),
  drainPlan: (context: string, node: string, deleteEmptydir: boolean, force: boolean) =>
    invoke<DrainPlan[]>("drain_plan", { context, node, deleteEmptydir, force }),
  drain: (context: string, node: string, deleteEmptydir: boolean, force: boolean) =>
    invoke<DrainResult[]>("drain_node", { context, node, deleteEmptydir, force }),
  triggerCronJob: (context: string, namespace: string, name: string) =>
    invoke<string>("trigger_cronjob", { context, namespace, name }),
  setCronJobSuspend: (context: string, namespace: string, name: string, suspend: boolean) =>
    invoke<void>("set_cronjob_suspend", { context, namespace, name, suspend }),
};
export const catalog = {
  load: () => invoke<SavedCluster[]>("load_catalog"),
  save: (clusters: SavedCluster[]) => invoke<void>("save_catalog", { clusters }),
};
