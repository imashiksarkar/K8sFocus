import {
  Activity, Boxes, Cable, Database, FileCog, Gauge, HardDrive, KeyRound,
  Layers, Network, Package, Puzzle, Server, Settings2, ShieldCheck, type LucideIcon,
} from "lucide-react";

export type NavGroup = { label: string; icon: LucideIcon; items: string[] };

/** Sidebar structure — mirrors Lens' cluster navigation. */
export const NAV: NavGroup[] = [
  { label: "Cluster", icon: Gauge, items: ["Overview"] },
  { label: "Nodes", icon: Server, items: ["Nodes"] },
  {
    label: "Workloads", icon: Boxes,
    items: ["Overview", "Pods", "Deployments", "DaemonSets", "StatefulSets", "ReplicaSets", "ReplicationControllers", "Jobs", "CronJobs"],
  },
  {
    label: "Config", icon: FileCog,
    items: ["ConfigMaps", "Secrets", "Resource Quotas", "Limit Ranges", "HPA", "VPA", "Pod Disruption Budgets", "Priority Classes", "Runtime Classes", "Leases", "Mutating Webhooks", "Validating Webhooks"],
  },
  { label: "Network", icon: Network, items: ["Services", "Endpoints", "EndpointSlices", "Ingresses", "Ingress Classes", "Network Policies", "Port Forwarding"] },
  { label: "Storage", icon: HardDrive, items: ["Persistent Volume Claims", "Persistent Volumes", "Storage Classes"] },
  { label: "Namespaces", icon: Layers, items: ["Namespaces"] },
  { label: "Events", icon: Activity, items: ["Events"] },
  { label: "Helm", icon: Package, items: ["Charts", "Releases"] },
  {
    label: "Access Control", icon: ShieldCheck,
    items: ["Service Accounts", "Cluster Roles", "Roles", "Cluster Role Bindings", "Role Bindings"],
  },
  { label: "Custom Resources", icon: Puzzle, items: ["Definitions"] },
];

export const HOTBAR_ICONS = { Cable, Database, KeyRound, Settings2 };
