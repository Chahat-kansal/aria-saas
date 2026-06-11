'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { AriaSays } from '@/components/dashboard/AriaSays'

interface Review { id: string; reviewer_name: string|null; reviewer_avatar: string|null; rating: number|null; comment: string|null; review_date: string|null; has_reply: boolean; reply_text: string|null; ai_drafted_reply: string|null; sentiment: string|null; status: string }
interface Stats { google_place_id: string|null; average_rating: number|null; total_reviews: number|null; last_synced: string|null; local_count: number; distribution: Record<number, number> }
interface Analytics { total: number; avg_rating: number; response_rate: number; unreplied: number; negative_unreplied: number; monthly_trend: Array<{month: string; count: number; avg_rating: number}>; platform_breakdown?: Array<{platform: string; avg_rating: number; count: number}> }
interface Reputation { score: number|null; trend?: string; grade?: string; top_action?: string }
interface CompResult { competitors: Array<{name: string; rating: number|null; review_count: number|null}>; analysis: {advantages: string[]; gaps: string[]; summary: string; action: string}; our_rating: number|null; our_reviews: number|null }
interface NpsStats { score: number|null; total: number; promoters: number; passives: number; detractors: number; promoter_count: number; passive_count: number; detractor_count: number; prev_score: number|null; recent_30_promoters: number; recent_30_passives: number; recent_30_detractors: number; recent: Array<{id: string; score: number; responded_at: string}> }
interface BizSettings { facebook_page_id: string; yelp_url: string; google_review_link: string; auto_review_requests: boolean }

const SC: Record<string, string> = { positive: '#22C55E', neutral: '#94A3B8', negative: '#EF4444' }
const GC: Record<string, string> = { A: '#22C55E', B: '#22C55E', C: '#F59E0B', D: '#EF4444', F: '#EF4444' }

