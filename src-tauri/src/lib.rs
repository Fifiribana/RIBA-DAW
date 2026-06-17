// RIBA library crate — used by both the `riba` binary (desktop) and any
// future mobile (Tauri iOS/Android) targets. Centralising the setup here
// avoids duplicating Builder configuration.

use tauri::Manager;

#[tauri::command]
fn riba_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![riba_version])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }

            // ---------- Optional FastAPI sidecar ----------
            // Uncomment when a PyInstaller binary is placed under `binaries/`.
            //
            // use tauri_plugin_shell::ShellExt;
            // use tauri_plugin_shell::process::CommandEvent;
            //
            // let sidecar = app.shell().sidecar("riba-api")
            //     .expect("failed to resolve riba-api sidecar");
            // let (mut rx, _child) = sidecar.spawn()
            //     .expect("failed to spawn riba-api sidecar");
            // tauri::async_runtime::spawn(async move {
            //     while let Some(ev) = rx.recv().await {
            //         if let CommandEvent::Stdout(line) = ev {
            //             println!("[riba-api] {}", String::from_utf8_lossy(&line));
            //         }
            //     }
            // });
            // ---------------------------------------------

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running RIBA");
}
