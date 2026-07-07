'use client'

import { useState, useEffect } from 'react'
import { CxTabBar } from '../CxTabBar'

const BG = '#f3efe4'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#6b7280'
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"
const FD = "var(--font-display,'Cormorant',Georgia,serif)"

type OrderItem = {
  product_name?: string
  quantity?: number
  unit_price?: number
  product_id?: string
  image_url?: string | null
}

type Order = {
  id: string
  order_number: string | null
  status: string
  total: number | null
  items: OrderItem[]
  created_at: string
  fulfillment_type: string | null
}

type Fav = {
  id: string
  product_id: string
  custom_build: Record<string, unknown>
  nickname: string | null
  created_at: string
}

const STATUS_COLORS: Record<string, string> = {
  completed:  '#16a34a',
  pending:    '#ca8a04',
  preparing:  '#2563eb',
  ready:      '#7c3aed',
  cancelled:  '#dc2626',
}

const MEL_TZ = 'Australia/Melbourne'

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('en-AU', {
    timeZone: MEL_TZ,
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function formatTime(s: string) {
  return new Date(s).toLocaleTimeString('en-AU', {
    timeZone: MEL_TZ,
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

export function HistoryClient({ slug }: {
  slug: string
  bizId: string
  bizName: string
}) {
  const [tab, setTab] = useState<'orders' | 'favourites'>('orders')
  const [orders, setOrders] = useState<Order[]>([])
  const [favs, setFavs] = useState<Fav[]>([])
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let phone = ''
    try {
      const saved = localStorage.getItem('aria_cx_' + slug)
      if (saved) phone = (JSON.parse(saved) as { phone?: string }).phone ?? ''
    } catch { /* ok */ }

    if (!phone) {
      window.location.replace('/' + slug + '/onboarding')
      return
    }

    Promise.all([
      fetch('/api/public/cx/' + slug + '/orders?phone=' + encodeURIComponent(phone)).then(r => r.json()),
      fetch('/api/public/cx/' + slug + '/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      }).then(r => r.json()),
    ]).then(([ordData, meData]) => {
      const od = ordData as { orders?: Order[]; customer_id?: string }
      const md = meData as { customer_id?: string }
      setOrders((od.orders ?? []) as Order[])
      const cid = od.customer_id ?? md.customer_id ?? null
      setCustomerId(cid)
      setLoading(false)
      if (cid) {
        fetch('/api/public/cx/' + slug + '/favourites?customer_id=' + cid)
          .then(r => r.json())
          .then((f: { favourites?: Fav[] }) => setFavs(f.favourites ?? []))
          .catch(() => { /* ok */ })
      }
    }).catch(() => setLoading(false))
  }, [slug])

  const removeFav = async (favId: string, productId: string) => {
    if (!customerId) return
    await fetch(
      '/api/public/cx/' + slug + '/favourites?customer_id=' + customerId + '&product_id=' + productId,
      { method: 'DELETE' }
    )
    setFavs(fs => fs.filter(f => f.id !== favId))
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FB, color: INK_MUTED }}>
        Loading…
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: BG, fontFamily: FB, color: INK, paddingBottom: 'calc(80px + env(safe-area-inset-bottom) + 24px)', maxWidth: '28rem', margin: '0 auto' }}>
      <style>{'*, *::before, *::after { box-sizing: border-box }'}</style>

      {/* ── Header ── */}
      <div style={{ padding: '52px 20px 16px' }}>
        <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 38, margin: '0 0 16px', color: INK, fontWeight: 400 }}>
          History
        </h1>
        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 8, background: 'rgba(0,0,0,0.06)', borderRadius: 12, padding: 4 }}>
          {(['orders', 'favourites'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, border: 'none', borderRadius: 10, padding: '8px 16px',
                fontFamily: FB, fontSize: 14, fontWeight: tab === t ? 700 : 400,
                background: tab === t ? '#fff' : 'transparent',
                color: tab === t ? INK : INK_MUTED,
                cursor: 'pointer',
                boxShadow: tab === t ? '0 1px 6px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {t === 'orders' ? 'Orders' : 'Saved'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>

        {/* ── Orders tab ── */}
        {tab === 'orders' && (
          orders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <p style={{ fontFamily: FB, fontSize: 15, color: INK_MUTED, margin: '0 0 16px' }}>No orders yet.</p>
              <a
                href={'/' + slug + '/menu'}
                style={{ display: 'inline-block', background: ACCENT, color: ACCENT_TEXT, padding: '12px 24px', borderRadius: 12, fontFamily: FB, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}
              >
                Browse menu
              </a>
            </div>
          ) : (
            orders.map(order => {
              const items = (order.items ?? []) as OrderItem[]
              const firstItem = items[0]
              const statusColor = STATUS_COLORS[order.status] ?? INK_MUTED
              const hasTracker = !!order.order_number && order.status !== 'cancelled'
              const trackerUrl = '/menu/' + slug + '/order/' + (order.order_number ?? '')

              return (
                <div
                  key={order.id}
                  style={{
                    background: 'rgba(255,255,255,0.65)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    borderRadius: 18,
                    border: '1px solid rgba(0,0,0,0.05)',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
                    marginBottom: 10,
                    padding: '16px 18px',
                  }}
                >
                  {/* Order header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <p style={{ fontFamily: FB, fontSize: 13, fontWeight: 700, color: INK, margin: '0 0 2px' }}>
                        {'Order ' + (order.order_number ?? order.id.slice(0, 8))}
                      </p>
                      <p style={{ fontFamily: FB, fontSize: 12, color: INK_MUTED, margin: 0 }}>
                        {formatDate(order.created_at) + ' · ' + formatTime(order.created_at)}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: 999,
                        fontFamily: FB, fontSize: 11, fontWeight: 700,
                        background: statusColor + '18', color: statusColor,
                        textTransform: 'capitalize',
                      }}>
                        {order.status}
                      </span>
                      {order.total !== null && (
                        <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 18, color: INK, margin: '4px 0 0', fontWeight: 700 }}>
                          {'$' + (Number(order.total) || 0).toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Items summary */}
                  {firstItem && (
                    <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: '0 0 12px' }}>
                      {(firstItem.product_name ?? 'Item') + (items.length > 1 ? (' + ' + (items.length - 1) + ' more') : '')}
                    </p>
                  )}

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a
                      href={'/' + slug + '/menu'}
                      style={{
                        background: 'rgba(0,0,0,0.06)', color: INK,
                        borderRadius: 10, padding: '8px 14px',
                        fontFamily: FB, fontSize: 13, fontWeight: 600, textDecoration: 'none',
                      }}
                    >
                      Reorder
                    </a>
                    {hasTracker && (
                      <a
                        href={trackerUrl}
                        style={{
                          background: ACCENT, color: ACCENT_TEXT,
                          borderRadius: 10, padding: '8px 14px',
                          fontFamily: FB, fontSize: 13, fontWeight: 700, textDecoration: 'none',
                          boxShadow: '0 0 12px rgba(217,245,78,0.35)',
                        }}
                      >
                        Track order
                      </a>
                    )}
                  </div>
                </div>
              )
            })
          )
        )}

        {/* ── Favourites tab ── */}
        {tab === 'favourites' && (
          favs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <p style={{ fontFamily: FB, fontSize: 15, color: INK_MUTED, margin: '0 0 16px' }}>No saved items yet.</p>
              <a
                href={'/' + slug + '/menu'}
                style={{ display: 'inline-block', background: ACCENT, color: ACCENT_TEXT, padding: '12px 24px', borderRadius: 12, fontFamily: FB, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}
              >
                Browse menu
              </a>
            </div>
          ) : (
            favs.map(fav => (
              <div
                key={fav.id}
                style={{
                  background: 'rgba(255,255,255,0.65)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  borderRadius: 18,
                  border: '1px solid rgba(0,0,0,0.05)',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
                  marginBottom: 10,
                  padding: '16px 18px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <div>
                  <p style={{ fontFamily: FB, fontSize: 15, fontWeight: 700, color: INK, margin: '0 0 2px' }}>
                    {fav.nickname ?? 'Saved item'}
                  </p>
                  <p style={{ fontFamily: FB, fontSize: 12, color: INK_MUTED, margin: 0 }}>
                    {'Added ' + formatDate(fav.created_at)}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a
                    href={'/' + slug + '/item/' + fav.product_id}
                    style={{
                      background: ACCENT, color: ACCENT_TEXT,
                      padding: '8px 14px', borderRadius: 10,
                      fontFamily: FB, fontSize: 13, fontWeight: 700, textDecoration: 'none',
                      boxShadow: '0 0 10px rgba(217,245,78,0.35)',
                    }}
                  >
                    Order
                  </a>
                  <button
                    onClick={() => void removeFav(fav.id, fav.product_id)}
                    style={{
                      background: 'rgba(0,0,0,0.06)', border: 'none',
                      borderRadius: 10, padding: '8px 12px',
                      fontFamily: FB, fontSize: 13, color: INK_MUTED, cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )
        )}
      </div>

      <CxTabBar slug={slug} active="history" />
    </div>
  )
}