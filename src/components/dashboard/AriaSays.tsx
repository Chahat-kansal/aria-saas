'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type Priority = 'info' | 'warning' | 'critical'
interface InsightResult { insight: string | null; priority?: Priority; link?: string }

// Per-browser cache: 1 hour per business+page
const CACHE_KEY = (bid: string, page: string) => `aria-says:${bid}:${page}`
const CACHE_TTL_MS = 60 * 60 * 1000
const REFRESH_EVENT = 'aria-says:refresh'

// Clears the cached insight for a page and asks any mounted AriaSays banner for
// that page to regenerate. Call after a data mutation (invoice paid, parcel
// delivered, customer added…) so the banner stops showing pre-mutation numbers.
export function invalidateAriaInsight(businessId: string | null | undefined, page: string) {
  try {
    sessionStorage.removeItem(CACHE_KEY(businessId ?? 'self', page))
    if (businessId) sessionStorage.removeItem(CACHE_KEY('self', page))
  } catch { /* non-fatal */ }
  try {
    window.dispatchEvent(new CustomEvent(REFRESH_EVENT, { detail: { page } }))
  } catch { /* non-fatal */ }
}

const COLORS: Record<Priority, { bg: string; border: string; text: string; dim: string }> = {
  critical: { bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.25)', text: '#F87171', dim: 'rgba(248,113,113,0.7)' },
  warning:  { bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.25)', text: '#F59E0B', dim: 'rgba(245,158,11,0.7)' },
  info:     { bg: 'rgba(127,184,151,0.06)', border: 'rgba(127,184,151,0.25)', text: '#7FB897', dim: 'rgba(127,184,151,0.7)' },
}

interface Props {
  businessId: string | null | undefined
  page: string
  pageData?: Record<string, unknown>
  // Optional: hide entirely on dismissal in this session
  dismissable?: boolean
}

export function AriaSays({ businessId, page, pageData, dismissable = true }: Props) {
  const [result, setResult] = useState<InsightResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback((force: boolean) => {
    let cancelled = false
    const cacheBid = businessId ?? 'self'

    // Cache hit? (skipped when forced after a mutation)
    if (!force) {
      try {
        const raw = sessionStorage.getItem(CACHE_KEY(cacheBid, page))
        if (raw) {
          const cached = JSON.parse(raw) as { at: number; data: InsightResult }
          if (Date.now() - cached.at < CACHE_TTL_MS) {
            setResult(cached.data); setLoading(false); return () => { cancelled = true }
          }
        }
      } catch { /* fall through */ }
    }

    setLoading(true); setError(false)
    fetch(force ? '/api/aria/page-insight?fresh=true' : '/api/aria/page-insight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // When businessId is omitted, the endpoint resolves it from the authenticated user
      body: JSON.stringify({ business_id: businessId ?? undefined, page, page_data: pageData ?? null, fresh: force }),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: InsightResult) => {
        if (cancelled) return
        setResult(d)
        try { sessionStorage.setItem(CACHE_KEY(cacheBid, page), JSON.stringify({ at: Date.now(), data: d })) } catch { /* non-fatal */ }
      })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [businessId, page, pageData])

  useEffect(() => load(false), [load])

  // Regenerate when a mutation on this page fires invalidateAriaInsight().
  useEffect(() => {
    function onRefresh(e: Event) {
      const detail = (e as CustomEvent).detail as { page?: string } | undefined
      if (!detail || detail.page === page) load(true)
    }
    window.addEventListener(REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(REFRESH_EVENT, onRefresh)
  }, [load, page])

  if (dismissed) return null
  if (error) return null

  const priority: Priority = result?.priority ?? 'info'
  const c = COLORS[priority]

  return (
    <div role="status" aria-live="polite"
      style={{ borderRadius: 12, padding: '12px 16px', background: c.bg, border: '1px solid ' + c.border, marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: c.bg, border: '1px solid ' + c.border, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>
        ✦
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: c.text, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Aria says</p>
        {loading ? (
          <div style={{ marginTop: 6, height: 14, width: '70%', background: 'rgba(255,255,255,0.06)', borderRadius: 4, animation: 'aria-shimmer 1.4s linear infinite', backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.04) 100%)', backgroundSize: '200% 100%' }} />
        ) : result?.insight ? (
          <p style={{ fontSize: 13, lineHeight: 1.55, color: 'rgba(255,255,255,0.92)', margin: '4px 0 0' }}>{result.insight}</p>
        ) : (
          <p style={{ fontSize: 12, color: c.dim, margin: '4px 0 0', fontStyle: 'italic' }}>Not enough data yet — keep using Aria and an insight will appear here.</p>
        )}
        {result?.link && !loading && (
          <Link href={result.link} style={{ display: 'inline-block', marginTop: 6, fontSize: 11, color: c.text, fontWeight: 600, textDecoration: 'none' }}>
            Take action →
          </Link>
        )}
      </div>
      <Link href={`/dashboard/ask-aria?topic=${encodeURIComponent(page)}`}
        style={{ fontSize: 10, color: c.dim, fontWeight: 600, textDecoration: 'none', flexShrink: 0, padding: '4px 8px', borderRadius: 6, border: '1px solid ' + c.border }}>
        Ask more
      </Link>
      {dismissable && (
        <button onClick={() => setDismissed(true)}
          style={{ background: 'none', border: 'none', color: c.dim, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0 }}
          aria-label="Dismiss">×</button>
      )}
      <style jsx>{`
        @keyframes aria-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}
