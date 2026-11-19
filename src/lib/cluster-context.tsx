import { createContext, useContext } from "react";
import type { ObjRef } from "./k8s";
import type { EditorTarget } from "@/components/editor/YamlEditor";

export type ClusterCtx = {
  context: string;
  readOnly: boolean;
  openEditor: (t: EditorTarget) => void;
  confirmDelete: (obj: ObjRef) => void;
};

export const ClusterContext = createContext<ClusterCtx | null>(null);

export function useCluster() {
  const c = useContext(ClusterContext);
  if (!c) throw new Error("useCluster outside ClusterContext");
  return c;
}
