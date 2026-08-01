use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // TEMPORARY: always open devtools, including in the release
            // build, so we can see console/network output on a machine
            // where the school picker hangs. Revert to the
            // #[cfg(debug_assertions)] guard once that's diagnosed —
            // shipping devtools open-by-default to end users is not
            // something we want long-term.
            let window = app.get_webview_window("main").unwrap();
            window.open_devtools();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
