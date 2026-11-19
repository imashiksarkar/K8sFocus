//! Kubernetes access layer.
//!
//! Connection management (read-only). All mutating commands live in `mutate.rs`
//! and are gated by `catalog::ensure_writable`.

use std::collections::HashMap;

use kube::{Client, Config, config::KubeConfigOptions};
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

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[tauri::command]
pub fn list_contexts() -> Result<Vec<ContextInfo>, String> {
    let kc = crate::prefs::load_kubeconfig()?;
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

pub async fn client_for(state: &KubeState, context: &str) -> Result<Client, String> {
    if let Some(c) = state.clients.lock().await.get(context) {
        return Ok(c.clone());
    }
    let opts = KubeConfigOptions {
        context: Some(context.to_string()),
        ..Default::default()
    };
    let kc = crate::prefs::load_kubeconfig()?;
    let config = Config::from_custom_kubeconfig(kc, &opts)
        .await
        .map_err(err)?;
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
