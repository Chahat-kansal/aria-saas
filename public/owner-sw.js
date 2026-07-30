// Aria Owner App — push notification service worker (OWNER-APP PH-4).
// Mirrors public/community-sw.js's proven structure (that one serves CUSTOMER pushes on
// /community/). Kept as a SEPARATE worker with a tight /owner/ scope rather than extending the
// community one, because the two have different scopes, different audiences, and different
// deep-link targets — a single worker would have to serve both scopes and could not be registered
// under /owner/ without widening the community worker's scope too.

self.addEventListener('install', () => {
  // Take over immediately so the first registration starts handling pushes.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: 'Aria', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Aria';
  const options = {
    body: payload.body || '',
    // Real asset paths, verified present (public/icons/) — the community worker's '/icon-192.png'
    // and '/icon-72.png' don't exist at those roots; the app's actual icons live under /icons/,
    // matching src/app/manifest.ts. A missing icon degrades to the browser default rather than
    // failing the notification, but pointing at real files means the buzz looks like Aria.
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // tag collapses same-subject notifications in the tray — belt-and-braces on top of the
    // DB-level unique(subject_type, subject_id, reason) dedupe that is the real attention-law
    // enforcer server-side.
    tag: payload.tag || 'aria-owner',
    renotify: false,
    data: { url: payload.url || '/owner' },
    vibrate: [60, 30, 60],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/owner';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((winList) => {
      // Focus an already-open owner-app tab and navigate it to the exact subject (decision sheet
      // or Jobs tab) rather than opening a duplicate window.
      for (const c of winList) {
        if ('focus' in c && c.url.includes('/owner/')) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

// ── OWNER-APP PH-5 Part A — OFFLINE READS ─────────────────────────────────────────────────────
// Stale-while-revalidate for the owner app's GET endpoints so Today/Decisions/Jobs render from the
// last sync instead of going blank on a dead network. The app marks the data "as of <last sync>"
// from the timestamp stored alongside each cached response.
//
// SCOPED DELIBERATELY: only owner-app GETs are cached. Nothing is cached for POST/PATCH/DELETE —
// a write must reach the server or be queued client-side (see src/lib/owner-app/offline-queue.ts),
// never silently "succeed" from a worker.
const OWNER_CACHE = 'aria-owner-v1';
const CACHEABLE_GET = [
  '/api/owner/today',
  '/api/owner/decisions',
  '/api/owner/jobs',
];

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                       // writes are never served from cache
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!CACHEABLE_GET.some(p => url.pathname.startsWith(p))) return;

  event.respondWith((async () => {
    const cache = await caches.open(OWNER_CACHE);
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) {
        // Stamp the sync time INTO the cached copy so the UI can say "as of ..." honestly rather
        // than guessing, and clone before caching (a Response body is single-use).
        const body = await fresh.clone().json().catch(() => null);
        if (body && typeof body === 'object') {
          const stamped = new Response(
            JSON.stringify({ ...body, _cached_at: new Date().toISOString() }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
          await cache.put(req, stamped.clone());
        }
      }
      return fresh;
    } catch {
      // Offline — serve the last good copy. It already carries _cached_at, so the UI can mark it
      // stale. If there is no cached copy the request genuinely fails: better an honest error than
      // a fabricated empty state that looks like "nothing needs you".
      const hit = await cache.match(req);
      if (hit) return hit;
      return new Response(JSON.stringify({ error: 'offline', offline: true }), {
        status: 503, headers: { 'Content-Type': 'application/json' },
      });
    }
  })());
});
