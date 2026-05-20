'use client'
import { useState, useEffect, useCallback } from 'react'

interface Review { id: string; reviewer_name: string | null; reviewer_avatar: string | null; rating: number | null; comment: string | null; review_date: string | null; has_reply: boolean; reply_text: string | null; ai_drafted_reply: string | null; sentiment: string | null; sentiment_score: number | null; status: string }
interface Stats { google_place_id: string | null; average_rating: number | null; total_reviews: number | null; last_synced: string | null; local_count: number; distribution: Record<number, number> }
interface Analytics { total: number; avg_rating: number; response_rate: number; unreplied: number; negative_unreplied: number; monthly_trend: Array<{ month: string; count: number; avg_rating: number }> }
interface Reputation { score: number | null; trend?: string; grade?: string; summary?: string; top_risk?: string; top_action?: string }
interface Template { id: string; name: string; rating_min: number; rating_max: number; body: string; is_global: boolean }

const SENTIMENT_COLOR: Record<string, string> = { positive: '#7FB897', neutral: '#94A3B8', negative: '#EF4444' }

function StarRow({ rating, size = 14 }: { rating: number | null; size?: number }) {
  const n = rating ?? 0
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1,2,3,4,5].map(s => (
        <svg key={s} width={size} height={size} viewBox="0 0 24 24" fill={s <= n ? '#F59E0B' : 'none'} stroke={s <= n ? '#F59E0B' : '#4B5563'} strokeWidth={1.5}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      ))}
    </span>
  )
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days}d ago`
  if (days < 30) return `${Math.floor(days/7)}w ago`
  if (days < 365) return `${Math.floor(days/30)}mo ago`
  return `${Math.floor(days/365)}y ago`
}

type FilterTab = 'all' | 'new' | 'replied' | 'negative'
const TABS: { key: FilterTab; label: string }[] = [{ key:'all',label:'All' },{ key:'new',label:'New' },{ key:'replied',label:'Replied' },{ key:'negative',label:'Negative' }]

export default function ReviewsPage() {
  const [reviews,    setReviews]    = useState<Review[]>([])
  const [stats,      setStats]      = useState<Stats | null>(null)
  const [analytics,  setAnalytics]  = useState<Analytics | null>(null)
  const [reputation, setReputation] = useState<Reputation | null>(null)
  const [templates,  setTemplates]  = useState<Template[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [connectQuery, setConnectQuery] = useState('')
  const [connectSearching, setConnectSearching] = useState(false)
  const [connectMatches, setConnectMatches] = useState<Array<{ place_id: string; name: string; address: string; rating: number | null; total_reviews: number; status: string }>>([])
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [connectSearched, setConnectSearched] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [tab,        setTab]        = useState<FilterTab>('all')
  const [syncing,    setSyncing]    = useState(false)
  const [syncMsg,    setSyncMsg]    = useState('')
  const [drafts,     setDrafts]     = useState<Record<string, string>>({})
  const [acting,     setActing]     = useState<string | null>(null)
  const [copied,     setCopied]     = useState<string | null>(null)
  const [gmbStatus,  setGmbStatus]  = useState<Record<string, 'published' | 'saved'>>({})

  const load = useCallback(async (filter?: FilterTab) => {
    setLoading(true)
    const q = filter && filter !== 'all' ? `&status=${filter}` : ''
    const res = await fetch(`/api/aria/reviews?${q}`).then(r => r.json()).catch(() => ({ reviews: [], stats: null }))
    setReviews(res.reviews ?? [])
    setStats(res.stats ?? null)
    const initDrafts: Record<string, string> = {}
    for (const r of res.reviews ?? []) { if (r.ai_drafted_reply && !r.has_reply) initDrafts[r.id] = r.ai_drafted_reply }
    setDrafts(prev => ({ ...initDrafts, ...prev }))
    setLoading(false)
  }, [])

  useEffect(() => { load(tab) }, [load, tab])

  useEffect(() => {
    fetch('/api/reviews/analytics').then(r => r.json()).then((d: Analytics) => setAnalytics(d)).catch(() => {})
    fetch('/api/aria/reviews/reputation').then(r => r.json()).then((d: Reputation) => setReputation(d)).catch(() => {})
    fetch('/api/marketing/templates').then(r => r.json()).then((d: { templates?: Template[] }) => {
      if (d.templates) setTemplates(d.templates.filter(t => t.is_global))
    }).catch(() => {})
  }, [])

  async function syncNow() {
    setSyncing(true); setSyncMsg('')
    try {
      // Get business_id first
      const bizRes = await fetch('/api/pos/products')
      const bd = await bizRes.json()
      const business_id = bd.business_id
      if (!business_id) {
        setSyncMsg('⚠️ No business selected')
        setSyncing(false)
        return
      }
      const res = await fetch('/api/aria/sync-reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id })
      }).then(r => r.json()).catch(() => ({ error: 'Network error' }))
      if (res.error === 'not_configured') setSyncMsg('⚠️ Google Places API key not configured')
      else if (res.error === 'no_place_id') setSyncMsg('⚠️ Click "Connect in 10 seconds" to set up Google reviews')
      else if (res.ok) { setSyncMsg(`✅ ${res.reviews_synced ?? 0} synced`); load(tab) }
      else setSyncMsg(`❌ ${res.error ?? 'Sync failed'}`)
    } catch {
      setSyncMsg('❌ Network error')
    }
    setSyncing(false)
  }

  async function publishReply(id: string) {
    setActing(id)
    const res = await fetch('/api/aria/reviews', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, has_reply: true, reply_text: drafts[id] ?? null }),
    }).then(r => r.json()).catch(() => ({ ok: false })) as { ok: boolean; gmb_published?: boolean }
    setReviews(rs => rs.map(r => r.id === id ? { ...r, has_reply: true, reply_text: drafts[id] ?? null, status: 'replied' } : r))
    setGmbStatus(prev => ({ ...prev, [id]: res.gmb_published ? 'published' : 'saved' }))
    setActing(null)
  }

  async function requestReview(reviewId: string, businessId?: string) {
    if (!businessId) return
    await fetch('/api/aria/review-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ review_id: reviewId }) }).catch(() => {})
  }

  async function findGooglePlace() {
    if (!connectQuery.trim()) return
    setConnectSearching(true)
    setConnectSearched(true)
    setConnectError(null)
    setConnectMatches([])
    try {
      const bizRes = await fetch('/api/pos/products')
      const bd = await bizRes.json()
      const business_id = bd.business_id
      if (!business_id) { setConnectError('No business found in your account'); setConnectSearching(false); return }
      const r = await fetch('/api/reviews/find-place', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id, query: connectQuery })
      })
      const d = await r.json()
      if (d.error) setConnectError(d.error)
      else if (!d.matches || d.matches.length === 0) setConnectError(d.message || `No business found matching "${connectQuery}". Try adding more details like street or suburb.`)
      else setConnectMatches(d.matches)
    } catch (e) {
      setConnectError('Search failed. Check your internet connection.')
    }
    setConnectSearching(false)
  }

  async function connectGooglePlace(placeId: string) {
    setConnectingId(placeId)
    try {
      const bizRes = await fetch('/api/pos/products')
      const bd = await bizRes.json()
      const business_id = bd.business_id
      if (!business_id) { alert('No business found'); setConnectingId(null); return }
      // Save Place ID to business
      await fetch(`/api/businesses/${business_id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ google_place_id: placeId })
      })
      // Trigger initial sync
      await fetch('/api/reviews/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id, place_id: placeId })
      })
      setShowConnectModal(false)
      window.location.reload()
    } catch { alert('Could not connect — try again'); setConnectingId(null) }
  }

  function copyDraft(id: string) {
    const text = drafts[id]
    if (!text) return
    navigator.clipboard.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(null), 2000) }).catch(() => {})
  }

  function applyTemplate(reviewId: string, tpl: Template, reviewerName: string | null) {
    const text = (tpl.body ?? '').replace(/\{reviewer_name\}/gi, (reviewerName ?? 'you').split(' ')[0])
    setDrafts(d => ({ ...d, [reviewId]: text }))
  }

  const showGoogleConnectBanner = !loading && stats && !stats.google_place_id
  const avgRating   = stats?.average_rating ?? null
  const totalReviews = stats?.total_reviews ?? stats?.local_count ?? 0
  const lastSynced  = stats?.last_synced ? timeAgo(stats.last_synced) : null
  const dist        = stats?.distribution ?? {}
  const maxDist     = Math.max(1, ...Object.values(dist))
  const newCount    = reviews.filter(r => r.status === 'new' && !r.has_reply).length

  const GRADE_COLOR: Record<string, string> = { A:'#7FB897', B:'#7FB897', C:'#EF9F27', D:'#EF4444', F:'#EF4444' }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily:"'Manrope',sans-serif", padding: '28px 32px', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Reviews & Reputation</h1>
          {lastSynced && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Last synced {lastSynced}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {syncMsg && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{syncMsg}</span>}
          <button onClick={syncNow} disabled={syncing}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: syncing ? 'var(--bg-elevated)' : '#4285F4', color: syncing ? 'var(--text-tertiary)' : '#fff', fontSize: 12, fontWeight: 700, cursor: syncing ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {syncing ? '⏳ Syncing…' : '🔄 Sync Now'}
          </button>
        </div>
      </div>

      {/* Google connect banner — dismissible, not blocking */}
      {showGoogleConnectBanner && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(66,133,244,0.08)', border: '1px solid rgba(66,133,244,0.25)', fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontWeight: 600, color: '#4285F4', marginBottom: 2 }}>📍 Want to auto-sync your Google reviews?</p>
            <p style={{ fontSize: 12 }}>Add your Google Place ID in Settings to monitor reviews automatically. Until then, use Aria to draft replies for any reviews you collect manually.</p>
          </div>
          <button onClick={() => { setShowConnectModal(true); setConnectQuery(''); setConnectMatches([]); setConnectSearched(false); setConnectError(null) }} style={{ padding: '6px 14px', borderRadius: 8, background: '#4285F4', color: '#fff', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
            Connect in 10 seconds →
          </button>
        </div>
      )}

      {/* Negative alert banner */}
      {analytics && analytics.negative_unreplied > 0 && (
        <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 13, color: '#EF4444', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700 }}>⚠</span>
          {analytics.negative_unreplied} negative review{analytics.negative_unreplied !== 1 ? 's' : ''} without a reply — reputation risk. Reply within 24 hours.
        </div>
      )}

      {/* Review request automation banner */}
      <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(127,184,151,0.06)', borderRadius: 10, border: '1px solid rgba(127,184,151,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#7FB897' }}>Review request automation</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Click "Request review" on any customer to send an SMS with your Google review link. Responses tracked automatically.</p>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right' }}>
          <p>Powered by Twilio</p>
          <p style={{ color: '#7FB897', marginTop: 2 }}>✓ Spam Act compliant</p>
        </div>
      </div>

      {/* Analytics + reputation strip */}
      {analytics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr) auto', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total reviews', value: String(analytics.total) },
            { label: 'Avg rating', value: avgRating ? `${avgRating} ★` : '—' },
            { label: 'Response rate', value: `${analytics.response_rate}%` },
            { label: 'Unreplied', value: String(analytics.unreplied) },
          ].map((c, i) => (
            <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 12, padding: '12px 16px' }}>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 4px' }}>{c.label}</p>
              <p style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{c.value}</p>
            </div>
          ))}
          {reputation?.score != null && (
            <div style={{ background: 'var(--bg-surface)', border: `1px solid ${GRADE_COLOR[reputation.grade ?? 'C'] ?? '#EF9F27'}44`, borderRadius: 12, padding: '12px 16px', minWidth: 130 }}>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 4px' }}>Reputation score</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <p style={{ fontSize: 22, fontWeight: 700, margin: 0, color: GRADE_COLOR[reputation.grade ?? 'C'] }}>{reputation.score}</p>
                <span style={{ fontSize: 13, color: GRADE_COLOR[reputation.grade ?? 'C'], fontWeight: 700 }}>{reputation.grade}</span>
                {reputation.trend && <span style={{ fontSize: 13 }}>{reputation.trend === 'up' ? '↑' : reputation.trend === 'down' ? '↓' : '→'}</span>}
              </div>
              {reputation.top_action && <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: '4px 0 0', lineHeight: 1.4 }}>{reputation.top_action.slice(0, 80)}</p>}
            </div>
          )}
        </div>
      )}

      {/* Monthly trend mini-chart */}
      {analytics?.monthly_trend && analytics.monthly_trend.some(m => m.count > 0) && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Monthly trend — last 6 months</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 48 }}>
            {(() => {
              const maxCount = Math.max(1, ...analytics.monthly_trend.map(m => m.count))
              return analytics.monthly_trend.map((m, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{ width: '100%', background: '#2D5240', borderRadius: 3, height: `${Math.max(4, (m.count / maxCount) * 40)}px`, transition: 'height 0.4s' }} title={`${m.count} reviews, avg ${m.avg_rating}★`} />
                  <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{m.month.slice(5)}</span>
                </div>
              ))
            })()}
          </div>
        </div>
      )}

      {/* Rating summary */}
      {!loading && stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 16, padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ textAlign: 'center', minWidth: 90 }}>
            <div style={{ fontSize: 42, fontWeight: 800, color: '#F59E0B', lineHeight: 1 }}>{avgRating?.toFixed(1) ?? '—'}</div>
            <div style={{ marginTop: 6 }}><StarRow rating={Math.round(avgRating ?? 0)} size={16} /></div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{totalReviews} on Google</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5 }}>
            {[5,4,3,2,1].map(star => (
              <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', width: 12, textAlign: 'right' }}>{star}</span>
                <svg width={10} height={10} viewBox="0 0 24 24" fill="#F59E0B" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4, background: '#F59E0B', width: `${((dist[star] ?? 0) / maxDist) * 100}%`, transition: 'width 0.4s' }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', width: 14 }}>{dist[star] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid var(--divider)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: tab === t.key ? 700 : 400, color: tab === t.key ? 'var(--text-primary)' : 'var(--text-secondary)', borderBottom: tab === t.key ? '2px solid var(--violet)' : '2px solid transparent', marginBottom: -1 }}>
            {t.label}{t.key === 'new' && newCount > 0 ? ` (${newCount})` : ''}
          </button>
        ))}
      </div>

      {/* Review cards */}
      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
      ) : reviews.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {tab === 'all' ? 'No reviews yet — click Sync Now' : tab === 'new' ? 'No new reviews' : tab === 'replied' ? 'No replied reviews yet' : 'No negative reviews — great work!'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reviews.map(review => (
            <div key={review.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: '18px 20px', borderLeft: `3px solid ${review.rating != null && review.rating <= 2 ? '#EF4444' : review.has_reply ? '#7FB897' : 'var(--violet)'}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                {review.reviewer_avatar ? (
                  <img src={review.reviewer_avatar} alt="" width={34} height={34} style={{ borderRadius: '50%', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                    {(review.reviewer_name ?? '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{review.reviewer_name ?? 'Anonymous'}</span>
                    <StarRow rating={review.rating} />
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{timeAgo(review.review_date)}</span>
                    {review.sentiment && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 700, background: `${SENTIMENT_COLOR[review.sentiment] ?? '#94A3B8'}18`, color: SENTIMENT_COLOR[review.sentiment] ?? '#94A3B8' }}>{review.sentiment}</span>}
                    {review.has_reply && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 700, background: 'rgba(127,184,151,0.12)', color: '#7FB897' }}>Replied</span>}
                    {gmbStatus[review.id] === 'published' && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 700, background: 'rgba(127,184,151,0.12)', color: '#7FB897' }}>✓ Published to Google</span>}
                    {gmbStatus[review.id] === 'saved' && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 700, background: 'rgba(148,163,184,0.12)', color: '#94A3B8' }}>Saved locally</span>}
                  </div>
                </div>
              </div>
              {review.comment && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.6, paddingLeft: 46 }}>&ldquo;{review.comment}&rdquo;</p>}

              {!review.has_reply && (
                <div style={{ paddingLeft: 46 }}>
                  {/* Template quick-picker */}
                  {templates.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      {templates.filter(t => !t.rating_min || !review.rating || (review.rating >= (t.rating_min ?? 1) && review.rating <= (t.rating_max ?? 5))).slice(0, 4).map(tpl => (
                        <button key={tpl.id} onClick={() => applyTemplate(review.id, tpl, review.reviewer_name)}
                          style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, background: 'rgba(127,184,151,0.08)', color: '#7FB897', border: '1px solid rgba(127,184,151,0.2)', cursor: 'pointer' }}>
                          {tpl.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', display: 'block', marginBottom: 6 }}>
                    {drafts[review.id] ? 'AI-drafted reply (edit before publishing):' : 'No AI draft yet'}
                  </label>
                  {drafts[review.id] !== undefined ? (
                    <>
                      <textarea value={drafts[review.id]} onChange={e => setDrafts(d => ({ ...d, [review.id]: e.target.value }))} rows={3}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--divider)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', resize: 'vertical', outline: 'none', lineHeight: 1.5 }} />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>

                        <button onClick={async () => { await navigator.clipboard.writeText(drafts[review.id] ?? '').catch(()=>{}); setCopied(review.id); setTimeout(()=>setCopied(null),2000); }}
                          style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#7FB897', color: '#2D5240', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {copied === review.id ? '✓ Copied!' : '📋 Copy reply'}
                        </button>
                        <a href={`https://search.google.com/local/writereview?placeid=${stats?.google_place_id ?? ''}`} target="_blank" rel="noreferrer"
                          style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(66,133,244,0.3)', background: 'rgba(66,133,244,0.08)', color: '#4285F4', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'inline-block' }}>
                          Open Google ↗
                        </a>
                        <button onClick={() => publishReply(review.id)} disabled={acting === review.id}
                          style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: acting === review.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                          {acting === review.id ? '…' : '✓ Mark replied'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Sync reviews to generate AI draft replies automatically.</p>
                  )}
                </div>
              )}

              {review.has_reply && review.reply_text && (
                <div style={{ paddingLeft: 46, marginTop: 8 }}>
                  <div style={{ padding: '10px 14px', background: 'rgba(127,184,151,0.06)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Your reply: </strong>{review.reply_text}
                  </div>
                  <button onClick={() => requestReview(review.id, stats?.google_place_id ?? undefined)}
                    style={{ marginTop: 8, padding: '5px 12px', borderRadius: 20, fontSize: 11, background: 'rgba(55,138,221,0.08)', color: '#378ADD', border: '1px solid rgba(55,138,221,0.2)', cursor: 'pointer' }}>
                    Request follow-up review
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 24 }}>Reviews auto-synced daily at 6 AM. Aria drafts replies automatically — review before publishing to Google.</p>

      {/* Google Connect Modal */}
      {showConnectModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowConnectModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderRadius: 16, padding: 28, maxWidth: 540, width: '100%', maxHeight: '85vh', overflow: 'auto', border: '1px solid var(--divider)' }}>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Connect Google Reviews</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Type your business name and city — Aria will find it on Google Maps and connect automatically.</p>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                autoFocus
                value={connectQuery}
                onChange={e => setConnectQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') findGooglePlace() }}
                placeholder="e.g. Sip Café Melbourne"
                style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--divider)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, outline: 'none' }}
              />
              <button
                onClick={findGooglePlace}
                disabled={connectSearching || !connectQuery.trim()}
                style={{ padding: '10px 18px', borderRadius: 10, background: '#4285F4', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: connectSearching || !connectQuery.trim() ? 'not-allowed' : 'pointer', opacity: connectSearching || !connectQuery.trim() ? 0.5 : 1, fontFamily: 'inherit' }}>
                {connectSearching ? 'Searching…' : '🔍 Search'}
              </button>
            </div>

            {connectMatches.length > 0 && (
              <div>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10, fontWeight: 600 }}>Select your business:</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {connectMatches.map(m => (
                    <button key={m.place_id} onClick={() => connectGooglePlace(m.place_id)} disabled={!!connectingId}
                      style={{ textAlign: 'left', padding: '12px 16px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--divider)', cursor: connectingId ? 'wait' : 'pointer', color: 'var(--text-primary)', fontFamily: 'inherit', opacity: connectingId && connectingId !== m.place_id ? 0.4 : 1 }}>
                      <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
                        {m.name}
                        {connectingId === m.place_id && <span style={{ fontSize: 11, color: '#4285F4', marginLeft: 8 }}>Connecting…</span>}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{m.address}</p>
                      {m.rating !== null && (
                        <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          ⭐ {m.rating} · {m.total_reviews} reviews{m.status !== 'OPERATIONAL' && <span style={{ color: '#f59e0b', marginLeft: 8 }}>· {m.status}</span>}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {connectError && (
              <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', marginBottom: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#EF4444', marginBottom: 6 }}>⚠️ {connectError}</p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                  Tips: Include the suburb (e.g. "Sip Café Fitzroy"), exact street, or postcode.
                  If your business isn't on Google Maps yet, <a href="https://www.google.com/business/" target="_blank" rel="noopener" style={{ color: '#4285F4' }}>claim it for free here</a> first.
                </p>
              </div>
            )}

            {connectMatches.length === 0 && !connectSearching && !connectSearched && (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: '20px 0' }}>
                Type your business name and click Search.
              </p>
            )}

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--divider)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Need help? <a href="https://www.google.com/business/" target="_blank" rel="noopener" style={{ color: '#4285F4' }}>Claim your business on Google →</a></p>
              <button onClick={() => setShowConnectModal(false)} style={{ padding: '8px 14px', borderRadius: 8, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--divider)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
