// RIBA runtime detection helper.
// Returns:
//   - isTauri: true when running inside the Tauri desktop shell.
//   - backendUrl: best URL to talk to the FastAPI backend, prioritising
//     a local sidecar when bundled with the desktop app.
//
// Usage:
//   import { BACKEND_URL, isTauri } from '@/lib/runtime';

export const isTauri =
  typeof window !== 'undefined' && (
    // Tauri v1
    window.__TAURI__ !== undefined ||
    // Tauri v2
    window.__TAURI_INTERNALS__ !== undefined ||
    // Custom protocols used by Tauri webview
    /^tauri:|^https?:\/\/tauri\.localhost/.test(window.location.protocol + '//' + window.location.host)
  );

const fromEnv = process.env.REACT_APP_BACKEND_URL;
const tauriLocal = 'http://127.0.0.1:8001';

export const BACKEND_URL = isTauri ? tauriLocal : fromEnv;
export const API = `${BACKEND_URL}/api`;
