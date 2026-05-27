'use client'
import { useEffect, useMemo, useState } from 'react'

interface CartItem { product: { id: string; name: string; stock_quantity?: number | null; track_stock?: boolean }; qty: number }
interface Customer { id: string; name?: string; last_visit_at?: string | null }

interface StaffingPayload { status: 'overstaffed' | 'understaffed' | 'ok'; message: string }
interface PromoSuggestion { suggestion: string }

const C = {
  amber: '#f59e0b', red: '#ef4444', green: '#7FB897', violet: '#A78BFA',
}

function badge(bg: string, fg: string, label: string, sub?: string, onDismiss?: () => void) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: bg, border: `1px solid ${fg}40`, marginBottom: 6 }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: fg, margin: 0 }}>{label}</p>
        {sub && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: '2px 0 0' }}>{sub}</p>}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
      )}
    </div>
  )
}

export function LiveIntelligenceBadges({
  cart,
  customer,
  onApplyWinbackDiscount,
}: {
  cart: CartItem[]
  customer: Customer | null
  onApplyWinbackDiscount?: (pct: number) => void
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [staffing, setStaffing] = useState<StaffingPayload | null>(null)
  const [lastSaleAt, setLastSaleAt] = useState<number>(Date.now())
  const [now, setNow] = useState<number>(Date.now())
  const [promoLoading, setPromoLoading] = useState(false)
  const [promo, setPromo] = useState<string>('')

  function dismiss(key: string) { setDismissed(s => { const n = new Set(s); n.add(key); return n }) }

  // Feature 1: live staffing — poll every 30 min
  useEffect(() => {
    let alive = true
    async function load() {
      const r = await fetch('/api/pos/live-staffing').then(r => r.json()).catch(() => null)
      if (alive && r) setStaffing(r)
    }
    load()
    const id = setInterval(load, 30 * 60_000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  // Feature 4: track last sale time → after 40min idle, show slow patch card
  useEffect(() => {
    if (cart.length === 0) setLastSaleAt(Date.now())
  }, [cart.length])
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Feature 6: low stock warnings for items in cart
  const lowStockItems = useMemo(() => {
    return cart.filter(i => i.product.track_stock).map(i => {
      const remaining = Number(i.product.stock_quantity ?? 0) - i.qty
      return { id: i.product.id, name: i.product.name, remaining }
    }).filter(x => x.remaining <= 3)
  }, [cart])

  // Feature 7: customer winback at till
  const winbackDays = customer?.last_visit_at
    ? Math.floor((Date.now() - new Date(customer.last_visit_at).getTime()) / 86400_000)
    : null

  const idleMinutes = Math.floor((now - lastSaleAt) / 60_000)
  const hour = new Date().getHours()
  const inTradingHours = hour >= 8 && hour <= 21
  const showSlowPatch = idleMinutes >= 40 && inTradingHours && !dismissed.has('slow-patch')

  async function suggestPromo() {
    setPromoLoading(true)
    const r = await fetch('/api/pos/quick-promo-suggest', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
    }).then(r => r.json()).catch(() => null) as PromoSuggestion | null
    setPromo(r?.suggestion ?? 'Try a flash A$2-off coffee for the next 30 minutes.')
    setPromoLoading(false)
  }

  // Render
  const cards = []

  if (staffing && (staffing.status === 'overstaffed' || staffing.status === 'understaffed') && !dismissed.has('staffing')) {
    cards.push(
      <div key="staffing">{badge(staffing.status === 'overstaffed' ? 'rgba(245,158,11,0.08)' : 'rgba(167,139,250,0.08)', staffing.status === 'overstaffed' ? C.amber : C.violet, staffing.message, undefined, () => dismiss('staffing'))}</div>
    )
  }

  if (showSlowPatch) {
    cards.push(
      <div key="slow">{badge('rgba(96,165,250,0.08)', '#60a5fa', `Quiet patch — ${idleMinutes} min since last sale`, undefined, () => dismiss('slow-patch'))}
        <div style={{ display: 'flex', gap: 6, marginTop: -2, marginBottom: 6 }}>
          <button onClick={suggestPromo} disabled={promoLoading} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#60a5fa', color: '#0a0a0f', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: promoLoading ? 0.6 : 1 }}>{promoLoading ? '✦ Thinking…' : '✦ Suggest a promo'}</button>
          {promo && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', alignSelf: 'center' }}>{promo}</span>}
        </div>
      </div>
    )
  }

  for (const item of lowStockItems) {
    if (dismissed.has('stock:' + item.id)) continue
    const label = item.remaining <= 0
      ? `⚠️ Last one of ${item.name} — reorder soon`
      : `⚠️ Only ${item.remaining} of ${item.name} left after this sale`
    cards.push(<div key={'stock:' + item.id}>{badge('rgba(239,68,68,0.06)', C.red, label, undefined, () => dismiss('stock:' + item.id))}</div>)
  }

  if (customer && winbackDays !== null && winbackDays > 30 && !dismissed.has('winback')) {
    cards.push(
      <div key="winback">{badge('rgba(127,184,151,0.08)', C.green, `${customer.name ?? 'This customer'} hasn't visited in ${winbackDays > 60 ? Math.round(winbackDays / 7) + ' weeks' : winbackDays + ' days'}`, 'Offer a 10% win-back discount?', () => dismiss('winback'))}
        {onApplyWinbackDiscount && (
          <button onClick={() => { onApplyWinbackDiscount(10); dismiss('winback') }} style={{ marginTop: -2, marginBottom: 6, padding: '5px 12px', borderRadius: 6, border: 'none', background: C.green, color: '#0a0a0f', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Apply 10% win-back</button>
        )}
      </div>
    )
  }

  if (cards.length === 0) return null

  return <div style={{ marginTop: 8 }}>{cards}</div>
}
