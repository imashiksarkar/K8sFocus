//! Generic, READ-ONLY list+watch for any Kubernetes resource (roadmap T5).
//!
//! The frontend calls `watch_resource` with a resource description and a Tauri `Channel`.
//! We run a kube-rs watcher (initial list + watch, auto re-list on expiry/reconnect) and
//! stream events down the channel. `stop_watch` aborts it.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};

use futures::StreamExt;
use kube::{
    Api,
    api::{ApiResource, DynamicObject, GroupVersionKind},
    runtime::watcher::{self, Event},
};
use serde::{Deserialize, Serialize};
use tauri::{async_runtime::JoinHandle, ipc::Channel};
use tokio::sync::Mutex;

use crate::kube::{KubeState, client_for};

#[derive(Default)]
pub struct WatchState {
    next_id: AtomicU64,
    tasks: Mutex<HashMap<u64, JoinHandle<()>>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceRef {
    group: String,
    version: String,
    kind: String,
    plural: String,
    namespaced: bool,
}

#[derive(Serialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum WatchEvent {
    /// A (re)list started: the client should collect `initApply` items and swap on `ready`.
    Init,
    InitApply {
        object: serde_json::Value,
    },
    /// Initial list complete.
    Ready,
    Apply {
        object: serde_json::Value,
    },
    Delete {
        object: serde_json::Value,
    },
    /// Recoverable error; the watcher retries with backoff.
    Error {
        message: String,
    },
}

#[tauri::command]
pub async fn watch_resource(
    kube: tauri::State<'_, KubeState>,
    watches: tauri::State<'_, WatchState>,
    context: String,
    resource: ResourceRef,
    namespace: Option<String>,
    on_event: Channel<WatchEvent>,
) -> Result<u64, String> {
    let client = client_for(&kube, &context).await?;
    let gvk = GroupVersionKind::gvk(&resource.group, &resource.version, &resource.kind);
    let ar = ApiResource::from_gvk_with_plural(&gvk, &resource.plural);
    let api: Api<DynamicObject> = match namespace.as_deref() {
        Some(ns) if resource.namespaced && !ns.is_empty() => Api::namespaced_with(client, ns, &ar),
        _ => Api::all_with(client, &ar),
    };

    let id = watches.next_id.fetch_add(1, Ordering::Relaxed);
    let handle = tauri::async_runtime::spawn(async move {
        let mut stream = watcher::watcher(api, watcher::Config::default()).boxed();
        while let Some(ev) = stream.next().await {
            let msg = match ev {
                Ok(Event::Init) => WatchEvent::Init,
                Ok(Event::InitApply(o)) => WatchEvent::InitApply { object: to_json(o) },
                Ok(Event::InitDone) => WatchEvent::Ready,
                Ok(Event::Apply(o)) => WatchEvent::Apply { object: to_json(o) },
                Ok(Event::Delete(o)) => WatchEvent::Delete { object: to_json(o) },
                Err(e) => {
                    let msg = WatchEvent::Error {
                        message: e.to_string(),
                    };
                    if on_event.send(msg).is_err() {
                        break;
                    }
                    // back off a bit so a persistent error (e.g. RBAC forbidden) doesn't spin
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                    continue;
                }
            };
            if on_event.send(msg).is_err() {
                break; // webview went away
            }
        }
    });
    watches.tasks.lock().await.insert(id, handle);
    Ok(id)
}

#[tauri::command]
pub async fn stop_watch(watches: tauri::State<'_, WatchState>, id: u64) -> Result<(), String> {
    if let Some(h) = watches.tasks.lock().await.remove(&id) {
        h.abort();
    }
    Ok(())
}

fn to_json(o: DynamicObject) -> serde_json::Value {
    serde_json::to_value(o).unwrap_or_default()
}
