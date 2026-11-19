# K8sFocus Roadmap

K8sFocus is a desktop Kubernetes client with the same feature set as Lens.
We complete one task at a time and test each one before starting the next.
Each task has acceptance criteria. Tick the box only after you have tested the task by hand on a real cluster (kind, minikube, k3d or Docker Desktop).

**Architecture:** Tauri 2 (Rust) backend with a React 19 + TypeScript + Tailwind v4 + shadcn/ui frontend.
- The backend talks to Kubernetes through [`kube-rs`](https://kube.rs) and pushes watch streams to the UI as Tauri events.
- The frontend never talks to the cluster directly.
- The theme is dark mode by default, with a yellow primary color.

---

## Feature list (Lens parity)

| Area | Features |
|---|---|
| Cluster management | Read kubeconfig files (`~/.kube/config`, `KUBECONFIG`, added files), list contexts, connect/disconnect, hotbar of pinned clusters, icon/name per cluster, multiple clusters open at once, namespace allow-list per cluster |
| Cluster overview | Node, CPU and memory usage, pod counts, warning events |
| Nodes | List and details, conditions, taints, capacity and allocatable resources, cordon/uncordon, drain, node shell |
| Workloads | Overview, Pods, Deployments, DaemonSets, StatefulSets, ReplicaSets, ReplicationControllers, Jobs, CronJobs |
| Workload actions | Scale, restart (rollout), delete, edit YAML, trigger CronJob, suspend/resume CronJob, rollback deployment |
| Pod actions | Logs (follow, container picker, previous, timestamps, search, download), exec shell, attach, port-forward, evict, delete |
| Config | ConfigMaps, Secrets (reveal/edit), ResourceQuotas, LimitRanges, HPA, VPA, PDB, PriorityClasses, RuntimeClasses, Leases, Mutating/Validating webhooks |
| Network | Services, Endpoints, EndpointSlices, Ingresses, IngressClasses, NetworkPolicies, port-forward manager |
| Storage | PVC, PV, StorageClasses |
| Namespaces | List, create, delete |
| Events | Cluster events with filters |
| Helm | Browse charts from repositories, install, list releases, upgrade, rollback, uninstall, view values and history |
| Access control | ServiceAccounts, Roles, ClusterRoles, RoleBindings, ClusterRoleBindings |
| Custom resources | List CRDs, show generic tables for any CR using `additionalPrinterColumns` |
| Generic UX | Live tables (watch), sorting, filtering, search, namespace selector, column picker, multi-select bulk delete, details drawer, YAML editor (Monaco) with apply, create resource from YAML |
| Dock | Tabs for terminal (local shell with `KUBECONFIG` set), pod shell, logs and YAML editor; resizable |
| Metrics | CPU and memory charts from metrics-server, Prometheus integration (optional) |
| App | Command palette (⌘K), preferences (kubeconfig paths, kubectl path, theme, font size), auto-update, app menu and shortcuts |

---

## Tasks

### Phase 0: Foundation
- [x] **T0 Project init.** Clean up the template, rename the app to K8sFocus, set up Tailwind v4, shadcn and the dark yellow theme, add the static app shell (hotbar, sidebar, main view, status bar), and write the manual GitHub build workflows.
- [ ] **T0.1 First local build.** Install Rust, run `bun run tauri dev`, then build a `.dmg` with `bun run tauri build`. Trigger the GitHub "Build installers" workflow once.

### Phase 1: Connecting to clusters
- [x] **T1 Kubeconfig loader (Rust).** Parse the kubeconfig files, list contexts and send them to the UI. *Accept:* every context in `kubectl config get-contexts` appears in the UI.
- [~] **T2 Connect to a cluster.** Build a `kube::Client` for each context, run a health check and show the server version. Support exec auth plugins (EKS `aws`, GKE `gke-gcloud-auth-plugin`, AKS `kubelogin`). macOS GUI apps don't inherit the shell `PATH`, so fix it by resolving the login shell `PATH`. *Accept:* connect to kind plus one cloud cluster.
- [~] **T3 Hotbar and cluster catalog.** Pin clusters, rename them, set an icon, save to the app config dir, and switch between clusters.
- [~] **T4 Namespace selector.** Choose one, several or all namespaces. Keep the selection per cluster.

### Phase 2: Generic resource engine
- [~] **T5 Generic list and watch.** A Rust command that lists and watches any GVK and streams add/update/delete events to the frontend store (zustand).
- [~] **T6 Resource table component.** A virtualized table (TanStack Table plus virtual scrolling) with sorting, search, column visibility, multi-select and an age column that updates live.
- [~] **T7 Details drawer.** Metadata, labels, annotations, owner references, events for the object and status conditions.
- [~] **T8 YAML editor.** Monaco editor that loads YAML, edits it, then applies the change with server-side apply. Also covers create from YAML and delete with confirmation.

### Phase 3: Built-in resource views
- [~] **T9 Pods.** Table with status, restarts, node, QoS, CPU/mem; container details in the drawer.
- [~] **T10 Deployments, StatefulSets, DaemonSets and ReplicaSets.** Scale, restart and rollback actions.
- [~] **T11 Jobs and CronJobs.** Trigger, suspend and resume.
- [~] **T12 Nodes.** Cordon, uncordon and drain.
- [~] **T13 Config views.** ConfigMaps, Secrets (base64 reveal), quotas, limits, HPA, PDB and the rest of the Config section.
- [~] **T14 Network and Storage views.**
- [~] **T15 Namespaces, Events, and the RBAC views.**
- [~] **T16 CRDs and generic custom resource tables.**

### Phase 4: Dock and interactive features
- [~] **T17 Dock panel.** Resizable bottom panel with tabs.
- [~] **T18 Pod logs.** Follow mode, choice of container, previous container's logs, search, timestamps and download.
- [~] **T19 Pod exec shell.** xterm.js connected to kube-rs `exec` over websocket, with terminal resize.
- [~] **T20 Local terminal.** A PTY (`portable-pty`) with `KUBECONFIG` and the current context set.
- [~] **T21 Port forwarding.** Forward from pods and services, plus a manager view where you can open the forwarded port in the browser.

### Phase 5: Metrics and overview
- [ ] **T22 metrics-server integration.** Pod and node CPU/mem columns and sparklines.
- [ ] **T23 Cluster overview and workloads overview dashboards.**
- [ ] **T24 Prometheus integration (optional).** Historical charts.

### Phase 6: Helm
- [ ] **T25 Helm releases.** List, view details and values, view history, roll back and uninstall. This shells out to the `helm` CLI.
- [ ] **T26 Helm charts.** Manage repos, search charts, install, and upgrade with a values editor.

### Phase 7: Polish and distribution
- [ ] **T27 Command palette (⌘K) and keyboard shortcuts.**
- [ ] **T28 Preferences screen.**
- [ ] **T29 Native app menu and window state persistence.**
- [ ] **T30 App icon and branding.**
- [ ] **T31 macOS code signing and notarization in CI (needs an Apple Developer account), and Windows signing (optional).**
- [ ] **T32 Auto-updater.** Uses `tauri-plugin-updater` with GitHub Releases.
