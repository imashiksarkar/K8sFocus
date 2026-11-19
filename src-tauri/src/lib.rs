mod catalog;
mod kube;
mod shell_env;

#[tauri::command]
fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Pick rustls' crypto backend explicitly; otherwise the first TLS connection
    // panics when the dependency graph enables more than one provider.
    let _ = rustls::crypto::ring::default_provider().install_default();
    shell_env::fix_path();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(kube::KubeState::default())
        .invoke_handler(tauri::generate_handler![
            app_version,
            kube::list_contexts,
            kube::connect,
            kube::list_namespaces,
            kube::list_pods,
            catalog::load_catalog,
            catalog::save_catalog,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
