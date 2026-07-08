'use client'

import { useState, useEffect } from 'react'
import { CxTabBar } from '../CxTabBar'

const BG = '#f3efe4'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#6b7280'
const FD = "var(--font-display,'Cormorant',Georgia,serif)"
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"

interface CartItem {
  product_id: string
  product_name: string
  price: number
  image_url: string | null
  quantity: number
  modifiers: Array<{ id: string; name: string; price_cents: number }>
}

interface PlaceOrderResponse {
  ok?: boolean
  order_number?: string
  error?: string
}

export function CartClient({ slug }: { slug: string }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('aria_cart_items_' + slug)
      if (raw) setItems(JSON.parse(raw) as CartItem[])
    } catch { /* ok */ }
    setLoaded(true)
  }, [slug])

  const persist = (next: CartItem[]) => {
    try {
      localStorage.setItem('aria_cart_items_' + slug, JSON.stringify(next))
      localStorage.setItem('aria_cart_' + slug, String(next.reduce((s, i) => s + i.quantity, 0)))
    } catch { /* ok */ }
  }

  const adjustQty = (idx: number, delta: number) => {
    setItems(prev => {
      const next = [...prev]
      const newQty = next[idx].quantity + delta
      if (newQty <= 0) {
        next.splice(idx, 1)
      } else {
        next[idx] = { ...next[idx], quantity: Math.min(20, newQty) }
      }
      persist(next)
      return next
    })
  }

  const lineTotal = (item: CartItem) => {
    const modsCents = (item.modifiers ?? []).reduce((s, m) => s + (m.price_cents ?? 0), 0)
    return ((Number(item.price) || 0) + modsCents / 100) * item.quantity
  }

  const subtotal = items.reduce((s, item) => s + lineTotal(item), 0)
  const totalQty = items.reduce((s, i) => s + i.quantity, 0)

  const placeOrder = async () => {
    setOrderError(null)
    setPlacing(true)
    try {
      const res = await fetch('/api/public/place-order/' + slug, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // customer_name + customer_phone omitted — server derives from cx_session cookie
          items: items.map(i => ({
            product_id: i.product_id,
            product_name: i.product_name,
            quantity: i.quantity,
            // unit_price omitted — server re-fetches from pos_products (prices are display-only client-side)
            modifiers: (i.modifiers ?? []).map(m => ({ id: m.id, name: m.name })),
          })),
          fulfillment_type: 'pickup',
          source: 'online',
        }),
      })
      if (res.status === 401) {
        // No valid session — send to onboarding (same behaviour as the old phone guard)
        window.location.replace('/' + slug + '/onboarding')
        return
      }
      const data = await res.json() as PlaceOrderResponse
      if (!data.ok) {
        setOrderError(data.error ?? 'Order failed. Please try again.')
        setPlacing(false)
        return
      }
      try {
        localStorage.removeItem('aria_cart_items_' + slug)
        localStorage.setItem('aria_cart_' + slug, '0')
      } catch { /* ok */ }
      window.location.href = '/menu/' + slug + '/order/' + (data.order_number ?? '')
    } catch {
      setOrderError('Something went wrong. Please try again.')
      setPlacing(false)
    }
  }

  if (!loaded) {
    return (
      <div style={{ minHeight: '100dvh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FB, color: INK_MUTED }}>
        Loading…
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div style={{ minHeight: '100dvh', background: BG, fontFamily: FB, color: INK, maxWidth: '28rem', margin: '0 auto' }}>
        <style>{'*, *::before, *::after { box-sizing: border-box }'}</style>
        <div style={{ paddingTop: 80, paddingLeft: 24, paddingRight: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>🛒</div>
          <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 36, color: INK, margin: '0 0 10px', fontWeight: 400 }}>
            Your cart
          </h1>
          <p style={{ fontFamily: FB, fontSize: 15, color: INK_MUTED, margin: '0 0 28px' }}>
            Nothing here yet.
          </p>
          <a
            href={'/' + slug + '/menu'}
            style={{
              display: 'inline-block',
              background: ACCENT, color: ACCENT_TEXT,
              borderRadius: 14, padding: '14px 28px',
              fontFamily: FB, fontSize: 15, fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 0 24px rgba(217,245,78,0.4)',
            }}
          >
            Browse menu
          </a>
        </div>
        <CxTabBar slug={slug} active="cart" />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: BG, fontFamily: FB, color: INK, maxWidth: '28rem', margin: '0 auto', paddingBottom: 'calc(80px + env(safe-area-inset-bottom) + 24px)' }}>
      <style>{'*, *::before, *::after { box-sizing: border-box }'}</style>

      {/* ── Header ── */}
      <div style={{ padding: '52px 20px 16px' }}>
        <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 38, margin: '0 0 4px', color: INK, fontWeight: 400, lineHeight: 1.1 }}>
          Your cart
        </h1>
        <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: 0 }}>
          {totalQty + ' item' + (totalQty !== 1 ? 's' : '')}
        </p>
      </div>

      {/* ── Line items ── */}
      <div style={{ padding: '0 16px' }}>
        {items.map((item, idx) => {
          const modsLabel = (item.modifiers ?? []).map(m => m.name).join(', ')
          return (
            <div
              key={item.product_id + String(idx)}
              style={{
                display: 'flex', gap: 12, alignItems: 'center',
                background: 'rgba(255,255,255,0.65)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderRadius: 18,
                border: '1px solid rgba(0,0,0,0.05)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
                padding: '14px',
                marginBottom: 10,
              }}
            >
              {/* Thumbnail */}
              <div style={{
                width: 56, height: 56, borderRadius: 10, flexShrink: 0,
                background: item.image_url
                  ? ('url(' + item.image_url + ') center/cover no-repeat #e8e4dc')
                  : '#e8e4dc',
              }} />

              {/* Name + mods + stepper */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: FB, fontSize: 14, fontWeight: 700, color: INK, margin: '0 0 2px', lineHeight: 1.2 }}>
                  {item.product_name}
                </p>
                {modsLabel && (
                  <p style={{
                    fontFamily: FB, fontSize: 11, color: INK_MUTED, margin: '0 0 6px', lineHeight: 1.3,
                    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                  }}>
                    {modsLabel}
                  </p>
                )}
                {/* Qty stepper */}
                <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(0,0,0,0.06)', borderRadius: 8, padding: '0 2px' }}>
                  <button
                    onClick={() => adjustQty(idx, -1)}
                    style={{ width: 28, height: 28, border: 'none', background: 'none', fontFamily: FB, fontSize: 16, fontWeight: 700, color: INK, cursor: 'pointer' }}
                  >
                    {'−'}
                  </button>
                  <span style={{ fontFamily: FB, fontSize: 13, fontWeight: 700, color: INK, minWidth: 18, textAlign: 'center' }}>
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => adjustQty(idx, 1)}
                    style={{ width: 28, height: 28, border: 'none', background: 'none', fontFamily: FB, fontSize: 16, fontWeight: 700, color: INK, cursor: 'pointer' }}
                  >
                    {'+'}
                  </button>
                </div>
              </div>

              {/* Line total */}
              <span style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 17, fontWeight: 700, color: INK, flexShrink: 0 }}>
                {'$' + (Number(lineTotal(item)) || 0).toFixed(2)}
              </span>
            </div>
          )
        })}
      </div>

      {/* ── Totals + checkout ── */}
      <div style={{ padding: '12px 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontFamily: FB, fontSize: 15, color: INK_MUTED }}>Subtotal</span>
          <span style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 24, fontWeight: 700, color: INK }}>
            {'$' + (Number(subtotal) || 0).toFixed(2)}
          </span>
        </div>
        <p style={{ fontFamily: FB, fontSize: 12, color: INK_MUTED, margin: '0 0 20px' }}>
          Pay at pickup · Order confirmed once placed
        </p>

        {orderError && (
          <div style={{ background: 'rgba(220,38,38,0.08)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
            <p style={{ fontFamily: FB, fontSize: 13, color: '#dc2626', margin: 0 }}>{orderError}</p>
          </div>
        )}

        <button
          onClick={() => void placeOrder()}
          disabled={placing}
          style={{
            width: '100%', height: 52, borderRadius: 14,
            background: placing ? 'rgba(0,0,0,0.12)' : ACCENT,
            color: placing ? INK_MUTED : ACCENT_TEXT,
            border: 'none',
            fontFamily: FB, fontSize: 16, fontWeight: 700,
            cursor: placing ? 'default' : 'pointer',
            boxShadow: placing ? 'none' : '0 0 28px rgba(217,245,78,0.45)',
          }}
        >
          {placing
            ? 'Placing order…'
            : ('Place order · $' + (Number(subtotal) || 0).toFixed(2))}
        </button>

        <a
          href={'/' + slug + '/menu'}
          style={{
            display: 'block', textAlign: 'center', marginTop: 14,
            fontFamily: FB, fontSize: 13, color: INK_MUTED, textDecoration: 'none',
          }}
        >
          ← Continue browsing
        </a>
      </div>

      <CxTabBar slug={slug} active="cart" />
    </div>
  )
}