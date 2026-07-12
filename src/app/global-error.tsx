'use client'
import { useEffect } from 'react'
import { isChunkLoadError, purgeAndReload } from '@/lib/chunk-recovery'

// BLANK-SCREEN-FIX-1 — error.tsx only catches errors within nested route
// segments; a failure in the ROOT LAYOUT ITSELF (or before error.tsx's own
// boundary is established) isn't caught by it and could still render blank.
// global-error.tsx is the one boundary Next.js gives that catches THAT —
// it was missing entirely before this fix. Per Next.js convention it must
// render its own <html>/<body> (it replaces the whole root layout when it
// fires), so it's kept deliberately minimal and inline-styled — no
// dependency on the root layout's own CSS custom properties, Tailwind
// classes, or any other component actually having loaded successfully.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (isChunkLoadError(error)) void purgeAndReload()
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0E1411', minHeight: '100vh' }}>
        <div
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            minHeight: '100vh', gap: 16, textAlign: 'center', padding: '0 24px',
            fontFamily: "'Outfit', system-ui, sans-serif",
          }}
        >
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h2 style={{ fontFamily: "'Cormorant', Georgia, serif", fontStyle: 'italic', fontWeight: 600, fontSize: 22, color: '#E8EDE7', margin: 0 }}>
            Something went wrong — tap to reload
          </h2>
          <p style={{ fontSize: 14, maxWidth: 360, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
            An unexpected error occurred. Your data is safe.
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => void purgeAndReload()}
              style={{ padding: '10px 18px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 600, background: '#7FB897', color: '#0E1411', cursor: 'pointer' }}
            >
              Reload
            </button>
            <button
              onClick={reset}
              style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #2D5240', fontSize: 14, fontWeight: 600, background: 'transparent', color: '#7FB897', cursor: 'pointer' }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
