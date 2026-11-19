/** Resource descriptors passed to the Rust generic watcher. Extend as views are added. */
export type ResourceRef = {
  group: string; version: string; kind: string; plural: string; namespaced: boolean;
};

export const R = {
  pods: { group: "", version: "v1", kind: "Pod", plural: "pods", namespaced: true },
  deployments: { group: "apps", version: "v1", kind: "Deployment", plural: "deployments", namespaced: true },
  statefulsets: { group: "apps", version: "v1", kind: "StatefulSet", plural: "statefulsets", namespaced: true },
  daemonsets: { group: "apps", version: "v1", kind: "DaemonSet", plural: "daemonsets", namespaced: true },
  replicasets: { group: "apps", version: "v1", kind: "ReplicaSet", plural: "replicasets", namespaced: true },
  replicationcontrollers: { group: "", version: "v1", kind: "ReplicationController", plural: "replicationcontrollers", namespaced: true },
  jobs: { group: "batch", version: "v1", kind: "Job", plural: "jobs", namespaced: true },
  cronjobs: { group: "batch", version: "v1", kind: "CronJob", plural: "cronjobs", namespaced: true },
  nodes: { group: "", version: "v1", kind: "Node", plural: "nodes", namespaced: false },
  configmaps: { group: "", version: "v1", kind: "ConfigMap", plural: "configmaps", namespaced: true },
  secrets: { group: "", version: "v1", kind: "Secret", plural: "secrets", namespaced: true },
  resourcequotas: { group: "", version: "v1", kind: "ResourceQuota", plural: "resourcequotas", namespaced: true },
  limitranges: { group: "", version: "v1", kind: "LimitRange", plural: "limitranges", namespaced: true },
  hpas: { group: "autoscaling", version: "v2", kind: "HorizontalPodAutoscaler", plural: "horizontalpodautoscalers", namespaced: true },
  vpas: { group: "autoscaling.k8s.io", version: "v1", kind: "VerticalPodAutoscaler", plural: "verticalpodautoscalers", namespaced: true },
  pdbs: { group: "policy", version: "v1", kind: "PodDisruptionBudget", plural: "poddisruptionbudgets", namespaced: true },
  priorityclasses: { group: "scheduling.k8s.io", version: "v1", kind: "PriorityClass", plural: "priorityclasses", namespaced: false },
  runtimeclasses: { group: "node.k8s.io", version: "v1", kind: "RuntimeClass", plural: "runtimeclasses", namespaced: false },
  leases: { group: "coordination.k8s.io", version: "v1", kind: "Lease", plural: "leases", namespaced: true },
  mutatingwebhooks: { group: "admissionregistration.k8s.io", version: "v1", kind: "MutatingWebhookConfiguration", plural: "mutatingwebhookconfigurations", namespaced: false },
  validatingwebhooks: { group: "admissionregistration.k8s.io", version: "v1", kind: "ValidatingWebhookConfiguration", plural: "validatingwebhookconfigurations", namespaced: false },
  services: { group: "", version: "v1", kind: "Service", plural: "services", namespaced: true },
  endpoints: { group: "", version: "v1", kind: "Endpoints", plural: "endpoints", namespaced: true },
  endpointslices: { group: "discovery.k8s.io", version: "v1", kind: "EndpointSlice", plural: "endpointslices", namespaced: true },
  ingresses: { group: "networking.k8s.io", version: "v1", kind: "Ingress", plural: "ingresses", namespaced: true },
  ingressclasses: { group: "networking.k8s.io", version: "v1", kind: "IngressClass", plural: "ingressclasses", namespaced: false },
  networkpolicies: { group: "networking.k8s.io", version: "v1", kind: "NetworkPolicy", plural: "networkpolicies", namespaced: true },
  pvcs: { group: "", version: "v1", kind: "PersistentVolumeClaim", plural: "persistentvolumeclaims", namespaced: true },
  pvs: { group: "", version: "v1", kind: "PersistentVolume", plural: "persistentvolumes", namespaced: false },
  storageclasses: { group: "storage.k8s.io", version: "v1", kind: "StorageClass", plural: "storageclasses", namespaced: false },
  serviceaccounts: { group: "", version: "v1", kind: "ServiceAccount", plural: "serviceaccounts", namespaced: true },
  roles: { group: "rbac.authorization.k8s.io", version: "v1", kind: "Role", plural: "roles", namespaced: true },
  clusterroles: { group: "rbac.authorization.k8s.io", version: "v1", kind: "ClusterRole", plural: "clusterroles", namespaced: false },
  rolebindings: { group: "rbac.authorization.k8s.io", version: "v1", kind: "RoleBinding", plural: "rolebindings", namespaced: true },
  clusterrolebindings: { group: "rbac.authorization.k8s.io", version: "v1", kind: "ClusterRoleBinding", plural: "clusterrolebindings", namespaced: false },
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
