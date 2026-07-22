'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { BadgeCheck, ExternalLink, Bell, BellOff, EyeOff, Eye, Loader2, ArrowLeft, MoreHorizontal, X, Phone, MapPin } from 'lucide-react'
import { PALETTE, BORDER, RADIUS, MAX_W } from '../../theme'
import { LevelChip } from '../../LevelChip'

interface YourStatus {
  level: number; name: string; nextAt: number | null; progress: number; lifetimePoints: number
  unlockedPerkPoints: number | null; upcomingLevelName: string | null; upcomingPerkPoints: number | null
}

interface BusinessProfile {
  id: string
  name: string
  industry: string | null
  city: string | null
  suburb: string | null
  logo_url: string | null
  website: string | null
  community_verified: boolean | null
  community_bio: string | null
  community_cover_url: string | null
  phone: string | null
  address: string | null
  email: string | null
}
interface ProfileStats { followers: number; post_count: number; b2b_followers: number; rating?: number | null }
interface StoryHighlight { id: string; title: string; cover_url: string | null; post_ids: string[]; display_order: number }
interface ExistingFollow { consent_marketing: boolean; notifications_on: boolean; is_hidden: boolean }
interface RecentPost {
  id: string; post_type: string; title: string | null; body: string | null
  media_urls: string[]; media_type: string | null; published_at: string | null
  is_story: boolean; expires_at: string | null
}
interface ProfileResponse {
  business: BusinessProfile
  stats: ProfileStats
  recent_posts: RecentPost[]
  highlights: StoryHighlight[]
  b2b_following: Array<{ id: string; name: string | null; logo_url: string | null }>
  your_status: YourStatus | null
}

function safeHostname(url: string | null): string | null {
  if (!url) return null
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return null }
}

