mod catalog;
mod kube;
mod logs;
mod mutate;
mod nodes;
mod shell_env;
mod watch;

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
        .plugin(tauri_plugin_dialog::init())
        .manage(kube::KubeState::default())
        .manage(watch::WatchState::default())
        .invoke_handler(tauri::generate_handler![
            app_version,
            kube::list_contexts,
            kube::connect,
            catalog::load_catalog,
            catalog::save_catalog,
            watch::watch_resource,
            watch::stop_watch,
            logs::stream_logs,
            logs::save_text_file,
            mutate::get_yaml,
            mutate::apply_yaml,
            mutate::delete_resource,
            mutate::scale_resource,
            mutate::restart_workload,
            mutate::rollback_deployment,
            mutate::trigger_cronjob,
            mutate::set_cronjob_suspend,
            nodes::cordon_node,
            nodes::drain_plan,
            nodes::drain_node,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
