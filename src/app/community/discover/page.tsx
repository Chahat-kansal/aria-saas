'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, BadgeCheck, MapPin, Users, Sparkles } from 'lucide-react'
import { C, RADIUS, MAX_W, FONT_DISPLAY } from '../theme'

interface BusinessCard {
  id: string
  name: string | null
  industry: string | null
  suburb: string | null
  city: string | null
  logo_url: string | null
  community_verified: boolean | null
  community_bio: string | null
  followers: number
}

interface DiscoverResponse {
  recommended: BusinessCard[]
  nearby: BusinessCard[]
  has_follows: boolean
}

export default function CommunityDiscoverPage() {
  const [data, setData] = useState<DiscoverResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetch('/api/community/discover').then(r => r.json())
      setData(d)
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '20px 16px 24px' }}>
      <Link href="/community" prefetch={false} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.textMuted, marginBottom: 14, textDecoration: 'none' }}>
        <ChevronLeft size={14} /> Back
      </Link>

      <header style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.accent, margin: 0 }}>Discover</p>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '4px 0 0', fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em' }}>
          Local shops worth following
        </h1>
      </header>

      {loading ? (
        <SkeletonRow />
      ) : !data || (data.nearby.length === 0 && data.recommended.length === 0) ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', background: C.surface, borderRadius: RADIUS.lg, border: `1.5px dashed ${C.border}` }}>
          <Sparkles size={26} style={{ color: C.accent, opacity: 0.6, marginBottom: 10 }} />
          <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Nothing nearby yet</p>
          <p style={{ fontSize: 12, color: C.textMuted, margin: '6px 0 0' }}>As more local shops join Aria, you&apos;ll see them here.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {data.has_follows && data.recommended.length > 0 && (
            <section>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.accent, margin: '0 0 8px' }}>
                Recommended for you
              </p>
              <p style={{ fontSize: 12, color: C.textMuted, margin: '0 0 12px', lineHeight: 1.5 }}>
                Picked because they&apos;re in your area or similar to shops you already follow.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {data.recommended.map(b => <DiscoverCard key={b.id} biz={b} />)}
              </div>
            </section>
          )}

          <section>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.textMuted, margin: '0 0 12px' }}>
              {data.has_follows ? 'All local shops' : 'On Aria right now'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {data.nearby.map(b => <DiscoverCard key={b.id} biz={b} />)}
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

function DiscoverCard({ biz }: { biz: BusinessCard }) {
  return (
    <Link href={`/community/businesses/${biz.id}`} prefetch={false} style={{
      background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: RADIUS.lg,
      padding: 14, textDecoration: 'none', color: C.text,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: biz.logo_url ? `url(${biz.logo_url}) center/cover` : C.accentDeep,
          color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 16, border: `1.5px solid ${C.border}`, flexShrink: 0,
        }}>
          {!biz.logo_url && (biz.name?.[0] ?? '?')}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, margin: 0, display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{biz.name}</span>
            {biz.community_verified && <BadgeCheck size={12} style={{ color: C.accent, flexShrink: 0 }} />}
          </p>
          <p style={{ fontSize: 11, color: C.textMuted, margin: '2px 0 0', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            {(biz.suburb || biz.city) && <><MapPin size={10} /> {biz.suburb ?? biz.city}</>}
          </p>
        </div>
      </div>
      {biz.community_bio && (
        <p style={{ fontSize: 12, color: C.textDim, margin: 0, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{biz.community_bio}</p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 'auto' }}>
        <span style={{ fontSize: 10, color: C.textMuted, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <Users size={10} /> {biz.followers} {biz.followers === 1 ? 'follower' : 'followers'}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.accent }}>View →</span>
      </div>
    </Link>
  )
}

function SkeletonRow() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: RADIUS.lg, padding: 14 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.surfaceHi }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 12, width: '60%', background: C.surfaceHi, borderRadius: 4, marginBottom: 6 }} />
              <div style={{ height: 10, width: '40%', background: C.surfaceHi, borderRadius: 4 }} />
            </div>
          </div>
          <div style={{ height: 28, background: C.surfaceHi, borderRadius: 6 }} />
        </div>
      ))}
    </div>
  )
}
