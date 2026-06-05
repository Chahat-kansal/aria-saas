# CLAUDE CODE PROMPT — 247: PWA Conversion (installable mobile + desktop app)

Autonomous mode, no permission prompts. Build gate (`npx tsc --noEmit` + `npm run build`) before commit. RULE 0. `pwd` = `C:\Users\kansa\aria-saas-audit`.

## GOAL
Make Aria OS installable as an app on mobile (Add to Home Screen) and desktop (Chrome/Edge install) — own icon, fullscreen standalone, offline shell, and push-ready. No new heavy dependencies: use Next.js 14 App Router native conventions. Do NOT break the existing `public/community-sw.js`.

## VERIFIED CONTEXT
- Next.js 14.2 App Router, root layout at `src/app/layout.tsx` (uses `export const metadata`)
- Existing service worker `public/community-sw.js` (community widget) — must keep working, our SW must use a DIFFERENT filename and scope
- Icons: only `public/favicon.ico` exists. Need real PWA icons (192, 512, maskable).

## PHASE 1 — App manifest (native Next convention, no deps)
Create `src/app/manifest.ts`:
```ts
import type { MetadataRoute } from 'next'
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Aria OS — AI Business Co-Owner',
    short_name: 'Aria OS',
    description: 'Your AI co-owner. Daily briefings, POS, customers, marketing and more — for Australian small business.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0d1117',
    theme_color: '#7FB897',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    categories: ['business', 'productivity'],
  }
}
```
Next.js serves this at `/manifest.webmanifest` automatically and links it. Do NOT also add a manual `<link rel="manifest">` — the metadata system handles it.

## PHASE 2 — Icons
Generate real PNG icons from the existing brand. If an Aria logo/mark exists in the repo (search `public/` and `src/` for logo SVG/PNG), use it on a `#0d1117` background with the sage `#7FB897` accent. If none exists, create a simple branded icon: a rounded-square `#0d1117` tile with a sage-green "A" (Cormorant/serif italic) centered.
Produce: `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png` (maskable = same art with ~20% safe padding so Android's mask doesn't clip it). Use sharp or a canvas script. Commit the PNGs.

## PHASE 3 — Apple/iOS meta (App Router viewport + appleWebApp)
In `src/app/layout.tsx`, extend the existing `metadata` export (do not remove anything):
```ts
export const metadata: Metadata = {
  // ...existing...
  applicationName: 'Aria OS',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Aria OS' },
  formatDetection: { telephone: false },
}
```
And add the viewport export (Next 14 split viewport out of metadata):
```ts
import type { Viewport } from 'next'
export const viewport: Viewport = {
  themeColor: '#7FB897',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}
```
Add the apple touch icon to the existing `icons` field: `icons: { icon: '/favicon.ico', apple: '/icons/icon-192.png' }`.

## PHASE 4 — Service worker (offline shell) — separate file, no conflict
Create `public/aria-sw.js` (DISTINCT from community-sw.js):
```js
const CACHE = 'aria-os-v1'
const SHELL = ['/dashboard', '/offline']
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k.startsWith('aria-os-')).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Never cache API, auth, or cross-origin — always network
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api') || url.pathname.startsWith('/auth')) return
  // Network-first for navigation, fall back to cache then offline page
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res }).catch(() => caches.match(req).then(r => r || caches.match('/offline'))))
    return
  }
  // Stale-while-revalidate for static assets
  e.respondWith(caches.match(req).then(cached => { const net = fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res }).catch(() => cached); return cached || net }))
})
```

## PHASE 5 — Register the SW (client component, scoped so it doesn't clash)
Create `src/components/PWARegister.tsx`:
```tsx
'use client'
import { useEffect } from 'react'
export default function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    // Register with an explicit scope; community-sw registers itself separately.
    navigator.serviceWorker.register('/aria-sw.js', { scope: '/' }).catch(() => {})
  }, [])
  return null
}
```
Mount it in `src/app/layout.tsx` inside `<body>` (alongside Providers), so it loads on every page.

## PHASE 6 — Offline fallback page
Create `src/app/offline/page.tsx` — a simple branded page: "You're offline. Aria needs a connection for live business data. Reconnect to continue." with the sage accent and a retry button (`onClick={() => location.reload()}`). Keep it minimal and on-brand.

## PHASE 7 — Install prompt (optional, tasteful)
Create `src/components/InstallPrompt.tsx` ('use client') that listens for `beforeinstallprompt`, stashes the event, and shows a small dismissible bottom banner "Install Aria OS as an app" with Install / Not now. On Install, call `prompt()`. Persist dismissal in localStorage so it doesn't nag. Mount in the dashboard layout (NOT the marketing landing). If a dashboard layout exists at `src/app/dashboard/layout.tsx`, mount there; otherwise mount in layout but only render when `location.pathname` starts with `/dashboard`.

## VERIFICATION
1. `npx tsc --noEmit` + `npm run build` pass
2. `/manifest.webmanifest` serves valid JSON with the icons
3. The 4 icon PNGs exist and load
4. `public/community-sw.js` is UNTOUCHED and still present
5. `aria-sw.js` registers without clobbering community-sw (different filename)
6. In Chrome devtools → Application → Manifest: installable, no errors
7. Lighthouse PWA check passes the installability criteria

## HARD RULES
- Do NOT touch or rename `public/community-sw.js`
- No heavy PWA libraries (no next-pwa/serwist) — App Router native conventions only
- Don't cache `/api` or `/auth` routes — live business data must always be fresh
- start_url is `/dashboard` (the app entry), not the marketing landing
- Build gate before commit
