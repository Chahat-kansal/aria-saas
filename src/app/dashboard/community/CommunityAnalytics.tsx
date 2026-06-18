'use client'
import { Eye, Heart, MessageCircle, Film, Send, Sparkles, Image as ImageIcon, CalendarClock, Clock, Video, type LucideIcon } from 'lucide-react'

export interface CommunityAnalyticsData {
  followers_total: number
  followers_this_week: number
  followers_last_week: number
  follower_growth: Array<{ date: string; count: number }>
  reach_total: number
  reach_this_week: number
  total_likes: number
  total_comments: number
  total_shares: number
  engagement_rate: number
  top_posts: Array<{ id: string; title: string | null; post_type: string; media_urls: string[]; published_at: string | null; views: number; likes: number; comments: number; shares: number }>
  best_times: Array<{ day: number; hour: number; count: number }>
}

type Theme = Record<string, string>

const TYPE_ICON: Record<string, LucideIcon> = {
  update: Send, offer: Sparkles, new_stock: ImageIcon, event: CalendarClock, reel: Film, video: Video, story: Clock,
}

// Heatmap order: Mon → Sun (DB day index: 0=Sun). 4 readable slots instead of 24 columns.
const HEAT_DAYS = [{ i: 1, l: 'Mon' }, { i: 2, l: 'Tue' }, { i: 3, l: 'Wed' }, { i: 4, l: 'Thu' }, { i: 5, l: 'Fri' }, { i: 6, l: 'Sat' }, { i: 0, l: 'Sun' }]
const SLOTS = [
  { label: 'Morning', test: (h: number) => h >= 6 && h < 12 },
  { label: 'Arvo', test: (h: number) => h >= 12 && h < 17 },
  { label: 'Evening', test: (h: number) => h >= 17 && h < 21 },
  { label: 'Night', test: (h: number) => h >= 21 || h < 6 },
]

