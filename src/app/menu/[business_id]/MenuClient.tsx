'use client'
import { useState, useEffect, useCallback } from 'react'

interface ModifierGroup { id: string; name: string; required: boolean; min_select: number; max_select: number; pos_modifiers: Modifier[] }
interface Modifier      { id: string; name: string; price_adjustment: number }
interface Product       { id: string; name: string; description: string | null; price: number; category_id: string | null; image_url: string | null; modifier_groups: ModifierGroup[] }
interface Category      { id: string; name: string; color: string | null }
interface CartItem      { product: Product; qty: number; modifiers: Modifier[]; unit_price: number }

function formatAUD(cents: number) { return `A$${cents.toFixed(2)}` }
function Stars({ n }: { n: number }) { return <span style={{ color: '#F59E0B', fontSize: 12 }}>{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span> }

export default function MenuClient({ businessId }: { businessId: string }) {
  const business_id = businessId
  const [biz,      setBiz]      = useState<{ name: string; address: string | null; city: string | null; logo_url: string | null } | null>(null)
  const [cats,     setCats]     = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading,  setLoading]  = useState(true)
  const [catTab,   setCatTab]   = useState<string | null>(null)
  const [cart,     setCart]     = useState<CartItem[]>([])
  const [showCart, setShowCart] = useState(false)
  const [modal,    setModal]    = useState<Product | null>(null)
  const [selMods,  setSelMods]  = useState<Modifier[]>([])
  const [ordering, setOrdering] = useState(false)
  const [orderDone,setOrderDone]= useState<{ order_number: string; estimated_ready_minutes: number } | null>(null)
  const [form,     setForm]     = useState({ customer_name: '', customer_phone: '', notes: '' })
  const [pickupTime,setPickupTime] = useState('')
  const [errMsg,   setErrMsg]   = useState('')
  const [isOpen,   setIsOpen]   = useState<boolean | null>(null)
  const [todayHours, setTodayHours] = useState<{ open_time: string; close_time: string; is_closed: boolean } | null>(null)

  const load = useCallback(async () => {
    const [bizRes, menuRes] = await Promise.all([
      fetch(`/api/public/business/${business_id}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/public/menu/${business_id}`).then(r => r.json()).catch(() => ({ categories: [], products: [] })),
    ])
    setBiz(bizRes.business ?? null)
    setCats(menuRes.categories ?? [])
    setProducts(menuRes.products ?? [])
    if (menuRes.categories?.[0]) setCatTab(menuRes.categories[0].id)
    setIsOpen(menuRes.is_open ?? null)
    setTodayHours(menuRes.today_hours ?? null)
    setLoading(false)
  }, [business_id])

  useEffect(() => { load() }, [load])

  function openModal(p: Product) { setModal(p); setSelMods([]) }

  function toggleMod(mg: ModifierGroup, mod: Modifier) {
    setSelMods(prev => {
      const has = prev.some(m => m.id === mod.id)
      if (has) return prev.filter(m => m.id !== mod.id)
      const groupSel = prev.filter(m => mg.pos_modifiers.some(pm => pm.id === m.id))
      if (mg.max_select === 1) return [...prev.filter(m => !mg.pos_modifiers.some(pm => pm.id === m.id)), mod]
      if (mg.max_select > 1 && groupSel.length >= mg.max_select) return prev
      return [...prev, mod]
    })
  }

  function addToCart() {
    if (!modal) return
    const modTotal = selMods.reduce((s, m) => s + m.price_adjustment, 0)
    const unit_price = modal.price + modTotal
    setCart(c => {
      const idx = c.findIndex(i => i.product.id === modal.id && JSON.stringify(i.modifiers) === JSON.stringify(selMods))
      if (idx >= 0) { const n = [...c]; n[idx] = { ...n[idx], qty: n[idx].qty + 1 }; return n }
      return [...c, { product: modal, qty: 1, modifiers: [...selMods], unit_price }]
    })
    setModal(null)
    setShowCart(true)
  }

  function changeQty(idx: number, delta: number) {
    setCart(c => { const n = [...c]; n[idx] = { ...n[idx], qty: n[idx].qty + delta }; return n.filter(i => i.qty > 0) })
  }

  const cartTotal = cart.reduce((s, i) => s + i.unit_price * i.qty, 0)
  const cartCount = cart.reduce((s, i) => s + i.qty, 0)

  async function placeOrder() {
    if (!form.customer_name.trim()) { setErrMsg('Please enter your name'); return }
    setOrdering(true); setErrMsg('')
    const res = await fetch(`/api/public/place-order/${business_id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: form.customer_name,
        customer_phone: form.customer_phone || null,
        notes: form.notes || null,
        pickup_time: pickupTime || null,
        source: 'web',
        items: cart.map(i => ({
          product_id: i.product.id, product_name: i.product.name,
          quantity: i.qty, unit_price: i.unit_price,
          modifiers: i.modifiers.map(m => ({ name: m.name, price_adjustment: m.price_adjustment })),
        })),
      }),
    }).then(r => r.json()).catch(() => ({ error: 'Network error' }))

    if (res.error) { setErrMsg(res.error); setOrdering(false); return }
    setOrderDone({ order_number: res.order_number, estimated_ready_minutes: res.estimated_ready_minutes })
    setCart([]); setShowCart(false); setOrdering(false)
  }

  const filtered = catTab ? products.filter(p => p.category_id === catTab) : products

  if (orderDone) return (
    <div style={{ minHeight: '100dvh', background: '#0f1a26', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Manrope',sans-serif", color: '#e8f4f8' }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px', textAlign: 'center' }}>Order placed!</h1>
      <p style={{ fontSize: 20, fontWeight: 700, color: '#7FB897', margin: '0 0 12px' }}>{orderDone.order_number}</p>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 24 }}>
        Ready in approximately <strong style={{ color: '#e8f4f8' }}>{orderDone.estimated_ready_minutes} minutes</strong>
      </p>
      <button onClick={() => { setOrderDone(null); load() }} style={{ padding: '12px 28px', borderRadius: 10, border: 'none', background: '#7FB897', color: '#0f1a26', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
        Order again
      </button>
    </div>
  )

  return (
    <div style={{ minHeight: '100dvh', background: '#f8f9fa', fontFamily: "'Manrope',system-ui,sans-serif", paddingBottom: cartCount > 0 ? 80 : 0 }}>
      {/* Header */}
      <div style={{ background: '#0f1a26', padding: '18px 20px', position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', gap: 12 }}>
        {biz?.logo_url && <img src={biz.logo_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />}
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 800, color: '#e8f4f8', margin: 0 }}>{biz?.name ?? '…'}</h1>
          {biz?.address && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: 0 }}>{biz.city ?? biz.address}</p>}
          {isOpen !== null && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20, background: isOpen ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: isOpen ? '#22c55e' : '#ef4444', border: `1px solid ${isOpen ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, marginTop: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: isOpen ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
              {isOpen ? 'Open now' : todayHours?.is_closed ? 'Closed today' : `Closed · opens ${todayHours?.open_time ?? ''}`}
            </div>
          )}
        </div>
      </div>

      {/* Category tabs */}
      {cats.length > 0 && (
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', overflowX: 'auto', scrollbarWidth: 'none', position: 'sticky', top: 72, zIndex: 99 }}>
          {cats.map(c => (
            <button key={c.id} onClick={() => setCatTab(c.id)}
              style={{ padding: '12px 18px', border: 'none', background: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 13, fontWeight: catTab === c.id ? 700 : 400, color: catTab === c.id ? '#0f1a26' : '#6b7280', borderBottom: catTab === c.id ? '2px solid #0f1a26' : '2px solid transparent', fontFamily: 'inherit' }}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Products grid */}
      <div style={{ padding: '16px 16px 8px', maxWidth: 680, margin: '0 auto' }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[1,2,3,4].map(i => <div key={i} style={{ height: 160, borderRadius: 12, background: '#e5e7eb', animation: 'pulse 1.5s infinite' }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0' }}>No items in this category</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
            {filtered.map(p => (
              <button key={p.id} onClick={() => openModal(p)}
                style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', fontFamily: 'inherit' }}>
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ width: '100%', height: 110, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>☕</div>
                )}
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1a26', lineHeight: 1.3 }}>{p.name}</div>
                  {p.description && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>{p.description}</div>}
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#0f1a26', marginTop: 6 }}>{formatAUD(p.price)}</div>
                  {p.modifier_groups?.length > 0 && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>Customisable</div>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Modifier modal */}
      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '80dvh', overflowY: 'auto', padding: '20px 20px 32px', maxWidth: 540, margin: '0 auto' }}>
            {modal.image_url && <img src={modal.image_url} alt="" style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 12, marginBottom: 14, display: 'block' }} />}
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px' }}>{modal.name}</h2>
            {modal.description && <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>{modal.description}</p>}
            <p style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>{formatAUD(modal.price + selMods.reduce((s, m) => s + m.price_adjustment, 0))}</p>

            {modal.modifier_groups?.map(mg => (
              <div key={mg.id} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                  {mg.name} {mg.required && <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 700 }}>Required</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {mg.pos_modifiers.map(mod => {
                    const sel = selMods.some(m => m.id === mod.id)
                    return (
                      <button key={mod.id} onClick={() => toggleMod(mg, mod)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, border: `2px solid ${sel ? '#0f1a26' : '#e5e7eb'}`, background: sel ? 'rgba(15,26,38,0.05)' : '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                        <span style={{ fontSize: 13, fontWeight: sel ? 700 : 400 }}>{mod.name}</span>
                        {mod.price_adjustment !== 0 && <span style={{ fontSize: 12, color: '#6b7280' }}>+{formatAUD(mod.price_adjustment)}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            <button onClick={addToCart}
              style={{ width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', background: '#0f1a26', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginTop: 8 }}>
              Add to order — {formatAUD(modal.price + selMods.reduce((s, m) => s + m.price_adjustment, 0))}
            </button>
          </div>
        </div>
      )}

      {/* Floating cart button */}
      {cartCount > 0 && !showCart && (
        <div style={{ position: 'fixed', bottom: 24, left: 0, right: 0, padding: '0 20px', zIndex: 150, maxWidth: 540, margin: '0 auto' }}>
          <button onClick={() => setShowCart(true)}
            style={{ width: '100%', padding: '14px 20px', borderRadius: 14, border: 'none', background: '#0f1a26', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ background: '#7FB897', color: '#0f1a26', borderRadius: '50%', width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>{cartCount}</span>
            <span>View order</span>
            <span>{formatAUD(cartTotal)}</span>
          </button>
        </div>
      )}

      {/* Cart drawer */}
      {showCart && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '90dvh', overflowY: 'auto', padding: '20px 20px 40px', maxWidth: 540, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Your order</h2>
              <button onClick={() => setShowCart(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6b7280' }}>×</button>
            </div>

            {cart.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{item.product.name}</div>
                  {item.modifiers.length > 0 && <div style={{ fontSize: 11, color: '#9ca3af' }}>{item.modifiers.map(m => m.name).join(', ')}</div>}
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{formatAUD(item.unit_price)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => changeQty(idx, -1)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                  <span style={{ fontSize: 14, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{item.qty}</span>
                  <button onClick={() => changeQty(idx, 1)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', fontSize: 16, fontWeight: 800, borderBottom: '2px solid #0f1a26', marginBottom: 16 }}>
              <span>Total</span><span>{formatAUD(cartTotal)}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="Your name *" style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
              <input value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} placeholder="Phone (for SMS notification)" type="tel" style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
              <input value={pickupTime} onChange={e => setPickupTime(e.target.value)} type="datetime-local" placeholder="Pickup time (optional)" style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Special instructions (optional)" rows={2} style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'none' }} />
            </div>

            {errMsg && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 10 }}>{errMsg}</p>}

            <button onClick={placeOrder} disabled={ordering || !form.customer_name.trim()}
              style={{ width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', background: ordering || !form.customer_name.trim() ? '#9ca3af' : '#7FB897', color: '#0f1a26', fontSize: 15, fontWeight: 700, cursor: ordering || !form.customer_name.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {ordering ? 'Placing order…' : `Place order — ${formatAUD(cartTotal)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
