//! WRITE operations (roadmap T8): get YAML, apply YAML, delete.
//!
//! Safety:
//! - Every mutating command calls `catalog::ensure_writable` first (read-only by default).
//! - Apply uses server-side apply with field manager "k8sfocus"; `dry_run=true` lets the UI
//!   show a diff before anything is persisted.
//! - Delete takes exactly one object by kind/namespace/name (no label selectors, no collections).

use kube::{
    Api, Client,
    api::{DeleteParams, DynamicObject, GroupVersionKind, Patch, PatchParams},
    discovery::{Scope, pinned_kind},
};
use serde::Deserialize;
use tauri::AppHandle;

use crate::catalog::ensure_writable;
use crate::kube::{KubeState, client_for};

const FIELD_MANAGER: &str = "k8sfocus";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjRef {
    api_version: String,
    kind: String,
    namespace: Option<String>,
    name: String,
}

fn split_api_version(av: &str) -> (&str, &str) {
    match av.split_once('/') {
        Some((g, v)) => (g, v),
        None => ("", av),
    }
}

async fn api_for(
    client: Client,
    api_version: &str,
    kind: &str,
    namespace: Option<&str>,
) -> Result<(Api<DynamicObject>, bool), String> {
    let (g, v) = split_api_version(api_version);
    let gvk = GroupVersionKind::gvk(g, v, kind);
    let (ar, caps) = pinned_kind(&client, &gvk)
        .await
        .map_err(|e| format!("Unknown resource {api_version}/{kind}: {e}"))?;
    let namespaced = caps.scope == Scope::Namespaced;
    let api = match (namespaced, namespace) {
        (true, Some(ns)) if !ns.is_empty() => Api::namespaced_with(client, ns, &ar),
        (true, _) => return Err(format!("{kind} is namespaced but no namespace was given")),
        (false, _) => Api::all_with(client, &ar),
    };
    Ok((api, namespaced))
}

fn clean_for_edit(mut v: serde_json::Value) -> serde_json::Value {
    if let Some(m) = v.get_mut("metadata").and_then(|m| m.as_object_mut()) {
        m.remove("managedFields");
    }
    v
}

fn to_yaml(v: &serde_json::Value) -> Result<String, String> {
    serde_yaml::to_string(v).map_err(|e| e.to_string())
}

/// Read-only: current object as YAML (managedFields stripped).
#[tauri::command]
pub async fn get_yaml(
    kube: tauri::State<'_, KubeState>,
    context: String,
    obj: ObjRef,
) -> Result<String, String> {
    let client = client_for(&kube, &context).await?;
    let (api, _) = api_for(
        client,
        &obj.api_version,
        &obj.kind,
        obj.namespace.as_deref(),
    )
    .await?;
    let o = api.get(&obj.name).await.map_err(|e| e.to_string())?;
    to_yaml(&clean_for_edit(
        serde_json::to_value(o).map_err(|e| e.to_string())?,
    ))
}

/// Server-side apply one or more YAML documents. With `dry_run` nothing is persisted and the
/// would-be result is returned (one YAML doc per input, separated by `---`).
#[tauri::command]
pub async fn apply_yaml(
    app: AppHandle,
    kube: tauri::State<'_, KubeState>,
    context: String,
    yaml: String,
    default_namespace: Option<String>,
    dry_run: bool,
    force: bool,
) -> Result<String, String> {
    if !dry_run {
        ensure_writable(&app, &context)?;
    }
    let client = client_for(&kube, &context).await?;

    let mut docs = Vec::new();
    for d in serde_yaml::Deserializer::from_str(&yaml) {
        let v = serde_json::Value::deserialize(d).map_err(|e| format!("Invalid YAML: {e}"))?;
        if !v.is_null() {
            docs.push(v);
        }
    }
    if docs.is_empty() {
        return Err("No YAML documents found".into());
    }

    let mut out = Vec::new();
    for mut doc in docs {
        let api_version = doc["apiVersion"]
            .as_str()
            .ok_or("Missing apiVersion")?
            .to_string();
        let kind = doc["kind"].as_str().ok_or("Missing kind")?.to_string();
        let name = doc["metadata"]["name"]
            .as_str()
            .ok_or("Missing metadata.name (generateName is not supported)")?
            .to_string();
        let ns = doc["metadata"]["namespace"]
            .as_str()
            .map(str::to_string)
            .or_else(|| default_namespace.clone())
            .unwrap_or_else(|| "default".into());

        if let Some(m) = doc.get_mut("metadata").and_then(|m| m.as_object_mut()) {
            m.remove("managedFields");
        }
        let (api, namespaced) = api_for(client.clone(), &api_version, &kind, Some(&ns)).await?;
        if namespaced {
            doc["metadata"]["namespace"] = serde_json::Value::String(ns);
        }

        let mut pp = PatchParams::apply(FIELD_MANAGER);
        pp.dry_run = dry_run;
        pp.force = force;
        let res = api
            .patch(&name, &pp, &Patch::Apply(&doc))
            .await
            .map_err(|e| format!("{kind}/{name}: {e}"))?;
        out.push(to_yaml(&clean_for_edit(
            serde_json::to_value(res).map_err(|e| e.to_string())?,
        ))?);
    }
    Ok(out.join("---\n"))
}

/// Delete exactly one object. `dry_run` validates without deleting.
#[tauri::command]
pub async fn delete_resource(
    app: AppHandle,
    kube: tauri::State<'_, KubeState>,
    context: String,
    obj: ObjRef,
    dry_run: bool,
) -> Result<(), String> {
    ensure_writable(&app, &context)?;
    if obj.name.is_empty() {
        return Err("Refusing to delete: empty name".into());
    }
    let client = client_for(&kube, &context).await?;
    let (api, _) = api_for(
        client,
        &obj.api_version,
        &obj.kind,
        obj.namespace.as_deref(),
    )
    .await?;
    let dp = DeleteParams {
        dry_run,
        ..Default::default()
    };
    api.delete(&obj.name, &dp)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
