'use client'

import { useState } from 'react'
import { CxTabBar } from '../../CxTabBar'

const BG = '#fafafa'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#6b7280'
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"
const FD = "var(--font-display,'Cormorant',Georgia,serif)"

type Product = {
  id: string
  name: string
  description: string | null
  price: number
  image_url: string | null
  category: string | null
  is_available: boolean | null
  dietary_tags: unknown
  allergen_info: unknown
}

function TagChip({ label }: { label: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '4px 12px', borderRadius: 999,
      background: 'rgba(0,0,0,0.06)', color: INK_MUTED,
      fontFamily: FB, fontSize: 12, marginRight: 6, marginBottom: 6,
    }}>
      {label}
    </span>
  )
}

export function ItemDetailClient({ slug, product }: {
  slug: string
  product: Product
}) {
  const [saved, setSaved] = useState(false)

  const dietaryTags: string[] = (() => {
    if (!product.dietary_tags) return []
    if (Array.isArray(product.dietary_tags)) return product.dietary_tags as string[]
    return []
  })()

  const allergens: string[] = (() => {
    if (!product.allergen_info) return []
    if (Array.isArray(product.allergen_info)) return product.allergen_info as string[]
    if (typeof product.allergen_info === 'object') return Object.keys(product.allergen_info as Record<string, unknown>).filter(k => (product.allergen_info as Record<string, boolean>)[k])
    return []
  })()

  const saveFavourite = async () => {
    let customerId = ''
    let phone = ''
    try {
      const stored = localStorage.getItem('aria_cx_' + slug)
      if (stored) phone = (JSON.parse(stored) as { phone?: string }).phone ?? ''
    } catch { /* ok */ }
    if (!phone) { window.location.replace('/' + slug + '/onboarding'); return }

    try {
      const meRes = await fetch('/api/public/cx/' + slug + '/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const me = await meRes.json() as { customer_id?: string }
      customerId = me.customer_id ?? ''
    } catch { /* ok */ }
    if (!customerId) return

    await fetch('/api/public/cx/' + slug + '/favourites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId, product_id: product.id, nickname: product.name }),
    })
    setSaved(true)
  }

  const available = product.is_available !== false

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FB, color: INK }}>
      {/* Hero image */}
      <div style={{
        height: 300, position: 'relative',
        background: product.image_url
          ? ('url(' + product.image_url + ') center/cover no-repeat #f0ede8')
          : 'linear-gradient(160deg, #e8e4dc 0%, #f5f3ef 100%)',
      }}>
        {/* Back */}
        <a
          href={'/' + slug + '/menu'}
          style={{
            position: 'absolute', top: 52, left: 20,
            background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            width: 38, height: 38, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round">
            <path d="M11 4L6 9l5 5"/>
          </svg>
        </a>
      </div>

      {/* Content */}
      <div style={{ padding: '24px 20px', paddingBottom: 120 }}>
        {/* Category */}
        {product.category && (
          <p style={{ fontFamily: FB, fontSize: 12, color: INK_MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
            {product.category}
          </p>
        )}

        {/* Name + Price */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 34, margin: 0, color: INK, lineHeight: 1.1, flex: 1, paddingRight: 12 }}>
            {product.name}
          </h1>
          <span style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 28, color: INK, fontWeight: 700, flexShrink: 0 }}>
            {'$' + Number(product.price).toFixed(2)}
          </span>
        </div>

        {/* Description */}
        {product.description && (
          <p style={{ fontFamily: FB, fontSize: 15, color: INK_MUTED, lineHeight: 1.6, margin: '0 0 20px' }}>
            {product.description}
          </p>
        )}

        {/* Dietary tags */}
        {dietaryTags.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontFamily: FB, fontSize: 12, fontWeight: 700, color: INK_MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
              Dietary
            </p>
            <div>
              {dietaryTags.map(t => <TagChip key={t} label={t} />)}
            </div>
          </div>
        )}

        {/* Allergens */}
        {allergens.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontFamily: FB, fontSize: 12, fontWeight: 700, color: INK_MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
              Allergens
            </p>
            <div>
              {allergens.map(a => <TagChip key={a} label={a} />)}
            </div>
          </div>
        )}

        {/* Unavailable */}
        {!available && (
          <div style={{ background: 'rgba(220,38,38,0.08)', borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
            <p style={{ fontFamily: FB, fontSize: 14, color: '#dc2626', margin: 0, fontWeight: 600 }}>
              Currently unavailable
            </p>
          </div>
        )}
      </div>

      {/* Sticky CTA */}
      <div style={{
        position: 'fixed', bottom: 90, left: 16, right: 16, zIndex: 90,
        display: 'flex', gap: 10,
      }}>
        <button
          onClick={() => void saveFavourite()}
          disabled={saved}
          style={{
            flex: '0 0 52px', height: 52, borderRadius: 14, border: '1.5px solid rgba(0,0,0,0.12)',
            background: saved ? ACCENT : '#fff', color: saved ? ACCENT_TEXT : INK,
            cursor: saved ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill={saved ? ACCENT_TEXT : 'none'} stroke={saved ? ACCENT_TEXT : INK} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 17l-7-7a4 4 0 015.66-5.66L10 5.66l1.34-1.32A4 4 0 0117 10l-7 7z"/>
          </svg>
        </button>
        <a
          href={'/' + slug + '/menu'}
          style={{
            flex: 1, height: 52, borderRadius: 14,
            background: available ? ACCENT : 'rgba(0,0,0,0.1)',
            color: available ? ACCENT_TEXT : INK_MUTED,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: FB, fontSize: 16, fontWeight: 700, textDecoration: 'none',
            pointerEvents: available ? 'auto' : 'none',
            boxShadow: available ? '0 0 24px rgba(217,245,78,0.35)' : 'none',
          }}
        >
          {available ? 'Add to order' : 'Unavailable'}
        </a>
      </div>

      <CxTabBar slug={slug} active="item" />
    </div>
  )
}