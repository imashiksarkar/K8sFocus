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

// ---------------------------------------------------------------- charts (T26)

/// Chart refs: "repo/chart", "oci://host/path", local paths are rejected.
fn valid_chart(s: &str) -> Result<&str, String> {
    let ok = !s.is_empty()
        && s.len() <= 512
        && !s.starts_with('-')
        && (s.starts_with("oci://")
            || (s.contains('/') && !s.starts_with('/') && !s.starts_with('.')))
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || "._/:@-".contains(c));
    if ok {
        Ok(s)
    } else {
        Err(format!(
            "invalid chart reference: {s:?} (use repo/chart or oci://…)"
        ))
    }
}

fn valid_version(s: &str) -> Result<&str, String> {
    let ok = !s.is_empty()
        && !s.starts_with('-')
        && s.len() <= 128
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || ".+-~^<>=*x ,".contains(c));
    if ok {
        Ok(s)
    } else {
        Err(format!("invalid version: {s:?}"))
    }
}

fn valid_repo_name(s: &str) -> Result<&str, String> {
    let ok = !s.is_empty()
        && !s.starts_with('-')
        && s.len() <= 100
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || "._-".contains(c));
    if ok {
        Ok(s)
    } else {
        Err(format!("invalid repo name: {s:?}"))
    }
}

/// Repo commands only touch the local helm config, never the cluster.
async fn helm_local(args: &[&str]) -> Result<String, String> {
    let out = Command::new("helm")
        .args(args)
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

fn json_or_empty(out: Result<String, String>) -> Result<serde_json::Value, String> {
    match out {
        Ok(s) if s.trim().is_empty() => Ok(serde_json::json!([])),
        Ok(s) => serde_json::from_str(&s).map_err(|e| e.to_string()),
        Err(e) if e.contains("no repositories") => Ok(serde_json::json!([])),
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn helm_repo_list() -> Result<serde_json::Value, String> {
    json_or_empty(helm_local(&["repo", "list", "-o", "json"]).await)
}

#[tauri::command]
pub async fn helm_repo_add(name: String, url: String) -> Result<String, String> {
    if !(url.starts_with("https://") || url.starts_with("http://"))
        || url.contains(char::is_whitespace)
    {
        return Err("repo URL must start with https:// or http://".into());
    }
    helm_local(&[
        "repo",
        "add",
        valid_repo_name(&name)?,
        &url,
        "--force-update",
    ])
    .await
}

#[tauri::command]
pub async fn helm_repo_remove(name: String) -> Result<String, String> {
    helm_local(&["repo", "remove", valid_repo_name(&name)?]).await
}

#[tauri::command]
pub async fn helm_repo_update() -> Result<String, String> {
    helm_local(&["repo", "update"]).await
}

#[tauri::command]
pub async fn helm_search(query: String, versions: bool) -> Result<serde_json::Value, String> {
    let q = query.trim();
    if q.starts_with('-') {
        return Err("invalid query".into());
    }
    let mut args = vec!["search", "repo"];
    if !q.is_empty() {
        args.push(q);
    }
    if versions {
        args.push("--versions");
    }
    args.extend(["-o", "json"]);
    json_or_empty(helm_local(&args).await)
}

/// `helm show values|readme|chart <chart> [--version v]`
#[tauri::command]
pub async fn helm_show(
    chart: String,
    version: Option<String>,
    what: String,
) -> Result<String, String> {
    let what = match what.as_str() {
        "values" | "readme" | "chart" => what,
        _ => return Err("unknown".into()),
    };
    let mut args = vec!["show", what.as_str(), valid_chart(&chart)?];
    if let Some(v) = version.as_deref().filter(|v| !v.is_empty()) {
        args.extend(["--version", valid_version(v)?]);
    }
    helm_local(&args).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallReq {
    name: String,
    namespace: String,
    chart: String,
    version: Option<String>,
    values: String,
    create_namespace: bool,
    dry_run: bool,
}

/// `helm upgrade --install` (covers both install and upgrade). With `dry_run`, the server
/// validates and the rendered manifest is returned; nothing is changed.
#[tauri::command]
pub async fn helm_install(
    app: AppHandle,
    context: String,
    req: InstallReq,
) -> Result<String, String> {
    if !req.dry_run {
        ensure_writable(&app, &context)?;
    }
    use tauri::Manager;
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("helm-values");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join(format!(
        "{}-{}.yaml",
        valid_name(&req.namespace)?,
        valid_name(&req.name)?
    ));
    std::fs::write(&file, &req.values).map_err(|e| e.to_string())?;
    let file_s = file.to_string_lossy().to_string();

    let mut args = vec![
        "upgrade",
        "--install",
        valid_name(&req.name)?,
        valid_chart(&req.chart)?,
        "-n",
        valid_name(&req.namespace)?,
        "-f",
        &file_s,
    ];
    if let Some(v) = req.version.as_deref().filter(|v| !v.is_empty()) {
        args.extend(["--version", valid_version(v)?]);
    }
    if req.create_namespace {
        args.push("--create-namespace");
    }
    if req.dry_run {
        args.push("--dry-run=server");
    }
    let res = helm(&app, &context, &args).await;
    let _ = std::fs::remove_file(&file);
    res
}
