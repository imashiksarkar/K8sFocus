import { invoke } from "@tauri-apps/api/core";

// Typed wrappers around the Rust commands in src-tauri/src/kube.rs (all read-only).
export type ContextInfo = { name: string; cluster: string; user: string; namespace?: string; current: boolean };
export type ClusterInfo = { context: string; version: string; platform: string };

export const k8s = {
  listContexts: () => invoke<ContextInfo[]>("list_contexts"),
  connect: (context: string) => invoke<ClusterInfo>("connect", { context }),
};

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

/** Mutations — Rust refuses these unless the cluster is switched to read-write. */
export const k8sWrite = {
  getYaml: (context: string, obj: ObjRef) => invoke<string>("get_yaml", { context, obj }),
  apply: (context: string, yaml: string, opts: { dryRun: boolean; force?: boolean; defaultNamespace?: string }) =>
    invoke<string>("apply_yaml", {
      context, yaml, dryRun: opts.dryRun, force: opts.force ?? false, defaultNamespace: opts.defaultNamespace,
    }),
  delete: (context: string, obj: ObjRef, dryRun = false) => invoke<void>("delete_resource", { context, obj, dryRun }),
};
export const catalog = {
  load: () => invoke<SavedCluster[]>("load_catalog"),
  save: (clusters: SavedCluster[]) => invoke<void>("save_catalog", { clusters }),
};
