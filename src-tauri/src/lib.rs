// RIBA library crate — used by both the `riba` binary (desktop) and any
// future mobile (Tauri iOS/Android) targets. Centralising the setup here
// avoids duplicating Builder configuration.
use tauri::Manager;
use std::fs;
use std::path::Path;

#[tauri::command]
fn riba_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// 🌍 VRAI SCANNER DE PLUGINS VST POUR WINDOWS
#[tauri::command]
fn scan_vst_plugins() -> Vec<String> {
    let mut found_plugins = Vec::new();
    
    // Chemin standard des VST3 sur Windows
    let vst3_path = "C:\\Program Files\\Common Files\\VST3";
    
    if Path::new(vst3_path).exists() {
        if let Ok(entries) = fs::read_dir(vst3_path) {
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    // On cherche les fichiers ou dossiers qui se terminent par .vst3
                    if let Some(extension) = path.extension() {
                        if extension == "vst3" {
                            if let Some(file_name) = path.file_name() {
                                found_plugins.push(file_name.to_string_lossy().into_owned());
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Si aucun plugin n'est trouvé, on met un petit message d'info
    if found_plugins.is_empty() {
        found_plugins.push("Aucun plugin .vst3 trouvé dans le dossier standard.".to_string());
    }

    found_plugins
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        // Enregistrement des commandes pour le frontend
        .invoke_handler(tauri::generate_handler![riba_version, scan_vst_plugins])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running RIBA");
}
