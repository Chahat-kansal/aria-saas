'use client'
import { useState } from 'react'
import { CxTabBar } from '../CxTabBar'

const BG = '#14130f'
const INK = '#ffffff'
const INK_MUTED = 'rgba(255,255,255,0.5)'
const CARD = 'rgba(255,255,255,0.07)'
const CARD_BORDER = 'rgba(255,255,255,0.09)'
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

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" style={{ display: 'block', flexShrink: 0 }}>
      <circle cx="7" cy="7" r="4.5"/>
      <path d="M10.5 10.5L14 14"/>
    </svg>
  )
}

function IconScan() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" style={{ display: 'block', flexShrink: 0 }}>
      <rect x="2" y="2" width="4" height="4" rx="0.5"/>
      <rect x="10" y="2" width="4" height="4" rx="0.5"/>
      <rect x="2" y="10" width="4" height="4" rx="0.5"/>
      <line x1="10" y1="10" x2="14" y2="10"/>
      <line x1="14" y1="10" x2="14" y2="14"/>
      <line x1="10" y1="13" x2="12" y2="13"/>
    </svg>
  )
}

function ProductRow({ product, slug }: { product: CxProduct; slug: string }) {
  const orderUrl = '/menu/' + slug + (product.id ? '?item=' + product.id : '')
  return (
    <a
      href={orderUrl}
      style={{
        display: 'flex', gap: 14, alignItems: 'center',
        padding: '12px 14px', borderRadius: 16,
        background: CARD, border: '1px solid ' + CARD_BORDER,
        textDecoration: 'none', marginBottom: 10,
      }}
    >
      <div style={{
        width: 76, height: 76, borderRadius: 14, flexShrink: 0, overflow: 'hidden',
        background: product.image_url
          ? ('url(' + product.image_url + ') center/cover no-repeat #222')
          : '#222',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, color: 'rgba(255,255,255,0.3)',
      }}>
        {!product.image_url && '☕'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: FB, fontSize: 15, fontWeight: 700, margin: '0 0 3px', color: INK, lineHeight: 1.2 }}>
          {product.name}
        </p>
        {product.description && (
          <p style={{
            fontFamily: FB, fontSize: 12, color: INK_MUTED, margin: '0 0 6px', lineHeight: 1.4,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {product.description}
          </p>
        )}
        <p style={{ fontFamily: FB, fontSize: 15, fontWeight: 700, color: INK, margin: 0 }}>
          {'$' + (Number(product.price) || 0).toFixed(2)}
        </p>
      </div>
      <div style={{
        flexShrink: 0, width: 36, height: 36, borderRadius: 10,
        background: ACCENT, color: ACCENT_TEXT,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, fontWeight: 700, lineHeight: 1,
        boxShadow: '0 2px 10px rgba(217,245,78,0.45)',
      }}>
        +
      </div>
    </a>
  )
}

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

  const featured = products.find(p => p.featured)
  const filteredProducts = products.filter(p => {
    const matchesCat = !activeCat || p.category_id === activeCat
    const q = search.trim().toLowerCase()
    const matchesSearch = !q || p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)
    return matchesCat && matchesSearch
  })

  const showFeatured = !activeCat && !search && !!featured

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FB, color: INK, paddingBottom: 100 }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box }
        .cx-cat-scroll::-webkit-scrollbar { display: none }
        .cx-search-input::placeholder { color: rgba(217,245,78,0.5) }
      `}</style>

      {/* ── Sticky header — dark ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: BG,
        paddingTop: 52, paddingBottom: 14, paddingLeft: 18, paddingRight: 18,
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        {/* Logo + Menu heading + search/scan pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          {/* Logo circle */}
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: logoUrl ? ('url(' + logoUrl + ') center/cover') : 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: FB, fontSize: 14, fontWeight: 700, color: INK,
          }}>
            {!logoUrl && bizName[0]}
          </div>

          {/* Menu heading */}
          <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 28, fontWeight: 600, margin: 0, color: INK, flex: 1, letterSpacing: '-0.01em' }}>
            Menu
          </h1>

          {/* Search pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            border: '1.5px solid ' + ACCENT,
            borderRadius: 100, padding: '7px 12px',
            background: searchOpen ? 'rgba(217,245,78,0.12)' : 'transparent',
            cursor: 'pointer',
          }}
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

          {/* Scan pill */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1.5px solid ' + ACCENT, borderRadius: 100, padding: '7px 12px',
            cursor: 'pointer',
          }}>
            <IconScan />
          </div>
        </div>

        {/* Category tabs — active = white text + lime underline */}
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

      {/* ── Featured hero card ── */}
      {showFeatured && featured && (
        <a
          href={'/menu/' + slug}
          style={{
            display: 'block', margin: '16px 18px 0', borderRadius: 20,
            overflow: 'hidden', textDecoration: 'none', position: 'relative',
            height: 220, boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{
            position: 'absolute', inset: 0,
            background: featured.image_url
              ? ('url(' + featured.image_url + ') center/cover no-repeat #1a1814')
              : '#1a1814',
          }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.2) 55%, transparent 100%)' }} />
          <div style={{ position: 'absolute', bottom: 16, left: 18, right: 18 }}>
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 30, color: '#fff', margin: '0 0 4px', fontWeight: 600, lineHeight: 1.1 }}>
              {featured.name}
            </p>
            <p style={{ fontFamily: FB, fontSize: 18, fontWeight: 700, color: '#fff', margin: '0 0 5px' }}>
              {'$' + (Number(featured.price) || 0).toFixed(2)}
            </p>
            {featured.description && (
              <p style={{ fontFamily: FB, fontSize: 13, color: 'rgba(255,255,255,0.72)', margin: 0, lineHeight: 1.4 }}>
                {featured.description.slice(0, 90)}{featured.description.length > 90 ? '…' : ''}
              </p>
            )}
          </div>
        </a>
      )}

      {/* ── Product list ── */}
      <div style={{ padding: '14px 18px 0' }}>
        {filteredProducts.length > 0 ? (
          filteredProducts.map(p => (
            <ProductRow key={p.id} product={p} slug={slug} />
          ))
        ) : (
          <div style={{ textAlign: 'center', padding: '48px 0', color: INK_MUTED }}>
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 20, margin: 0 }}>
              {search ? ('No items match "' + search + '"') : 'No items yet'}
            </p>
          </div>
        )}
      </div>

      <CxTabBar slug={slug} active="menu" dark />
    </div>
  )
}