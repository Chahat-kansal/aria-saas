'use client'
import { useState } from 'react'
import { CxTabBar } from '../CxTabBar'

const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#9ca3af'
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
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ display: 'block', flexShrink: 0 }}>
      <circle cx="7" cy="7" r="4.5"/>
      <path d="M10.5 10.5L14 14"/>
    </svg>
  )
}

function ProductCard({ product, slug }: { product: CxProduct; slug: string }) {
  const orderUrl = '/menu/' + slug + (product.id ? '?item=' + product.id : '')
  return (
    <a
      href={orderUrl}
      style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.07)', textDecoration: 'none', color: '#fff' }}
    >
      <div style={{
        width: 76, height: 76, borderRadius: 16, flexShrink: 0, overflow: 'hidden',
        background: product.image_url ? ('url(' + product.image_url + ') center/cover no-repeat #1a1a1a') : '#1a1a1a',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: '#444',
      }}>
        {!product.image_url && '☕'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 17, fontWeight: 600, margin: '0 0 4px', color: '#fff', lineHeight: 1.2 }}>
          {product.name}
        </p>
        {product.description && (
          <p style={{ fontFamily: FB, fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: '0 0 6px', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {product.description}
          </p>
        )}
        <p style={{ fontFamily: FB, fontSize: 14, color: 'rgba(255,255,255,0.7)', margin: 0, fontWeight: 500 }}>
          {'$' + (Number(product.price) || 0).toFixed(2)}
        </p>
      </div>
      <a
        href={orderUrl}
        onClick={e => e.stopPropagation()}
        style={{
          flexShrink: 0, width: 36, height: 36, borderRadius: 10,
          background: ACCENT, color: ACCENT_TEXT,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: FB, fontSize: 20, fontWeight: 700, textDecoration: 'none',
          lineHeight: 1,
        }}
      >
        +
      </a>
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

  const featured = products.find(p => p.featured)
  const filteredProducts = products.filter(p => {
    const matchesCat = !activeCat || p.category_id === activeCat
    const q = search.trim().toLowerCase()
    const matchesSearch = !q || p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)
    return matchesCat && matchesSearch
  })

  const showFeatured = !activeCat && !search && featured

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d0d', fontFamily: FB, color: '#fff', paddingBottom: 100 }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box }
        .cx-cat-scroll::-webkit-scrollbar { display: none }
        .-webkit-line-clamp { -webkit-line-clamp: 2; -webkit-box-orient: vertical; display: -webkit-box; overflow: hidden }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50, background: '#0d0d0d',
        paddingTop: 52, paddingBottom: 14, paddingLeft: 18, paddingRight: 18,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        {/* Logo row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: logoUrl ? ('url(' + logoUrl + ') center/cover') : 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: FB, fontSize: 14, fontWeight: 700, color: '#fff',
            }}>
              {!logoUrl && bizName[0]}
            </div>
            <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 26, fontWeight: 600, margin: 0, color: '#fff', letterSpacing: '-0.01em' }}>
              Menu
            </h1>
          </div>
          {/* Frosted lime search pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: search ? ACCENT : 'rgba(255,255,255,0.08)',
            borderRadius: 100, padding: '8px 14px',
            border: '1px solid ' + (search ? ACCENT : 'rgba(255,255,255,0.12)'),
            color: search ? ACCENT_TEXT : '#aaa',
          }}>
            <IconSearch />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search"
              style={{
                background: 'none', border: 'none', outline: 'none',
                fontFamily: FB, fontSize: 13, color: search ? ACCENT_TEXT : '#aaa',
                width: 70, padding: 0,
              }}
            />
          </div>
        </div>

        {/* Category tabs */}
        {categories.length > 0 && (
          <div
            className="cx-cat-scroll"
            style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}
          >
            <button
              onClick={() => setActiveCat(null)}
              style={{
                flexShrink: 0, borderRadius: 100, padding: '7px 16px',
                border: 'none', cursor: 'pointer', fontFamily: FB, fontSize: 13, fontWeight: 600,
                background: !activeCat ? ACCENT : 'rgba(255,255,255,0.08)',
                color: !activeCat ? ACCENT_TEXT : '#aaa',
                transition: 'background 0.15s',
              }}
            >
              All
            </button>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveCat(activeCat === c.id ? null : c.id)}
                style={{
                  flexShrink: 0, borderRadius: 100, padding: '7px 16px',
                  border: 'none', cursor: 'pointer', fontFamily: FB, fontSize: 13, fontWeight: 600,
                  background: activeCat === c.id ? ACCENT : 'rgba(255,255,255,0.08)',
                  color: activeCat === c.id ? ACCENT_TEXT : '#aaa',
                  transition: 'background 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Featured item ── */}
      {showFeatured && (
        <a
          href={'/menu/' + slug}
          style={{ display: 'block', margin: '20px 18px 0', borderRadius: 22, overflow: 'hidden', textDecoration: 'none', position: 'relative', height: 200 }}
        >
          <div style={{
            position: 'absolute', inset: 0,
            background: featured.image_url ? ('url(' + featured.image_url + ') center/cover no-repeat #1a1a1a') : '#1a1a1a',
          }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 55%)' }} />
          <div style={{ position: 'absolute', bottom: 16, left: 18, right: 18 }}>
            <span style={{ display: 'inline-block', background: ACCENT, color: ACCENT_TEXT, borderRadius: 100, padding: '3px 10px', fontFamily: FB, fontSize: 10, fontWeight: 700, marginBottom: 6 }}>
              Featured
            </span>
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 24, color: '#fff', margin: '0 0 3px', fontWeight: 600, lineHeight: 1.1 }}>
              {featured.name}
            </p>
            {featured.description && (
              <p style={{ fontFamily: FB, fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: '0 0 8px', lineHeight: 1.4 }}>
                {featured.description.slice(0, 80)}{featured.description.length > 80 ? '…' : ''}
              </p>
            )}
            <span style={{ fontFamily: FB, fontSize: 14, color: '#fff', fontWeight: 600 }}>
              {'$' + (Number(featured.price) || 0).toFixed(2)}
            </span>
          </div>
        </a>
      )}

      {/* ── Product list ── */}
      <div style={{ padding: '20px 18px 0' }}>
        {filteredProducts.length > 0 ? (
          filteredProducts.map(p => (
            <ProductCard key={p.id} product={p} slug={slug} />
          ))
        ) : (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.4)' }}>
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 20, margin: 0 }}>
              {search ? 'No items match "' + search + '"' : 'No items yet'}
            </p>
          </div>
        )}
      </div>

      {/* Order CTA */}
      <div style={{ padding: '24px 18px 0', textAlign: 'center' }}>
        <a
          href={'/menu/' + slug}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: ACCENT, color: ACCENT_TEXT, borderRadius: 100, padding: '13px 28px', fontFamily: FB, fontSize: 15, fontWeight: 700, textDecoration: 'none', boxShadow: '0 4px 16px rgba(217,245,78,0.35)' }}
        >
          View full menu & order →
        </a>
      </div>

      <CxTabBar slug={slug} active="menu" />
    </div>
  )
}