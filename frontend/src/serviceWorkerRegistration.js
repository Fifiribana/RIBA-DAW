// Service worker registration for RIBA DAW PWA
// Registers /service-worker.js in production. In development, unregisters any
// existing SW so hot reload stays clean.

export function register() {
  if (!('serviceWorker' in navigator)) return;

  const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  const isDev = process.env.NODE_ENV !== 'production';
  // Inside a Tauri desktop shell the custom protocol (tauri://) is incompatible
  // with the service worker — skip registration entirely.
  const isTauri =
    typeof window !== 'undefined' && (
      window.__TAURI__ !== undefined ||
      window.__TAURI_INTERNALS__ !== undefined
    );

  // In dev mode or Tauri, unregister to avoid stale caches / protocol mismatch.
  if (isDev || isLocalhost || isTauri) {
    unregister();
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js', { scope: '/' })
      .then((reg) => {
        // Listen for updates
        reg.onupdatefound = () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.onstatechange = () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available - notify UI via custom event
              window.dispatchEvent(new CustomEvent('riba-sw-update', { detail: reg }));
            }
          };
        };
      })
      .catch(() => {});
  });
}

export function unregister() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  }).catch(() => {});
}
