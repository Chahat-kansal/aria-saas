const CACHE = 'aria-os-v2'

// Only pre-cache the offline fallback page — nothing else on install
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/offline'])).then(() => self.skipWaiting()))
})

// Purge all prior aria-os-* caches (aria-os-v1 etc.) on activate
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k.startsWith('aria-os-')).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Pass through: cross-origin, /api, /auth — SW never intercepts these
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api') || url.pathname.startsWith('/auth')) return

  // NETWORK-ONLY (with offline fallback) for:
  //   - all navigation requests (HTML page loads)
  //   - /menu, /pos, /dashboard paths (dynamic app pages — must always be fresh)
  //   - RSC payloads (?_rsc=...) — Next.js server-component fetches
  const isBypass = url.pathname.startsWith('/menu') ||
                   url.pathname.startsWith('/pos') ||
                   url.pathname.startsWith('/dashboard') ||
                   url.searchParams.has('_rsc')
  if (req.mode === 'navigate' || isBypass) {
    e.respondWith(fetch(req).catch(() => caches.match('/offline')))
    return
  }

  // Static hashed assets (/_next/static/*): stale-while-revalidate
  // Safe to cache — filenames are content-hashed, never change for same content
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(req).then(cached => {
        const net = fetch(req).then(res => {
          const copy = res.clone()
          caches.open(CACHE).then(c => c.put(req, copy))
          return res
        })
        return cached || net
      })
    )
    return
  }

  // Everything else: network-first, fall back to cache only when offline
  e.respondWith(
    fetch(req)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res })
      .catch(() => caches.match(req).then(r => r || caches.match('/offline')))
  )
})
