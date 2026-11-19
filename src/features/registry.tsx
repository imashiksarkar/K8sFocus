import type { ComponentType } from "react";
import { PodsView } from "./PodsView";
import {
  DaemonSetsView, DeploymentsView, ReplicaSetsView, ReplicationControllersView, StatefulSetsView,
} from "./workloads/views";
import { CronJobsView, JobsView } from "./workloads/batch";
import { WorkloadsOverview } from "./workloads/overview";
import { NodesView } from "./nodes/NodesView";
import * as Config from "./config/views";

export type ViewProps = { context: string; namespaces: string[]; navigate?: (key: string) => void };

/** Sidebar key ("Group/Item") → view. Missing keys show "not implemented yet". */
export const VIEWS: Record<string, ComponentType<ViewProps>> = {
  "Nodes/Nodes": NodesView,

  "Workloads/Overview": WorkloadsOverview,
  "Workloads/Pods": PodsView,
  "Workloads/Deployments": DeploymentsView,
  "Workloads/DaemonSets": DaemonSetsView,
  "Workloads/StatefulSets": StatefulSetsView,
  "Workloads/ReplicaSets": ReplicaSetsView,
  "Workloads/ReplicationControllers": ReplicationControllersView,
  "Workloads/Jobs": JobsView,
  "Workloads/CronJobs": CronJobsView,

  "Config/ConfigMaps": Config.ConfigMapsView,
  "Config/Secrets": Config.SecretsView,
  "Config/Resource Quotas": Config.ResourceQuotasView,
  "Config/Limit Ranges": Config.LimitRangesView,
  "Config/HPA": Config.HPAsView,
  "Config/VPA": Config.VPAsView,
  "Config/Pod Disruption Budgets": Config.PDBsView,
  "Config/Priority Classes": Config.PriorityClassesView,
  "Config/Runtime Classes": Config.RuntimeClassesView,
  "Config/Leases": Config.LeasesView,
  "Config/Mutating Webhooks": Config.MutatingWebhooksView,
  "Config/Validating Webhooks": Config.ValidatingWebhooksView,
};
