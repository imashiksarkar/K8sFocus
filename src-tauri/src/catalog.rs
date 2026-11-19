//! Saved clusters for the hotbar, stored as JSON in the app config dir.
//! This is local app data only; it never touches the cluster.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SavedCluster {
    pub context: String,
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
    /// When true (the default), every write command refuses to run for this cluster.
    #[serde(default = "default_true")]
    pub read_only: bool,
}

fn default_true() -> bool {
    true
}

/// Write guard used by all mutating commands. Reads the persisted catalog (source of truth),
/// so a UI bug cannot bypass it. Unknown clusters are treated as read-only.
pub fn ensure_writable(app: &AppHandle, context: &str) -> Result<(), String> {
    let writable = load_catalog(app.clone())?
        .iter()
        .any(|c| c.context == context && !c.read_only);
    if writable {
        Ok(())
    } else {
        Err(format!(
            "Cluster \"{context}\" is read-only. Turn off read-only mode for this cluster to make changes."
        ))
    }
}

fn file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("clusters.json"))
}

#[tauri::command]
pub fn load_catalog(app: AppHandle) -> Result<Vec<SavedCluster>, String> {
    let path = file(&app)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let data = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_catalog(app: AppHandle, clusters: Vec<SavedCluster>) -> Result<(), String> {
    let data = serde_json::to_string_pretty(&clusters).map_err(|e| e.to_string())?;
    std::fs::write(file(&app)?, data).map_err(|e| e.to_string())
}
