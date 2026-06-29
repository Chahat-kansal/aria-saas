'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import QRCode from 'qrcode'

const GREEN = '#2D5240'
const SAGE = '#7FB897'
const DARK = '#0f1a26'
const MUTED = '#6b7280'
const BORDER = '#e5e7eb'
const BG = '#fafafa'
const CARD = '#fff'
const RED = '#ef4444'
const FONT_BODY = "'Inter',system-ui,sans-serif"
const FONT_BRAND = "'Fraunces',Georgia,serif"

function fmtPrice(dollars: number) { return 'A$' + dollars.toFixed(2) }

interface Category { id: string; name: string; color: string | null }
interface Product {
  id: string; name: string; description: string | null; price: number;
  image_url: string | null; sort_order: number | null; category_id: string | null
}
interface CartItem { product: Product; qty: number; unit_price: number }
type ItemOverride = { desc?: string; photo_url?: string; badge?: string; price_override?: number; hidden?: boolean }

interface Props {
  businessId: string
  slug: string
  businessName: string
  logoUrl: string | null
  orderingEnabled: boolean
  menuUrl: string
  sectionOrder: string[] | null
  itemOverrides: Record<string, ItemOverride> | null
}

function PlaceholderImg() {
  return (
    <div style={{ width: '100%', height: 118, background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, color: '#c4c4c8' }}>
      ☕
    </div>
  )
}

