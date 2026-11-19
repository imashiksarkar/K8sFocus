mod catalog;
mod exec;
mod helm;
mod kube;
mod logs;
mod menu;
mod mutate;
mod nodes;
mod portforward;
mod prefs;
mod shell_env;
mod terminal;
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
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .menu(menu::build)
        .on_menu_event(|app, e| menu::on_event(app, e.id().as_ref()))
        .manage(kube::KubeState::default())
        .manage(watch::WatchState::default())
        .manage(exec::ExecState::default())
        .manage(terminal::TerminalState::default())
        .manage(portforward::ForwardState::default())
        .setup(|app| {
            prefs::init(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            prefs::load_prefs,
            prefs::save_prefs,
            prefs::kubeconfig_warnings,
            app_version,
            kube::list_contexts,
            kube::connect,
            catalog::load_catalog,
            catalog::save_catalog,
            watch::watch_resource,
            watch::stop_watch,
            watch::list_resource,
            logs::stream_logs,
            logs::save_text_file,
            exec::exec_start,
            exec::exec_write,
            exec::exec_resize,
            exec::exec_close,
            terminal::terminal_start,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close,
            portforward::port_forward_start,
            portforward::port_forward_list,
            portforward::port_forward_stop,
            helm::helm_list,
            helm::helm_get,
            helm::helm_history,
            helm::helm_rollback,
            helm::helm_uninstall,
            helm::helm_version,
            helm::helm_local_version,
            helm::helm_repo_list,
            helm::helm_repo_add,
            helm::helm_repo_remove,
            helm::helm_repo_update,
            helm::helm_search,
            helm::helm_show,
            helm::helm_install,
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
