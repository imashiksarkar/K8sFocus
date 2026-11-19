//! Kubernetes access layer.
//!
//! SAFETY POLICY: this module is READ-ONLY. It only uses `list`/`get` style calls.
//! Any mutating operation (delete/patch/create/scale/...) must be added deliberately
//! in a later roadmap task, behind an explicit user confirmation in the UI.

use std::collections::HashMap;

use k8s_openapi::api::core::v1::{Namespace, Pod};
use kube::{
    api::ListParams,
    config::{KubeConfigOptions, Kubeconfig},
    Api, Client, Config, ResourceExt,
};
use serde::Serialize;
use tokio::sync::Mutex;

#[derive(Default)]
pub struct KubeState {
    clients: Mutex<HashMap<String, Client>>,
}

#[derive(Serialize)]
pub struct ContextInfo {
    name: String,
    cluster: String,
    user: String,
    namespace: Option<String>,
    current: bool,
}

#[derive(Serialize)]
pub struct ClusterInfo {
    context: String,
    version: String,
    platform: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PodRow {
    name: String,
    namespace: String,
    phase: String,
    ready: String,
    restarts: i32,
    node: String,
    created: Option<String>,
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[tauri::command]
pub fn list_contexts() -> Result<Vec<ContextInfo>, String> {
    let kc = Kubeconfig::read().map_err(err)?;
    let current = kc.current_context.clone();
    Ok(kc
        .contexts
        .iter()
        .map(|c| {
            let ctx = c.context.as_ref();
            ContextInfo {
                current: current.as_deref() == Some(c.name.as_str()),
                name: c.name.clone(),
                cluster: ctx.map(|x| x.cluster.clone()).unwrap_or_default(),
                user: ctx.and_then(|x| x.user.clone()).unwrap_or_default(),
                namespace: ctx.and_then(|x| x.namespace.clone()),
            }
        })
        .collect())
}

async fn client_for(state: &KubeState, context: &str) -> Result<Client, String> {
    if let Some(c) = state.clients.lock().await.get(context) {
        return Ok(c.clone());
    }
    let opts = KubeConfigOptions {
        context: Some(context.to_string()),
        ..Default::default()
    };
    let config = Config::from_kubeconfig(&opts).await.map_err(err)?;
    let client = Client::try_from(config).map_err(err)?;
    state
        .clients
        .lock()
        .await
        .insert(context.to_string(), client.clone());
    Ok(client)
}

#[tauri::command]
pub async fn connect(
    state: tauri::State<'_, KubeState>,
    context: String,
) -> Result<ClusterInfo, String> {
    let client = client_for(&state, &context).await?;
    match client.apiserver_version().await {
        Ok(v) => Ok(ClusterInfo {
            context,
            version: v.git_version,
            platform: v.platform,
        }),
        Err(e) => {
            // don't cache a client that can't reach the cluster
            state.clients.lock().await.remove(&context);
            Err(err(e))
        }
    }
}

#[tauri::command]
pub async fn list_namespaces(
    state: tauri::State<'_, KubeState>,
    context: String,
) -> Result<Vec<String>, String> {
    let client = client_for(&state, &context).await?;
    let api: Api<Namespace> = Api::all(client);
    let list = api.list(&ListParams::default()).await.map_err(err)?;
    Ok(list.items.iter().map(|n| n.name_any()).collect())
}

#[tauri::command]
pub async fn list_pods(
    state: tauri::State<'_, KubeState>,
    context: String,
    namespace: Option<String>,
) -> Result<Vec<PodRow>, String> {
    let client = client_for(&state, &context).await?;
    let api: Api<Pod> = match namespace.as_deref() {
        Some(ns) if !ns.is_empty() => Api::namespaced(client, ns),
        _ => Api::all(client),
    };
    let list = api.list(&ListParams::default()).await.map_err(err)?;
    Ok(list
        .items
        .iter()
        .map(|p| {
            let statuses = p
                .status
                .as_ref()
                .and_then(|s| s.container_statuses.clone())
                .unwrap_or_default();
            let ready = statuses.iter().filter(|c| c.ready).count();
            PodRow {
                name: p.name_any(),
                namespace: p.namespace().unwrap_or_default(),
                phase: p
                    .status
                    .as_ref()
                    .and_then(|s| s.phase.clone())
                    .unwrap_or_default(),
                ready: format!("{}/{}", ready, statuses.len()),
                restarts: statuses.iter().map(|c| c.restart_count).sum(),
                node: p
                    .spec
                    .as_ref()
                    .and_then(|s| s.node_name.clone())
                    .unwrap_or_default(),
                created: p.metadata.creation_timestamp.as_ref().map(|t| t.0.to_string()),
            }
        })
        .collect())
}
