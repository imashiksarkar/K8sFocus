//! App preferences (roadmap T28), persisted as JSON in the app config dir.
//! Kept in a process-wide RwLock so non-command code (kubeconfig loading, helm, shell) can read it.

use std::path::{Path, PathBuf};
use std::sync::{OnceLock, RwLock};

use kube::config::Kubeconfig;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Prefs {
    /// Extra kubeconfig files or folders (merged after $KUBECONFIG / ~/.kube/config).
    pub kubeconfig_paths: Vec<String>,
    /// Path to helm binary; empty = "helm" from PATH.
    pub helm_path: String,
    /// Shell for the local terminal; empty = $SHELL (or PowerShell on Windows).
    pub shell: String,
    pub terminal_font_size: u16,
    pub metrics_interval_secs: u32,
    pub helm_poll_secs: u32,
    /// "dark" | "light" | "system"
    pub theme: String,
    /// Check GitHub Releases for a new version on startup.
    pub auto_check_updates: bool,
}

impl Default for Prefs {
    fn default() -> Self {
        Self {
            kubeconfig_paths: vec![],
            helm_path: String::new(),
            shell: String::new(),
            terminal_font_size: 12,
            metrics_interval_secs: 15,
            helm_poll_secs: 10,
            theme: "dark".into(),
            auto_check_updates: true,
        }
    }
}

static PREFS: RwLock<Option<Prefs>> = RwLock::new(None);
static FILE: OnceLock<PathBuf> = OnceLock::new();

pub fn init(app: &AppHandle) {
    if let Ok(dir) = app.path().app_config_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let file = dir.join("prefs.json");
        let prefs = std::fs::read_to_string(&file)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        let _ = FILE.set(file);
        *PREFS.write().unwrap() = Some(prefs);
    }
}

pub fn get() -> Prefs {
    PREFS
        .read()
        .ok()
        .and_then(|p| p.clone())
        .unwrap_or_default()
}

#[tauri::command]
pub fn load_prefs() -> Prefs {
    get()
}

#[tauri::command]
pub fn save_prefs(prefs: Prefs) -> Result<(), String> {
    let file = FILE.get().ok_or("prefs not initialized")?;
    std::fs::write(
        file,
        serde_json::to_string_pretty(&prefs).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    *PREFS.write().map_err(|e| e.to_string())? = Some(prefs);
    Ok(())
}

fn expand(p: &str) -> PathBuf {
    if let (Some(rest), Some(home)) = (
        p.strip_prefix("~/"),
        std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")),
    ) {
        return Path::new(&home).join(rest);
    }
    PathBuf::from(p)
}

/// Default kubeconfig ($KUBECONFIG or ~/.kube/config) merged with the extra files/folders
/// from preferences. Unreadable extra files are skipped (reported via `kubeconfig_warnings`).
pub fn load_kubeconfig() -> Result<Kubeconfig, String> {
    let mut kc = Kubeconfig::read().unwrap_or_default();
    for (path, res) in extra_kubeconfigs() {
        if let Ok(extra) = res {
            kc = kc
                .merge(extra)
                .map_err(|e| format!("{}: {e}", path.display()))?;
        }
    }
    if kc.contexts.is_empty() {
        return Err("No kubeconfig contexts found. Check ~/.kube/config, $KUBECONFIG, or Preferences → Kubeconfig.".into());
    }
    Ok(kc)
}

fn extra_kubeconfigs() -> Vec<(PathBuf, Result<Kubeconfig, String>)> {
    let mut files = vec![];
    for p in get().kubeconfig_paths {
        let path = expand(p.trim());
        if path.is_dir() {
            if let Ok(rd) = std::fs::read_dir(&path) {
                let mut entries: Vec<_> = rd
                    .flatten()
                    .map(|e| e.path())
                    .filter(|f| f.is_file())
                    .collect();
                entries.sort();
                files.extend(entries.into_iter().filter(|f| {
                    let n = f.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    !n.starts_with('.')
                        && (n.ends_with(".yaml")
                            || n.ends_with(".yml")
                            || n == "config"
                            || !n.contains('.'))
                }));
            }
        } else if !p.trim().is_empty() {
            files.push(path);
        }
    }
    files
        .into_iter()
        .map(|f| {
            let r = Kubeconfig::read_from(&f).map_err(|e| e.to_string());
            (f, r)
        })
        .collect()
}

/// Problems with extra kubeconfig paths, shown in Preferences.
#[tauri::command]
pub fn kubeconfig_warnings() -> Vec<String> {
    let mut out = vec![];
    for p in get().kubeconfig_paths {
        if !p.trim().is_empty() && !expand(p.trim()).exists() {
            out.push(format!("{p}: not found"));
        }
    }
    for (path, r) in extra_kubeconfigs() {
        if let Err(e) = r {
            out.push(format!("{}: {e}", path.display()));
        }
    }
    out
}

pub fn helm_bin() -> String {
    let p = get().helm_path;
    if p.trim().is_empty() {
        "helm".into()
    } else {
        expand(p.trim()).to_string_lossy().into()
    }
}
