'use client'
import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { TEMPLATES, FONTS, BGS, deriveTheme } from '@/lib/menu/menu-theme'
import type { Theme } from '@/lib/menu/menu-theme'

// ── Google Font URL params (public-page-only — builder uses whatever is already loaded) ──

const GFONT_IDS: Record<string, string> = {
  'Fraunces':         'Fraunces:ital,wght@0,400;0,700;1,400;1,700',
  'Space Grotesk':    'Space+Grotesk:wght@400;600;700',
  'Cormorant':        'Cormorant:ital,wght@0,400;0,700;1,400;1,700',
  'Playfair Display': 'Playfair+Display:ital,wght@0,400;0,700;1,400;1,700',
}

function fmtPrice(dollars: number) { return 'A$' + dollars.toFixed(2) }

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return m === 0 ? (h12 + suffix) : (h12 + ':' + m.toString().padStart(2, '0') + suffix)
}

const RED = '#ef4444'

// ── Types ────────────────────────────────────────────────────────────────────

interface Category { id: string; name: string; color: string | null }
interface Product {
  id: string; name: string; description: string | null; price: number
  image_url: string | null; sort_order: number | null; category_id: string | null
}
interface CartItem { product: Product; qty: number; unit_price: number; modifiers: { id: string; name: string; priceCents: number }[] }
interface ModifierOption { id: string; name: string; priceCents: number; displayOrder: number | null }
interface ModifierGroup { id: string; name: string; isRequired: boolean; minSelections: number; maxSelections: number; options: ModifierOption[] }
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
  templateId?: string | null
  brandKit?: Record<string, unknown> | null
  backgroundId?: string | null
  initialCategories?: Category[]
  initialProducts?: Product[]
  locationSubtitle?: string | null
  isOpenNow?: boolean
  closesAt?: string | null
  productModifiers?: Record<string, ModifierGroup[]>
}

// ── Component ────────────────────────────────────────────────────────────────