function StarRow({ rating, size = 13 }: { rating: number|null; size?: number }) {
  const n = rating ?? 0
  return <span style={{ display: 'inline-flex', gap: 1 }}>{[1,2,3,4,5].map(s => (
    <svg key={s} width={size} height={size} viewBox="0 0 24 24" fill={s <= n ? '#F59E0B' : 'none'} stroke={s <= n ? '#F59E0B' : '#4B5563'} strokeWidth={1.5}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>))}
  </span>
}
function timeAgo(d: string|null) {
  if (!d) return ''
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  if (days === 0) return 'Today'; if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`; if (days < 30) return `${Math.floor(days/7)}w ago`
  return `${Math.floor(days/30)}mo ago`
}

export default function ReviewsPage() {
  const { business } = useBusinessContext()
  const [topTab, setTopTab] = useState<'reviews'|'competitors'|'surveys'|'settings'>('reviews')
  const [reviews, setReviews] = useState<Review[]>([])
  const [stats, setStats] = useState<Stats|null>(null)
  const [analytics, setAnalytics] = useState<Analytics|null>(null)
  const [reputation, setReputation] = useState<Reputation|null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all'|'new'|'replied'|'negative'>('all')
  const [platform, setPlatform] = useState('google')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [acting, setActing] = useState<string|null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [crisis, setCrisis] = useState(false)
  const [compData, setCompData] = useState<CompResult|null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [npsData, setNpsData] = useState<NpsStats|null>(null)
  const [sendingNps, setSendingNps] = useState(false)
  const [bizSettings, setBizSettings] = useState<BizSettings>({ facebook_page_id: '', yelp_url: '', google_review_link: '', auto_review_requests: false })
  const [savingSettings, setSavingSettings] = useState(false)

  const loadReviews = useCallback(async (t = tab, p = platform) => {
    if (!business?.id) return
    setLoading(true)
    const q = new URLSearchParams()
    if (t !== 'all') q.set('status', t)
    if (p !== 'all') q.set('platform', p)
    const res = await fetch('/api/aria/reviews?' + q).then(r => r.json()).catch(() => ({ reviews: [], stats: null }))
    setReviews(res.reviews ?? [])
    setStats(res.stats ?? null)
    const d: Record<string, string> = {}
    for (const r of res.reviews ?? []) { if (r.ai_drafted_reply && !r.has_reply) d[r.id] = r.ai_drafted_reply }
    setDrafts(prev => ({ ...d, ...prev }))
    const cut = new Date(Date.now() - 86400000).toISOString()
    const neg24 = (res.reviews ?? []).filter((r: Review) => r.review_date && r.review_date > cut && Number(r.rating ?? 5) <= 2)
    setCrisis(neg24.length >= 3)
    setLoading(false)
  }, [business?.id, tab, platform])

  useEffect(() => { loadReviews() }, [loadReviews])

  useEffect(() => {
    if (!business?.id) return
    fetch('/api/reviews/analytics').then(r => r.json()).then(setAnalytics).catch(() => {})
    fetch('/api/aria/reviews/reputation').then(r => r.json()).then(setReputation).catch(() => {})
    fetch('/api/aria/nps?business_id=' + business.id).then(r => r.json()).then(setNpsData).catch(() => {})
    fetch('/api/settings/business').then(r => r.json()).then(d => {
      if (d.business) setBizSettings({ facebook_page_id: d.business.facebook_page_id ?? '', yelp_url: d.business.yelp_url ?? '', google_review_link: d.business.google_review_link ?? '', auto_review_requests: !!d.business.auto_review_requests })
    }).catch(() => {})
  }, [business?.id])

  async function syncNow() {
    if (!business?.id) return
    setSyncing(true); setSyncMsg('')
    const res = await fetch('/api/aria/sync-reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: business.id }) }).then(r => r.json()).catch(() => ({ error: 'Network error' }))
    if (res.ok) { setSyncMsg(`✅ ${res.reviews_synced ?? 0} synced`); loadReviews() }
    else setSyncMsg(res.error === 'no_place_id' ? '⚠️ Connect Google in Settings' : `❌ ${res.error ?? 'Sync failed'}`)
    setSyncing(false)
  }

  async function publishReply(id: string) {
    setActing(id)
    await fetch('/api/aria/reviews', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, has_reply: true, reply_text: drafts[id] ?? null }) }).catch(() => {})
    setReviews(rs => rs.map(r => r.id === id ? { ...r, has_reply: true, reply_text: drafts[id] ?? null, status: 'replied' } : r))
    setActing(null)
  }

  async function analyzeCompetitors() {
    if (!business?.id) return
    setAnalyzing(true)
    const res = await fetch('/api/aria/competitor-review-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: business.id }) }).then(r => r.json()).catch(() => null)
    if (res) setCompData(res)
    setAnalyzing(false)
  }

  async function sendNps() {
    if (!business?.id) return
    setSendingNps(true)
    const res = await fetch('/api/aria/nps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: business.id }) }).then(r => r.json()).catch(() => null)
    if (res) setSyncMsg(`✅ NPS sent: ${res.sent} customers`)
    setSendingNps(false)
    fetch('/api/aria/nps?business_id=' + business.id).then(r => r.json()).then(setNpsData).catch(() => {})
  }

  async function saveSettings() {
    if (!business?.id) return
    setSavingSettings(true)
    await fetch('/api/settings/business', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bizSettings) }).catch(() => {})
    setSavingSettings(false)
  }

  const avgRating = stats?.average_rating ?? null
  const totalReviews = stats?.total_reviews ?? stats?.local_count ?? 0
  const newCount = reviews.filter(r => r.status === 'new' && !r.has_reply).length
  const inp = { background: 'var(--bg-elevated)', border: '1px solid var(--divider)', borderRadius: 8, padding: '9px 12px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const, width: '100%' }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '28px 32px' }}>
      <AriaSays businessId={business?.id ?? null} page="reviews" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Reviews & Reputation</h1>
          {stats?.last_synced && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Last synced {timeAgo(stats.last_synced)}</p>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {syncMsg && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{syncMsg}</span>}
          <button onClick={syncNow} disabled={syncing} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: syncing ? 'var(--bg-elevated)' : '#4285F4', color: syncing ? 'var(--text-tertiary)' : '#fff', fontSize: 12, fontWeight: 700, cursor: syncing ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {syncing ? '⏳ Syncing…' : '🔄 Sync Google'}
          </button>
        </div>
      </div>

      {/* Top tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--divider)', marginBottom: 20 }}>
        {(['reviews','competitors','surveys','settings'] as const).map(t => (
          <button key={t} onClick={() => setTopTab(t)}
            style={{ padding: '9px 18px', border: 'none', borderBottom: '2px solid ' + (topTab === t ? 'var(--violet)' : 'transparent'), background: 'transparent', color: topTab === t ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: 13, fontWeight: topTab === t ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize', transition: 'color 0.2s' }}>
            {t === 'reviews' ? `Reviews (${totalReviews})` : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* REVIEWS TAB */}
      {topTab === 'reviews' && (
        <>
          {crisis && <div style={{ marginBottom: 14, padding: '10px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', fontSize: 13, color: '#EF4444', fontWeight: 700 }}>⚠️ Crisis detected — 3+ negative reviews in the last 24 hours. Respond immediately.</div>}
          {analytics && analytics.negative_unreplied > 0 && !crisis && <div style={{ marginBottom: 14, padding: '10px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 13, color: '#EF4444' }}>⚠ {analytics.negative_unreplied} negative review{analytics.negative_unreplied !== 1 ? 's' : ''} without a reply.</div>}

          {/* Stats strip */}
          {analytics && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 18 }}>
              {[
                { label: 'Total reviews', v: analytics.total },
                { label: 'Avg rating', v: avgRating ? `${avgRating}★` : '—' },
                { label: 'Response rate', v: `${analytics.response_rate}%` },
                { label: 'Unreplied', v: analytics.unreplied },
                { label: 'Reputation', v: reputation?.score != null ? `${reputation.score} ${reputation.grade ?? ''}` : '—', color: GC[reputation?.grade ?? 'C'] },
              ].map((c, i) => (
                <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 12, padding: '12px 16px' }}>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 4px' }}>{c.label}</p>
                  <p style={{ fontSize: 20, fontWeight: 700, margin: 0, color: c.color }}>{c.v}</p>
                </div>
              ))}
            </div>
          )}

          {/* Multi-platform aggregation panel */}
          {analytics && (
            <div style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Platform Overview</p>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {(['google','facebook','yelp'] as const).map(plat => {
                  const pb = analytics.platform_breakdown?.find(p => p.platform === plat)
                  const platColor = plat === 'google' ? '#4285F4' : plat === 'facebook' ? '#1877F2' : '#FF1A1A'
                  const platLabel = plat.charAt(0).toUpperCase() + plat.slice(1)
                  return (
                    <div key={plat} style={{ flex: '1 1 140px', padding: '10px 14px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--divider)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: platColor, display: 'inline-block' }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{platLabel}</span>
                      </div>
                      {pb ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                            <span style={{ fontSize: 22, fontWeight: 800, color: platColor }}>{pb.avg_rating}</span>
                            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>★</span>
                          </div>
                          <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-base)', marginBottom: 4 }}>
                            <div style={{ width: (pb.avg_rating / 5 * 100) + '%', height: '100%', background: platColor, borderRadius: 2 }} />
                          </div>
                          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>{pb.count} review{pb.count !== 1 ? 's' : ''}</p>
                        </>
                      ) : (
                        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Not connected</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Platform filter */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {['google','facebook','yelp','all'].map(p => (
              <button key={p} onClick={() => { setPlatform(p); loadReviews(tab, p) }}
                style={{ padding: '5px 14px', borderRadius: 8, border: '1px solid ' + (platform === p ? '#4285F4' : 'var(--divider)'), background: platform === p ? 'rgba(66,133,244,0.1)' : 'transparent', color: platform === p ? '#4285F4' : 'var(--text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                {p === 'all' ? 'All Platforms' : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          {/* Sub-filter tabs */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--divider)', marginBottom: 16 }}>
            {(['all','new','replied','negative'] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); loadReviews(t, platform) }}
                style={{ padding: '8px 16px', border: 'none', borderBottom: '2px solid ' + (tab === t ? 'var(--violet)' : 'transparent'), background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: tab === t ? 700 : 400, color: tab === t ? 'var(--text-primary)' : 'var(--text-secondary)', marginBottom: -1 }}>
                {t.charAt(0).toUpperCase() + t.slice(1)}{t === 'new' && newCount > 0 ? ` (${newCount})` : ''}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div>
          ) : reviews.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
              {platform !== 'google' ? `No ${platform} reviews imported yet — add your ${platform} URL in Settings to connect.` : 'No reviews — click Sync Google above'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {reviews.map(review => (
                <div key={review.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: '16px 18px', borderLeft: review.rating != null && review.rating <= 2 ? '3px solid #EF4444' : review.has_reply ? '3px solid #7FB897' : '3px solid var(--violet)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                      {review.reviewer_avatar ? <img src={review.reviewer_avatar} alt="" width={32} height={32} style={{ borderRadius: '50%' }} /> : (review.reviewer_name ?? '?').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{review.reviewer_name ?? 'Anonymous'}</span>
                        <StarRow rating={review.rating} />
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{timeAgo(review.review_date)}</span>
                        {review.sentiment && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 700, color: SC[review.sentiment] ?? '#94A3B8', background: (SC[review.sentiment] ?? '#94A3B8') + '18' }}>{review.sentiment}</span>}
                        {review.has_reply && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 700, background: 'rgba(127,184,151,0.12)', color: '#7FB897' }}>Replied</span>}
                      </div>
                    </div>
                  </div>
                  {review.comment && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.6, paddingLeft: 42 }}>&ldquo;{review.comment}&rdquo;</p>}
                  {!review.has_reply && drafts[review.id] !== undefined && (
                    <div style={{ paddingLeft: 42 }}>
                      <textarea value={drafts[review.id]} onChange={e => setDrafts(d => ({ ...d, [review.id]: e.target.value }))} rows={3}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--divider)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button onClick={async () => { await navigator.clipboard.writeText(drafts[review.id] ?? '').catch(() => {}) }}
                          style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#7FB897', color: '#2D5240', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>📋 Copy</button>
                        {stats?.google_place_id && <a href={`https://search.google.com/local/writereview?placeid=${stats.google_place_id}`} target="_blank" rel="noreferrer"
                          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(66,133,244,0.3)', background: 'rgba(66,133,244,0.08)', color: '#4285F4', fontSize: 11, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>Open Google ↗</a>}
                        <button onClick={() => publishReply(review.id)} disabled={acting === review.id}
                          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, cursor: acting === review.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                          {acting === review.id ? '…' : '✓ Mark replied'}
                        </button>
                      </div>
                    </div>
                  )}
                  {review.has_reply && review.reply_text && (
                    <div style={{ paddingLeft: 42 }}>
                      <div style={{ padding: '8px 12px', background: 'rgba(127,184,151,0.06)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        <strong style={{ color: 'var(--text-primary)' }}>Your reply: </strong>{review.reply_text}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 20 }}>Reviews auto-synced daily. Aria drafts replies — review before publishing to Google.</p>
        </>
      )}

      {/* COMPETITORS TAB */}
      {topTab === 'competitors' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Competitor AI Benchmarking</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Compare your rating against local competitors. Manage competitors in the Competitors page.</p>
            </div>
            <button onClick={analyzeCompetitors} disabled={analyzing}
              style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: analyzing ? 'var(--bg-elevated)' : 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: analyzing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: analyzing ? 0.7 : 1 }}>
              {analyzing ? '🔍 Analysing...' : '🤖 Analyse vs Competitors'}
            </button>
          </div>

          {compData && (
            <>
              {/* Comparison table */}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: 'var(--bg-elevated)' }}>
                    {['Business','Rating','Reviews'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--divider)', background: 'rgba(139,92,246,0.04)' }}>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--violet)' }}>Your Business ⭐</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700 }}>{compData.our_rating ?? '—'}★</td>
                      <td style={{ padding: '12px 16px', fontSize: 13 }}>{compData.our_reviews ?? '—'}</td>
                    </tr>
                    {compData.competitors.map((c, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--divider)' }}>
                        <td style={{ padding: '12px 16px', fontSize: 13 }}>{c.name}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: c.rating != null && compData.our_rating != null && c.rating < compData.our_rating ? '#22C55E' : 'var(--text-primary)' }}>{c.rating != null ? `${c.rating}★` : '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{c.review_count ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* AI analysis */}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: '18px 20px' }}>
                <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🤖 Aria&apos;s Competitive Analysis</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>{compData.analysis.summary}</p>
                {compData.analysis.advantages.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#22C55E', marginBottom: 6, textTransform: 'uppercase' }}>Your advantages</p>
                    {compData.analysis.advantages.map((a, i) => <p key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '3px 0', paddingLeft: 12 }}>✓ {a}</p>)}
                  </div>
                )}
                {compData.analysis.gaps.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B', marginBottom: 6, textTransform: 'uppercase' }}>Areas to improve</p>
                    {compData.analysis.gaps.map((g, i) => <p key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '3px 0', paddingLeft: 12 }}>→ {g}</p>)}
                  </div>
                )}
                <div style={{ padding: '10px 14px', background: 'rgba(139,92,246,0.06)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Top action: </strong>{compData.analysis.action}
                </div>
              </div>
            </>
          )}
          {!compData && !analyzing && <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Click &ldquo;Analyse vs Competitors&rdquo; to benchmark your reputation.</div>}
        </div>
      )}

      {/* SURVEYS TAB */}
      {topTab === 'surveys' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>NPS Survey</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Net Promoter Score — how likely are customers to recommend you?</p>
            </div>
            <button onClick={sendNps} disabled={sendingNps}
              style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: sendingNps ? 'var(--bg-elevated)' : '#22C55E', color: '#fff', fontSize: 13, fontWeight: 700, cursor: sendingNps ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: sendingNps ? 0.7 : 1 }}>
              {sendingNps ? 'Sending...' : '📱 Send NPS Survey via SMS'}
            </button>
          </div>

          {npsData && npsData.total > 0 ? (
            <>
              {/* NPS Gauge */}
              <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 24, background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 16, padding: '24px 28px', marginBottom: 16 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1, color: npsData.score != null && npsData.score >= 50 ? '#22C55E' : npsData.score != null && npsData.score >= 0 ? '#F59E0B' : '#EF4444' }}>{npsData.score ?? '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>NPS Score</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Based on {npsData.total} response{npsData.total !== 1 ? 's' : ''}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
                  {[
                    { label: 'Promoters (9-10)', pct: npsData.promoters, count: npsData.promoter_count ?? 0, color: '#22C55E', trend30: npsData.recent_30_promoters ?? 0 },
                    { label: 'Passives (7-8)',   pct: npsData.passives,  count: npsData.passive_count ?? 0,  color: '#F59E0B', trend30: npsData.recent_30_passives ?? 0 },
                    { label: 'Detractors (0-6)', pct: npsData.detractors, count: npsData.detractor_count ?? 0, color: '#EF4444', trend30: npsData.recent_30_detractors ?? 0 },
                  ].map(s => (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 140, flexShrink: 0 }}>{s.label}</span>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: s.pct + '%', background: s.color, borderRadius: 4, transition: 'width 0.4s' }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: s.color, width: 36, textAlign: 'right' }}>{s.pct}%</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{s.count} total · {s.trend30} last 30d</span>
                    </div>
                  ))}
                  {npsData.prev_score !== null && npsData.score !== null && (
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      vs prior 30d: <strong style={{ color: npsData.score > npsData.prev_score ? '#22C55E' : npsData.score < npsData.prev_score ? '#EF4444' : 'var(--text-tertiary)' }}>
                        {npsData.score > npsData.prev_score ? '↑' : npsData.score < npsData.prev_score ? '↓' : '→'} {Math.abs(npsData.score - npsData.prev_score)} pts
                      </strong> (was {npsData.prev_score > 0 ? '+' : ''}{npsData.prev_score})
                    </p>
                  )}
                </div>
              </div>
              {/* Recent responses */}
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Recent Responses</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {npsData.recent.map(r => (
                  <div key={r.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, background: Number(r.score) >= 9 ? 'rgba(34,197,94,0.12)' : Number(r.score) >= 7 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)', color: Number(r.score) >= 9 ? '#22C55E' : Number(r.score) >= 7 ? '#F59E0B' : '#EF4444' }}>{r.score}</div>
                    <div style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>{Number(r.score) >= 9 ? 'Promoter' : Number(r.score) >= 7 ? 'Passive' : 'Detractor'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{timeAgo(r.responded_at)}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
              <p style={{ fontWeight: 700, marginBottom: 6 }}>No NPS responses yet</p>
              <p>Click &ldquo;Send NPS Survey via SMS&rdquo; to survey your recent customers. Responses received via SMS reply are tracked automatically.</p>
            </div>
          )}
        </div>
      )}

      {/* SETTINGS TAB */}
      {topTab === 'settings' && (
        <div style={{ maxWidth: 560 }}>
          <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 18 }}>Review Platform Settings</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { label: 'Google Review Link', key: 'google_review_link' as const, placeholder: 'https://search.google.com/local/writereview?placeid=...' },
              { label: 'Facebook Page ID or URL', key: 'facebook_page_id' as const, placeholder: 'https://www.facebook.com/yourbusiness' },
              { label: 'Yelp Business URL', key: 'yelp_url' as const, placeholder: 'https://www.yelp.com.au/biz/your-business' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>{f.label}</label>
                <input value={bizSettings[f.key] ?? ''} onChange={e => setBizSettings(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} style={inp} />
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 10 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>Auto Review Requests</p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Automatically SMS customers a review request 2h after a sale.</p>
              </div>
              <button onClick={() => setBizSettings(p => ({ ...p, auto_review_requests: !p.auto_review_requests }))}
                style={{ position: 'relative', width: 48, height: 26, borderRadius: 99, background: bizSettings.auto_review_requests ? '#22C55E' : 'var(--bg-elevated)', border: 'none', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 2, left: bizSettings.auto_review_requests ? 24 : 2, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
              </button>
            </div>
            <button onClick={saveSettings} disabled={savingSettings}
              style={{ padding: '11px 24px', borderRadius: 10, border: 'none', background: savingSettings ? 'var(--bg-elevated)' : 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: savingSettings ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: savingSettings ? 0.7 : 1, alignSelf: 'flex-start' }}>
              {savingSettings ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
