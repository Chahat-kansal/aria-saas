'use client'

// BLANK-SCREEN-FIX-1 — shared recovery logic for a stale-client / dead-chunk
// state (a returning visitor's browser holding onto JS chunk references a
// deploy has since deleted). Used by: the global chunk-error self-heal
// listener (automatic), and the reload buttons in error.tsx / global-error.tsx
// (manual — a visible crash gets the same aggressive cleanup, not just a
// soft state reset, since a soft reset can't fix a genuinely stale chunk).

const RELOAD_GUARD_KEY = 'aria_chunk_recover'

/** True for the two error shapes a stale/deleted webpack chunk produces —
 *  a thrown ChunkLoadError (sync `import()` failure surfaced via
 *  window.onerror) or a rejected dynamic-import promise (via
 *  unhandledrejection) — matched by name and by Next.js's message text. */
export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false
  const name = (err as { name?: string })?.name ?? ''
  const message = (err as { message?: string })?.message ?? String(err)
  return name === 'ChunkLoadError' || /Loading chunk [\w.-]+ failed/i.test(message) || /Loading CSS chunk [\w.-]+ failed/i.test(message)
}

/** Unregisters every service worker for this origin, deletes every Cache
 *  Storage entry, and reloads once. Guarded by a sessionStorage flag so a
 *  page that's STILL broken after reload (a real bug, not a stale cache)
 *  can never loop — it just leaves the visitor on the (now themed, not
 *  blank) error boundary instead. */
export async function purgeAndReload(): Promise<void> {
  try {
    if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return
    sessionStorage.setItem(RELOAD_GUARD_KEY, '1')
  } catch { /* sessionStorage unavailable (private mode etc.) — proceed once, unguarded */ }

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map(r => r.unregister()))
    }
  } catch { /* best-effort */ }

  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map(k => caches.delete(k)))
    }
  } catch { /* best-effort */ }

  window.location.reload()
}

/** Call once, as early as possible (root layout). Installs window.onerror +
 *  unhandledrejection listeners that trigger purgeAndReload() on a chunk-load
 *  failure — the automatic half of the self-heal path; error.tsx/
 *  global-error.tsx's reload button is the manual half for whatever a user
 *  actually sees rendered. */
export function installChunkErrorSelfHeal(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('error', (event) => {
    if (isChunkLoadError(event.error ?? event.message)) void purgeAndReload()
  })
  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event.reason)) void purgeAndReload()
  })
}
