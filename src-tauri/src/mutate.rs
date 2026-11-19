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

/// Scale a Deployment/StatefulSet/ReplicaSet (merge-patch spec.replicas).
#[tauri::command]
pub async fn scale_resource(
    app: AppHandle,
    kube: tauri::State<'_, KubeState>,
    context: String,
    obj: ObjRef,
    replicas: i32,
) -> Result<(), String> {
    ensure_writable(&app, &context)?;
    if !(0..=1000).contains(&replicas) {
        return Err("Replicas must be between 0 and 1000".into());
    }
    let client = client_for(&kube, &context).await?;
    let (api, _) = api_for(
        client,
        &obj.api_version,
        &obj.kind,
        obj.namespace.as_deref(),
    )
    .await?;
    let patch = serde_json::json!({ "spec": { "replicas": replicas } });
    api.patch(&obj.name, &PatchParams::default(), &Patch::Merge(&patch))
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Rolling restart, same as `kubectl rollout restart` (bumps a pod-template annotation).
#[tauri::command]
pub async fn restart_workload(
    app: AppHandle,
    kube: tauri::State<'_, KubeState>,
    context: String,
    obj: ObjRef,
) -> Result<(), String> {
    ensure_writable(&app, &context)?;
    let client = client_for(&kube, &context).await?;
    let (api, _) = api_for(
        client,
        &obj.api_version,
        &obj.kind,
        obj.namespace.as_deref(),
    )
    .await?;
    let now = k8s_openapi::chrono::Utc::now().to_rfc3339();
    let patch = serde_json::json!({ "spec": { "template": { "metadata": { "annotations": {
        "kubectl.kubernetes.io/restartedAt": now
    }}}}});
    api.patch(&obj.name, &PatchParams::default(), &Patch::Merge(&patch))
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Roll a Deployment back to a previous ReplicaSet's pod template (like `kubectl rollout undo`).
/// The frontend passes the chosen ReplicaSet; we read its template server-side.
#[tauri::command]
pub async fn rollback_deployment(
    app: AppHandle,
    kube: tauri::State<'_, KubeState>,
    context: String,
    namespace: String,
    name: String,
    replica_set: String,
) -> Result<(), String> {
    ensure_writable(&app, &context)?;
    let client = client_for(&kube, &context).await?;
    let rs_api: Api<k8s_openapi::api::apps::v1::ReplicaSet> =
        Api::namespaced(client.clone(), &namespace);
    let rs = rs_api.get(&replica_set).await.map_err(|e| e.to_string())?;
    let owned = rs
        .metadata
        .owner_references
        .unwrap_or_default()
        .iter()
        .any(|o| o.kind == "Deployment" && o.name == name);
    if !owned {
        return Err(format!(
            "ReplicaSet {replica_set} does not belong to Deployment {name}"
        ));
    }
    let mut template =
        serde_json::to_value(rs.spec.and_then(|s| s.template)).map_err(|e| e.to_string())?;
    // the RS template carries the pod-template-hash label; the Deployment's must not
    if let Some(l) = template["metadata"]["labels"].as_object_mut() {
        l.remove("pod-template-hash");
    }
    let patch =
        serde_json::json!([{ "op": "replace", "path": "/spec/template", "value": template }]);
    let patch: json_patch::Patch = serde_json::from_value(patch).map_err(|e| e.to_string())?;
    let api: Api<k8s_openapi::api::apps::v1::Deployment> = Api::namespaced(client, &namespace);
    api.patch(&name, &PatchParams::default(), &Patch::Json::<()>(patch))
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Create a Job from a CronJob's template now (same as `kubectl create job --from=cronjob/<name>`).
/// Returns the new Job's name.
#[tauri::command]
pub async fn trigger_cronjob(
    app: AppHandle,
    kube: tauri::State<'_, KubeState>,
    context: String,
    namespace: String,
    name: String,
) -> Result<String, String> {
    use k8s_openapi::api::batch::v1::{CronJob, Job, JobSpec};
    use k8s_openapi::apimachinery::pkg::apis::meta::v1::{ObjectMeta, OwnerReference};
    use kube::api::PostParams;

    ensure_writable(&app, &context)?;
    let client = client_for(&kube, &context).await?;
    let cj = Api::<CronJob>::namespaced(client.clone(), &namespace)
        .get(&name)
        .await
        .map_err(|e| e.to_string())?;
    let tpl = cj
        .spec
        .as_ref()
        .map(|s| s.job_template.clone())
        .ok_or("CronJob has no spec")?;

    let suffix = format!("-manual-{}", k8s_openapi::chrono::Utc::now().timestamp());
    let mut base = name.clone();
    base.truncate(63 - suffix.len());
    let job_name = format!("{}{}", base.trim_end_matches('-'), suffix);

    let mut annotations = tpl
        .metadata
        .as_ref()
        .and_then(|m| m.annotations.clone())
        .unwrap_or_default();
    annotations.insert("cronjob.kubernetes.io/instantiate".into(), "manual".into());
    let job = Job {
        metadata: ObjectMeta {
            name: Some(job_name.clone()),
            namespace: Some(namespace.clone()),
            labels: tpl.metadata.as_ref().and_then(|m| m.labels.clone()),
            annotations: Some(annotations),
            owner_references: Some(vec![OwnerReference {
                api_version: "batch/v1".into(),
                kind: "CronJob".into(),
                name: name.clone(),
                uid: cj.metadata.uid.clone().unwrap_or_default(),
                controller: Some(true),
                block_owner_deletion: Some(true),
            }]),
            ..Default::default()
        },
        spec: Some(tpl.spec.unwrap_or_else(JobSpec::default)),
        status: None,
    };
    Api::<Job>::namespaced(client, &namespace)
        .create(&PostParams::default(), &job)
        .await
        .map_err(|e| e.to_string())?;
    Ok(job_name)
}

/// Suspend or resume a CronJob (merge-patch spec.suspend).
#[tauri::command]
pub async fn set_cronjob_suspend(
    app: AppHandle,
    kube: tauri::State<'_, KubeState>,
    context: String,
    namespace: String,
    name: String,
    suspend: bool,
) -> Result<(), String> {
    ensure_writable(&app, &context)?;
    let client = client_for(&kube, &context).await?;
    let api: Api<k8s_openapi::api::batch::v1::CronJob> = Api::namespaced(client, &namespace);
    let patch = serde_json::json!({ "spec": { "suspend": suspend } });
    api.patch(&name, &PatchParams::default(), &Patch::Merge(&patch))
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
