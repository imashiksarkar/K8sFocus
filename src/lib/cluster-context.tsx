import { createContext, useContext } from "react";
import type { ObjRef } from "./k8s";
import type { KObject } from "./resources";
import type { EditorTarget } from "@/components/editor/YamlEditor";

export type ClusterCtx = {
  context: string;
  readOnly: boolean;
  openEditor: (t: EditorTarget) => void;
  /** Confirm + delete one object or many (bulk). */
  confirmDelete: (obj: ObjRef | ObjRef[]) => void;
  /** Open a logs tab in the dock for a pod (optionally a specific container). */
  openLogs: (pod: KObject, container?: string) => void;
  /** Open an interactive shell tab (blocked in Rust when read-only). */
  openShell: (pod: KObject, container?: string) => void;
  /** UID to select in the next ResourceView that contains it (from the command palette). */
  focusUid?: string;
  clearFocus: () => void;
};

export const ClusterContext = createContext<ClusterCtx | null>(null);

/** Optional variant for components that may render outside a cluster. */
export function useClusterMaybe() {
  return useContext(ClusterContext);
}

export function useCluster() {
  const c = useContext(ClusterContext);
  if (!c) throw new Error("useCluster outside ClusterContext");
  return c;
}
