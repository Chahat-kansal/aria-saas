'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

interface Product  { id: string; name: string; price: number; image_url: string | null; category_id: string | null; modifier_groups: Array<{ id: string; name: string; required: boolean; max_select: number; pos_modifiers: Array<{ id: string; name: string; price_adjustment: number }> }> }
interface Category { id: string; name: string }
interface CartItem { product: Product; qty: number; modifiers: Array<{ id: string; name: string; price_adjustment: number }>; unit_price: number }

export default function KioskPage() {
  const { outlet_id } = useParams<{ outlet_id: string }>()
  const searchParams = useSearchParams()
  const tableId = searchParams.get('table')
  const [bizId,    setBizId]    = useState('')
  const [cats,     setCats]     = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [catTab,   setCatTab]   = useState<string | null>(null)
  const [cart,     setCart]     = useState<CartItem[]>([])
  const [modal,    setModal]    = useState<Product | null>(null)
  const [selMods,  setSelMods]  = useState<Array<{ id: string; name: string; price_adjustment: number }>>([])
  const [step,     setStep]     = useState<'menu' | 'checkout' | 'done'>('menu')
  const [form,     setForm]     = useState({ customer_name: '', customer_phone: '' })
  const [ordering, setOrdering] = useState(false)
  const [orderNum, setOrderNum] = useState('')

  const load = useCallback(async () => {
    const { data: outlet } = await fetch(`/api/pos/outlets`).then(r => r.json()).catch(() => ({ data: null }))
    // get bizId from outlet
    const res = await fetch(`/api/public/business/${outlet_id}`).then(r => r.json()).catch(() => ({}))
    // outlet_id IS the outlet ID so we get menu from there — actually we need business_id
    // Fallback: use outlet_id as business_id for menu (kiosk URL may use either)
    const menuBizId = res.business?.id ?? outlet_id
    setBizId(menuBizId)
    const menuRes = await fetch(`/api/public/menu/${menuBizId}`).then(r => r.json()).catch(() => ({ categories: [], products: [] }))
    setCats(menuRes.categories ?? [])
    setProducts(menuRes.products ?? [])
    if (menuRes.categories?.[0]) setCatTab(menuRes.categories[0].id)
  }, [outlet_id])

  useEffect(() => { load() }, [load])

  function addToCart(p: Product) {
    if (p.modifier_groups?.length > 0) { setModal(p); setSelMods([]); return }
    setCart(c => {
      const idx = c.findIndex(i => i.product.id === p.id)
      if (idx >= 0) { const n = [...c]; n[idx] = { ...n[idx], qty: n[idx].qty + 1 }; return n }
      return [...c, { product: p, qty: 1, modifiers: [], unit_price: p.price }]
    })
  }

  function confirmMods() {
    if (!modal) return
    const modTotal = selMods.reduce((s, m) => s + m.price_adjustment, 0)
    setCart(c => [...c, { product: modal, qty: 1, modifiers: [...selMods], unit_price: modal.price + modTotal }])
    setModal(null)
  }

  async function placeOrder() {
    if (!form.customer_name.trim() && !tableId) return
    setOrdering(true)
    const res = await fetch(`/api/public/order/${bizId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: form.customer_name || (tableId ? `Table ${tableId}` : 'Kiosk'),
        customer_phone: form.customer_phone || null,
        table_id: tableId ?? null,
        source: 'kiosk',
        items: cart.map(i => ({
          product_id: i.product.id, product_name: i.product.name,
          quantity: i.qty, unit_price: i.unit_price,
          modifiers: i.modifiers.map(m => ({ name: m.name, price_adjustment: m.price_adjustment })),
        })),
      }),
    }).then(r => r.json()).catch(() => ({ error: 'Network error' }))
    if (res.ok) { setOrderNum(res.order_number); setStep('done'); setCart([]) }
    setOrdering(false)
  }

  const cartTotal = cart.reduce((s, i) => s + i.unit_price * i.qty, 0)
  const cartCount = cart.reduce((s, i) => s + i.qty, 0)
  const filtered  = catTab ? products.filter(p => p.category_id === catTab) : products

  if (step === 'done') return (
    <div style={{ minHeight: '100dvh', background: '#0f1a26', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'Manrope',sans-serif", color: '#e8f4f8', textAlign: 'center', padding: 32 }}>
      <div style={{ fontSize: 80, marginBottom: 20 }}>✅</div>
      <h1 style={{ fontSize: 36, fontWeight: 900, margin: '0 0 12px' }}>Order placed!</h1>
      <p style={{ fontSize: 28, fontWeight: 700, color: '#7FB897', margin: '0 0 16px' }}>{orderNum}</p>
      <p style={{ fontSize: 20, color: 'rgba(255,255,255,0.6)' }}>We&apos;ll call your name when it&apos;s ready.</p>
      <button onClick={() => { setStep('menu'); setForm({ customer_name: '', customer_phone: '' }) }} style={{ marginTop: 32, padding: '18px 40px', borderRadius: 14, border: 'none', background: '#7FB897', color: '#0f1a26', fontSize: 20, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
        New order
      </button>
    </div>
  )

  return (
    <div style={{ minHeight: '100dvh', background: '#f8f9fa', fontFamily: "'Manrope',system-ui,sans-serif" }}>
      {/* Category bar */}
      <div style={{ background: '#0f1a26', padding: '12px 16px', display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {cats.map(c => (
          <button key={c.id} onClick={() => setCatTab(c.id)}
            style={{ padding: '10px 20px', borderRadius: 40, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: catTab === c.id ? 700 : 400, background: catTab === c.id ? '#7FB897' : 'rgba(255,255,255,0.1)', color: catTab === c.id ? '#0f1a26' : '#fff', whiteSpace: 'nowrap' }}>
            {c.name}
          </button>
        ))}
      </div>

      {step === 'menu' && (
        <div style={{ padding: 16, paddingBottom: cartCount > 0 ? 100 : 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 14 }}>
            {filtered.map(p => (
              <button key={p.id} onClick={() => addToCart(p)}
                style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', fontFamily: 'inherit' }}>
                {p.image_url
                  ? <img src={p.image_url} alt={p.name} style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
                  : <div style={{ width: '100%', height: 140, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>☕</div>}
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4, color: '#0f1a26' }}>A${p.price.toFixed(2)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modifier modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 20, maxWidth: 480, width: '100%', padding: 24, maxHeight: '80dvh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 16px' }}>{modal.name}</h2>
            {modal.modifier_groups.map(mg => (
              <div key={mg.id} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{mg.name}</div>
                {mg.pos_modifiers.map(mod => {
                  const sel = selMods.some(m => m.id === mod.id)
                  return (
                    <button key={mod.id} onClick={() => setSelMods(prev => sel ? prev.filter(m => m.id !== mod.id) : mg.max_select === 1 ? [...prev.filter(m => !mg.pos_modifiers.some(pm => pm.id === m.id)), mod] : [...prev, mod])}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '12px 16px', borderRadius: 10, border: `2px solid ${sel ? '#0f1a26' : '#e5e7eb'}`, background: sel ? '#f0f4f8' : '#fff', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 6, fontSize: 15 }}>
                      {mod.name} {mod.price_adjustment !== 0 && <span style={{ color: '#6b7280' }}>+A${mod.price_adjustment.toFixed(2)}</span>}
                    </button>
                  )
                })}
              </div>
            ))}
            <button onClick={confirmMods} style={{ width: '100%', padding: '16px', borderRadius: 12, border: 'none', background: '#0f1a26', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Add to order
            </button>
          </div>
        </div>
      )}

      {/* Cart bar */}
      {cartCount > 0 && step === 'menu' && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 16px', background: '#fff', borderTop: '1px solid #e5e7eb', zIndex: 150 }}>
          <button onClick={() => setStep('checkout')} style={{ width: '100%', padding: '16px', borderRadius: 12, border: 'none', background: '#0f1a26', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ background: '#7FB897', color: '#0f1a26', borderRadius: '50%', width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>{cartCount}</span>
            <span>Checkout</span>
            <span>A${cartTotal.toFixed(2)}</span>
          </button>
        </div>
      )}

      {/* Checkout step */}
      {step === 'checkout' && (
        <div style={{ padding: 20, maxWidth: 480, margin: '0 auto' }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 20 }}>Your details</h2>
          {!tableId && <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="Your name *" style={{ display: 'block', width: '100%', padding: '14px 16px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 16, marginBottom: 10, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />}
          <input value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} placeholder="Phone (optional)" type="tel" style={{ display: 'block', width: '100%', padding: '14px 16px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 16, marginBottom: 20, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          <div style={{ marginBottom: 20 }}>
            {cart.map((i, idx) => <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 15 }}><span>{i.qty}× {i.product.name}</span><span>A${(i.unit_price * i.qty).toFixed(2)}</span></div>)}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: 18, fontWeight: 800 }}><span>Total</span><span>A${cartTotal.toFixed(2)}</span></div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep('menu')} style={{ flex: 1, padding: '16px', borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Back</button>
            <button onClick={placeOrder} disabled={ordering} style={{ flex: 2, padding: '16px', borderRadius: 12, border: 'none', background: '#7FB897', color: '#0f1a26', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: ordering ? 0.7 : 1 }}>{ordering ? 'Placing…' : 'Place order'}</button>
          </div>
        </div>
      )}
    </div>
  )
}