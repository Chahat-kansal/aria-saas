'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Search, Store, MessageCircle, BadgeCheck, MapPin } from 'lucide-react'
import { C, RADIUS, MAX_W, FONT_DISPLAY } from '../theme'

interface Listing {
  id: string
  business_id: string
  title: string
  description: string | null
  price: number | null
  media_urls: string[]
  category: string | null
  created_at: string
  business: { name: string | null; logo_url: string | null; community_verified: boolean | null; suburb: string | null; city: string | null } | null
}

export default function MarketplacePage() {
  const [listings, setListings] = useState<Listing[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [committed, setCommitted] = useState('')
  const sentinelRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const url = '/api/community/marketplace' + (q ? '?q=' + encodeURIComponent(q) : '')
      const d = await fetch(url).then(r => r.json())
      setListings(d.listings ?? [])
      setCursor(d.next_cursor ?? null)
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { load(committed) }, [load, committed])

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setCommitted(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const url = '/api/community/marketplace?before=' + encodeURIComponent(cursor) + (committed ? '&q=' + encodeURIComponent(committed) : '')
      const d = await fetch(url).then(r => r.json())
      setListings(prev => [...prev, ...(d.listings ?? [])])
      setCursor(d.next_cursor ?? null)
    } catch (e) { console.error(e) }
    setLoadingMore(false)
  }, [cursor, loadingMore, committed])

  useEffect(() => {
    if (!sentinelRef.current || !cursor) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) loadMore() }, { rootMargin: '300px' })
    obs.observe(sentinelRef.current)
    return () => obs.disconnect()
  }, [cursor, loadMore])

  return (
    <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '20px 16px 24px' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.accent, margin: 0 }}>Marketplace</p>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '4px 0 0', fontFamily: FONT_DISPLAY, fontStyle: 'italic', letterSpacing: '-0.01em' }}>
            Local shops, real things
          </h1>
        </div>
        <Link href="/community/market/chats" prefetch={false} style={{
          width: 40, height: 40, borderRadius: '50%',
          background: C.surface, border: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.text, textDecoration: 'none', flexShrink: 0,
        }} title="My chats">
          <MessageCircle size={18} />
        </Link>
      </header>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: C.textMuted }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search products, descriptions…"
          style={{
            width: '100%', padding: '11px 14px 11px 40px',
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: RADIUS.pill,
            color: C.text, fontSize: 14, outline: 'none', fontFamily: 'inherit',
            minHeight: 44, boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Grid */}
      {loading && listings.length === 0 ? (
        <GridSkeleton />
      ) : listings.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', background: C.surface, borderRadius: RADIUS.lg, border: `1px dashed ${C.border}` }}>
          <Store size={28} style={{ color: C.accent, opacity: 0.6, marginBottom: 10 }} />
          <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>{committed ? 'No matches.' : 'No listings yet.'}</p>
          <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>{committed ? 'Try a broader search term.' : 'Local shops will list things here soon.'}</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {listings.map(l => <ListingCard key={l.id} listing={l} />)}
          </div>
          {cursor && (
            <div ref={sentinelRef} style={{ textAlign: 'center', padding: 20 }}>
              <span style={{ fontSize: 12, color: C.textMuted }}>{loadingMore ? 'Loading…' : 'Scroll for more'}</span>
            </div>
          )}
        </>
      )}
    </main>
  )
}

function ListingCard({ listing }: { listing: Listing }) {
  const cover = listing.media_urls?.[0]
  return (
    <Link href={`/community/market/${listing.id}`} prefetch={false} style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: RADIUS.lg,
      overflow: 'hidden',
      textDecoration: 'none',
      color: C.text,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ width: '100%', aspectRatio: '1', background: '#000', position: 'relative' }}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt={listing.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted }}>
            <Store size={28} />
          </div>
        )}
      </div>
      <div style={{ padding: 10 }}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{listing.title}</p>
        {listing.price !== null && (
          <p style={{ fontSize: 14, fontWeight: 700, color: C.accent, margin: '4px 0 0' }}>A${Number(listing.price).toFixed(2)}</p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
          <span style={{ fontSize: 11, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {listing.business?.name}
            {listing.business?.community_verified && <BadgeCheck size={11} style={{ color: C.accent, flexShrink: 0 }} />}
          </span>
        </div>
        {(listing.business?.suburb || listing.business?.city) && (
          <p style={{ fontSize: 10, color: C.textMuted, margin: '3px 0 0', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <MapPin size={9} /> {listing.business?.suburb ?? listing.business?.city}
          </p>
        )}
      </div>
    </Link>
  )
}

function GridSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ background: C.surface, borderRadius: RADIUS.lg, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          <div style={{ width: '100%', aspectRatio: '1', background: C.surfaceHi }} />
          <div style={{ padding: 10 }}>
            <div style={{ height: 12, background: C.surfaceHi, borderRadius: 4, marginBottom: 6 }} />
            <div style={{ height: 10, width: '50%', background: C.surfaceHi, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  )
}
