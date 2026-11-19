//! Pod log streaming (roadmap T18). READ-ONLY.
//! Lines are batched (whatever is ready, up to 1000) to keep IPC overhead low on chatty pods.
//! Stop with `stop_watch(id)` — logs share the task registry with watches.

use std::sync::atomic::Ordering;

use futures::{AsyncBufReadExt, StreamExt};
use k8s_openapi::api::core::v1::Pod;
use kube::{Api, api::LogParams};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

use crate::kube::{KubeState, client_for};
use crate::watch::WatchState;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogOptions {
    namespace: String,
    pod: String,
    container: Option<String>,
    previous: bool,
    timestamps: bool,
    follow: bool,
    tail_lines: Option<i64>,
}

#[derive(Serialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum LogEvent {
    Lines {
        lines: Vec<String>,
    },
    /// Stream ended (pod terminated / not following). `error` set on failure.
    End {
        error: Option<String>,
    },
}

#[tauri::command]
pub async fn stream_logs(
    kube: tauri::State<'_, KubeState>,
    tasks: tauri::State<'_, WatchState>,
    context: String,
    opts: LogOptions,
    on_event: Channel<LogEvent>,
) -> Result<u64, String> {
    let client = client_for(&kube, &context).await?;
    let api: Api<Pod> = Api::namespaced(client, &opts.namespace);
    let lp = LogParams {
        container: opts.container.clone(),
        previous: opts.previous,
        timestamps: opts.timestamps,
        follow: opts.follow && !opts.previous,
        tail_lines: opts.tail_lines,
        ..Default::default()
    };

    let id = tasks.next_id.fetch_add(1, Ordering::Relaxed);
    let pod = opts.pod.clone();
    let handle = tauri::async_runtime::spawn(async move {
        let reader = match api.log_stream(&pod, &lp).await {
            Ok(r) => r,
            Err(e) => {
                let _ = on_event.send(LogEvent::End {
                    error: Some(e.to_string()),
                });
                return;
            }
        };
        let mut chunks = reader.lines().ready_chunks(1000);
        while let Some(batch) = chunks.next().await {
            let mut lines = Vec::with_capacity(batch.len());
            for l in batch {
                match l {
                    Ok(l) => lines.push(l),
                    Err(e) => {
                        let _ = on_event.send(LogEvent::Lines { lines });
                        let _ = on_event.send(LogEvent::End {
                            error: Some(e.to_string()),
                        });
                        return;
                    }
                }
            }
            if on_event.send(LogEvent::Lines { lines }).is_err() {
                return;
            }
        }
        let _ = on_event.send(LogEvent::End { error: None });
    });
    tasks.tasks.lock().await.insert(id, handle);
    Ok(id)
}

/// Save text to a user-chosen local file (used for "Download logs"). Local disk only.
#[tauri::command]
pub async fn save_text_file(path: String, contents: String) -> Result<(), String> {
    tokio::fs::write(&path, contents)
        .await
        .map_err(|e| e.to_string())
}
