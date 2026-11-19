//! Local terminal (roadmap T20): the user's own shell in a PTY, with KUBECONFIG pointing at a
//! minimal kubeconfig that contains ONLY the selected context (so `kubectl` in this tab can't
//! accidentally target another cluster). Runs on the user's machine, not in the cluster.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

use base64::{Engine, engine::general_purpose::STANDARD as B64};
use kube::config::Kubeconfig;
use portable_pty::{Child, CommandBuilder, MasterPty, PtySize, native_pty_system};
use tauri::{AppHandle, Manager, ipc::Channel};

use crate::exec::ExecEvent;

struct Term {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct TerminalState {
    next_id: AtomicU64,
    terms: Mutex<HashMap<u64, Term>>,
}

/// Write a kubeconfig containing only `context` (+ its cluster and user) to the app cache dir.
pub fn scoped_kubeconfig(app: &AppHandle, context: &str) -> Result<PathBuf, String> {
    let kc = Kubeconfig::read().map_err(|e| e.to_string())?;
    let ctx = kc
        .contexts
        .iter()
        .find(|c| c.name == context)
        .cloned()
        .ok_or_else(|| format!("context {context} not found in kubeconfig"))?;
    let inner = ctx.context.clone().unwrap_or_default();
    let scoped = Kubeconfig {
        current_context: Some(context.to_string()),
        clusters: kc
            .clusters
            .into_iter()
            .filter(|c| c.name == inner.cluster)
            .collect(),
        auth_infos: kc
            .auth_infos
            .into_iter()
            .filter(|u| Some(&u.name) == inner.user.as_ref())
            .collect(),
        contexts: vec![ctx],
        ..Default::default()
    };
    let yaml = serde_yaml::to_string(&scoped).map_err(|e| e.to_string())?;

    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("kubeconfigs");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let safe: String = context
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let path = dir.join(format!("{safe}.yaml"));
    std::fs::write(&path, yaml).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(path)
}

fn default_shell() -> (String, Vec<String>) {
    #[cfg(windows)]
    {
        ("powershell.exe".into(), vec!["-NoLogo".into()])
    }
    #[cfg(not(windows))]
    {
        let sh = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        (sh, vec!["-l".into()])
    }
}

#[tauri::command]
pub async fn terminal_start(
    app: AppHandle,
    state: tauri::State<'_, TerminalState>,
    context: Option<String>,
    cols: u16,
    rows: u16,
    on_event: Channel<ExecEvent>,
) -> Result<u64, String> {
    let pair = native_pty_system()
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let (shell, args) = default_shell();
    let mut cmd = CommandBuilder::new(shell);
    cmd.args(args);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "K8sFocus");
    if let Some(ctx) = &context {
        let kc = scoped_kubeconfig(&app, ctx)?;
        cmd.env("KUBECONFIG", kc);
    }
    if let Ok(home) = app.path().home_dir() {
        cmd.cwd(home);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    // PTY reads are blocking: use a plain thread.
    std::thread::spawn(move || {
        let mut buf = [0u8; 16 * 1024];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if on_event
                        .send(ExecEvent::Data {
                            b64: B64.encode(&buf[..n]),
                        })
                        .is_err()
                    {
                        break;
                    }
                }
            }
        }
        let _ = on_event.send(ExecEvent::Exit {
            message: "exited".into(),
        });
    });

    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    state.terms.lock().map_err(|e| e.to_string())?.insert(
        id,
        Term {
            writer,
            master: pair.master,
            child,
        },
    );
    Ok(id)
}

#[tauri::command]
pub fn terminal_write(
    state: tauri::State<'_, TerminalState>,
    id: u64,
    data: String,
) -> Result<(), String> {
    let mut terms = state.terms.lock().map_err(|e| e.to_string())?;
    let t = terms.get_mut(&id).ok_or("terminal closed")?;
    t.writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn terminal_resize(
    state: tauri::State<'_, TerminalState>,
    id: u64,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    if let Some(t) = state.terms.lock().map_err(|e| e.to_string())?.get(&id) {
        let _ = t.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        });
    }
    Ok(())
}

#[tauri::command]
pub fn terminal_close(state: tauri::State<'_, TerminalState>, id: u64) -> Result<(), String> {
    if let Some(mut t) = state.terms.lock().map_err(|e| e.to_string())?.remove(&id) {
        let _ = t.child.kill();
    }
    Ok(())
}
