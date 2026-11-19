//! Port forwarding (roadmap T21), like `kubectl port-forward`.
//! Listens on 127.0.0.1 only. Not gated by read-only: it opens a local tunnel and does not
//! modify cluster state (same as Lens).

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use k8s_openapi::api::core::v1::{Pod, Service};
use kube::{Api, Client, api::ListParams};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::net::TcpListener;
use tokio::sync::Mutex;

use crate::kube::{KubeState, client_for};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ForwardInfo {
    id: u64,
    context: String,
    namespace: String,
    kind: String,
    name: String,
    /// Pod actually used (for services: the selected backend pod).
    pod: String,
    /// Port the user asked for (service port for services, container port for pods).
    requested_port: u16,
    remote_port: u16,
    local_port: u16,
    connections: u64,
    last_error: Option<String>,
}

struct Forward {
    info: Arc<Mutex<ForwardInfo>>,
    task: tauri::async_runtime::JoinHandle<()>,
}

#[derive(Default)]
pub struct ForwardState {
    next_id: AtomicU64,
    forwards: Mutex<HashMap<u64, Forward>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForwardRequest {
    namespace: String,
    /// "pod" | "service"
    kind: String,
    name: String,
    port: u16,
    local_port: Option<u16>,
}

const CHANGED: &str = "port-forwards-changed";

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

#[tauri::command]
pub async fn port_forward_start(
    app: AppHandle,
    kube: tauri::State<'_, KubeState>,
    state: tauri::State<'_, ForwardState>,
    context: String,
    req: ForwardRequest,
) -> Result<ForwardInfo, String> {
    let client = client_for(&kube, &context).await?;
    let (pod, remote) = if req.kind == "service" {
        resolve_service(client.clone(), &req.namespace, &req.name, req.port).await?
    } else {
        (req.name.clone(), req.port)
    };

    // Requested local port, else same as remote, else any free port.
    let listener = match req.local_port {
        Some(p) => TcpListener::bind(("127.0.0.1", p))
            .await
            .map_err(|e| format!("localhost:{p}: {e}"))?,
        None => match TcpListener::bind(("127.0.0.1", req.port)).await {
            Ok(l) => l,
            Err(_) => TcpListener::bind(("127.0.0.1", 0))
                .await
                .map_err(|e| e.to_string())?,
        },
    };
    let local_port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    let info = Arc::new(Mutex::new(ForwardInfo {
        id,
        context: context.clone(),
        namespace: req.namespace.clone(),
        kind: req.kind.clone(),
        name: req.name.clone(),
        pod: pod.clone(),
        requested_port: req.port,
        remote_port: remote,
        local_port,
        connections: 0,
        last_error: None,
    }));

    let api: Api<Pod> = Api::namespaced(client, &req.namespace);
    let task_info = info.clone();
    let task_app = app.clone();
    let task = tauri::async_runtime::spawn(async move {
        loop {
            let Ok((mut sock, _)) = listener.accept().await else {
                break;
            };
            let api = api.clone();
            let pod = pod.clone();
            let info = task_info.clone();
            let app = task_app.clone();
            info.lock().await.connections += 1;
            let _ = app.emit(CHANGED, ());
            tauri::async_runtime::spawn(async move {
                let res: Result<(), String> = async {
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
                if let Err(e) = res {
                    info.lock().await.last_error = Some(e);
                    let _ = app.emit(CHANGED, ());
                }
            });
        }
    });

    let snapshot = info.lock().await.clone();
    state
        .forwards
        .lock()
        .await
        .insert(id, Forward { info, task });
    let _ = app.emit(CHANGED, ());
    Ok(snapshot)
}

#[tauri::command]
pub async fn port_forward_list(
    state: tauri::State<'_, ForwardState>,
) -> Result<Vec<ForwardInfo>, String> {
    let fwds = state.forwards.lock().await;
    let mut out = Vec::with_capacity(fwds.len());
    for f in fwds.values() {
        out.push(f.info.lock().await.clone());
    }
    out.sort_by_key(|f| f.id);
    Ok(out)
}

#[tauri::command]
pub async fn port_forward_stop(
    app: AppHandle,
    state: tauri::State<'_, ForwardState>,
    id: u64,
) -> Result<(), String> {
    if let Some(f) = state.forwards.lock().await.remove(&id) {
        f.task.abort(); // drops the listener; in-flight connections end when their streams close
    }
    let _ = app.emit(CHANGED, ());
    Ok(())
}
