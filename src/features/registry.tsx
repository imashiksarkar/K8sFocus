import type { ComponentType } from "react";
import { PodsView } from "./PodsView";
import { DaemonSetsView, DeploymentsView, ReplicaSetsView, StatefulSetsView } from "./workloads/views";

export type ViewProps = { context: string; namespaces: string[] };

/** Sidebar key ("Group/Item") → view. Missing keys show "not implemented yet". */
export const VIEWS: Record<string, ComponentType<ViewProps>> = {
  "Workloads/Pods": PodsView,
  "Workloads/Deployments": DeploymentsView,
  "Workloads/StatefulSets": StatefulSetsView,
  "Workloads/DaemonSets": DaemonSetsView,
  "Workloads/ReplicaSets": ReplicaSetsView,
};
