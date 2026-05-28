'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Search, BadgeCheck, MapPin, Store, ChevronLeft } from 'lucide-react'
import { C, RADIUS, MAX_W, FONT_DISPLAY } from '../theme'

interface BizHit { id: string; name: string | null; industry: string | null; suburb: string | null; city: string | null; logo_url: string | null; community_verified: boolean | null }
interface ListingHit {
  id: string; business_id: string; title: string; description: string | null; price: number | null
  media_urls: string[]; category: string | null; created_at: string
  businesses: { name: string | null; logo_url: string | null; community_verified: boolean | null; suburb: string | null; city: string | null } | null
}

export default function CommunitySearchPage() {
  const [q, setQ] = useState('')
  const [committed, setCommitted] = useState('')
  const [tab, setTab] = useState<'all' | 'business' | 'listing'>('all')
  const [businesses, setBusinesses] = useState<BizHit[]>([])
  const [listings, setListings] = useState<ListingHit[]>([])
  const [loading, setLoading] = useState(false)

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setCommitted(q.trim()), 320)
    return () => clearTimeout(t)
  }, [q])

  const run = useCallback(async (s: string, t: typeof tab) => {
    if (s.length < 2) { setBusinesses([]); setListings([]); return }
    setLoading(true)
    try {
      const r = await fetch('/api/community/search?q=' + encodeURIComponent(s) + '&type=' + t).then(r => r.json())
      setBusinesses(r.businesses ?? [])
      setListings(r.listings ?? [])
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { run(committed, tab) }, [committed, tab, run])

  return (
    <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '20px 16px 24px' }}>
      <Link href="/community" prefetch={false} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.textMuted, marginBottom: 14, textDecoration: 'none' }}>
        <ChevronLeft size={14} /> Back
      </Link>

      <header style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.accent, margin: 0 }}>Search</p>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '4px 0 0', fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em' }}>
          Find local shops + products
        </h1>
      </header>

      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: C.textMuted }} />
        <input
          autoFocus
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Shop name, suburb, product…"
          style={{
            width: '100%', padding: '12px 14px 12px 40px',
            background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: RADIUS.pill,
            color: C.text, fontSize: 15, outline: 'none', fontFamily: 'inherit',
            minHeight: 44, boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Type chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {(['all', 'business', 'listing'] as const).map(t => {
          const active = tab === t
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '8px 14px', borderRadius: RADIUS.pill,
              border: `1px solid ${active ? C.accent : C.border}`,
              background: active ? 'rgba(127,184,151,0.1)' : 'transparent',
              color: active ? C.accent : C.textMuted,
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              textTransform: 'capitalize', minHeight: 36,
            }}>
              {t === 'all' ? 'Everything' : t === 'business' ? 'Shops' : 'Products'}
            </button>
          )
        })}
      </div>

      {/* Results */}
      {committed.length < 2 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: C.textMuted, fontSize: 13, lineHeight: 1.5 }}>
          Type at least 2 characters to search.<br />
          Try a suburb, an industry (cafe, liquor), or a product name.
        </div>
      ) : loading ? (
        <p style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', padding: 24 }}>Searching…</p>
      ) : (businesses.length === 0 && listings.length === 0) ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', background: C.surface, borderRadius: RADIUS.lg, border: `1.5px dashed ${C.border}` }}>
          <Search size={26} style={{ color: C.textMuted, opacity: 0.5, marginBottom: 10 }} />
          <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Nothing matched &quot;{committed}&quot;</p>
          <p style={{ fontSize: 12, color: C.textMuted, margin: '6px 0 0' }}>Try a shorter or simpler term.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Shops */}
          {(tab === 'all' || tab === 'business') && businesses.length > 0 && (
            <section>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.textMuted, margin: '0 0 10px' }}>Shops ({businesses.length})</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {businesses.map(b => <BusinessRow key={b.id} biz={b} />)}
              </div>
            </section>
          )}

          {/* Products */}
          {(tab === 'all' || tab === 'listing') && listings.length > 0 && (
            <section>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.textMuted, margin: '0 0 10px' }}>Marketplace ({listings.length})</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {listings.map(l => <ListingTile key={l.id} listing={l} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  )
}

function BusinessRow({ biz }: { biz: BizHit }) {
  return (
    <Link href={`/community/businesses/${biz.id}`} prefetch={false} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: 12,
      background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: RADIUS.lg,
      textDecoration: 'none', color: C.text,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        background: biz.logo_url ? `url(${biz.logo_url}) center/cover` : C.accentDeep,
        color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 18, border: `1.5px solid ${C.border}`, flexShrink: 0,
      }}>
        {!biz.logo_url && (biz.name?.[0] ?? '?')}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 700, margin: 0, display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{biz.name}</span>
          {biz.community_verified && <BadgeCheck size={13} style={{ color: C.accent, flexShrink: 0 }} />}
        </p>
        <p style={{ fontSize: 12, color: C.textMuted, margin: '2px 0 0', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {(biz.suburb || biz.city) && <><MapPin size={11} /> {biz.suburb ?? biz.city}</>}
          {biz.industry && <><span style={{ opacity: 0.5 }}>·</span><span>{biz.industry}</span></>}
        </p>
      </div>
    </Link>
  )
}

function ListingTile({ listing }: { listing: ListingHit }) {
  const cover = listing.media_urls?.[0]
  return (
    <Link href={`/community/market/${listing.id}`} prefetch={false} style={{
      background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: RADIUS.lg,
      overflow: 'hidden', textDecoration: 'none', color: C.text,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ width: '100%', aspectRatio: '1', background: '#000', position: 'relative' }}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt={listing.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted }}>
            <Store size={26} />
          </div>
        )}
      </div>
      <div style={{ padding: 10 }}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{listing.title}</p>
        {listing.price !== null && (
          <p style={{ fontSize: 14, fontWeight: 700, color: C.accent, margin: '4px 0 0' }}>A${Number(listing.price).toFixed(2)}</p>
        )}
        <p style={{ fontSize: 11, color: C.textMuted, margin: '6px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {listing.businesses?.name}
        </p>
      </div>
    </Link>
  )
}
