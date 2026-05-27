'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { BadgeCheck, MapPin, Globe, Bell, BellOff, EyeOff, Eye, Heart, Loader2, X } from 'lucide-react'
import { C, RADIUS, MAX_W, FONT_DISPLAY } from '../../theme'
import { PostCard, type PostCardData } from '../../PostCard'

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
}
interface ProfileStats { followers: number; post_count: number; b2b_followers: number }
interface B2BFollow { id: string; name: string | null; logo_url: string | null }
interface ExistingFollow { consent_marketing: boolean; notifications_on: boolean; is_hidden: boolean }
interface ProfileResponse {
  business: BusinessProfile
  stats: ProfileStats
  recent_posts: Array<{
    id: string; post_type: string; title: string | null; body: string | null
    media_urls: string[]; media_type: string | null; published_at: string | null
    is_story: boolean; expires_at: string | null
  }>
  b2b_following: B2BFollow[]
}

export default function BusinessProfilePage() {
  const params = useParams<{ id: string }>()
  const businessId = params.id

  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [existing, setExisting] = useState<ExistingFollow | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState<'posts' | 'about'>('posts')
  const [busy, setBusy] = useState(false)
  const [showFollowPanel, setShowFollowPanel] = useState(false)
  const [consentMarketing, setConsentMarketing] = useState(false)
  const [notificationsOn, setNotificationsOn] = useState(true)
  const [nickname, setNickname] = useState('')

  const load = useCallback(async () => {
    if (!businessId) return
    try {
      const [pRes, fRes] = await Promise.all([
        fetch('/api/community/businesses/' + businessId + '/profile').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/community/follows').then(r => r.ok ? r.json() : { follows: [] }),
      ])
      if (!pRes || !pRes.business) { setNotFound(true); setLoading(false); return }
      setProfile(pRes)
      const f = (fRes.follows ?? []).find((x: { business_id: string }) => x.business_id === businessId)
      if (f) {
        setExisting({ consent_marketing: f.consent_marketing, notifications_on: f.notifications_on, is_hidden: f.is_hidden })
        setConsentMarketing(f.consent_marketing)
        setNotificationsOn(f.notifications_on)
      } else {
        setExisting(null)
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [businessId])

  useEffect(() => { load() }, [load])

  async function follow() {
    setBusy(true)
    await fetch('/api/community/follows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId,
        consent_marketing: consentMarketing,
        notifications_on: notificationsOn,
        nickname: nickname || undefined,
      }),
    })
    setShowFollowPanel(false)
    setBusy(false)
    load()
  }

  async function unfollow() {
    if (!confirm('Unfollow ' + (profile?.business.name ?? 'this business') + '?')) return
    setBusy(true)
    await fetch('/api/community/follows?business_id=' + businessId, { method: 'DELETE' })
    setBusy(false)
    load()
  }

  async function togglePref(key: 'notifications_on' | 'consent_marketing' | 'is_hidden', value: boolean) {
    if (!existing) return
    setExisting(prev => prev ? { ...prev, [key]: value } : prev)
    await fetch('/api/community/follows', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, [key]: value }),
    })
  }

  if (loading) {
    return (
      <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ height: 120, background: C.surfaceHi, borderRadius: RADIUS.lg, marginBottom: 14 }} />
        <div style={{ height: 14, width: '60%', background: C.surfaceHi, borderRadius: 4 }} />
      </main>
    )
  }

  if (notFound || !profile) {
    return (
      <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, fontFamily: FONT_DISPLAY, fontStyle: 'italic' }}>Business not found</h1>
        <p style={{ color: C.textMuted, marginTop: 8 }}>This shop may have left the network.</p>
        <Link href="/community" style={{ display: 'inline-block', marginTop: 20, color: C.accent }}>← Back to feed</Link>
      </main>
    )
  }

  const biz = profile.business
  const stats = profile.stats

  return (
    <main style={{ maxWidth: MAX_W, margin: '0 auto', paddingBottom: 24 }}>
      {/* Cover */}
      <div style={{
        height: 140, position: 'relative',
        background: biz.community_cover_url
          ? `url(${biz.community_cover_url}) center/cover`
          : `linear-gradient(135deg, ${C.accentDeep}, #1a3328)`,
      }}>
        <Link href="/community" prefetch={false} style={{
          position: 'absolute', top: 'calc(env(safe-area-inset-top, 8px) + 12px)', left: 12,
          width: 36, height: 36, borderRadius: '50%',
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', textDecoration: 'none',
        }}>
          ←
        </Link>
      </div>

      {/* Identity card */}
      <section style={{ padding: '0 16px', marginTop: -32, position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
          <div style={{
            width: 88, height: 88, borderRadius: '50%',
            background: biz.logo_url ? `url(${biz.logo_url}) center/cover` : C.accentDeep,
            color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 32, border: `4px solid ${C.bg}`,
            flexShrink: 0,
          }}>
            {!biz.logo_url && (biz.name?.[0] ?? '?')}
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: 6 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, fontFamily: FONT_DISPLAY, fontStyle: 'italic', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.15 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{biz.name}</span>
              {biz.community_verified && <BadgeCheck size={18} style={{ color: C.accent, flexShrink: 0 }} />}
            </h1>
            <p style={{ fontSize: 12, color: C.textMuted, margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              {(biz.suburb || biz.city) && <><MapPin size={11} /> {biz.suburb ?? biz.city}</>}
              {biz.industry && <><span style={{ opacity: 0.5 }}>·</span><span>{biz.industry}</span></>}
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 18, marginTop: 14, padding: '12px 0', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
          <Stat value={stats.followers} label="Followers" />
          <Stat value={stats.post_count} label="Posts" />
          {stats.b2b_followers > 0 && <Stat value={stats.b2b_followers} label="Connections" />}
        </div>

        {/* Action row */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {existing ? (
            <>
              <button onClick={() => togglePref('notifications_on', !existing.notifications_on)}
                style={primaryBtn(existing.notifications_on ? 'on' : 'off')}>
                {existing.notifications_on ? <><Bell size={14} /> Following</> : <><BellOff size={14} /> Muted</>}
              </button>
              <button onClick={() => togglePref('is_hidden', !existing.is_hidden)} style={ghostBtn()}>
                {existing.is_hidden ? <><Eye size={14} /> Unhide</> : <><EyeOff size={14} /> Hide posts</>}
              </button>
              <button onClick={unfollow} disabled={busy} style={ghostBtn(true)}>
                <X size={14} /> Unfollow
              </button>
            </>
          ) : (
            <button onClick={() => setShowFollowPanel(true)} disabled={busy} style={primaryBtn('on')}>
              <Heart size={14} /> Follow
            </button>
          )}
          {biz.website && (
            <a href={biz.website} target="_blank" rel="noopener noreferrer" style={ghostBtn()}>
              <Globe size={14} /> Website
            </a>
          )}
        </div>

        {/* Follow consent panel — only shown when initiating a follow */}
        {showFollowPanel && (
          <div style={{ marginTop: 14, padding: 16, background: C.surface, border: `1px solid ${C.border}`, borderRadius: RADIUS.lg }}>
            <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>What you&apos;re consenting to</p>
            <p style={{ fontSize: 12, color: C.textMuted, margin: '0 0 12px', lineHeight: 1.55 }}>
              Per-business consent — following {biz.name} does NOT let other businesses contact you.
            </p>
            <ConsentRow label="See their posts in my feed" hint="Always on for businesses you follow" value locked />
            <ConsentRow label="Notify me when they post" hint="Browser notifications — you can turn this off anytime"
              value={notificationsOn} onChange={setNotificationsOn} />
            <ConsentRow label="Marketing offers and promos" hint="Opt in to receive promotional content from this shop"
              value={consentMarketing} onChange={setConsentMarketing} />
            <input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="Nickname (optional)" maxLength={40}
              style={{ width: '100%', padding: '10px 12px', borderRadius: RADIUS.md, background: C.surfaceHi, border: `1px solid ${C.border}`, color: C.text, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginTop: 12, marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={follow} disabled={busy} style={{ flex: 1, padding: '12px', borderRadius: RADIUS.md, border: 'none', background: C.accent, color: '#0d0d14', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }}>
                {busy ? <Loader2 size={14} className="community-spin" /> : `Follow ${biz.name}`}
              </button>
              <button onClick={() => setShowFollowPanel(false)} style={{ padding: '12px 16px', borderRadius: RADIUS.md, border: `1px solid ${C.border}`, background: 'transparent', color: C.textMuted, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Tabs */}
      <nav style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, marginTop: 16 }}>
        {(['posts', 'about'] as const).map(t => {
          const active = tab === t
          return (
            <button key={t} onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '12px 0', background: 'transparent', border: 'none', cursor: 'pointer',
                color: active ? C.accent : C.textMuted, fontSize: 13, fontWeight: 700,
                borderBottom: `2px solid ${active ? C.accent : 'transparent'}`,
                fontFamily: 'inherit', textTransform: 'capitalize',
                minHeight: 44,
              }}>
              {t}
            </button>
          )
        })}
      </nav>

      {/* Tab content */}
      <section style={{ padding: '16px' }}>
        {tab === 'posts' ? (
          profile.recent_posts.length === 0 ? (
            <p style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', padding: 24, fontStyle: 'italic' }}>No posts yet.</p>
          ) : (
            profile.recent_posts.map(p => {
              const card: PostCardData = {
                id: p.id,
                business_id: biz.id,
                business: { name: biz.name, logo_url: biz.logo_url, community_verified: biz.community_verified, industry: biz.industry, suburb: biz.suburb, city: biz.city },
                post_type: p.post_type,
                title: p.title,
                body: p.body,
                media_urls: p.media_urls,
                media_type: p.media_type,
                published_at: p.published_at,
                counts: { like: 0, comment: 0, save: 0 },
                mine: { liked: false, saved: false },
              }
              return <PostCard key={p.id} post={card} showHide={false} />
            })
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {biz.community_bio && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.textMuted, margin: '0 0 6px' }}>About</p>
                <p style={{ fontSize: 14, color: C.text, margin: 0, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{biz.community_bio}</p>
              </div>
            )}
            {(biz.suburb || biz.city || biz.industry) && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.textMuted, margin: '0 0 6px' }}>Details</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, color: C.textDim }}>
                  {biz.industry && <div><strong style={{ color: C.text, fontWeight: 600 }}>Industry:</strong> {biz.industry}</div>}
                  {(biz.suburb || biz.city) && <div><strong style={{ color: C.text, fontWeight: 600 }}>Location:</strong> {biz.suburb ?? biz.city}</div>}
                  {biz.website && <div><strong style={{ color: C.text, fontWeight: 600 }}>Website:</strong> <a href={biz.website} target="_blank" rel="noopener noreferrer" style={{ color: C.accent }}>{biz.website.replace(/^https?:\/\//, '')}</a></div>}
                </div>
              </div>
            )}
            {biz.community_verified && (
              <div style={{ padding: 14, borderRadius: RADIUS.md, background: 'rgba(127,184,151,0.06)', border: `1px solid ${C.border}` }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.accent, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <BadgeCheck size={15} /> Verified local business
                </p>
                <p style={{ fontSize: 12, color: C.textMuted, margin: 0, lineHeight: 1.5 }}>
                  Aria has verified this is a real Australian small business.
                </p>
              </div>
            )}
            {profile.b2b_following.length > 0 && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.textMuted, margin: '0 0 8px' }}>Local connections</p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {profile.b2b_following.map(b => (
                    <Link key={b.id} href={`/community/businesses/${b.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: RADIUS.pill, background: C.surface, border: `1px solid ${C.border}`, color: C.text, textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: '50%',
                        background: b.logo_url ? `url(${b.logo_url}) center/cover` : C.accentDeep,
                        color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, flexShrink: 0,
                      }}>
                        {!b.logo_url && (b.name?.[0] ?? '?')}
                      </div>
                      {b.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  const fmt = (n: number) => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n)
  return (
    <div style={{ flex: 1 }}>
      <p style={{ fontSize: 18, fontWeight: 700, margin: 0, fontFamily: FONT_DISPLAY, fontStyle: 'italic' }}>{fmt(value)}</p>
      <p style={{ fontSize: 11, color: C.textMuted, margin: '2px 0 0', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</p>
    </div>
  )
}

function ConsentRow({ label, hint, value, onChange, locked }: { label: string; hint: string; value: boolean; onChange?: (v: boolean) => void; locked?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${C.border}`, minHeight: 56 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: C.text }}>{label}</p>
        <p style={{ fontSize: 11, color: C.textMuted, margin: '2px 0 0', lineHeight: 1.4 }}>{hint}</p>
      </div>
      <button type="button" role="switch" aria-checked={value} aria-label={label}
        disabled={locked}
        onClick={() => onChange?.(!value)}
        style={{
          position: 'relative', width: 42, height: 24, borderRadius: 24,
          background: value ? C.accent : 'rgba(255,255,255,0.12)',
          border: 'none', cursor: locked ? 'default' : 'pointer', transition: 'background 180ms',
          flexShrink: 0, opacity: locked ? 0.65 : 1,
        }}>
        <span style={{
          position: 'absolute', top: 2, left: value ? 20 : 2,
          width: 20, height: 20, borderRadius: '50%',
          background: '#fff', transition: 'left 180ms',
        }} />
      </button>
    </div>
  )
}

function primaryBtn(state: 'on' | 'off'): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '10px 16px', borderRadius: 999,
    background: state === 'on' ? C.accent : 'transparent',
    border: state === 'on' ? 'none' : `1px solid ${C.border}`,
    color: state === 'on' ? '#0d0d14' : C.text,
    fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 40,
    fontFamily: 'inherit',
  }
}

function ghostBtn(danger?: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '10px 14px', borderRadius: 999,
    background: 'transparent',
    border: `1px solid ${danger ? 'rgba(239,68,68,0.3)' : C.border}`,
    color: danger ? C.danger : C.textDim,
    fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 40,
    fontFamily: 'inherit', textDecoration: 'none',
  }
}
