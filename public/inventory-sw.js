// INV-STAFF-APP-1 — minimal service worker for the inventory staff PWA. Caches the app shell so it opens
// offline; data is always network-first (never serve stale stock from cache). Scope: /inventory/.
const SHELL = 'aria-inv-shell-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/inventory'])).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Data/API calls → network only (fresh stock/value), fall back to a JSON offline marker.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req).catch(() => new Response(JSON.stringify({ offline: true }), { headers: { 'Content-Type': 'application/json' }, status: 503 })));
    return;
  }
  // App shell / assets → network-first, cache fallback (offline shell).
  event.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok && (url.pathname.startsWith('/inventory') || url.pathname.startsWith('/icons'))) {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req).then((m) => m || caches.match('/inventory')))
  );
});
