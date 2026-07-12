'use client'
import { useEffect } from 'react'
import { isChunkLoadError, purgeAndReload } from '@/lib/chunk-recovery'

// BLANK-SCREEN-FIX-1 — a client crash must never render silence again. This
// boundary already existed (route-segment errors); extended (not replaced)
// with on-brand type + a reload button that runs the same purge-and-reload
// as the automatic chunk-error self-heal (src/lib/chunk-recovery.ts) — a
// stale chunk needs a real cache/SW purge, not just React's soft reset().
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // A chunk-load error landing here (caught by React instead of the
  // window-level listener — e.g. thrown during render, not import()) gets
  // the same automatic recovery instead of waiting on the user to click.
  useEffect(() => {
    if (isChunkLoadError(error)) void purgeAndReload()
  }, [error])

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-6"
      style={{ background: '#0E1411', fontFamily: "var(--font-body, 'Outfit', system-ui, sans-serif)" }}
    >
      <div className="text-4xl">⚠️</div>
      <h2
        className="text-xl"
        style={{ fontFamily: "var(--font-display, 'Cormorant', Georgia, serif)", fontStyle: 'italic', fontWeight: 600, color: '#E8EDE7' }}
      >
        Something went wrong — tap to reload
      </h2>
      <p className="text-sm max-w-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
        An unexpected error occurred. Your data is safe.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => void purgeAndReload()}
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: '#7FB897', color: '#0E1411' }}
        >
          Reload
        </button>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg text-sm font-semibold border"
          style={{ borderColor: '#2D5240', color: '#7FB897', background: 'transparent' }}
        >
          Try again
        </button>
      </div>
      {process.env.NODE_ENV === 'development' && (
        <pre className="text-xs text-red-400 text-left max-w-lg overflow-auto mt-4">
          {error.message}
        </pre>
      )}
    </div>
  )
}