export default function MenuClient({ businessId, slug: _slug, businessName, logoUrl, orderingEnabled, menuUrl, sectionOrder, itemOverrides }: Props) {
  const [cats, setCats] = useState<Category[]>([])
  const [rawProducts, setRawProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCat, setActiveCat] = useState<string | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCart, setShowCart] = useState(false)
  const [showCheckout, setShowCheckout] = useState(false)
  const [productModal, setProductModal] = useState<Product | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [ordering, setOrdering] = useState(false)
  const [orderDone, setOrderDone] = useState<{ order_number: string; estimated_ready_minutes: number; total: number } | null>(null)
  const [checkoutForm, setCheckoutForm] = useState({ name: '', phone: '', email: '', fulfillment_type: 'pickup', special_instructions: '', payment_method: 'pay_on_pickup' })
  const [checkoutError, setCheckoutError] = useState('')
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const load = useCallback(async () => {
    const res = await fetch('/api/public/menu/' + businessId).then(r => r.json()).catch(() => ({ categories: [], products: [] }))
    const rawCats: Category[] = res.categories ?? []
    const prods: Product[] = res.products ?? []

    // Apply section_order if configured
    let orderedCats = rawCats
    if (sectionOrder && sectionOrder.length > 0) {
      const pos: Record<string, number> = {}
      sectionOrder.forEach((id, i) => { pos[id] = i })
      orderedCats = [...rawCats].sort((a, b) => {
        const ai = pos[a.id] ?? 9999
        const bi = pos[b.id] ?? 9999
        return ai !== bi ? ai - bi : a.name.localeCompare(b.name)
      })
    }

    setCats(orderedCats)
    setRawProducts(prods)
    if (orderedCats[0]) setActiveCat(prev => prev ?? orderedCats[0].id)
    setLoading(false)
  }, [businessId, sectionOrder])

  useEffect(() => { load() }, [load])

  // Generate QR code lazily when share modal first opens
  useEffect(() => {
    if (!showQr || qrDataUrl) return
    QRCode.toDataURL(menuUrl, { width: 240, margin: 2, color: { dark: DARK, light: CARD } })
      .then(url => setQrDataUrl(url))
      .catch(() => null)
  }, [showQr, qrDataUrl, menuUrl])

  // Apply item_overrides: filter hidden, apply field overrides
  const products = rawProducts
    .filter(p => !(itemOverrides?.[p.id]?.hidden))
    .map(p => {
      const ov = itemOverrides?.[p.id]
      if (!ov) return p
      return {
        ...p,
        description: ov.desc !== undefined ? ov.desc : p.description,
        image_url: ov.photo_url !== undefined ? ov.photo_url : p.image_url,
        price: ov.price_override !== undefined ? ov.price_override : p.price,
      }
    })

  const cartCount = cart.reduce((s, i) => s + i.qty, 0)
  const cartTotal = cart.reduce((s, i) => s + i.unit_price * i.qty, 0)

  function addToCart(p: Product) {
    setCart(c => {
      const idx = c.findIndex(i => i.product.id === p.id)
      if (idx >= 0) { const n = [...c]; n[idx] = { ...n[idx], qty: n[idx].qty + 1 }; return n }
      return [...c, { product: p, qty: 1, unit_price: p.price }]
    })
  }

  function changeQty(idx: number, delta: number) {
    setCart(c => { const n = [...c]; n[idx] = { ...n[idx], qty: n[idx].qty + delta }; return n.filter(i => i.qty > 0) })
  }

  function scrollToSection(catId: string) {
    setActiveCat(catId)
    const el = sectionRefs.current[catId]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function placeOrder() {
    if (!checkoutForm.name.trim() || !checkoutForm.phone.trim()) {
      setCheckoutError('Please enter your name and phone number'); return
    }
    setOrdering(true); setCheckoutError('')
    const res = await fetch('/api/public/place-order/' + businessId, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: checkoutForm.name,
        customer_phone: checkoutForm.phone,
        customer_email: checkoutForm.email || null,
        fulfillment_type: checkoutForm.fulfillment_type,
        special_instructions: checkoutForm.special_instructions || null,
        payment_method: checkoutForm.payment_method,
        source: 'web',
        items: cart.map(i => ({
          product_id: i.product.id, product_name: i.product.name,
          quantity: i.qty, unit_price: i.unit_price, modifiers: [],
        })),
      }),
    }).then(r => r.json()).catch(() => ({ error: 'Network error' }))
    if (res.error) { setCheckoutError(res.error); setOrdering(false); return }
    setOrderDone({ order_number: res.order_number, estimated_ready_minutes: res.estimated_ready_minutes, total: cartTotal })
    setCart([]); setShowCart(false); setShowCheckout(false); setOrdering(false)
  }

  function copyLink() {
    navigator.clipboard.writeText(menuUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  // ── Order done screen ──
  if (orderDone) return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: BG, padding: 24, textAlign: 'center', fontFamily: FONT_BODY }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 20px' }}>✓</div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: DARK, margin: '0 0 8px', fontFamily: FONT_BRAND, fontStyle: 'italic' }}>Order placed!</h1>
      <p style={{ color: MUTED, fontSize: 14, margin: '0 0 24px' }}>We have received your order and will have it ready soon.</p>
      <div style={{ background: CARD, borderRadius: 18, padding: 24, marginBottom: 24, boxShadow: '0 2px 16px rgba(0,0,0,0.08)', maxWidth: 320, width: '100%' }}>
        <p style={{ fontSize: 11, color: MUTED, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Order number</p>
        <p style={{ fontSize: 30, fontWeight: 800, color: DARK, margin: '0 0 20px', letterSpacing: 2, fontFamily: FONT_BRAND, fontStyle: 'italic' }}>{orderDone.order_number}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid ' + BORDER, paddingTop: 16 }}>
          <div>
            <p style={{ fontSize: 11, color: MUTED, margin: '0 0 2px' }}>Total</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: GREEN, margin: 0, fontFamily: FONT_BRAND, fontStyle: 'italic' }}>{fmtPrice(orderDone.total)}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: MUTED, margin: '0 0 2px' }}>Ready in approx.</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: DARK, margin: 0 }}>{orderDone.estimated_ready_minutes} min</p>
          </div>
        </div>
      </div>
      <button
        onClick={() => { setOrderDone(null); setCheckoutForm({ name: '', phone: '', email: '', fulfillment_type: 'pickup', special_instructions: '', payment_method: 'pay_on_pickup' }) }}
        style={{ padding: '14px 36px', borderRadius: 14, border: 'none', background: GREEN, color: SAGE, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_BODY }}
      >
        Back to menu
      </button>
    </div>
  )

  // ── Main layout ──
  return (
    <div style={{ minHeight: '100dvh', background: BG, fontFamily: FONT_BODY, paddingBottom: orderingEnabled && cartCount > 0 ? 88 : 0 }}>

      {/* STICKY HEADER */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: CARD, borderBottom: '1px solid ' + BORDER }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          {logoUrl && (
            <img src={logoUrl} alt="" style={{ width: 38, height: 38, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: DARK, margin: 0, fontFamily: FONT_BRAND, fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {businessName}
            </h1>
            {orderingEnabled && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#16a34a', marginTop: 2 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
                Ordering open
              </div>
            )}
          </div>
          <button
            onClick={() => setShowQr(true)}
            title="Share menu"
            style={{ width: 36, height: 36, borderRadius: 10, border: '1.5px solid ' + BORDER, background: CARD, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}
          >
            ⬡
          </button>
        </div>

        {/* CATEGORY PILLS */}
        {cats.length > 0 && (
          <div style={{ overflowX: 'auto', scrollbarWidth: 'none', display: 'flex', gap: 8, padding: '0 18px 12px', maxWidth: 680, margin: '0 auto' }}>
            {cats.map(c => (
              <button
                key={c.id}
                onClick={() => scrollToSection(c.id)}
                style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 20, border: activeCat === c.id ? ('2px solid ' + GREEN) : ('2px solid ' + BORDER), background: activeCat === c.id ? GREEN : CARD, color: activeCat === c.id ? SAGE : MUTED, fontSize: 13, fontWeight: activeCat === c.id ? 700 : 500, cursor: 'pointer', fontFamily: FONT_BODY }}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* MENU SECTIONS */}
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 18px 32px' }}>
        {loading ? (
          <div style={{ padding: '24px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} style={{ borderRadius: 14, background: '#e5e7eb', height: 200 }} />
            ))}
          </div>
        ) : cats.length === 0 || products.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: MUTED }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>☕</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: DARK, margin: '0 0 6px' }}>Menu coming soon</p>
            <p style={{ fontSize: 13 }}>Check back shortly — this menu is being set up.</p>
          </div>
        ) : (
          cats.map(cat => {
            const catProducts = products.filter(p => p.category_id === cat.id)
            if (catProducts.length === 0) return null
            return (
              <div
                key={cat.id}
                ref={el => { sectionRefs.current[cat.id] = el }}
                style={{ marginTop: 28 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  {cat.color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color, display: 'inline-block', flexShrink: 0 }} />}
                  <h2 style={{ fontSize: 13, fontWeight: 800, color: DARK, margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {cat.name}
                  </h2>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
                  {catProducts.map(p => {
                    const badge = itemOverrides?.[p.id]?.badge ?? null
                    return (
                      <div
                        key={p.id}
                        onClick={() => { if (orderingEnabled) setProductModal(p) }}
                        style={{ background: CARD, borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.07)', cursor: orderingEnabled ? 'pointer' : 'default', position: 'relative', display: 'flex', flexDirection: 'column' }}
                      >
                        {badge && (
                          <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 2, background: GREEN, color: SAGE, fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, letterSpacing: '0.04em' }}>
                            {badge}
                          </div>
                        )}
                        {p.image_url ? (
                          <div style={{ width: '100%', height: 118, background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, boxSizing: 'border-box' as const }}>
                            <img src={p.image_url} alt={p.name} loading="lazy" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
                          </div>
                        ) : (
                          <PlaceholderImg />
                        )}
                        <div style={{ padding: '10px 12px 12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: DARK, lineHeight: 1.3, marginBottom: 3 }}>{p.name}</div>
                          {p.description && (
                            <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.4, marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
                              {p.description}
                            </div>
                          )}
                          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: GREEN, fontFamily: FONT_BRAND, fontStyle: 'italic' }}>
                              {fmtPrice(p.price)}
                            </span>
                            {orderingEnabled && (
                              <button
                                onClick={e => { e.stopPropagation(); addToCart(p) }}
                                style={{ width: 28, height: 28, borderRadius: '50%', background: SAGE, color: CARD, border: 'none', fontSize: 18, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 }}
                                aria-label={'Add ' + p.name}
                              >
                                +
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* FLOATING CART BAR — ordering mode only */}
      {orderingEnabled && cartCount > 0 && !showCart && (
        <div style={{ position: 'fixed', bottom: 20, left: 0, right: 0, padding: '0 18px', zIndex: 150 }}>
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            <button
              onClick={() => setShowCart(true)}
              style={{ width: '100%', padding: '14px 20px', borderRadius: 16, border: 'none', background: GREEN, color: SAGE, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_BODY, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 4px 20px rgba(45,82,64,0.35)' }}
            >
              <span style={{ background: SAGE, color: GREEN, borderRadius: '50%', width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>{cartCount}</span>
              <span>View order</span>
              <span style={{ fontFamily: FONT_BRAND, fontStyle: 'italic' }}>{fmtPrice(cartTotal)}</span>
            </button>
          </div>
        </div>
      )}

      {/* PRODUCT DETAIL MODAL */}
      {productModal && (
        <div onClick={() => setProductModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: CARD, borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '80dvh', overflowY: 'auto', maxWidth: 540, margin: '0 auto' }}>
            {productModal.image_url ? (
              <div style={{ width: '100%', height: 220, background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, boxSizing: 'border-box' as const, borderRadius: '20px 20px 0 0' }}>
                <img src={productModal.image_url} alt="" loading="lazy" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
              </div>
            ) : (
              <div style={{ width: '100%', height: 140, background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, color: '#c4c4c8', borderRadius: '20px 20px 0 0' }}>☕</div>
            )}
            <div style={{ padding: '20px 20px 32px' }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 6px', color: DARK, fontFamily: FONT_BRAND, fontStyle: 'italic' }}>{productModal.name}</h2>
              {productModal.description && <p style={{ fontSize: 13, color: MUTED, margin: '0 0 16px', lineHeight: 1.55 }}>{productModal.description}</p>}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: GREEN, fontFamily: FONT_BRAND, fontStyle: 'italic' }}>{fmtPrice(productModal.price)}</span>
              </div>
              {orderingEnabled && (
                <button
                  onClick={() => { addToCart(productModal); setProductModal(null) }}
                  style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: GREEN, color: SAGE, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_BODY }}
                >
                  Add to order
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CART DRAWER */}
      {showCart && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: CARD, borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '88dvh', overflowY: 'auto', padding: '20px 20px 40px', maxWidth: 540, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: DARK, fontFamily: FONT_BRAND, fontStyle: 'italic' }}>Your order</h2>
              <button onClick={() => setShowCart(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: MUTED }}>×</button>
            </div>
            {cart.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid ' + BORDER }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: DARK }}>{item.product.name}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: GREEN, marginTop: 2, fontFamily: FONT_BRAND, fontStyle: 'italic' }}>{fmtPrice(item.unit_price)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => changeQty(idx, -1)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1.5px solid ' + BORDER, background: CARD, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DARK }}>−</button>
                  <span style={{ fontSize: 14, fontWeight: 700, minWidth: 20, textAlign: 'center', color: DARK }}>{item.qty}</span>
                  <button onClick={() => changeQty(idx, 1)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1.5px solid ' + BORDER, background: CARD, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DARK }}>+</button>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', fontSize: 16, fontWeight: 800, color: DARK, borderTop: '2px solid ' + DARK, marginTop: 4, marginBottom: 18 }}>
              <span>Total</span>
              <span style={{ fontFamily: FONT_BRAND, fontStyle: 'italic', color: GREEN }}>{fmtPrice(cartTotal)}</span>
            </div>
            <button
              onClick={() => { setShowCart(false); setShowCheckout(true) }}
              disabled={cart.length === 0}
              style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: GREEN, color: SAGE, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_BODY }}
            >
              Proceed to checkout — {fmtPrice(cartTotal)}
            </button>
          </div>
        </div>
      )}

      {/* CHECKOUT MODAL */}
      {showCheckout && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: CARD, borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, maxHeight: '92dvh', overflowY: 'auto', padding: 24, fontFamily: FONT_BODY }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: DARK, fontFamily: FONT_BRAND, fontStyle: 'italic' }}>Checkout</h2>
              <button onClick={() => setShowCheckout(false)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: MUTED }}>×</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Order type</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(['pickup', 'delivery'] as const).map(type => (
                  <button key={type} onClick={() => setCheckoutForm(f => ({ ...f, fulfillment_type: type }))}
                    style={{ padding: 12, borderRadius: 10, border: '2px solid ' + (checkoutForm.fulfillment_type === type ? GREEN : BORDER), background: checkoutForm.fulfillment_type === type ? '#f0fdf4' : CARD, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: checkoutForm.fulfillment_type === type ? GREEN : MUTED, fontFamily: FONT_BODY }}>
                    {type === 'pickup' ? '🏃 Pickup' : '🛵 Delivery'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your details</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {([
                  { key: 'name', label: 'Full name *', type: 'text', placeholder: 'Jane Smith' },
                  { key: 'phone', label: 'Mobile *', type: 'tel', placeholder: '0400 000 000' },
                  { key: 'email', label: 'Email (for receipt)', type: 'email', placeholder: 'jane@email.com' },
                ] as const).map(({ key, label, type, placeholder }) => (
                  <div key={key}>
                    <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{label}</label>
                    <input type={type} value={checkoutForm[key]} onChange={e => setCheckoutForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid ' + BORDER, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: FONT_BODY, color: DARK }} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>Special instructions</label>
              <textarea value={checkoutForm.special_instructions} onChange={e => setCheckoutForm(f => ({ ...f, special_instructions: e.target.value }))} placeholder="Allergies, preferences…"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid ' + BORDER, fontSize: 14, outline: 'none', resize: 'vertical', minHeight: 60, boxSizing: 'border-box', fontFamily: FONT_BODY, color: DARK }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Payment</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { value: 'pay_on_pickup', label: '💵 Pay on pickup / delivery' },
                  { value: 'pay_online', label: '💳 Pay now online (card)' },
                ].map(({ value, label }) => (
                  <button key={value} onClick={() => setCheckoutForm(f => ({ ...f, payment_method: value }))}
                    style={{ padding: '11px 16px', borderRadius: 10, border: '2px solid ' + (checkoutForm.payment_method === value ? GREEN : BORDER), background: checkoutForm.payment_method === value ? '#f0fdf4' : CARD, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: checkoutForm.payment_method === value ? GREEN : DARK, textAlign: 'left', fontFamily: FONT_BODY }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ background: BG, borderRadius: 12, padding: '14px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, color: DARK }}>
              <span>Total ({cart.reduce((s, i) => s + i.qty, 0)} items)</span>
              <span style={{ fontFamily: FONT_BRAND, fontStyle: 'italic', color: GREEN }}>{fmtPrice(cartTotal)}</span>
            </div>
            {checkoutError && <p style={{ color: RED, fontSize: 13, marginBottom: 12 }}>{checkoutError}</p>}
            <button onClick={placeOrder} disabled={ordering}
              style={{ width: '100%', padding: 16, borderRadius: 14, border: 'none', background: GREEN, color: SAGE, fontSize: 16, fontWeight: 800, cursor: ordering ? 'not-allowed' : 'pointer', fontFamily: FONT_BODY, opacity: ordering ? 0.7 : 1 }}>
              {ordering ? 'Placing order…' : 'Place order — ' + fmtPrice(cartTotal)}
            </button>
          </div>
        </div>
      )}

      {/* QR / SHARE MODAL */}
      {showQr && (
        <div onClick={() => setShowQr(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: CARD, borderRadius: 20, padding: '28px 24px', maxWidth: 320, width: '100%', textAlign: 'center' }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: DARK, margin: '0 0 4px', fontFamily: FONT_BRAND, fontStyle: 'italic' }}>Share this menu</h2>
            <p style={{ fontSize: 12, color: MUTED, margin: '0 0 20px' }}>Scan the QR code or copy the link</p>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR code for this menu" style={{ width: 200, height: 200, display: 'block', margin: '0 auto 20px', borderRadius: 12, border: '1px solid ' + BORDER }} />
            ) : (
              <div style={{ width: 200, height: 200, background: BG, borderRadius: 12, margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: 12, border: '1px solid ' + BORDER }}>
                Generating…
              </div>
            )}
            <div style={{ background: BG, borderRadius: 10, padding: '10px 14px', fontSize: 11, color: MUTED, wordBreak: 'break-all', marginBottom: 16, border: '1px solid ' + BORDER }}>
              {menuUrl}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={copyLink}
                style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: '1.5px solid ' + BORDER, background: copied ? '#f0fdf4' : CARD, color: copied ? GREEN : DARK, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_BODY }}
              >
                {copied ? '✓ Copied' : 'Copy link'}
              </button>
              <button
                onClick={() => setShowQr(false)}
                style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: GREEN, color: SAGE, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_BODY }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
