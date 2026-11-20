//! Port forwarding (roadmap T21 + saved forwards), like `kubectl port-forward`.
//! Listens on 127.0.0.1 only. Not gated by read-only: it opens a local tunnel and does not
//! modify cluster state (same as Lens).
//!
//! Forwards are SAVED to `port-forwards.json` in the app config dir and restored on startup.
//! Each saved forward is active or paused; the local port is pinned after the first start so
//! bookmarks like http://localhost:8080 keep working across restarts.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use k8s_openapi::api::core::v1::{Pod, Service};
use kube::{Api, Client, api::ListParams};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::net::TcpListener;
use tokio::sync::Mutex;

use crate::kube::{KubeState, client_for};

const CHANGED: &str = "port-forwards-changed";

/// What gets persisted.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Saved {
    id: u64,
    context: String,
    namespace: String,
    /// "pod" | "service"
    kind: String,
    name: String,
    /// Port the user asked for (service port for services, container port for pods).
    port: u16,
    /// Pinned after the first successful start.
    local_port: Option<u16>,
    paused: bool,
}

/// Live state of a running forward.
#[derive(Default, Clone)]
struct Live {
    pod: String,
    remote_port: u16,
    connections: u64,
    last_error: Option<String>,
}

struct Running {
    live: Arc<Mutex<Live>>,
    task: tauri::async_runtime::JoinHandle<()>,
}

#[derive(Default)]
pub struct ForwardState {
    saved: Mutex<Vec<Saved>>,
    running: Mutex<HashMap<u64, Running>>,
    /// Start failures (port busy, cluster unreachable, …) for forwards that aren't running.
    failed: Mutex<HashMap<u64, String>>,
}

/// Sent to the UI.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ForwardInfo {
    id: u64,
    context: String,
    namespace: String,
    kind: String,
    name: String,
    requested_port: u16,
    local_port: Option<u16>,
    /// "active" | "paused" | "error"
    status: String,
    pod: String,
    remote_port: u16,
    connections: u64,
    last_error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForwardRequest {
    namespace: String,
    kind: String,
    name: String,
    port: u16,
    local_port: Option<u16>,
}

fn file(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("port-forwards.json"))
}

async fn persist(app: &AppHandle, state: &ForwardState) {
    let saved = state.saved.lock().await.clone();
    if let (Some(f), Ok(json)) = (file(app), serde_json::to_string_pretty(&saved)) {
        let _ = std::fs::write(f, json);
    }
}

/// For a Service: pick a Running+Ready pod from its selector and map the service port to the
/// container port (numeric or named targetPort).
async fn resolve_service(
    client: Client,
    ns: &str,
    name: &str,
    port: u16,
) -> Result<(String, u16), String> {
    let svc = Api::<Service>::namespaced(client.clone(), ns)
        .get(name)
        .await
        .map_err(|e| e.to_string())?;
    let spec = svc.spec.ok_or("service has no spec")?;
    let selector = spec.selector.unwrap_or_default();
    if selector.is_empty() {
        return Err("service has no selector (cannot pick a pod)".into());
    }
    let sp = spec
        .ports
        .unwrap_or_default()
        .into_iter()
        .find(|p| p.port == port as i32)
        .ok_or_else(|| format!("service has no port {port}"))?;
    let label_sel = selector
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join(",");
    let pods = Api::<Pod>::namespaced(client, ns)
        .list(&ListParams::default().labels(&label_sel))
        .await
        .map_err(|e| e.to_string())?;
    let ready = |p: &Pod| {
        p.status.as_ref().is_some_and(|s| {
            s.phase.as_deref() == Some("Running")
                && s.conditions
                    .as_ref()
                    .is_some_and(|c| c.iter().any(|c| c.type_ == "Ready" && c.status == "True"))
        })
    };
    let pod = pods
        .items
        .into_iter()
        .find(ready)
        .ok_or("no ready pod behind this service")?;
    use k8s_openapi::apimachinery::pkg::util::intstr::IntOrString;
    let target = match sp.target_port {
        None => port,
        Some(IntOrString::Int(n)) => n as u16,
        Some(IntOrString::String(named)) => pod
            .spec
            .as_ref()
            .and_then(|s| {
                s.containers
                    .iter()
                    .flat_map(|c| c.ports.clone().unwrap_or_default())
                    .find(|p| p.name.as_deref() == Some(&named))
            })
            .map(|p| p.container_port as u16)
            .ok_or_else(|| format!("named port {named} not found on pod"))?,
    };
    Ok((pod.metadata.name.unwrap_or_default(), target))
}

