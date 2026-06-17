// RIBA — Tauri v2 desktop shell entry point.
// Loads the React PWA (built into ../frontend/build) inside a native webview.
//
// Optional FastAPI sidecar:
//   1. Bundle the backend with PyInstaller:
//        cd /app/backend && pyinstaller --onefile --name riba-api server.py
//   2. Drop the binary into `src-tauri/binaries/` with the Rust target triple
//      suffix (e.g. `riba-api-x86_64-pc-windows-msvc.exe`).
//   3. Uncomment the `externalBin` field in `tauri.conf.json` AND the
//      sidecar block below.
//   4. Update REACT_APP_BACKEND_URL detection to fall back to http://127.0.0.1:8001
//      when running inside Tauri (see ../frontend/src/lib/runtime.js).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    riba_lib::run();
}
