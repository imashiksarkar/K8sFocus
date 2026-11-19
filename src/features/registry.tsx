import type { ComponentType } from "react";
import { PodsView } from "./PodsView";
import {
  DaemonSetsView, DeploymentsView, ReplicaSetsView, ReplicationControllersView, StatefulSetsView,
} from "./workloads/views";
import { CronJobsView, JobsView } from "./workloads/batch";
import { WorkloadsOverview } from "./workloads/overview";
import { NodesView } from "./nodes/NodesView";
import * as Config from "./config/views";
import * as Net from "./network/views";
import * as Storage from "./storage/views";
import * as Cluster from "./cluster/views";
import { CRDsView } from "./crds/views";
import { PortForwardsView } from "./portforward/PortForwardsView";
import { ClusterOverview } from "./cluster/ClusterOverview";
import { HelmReleasesView } from "./helm/ReleasesView";
import { HelmChartsView } from "./helm/ChartsView";

export type ViewProps = { context: string; namespaces: string[]; navigate?: (key: string) => void };

/** Sidebar key ("Group/Item") → view. Missing keys show "not implemented yet". */
export const VIEWS: Record<string, ComponentType<ViewProps>> = {
  "Cluster/Overview": ClusterOverview,
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

  "Network/Services": Net.ServicesView,
  "Network/Endpoints": Net.EndpointsView,
  "Network/EndpointSlices": Net.EndpointSlicesView,
  "Network/Ingresses": Net.IngressesView,
  "Network/Ingress Classes": Net.IngressClassesView,
  "Network/Network Policies": Net.NetworkPoliciesView,
  "Network/Port Forwarding": PortForwardsView,

  "Storage/Persistent Volume Claims": Storage.PVCsView,
  "Storage/Persistent Volumes": Storage.PVsView,
  "Storage/Storage Classes": Storage.StorageClassesView,

  "Namespaces/Namespaces": Cluster.NamespacesView,
  "Events/Events": Cluster.EventsView,

  "Access Control/Service Accounts": Cluster.ServiceAccountsView,
  "Access Control/Cluster Roles": Cluster.ClusterRolesView,
  "Access Control/Roles": Cluster.RolesView,
  "Access Control/Cluster Role Bindings": Cluster.ClusterRoleBindingsView,
  "Access Control/Role Bindings": Cluster.RoleBindingsView,

  "Custom Resources/Definitions": CRDsView,

  "Helm/Charts": HelmChartsView,
  "Helm/Releases": HelmReleasesView,
};
