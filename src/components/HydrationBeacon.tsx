'use client'
import { useEffect } from 'react'

// MONITOR-1 — fires exactly once, only after this component has actually
// mounted client-side. If hydration dies (BLANK-SCREEN-FIX-1/2's incident —
// a stale SW serving deleted JS chunks), this effect never runs and no
// beacon is ever sent for that pageview — that absence, correlated against
// the CURRENT buildId (see the root layout's <meta name="aria-build">), is
// exactly the signal the silent-blank synthetic check looks for.
export default function HydrationBeacon({ path }: { path: string }) {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) return
    const buildId = process.env.NEXT_PUBLIC_BUILD_ID ?? ''
    if (!buildId) return
    try {
      const blob = new Blob([JSON.stringify({ path, buildId })], { type: 'application/json' })
      navigator.sendBeacon('/api/health/hydrated', blob)
    } catch { /* best-effort — never let a beacon failure affect the page */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
