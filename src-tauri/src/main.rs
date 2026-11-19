// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// binary is intentionally named "K8sFocus" (shown in the Dock)
#![allow(non_snake_case)]

fn main() {
    k8sfocus_lib::run()
}
