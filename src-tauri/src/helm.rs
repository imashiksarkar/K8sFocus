//! Helm releases (roadmap T25) via the user's `helm` CLI (same approach as Lens).
//! helm always runs with KUBECONFIG scoped to the selected context only.
//! Mutations (rollback/uninstall) are gated by `ensure_writable`.
//! Every name/namespace/revision is validated so it can't be interpreted as a flag.

use serde::Deserialize;
use tauri::AppHandle;
use tokio::process::Command;

use crate::catalog::ensure_writable;
use crate::terminal::scoped_kubeconfig;

fn valid_name(s: &str) -> Result<&str, String> {
    let ok = !s.is_empty()
        && s.len() <= 253
        && !s.starts_with('-')
        && s.chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '.');
    if ok {
        Ok(s)
    } else {
        Err(format!("invalid name: {s:?}"))
    }
}

async fn helm(app: &AppHandle, context: &str, args: &[&str]) -> Result<String, String> {
    let kc = scoped_kubeconfig(app, context)?;
    let out = Command::new("helm")
        .args(args)
        .env("KUBECONFIG", kc)
        .env("HELM_KUBECONTEXT", context)
        .output()
        .await
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "helm CLI not found. Install it (e.g. `brew install helm`) and restart K8sFocus."
                    .to_string()
            } else {
                e.to_string()
            }
        })?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

#[tauri::command]
pub async fn helm_list(
    app: AppHandle,
    context: String,
    namespace: Option<String>,
) -> Result<serde_json::Value, String> {
    let ns;
    let mut args = vec!["list", "-o", "json", "--max", "0", "--all"];
    match namespace.as_deref() {
        Some(n) if !n.is_empty() => {
            ns = valid_name(n)?.to_string();
            args.extend(["-n", &ns]);
        }
        _ => args.push("-A"),
    }
    let out = helm(&app, &context, &args).await?;
    serde_json::from_str(if out.trim().is_empty() { "[]" } else { &out }).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetReq {
    namespace: String,
    name: String,
    /// "values" | "allValues" | "manifest" | "notes" | "hooks"
    what: String,
    revision: Option<u32>,
}

#[tauri::command]
pub async fn helm_get(app: AppHandle, context: String, req: GetReq) -> Result<String, String> {
    let ns = valid_name(&req.namespace)?;
    let name = valid_name(&req.name)?;
    let rev = req.revision.map(|r| r.to_string());
    let mut args: Vec<&str> = match req.what.as_str() {
        "values" => vec!["get", "values", name, "-o", "yaml"],
        "allValues" => vec!["get", "values", name, "-o", "yaml", "--all"],
        "manifest" => vec!["get", "manifest", name],
        "notes" => vec!["get", "notes", name],
        "hooks" => vec!["get", "hooks", name],
        other => return Err(format!("unknown: {other}")),
    };
    args.extend(["-n", ns]);
    if let Some(r) = rev.as_deref() {
        args.extend(["--revision", r]);
    }
    helm(&app, &context, &args).await
}

#[tauri::command]
pub async fn helm_history(
    app: AppHandle,
    context: String,
    namespace: String,
    name: String,
) -> Result<serde_json::Value, String> {
    let out = helm(
        &app,
        &context,
        &[
            "history",
            valid_name(&name)?,
            "-n",
            valid_name(&namespace)?,
            "-o",
            "json",
            "--max",
            "50",
        ],
    )
    .await?;
    serde_json::from_str(&out).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn helm_rollback(
    app: AppHandle,
    context: String,
    namespace: String,
    name: String,
    revision: u32,
) -> Result<String, String> {
    ensure_writable(&app, &context)?;
    let rev = revision.to_string();
    helm(
        &app,
        &context,
        &[
            "rollback",
            valid_name(&name)?,
            &rev,
            "-n",
            valid_name(&namespace)?,
        ],
    )
    .await
}

#[tauri::command]
pub async fn helm_uninstall(
    app: AppHandle,
    context: String,
    namespace: String,
    name: String,
) -> Result<String, String> {
    ensure_writable(&app, &context)?;
    helm(
        &app,
        &context,
        &[
            "uninstall",
            valid_name(&name)?,
            "-n",
            valid_name(&namespace)?,
        ],
    )
    .await
}

#[tauri::command]
pub async fn helm_version(app: AppHandle, context: String) -> Result<String, String> {
    helm(&app, &context, &["version", "--short"])
        .await
        .map(|s| s.trim().to_string())
}
