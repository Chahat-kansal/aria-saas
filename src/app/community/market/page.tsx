'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Search, Store, MessageCircle } from 'lucide-react'
import { PALETTE, BORDER, RADIUS, MAX_W } from '../theme'

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
  const [category, setCategory] = useState<string>('all')
  const [allCategories, setAllCategories] = useState<string[]>([])
  const sentinelRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (q: string, cat: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (cat && cat !== 'all') params.set('category', cat)
      const d = await fetch('/api/community/marketplace?' + params.toString()).then(r => r.json())
      const list: Listing[] = d.listings ?? []
      setListings(list)
      setCursor(d.next_cursor ?? null)
      // Build the category strip from whatever's loaded (only on the unfiltered "all" pass)
      if (cat === 'all' && !q) {
        const cats = Array.from(new Set(list.map(l => l.category).filter((c): c is string => !!c))).slice(0, 6)
        setAllCategories(cats)
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { load(committed, category) }, [load, committed, category])

  useEffect(() => {
    const t = setTimeout(() => setCommitted(search.trim()), 350)
    return () => clearTimeout(t)
  }, [search])

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({ before: cursor })
      if (committed) params.set('q', committed)
      if (category !== 'all') params.set('category', category)
      const d = await fetch('/api/community/marketplace?' + params.toString()).then(r => r.json())
      setListings(prev => [...prev, ...(d.listings ?? [])])
      setCursor(d.next_cursor ?? null)
    } catch (e) { console.error(e) }
    setLoadingMore(false)
  }, [cursor, loadingMore, committed, category])

  useEffect(() => {
    if (!sentinelRef.current || !cursor) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) loadMore() }, { rootMargin: '300px' })
    obs.observe(sentinelRef.current)
    return () => obs.disconnect()
  }, [cursor, loadMore])

  const chips = ['all', ...allCategories]

  return (
    <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '20px 16px 24px' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', margin: 0, color: PALETTE.ink }}>shop local.</h1>
          <p style={{ fontSize: 11, fontWeight: 500, color: PALETTE.inkSoft, margin: '3px 0 0' }}>
            {loading ? 'loading…' : `${listings.length} product${listings.length === 1 ? '' : 's'} near you`}
          </p>
        </div>
        <Link href="/community/market/chats" prefetch={false} aria-label="My chats" style={{
          width: 40, height: 40, borderRadius: '50%', background: PALETTE.surface, border: BORDER,
          display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', flexShrink: 0,
        }}>
          <MessageCircle size={18} color={PALETTE.ink} />
        </Link>
      </header>

      {/* Search — surface-alt, 14px radius */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: PALETTE.inkSoft }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search products"
          style={{
            width: '100%', padding: '12px 14px 12px 40px',
            background: PALETTE.surfaceAlt, border: 'none', borderRadius: 14,
            color: PALETTE.ink, fontSize: 14, fontWeight: 500, outline: 'none', fontFamily: 'inherit',
            minHeight: 44, boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Category chips */}
      <div className="community-hide-scroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 16, paddingBottom: 2 }}>
        {chips.map(c => {
          const active = category === c
          return (
            <button key={c} onClick={() => setCategory(c)} style={{
              flexShrink: 0,
              background: active ? PALETTE.ink : PALETTE.surfaceAlt,
              color: active ? PALETTE.accent : PALETTE.ink,
              border: 'none', borderRadius: RADIUS.pill,
              fontSize: 10, fontWeight: 700, padding: '8px 14px', cursor: 'pointer',
              fontFamily: 'inherit', textTransform: 'lowercase', minHeight: 34,
            }}>{c}</button>
          )
        })}
      </div>

      {/* Grid — 2 col, 7px gap */}
      {loading && listings.length === 0 ? (
        <GridSkeleton />
      ) : listings.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', background: PALETTE.surface, borderRadius: RADIUS.xl, border: BORDER }}>
          <Store size={26} color={PALETTE.ink} style={{ marginBottom: 10 }} />
          <p style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>{committed || category !== 'all' ? 'no matches.' : 'no listings yet.'}</p>
          <p style={{ fontSize: 12, fontWeight: 500, color: PALETTE.inkSoft, margin: 0 }}>{committed || category !== 'all' ? 'try a broader filter.' : 'local shops will list things here soon.'}</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 7 }}>
            {listings.map(l => <ListingCard key={l.id} listing={l} />)}
          </div>
          {cursor && (
            <div ref={sentinelRef} style={{ textAlign: 'center', padding: 20 }}>
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: PALETTE.inkSoft }}>{loadingMore ? 'loading…' : 'scroll for more'}</span>
            </div>
          )}
        </>
      )}
    </main>
  )
}

function ListingCard({ listing }: { listing: Listing }) {
  const cover = listing.media_urls?.[0]
  const metaBits = [listing.business?.name, listing.business?.suburb ?? listing.business?.city].filter(Boolean)
  return (
    <Link href={`/community/market/${listing.id}`} prefetch={false} style={{
      background: PALETTE.surface, border: BORDER, borderRadius: RADIUS.md,
      overflow: 'hidden', textDecoration: 'none', color: PALETTE.ink, display: 'flex', flexDirection: 'column',
    }}>
      {/* 90px hero */}
      <div style={{ width: '100%', height: 90, background: PALETTE.ink, position: 'relative' }}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt={listing.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: PALETTE.accent }}>
            <Store size={24} />
          </div>
        )}
      </div>
      <div style={{ padding: '9px 10px 11px' }}>
        <p style={{ fontSize: 10, fontWeight: 600, margin: 0, lineHeight: 1.35, color: PALETTE.ink, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{listing.title}</p>
        {listing.price !== null && (
          <p style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.03em', color: PALETTE.ink, margin: '4px 0 0' }}>${Number(listing.price).toFixed(Number(listing.price) % 1 === 0 ? 0 : 2)}</p>
        )}
        {metaBits.length > 0 && (
          <p style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: PALETTE.inkSoft, margin: '6px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {metaBits.join(' · ')}
          </p>
        )}
      </div>
    </Link>
  )
}

function GridSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 7 }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ background: PALETTE.surface, borderRadius: RADIUS.md, border: BORDER, overflow: 'hidden' }}>
          <div style={{ width: '100%', height: 90, background: PALETTE.surfaceAlt }} />
          <div style={{ padding: '9px 10px 11px' }}>
            <div style={{ height: 10, background: PALETTE.surfaceAlt, borderRadius: 4, marginBottom: 6 }} />
            <div style={{ height: 14, width: '40%', background: PALETTE.surfaceAlt, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  )
}