export default function BusinessProfilePage() {
  const params = useParams<{ id: string }>()
  const businessId = params.id

  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [existing, setExisting] = useState<ExistingFollow | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState<'posts' | 'reels' | 'menu' | 'reviews'>('posts')
  const [reels, setReels] = useState<Array<{ id: string; video_url: string | null; thumbnail_url: string | null; title: string | null }> | null>(null)
  const [busy, setBusy] = useState(false)
  const [showFollowPanel, setShowFollowPanel] = useState(false)
  const [consentMarketing, setConsentMarketing] = useState(false)
  const [notificationsOn, setNotificationsOn] = useState(true)
  const [nickname, setNickname] = useState('')
  const [accountLinked, setAccountLinked] = useState(false)
  const [showVerifyNudge, setShowVerifyNudge] = useState(false)

  const load = useCallback(async () => {
    if (!businessId) return
    try {
      const [pRes, fRes, linkRes] = await Promise.all([
        fetch('/api/community/businesses/' + businessId + '/profile').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/community/follows').then(r => r.ok ? r.json() : { follows: [] }),
        fetch('/api/community/account-link').then(r => r.ok ? r.json() : null).catch(() => null),
      ])
      setAccountLinked(!!(linkRes?.linked || linkRes?.has_auth))
      if (!pRes || !pRes.business) { setNotFound(true); setLoading(false); return }
      setProfile(pRes)
      const f = (fRes.follows ?? []).find((x: { business_id: string }) => x.business_id === businessId)
      if (f) {
        setExisting({ consent_marketing: f.consent_marketing, notifications_on: f.notifications_on, is_hidden: f.is_hidden })
        setConsentMarketing(f.consent_marketing)
        setNotificationsOn(f.notifications_on)
      } else setExisting(null)
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [businessId])

  useEffect(() => { load() }, [load])

  // CX-1-P3: lazy-load this business's reels the first time the Reels tab is opened.
  useEffect(() => {
    if (tab === 'reels' && reels === null && businessId) {
      fetch('/api/community/reels?business_id=' + businessId).then(r => r.ok ? r.json() : { reels: [] })
        .then(d => setReels(d.reels ?? [])).catch(() => setReels([]))
    }
  }, [tab, reels, businessId])

  async function follow() {
    setBusy(true)
    await fetch('/api/community/follows', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, consent_marketing: consentMarketing, notifications_on: notificationsOn, nickname: nickname || undefined }),
    })
    setShowFollowPanel(false); setBusy(false)
    // CX-1-P1: AFTER following (never before — never gate the follow), nudge anonymous members to
    // verify so they can be notified. Linked members already keep follows across devices.
    if (!accountLinked) setShowVerifyNudge(true)
    load()
  }
  async function unfollow() {
    if (!confirm('Unfollow ' + (profile?.business.name ?? 'this shop') + '?')) return
    setBusy(true)
    await fetch('/api/community/follows?business_id=' + businessId, { method: 'DELETE' })
    setBusy(false); load()
  }
  async function togglePref(key: 'notifications_on' | 'is_hidden', value: boolean) {
    if (!existing) return
    setExisting(prev => prev ? { ...prev, [key]: value } : prev)
    await fetch('/api/community/follows', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, [key]: value }),
    })
  }

  if (loading) {
    return (
      <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: 16 }}>
        <div style={{ height: 96, background: PALETTE.surfaceAlt, borderRadius: RADIUS.lg, marginBottom: 40 }} />
        <div style={{ height: 18, width: '50%', background: PALETTE.surfaceAlt, borderRadius: 4 }} />
      </main>
    )
  }
  if (notFound || !profile) {
    return (
      <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>shop not found</h1>
        <p style={{ color: PALETTE.inkSoft, marginTop: 8, fontWeight: 500 }}>This shop may have left the network.</p>
        <Link href="/community" style={{ display: 'inline-block', marginTop: 20, color: PALETTE.ink, fontWeight: 700 }}>← back to feed</Link>
      </main>
    )
  }

  const biz = profile.business
  const stats = profile.stats
  const host = safeHostname(biz.website)
  const tagline = `a ${biz.industry ?? 'local shop'}${biz.suburb || biz.city ? ' in ' + (biz.suburb ?? biz.city) : ''}`
  const ratingDisplay = stats.rating != null ? Number(stats.rating).toFixed(1) : '—'
  const fmtK = (n: number) => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n)

  return (
    <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '12px 16px 24px' }}>
      {/* Top bar — back + menu, no title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Link href="/community" prefetch={false} aria-label="Back" style={iconRound}>
          <ArrowLeft size={18} color={PALETTE.ink} />
        </Link>
        <button aria-label="More" style={{ ...iconRound, cursor: 'pointer' }}>
          <MoreHorizontal size={18} color={PALETTE.ink} />
        </button>
      </div>

      {/* CX-1-P1: post-follow verify nudge — shown AFTER following, only for anonymous members */}
      {showVerifyNudge && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: PALETTE.surface, border: BORDER, borderRadius: RADIUS.lg, padding: '12px 14px', marginBottom: 12 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>🔔</span>
          <p style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: PALETTE.ink, margin: 0, lineHeight: 1.4 }}>
            Following {biz.name}! <Link href="/community/me" style={{ color: PALETTE.ink, fontWeight: 800, textDecoration: 'underline' }}>Verify your account</Link> to get notified when they post.
          </p>
          <button onClick={() => setShowVerifyNudge(false)} aria-label="Dismiss"
            style={{ background: 'transparent', border: 'none', color: PALETTE.inkSoft, cursor: 'pointer', fontSize: 18, padding: 4, lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>
      )}

      {/* Hero banner */}
      <div style={{
        position: 'relative', height: 96, borderRadius: RADIUS.lg, overflow: 'hidden',
        border: BORDER,
        background: biz.community_cover_url
          ? `url(${biz.community_cover_url}) center/cover`
          : `radial-gradient(120% 120% at 20% 10%, ${PALETTE.accent}55, transparent 55%), ${PALETTE.ink}`,
      }}>
        <span style={{ position: 'absolute', left: 14, bottom: 12, fontSize: 11, fontWeight: 700, color: PALETTE.surface, letterSpacing: '-0.01em' }}>
          {tagline}
        </span>
      </div>

      {/* Avatar + follow/message — overlap hero by -32px */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: -32, padding: '0 4px', position: 'relative', zIndex: 2 }}>
        <div style={{
          width: 64, height: 64, borderRadius: RADIUS.lg,
          background: biz.logo_url ? `url(${biz.logo_url}) center/cover` : PALETTE.ink,
          color: PALETTE.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 26, border: `3px solid ${PALETTE.surface}`, flexShrink: 0,
        }}>
          {!biz.logo_url && (biz.name?.[0]?.toLowerCase() ?? '?')}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {existing ? (
            <button onClick={() => togglePref('notifications_on', !existing.notifications_on)} style={existing.notifications_on ? limePill : whitePill}>
              {existing.notifications_on ? <><Bell size={13} /> following</> : <><BellOff size={13} /> muted</>}
            </button>
          ) : (
            <button onClick={() => setShowFollowPanel(true)} disabled={busy} style={limePill}>+ follow</button>
          )}
          <Link href={`/community/dm/${businessId}`} prefetch={false} style={whitePill}>message</Link>
        </div>
      </div>

      {/* Name + tagline + bio */}
      <div style={{ marginTop: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.03em', margin: 0, display: 'flex', alignItems: 'center', gap: 6, color: PALETTE.ink }}>
          {(biz.name ?? '').toLowerCase()}
          {biz.community_verified && <BadgeCheck size={16} color={PALETTE.ink} />}
        </h1>
        <p style={{ fontSize: 10, fontWeight: 500, color: PALETTE.inkSoft, margin: '4px 0 0' }}>{tagline}</p>
        {biz.community_bio && (
          <p style={{ fontSize: 10, fontWeight: 500, color: PALETTE.ink, margin: '8px 0 0', lineHeight: 1.5, opacity: 0.85, whiteSpace: 'pre-wrap' }}>{biz.community_bio}</p>
        )}

      </div>

      {/* CX-OWNER-TRUST-2 — consolidated contact row (website + phone + address). Shown only when ≥1 exists. */}
      {((biz.website && host) || biz.phone || biz.address) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          {biz.website && host && (
            <a href={biz.website} target="_blank" rel="noopener noreferrer" style={contactPill}>
              <ExternalLink size={13} style={{ flexShrink: 0 }} /> {host}
            </a>
          )}
          {biz.phone && (
            <a href={`tel:${biz.phone.replace(/\s+/g, '')}`} style={contactPill}>
              <Phone size={13} style={{ flexShrink: 0 }} /> {biz.phone}
            </a>
          )}
          {biz.address && (
            <a href={`https://maps.google.com/?q=${encodeURIComponent([biz.address, biz.suburb, biz.city].filter(Boolean).join(', '))}`}
              target="_blank" rel="noopener noreferrer" style={contactPill}>
              <MapPin size={13} style={{ flexShrink: 0 }} /> {biz.address}
            </a>
          )}
        </div>
      )}

      {/* Stats strip — rating on lime, others surface-alt */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 16 }}>
        <StatCard value={fmtK(stats.followers)} label="followers" />
        <StatCard value={ratingDisplay} label="★ rating" lime />
        <StatCard value={fmtK(stats.post_count)} label="posts" />
      </div>

      {/* CX-GAME-LEAN — your status at this shop. Only rendered when the viewer resolves to a real
          loyalty customer of this business (see loyalty-link.ts) — never a fabricated L1. */}
      {profile.your_status && (
        <Link href={`/community/businesses/${businessId}/leaderboard`} prefetch={false} style={{
          display: 'block', marginTop: 14, padding: '12px 14px', textDecoration: 'none',
          background: PALETTE.surface, border: BORDER, borderRadius: RADIUS.lg,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <LevelChip level={{ level: profile.your_status.level, name: profile.your_status.name }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: PALETTE.ink }}>{profile.your_status.lifetimePoints} pts lifetime</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: PALETTE.ink }}>leaderboard →</span>
          </div>
          <div style={{ height: 5, background: PALETTE.surfaceAlt, borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.round(profile.your_status.progress * 100)}%`, background: PALETTE.accent }} />
          </div>
          <p style={{ fontSize: 10, color: PALETTE.inkSoft, margin: '6px 0 0' }}>
            {profile.your_status.nextAt != null
              ? `${profile.your_status.nextAt - profile.your_status.lifetimePoints} pts to the next level`
              : 'Top level reached'}
          </p>
          {/* CX-GAME-2 — real award only: a perk chip appears only once actually issued (never a
              "you unlocked X" claim before the ledger has really paid it out). */}
          {profile.your_status.unlockedPerkPoints != null && (
            <p style={{ fontSize: 10, fontWeight: 700, color: PALETTE.ink, margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
              🎁 Level {profile.your_status.level} unlocked — +{profile.your_status.unlockedPerkPoints} bonus points
            </p>
          )}
          {profile.your_status.upcomingLevelName && profile.your_status.upcomingPerkPoints != null && (
            <p style={{ fontSize: 10, color: PALETTE.inkSoft, margin: '4px 0 0' }}>
              Next: {profile.your_status.upcomingLevelName} unlocks +{profile.your_status.upcomingPerkPoints} bonus points
            </p>
          )}
        </Link>
      )}

      {/* CX-OWNER-TRUST-2 — story highlights (owner-curated). Hidden entirely when none exist. */}
      {profile.highlights && profile.highlights.length > 0 && (
        <div className="community-hide-scroll" style={{ display: 'flex', gap: 14, overflowX: 'auto', marginTop: 16, paddingBottom: 2 }}>
          {profile.highlights.map(h => {
            const circle = (
              <div style={{
                width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
                background: h.cover_url ? `url(${h.cover_url}) center/cover` : PALETTE.accent,
                border: `1.5px solid ${PALETTE.ink}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: PALETTE.ink, fontWeight: 800, fontSize: 22,
              }}>
                {!h.cover_url && (h.title?.[0]?.toUpperCase() ?? '★')}
              </div>
            )
            const label = (
              <span style={{ fontSize: 11, fontWeight: 600, color: PALETTE.ink, marginTop: 5, maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>{h.title}</span>
            )
            const inner = (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 64, flexShrink: 0 }}>
                {circle}{label}
              </div>
            )
            return h.post_ids && h.post_ids.length > 0
              ? <Link key={h.id} href={`/community/posts/${h.post_ids[0]}`} prefetch={false} style={{ textDecoration: 'none' }}>{inner}</Link>
              : <div key={h.id}>{inner}</div>
          })}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 24, marginTop: 18, borderBottom: `1.5px solid ${PALETTE.surfaceAlt}` }}>
        {(['posts', 'reels', 'menu', 'reviews'] as const).map(t => {
          const active = tab === t
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '0 0 10px', fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em',
              color: active ? PALETTE.ink : PALETTE.inkSoft,
              borderBottom: active ? `2px solid ${PALETTE.ink}` : '2px solid transparent',
              marginBottom: -1.5, fontFamily: 'inherit',
            }}>{t}</button>
          )
        })}
      </div>

      {/* Content */}
      <div style={{ marginTop: 14 }}>
        {tab === 'posts' ? (
          profile.recent_posts.length === 0 ? (
            <p style={{ fontSize: 12, color: PALETTE.inkSoft, textAlign: 'center', padding: 28, fontWeight: 500 }}>no posts yet.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
              {profile.recent_posts.map(p => {
                const media = p.media_urls?.[0]
                return (
                  <Link key={p.id} href={'/community/posts/' + p.id} prefetch={false} style={{ display: 'block', position: 'relative', aspectRatio: '1', borderRadius: 9, overflow: 'hidden', background: PALETTE.ink, border: BORDER }}>
                    {media ? (
                      (p.media_type === 'video' || p.media_type === 'reel')
                        ? <video src={media} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        // eslint-disable-next-line @next/next/no-img-element
                        : <img src={media} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: PALETTE.accent, fontSize: 11, fontWeight: 600, padding: 6, textAlign: 'center', lineHeight: 1.3 }}>
                        {(p.title ?? p.body ?? '').slice(0, 36)}
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>
          )
        ) : tab === 'reels' ? (
          reels === null ? (
            <p style={{ fontSize: 12, color: PALETTE.inkSoft, textAlign: 'center', padding: 28, fontWeight: 500 }}>loading reels…</p>
          ) : reels.length === 0 ? (
            <p style={{ fontSize: 12, color: PALETTE.inkSoft, textAlign: 'center', padding: 28, fontWeight: 500 }}>No reels yet.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
              {reels.map(r => (
                <Link key={r.id} href={'/community/posts/' + r.id} prefetch={false} style={{ display: 'block', position: 'relative', aspectRatio: '9/16', borderRadius: 9, overflow: 'hidden', background: PALETTE.ink, border: BORDER }}>
                  {r.video_url ? (
                    <video src={r.video_url} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : r.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: PALETTE.accent, fontSize: 11, fontWeight: 600, padding: 6, textAlign: 'center', lineHeight: 1.3 }}>{(r.title ?? '').slice(0, 36)}</div>
                  )}
                  <span style={{ position: 'absolute', bottom: 6, right: 6, color: '#fff', fontSize: 13, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>▶</span>
                </Link>
              ))}
            </div>
          )
        ) : tab === 'menu' ? (
          <div style={{ textAlign: 'center', padding: 28 }}>
            <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em', margin: 0 }}>see what they sell</p>
            <Link href={`/community/market`} prefetch={false} style={{ ...limePill, display: 'inline-flex', marginTop: 12 }}>browse marketplace →</Link>
          </div>
        ) : (
          <p style={{ fontSize: 12, color: PALETTE.inkSoft, textAlign: 'center', padding: 28, fontWeight: 500 }}>reviews are coming soon.</p>
        )}
      </div>

      {existing && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1.5px solid ${PALETTE.surfaceAlt}`, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => togglePref('is_hidden', !existing.is_hidden)} style={whitePill}>
            {existing.is_hidden ? <><Eye size={13} /> unhide posts</> : <><EyeOff size={13} /> hide posts</>}
          </button>
          <button onClick={unfollow} disabled={busy} style={{ ...whitePill, color: PALETTE.live, borderColor: PALETTE.live }}>unfollow</button>
        </div>
      )}

      {/* Follow consent sheet */}
      {showFollowPanel && (
        <div onClick={() => setShowFollowPanel(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.45)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: PALETTE.surface, width: '100%', maxWidth: MAX_W, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, border: BORDER, borderBottom: 'none', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <p style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>follow {(biz.name ?? '').toLowerCase()}</p>
              <button onClick={() => setShowFollowPanel(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}><X size={18} color={PALETTE.ink} /></button>
            </div>
            <p style={{ fontSize: 11, fontWeight: 500, color: PALETTE.inkSoft, margin: '0 0 14px', lineHeight: 1.5 }}>
              Per-shop consent — following {(biz.name ?? 'them').toLowerCase()} does NOT let other shops contact you.
            </p>
            <ConsentRow label="see their posts in my feed" sub="always on" value locked />
            <ConsentRow label="notify me when they post" sub="browser notifications — off anytime" value={notificationsOn} onChange={setNotificationsOn} />
            <ConsentRow label="marketing offers" sub="opt in to promos" value={consentMarketing} onChange={setConsentMarketing} />
            <input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="nickname (optional)" maxLength={40}
              style={{ width: '100%', padding: '11px 14px', borderRadius: RADIUS.md, background: PALETTE.surfaceAlt, border: BORDER, color: PALETTE.ink, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', fontWeight: 500, margin: '12px 0' }} />
            <button onClick={follow} disabled={busy} style={{ ...limePill, width: '100%', justifyContent: 'center', minHeight: 46, fontSize: 14 }}>
              {busy ? <Loader2 size={15} className="community-spin" /> : '+ follow'}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

function StatCard({ value, label, lime }: { value: string; label: string; lime?: boolean }) {
  return (
    <div style={{
      background: lime ? PALETTE.accent : PALETTE.surfaceAlt,
      border: lime ? BORDER : 'none',
      borderRadius: 12, padding: '9px 7px', textAlign: 'center',
    }}>
      <p style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.03em', margin: 0, color: PALETTE.ink }}>{value}</p>
      <p style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: lime ? PALETTE.ink : PALETTE.inkSoft, margin: '3px 0 0' }}>{label}</p>
    </div>
  )
}

function ConsentRow({ label, sub, value, onChange, locked }: { label: string; sub: string; value: boolean; onChange?: (v: boolean) => void; locked?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', minHeight: 50 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: PALETTE.ink }}>{label}</p>
        <p style={{ fontSize: 10, fontWeight: 500, color: PALETTE.inkSoft, margin: '2px 0 0' }}>{sub}</p>
      </div>
      <button type="button" role="switch" aria-checked={value} aria-label={label} disabled={locked}
        onClick={() => onChange?.(!value)}
        style={{ position: 'relative', width: 42, height: 24, borderRadius: 24, background: value ? PALETTE.accent : PALETTE.surfaceAlt, border: BORDER, cursor: locked ? 'default' : 'pointer', flexShrink: 0, opacity: locked ? 0.6 : 1 }}>
        <span style={{ position: 'absolute', top: 1.5, left: value ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: PALETTE.ink, transition: 'left 180ms' }} />
      </button>
    </div>
  )
}

const iconRound: React.CSSProperties = {
  width: 36, height: 36, borderRadius: '50%', border: BORDER, background: PALETTE.surface,
  display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', cursor: 'pointer',
}
const limePill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  background: PALETTE.accent, color: PALETTE.ink, border: BORDER, borderRadius: RADIUS.pill,
  fontSize: 12, fontWeight: 700, padding: '8px 16px', cursor: 'pointer', minHeight: 38, textDecoration: 'none', fontFamily: 'inherit',
}
const whitePill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  background: PALETTE.surface, color: PALETTE.ink, border: BORDER, borderRadius: RADIUS.pill,
  fontSize: 12, fontWeight: 700, padding: '8px 16px', cursor: 'pointer', minHeight: 38, textDecoration: 'none', fontFamily: 'inherit',
}
// CX-OWNER-TRUST-2 — contact pill (outline, same family as whitePill; truncates long values).
const contactPill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: PALETTE.surface, color: PALETTE.ink, border: BORDER, borderRadius: RADIUS.pill,
  fontSize: 11, fontWeight: 700, padding: '7px 13px', cursor: 'pointer', minHeight: 36, textDecoration: 'none', fontFamily: 'inherit',
  maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}
