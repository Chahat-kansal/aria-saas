// BLANK-SCREEN-FIX-1 — self-destructing replacement for the old root-scoped
// (scope '/') aria-sw.js. That SW served a stale app shell to returning
// visitors after a deploy deleted the JS chunks it referenced ->
// ChunkLoadError -> blank page (dark bg, so blank not white). This app gets
// no functional benefit from a root-scoped SW that's worth that P0 risk.
//
// PWARegister.tsx (mounted in the root layout) is the FAST, primary kill
// path — it actively calls getRegistrations().unregister() on every page
// load, which doesn't wait on the browser's own SW update-check cadence.
// This script is the belt-and-braces backup for the rare case a SW is
// already controlling the very first navigation before that component's JS
// gets a chance to run: it takes over immediately, unregisters itself, and
// purges every 'aria-os-*' cache, so any remaining installs finish killing
// themselves without needing a user to manually clear site data.
//
// community-sw.js (/community/) and inventory-sw.js (/inventory/) are
// untouched, different, tightly-scoped SWs serving a real purpose — not
// part of this incident and not affected by this file (SW scope is a hard
// browser boundary).

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter(k => k.startsWith('aria-os-')).map(k => caches.delete(k)))
      await self.clients.claim()
      await self.registration.unregister()
      const clientsList = await self.clients.matchAll({ type: 'window' })
      for (const client of clientsList) client.navigate(client.url)
    })()
  )
})
