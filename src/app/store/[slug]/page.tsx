'use client'
import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'

// WIRE-6 — public storefront. Reads canonical pos_online_settings (by slug) + pos_products menu,
// themed; pickup/delivery per settings; min-order enforced; checkout → /api/public/place-order.
interface Product { id: string; name: string; price: number; category: string | null; image_url: string | null }
interface Store { business_id: string; store_name: string; slug: string; accept_orders: boolean; delivery_enabled: boolean; pickup_enabled: boolean; min_order_amount: number; delivery_fee: number; prep_time_minutes: number | null; theme: string | null }

const money = (n: number) => '$' + n.toFixed(2)

export default function StorefrontPage() {
  // BUGFIX-BOOK-USE-HOOK: Next 14 passes params as a plain object — use(params) threw. useParams() is correct.
  const slug = (useParams()?.slug as string) ?? ''
  const [store, setStore] = useState<Store | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [cart, setCart] = useState<Record<string, number>>({})
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup')
  const [form, setForm] = useState({ customer_name: '', customer_phone: '', customer_email: '', notes: '', delivery_address: '' })
  const [placing, setPlacing] = useState(false)
  const [placed, setPlaced] = useState<{ order_number: string; total: number } | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch(`/api/public/store/${slug}`).then(r => r.json()).then(d => {
      if (d.error) { setNotFound(true); return }
      setStore(d.store); setProducts(d.products ?? [])
      setFulfillment(d.store.pickup_enabled ? 'pickup' : 'delivery')
    }).catch(() => setNotFound(true)).finally(() => setLoading(false))
  }, [slug])

  const theme = store?.theme || '#2D5240'
  const cats = useMemo(() => { const m: Record<string, Product[]> = {}; for (const p of products) { const c = p.category || 'Menu'; (m[c] ??= []).push(p) } return m }, [products])
  const itemsArr = useMemo(() => Object.entries(cart).filter(([, q]) => q > 0).map(([id, q]) => { const p = products.find(x => x.id === id)!; return { product_id: id, product_name: p.name, quantity: q, unit_price: Number(p.price) } }), [cart, products])
  const subtotal = itemsArr.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const deliveryFee = fulfillment === 'delivery' ? Number(store?.delivery_fee ?? 0) : 0
  const total = subtotal + deliveryFee
  const minOrder = Number(store?.min_order_amount ?? 0)
  const belowMin = subtotal > 0 && subtotal < minOrder

  function setQty(id: string, delta: number) { setCart(c => { const n = { ...c }; n[id] = Math.max(0, (n[id] ?? 0) + delta); if (n[id] === 0) delete n[id]; return n }) }

  async function checkout() {
    setErr('')
    if (!form.customer_name.trim()) { setErr('Please enter your name.'); return }
    if (itemsArr.length === 0) { setErr('Your cart is empty.'); return }
    if (belowMin) { setErr(`Minimum order is ${money(minOrder)}.`); return }
    if (fulfillment === 'delivery' && !form.delivery_address.trim()) { setErr('Please enter a delivery address.'); return }
    setPlacing(true)
    try {
      const r = await fetch(`/api/public/place-order/${slug}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_name: form.customer_name, customer_phone: form.customer_phone || undefined, customer_email: form.customer_email || undefined, items: itemsArr, notes: form.notes || undefined, fulfillment_type: fulfillment, source: 'storefront' }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Order failed')
      setPlaced({ order_number: d.order_number, total: d.total })
    } catch (e) { setErr((e as Error).message) } finally { setPlacing(false) }
  }

  if (loading) return <Centered>Loading store…</Centered>
  if (notFound || !store) return <Centered>This store isn’t available.</Centered>

  if (placed) return (
    <div style={{ minHeight: '100vh', background: '#f6f5f1', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 18, padding: 36, maxWidth: 420, textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,.12)' }}>
        <div style={{ fontSize: 44 }}>✅</div>
        <h1 style={{ fontFamily: 'var(--font-display, Georgia, serif)', fontStyle: 'italic', fontSize: 28, color: theme, margin: '8px 0' }}>Order placed!</h1>
        <p style={{ color: '#555', fontSize: 14 }}>Order <b>{placed.order_number}</b> · {money(placed.total)}</p>
        <p style={{ color: '#888', fontSize: 13, marginTop: 8 }}>{store.store_name} will confirm shortly{store.prep_time_minutes ? ` (≈${store.prep_time_minutes} min prep)` : ''}.</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f6f5f1', color: '#1d2a24', fontFamily: 'var(--font-body, system-ui, sans-serif)', paddingBottom: 120 }}>
      <header style={{ background: theme, color: '#fff', padding: '28px 20px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <h1 style={{ fontFamily: 'var(--font-display, Georgia, serif)', fontStyle: 'italic', fontSize: 34, fontWeight: 600, margin: 0 }}>{store.store_name}</h1>
          <p style={{ opacity: .85, fontSize: 13, marginTop: 4 }}>{store.accept_orders ? 'Order online' : 'Currently not accepting orders'}{store.prep_time_minutes ? ` · ~${store.prep_time_minutes} min` : ''}</p>
        </div>
      </header>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '18px 16px' }}>
        {/* fulfillment toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {store.pickup_enabled && <Toggle active={fulfillment === 'pickup'} onClick={() => setFulfillment('pickup')} theme={theme}>Pickup</Toggle>}
          {store.delivery_enabled && <Toggle active={fulfillment === 'delivery'} onClick={() => setFulfillment('delivery')} theme={theme}>Delivery {store.delivery_fee > 0 ? `(+${money(store.delivery_fee)})` : ''}</Toggle>}
        </div>

        {Object.entries(cats).map(([cat, items]) => (
          <section key={cat} style={{ marginBottom: 22 }}>
            <h2 style={{ fontFamily: 'var(--font-display, Georgia, serif)', fontStyle: 'italic', fontSize: 22, color: theme, margin: '0 0 10px', textTransform: 'capitalize' }}>{cat}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(p => (
                <div key={p.id} style={{ background: '#fff', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14.5 }}>{p.name}</div>
                    <div style={{ fontSize: 13, color: theme, fontWeight: 700 }}>{money(Number(p.price))}</div>
                  </div>
                  {cart[p.id] ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Round onClick={() => setQty(p.id, -1)} theme={theme}>−</Round>
                      <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 700 }}>{cart[p.id]}</span>
                      <Round onClick={() => setQty(p.id, 1)} theme={theme}>+</Round>
                    </div>
                  ) : (
                    <button onClick={() => setQty(p.id, 1)} disabled={!store.accept_orders} style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: theme, color: '#fff', fontWeight: 700, fontSize: 13, cursor: store.accept_orders ? 'pointer' : 'not-allowed', opacity: store.accept_orders ? 1 : .5, fontFamily: 'inherit' }}>Add</button>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* cart / checkout bar */}
      {itemsArr.length > 0 && store.accept_orders && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #e6e6e6', boxShadow: '0 -4px 20px rgba(0,0,0,.08)', padding: 16 }}>
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {err && <div style={{ color: '#E24B4A', fontSize: 13 }}>{err}</div>}
            {belowMin && <div style={{ color: '#BA7517', fontSize: 12.5 }}>Add {money(minOrder - subtotal)} more to reach the {money(minOrder)} minimum.</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input placeholder="Your name *" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} style={inp} />
              <input placeholder="Phone" value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} style={inp} />
              {fulfillment === 'delivery' && <input placeholder="Delivery address *" value={form.delivery_address} onChange={e => setForm(f => ({ ...f, delivery_address: e.target.value }))} style={{ ...inp, flexBasis: '100%' }} />}
            </div>
            <button onClick={checkout} disabled={placing || belowMin} style={{ padding: '13px', borderRadius: 11, border: 'none', background: theme, color: '#fff', fontWeight: 700, fontSize: 15, cursor: placing || belowMin ? 'not-allowed' : 'pointer', opacity: placing || belowMin ? .6 : 1, fontFamily: 'inherit' }}>
              {placing ? 'Placing…' : `Place ${fulfillment} order · ${money(total)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const inp: React.CSSProperties = { flex: 1, minWidth: 120, padding: '9px 11px', borderRadius: 9, border: '1px solid #d8ddd8', fontSize: 13.5, fontFamily: 'inherit' }
function Centered({ children }: { children: React.ReactNode }) { return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7d74', fontFamily: 'system-ui' }}>{children}</div> }
function Toggle({ active, onClick, theme, children }: { active: boolean; onClick: () => void; theme: string; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ padding: '8px 18px', borderRadius: 99, border: `1.5px solid ${active ? theme : '#d8ddd8'}`, background: active ? theme : '#fff', color: active ? '#fff' : '#555', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{children}</button>
}
function Round({ onClick, theme, children }: { onClick: () => void; theme: string; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ width: 30, height: 30, borderRadius: '50%', border: `1.5px solid ${theme}`, background: '#fff', color: theme, fontWeight: 700, fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>{children}</button>
}
