import { invoke } from "@tauri-apps/api/core";

// Typed wrappers around the Rust commands in src-tauri/src/kube.rs (all read-only).
export type ContextInfo = { name: string; cluster: string; user: string; namespace?: string; current: boolean };
export type ClusterInfo = { context: string; version: string; platform: string };
export type PodRow = {
  name: string; namespace: string; phase: string; ready: string;
  restarts: number; node: string; created?: string;
};

export const k8s = {
  listContexts: () => invoke<ContextInfo[]>("list_contexts"),
  connect: (context: string) => invoke<ClusterInfo>("connect", { context }),
  listNamespaces: (context: string) => invoke<string[]>("list_namespaces", { context }),
  listPods: (context: string, namespace?: string) => invoke<PodRow[]>("list_pods", { context, namespace }),
};

export function age(iso?: string) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export type SavedCluster = { context: string; name: string; color?: string };
export const catalog = {
  load: () => invoke<SavedCluster[]>("load_catalog"),
  save: (clusters: SavedCluster[]) => invoke<void>("save_catalog", { clusters }),
};
