'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

type Priority = 'info' | 'warning' | 'critical'
interface InsightResult { insight: string | null; priority?: Priority; link?: string; no_data?: boolean }

// Per-browser cache: 1 hour per business+page (null insights get a shorter 5-min TTL
// so the banner retries once real data arrives).
const CACHE_KEY = (bid: string, page: string) => `aria-says:${bid}:${page}`
const CACHE_TTL_MS = 60 * 60 * 1000
const NULL_CACHE_TTL_MS = 5 * 60 * 1000
const REFRESH_EVENT = 'aria-says:refresh'

// Clears the cached insight for a page and asks any mounted AriaSays banner for
// that page to regenerate. Call after a data mutation (invoice paid, parcel
// delivered, customer added…) so the banner stops showing pre-mutation numbers.
export function invalidateAriaInsight(businessId: string | null | undefined, page: string) {
  try {
    sessionStorage.removeItem(CACHE_KEY(businessId ?? 'self', page))
    if (businessId) sessionStorage.removeItem(CACHE_KEY('self', page))
  } catch (e) { console.error('[non-fatal]', e) }
  try {
    window.dispatchEvent(new CustomEvent(REFRESH_EVENT, { detail: { page } }))
  } catch (e) { console.error('[non-fatal]', e) }
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
  dismissable?: boolean
}

export function AriaSays({ businessId, page, pageData, dismissable = true }: Props) {
  const [result, setResult] = useState<InsightResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const [error, setError] = useState(false)
  // Tracks whether we've already done one auto-retry for a null insight.
  const retriedRef = useRef(false)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback((force: boolean) => {
    let cancelled = false
    const cacheBid = businessId ?? 'self'

    if (!force) {
      try {
        const raw = sessionStorage.getItem(CACHE_KEY(cacheBid, page))
        if (raw) {
          const cached = JSON.parse(raw) as { at: number; data: InsightResult }
          const ttl = cached.data.insight ? CACHE_TTL_MS : NULL_CACHE_TTL_MS
          if (Date.now() - cached.at < ttl) {
            setResult(cached.data); setLoading(false); return () => { cancelled = true }
          }
        }
      } catch { /* fall through */ }
    }

    setLoading(true); setError(false)
    fetch(force ? '/api/aria/page-insight?fresh=true' : '/api/aria/page-insight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId ?? undefined, page, page_data: pageData ?? null, fresh: force }),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: InsightResult) => {
        if (cancelled) return
        setResult(d)
        try { sessionStorage.setItem(CACHE_KEY(cacheBid, page), JSON.stringify({ at: Date.now(), data: d })) } catch (e) { console.error('[non-fatal]', e) }
      })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [businessId, page, pageData])

  useEffect(() => load(false), [load])

  // Task 16: if the first load returns no insight, auto-retry once with a fresh call
  // so pages that have real data but haven't generated an insight yet get one immediately.
  useEffect(() => {
    if (loading || error || result?.insight || result?.no_data || retriedRef.current) return
    // Insight is null — show "thinking" then fire a fresh fetch after 1.5s
    retriedRef.current = true
    retryTimerRef.current = setTimeout(() => load(true), 1500)
    return () => { if (retryTimerRef.current) clearTimeout(retryTimerRef.current) }
  }, [loading, error, result, load])

  // Regenerate when a mutation on this page fires invalidateAriaInsight().
  useEffect(() => {
    function onRefresh(e: Event) {
      const detail = (e as CustomEvent).detail as { page?: string } | undefined
      if (!detail || detail.page === page) {
        retriedRef.current = false  // allow a fresh auto-retry after forced invalidation
        load(true)
      }
    }
    window.addEventListener(REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(REFRESH_EVENT, onRefresh)
  }, [load, page])

  if (dismissed) return null

  const priority: Priority = result?.priority ?? 'info'
  const c = COLORS[priority]

  // Error state: show a subtle message instead of hiding entirely.
  // Owner needs to know Aria isn't working, not see a blank space.
  if (error) {
    return (
      <div role="status" style={{ borderRadius: 12, padding: '10px 16px', background: COLORS.info.bg, border: '1px solid ' + COLORS.info.border, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 14 }}>✦</span>
        <p style={{ fontSize: 12, color: COLORS.info.dim, margin: 0, fontStyle: 'italic', flex: 1 }}>
          Aria couldn&apos;t load right now — try refreshing the page.
        </p>
        <button onClick={() => { setError(false); retriedRef.current = false; load(true) }}
          style={{ fontSize: 11, color: COLORS.info.text, background: 'none', border: '1px solid ' + COLORS.info.border, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    )
  }

  const NO_DATA_MSGS: Record<string, string> = {
    sales: 'Connect your POS and complete a sale to see sales insights.',
    invoices: 'Create and send an invoice to see invoice insights.',
    customers: 'Add your first customer or import from POS to see customer insights.',
    'weekly-reports': 'Generate your first weekly report to see trends here.',
    'shift-reports': 'Complete a shift close to see cash reconciliation insights.',
    seo: 'Run your first SEO audit under Settings → SEO to see results.',
    competitors: 'Run a competitor scan to see how you compare locally.',
    'profit-leaks': 'Process some sales so Aria can identify profit improvement opportunities.',
    staff: 'Add a staff member and log some shifts to see staff insights.',
    'cash-flow': 'Record some expenses or complete a cash session to see cash-flow insights.',
    reorder: 'Track inventory and complete some sales to see reorder forecasts.',
  }
  const emptyMsg = result?.no_data
    ? (NO_DATA_MSGS[page] ?? 'No data yet for this section — complete some actions to see insights.')
    : 'Give me a moment, I\'m thinking about this…'

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
          <div>
            <p style={{ fontSize: 12, color: c.dim, margin: '4px 0 0', fontStyle: 'italic' }}>{emptyMsg}</p>
            {result?.no_data && (
              <button
                onClick={() => { retriedRef.current = false; load(true) }}
                style={{ marginTop: 6, fontSize: 11, color: c.text, background: 'none', border: '1px solid ' + c.border, borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Regenerate
              </button>
            )}
          </div>
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
