//! Interactive pod shell (roadmap T19), like `kubectl exec -it`.
//! Gated by `ensure_writable`: a shell can change anything inside the container.
//!
//! Output is sent to the UI as base64 chunks (binary-safe; split UTF-8 sequences are
//! reassembled by xterm.js). Input and resize go through per-session channels.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};

use base64::{Engine, engine::general_purpose::STANDARD as B64};
use k8s_openapi::api::core::v1::Pod;
use kube::Api;
use kube::api::{AttachParams, TerminalSize};
use serde::Serialize;
use tauri::{AppHandle, ipc::Channel};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::{Mutex, mpsc};

use crate::catalog::ensure_writable;
use crate::kube::{KubeState, client_for};

struct Session {
    stdin: mpsc::Sender<Vec<u8>>,
    resize: mpsc::Sender<TerminalSize>,
    task: tauri::async_runtime::JoinHandle<()>,
}

#[derive(Default)]
pub struct ExecState {
    next_id: AtomicU64,
    sessions: Mutex<HashMap<u64, Session>>,
}

#[derive(Serialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ExecEvent {
    Data { b64: String },
    Exit { message: String },
}

/// Try bash, then ash, then sh — same trick Lens uses.
const SHELL: &str = "clear; (bash || ash || sh)";

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn exec_start(
    app: AppHandle,
    kube: tauri::State<'_, KubeState>,
    state: tauri::State<'_, ExecState>,
    context: String,
    namespace: String,
    pod: String,
    container: Option<String>,
    cols: u16,
    rows: u16,
    on_event: Channel<ExecEvent>,
) -> Result<u64, String> {
    ensure_writable(&app, &context)?;
    let client = client_for(&kube, &context).await?;
    let api: Api<Pod> = Api::namespaced(client, &namespace);
    let mut ap = AttachParams::interactive_tty();
    if let Some(c) = container {
        ap = ap.container(c);
    }
    let mut proc = api
        .exec(&pod, vec!["sh", "-c", SHELL], &ap)
        .await
        .map_err(|e| e.to_string())?;

    let mut stdout = proc.stdout().ok_or("no stdout")?;
    let mut stdin = proc.stdin().ok_or("no stdin")?;
    let mut size_tx = proc.terminal_size().ok_or("no tty")?;
    let _ = futures::SinkExt::send(
        &mut size_tx,
        TerminalSize {
            width: cols,
            height: rows,
        },
    )
    .await;

    let (in_tx, mut in_rx) = mpsc::channel::<Vec<u8>>(256);
    let (rs_tx, mut rs_rx) = mpsc::channel::<TerminalSize>(16);

    let task = tauri::async_runtime::spawn(async move {
        let mut buf = vec![0u8; 16 * 1024];
        loop {
            tokio::select! {
                n = stdout.read(&mut buf) => match n {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if on_event.send(ExecEvent::Data { b64: B64.encode(&buf[..n]) }).is_err() { break; }
                    }
                },
                Some(data) = in_rx.recv() => {
                    if stdin.write_all(&data).await.is_err() { break; }
                },
                Some(size) = rs_rx.recv() => {
                    let _ = futures::SinkExt::send(&mut size_tx, size).await;
                },
            }
        }
        let message = match proc.take_status() {
            Some(st) => match st.await {
                Some(s) if s.status.as_deref() == Some("Success") => "exited".to_string(),
                Some(s) => s.message.unwrap_or_else(|| "exited with error".into()),
                None => "connection closed".into(),
            },
            None => "connection closed".into(),
        };
        let _ = on_event.send(ExecEvent::Exit { message });
    });

    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    state.sessions.lock().await.insert(
        id,
        Session {
            stdin: in_tx,
            resize: rs_tx,
            task,
        },
    );
    Ok(id)
}

#[tauri::command]
pub async fn exec_write(
    state: tauri::State<'_, ExecState>,
    id: u64,
    data: String,
) -> Result<(), String> {
    let tx = state
        .sessions
        .lock()
        .await
        .get(&id)
        .map(|s| s.stdin.clone());
    match tx {
        Some(tx) => tx
            .send(data.into_bytes())
            .await
            .map_err(|_| "session closed".into()),
        None => Err("session closed".into()),
    }
}

#[tauri::command]
pub async fn exec_resize(
    state: tauri::State<'_, ExecState>,
    id: u64,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    if let Some(s) = state.sessions.lock().await.get(&id) {
        let _ = s
            .resize
            .send(TerminalSize {
                width: cols,
                height: rows,
            })
            .await;
    }
    Ok(())
}

#[tauri::command]
pub async fn exec_close(state: tauri::State<'_, ExecState>, id: u64) -> Result<(), String> {
    if let Some(s) = state.sessions.lock().await.remove(&id) {
        s.task.abort();
    }
    Ok(())
}
