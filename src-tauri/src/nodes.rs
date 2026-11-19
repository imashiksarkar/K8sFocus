//! Node operations (roadmap T12): cordon/uncordon and drain. All gated by `ensure_writable`.
//!
//! Drain follows `kubectl drain` semantics:
//! - cordon first, then evict pods via the Eviction API (respects PodDisruptionBudgets)
//! - skip DaemonSet pods and mirror (static) pods
//! - pods with emptyDir volumes need `delete_emptydir_data`
//! - pods without a controller need `force` (they won't be recreated anywhere)
//! - already-finished pods (Succeeded/Failed) are evicted without restrictions

use k8s_openapi::api::core::v1::{Node, Pod};
use kube::{
    Api,
    api::{EvictParams, ListParams, Patch, PatchParams},
};
use serde::Serialize;
use tauri::AppHandle;

use crate::catalog::ensure_writable;
use crate::kube::{KubeState, client_for};

#[tauri::command]
pub async fn cordon_node(
    app: AppHandle,
    kube: tauri::State<'_, KubeState>,
    context: String,
    node: String,
    cordon: bool,
) -> Result<(), String> {
    ensure_writable(&app, &context)?;
    let client = client_for(&kube, &context).await?;
    let api: Api<Node> = Api::all(client);
    let patch = serde_json::json!({ "spec": { "unschedulable": cordon } });
    api.patch(&node, &PatchParams::default(), &Patch::Merge(&patch))
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrainPodPlan {
    namespace: String,
    name: String,
    /// "evict" | "skip"
    action: &'static str,
    reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrainResult {
    namespace: String,
    name: String,
    ok: bool,
    message: String,
}

fn classify(p: &Pod, delete_emptydir: bool, force: bool) -> (&'static str, String) {
    let owners = p.metadata.owner_references.clone().unwrap_or_default();
    let annotations = p.metadata.annotations.clone().unwrap_or_default();
    let phase = p
        .status
        .as_ref()
        .and_then(|s| s.phase.clone())
        .unwrap_or_default();
    let finished = phase == "Succeeded" || phase == "Failed";

    if annotations.contains_key("kubernetes.io/config.mirror") {
        return ("skip", "static (mirror) pod".into());
    }
    if owners.iter().any(|o| o.kind == "DaemonSet") {
        return ("skip", "DaemonSet pod".into());
    }
    if finished {
        return ("evict", format!("finished ({phase})"));
    }
    let has_emptydir = p
        .spec
        .as_ref()
        .and_then(|s| s.volumes.as_ref())
        .is_some_and(|v| v.iter().any(|v| v.empty_dir.is_some()));
    if has_emptydir && !delete_emptydir {
        return ("skip", "uses emptyDir (data would be lost)".into());
    }
    if !owners.iter().any(|o| o.controller == Some(true)) {
        return if force {
            ("evict", "no controller — will NOT be recreated".into())
        } else {
            ("skip", "no controller (won't be recreated)".into())
        };
    }
    let owner = owners
        .iter()
        .find(|o| o.controller == Some(true))
        .map(|o| format!("{}/{}", o.kind, o.name))
        .unwrap_or_default();
    (
        "evict",
        if has_emptydir {
            format!("{owner} · emptyDir data will be lost")
        } else {
            owner
        },
    )
}

async fn pods_on(client: kube::Client, node: &str) -> Result<Vec<Pod>, String> {
    let api: Api<Pod> = Api::all(client);
    let lp = ListParams::default().fields(&format!("spec.nodeName={node}"));
    Ok(api.list(&lp).await.map_err(|e| e.to_string())?.items)
}

/// Read-only: what a drain would do with the given options.
#[tauri::command]
pub async fn drain_plan(
    kube: tauri::State<'_, KubeState>,
    context: String,
    node: String,
    delete_emptydir: bool,
    force: bool,
) -> Result<Vec<DrainPodPlan>, String> {
    let client = client_for(&kube, &context).await?;
    Ok(pods_on(client, &node)
        .await?
        .iter()
        .map(|p| {
            let (action, reason) = classify(p, delete_emptydir, force);
            DrainPodPlan {
                namespace: p.metadata.namespace.clone().unwrap_or_default(),
                name: p.metadata.name.clone().unwrap_or_default(),
                action,
                reason,
            }
        })
        .collect())
}

/// Cordon the node, then evict every pod the plan marks "evict". Pods are re-classified here
/// (not taken from the UI), so the frontend can't widen what gets evicted.
#[tauri::command]
pub async fn drain_node(
    app: AppHandle,
    kube: tauri::State<'_, KubeState>,
    context: String,
    node: String,
    delete_emptydir: bool,
    force: bool,
) -> Result<Vec<DrainResult>, String> {
    ensure_writable(&app, &context)?;
    let client = client_for(&kube, &context).await?;

    let nodes: Api<Node> = Api::all(client.clone());
    let patch = serde_json::json!({ "spec": { "unschedulable": true } });
    nodes
        .patch(&node, &PatchParams::default(), &Patch::Merge(&patch))
        .await
        .map_err(|e| format!("cordon failed: {e}"))?;

    let mut results = Vec::new();
    for p in pods_on(client.clone(), &node).await? {
        if classify(&p, delete_emptydir, force).0 != "evict" {
            continue;
        }
        let ns = p.metadata.namespace.clone().unwrap_or_default();
        let name = p.metadata.name.clone().unwrap_or_default();
        let api: Api<Pod> = Api::namespaced(client.clone(), &ns);
        let res = api.evict(&name, &EvictParams::default()).await;
        let (ok, message) = match res {
            Ok(_) => (true, "evicted".to_string()),
            Err(kube::Error::Api(e)) if e.code == 429 => (
                false,
                "blocked by a PodDisruptionBudget — retry the drain later".to_string(),
            ),
            Err(kube::Error::Api(e)) if e.code == 404 => (true, "already gone".to_string()),
            Err(e) => (false, e.to_string()),
        };
        results.push(DrainResult {
            namespace: ns,
            name,
            ok,
            message,
        });
    }
    Ok(results)
}
