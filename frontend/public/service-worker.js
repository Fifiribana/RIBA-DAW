/* RIBA DAW - Service Worker
 * Strategy:
 *  - App shell (HTML/JS/CSS/icons): network-first with offline cache fallback.
 *  - Static assets (fonts, icons): cache-first.
 *  - API requests (/api/**): network-only (real-time data, never cached).
 */

const CACHE_VERSION = 'riba-v1.3.0';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache API or websocket traffic
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/ws')) {
    return;
  }

  // Bypass analytics / 3rd party scripts
  if (url.origin !== self.location.origin && !url.hostname.includes('fonts.g')) {
    return;
  }

  // Static assets: cache-first
  if (/\.(?:png|jpg|jpeg|svg|gif|ico|woff2?|ttf|css|js)$/i.test(url.pathname) ||
      url.hostname.includes('fonts.g')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.status === 200 && res.type !== 'opaque') {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, clone));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // App shell (navigation): network-first, fall back to cache
  event.respondWith(
    fetch(req)
      .then((res) => {
        const clone = res.clone();
        caches.open(SHELL_CACHE).then((c) => c.put(req, clone));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html')))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
