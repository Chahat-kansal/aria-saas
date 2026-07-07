'use client'
import { useState, useEffect } from 'react'
import { CxTabBar } from '../CxTabBar'

const BG = '#14130f'
const INK = '#ffffff'
const INK_MUTED = 'rgba(255,255,255,0.5)'
const CARD = '#1c1c1a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const FD = "var(--font-display,'Cormorant',Georgia,serif)"
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"

export interface CxCategory {
  id: string
  name: string
  sort_order: number | null
}

export interface CxProduct {
  id: string
  name: string
  description: string | null
  price: number
  image_url: string | null
  category_id: string | null
  featured: boolean | null
  sort_order: number | null
}

// ── Header icons — lime outline ────────────────────────────────────────────
function IconSearch() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
      stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round"
      style={{ display: 'block', flexShrink: 0 }}>
      <circle cx="8" cy="8" r="5" />
      <path d="M12 12L16 16" />
    </svg>
  )
}

function IconScan() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
      stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round"
      style={{ display: 'block', flexShrink: 0 }}>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="11" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="11" width="5" height="5" rx="1" />
      <line x1="11" y1="11" x2="16" y2="11" />
      <line x1="16" y1="11" x2="16" y2="16" />
      <line x1="11" y1="14.5" x2="13.5" y2="14.5" />
    </svg>
  )
}

