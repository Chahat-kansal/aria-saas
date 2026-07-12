'use client'
import { useEffect } from 'react'
import { installChunkErrorSelfHeal } from '@/lib/chunk-recovery'

// BLANK-SCREEN-FIX-1 — P0: returning visitors got a blank page because the
// root-scoped SW (/aria-sw.js, scope '/') served a stale app shell
// referencing JS chunks a later deploy had deleted -> ChunkLoadError ->
// dead React tree, with nothing on screen (dark bg, so blank not white).
//
// This component's job flips from REGISTERING that SW to SURRENDERING it:
// this app gets no real functional benefit from a root-scoped SW today (its
// only value was a generic /offline fallback + a marginal static-asset
// cache), which isn't worth the P0 risk of a stale app shell. Actively
// unregistering on every load is the fast, reliable kill path — it doesn't
// wait on the browser's own (sometimes hours-delayed) SW update-check
// cadence the way relying on a new service-worker script alone would.
// public/aria-sw.js is ALSO now a self-destructing script (belt-and-braces
// for the rare case a SW is already controlling the very first navigation
// before this component's JS gets a chance to run).
//
// community-sw.js (/community/) and inventory-sw.js (/inventory/) are
// untouched — different, tightly-scoped registrations serving a real
// purpose (push notifications, offline inventory shell), unrelated to this
// incident (SW scope is a hard browser boundary; neither can affect '/').
export default function PWARegister() {
  useEffect(() => {
    installChunkErrorSelfHeal()
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.getRegistrations()
      .then(regs => Promise.all(regs.filter(r => !r.scope.includes('/community/') && !r.scope.includes('/inventory/')).map(r => r.unregister())))
      .catch(() => {})
    if ('caches' in window) {
      caches.keys()
        .then(keys => Promise.all(keys.filter(k => k.startsWith('aria-os-')).map(k => caches.delete(k))))
        .catch(() => {})
    }
  }, [])
  return null
}
