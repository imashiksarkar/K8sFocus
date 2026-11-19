import type { ComponentType } from "react";
import { PodsView } from "./PodsView";
import {
  DaemonSetsView, DeploymentsView, ReplicaSetsView, ReplicationControllersView, StatefulSetsView,
} from "./workloads/views";
import { CronJobsView, JobsView } from "./workloads/batch";
import { WorkloadsOverview } from "./workloads/overview";

export type ViewProps = { context: string; namespaces: string[]; navigate?: (key: string) => void };

/** Sidebar key ("Group/Item") → view. Missing keys show "not implemented yet". */
export const VIEWS: Record<string, ComponentType<ViewProps>> = {
  "Workloads/Overview": WorkloadsOverview,
  "Workloads/Pods": PodsView,
  "Workloads/Deployments": DeploymentsView,
  "Workloads/DaemonSets": DaemonSetsView,
  "Workloads/StatefulSets": StatefulSetsView,
  "Workloads/ReplicaSets": ReplicaSetsView,
  "Workloads/ReplicationControllers": ReplicationControllersView,
  "Workloads/Jobs": JobsView,
  "Workloads/CronJobs": CronJobsView,
};