// ── Product list card ───────────────────────────────────────────────────────
function ProductRow({ product, slug, onAddCart }: {
  product: CxProduct
  slug: string
  onAddCart: (id: string) => void
}) {
  const orderUrl = '/menu/' + slug + '?item=' + product.id

  return (
    <div style={{
      display: 'flex', gap: 14,
      padding: 14, borderRadius: 20,
      background: CARD, marginBottom: 10,
    }}>
      {/* Photo — taps to ordering page */}
      <a
        href={orderUrl}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 88, height: 88, borderRadius: 14, flexShrink: 0, overflow: 'hidden',
          background: product.image_url
            ? ('url(' + product.image_url + ') center/cover no-repeat #222')
            : '#222',
          fontSize: 22, color: 'rgba(255,255,255,0.3)',
          textDecoration: 'none',
        }}
      >
        {!product.image_url && '☕'}
      </a>

      {/* Text column — name, desc, then price + add row */}
      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between',
      }}>
        <div>
          <p style={{
            fontFamily: FB, fontSize: 15, fontWeight: 700,
            margin: '0 0 4px', color: INK, lineHeight: 1.2,
          }}>
            {product.name}
          </p>
          {product.description && (
            <p style={{
              fontFamily: FB, fontSize: 12, color: INK_MUTED,
              margin: 0, lineHeight: 1.4,
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {product.description}
            </p>
          )}
        </div>

        {/* Price + lime "+" add button */}
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginTop: 10,
        }}>
          <p style={{ fontFamily: FB, fontSize: 16, fontWeight: 700, color: INK, margin: 0 }}>
            {'$' + (Number(product.price) || 0).toFixed(2)}
          </p>
          <button
            onClick={() => {
              onAddCart(product.id)
              if (typeof window !== 'undefined') {
                window.location.href = orderUrl
              }
            }}
            style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              background: ACCENT, color: ACCENT_TEXT,
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 700, lineHeight: 1,
              boxShadow: '0 0 16px 3px rgba(217,245,78,0.5), 0 2px 8px rgba(217,245,78,0.3)',
            }}
          >
            +
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export function CxMenuClient({ slug, bizName, logoUrl, categories, products }: {
  slug: string
  bizName: string
  logoUrl: string | null
  categories: CxCategory[]
  products: CxProduct[]
}) {
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [cartCount, setCartCount] = useState(0)

  // Persist cart count across navigation
  useEffect(() => {
    try {
      const saved = localStorage.getItem('aria_cart_' + slug)
      if (saved) setCartCount(parseInt(saved, 10) || 0)
    } catch { /* no localStorage */ }
  }, [slug])

  const addToCart = (productId: string) => {
    void productId
    setCartCount(c => {
      const n = c + 1
      try { localStorage.setItem('aria_cart_' + slug, String(n)) } catch { /* ok */ }
      return n
    })
  }

  const featured = products.find(p => p.featured)
  const filteredProducts = products.filter(p => {
    const matchesCat = !activeCat || p.category_id === activeCat
    const q = search.trim().toLowerCase()
    const matchesSearch = !q || p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)
    return matchesCat && matchesSearch
  })

  const showFeatured = !activeCat && !search && !!featured

  return (
    <div style={{ width: '100%', maxWidth: '28rem', margin: '0 auto', minHeight: '100dvh', background: BG, fontFamily: FB, color: INK, paddingBottom: 100 }}>
      <style>{`
        body { background: #14130f }
        *, *::before, *::after { box-sizing: border-box }
        .cx-cat-scroll::-webkit-scrollbar { display: none }
        .cx-search-input::placeholder { color: rgba(217,245,78,0.5) }
      `}</style>

      {/* ── Sticky header — dark surface ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: BG,
        paddingTop: 52, paddingBottom: 14, paddingLeft: 18, paddingRight: 18,
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        {/* Logo row + "Menu" title + search/scan pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          {/* Logo circle + biz name */}
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{
              width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
              background: logoUrl ? ('url(' + logoUrl + ') center/cover') : 'rgba(255,255,255,0.1)',
              border: '1.5px solid rgba(255,255,255,0.2)',
              boxShadow: '0 0 0 2px rgba(255,255,255,0.07)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: FB, fontSize: 14, fontWeight: 700, color: INK,
            }}>
              {!logoUrl && bizName[0]}
            </div>
            <p style={{
              fontFamily: FB, fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.6)',
              margin: 0, letterSpacing: '0.04em',
              maxWidth: 58, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {bizName}
            </p>
          </div>

          {/* "Menu" Cormorant italic */}
          <h1 style={{
            fontFamily: FD, fontStyle: 'italic', fontSize: 42, fontWeight: 600,
            margin: 0, color: INK, flex: 1, letterSpacing: '-0.01em',
          }}>
            Menu
          </h1>

          {/* Search + Scan pill — lime outline */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 0,
            border: '1.5px solid ' + ACCENT,
            borderRadius: 100,
            background: searchOpen ? 'rgba(217,245,78,0.12)' : 'transparent',
            boxShadow: '0 0 16px rgba(217,245,78,0.4)',
            overflow: 'hidden',
          }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px', cursor: 'pointer' }}
              onClick={() => setSearchOpen(s => !s)}
            >
              <IconSearch />
              {searchOpen && (
                <input
                  autoFocus
                  className="cx-search-input"
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search"
                  onClick={e => e.stopPropagation()}
                  style={{
                    background: 'none', border: 'none', outline: 'none',
                    fontFamily: FB, fontSize: 13, color: ACCENT,
                    width: 72, padding: 0,
                  }}
                />
              )}
              {searchOpen && search && (
                <button
                  onClick={e => { e.stopPropagation(); setSearch('') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: ACCENT, fontSize: 13, fontWeight: 700, lineHeight: 1 }}
                >
                  ✕
                </button>
              )}
            </div>
            <div style={{ width: 1, height: 18, background: 'rgba(217,245,78,0.35)', flexShrink: 0 }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 13px', cursor: 'pointer' }}>
              <IconScan />
            </div>
          </div>
        </div>

        {/* Category tabs — active = white + lime underline */}
        {categories.length > 0 && (
          <div className="cx-cat-scroll" style={{ display: 'flex', gap: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
            <button
              onClick={() => setActiveCat(null)}
              style={{
                flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 16px',
                fontFamily: FB, fontSize: 14, fontWeight: !activeCat ? 700 : 400,
                color: !activeCat ? INK : INK_MUTED,
                borderBottom: !activeCat ? ('2.5px solid ' + ACCENT) : '2.5px solid transparent',
                whiteSpace: 'nowrap',
              }}
            >
              All
            </button>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveCat(activeCat === c.id ? null : c.id)}
                style={{
                  flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
                  padding: '8px 16px',
                  fontFamily: FB, fontSize: 14, fontWeight: activeCat === c.id ? 700 : 400,
                  color: activeCat === c.id ? INK : INK_MUTED,
                  borderBottom: activeCat === c.id ? ('2.5px solid ' + ACCENT) : '2.5px solid transparent',
                  whiteSpace: 'nowrap',
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Featured hero card — tall image + name/price overlay + desc below ── */}
      {showFeatured && featured && (
        <>
          <a
            href={'/menu/' + slug}
            style={{
              display: 'block', margin: '16px 18px 0', borderRadius: 20,
              overflow: 'hidden', textDecoration: 'none', position: 'relative',
              height: 240,
              boxShadow: '0 0 24px 2px rgba(217,245,78,0.35), 0 4px 24px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{
              position: 'absolute', inset: 0,
              background: featured.image_url
                ? ('url(' + featured.image_url + ') center/cover no-repeat #1a1814')
                : '#1a1814',
            }} />
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.3) 55%, transparent 100%)',
            }} />
            <div style={{ position: 'absolute', bottom: 18, left: 18 }}>
              <p style={{
                fontFamily: FD, fontStyle: 'italic', fontSize: 34,
                color: '#fff', margin: '0 0 4px', fontWeight: 600, lineHeight: 1.1,
              }}>
                {featured.name}
              </p>
              <p style={{ fontFamily: FB, fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 }}>
                {'$' + (Number(featured.price) || 0).toFixed(2)}
              </p>
            </div>
          </a>

          {/* Description on dark surface below the card */}
          {featured.description && (
            <p style={{
              fontFamily: FB, fontSize: 13, color: INK_MUTED,
              margin: '12px 18px 0', lineHeight: 1.5, padding: 0,
            }}>
              {featured.description}
            </p>
          )}
        </>
      )}

      {/* ── Product list ── */}
      <div style={{ padding: '14px 18px 0' }}>
        {filteredProducts.length > 0 ? (
          filteredProducts.map(p => (
            <ProductRow key={p.id} product={p} slug={slug} onAddCart={addToCart} />
          ))
        ) : (
          <div style={{ textAlign: 'center', padding: '48px 0', color: INK_MUTED }}>
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 20, margin: 0 }}>
              {search ? ('No items match "' + search + '"') : 'No items yet'}
            </p>
          </div>
        )}
      </div>

      <CxTabBar slug={slug} active="menu" dark cartCount={cartCount} />
    </div>
  )
}