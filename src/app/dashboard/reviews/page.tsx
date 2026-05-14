'use client'
import { useState, useEffect, useCallback } from 'react'

interface Review {
  id: string
  reviewer_name: string | null
  reviewer_avatar: string | null
  rating: number | null
  comment: string | null
  review_date: string | null
  has_reply: boolean
  reply_text: string | null
  ai_drafted_reply: string | null
  sentiment: string | null
  sentiment_score: number | null
  status: string
}

interface Stats {
  google_place_id: string | null
  average_rating: number | null
  total_reviews: number | null
  last_synced: string | null
  local_count: number
  distribution: Record<number, number>
}

const SENTIMENT_COLOR: Record<string, string> = {
  positive: '#7FB897',
  neutral:  '#94A3B8',
  negative: '#EF4444',
}

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
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) !== 1 ? 's' : ''} ago`
  if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) !== 1 ? 's' : ''} ago`
  return `${Math.floor(days / 365)} year${Math.floor(days / 365) !== 1 ? 's' : ''} ago`
}

type FilterTab = 'all' | 'new' | 'replied' | 'negative'
const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',      label: 'All'      },
  { key: 'new',      label: 'New'      },
  { key: 'replied',  label: 'Replied'  },
  { key: 'negative', label: 'Negative' },
]

