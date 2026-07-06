'use client'
import { useState } from 'react'
import { CxTabBar } from '../CxTabBar'

const BG = '#fafafa'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#6b7280'
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

function IconSearch({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke={active ? ACCENT_TEXT : INK_MUTED} strokeWidth="1.5" strokeLinecap="round" style={{ display: 'block', flexShrink: 0 }}>
      <circle cx="7" cy="7" r="4.5"/>
      <path d="M10.5 10.5L14 14"/>
    </svg>
  )
}

// Product row: white card on light page, ink text
function ProductRow({ product, slug }: { product: CxProduct; slug: string }) {
  const orderUrl = '/menu/' + slug + (product.id ? '?item=' + product.id : '')
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
      <div style={{
        width: 72, height: 72, borderRadius: 16, flexShrink: 0, overflow: 'hidden',
        background: product.image_url ? ('url(' + product.image_url + ') center/cover no-repeat #efefef') : '#f0f0f0',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#bbb',
      }}>
        {!product.image_url && '☕'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 17, fontWeight: 600, margin: '0 0 3px', color: INK, lineHeight: 1.2 }}>
          {product.name}
        </p>
        {product.description && (
          <p style={{ fontFamily: FB, fontSize: 12, color: INK_MUTED, margin: '0 0 5px', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {product.description}
          </p>
        )}
        <p style={{ fontFamily: FB, fontSize: 14, color: INK, margin: 0, fontWeight: 600 }}>
          {'$' + (Number(product.price) || 0).toFixed(2)}
        </p>
      </div>
      <a
        href={orderUrl}
        style={{
          flexShrink: 0, width: 36, height: 36, borderRadius: 10,
          background: ACCENT, color: ACCENT_TEXT,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: FB, fontSize: 20, fontWeight: 700, textDecoration: 'none',
          lineHeight: 1, boxShadow: '0 2px 8px rgba(217,245,78,0.4)',
        }}
      >
        +
      </a>
    </div>
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

  const showFeatured = !activeCat && !search && !!featured
  const searchActive = search.length > 0

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FB, color: INK, paddingBottom: 100 }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box }
        .cx-cat-scroll::-webkit-scrollbar { display: none }
      `}</style>

      {/* ── Header — LIGHT, ink ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: BG,
        paddingTop: 52, paddingBottom: 14, paddingLeft: 18, paddingRight: 18,
        borderBottom: '1px solid rgba(0,0,0,0.08)',
      }}>
        {/* Logo + Menu + search pill */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: logoUrl ? ('url(' + logoUrl + ') center/cover') : '#f0f0f0',
              border: '1px solid rgba(0,0,0,0.09)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: FB, fontSize: 14, fontWeight: 700, color: INK,
            }}>
              {!logoUrl && bizName[0]}
            </div>
            <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 26, fontWeight: 600, margin: 0, color: INK, letterSpacing: '-0.01em' }}>
              Menu
            </h1>
          </div>

          {/* Frosted lime search pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: searchActive ? ACCENT : 'rgba(0,0,0,0.05)',
            borderRadius: 100, padding: '8px 14px',
            border: '1px solid ' + (searchActive ? ACCENT : 'rgba(0,0,0,0.09)'),
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}>
            <IconSearch active={searchActive} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search"
              style={{
                background: 'none', border: 'none', outline: 'none',
                fontFamily: FB, fontSize: 13,
                color: searchActive ? ACCENT_TEXT : INK_MUTED,
                width: 64, padding: 0,
              }}
            />
            {searchActive && (
              <button
                onClick={() => setSearch('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: ACCENT_TEXT, fontFamily: FB, fontSize: 13, fontWeight: 700, lineHeight: 1 }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Category tabs — active=lime, inactive=light grey */}
        {categories.length > 0 && (
          <div className="cx-cat-scroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
            <button
              onClick={() => setActiveCat(null)}
              style={{
                flexShrink: 0, borderRadius: 100, padding: '7px 16px', border: 'none', cursor: 'pointer',
                fontFamily: FB, fontSize: 13, fontWeight: 600,
                background: !activeCat ? ACCENT : 'rgba(0,0,0,0.06)',
                color: !activeCat ? ACCENT_TEXT : INK_MUTED,
              }}
            >
              All
            </button>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveCat(activeCat === c.id ? null : c.id)}
                style={{
                  flexShrink: 0, borderRadius: 100, padding: '7px 16px', border: 'none', cursor: 'pointer',
                  fontFamily: FB, fontSize: 13, fontWeight: 600,
                  background: activeCat === c.id ? ACCENT : 'rgba(0,0,0,0.06)',
                  color: activeCat === c.id ? ACCENT_TEXT : INK_MUTED,
                  whiteSpace: 'nowrap',
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Featured card — full-bleed photo, dark overlay text always legible ── */}
      {showFeatured && featured && (
        <a
          href={'/menu/' + slug}
          style={{ display: 'block', margin: '20px 18px 0', borderRadius: 22, overflow: 'hidden', textDecoration: 'none', position: 'relative', height: 200, boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}
        >
          <div style={{
            position: 'absolute', inset: 0,
            background: featured.image_url ? ('url(' + featured.image_url + ') center/cover no-repeat #e8e8e8') : '#e8e8e8',
          }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 52%)' }} />
          <div style={{ position: 'absolute', bottom: 16, left: 18, right: 18 }}>
            <span style={{ display: 'inline-block', background: ACCENT, color: ACCENT_TEXT, borderRadius: 100, padding: '3px 10px', fontFamily: FB, fontSize: 10, fontWeight: 700, marginBottom: 6 }}>
              Featured
            </span>
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 24, color: '#fff', margin: '0 0 3px', fontWeight: 600, lineHeight: 1.1 }}>
              {featured.name}
            </p>
            {featured.description && (
              <p style={{ fontFamily: FB, fontSize: 12, color: 'rgba(255,255,255,0.75)', margin: '0 0 6px', lineHeight: 1.4 }}>
                {featured.description.slice(0, 80)}{featured.description.length > 80 ? '…' : ''}
              </p>
            )}
            <span style={{ fontFamily: FB, fontSize: 14, color: '#fff', fontWeight: 600 }}>
              {'$' + (Number(featured.price) || 0).toFixed(2)}
            </span>
          </div>
        </a>
      )}

      {/* ── Product list — white cards, ink text ── */}
      <div style={{ padding: '8px 18px 0' }}>
        {filteredProducts.length > 0 ? (
          <div style={{ background: '#fff', borderRadius: 20, padding: '4px 18px', boxShadow: '0 2px 14px rgba(0,0,0,0.07)', marginTop: 16 }}>
            {filteredProducts.map(p => (
              <ProductRow key={p.id} product={p} slug={slug} />
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '48px 0', color: INK_MUTED }}>
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
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: ACCENT, color: ACCENT_TEXT, borderRadius: 100, padding: '13px 28px', fontFamily: FB, fontSize: 15, fontWeight: 700, textDecoration: 'none', boxShadow: '0 4px 16px rgba(217,245,78,0.4)' }}
        >
          View full menu & order →
        </a>
      </div>

      <CxTabBar slug={slug} active="menu" />
    </div>
  )
}