/// Pod + container port to use for one connection.
async fn target(client: Client, s: &Saved) -> Result<(String, u16), String> {
    if s.kind == "service" {
        resolve_service(client, &s.namespace, &s.name, s.port).await
    } else {
        Ok((s.name.clone(), s.port))
    }
}

/// Bind the local port and start accepting. Returns the bound port.
async fn launch(app: &AppHandle, state: &ForwardState, saved: &Saved) -> Result<u16, String> {
    let kube = app.state::<KubeState>();
    let client = client_for(&kube, &saved.context).await?;
    // validate the target once up front so obvious mistakes fail fast
    let (pod, remote) = target(client.clone(), saved).await?;

    let listener = match saved.local_port {
        Some(p) => TcpListener::bind(("127.0.0.1", p))
            .await
            .map_err(|e| format!("localhost:{p}: {e}"))?,
        None => match TcpListener::bind(("127.0.0.1", saved.port)).await {
            Ok(l) => l,
            Err(_) => TcpListener::bind(("127.0.0.1", 0))
                .await
                .map_err(|e| e.to_string())?,
        },
    };
    let local_port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let live = Arc::new(Mutex::new(Live {
        pod,
        remote_port: remote,
        ..Default::default()
    }));
    let task_live = live.clone();
    let task_app = app.clone();
    let spec = saved.clone();
    let task = tauri::async_runtime::spawn(async move {
        loop {
            let Ok((mut sock, _)) = listener.accept().await else {
                break;
            };
            let client = client.clone();
            let spec = spec.clone();
            let live = task_live.clone();
            let app = task_app.clone();
            live.lock().await.connections += 1;
            let _ = app.emit(CHANGED, ());
            tauri::async_runtime::spawn(async move {
                let res: Result<(), String> = async {
                    // services re-resolve per connection, so rollouts don't break the forward
                    let (pod, remote) = target(client.clone(), &spec).await?;
                    {
                        let mut l = live.lock().await;
                        l.pod = pod.clone();
                        l.remote_port = remote;
                    }
                    let api: Api<Pod> = Api::namespaced(client, &spec.namespace);
                    let mut pf = api
                        .portforward(&pod, &[remote])
                        .await
                        .map_err(|e| e.to_string())?;
                    let mut upstream = pf.take_stream(remote).ok_or("no stream")?;
                    tokio::io::copy_bidirectional(&mut sock, &mut upstream)
                        .await
                        .map_err(|e| e.to_string())?;
                    drop(upstream);
                    let _ = pf.join().await;
                    Ok(())
                }
                .await;
                let mut l = live.lock().await;
                l.last_error = res.err();
                drop(l);
                let _ = app.emit(CHANGED, ());
            });
        }
    });

    state
        .running
        .lock()
        .await
        .insert(saved.id, Running { live, task });
    state.failed.lock().await.remove(&saved.id);
    Ok(local_port)
}

/// Start (or retry) a saved forward and record the result.
async fn start_saved(app: &AppHandle, state: &ForwardState, id: u64) -> Result<(), String> {
    let Some(saved) = state
        .saved
        .lock()
        .await
        .iter()
        .find(|s| s.id == id)
        .cloned()
    else {
        return Err("port forward not found".into());
    };
    if let Some(r) = state.running.lock().await.remove(&id) {
        r.task.abort();
    }
    let res = launch(app, state, &saved).await;
    match &res {
        Ok(port) => {
            if let Some(s) = state.saved.lock().await.iter_mut().find(|s| s.id == id) {
                s.local_port = Some(*port);
                s.paused = false;
            }
        }
        Err(e) => {
            state.failed.lock().await.insert(id, e.clone());
        }
    }
    persist(app, state).await;
    let _ = app.emit(CHANGED, ());
    res.map(|_| ())
}

/// Restore saved forwards on app start (non-paused ones are started; failures are kept as errors).
pub fn restore(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let saved: Vec<Saved> = file(&app)
            .and_then(|f| std::fs::read_to_string(f).ok())
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        let state = app.state::<ForwardState>();
        *state.saved.lock().await = saved.clone();
        let _ = app.emit(CHANGED, ());
        for s in saved.iter().filter(|s| !s.paused) {
            let _ = start_saved(&app, &state, s.id).await;
        }
    });
}