export default function ReviewsPage() {
  const [reviews,    setReviews]    = useState<Review[]>([])
  const [stats,      setStats]      = useState<Stats | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState<FilterTab>('all')
  const [syncing,    setSyncing]    = useState(false)
  const [syncMsg,    setSyncMsg]    = useState('')
  const [drafts,     setDrafts]     = useState<Record<string, string>>({})
  const [acting,     setActing]     = useState<string | null>(null)
  const [copied,     setCopied]     = useState<string | null>(null)

  const load = useCallback(async (filter?: FilterTab) => {
    setLoading(true)
    const q = filter && filter !== 'all' ? `&status=${filter}` : ''
    const res = await fetch(`/api/aria/reviews?${q}`).then(r => r.json()).catch(() => ({ reviews: [], stats: null }))
    setReviews(res.reviews ?? [])
    setStats(res.stats ?? null)
    // Pre-populate draft textareas with AI replies
    const initDrafts: Record<string, string> = {}
    for (const r of res.reviews ?? []) {
      if (r.ai_drafted_reply && !r.has_reply) initDrafts[r.id] = r.ai_drafted_reply
    }
    setDrafts(prev => ({ ...initDrafts, ...prev }))
    setLoading(false)
  }, [])

  useEffect(() => { load(tab) }, [load, tab])

  async function syncNow() {
    setSyncing(true); setSyncMsg('')
    const res = await fetch('/api/aria/sync-reviews', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).then(r => r.json()).catch(() => ({ error: 'Network error' }))
    if (res.error === 'not_configured') {
      setSyncMsg('⚠️ Google Places API key not configured')
    } else if (res.error === 'no_place_id') {
      setSyncMsg('⚠️ Add your Google Place ID in Settings first')
    } else if (res.ok) {
      setSyncMsg(`✅ ${res.reviews_synced} new review${res.reviews_synced !== 1 ? 's' : ''} synced`)
      load(tab)
    } else {
      setSyncMsg(`❌ ${res.error ?? res.message ?? 'Sync failed'}`)
    }
    setSyncing(false)
  }

  async function markReplied(id: string) {
    setActing(id)
    await fetch('/api/aria/reviews', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, has_reply: true, reply_text: drafts[id] ?? null }),
    }).catch(() => {})
    setReviews(rs => rs.map(r => r.id === id ? { ...r, has_reply: true, status: 'replied' } : r))
    setActing(null)
  }

  function copyDraft(id: string) {
    const text = drafts[id]
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
    }).catch(() => {})
  }

  // Setup card when no place_id
  if (!loading && stats && !stats.google_place_id) {
    return (
      <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '28px 32px', maxWidth: 700, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Reviews & Reputation</h1>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 16, padding: '32px 36px', marginTop: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>⭐</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px' }}>Connect Google Reviews</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.6 }}>
            Aria monitors your Google reviews and drafts personalised replies automatically. To get started:
          </p>
          <ol style={{ paddingLeft: 20, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 2, margin: '0 0 20px' }}>
            <li>Find your Google Place ID at{' '}
              <a href="https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder"
                target="_blank" rel="noopener" style={{ color: 'var(--violet)' }}>
                Google Place ID Finder
              </a>
            </li>
            <li>Go to <a href="/dashboard/settings" style={{ color: 'var(--violet)' }}>Settings → Business Profile → Google Reviews</a></li>
            <li>Paste your Place ID and click Sync Reviews</li>
          </ol>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Aria then auto-drafts replies for every review using AI.</p>
        </div>
      </div>
    )
  }

  const avgRating = stats?.average_rating ?? null
  const totalReviews = stats?.total_reviews ?? stats?.local_count ?? 0
  const lastSynced = stats?.last_synced ? timeAgo(stats.last_synced) : null
  const dist = stats?.distribution ?? {}
  const maxDist = Math.max(1, ...Object.values(dist))
  const newCount = reviews.filter(r => r.status === 'new' && !r.has_reply).length

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Reviews & Reputation</h1>
          {lastSynced && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Last synced {lastSynced}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {syncMsg && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{syncMsg}</span>}
          <button onClick={syncNow} disabled={syncing}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none',
              background: syncing ? 'var(--bg-elevated)' : '#4285F4',
              color: syncing ? 'var(--text-tertiary)' : '#fff',
              fontSize: 12, fontWeight: 700, cursor: syncing ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {syncing ? '⏳ Syncing…' : '🔄 Sync Now'}
          </button>
        </div>
      </div>

      {/* Rating summary */}
      {!loading && stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 16, padding: '24px 28px', marginBottom: 24 }}>
          <div style={{ textAlign: 'center', minWidth: 100 }}>
            <div style={{ fontSize: 48, fontWeight: 800, color: '#F59E0B', lineHeight: 1 }}>{avgRating?.toFixed(1) ?? '—'}</div>
            <div style={{ marginTop: 8 }}><StarRow rating={Math.round(avgRating ?? 0)} size={18} /></div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>{totalReviews} review{totalReviews !== 1 ? 's' : ''} on Google</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
            {[5,4,3,2,1].map(star => (
              <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', width: 14, textAlign: 'right' }}>{star}</span>
                <svg width={12} height={12} viewBox="0 0 24 24" fill="#F59E0B" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4, background: '#F59E0B', width: `${((dist[star] ?? 0) / maxDist) * 100}%`, transition: 'width 0.4s' }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', width: 16 }}>{dist[star] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--divider)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
              color: tab === t.key ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderBottom: tab === t.key ? '2px solid var(--violet)' : '2px solid transparent', marginBottom: -1 }}>
            {t.label}{t.key === 'new' && newCount > 0 ? ` (${newCount})` : ''}
          </button>
        ))}
      </div>

      {/* Review cards */}
      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
      ) : reviews.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✨</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>
            {tab === 'all' ? 'No reviews yet — click Sync Now to fetch from Google' :
             tab === 'new' ? 'No new reviews to reply to' :
             tab === 'replied' ? 'No replied reviews yet' : 'No negative reviews — great work!'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {reviews.map(review => (
            <div key={review.id} style={{
              background: 'var(--bg-surface)', border: '1px solid var(--divider)',
              borderRadius: 14, padding: '20px 22px',
              borderLeft: `3px solid ${review.rating != null && review.rating <= 2 ? '#EF4444' : review.has_reply ? '#7FB897' : 'var(--violet)'}`,
            }}>
              {/* Reviewer header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                {review.reviewer_avatar ? (
                  <img src={review.reviewer_avatar} alt="" width={36} height={36} style={{ borderRadius: '50%', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                    {(review.reviewer_name ?? '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{review.reviewer_name ?? 'Anonymous'}</span>
                    <StarRow rating={review.rating} />
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{timeAgo(review.review_date)}</span>
                    {review.sentiment && (
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 700,
                        background: `${SENTIMENT_COLOR[review.sentiment] ?? '#94A3B8'}18`,
                        color: SENTIMENT_COLOR[review.sentiment] ?? '#94A3B8' }}>
                        {review.sentiment}
                      </span>
                    )}
                    {review.has_reply && (
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 700,
                        background: 'rgba(127,184,151,0.12)', color: '#7FB897' }}>
                        Replied
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Review text */}
              {review.comment && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.6, paddingLeft: 48 }}>
                  &ldquo;{review.comment}&rdquo;
                </p>
              )}

              {/* AI draft reply */}
              {!review.has_reply && (
                <div style={{ paddingLeft: 48 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', display: 'block', marginBottom: 6 }}>
                    {drafts[review.id] ? 'AI-drafted reply (edit before copying):' : 'No AI draft yet'}
                  </label>
                  {drafts[review.id] !== undefined ? (
                    <>
                      <textarea
                        value={drafts[review.id]}
                        onChange={e => setDrafts(d => ({ ...d, [review.id]: e.target.value }))}
                        rows={3}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8,
                          background: 'var(--bg-elevated)', border: '1px solid var(--divider)',
                          color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit',
                          resize: 'vertical', outline: 'none', lineHeight: 1.5 }}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button onClick={() => copyDraft(review.id)}
                          style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--divider)',
                            background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {copied === review.id ? '✓ Copied!' : 'Copy Reply'}
                        </button>
                        <button onClick={() => markReplied(review.id)} disabled={acting === review.id}
                          style={{ padding: '7px 14px', borderRadius: 8, border: 'none',
                            background: 'var(--violet)', color: '#fff',
                            fontSize: 12, fontWeight: 700, cursor: acting === review.id ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit', opacity: acting === review.id ? 0.6 : 1 }}>
                          {acting === review.id ? '…' : 'Mark Replied'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
                      Sync reviews to generate AI draft replies automatically.
                    </p>
                  )}
                </div>
              )}

              {/* Already replied — show stored reply */}
              {review.has_reply && review.reply_text && (
                <div style={{ paddingLeft: 48, marginTop: 8, padding: '10px 14px 10px 48px',
                  background: 'rgba(127,184,151,0.06)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Your reply: </strong>{review.reply_text}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 28 }}>
        Reviews auto-synced daily at 6 AM. Replies are drafted by Aria AI — always review before posting to Google.
      </p>
    </div>
  )
}