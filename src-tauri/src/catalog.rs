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