export default function MenuClient({
  businessId, slug: _slug, businessName, logoUrl: _logoUrl, orderingEnabled, menuUrl,
  sectionOrder: _sectionOrder, itemOverrides, templateId, brandKit, backgroundId,
  initialCategories, initialProducts,
  locationSubtitle, isOpenNow, closesAt, productModifiers,
}: Props) {
  const theme = deriveTheme(templateId ?? 'editorial', brandKit ?? null, backgroundId ?? null)

  // Brand-kit fields (mirrors builder's BrandKit type)
  const bk = brandKit ?? {}
  const logoEmoji  = (bk.logoEmoji  as string  | undefined) ?? '☕'
  const showPhotos = (bk.showPhotos as boolean | undefined) ?? true
  const showDesc   = (bk.showDesc   as boolean | undefined) ?? true
  const showBadges = (bk.showBadges as boolean | undefined) ?? true
  const rowStyle   = (bk.rowStyle   as string  | undefined) ?? 'default'
  // printCols is A4-PRINT ONLY — never used for the web list layout

  // Load the template's Google Font dynamically
  useEffect(() => {
    const fontId = (bk.font as string | undefined) ?? TEMPLATES.find(t => t.id === (templateId ?? 'editorial'))?.font ?? 'Inter'
    const gfId = GFONT_IDS[fontId]
    if (!gfId) return
    const href = 'https://fonts.googleapis.com/css2?family=' + gfId + '&display=swap'
    if (document.querySelector('link[href="' + href + '"]')) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'; link.href = href
    document.head.appendChild(link)
  }, [templateId, bk.font])

  // Products + categories come from SSR props — no client-side fetch, no loading skeleton
  const [cats] = useState<Category[]>(initialCategories ?? [])
  const [rawProducts] = useState<Product[]>(initialProducts ?? [])
  const [activeCat, setActiveCat] = useState<string | null>(
    initialCategories && initialCategories.length > 0
      ? initialCategories[0].id
      : (initialProducts && initialProducts.length > 0 ? '__other__' : null)
  )
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
  const [modalMods, setModalMods] = useState<Record<string, string[]>>({})

  useEffect(() => {
    if (!showQr || qrDataUrl) return
    QRCode.toDataURL(menuUrl, { width: 240, margin: 2, color: { dark: theme.ink, light: theme.card } })
      .then(url => setQrDataUrl(url))
      .catch(() => null)
  }, [showQr, qrDataUrl, menuUrl, theme.ink, theme.card])

  useEffect(() => { setModalMods({}) }, [productModal])

  // Derived product list — apply item_overrides (desc/photo/price overrides, hidden filter)
  const catIds = new Set(cats.map(c => c.id))
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

  const uncatProds = products.filter(p => !p.category_id || !catIds.has(p.category_id))
  const hasUncat = uncatProds.length > 0
  const cartCount = cart.reduce((s, i) => s + i.qty, 0)
  const cartTotal = cart.reduce((s, i) => s + i.unit_price * i.qty, 0)

  function addToCart(p: Product) {
    const mgs = productModifiers?.[p.id] ?? []
    if (mgs.length > 0) { setProductModal(p); return }
    setCart(c => {
      const idx = c.findIndex(i => i.product.id === p.id && i.modifiers.length === 0)
      if (idx >= 0) { const n = [...c]; n[idx] = { ...n[idx], qty: n[idx].qty + 1 }; return n }
      return [...c, { product: p, qty: 1, unit_price: p.price, modifiers: [] }]
    })
  }

  function toggleMod(grpId: string, modId: string, maxSel: number) {
    setModalMods(prev => {
      const cur = prev[grpId] ?? []
      if (cur.includes(modId)) return { ...prev, [grpId]: cur.filter(id => id !== modId) }
      if (maxSel === 1) return { ...prev, [grpId]: [modId] }
      if (cur.length >= maxSel) return prev
      return { ...prev, [grpId]: [...cur, modId] }
    })
  }

  function addToCartWithMods(p: Product, groups: ModifierGroup[]) {
    const mods: CartItem['modifiers'] = []
    let extraCents = 0
    for (const g of groups) {
      for (const mid of modalMods[g.id] ?? []) {
        const opt = g.options.find(o => o.id === mid)
        if (opt) { mods.push({ id: opt.id, name: opt.name, priceCents: opt.priceCents }); extraCents += opt.priceCents }
      }
    }
    const unitPrice = (Number(p.price) || 0) + extraCents / 100
    setCart(c => {
      if (mods.length > 0) return [...c, { product: p, qty: 1, unit_price: unitPrice, modifiers: mods }]
      const idx = c.findIndex(i => i.product.id === p.id && i.modifiers.length === 0)
      if (idx >= 0) { const n = [...c]; n[idx] = { ...n[idx], qty: n[idx].qty + 1 }; return n }
      return [...c, { product: p, qty: 1, unit_price: unitPrice, modifiers: [] }]
    })
  }

  function changeQty(idx: number, delta: number) {
    setCart(c => { const n = [...c]; n[idx] = { ...n[idx], qty: n[idx].qty + delta }; return n.filter(i => i.qty > 0) })
  }

  function scrollToSection(catId: string) {
    setActiveCat(catId)
    const el = sectionRefs.current[catId]
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 54
      window.scrollTo({ top, behavior: 'smooth' })
    }
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
          quantity: i.qty, unit_price: i.unit_price,
          modifiers: i.modifiers.map(m => ({ id: m.id, name: m.name, price_cents: m.priceCents })),
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

  // ── Modal modifier state ──
  const modGroups: ModifierGroup[] = productModal ? (productModifiers?.[productModal.id] ?? []) : []
  const liveTotal = modGroups.reduce((sum, g) => {
    let s = sum
    for (const mid of modalMods[g.id] ?? []) {
      const opt = g.options.find(o => o.id === mid)
      if (opt) s += opt.priceCents / 100
    }
    return s
  }, Number(productModal?.price) || 0)
  const modalError = modGroups.reduce<string | null>((err, g) => {
    if (err) return err
    const n = (modalMods[g.id] ?? []).length
    if (g.isRequired && n === 0) return 'Please choose ' + g.name
    if (n < g.minSelections) return 'Choose at least ' + g.minSelections + ' from ' + g.name
    return null
  }, null)

  // ── Order done screen ──
  if (orderDone) return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: theme.bg, padding: 24, textAlign: 'center', fontFamily: theme.fontCss }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: theme.accent + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 20px' }}>✓</div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: theme.ink, margin: '0 0 8px', fontFamily: theme.fontCss, fontStyle: 'italic' }}>Order placed!</h1>
      <p style={{ color: theme.muted, fontSize: 14, margin: '0 0 24px' }}>We have received your order and will have it ready soon.</p>
      <div style={{ background: theme.card, borderRadius: 18, padding: 24, marginBottom: 24, boxShadow: '0 2px 16px rgba(0,0,0,0.12)', maxWidth: 320, width: '100%' }}>
        <p style={{ fontSize: 11, color: theme.muted, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Order number</p>
        <p style={{ fontSize: 30, fontWeight: 800, color: theme.ink, margin: '0 0 20px', letterSpacing: 2, fontFamily: theme.fontCss, fontStyle: 'italic' }}>{orderDone.order_number}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid ' + theme.line, paddingTop: 16 }}>
          <div>
            <p style={{ fontSize: 11, color: theme.muted, margin: '0 0 2px' }}>Total</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: theme.accent, margin: 0, fontFamily: theme.fontCss, fontStyle: 'italic' }}>{fmtPrice(orderDone.total)}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: theme.muted, margin: '0 0 2px' }}>Ready in approx.</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: theme.ink, margin: 0 }}>{orderDone.estimated_ready_minutes} min</p>
          </div>
        </div>
      </div>
      <button
        onClick={() => { setOrderDone(null); setCheckoutForm({ name: '', phone: '', email: '', fulfillment_type: 'pickup', special_instructions: '', payment_method: 'pay_on_pickup' }) }}
        style={{ padding: '14px 36px', borderRadius: 14, border: 'none', background: theme.accent, color: theme.bg, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: theme.fontCss }}
      >
        Back to menu
      </button>
    </div>
  )

  // ── Main layout ──
  return (
    <div style={{ minHeight: '100dvh', background: theme.bg, backgroundImage: theme.bgCss, fontFamily: theme.fontCss, paddingBottom: orderingEnabled && cartCount > 0 ? 88 : 0 }}>

      {/* CENTERED HEADER — logo circle · business name · suburb+city subtitle · open-now pill */}
      <div style={{ padding: '36px 24px 20px', textAlign: 'center' }}>
        {/* Logo circle with accent border */}
        <div style={{ width: 56, height: 56, borderRadius: '50%', border: '2px solid ' + theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: theme.accent, margin: '0 auto 10px' }}>
          {logoEmoji}
        </div>
        {/* Business name — template font, italic */}
        <h1 style={{ fontSize: 26, fontWeight: 800, color: theme.ink, margin: '0 0 5px', fontFamily: theme.fontCss, fontStyle: 'italic', lineHeight: 1.2 }}>
          {businessName}
        </h1>
        {/* Location subtitle: suburb, city — hidden if both empty */}
        {locationSubtitle && (
          <p style={{ fontSize: 13, color: theme.muted, margin: '0 0 12px', lineHeight: 1.4 }}>{locationSubtitle}</p>
        )}
        {/* Open-now pill — from business_hours (AEST). Hidden entirely when closed or no hours row. */}
        {isOpenNow && closesAt && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#16a34a', color: '#fff', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff', display: 'inline-block', flexShrink: 0 }} />
            {'OPEN NOW · TIL ' + fmtTime(closesAt)}
          </div>
        )}
        {/* Ordering indicator */}
        {orderingEnabled && (
          <div style={{ marginTop: 8, fontSize: 11, fontWeight: 600, color: '#16a34a' }}>
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#16a34a', marginRight: 5, verticalAlign: 'middle' }} />
            Ordering open
          </div>
        )}
      </div>

      {/* STICKY CATEGORY NAV — always shown (QR button lives here while scrolling) */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: theme.bg, borderBottom: '1px solid ' + theme.line }}>
        <div style={{ overflowX: 'auto', scrollbarWidth: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px' }}>
          {cats.map(c => (
            <button
              key={c.id}
              onClick={() => scrollToSection(c.id)}
              style={{ flexShrink: 0, padding: '5px 14px', borderRadius: 20, border: '1.5px solid ' + (activeCat === c.id ? theme.accent : theme.line), background: activeCat === c.id ? theme.accent : 'transparent', color: activeCat === c.id ? theme.bg : theme.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: theme.fontCss }}
            >
              {c.name}
            </button>
          ))}
          {hasUncat && cats.length > 0 && (
            <button
              onClick={() => scrollToSection('__other__')}
              style={{ flexShrink: 0, padding: '5px 14px', borderRadius: 20, border: '1.5px solid ' + (activeCat === '__other__' ? theme.accent : theme.line), background: activeCat === '__other__' ? theme.accent : 'transparent', color: activeCat === '__other__' ? theme.bg : theme.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: theme.fontCss }}
            >
              Other
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setShowQr(true)}
            title="Share menu"
            style={{ flexShrink: 0, width: 34, height: 34, borderRadius: '50%', border: '1.5px solid ' + theme.line, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: theme.muted }}
          >
            ⬡
          </button>
        </div>
      </div>

      {/* PRODUCT LIST — single-column list, thumb-left rows, divider lines */}
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 18px 32px' }}>
        {products.length === 0 && !hasUncat ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: theme.muted }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>☕</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: theme.ink, margin: '0 0 6px' }}>Menu coming soon</p>
            <p style={{ fontSize: 13 }}>Check back shortly — this menu is being set up.</p>
          </div>
        ) : (
          <>
            {cats.map(cat => {
              const catProds = products.filter(p => p.category_id === cat.id)
              if (catProds.length === 0) return null
              return (
                <div key={cat.id} ref={el => { sectionRefs.current[cat.id] = el }} style={{ marginTop: 28 }}>
                  {/* Category heading */}
                  <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.09em', color: theme.accent, marginBottom: 4, fontFamily: theme.fontCss }}>
                    {cat.name}
                  </div>
                  {/* Item rows */}
                  {catProds.map((p, idx) => {
                    const badge = showBadges ? (itemOverrides?.[p.id]?.badge ?? null) : null
                    const divider = idx < catProds.length - 1 ? '1px solid ' + theme.line : 'none'
                    if (rowStyle === 'D') {
                      return (
                        <div key={p.id} onClick={() => { if (orderingEnabled) setProductModal(p) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 0', borderBottom: divider, cursor: orderingEnabled ? 'pointer' : 'default' }}>
                          {showPhotos && (p.image_url
                            ? <img src={p.image_url} alt={p.name} loading="lazy" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                            : <div style={{ width: 64, height: 64, borderRadius: '50%', background: theme.accentSoft + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: theme.accent, flexShrink: 0 }}>☕</div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: theme.ink, fontFamily: theme.fontCss, lineHeight: 1.3 }}>{p.name}</div>
                            {showDesc && p.description && (
                              <div style={{ fontSize: 13, color: theme.muted, lineHeight: 1.5, marginTop: 4 }}>{p.description}</div>
                            )}
                            {badge && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: theme.accent, border: '1px solid ' + theme.accent, borderRadius: 8, padding: '1px 6px', display: 'inline-block', marginTop: 6 }}>{badge}</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: theme.accent, fontFamily: theme.fontCss, fontStyle: 'italic', whiteSpace: 'nowrap' }}>{fmtPrice(p.price)}</span>
                            {orderingEnabled && (
                              <button onClick={e => { e.stopPropagation(); addToCart(p) }}
                                style={{ width: 28, height: 28, borderRadius: '50%', background: theme.accent, color: theme.bg, border: 'none', fontSize: 18, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 }}
                                aria-label={'Add ' + p.name}>+</button>
                            )}
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div
                        key={p.id}
                        onClick={() => { if (orderingEnabled) setProductModal(p) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: divider, cursor: orderingEnabled ? 'pointer' : 'default' }}
                      >
                        {/* 56px thumb */}
                        {showPhotos && (p.image_url
                          ? <img src={p.image_url} alt={p.name} loading="lazy" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                          : <div style={{ width: 56, height: 56, borderRadius: 10, background: theme.accentSoft + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: theme.accent, flexShrink: 0 }}>☕</div>
                        )}
                        {/* Name + desc + badge */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: theme.ink, lineHeight: 1.3 }}>{p.name}</div>
                          {showDesc && p.description && (
                            <div style={{ fontSize: 12, color: theme.muted, lineHeight: 1.35, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
                              {p.description}
                            </div>
                          )}
                          {badge && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: theme.accent, border: '1px solid ' + theme.accent, borderRadius: 8, padding: '1px 6px', display: 'inline-block', marginTop: 4 }}>
                              {badge}
                            </span>
                          )}
                        </div>
                        {/* Price + add button */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: theme.accent, fontFamily: theme.fontCss, fontStyle: 'italic' }}>
                            {fmtPrice(p.price)}
                          </span>
                          {orderingEnabled && (
                            <button
                              onClick={e => { e.stopPropagation(); addToCart(p) }}
                              style={{ width: 28, height: 28, borderRadius: '50%', background: theme.accent, color: theme.bg, border: 'none', fontSize: 18, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 }}
                              aria-label={'Add ' + p.name}
                            >+</button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
            {/* Uncategorized products */}
            {hasUncat && (
              <div ref={el => { sectionRefs.current['__other__'] = el }} style={{ marginTop: 28 }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.09em', color: theme.muted, marginBottom: 4, fontFamily: theme.fontCss }}>
                  {cats.length > 0 ? 'Other' : ''}
                </div>
                {uncatProds.map((p, idx) => {
                  const badge = showBadges ? (itemOverrides?.[p.id]?.badge ?? null) : null
                  const divider = idx < uncatProds.length - 1 ? '1px solid ' + theme.line : 'none'
                  if (rowStyle === 'D') {
                    return (
                      <div key={p.id} onClick={() => { if (orderingEnabled) setProductModal(p) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 0', borderBottom: divider, cursor: orderingEnabled ? 'pointer' : 'default' }}>
                        {showPhotos && (p.image_url
                          ? <img src={p.image_url} alt={p.name} loading="lazy" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                          : <div style={{ width: 64, height: 64, borderRadius: '50%', background: theme.accentSoft + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: theme.accent, flexShrink: 0 }}>☕</div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: theme.ink, fontFamily: theme.fontCss, lineHeight: 1.3 }}>{p.name}</div>
                          {showDesc && p.description && (
                            <div style={{ fontSize: 13, color: theme.muted, lineHeight: 1.5, marginTop: 4 }}>{p.description}</div>
                          )}
                          {badge && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: theme.accent, border: '1px solid ' + theme.accent, borderRadius: 8, padding: '1px 6px', display: 'inline-block', marginTop: 6 }}>{badge}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: theme.accent, fontFamily: theme.fontCss, fontStyle: 'italic', whiteSpace: 'nowrap' }}>{fmtPrice(p.price)}</span>
                          {orderingEnabled && (
                            <button onClick={e => { e.stopPropagation(); addToCart(p) }}
                              style={{ width: 28, height: 28, borderRadius: '50%', background: theme.accent, color: theme.bg, border: 'none', fontSize: 18, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 }}
                              aria-label={'Add ' + p.name}>+</button>
                          )}
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div
                      key={p.id}
                      onClick={() => { if (orderingEnabled) setProductModal(p) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: divider, cursor: orderingEnabled ? 'pointer' : 'default' }}
                    >
                      {showPhotos && (p.image_url
                        ? <img src={p.image_url} alt={p.name} loading="lazy" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                        : <div style={{ width: 56, height: 56, borderRadius: 10, background: theme.accentSoft + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: theme.accent, flexShrink: 0 }}>☕</div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: theme.ink, lineHeight: 1.3 }}>{p.name}</div>
                        {showDesc && p.description && (
                          <div style={{ fontSize: 12, color: theme.muted, lineHeight: 1.35, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
                            {p.description}
                          </div>
                        )}
                        {badge && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: theme.accent, border: '1px solid ' + theme.accent, borderRadius: 8, padding: '1px 6px', display: 'inline-block', marginTop: 4 }}>
                            {badge}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: theme.accent, fontFamily: theme.fontCss, fontStyle: 'italic' }}>
                          {fmtPrice(p.price)}
                        </span>
                        {orderingEnabled && (
                          <button
                            onClick={e => { e.stopPropagation(); addToCart(p) }}
                            style={{ width: 28, height: 28, borderRadius: '50%', background: theme.accent, color: theme.bg, border: 'none', fontSize: 18, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 }}
                            aria-label={'Add ' + p.name}
                          >+</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* FOOTER */}
      <div style={{ textAlign: 'center', fontSize: 11, color: theme.muted, padding: '8px 0 24px', letterSpacing: '0.04em' }}>Powered by Aria</div>

      {/* FLOATING CART BAR */}
      {orderingEnabled && cartCount > 0 && !showCart && (
        <div style={{ position: 'fixed', bottom: 20, left: 0, right: 0, padding: '0 18px', zIndex: 150 }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <button
              onClick={() => setShowCart(true)}
              style={{ width: '100%', padding: '14px 20px', borderRadius: 16, border: 'none', background: theme.accent, color: theme.bg, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: theme.fontCss, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}
            >
              <span style={{ background: theme.bg, color: theme.accent, borderRadius: '50%', width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>{cartCount}</span>
              <span>View order</span>
              <span style={{ fontFamily: theme.fontCss, fontStyle: 'italic' }}>{fmtPrice(cartTotal)}</span>
            </button>
          </div>
        </div>
      )}

      {/* PRODUCT DETAIL MODAL */}
      {productModal && (
        <div onClick={() => setProductModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: theme.card, borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '80dvh', overflowY: 'auto', maxWidth: 540, margin: '0 auto' }}>
            {productModal.image_url ? (
              <img src={productModal.image_url} alt="" loading="lazy" style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block', borderRadius: '20px 20px 0 0' }} />
            ) : (
              <div style={{ width: '100%', height: 140, background: theme.accentSoft + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, color: theme.accent, borderRadius: '20px 20px 0 0' }}>☕</div>
            )}
            <div style={{ padding: '20px 20px 32px' }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 6px', color: theme.ink, fontFamily: theme.fontCss, fontStyle: 'italic' }}>{productModal.name}</h2>
              {productModal.description && <p style={{ fontSize: 13, color: theme.muted, margin: '0 0 16px', lineHeight: 1.55 }}>{productModal.description}</p>}
              {/* Modifier groups */}
              {modGroups.map(grp => {
                const sel = modalMods[grp.id] ?? []
                const atMax = sel.length >= grp.maxSelections
                return (
                  <div key={grp.id} style={{ marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: theme.muted }}>{grp.name}</span>
                      {grp.isRequired && <span style={{ fontSize: 10, fontWeight: 700, color: theme.accent, border: '1px solid ' + theme.accent, borderRadius: 4, padding: '1px 5px' }}>Required</span>}
                      {grp.maxSelections > 1 && <span style={{ fontSize: 10, color: theme.muted }}>{'up to ' + grp.maxSelections}</span>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {grp.options.map(opt => {
                        const isSel = sel.includes(opt.id)
                        const isDisabled = !isSel && atMax
                        return (
                          <button key={opt.id} onClick={() => { if (!isDisabled) toggleMod(grp.id, opt.id, grp.maxSelections) }}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, border: '1.5px solid ' + (isSel ? theme.accent : theme.line), background: isSel ? theme.accent + '18' : theme.bg, cursor: isDisabled ? 'default' : 'pointer', opacity: isDisabled ? 0.45 : 1, textAlign: 'left' as const }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 16, height: 16, borderRadius: grp.maxSelections === 1 ? '50%' : 3, border: '2px solid ' + (isSel ? theme.accent : theme.line), background: isSel ? theme.accent : 'transparent', flexShrink: 0 }} />
                              <span style={{ fontSize: 14, color: theme.ink, fontWeight: isSel ? 700 : 400 }}>{opt.name}</span>
                            </div>
                            {opt.priceCents > 0 && <span style={{ fontSize: 13, color: isSel ? theme.accent : theme.muted, fontWeight: 600 }}>{'+ ' + fmtPrice(opt.priceCents / 100)}</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: theme.accent, fontFamily: theme.fontCss, fontStyle: 'italic' }}>{fmtPrice(productModal.price)}</span>
              </div>
              {modalError && <p style={{ fontSize: 12, color: theme.muted, marginBottom: 10, lineHeight: 1.4 }}>{modalError}</p>}
              {orderingEnabled && (
                <button
                  onClick={() => { if (!modalError) { addToCartWithMods(productModal, modGroups); setProductModal(null) } }}
                  disabled={!!modalError}
                  style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: modalError ? theme.muted : theme.accent, color: theme.bg, fontSize: 15, fontWeight: 700, cursor: modalError ? 'default' : 'pointer', fontFamily: theme.fontCss, opacity: modalError ? 0.7 : 1 }}
                >
                  {'Add to order — ' + fmtPrice(liveTotal)}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CART DRAWER */}
      {showCart && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: theme.card, borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '88dvh', overflowY: 'auto', padding: '20px 20px 40px', maxWidth: 540, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: theme.ink, fontFamily: theme.fontCss, fontStyle: 'italic' }}>Your order</h2>
              <button onClick={() => setShowCart(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: theme.muted }}>×</button>
            </div>
            {cart.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid ' + theme.line }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>{item.product.name}</div>
                  {item.modifiers.length > 0 && (
                    <div style={{ fontSize: 11, color: theme.muted, marginTop: 2 }}>{item.modifiers.map(m => m.name).join(', ')}</div>
                  )}
                  <div style={{ fontSize: 13, fontWeight: 700, color: theme.accent, marginTop: 2, fontFamily: theme.fontCss, fontStyle: 'italic' }}>{fmtPrice(item.unit_price)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => changeQty(idx, -1)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1.5px solid ' + theme.line, background: theme.card, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.ink }}>−</button>
                  <span style={{ fontSize: 14, fontWeight: 700, minWidth: 20, textAlign: 'center', color: theme.ink }}>{item.qty}</span>
                  <button onClick={() => changeQty(idx, 1)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1.5px solid ' + theme.line, background: theme.card, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.ink }}>+</button>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', fontSize: 16, fontWeight: 800, color: theme.ink, borderTop: '2px solid ' + theme.ink, marginTop: 4, marginBottom: 18 }}>
              <span>Total</span>
              <span style={{ fontFamily: theme.fontCss, fontStyle: 'italic', color: theme.accent }}>{fmtPrice(cartTotal)}</span>
            </div>
            <button
              onClick={() => { setShowCart(false); setShowCheckout(true) }}
              disabled={cart.length === 0}
              style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: theme.accent, color: theme.bg, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: theme.fontCss }}
            >
              Proceed to checkout — {fmtPrice(cartTotal)}
            </button>
          </div>
        </div>
      )}

      {/* CHECKOUT MODAL */}
      {showCheckout && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: theme.card, borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, maxHeight: '92dvh', overflowY: 'auto', padding: 24, fontFamily: theme.fontCss }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: theme.ink, fontFamily: theme.fontCss, fontStyle: 'italic' }}>Checkout</h2>
              <button onClick={() => setShowCheckout(false)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: theme.muted }}>×</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: theme.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Order type</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(['pickup', 'delivery'] as const).map(type => (
                  <button key={type} onClick={() => setCheckoutForm(f => ({ ...f, fulfillment_type: type }))}
                    style={{ padding: 12, borderRadius: 10, border: '2px solid ' + (checkoutForm.fulfillment_type === type ? theme.accent : theme.line), background: checkoutForm.fulfillment_type === type ? theme.accent + '18' : theme.card, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: checkoutForm.fulfillment_type === type ? theme.accent : theme.muted, fontFamily: theme.fontCss }}>
                    {type === 'pickup' ? '🏃 Pickup' : '🛵 Delivery'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: theme.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your details</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {([
                  { key: 'name', label: 'Full name *', type: 'text', placeholder: 'Jane Smith' },
                  { key: 'phone', label: 'Mobile *', type: 'tel', placeholder: '0400 000 000' },
                  { key: 'email', label: 'Email (for receipt)', type: 'email', placeholder: 'jane@email.com' },
                ] as const).map(({ key, label, type, placeholder }) => (
                  <div key={key}>
                    <label style={{ fontSize: 11, color: theme.muted, display: 'block', marginBottom: 4 }}>{label}</label>
                    <input type={type} value={checkoutForm[key]} onChange={e => setCheckoutForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid ' + theme.line, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: theme.fontCss, color: theme.ink, background: theme.card }} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: theme.muted, display: 'block', marginBottom: 4 }}>Special instructions</label>
              <textarea value={checkoutForm.special_instructions} onChange={e => setCheckoutForm(f => ({ ...f, special_instructions: e.target.value }))} placeholder="Allergies, preferences…"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid ' + theme.line, fontSize: 14, outline: 'none', resize: 'vertical', minHeight: 60, boxSizing: 'border-box', fontFamily: theme.fontCss, color: theme.ink, background: theme.card }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: theme.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Payment</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { value: 'pay_on_pickup', label: '💵 Pay on pickup / delivery' },
                  { value: 'pay_online', label: '💳 Pay now online (card)' },
                ].map(({ value, label }) => (
                  <button key={value} onClick={() => setCheckoutForm(f => ({ ...f, payment_method: value }))}
                    style={{ padding: '11px 16px', borderRadius: 10, border: '2px solid ' + (checkoutForm.payment_method === value ? theme.accent : theme.line), background: checkoutForm.payment_method === value ? theme.accent + '18' : theme.card, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: checkoutForm.payment_method === value ? theme.accent : theme.ink, textAlign: 'left', fontFamily: theme.fontCss }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ background: theme.bg, borderRadius: 12, padding: '14px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, color: theme.ink }}>
              <span>Total ({cart.reduce((s, i) => s + i.qty, 0)} items)</span>
              <span style={{ fontFamily: theme.fontCss, fontStyle: 'italic', color: theme.accent }}>{fmtPrice(cartTotal)}</span>
            </div>
            {checkoutError && <p style={{ color: RED, fontSize: 13, marginBottom: 12 }}>{checkoutError}</p>}
            <button onClick={placeOrder} disabled={ordering}
              style={{ width: '100%', padding: 16, borderRadius: 14, border: 'none', background: theme.accent, color: theme.bg, fontSize: 16, fontWeight: 800, cursor: ordering ? 'not-allowed' : 'pointer', fontFamily: theme.fontCss, opacity: ordering ? 0.7 : 1 }}>
              {ordering ? 'Placing order…' : 'Place order — ' + fmtPrice(cartTotal)}
            </button>
          </div>
        </div>
      )}

      {/* QR / SHARE MODAL */}
      {showQr && (
        <div onClick={() => setShowQr(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: theme.card, borderRadius: 20, padding: '28px 24px', maxWidth: 320, width: '100%', textAlign: 'center' }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: theme.ink, margin: '0 0 4px', fontFamily: theme.fontCss, fontStyle: 'italic' }}>Share this menu</h2>
            <p style={{ fontSize: 12, color: theme.muted, margin: '0 0 20px' }}>Scan the QR code or copy the link</p>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR code for this menu" style={{ width: 200, height: 200, display: 'block', margin: '0 auto 20px', borderRadius: 12, border: '1px solid ' + theme.line }} />
            ) : (
              <div style={{ width: 200, height: 200, background: theme.bg, borderRadius: 12, margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.muted, fontSize: 12, border: '1px solid ' + theme.line }}>
                Generating…
              </div>
            )}
            <div style={{ background: theme.bg, borderRadius: 10, padding: '10px 14px', fontSize: 11, color: theme.muted, wordBreak: 'break-all', marginBottom: 16, border: '1px solid ' + theme.line }}>
              {menuUrl}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={copyLink}
                style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: '1.5px solid ' + theme.line, background: copied ? theme.accent + '18' : theme.card, color: copied ? theme.accent : theme.ink, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: theme.fontCss }}
              >
                {copied ? '✓ Copied' : 'Copy link'}
              </button>
              <button
                onClick={() => setShowQr(false)}
                style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: theme.accent, color: theme.bg, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: theme.fontCss }}
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