export function CommunityAnalytics({ data, c, font }: { data: CommunityAnalyticsData; c: Theme; font: string }) {
  const cardStyle: React.CSSProperties = { background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 16 }
  const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 700, margin: '0 0 12px', color: c.text, letterSpacing: '-0.01em' }
  const pill = (label: string): React.CSSProperties => ({ fontSize: 10, fontWeight: 700, color: c.dim, background: c.surfaceHi, border: `1px solid ${c.border}`, borderRadius: 999, padding: '4px 10px', textTransform: 'uppercase', letterSpacing: '0.06em' })

  const followerDelta = data.followers_this_week
  const deltaColor = followerDelta > 0 ? c.green : followerDelta < 0 ? c.red : c.dim
  const deltaText = followerDelta > 0 ? `+${followerDelta} this week` : followerDelta < 0 ? `${followerDelta} this week` : 'no change this week'

  // ── Follower growth line chart (pure SVG, 14 pts) ──
  const W = 300, H = 70, PAD = 6
  const pts = data.follower_growth
  const maxY = Math.max(1, ...pts.map(p => p.count))
  const allZero = pts.every(p => p.count === 0)
  const linePts = pts.map((p, i) => {
    const x = PAD + (i * (W - PAD * 2)) / Math.max(1, pts.length - 1)
    const y = H - PAD - (p.count / maxY) * (H - PAD * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  // ── Best-times grid: sum engagement per (day, slot) ──
  const heat: Record<string, number> = {}
  let heatMax = 0
  for (const d of HEAT_DAYS) {
    for (let s = 0; s < SLOTS.length; s++) {
      const total = data.best_times
        .filter(b => b.day === d.i && SLOTS[s].test(b.hour))
        .reduce((sum, b) => sum + b.count, 0)
      heat[`${d.i}-${s}`] = total
      if (total > heatMax) heatMax = total
    }
  }
  const heatAllZero = heatMax === 0

  return (
    <div style={{ marginBottom: 20, fontFamily: font }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: c.text, letterSpacing: '-0.01em' }}>community stats</h2>
        <span style={pill('last 30 days')}>last 30 days</span>
      </div>

      {/* Stats row — 3 cards */}
      <div className="community-analytics-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <div style={cardStyle}>
          <p style={{ fontSize: 10, fontWeight: 700, color: c.dim, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>followers</p>
          <p style={{ fontSize: 26, fontWeight: 700, color: c.text, margin: '6px 0 0', letterSpacing: '-0.02em' }}>{data.followers_total.toLocaleString()}</p>
          <p style={{ fontSize: 11, fontWeight: 700, color: deltaColor, margin: '4px 0 0' }}>{deltaText}</p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: 10, fontWeight: 700, color: c.dim, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>reach</p>
          <p style={{ fontSize: 26, fontWeight: 700, color: c.text, margin: '6px 0 0', letterSpacing: '-0.02em' }}>{data.reach_total.toLocaleString()}</p>
          <p style={{ fontSize: 11, color: c.dim, margin: '4px 0 0' }}>this week: {data.reach_this_week.toLocaleString()}</p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: 10, fontWeight: 700, color: c.dim, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>engagement</p>
          <p style={{ fontSize: 26, fontWeight: 700, color: c.green, margin: '6px 0 0', letterSpacing: '-0.02em' }}>{data.engagement_rate}%</p>
          <p style={{ fontSize: 11, color: c.dim, margin: '4px 0 0' }}>likes {data.total_likes} · comments {data.total_comments} · shares {data.total_shares}</p>
        </div>
      </div>

      {/* Follower growth chart */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <p style={sectionTitle}>follower growth</p>
        {allZero ? (
          <p style={{ fontSize: 12, color: c.dim, margin: '8px 0', textAlign: 'center' }}>Start posting to grow your followers.</p>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="80" preserveAspectRatio="none" role="img" aria-label="Follower growth, last 14 days">
            <polyline points={linePts} fill="none" stroke={c.green} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((p, i) => {
              const x = PAD + (i * (W - PAD * 2)) / Math.max(1, pts.length - 1)
              const y = H - PAD - (p.count / maxY) * (H - PAD * 2)
              return <circle key={i} cx={x} cy={y} r={1.6} fill={c.green} />
            })}
          </svg>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ fontSize: 9, color: c.dim }}>{pts[0]?.date.slice(5)}</span>
          <span style={{ fontSize: 9, color: c.dim }}>{pts[pts.length - 1]?.date.slice(5)}</span>
        </div>
      </div>

      {/* Top posts */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <p style={sectionTitle}>top posts this week</p>
        {data.top_posts.length === 0 ? (
          <p style={{ fontSize: 12, color: c.dim, margin: '8px 0' }}>No posts yet — create your first post below.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.top_posts.map(p => {
              const Icon = TYPE_ICON[p.post_type] ?? Send
              const cover = p.media_urls?.[0]
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 10, background: c.surfaceHi, border: `1px solid ${c.border}`, flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {cover
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <Icon size={18} color={c.green} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: c.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || p.post_type}</p>
                    <span style={{ fontSize: 9, fontWeight: 700, color: c.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{p.post_type.replace('_', ' ')}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {[{ Icon: Eye, n: p.views }, { Icon: Heart, n: p.likes }, { Icon: MessageCircle, n: p.comments }].map((chip, i) => (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: c.sage, background: 'rgba(127,184,151,0.16)', borderRadius: 999, padding: '3px 8px' }}>
                        <chip.Icon size={11} /> {chip.n}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Best times heatmap */}
      <div style={cardStyle}>
        <p style={sectionTitle}>best times to post</p>
        {heatAllZero ? (
          <p style={{ fontSize: 12, color: c.dim, margin: '8px 0' }}>Post regularly to see your peak engagement times.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `40px repeat(${SLOTS.length}, 1fr)`, gap: 4, alignItems: 'center' }}>
            <span />
            {SLOTS.map(s => <span key={s.label} style={{ fontSize: 9, fontWeight: 700, color: c.dim, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</span>)}
            {HEAT_DAYS.map(d => (
              <Row key={d.i}>
                <span style={{ fontSize: 10, fontWeight: 700, color: c.dim }}>{d.l}</span>
                {SLOTS.map((s, si) => {
                  const v = heat[`${d.i}-${si}`] ?? 0
                  const op = v === 0 ? 0 : 0.18 + 0.82 * (v / heatMax)
                  return (
                    <div key={si} title={`${d.l} ${s.label}: ${v}`} style={{ height: 26, borderRadius: 6, border: `1px solid ${c.border}`, background: v === 0 ? c.surfaceHi : `rgba(127,184,151,${op.toFixed(2)})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {v > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: c.sage }}>{v}</span>}
                    </div>
                  )
                })}
              </Row>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Grid rows render as contents so each cell participates in the parent grid.
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'contents' }}>{children}</div>
}
