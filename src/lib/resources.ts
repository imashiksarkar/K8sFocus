/** Resource descriptors passed to the Rust generic watcher. Extend as views are added. */
export type ResourceRef = {
  group: string; version: string; kind: string; plural: string; namespaced: boolean;
};

export const R = {
  pods: { group: "", version: "v1", kind: "Pod", plural: "pods", namespaced: true },
  events: { group: "", version: "v1", kind: "Event", plural: "events", namespaced: true },
  namespaces: { group: "", version: "v1", kind: "Namespace", plural: "namespaces", namespaced: false },
} satisfies Record<string, ResourceRef>;

/** Minimal shape every Kubernetes object has. */
export type KObject = {
  apiVersion?: string;
  kind?: string;
  metadata: {
    name: string; namespace?: string; uid: string; creationTimestamp?: string;
    labels?: Record<string, string>; annotations?: Record<string, string>;
    deletionTimestamp?: string;
    resourceVersion?: string;
    generation?: number;
    ownerReferences?: { kind: string; name: string; uid: string; controller?: boolean }[];
    finalizers?: string[];
  };
  spec?: any; status?: any;
};

export const apiVersionOf = (r: ResourceRef) => (r.group ? `${r.group}/${r.version}` : r.version);
export const refOf = (r: ResourceRef, o: KObject) => ({
  apiVersion: apiVersionOf(r), kind: r.kind, namespace: o.metadata.namespace, name: o.metadata.name,
});
