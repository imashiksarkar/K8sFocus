//! GUI apps on macOS/Linux launched from Finder/Dock don't inherit the user's shell PATH,
//! so kubeconfig exec plugins (aws, gke-gcloud-auth-plugin, kubelogin, ...) aren't found.
//! At startup we ask the user's login shell for its PATH and adopt it.

#[cfg(unix)]
pub fn fix_path() {
    use std::process::Command;
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let out = Command::new(shell)
        .args(["-ilc", "printf '__PATH__%s__PATH__' \"$PATH\""])
        .output();
    if let Ok(out) = out {
        let s = String::from_utf8_lossy(&out.stdout);
        if let Some(path) = s.split("__PATH__").nth(1).filter(|p| !p.is_empty()) {
            // SAFETY: called once at startup before any other threads are spawned.
            unsafe { std::env::set_var("PATH", path) };
        }
    }
}

#[cfg(not(unix))]
pub fn fix_path() {}
