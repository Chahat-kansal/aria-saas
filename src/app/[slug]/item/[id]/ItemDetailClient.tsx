'use client'

import { useState } from 'react'
import { CxTabBar } from '../../CxTabBar'

const BG = '#f3efe4'
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

export type ModOption = {
  id: string
  name: string
  price_cents: number
  is_default: boolean | null
}

export type ModGroup = {
  id: string
  name: string
  required: boolean
  min: number
  max: number
  selection_type: string
  options: ModOption[]
}

interface CartItem {
  product_id: string
  product_name: string
  price: number
  image_url: string | null
  quantity: number
  modifiers: Array<{ id: string; name: string; price_cents: number }>
}

function TagChip({ label, green = false }: { label: string; green?: boolean }) {
  return (
    <span style={{
      display: 'inline-block', padding: '4px 12px', borderRadius: 999,
      background: green ? 'rgba(217,245,78,0.25)' : 'rgba(0,0,0,0.06)',
      color: green ? ACCENT_TEXT : INK_MUTED,
      fontFamily: FB, fontSize: 12, marginRight: 6, marginBottom: 6,
    }}>
      {label}
    </span>
  )
}

export function ItemDetailClient({ slug, product, modifierGroups }: {
  slug: string
  product: Product
  modifierGroups: ModGroup[]
}) {
  const [qty, setQty] = useState(1)
  const [selectedMods, setSelectedMods] = useState<Record<string, string[]>>(() => {
    const defaults: Record<string, string[]> = {}
    for (const g of modifierGroups) {
      const defs = g.options.filter(o => o.is_default).map(o => o.id)
      if (defs.length > 0) defaults[g.id] = defs
    }
    return defaults
  })
  const [saved, setSaved] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  // ── Parse dietary / allergen tags ──────────────────────────────────────────
  const dietaryTags: string[] = (() => {
    if (!product.dietary_tags) return []
    if (Array.isArray(product.dietary_tags)) return product.dietary_tags as string[]
    return []
  })()

  const allergens: string[] = (() => {
    if (!product.allergen_info) return []
    if (Array.isArray(product.allergen_info)) return product.allergen_info as string[]
    if (typeof product.allergen_info === 'object') {
      return Object.keys(product.allergen_info as Record<string, unknown>).filter(
        k => (product.allergen_info as Record<string, boolean>)[k]
      )
    }
    return []
  })()

  // ── Modifier selection ─────────────────────────────────────────────────────
  const toggleMod = (group: ModGroup, modId: string) => {
    const isSingle = group.selection_type !== 'multi' && group.selection_type !== 'multi_quantity' && group.max <= 1
    setSelectedMods(prev => {
      const current = prev[group.id] ?? []
      if (isSingle) {
        const deselect = current.includes(modId) && group.min === 0
        return { ...prev, [group.id]: deselect ? [] : [modId] }
      }
      if (current.includes(modId)) {
        return { ...prev, [group.id]: current.filter(id => id !== modId) }
      }
      if (group.max > 0 && current.length >= group.max) return prev
      return { ...prev, [group.id]: [...current, modId] }
    })
  }

  // ── Price computation ──────────────────────────────────────────────────────
  const selectedFlat: ModOption[] = modifierGroups.flatMap(g =>
    (selectedMods[g.id] ?? [])
      .map(mid => g.options.find(o => o.id === mid))
      .filter((o): o is ModOption => o !== undefined)
  )
  const modsCentsPerUnit = selectedFlat.reduce((s, m) => s + (m.price_cents ?? 0), 0)
  const unitTotal = (Number(product.price) || 0) + modsCentsPerUnit / 100
  const lineTotal = unitTotal * qty

  // ── Save to favourites ─────────────────────────────────────────────────────
  const saveFavourite = async () => {
    let phone = ''
    try {
      const stored = localStorage.getItem('aria_cx_' + slug)
      if (stored) phone = (JSON.parse(stored) as { phone?: string }).phone ?? ''
    } catch { /* ok */ }
    if (!phone) { window.location.replace('/' + slug + '/onboarding'); return }
    let customerId = ''
    try {
      const me = await fetch('/api/public/cx/' + slug + '/me', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      }).then(r => r.json()) as { customer_id?: string }
      customerId = me.customer_id ?? ''
    } catch { /* ok */ }
    if (!customerId) return
    await fetch('/api/public/cx/' + slug + '/favourites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId, product_id: product.id, nickname: product.name }),
    })
    setSaved(true)
  }

  // ── Add to cart ────────────────────────────────────────────────────────────
  const handleAddToCart = () => {
    setValidationError(null)
    for (const g of modifierGroups) {
      if (g.required && (!selectedMods[g.id] || selectedMods[g.id].length === 0)) {
        setValidationError('Please choose an option for "' + g.name + '"')
        return
      }
    }

    const mods = modifierGroups.flatMap(g =>
      (selectedMods[g.id] ?? []).map(mid => {
        const opt = g.options.find(o => o.id === mid)
        return { id: mid, name: opt?.name ?? '', price_cents: opt?.price_cents ?? 0 }
      })
    )

    try {
      const raw = localStorage.getItem('aria_cart_items_' + slug)
      const cart: CartItem[] = raw ? (JSON.parse(raw) as CartItem[]) : []
      const modKey = JSON.stringify(mods.map(m => m.id).sort())
      const idx = cart.findIndex(
        i => i.product_id === product.id &&
          JSON.stringify((i.modifiers ?? []).map(m => m.id).sort()) === modKey
      )
      if (idx >= 0) {
        cart[idx].quantity = Math.min(20, cart[idx].quantity + qty)
      } else {
        cart.push({
          product_id: product.id,
          product_name: product.name,
          price: Number(product.price) || 0,
          image_url: product.image_url,
          quantity: qty,
          modifiers: mods,
        })
      }
      localStorage.setItem('aria_cart_items_' + slug, JSON.stringify(cart))
      localStorage.setItem('aria_cart_' + slug, String(cart.reduce((s, i) => s + i.quantity, 0)))
    } catch { /* ok */ }

    window.location.href = '/' + slug + '/cart'
  }

  const available = product.is_available !== false

  return (
    <div style={{ minHeight: '100dvh', background: BG, fontFamily: FB, color: INK, maxWidth: '28rem', margin: '0 auto' }}>
      <style>{'*, *::before, *::after { box-sizing: border-box }'}</style>

      {/* ── Hero image ── */}
      <div style={{
        height: 300, position: 'relative', flexShrink: 0,
        background: product.image_url
          ? ('url(' + product.image_url + ') center/cover no-repeat #e8e4dc')
          : 'linear-gradient(160deg, #e8e4dc 0%, #f5f3ef 100%)',
      }}>
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

      {/* ── Content ── */}
      <div style={{ padding: '24px 20px 0' }}>
        {product.category && (
          <p style={{ fontFamily: FB, fontSize: 12, color: INK_MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
            {product.category}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 34, margin: 0, color: INK, lineHeight: 1.1, flex: 1, paddingRight: 12 }}>
            {product.name}
          </h1>
          <span style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 28, color: INK, fontWeight: 700, flexShrink: 0 }}>
            {'$' + (Number(product.price) || 0).toFixed(2)}
          </span>
        </div>

        {product.description && (
          <p style={{ fontFamily: FB, fontSize: 15, color: INK_MUTED, lineHeight: 1.6, margin: '0 0 20px' }}>
            {product.description}
          </p>
        )}

        {dietaryTags.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontFamily: FB, fontSize: 12, fontWeight: 700, color: INK_MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
              Dietary
            </p>
            <div>{dietaryTags.map(t => <TagChip key={t} label={t} green />)}</div>
          </div>
        )}

        {allergens.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontFamily: FB, fontSize: 12, fontWeight: 700, color: INK_MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
              Allergens
            </p>
            <div>{allergens.map(a => <TagChip key={a} label={a} />)}</div>
          </div>
        )}

        {!available && (
          <div style={{ background: 'rgba(220,38,38,0.08)', borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
            <p style={{ fontFamily: FB, fontSize: 14, color: '#dc2626', margin: 0, fontWeight: 600 }}>
              Currently unavailable
            </p>
          </div>
        )}

        {/* ── Modifier groups ── */}
        {modifierGroups.map(group => {
          const isSingle = group.selection_type !== 'multi' && group.selection_type !== 'multi_quantity' && group.max <= 1
          const current = selectedMods[group.id] ?? []
          return (
            <div key={group.id} style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                <p style={{ fontFamily: FB, fontSize: 14, fontWeight: 700, color: INK, margin: 0 }}>
                  {group.name}
                </p>
                {group.required && (
                  <span style={{ fontFamily: FB, fontSize: 11, fontWeight: 600, color: '#dc2626' }}>Required</span>
                )}
                {!isSingle && !group.required && group.max > 1 && (
                  <span style={{ fontFamily: FB, fontSize: 11, color: INK_MUTED }}>
                    {'Pick up to ' + group.max}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {group.options.map(opt => {
                  const on = current.includes(opt.id)
                  return (
                    <button
                      key={opt.id}
                      onClick={() => toggleMod(group, opt.id)}
                      style={{
                        padding: '9px 16px', borderRadius: 12,
                        background: on ? ACCENT : 'rgba(255,255,255,0.72)',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        color: on ? ACCENT_TEXT : INK,
                        border: on ? ('2px solid ' + ACCENT) : '1.5px solid rgba(0,0,0,0.10)',
                        fontFamily: FB, fontSize: 14, fontWeight: on ? 700 : 400,
                        cursor: 'pointer',
                        boxShadow: on ? '0 0 12px rgba(217,245,78,0.4)' : '0 1px 4px rgba(0,0,0,0.05)',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      {opt.name}
                      {opt.price_cents > 0 && (
                        <span style={{ fontSize: 12, opacity: 0.75 }}>
                          {'+$' + (opt.price_cents / 100).toFixed(2)}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        {validationError && (
          <div style={{ background: 'rgba(220,38,38,0.08)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
            <p style={{ fontFamily: FB, fontSize: 13, color: '#dc2626', margin: 0 }}>
              {validationError}
            </p>
          </div>
        )}
      </div>

      {/* Bottom spacer so content isn't hidden under CTA */}
      <div style={{ height: 160 }} />

      {/* ── Sticky CTA panel ── */}
      <div style={{
        position: 'fixed', bottom: 90,
        left: '50%', transform: 'translateX(-50%)',
        width: 'calc(100vw - 32px)', maxWidth: 'calc(28rem - 32px)',
        zIndex: 90,
        background: 'rgba(243,239,228,0.96)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderRadius: 20,
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        padding: '12px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

          {/* Save / heart */}
          <button
            onClick={() => void saveFavourite()}
            disabled={saved}
            aria-label="Save to favourites"
            style={{
              flexShrink: 0, width: 44, height: 44, borderRadius: 12,
              border: '1.5px solid rgba(0,0,0,0.10)',
              background: saved ? ACCENT : 'rgba(255,255,255,0.85)',
              color: saved ? ACCENT_TEXT : INK,
              cursor: saved ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 20 20"
              fill={saved ? ACCENT_TEXT : 'none'}
              stroke={saved ? ACCENT_TEXT : INK}
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 17l-7-7a4 4 0 015.66-5.66L10 5.66l1.34-1.32A4 4 0 0117 10l-7 7z"/>
            </svg>
          </button>

          {/* Qty stepper */}
          <div style={{
            display: 'flex', alignItems: 'center',
            background: 'rgba(0,0,0,0.06)', borderRadius: 10, padding: '0 4px',
          }}>
            <button
              onClick={() => setQty(q => Math.max(1, q - 1))}
              style={{
                width: 32, height: 40, border: 'none', background: 'none',
                fontFamily: FB, fontSize: 20, fontWeight: 700,
                color: qty === 1 ? INK_MUTED : INK,
                cursor: qty === 1 ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {'−'}
            </button>
            <span style={{
              fontFamily: FB, fontSize: 15, fontWeight: 700, color: INK,
              minWidth: 22, textAlign: 'center',
            }}>
              {qty}
            </span>
            <button
              onClick={() => setQty(q => Math.min(20, q + 1))}
              style={{
                width: 32, height: 40, border: 'none', background: 'none',
                fontFamily: FB, fontSize: 20, fontWeight: 700, color: INK,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {'+'}
            </button>
          </div>

          {/* Add to cart */}
          <button
            onClick={() => { if (available) handleAddToCart() }}
            disabled={!available}
            style={{
              flex: 1, height: 44, borderRadius: 12,
              background: available ? ACCENT : 'rgba(0,0,0,0.10)',
              color: available ? ACCENT_TEXT : INK_MUTED,
              border: 'none',
              fontFamily: FB, fontSize: 14, fontWeight: 700,
              cursor: available ? 'pointer' : 'default',
              boxShadow: available ? '0 0 20px rgba(217,245,78,0.4)' : 'none',
            }}
          >
            {available
              ? ('Add to cart · $' + lineTotal.toFixed(2))
              : 'Unavailable'}
          </button>
        </div>
      </div>

      <CxTabBar slug={slug} active="item" />
    </div>
  )
}