async fn info(state: &ForwardState, s: &Saved) -> ForwardInfo {
    let running = state.running.lock().await;
    let failed = state.failed.lock().await;
    let live = match running.get(&s.id) {
        Some(r) => Some(r.live.lock().await.clone()),
        None => None,
    };
    let status = if s.paused {
        "paused"
    } else if live.is_some() {
        "active"
    } else {
        "error"
    };
    let l = live.unwrap_or_default();
    ForwardInfo {
        id: s.id,
        context: s.context.clone(),
        namespace: s.namespace.clone(),
        kind: s.kind.clone(),
        name: s.name.clone(),
        requested_port: s.port,
        local_port: s.local_port,
        status: status.into(),
        pod: l.pod,
        remote_port: l.remote_port,
        connections: l.connections,
        last_error: failed.get(&s.id).cloned().or(l.last_error),
    }
}

#[tauri::command]
pub async fn port_forward_start(
    app: AppHandle,
    state: tauri::State<'_, ForwardState>,
    context: String,
    req: ForwardRequest,
) -> Result<ForwardInfo, String> {
    // Same target already saved? Resume/return it instead of creating a duplicate.
    let existing = state
        .saved
        .lock()
        .await
        .iter()
        .find(|s| {
            s.context == context
                && s.namespace == req.namespace
                && s.kind == req.kind
                && s.name == req.name
                && s.port == req.port
        })
        .cloned();
    let is_new = existing.is_none();
    let id = match existing {
        Some(s) => {
            if let Some(lp) = req.local_port
                && let Some(x) = state.saved.lock().await.iter_mut().find(|x| x.id == s.id)
            {
                x.local_port = Some(lp);
            }
            s.id
        }
        None => {
            let mut saved = state.saved.lock().await;
            let id = saved.iter().map(|s| s.id).max().map_or(1, |m| m + 1);
            saved.push(Saved {
                id,
                context,
                namespace: req.namespace,
                kind: req.kind,
                name: req.name,
                port: req.port,
                local_port: req.local_port,
                paused: false,
            });
            id
        }
    };
    let res = start_saved(&app, &state, id).await;
    if res.is_err() && is_new {
        // a brand-new forward that never worked isn't worth keeping
        state.saved.lock().await.retain(|s| s.id != id);
        state.failed.lock().await.remove(&id);
        persist(&app, &state).await;
        let _ = app.emit(CHANGED, ());
    }
    res?;
    let s = state
        .saved
        .lock()
        .await
        .iter()
        .find(|s| s.id == id)
        .cloned()
        .ok_or("lost")?;
    Ok(info(&state, &s).await)
}

#[tauri::command]
pub async fn port_forward_list(
    state: tauri::State<'_, ForwardState>,
) -> Result<Vec<ForwardInfo>, String> {
    let saved = state.saved.lock().await.clone();
    let mut out = Vec::with_capacity(saved.len());
    for s in &saved {
        out.push(info(&state, s).await);
    }
    Ok(out)
}

#[tauri::command]
pub async fn port_forward_pause(
    app: AppHandle,
    state: tauri::State<'_, ForwardState>,
    id: u64,
) -> Result<(), String> {
    if let Some(r) = state.running.lock().await.remove(&id) {
        r.task.abort(); // closes the listener; open connections end when their streams close
    }
    state.failed.lock().await.remove(&id);
    if let Some(s) = state.saved.lock().await.iter_mut().find(|s| s.id == id) {
        s.paused = true;
    }
    persist(&app, &state).await;
    let _ = app.emit(CHANGED, ());
    Ok(())
}

#[tauri::command]
pub async fn port_forward_resume(
    app: AppHandle,
    state: tauri::State<'_, ForwardState>,
    id: u64,
) -> Result<(), String> {
    start_saved(&app, &state, id).await
}

#[tauri::command]
pub async fn port_forward_remove(
    app: AppHandle,
    state: tauri::State<'_, ForwardState>,
    id: u64,
) -> Result<(), String> {
    if let Some(r) = state.running.lock().await.remove(&id) {
        r.task.abort();
    }
    state.failed.lock().await.remove(&id);
    state.saved.lock().await.retain(|s| s.id != id);
    persist(&app, &state).await;
    let _ = app.emit(CHANGED, ());
    Ok(())
}
