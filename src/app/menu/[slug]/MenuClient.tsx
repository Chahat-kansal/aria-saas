'use client'
import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { TEMPLATES, deriveTheme } from '@/lib/menu/menu-theme'
import { resolveArchetype } from '@/lib/ordering/resolveArchetype'
import { ArchetypeRenderer } from '@/components/ordering/archetypes/ArchetypeRenderer'
import { resolveRenderMode, COFFEE_DRINK_TYPES } from '@/components/order/productMode'
import { ProductCustomiser, type BuildConfig } from '@/components/order/ProductCustomiser'
import { StripePaymentModal } from '@/components/order/StripePaymentModal'

// ── Pipel ordering design system tokens ──────────────────────────────────────

const CANVAS = '#fafafa'
const WHITE  = '#ffffff'
const INK    = '#0a0a0a'
const LIME   = '#d9f54e'
const MUTED  = '#6b7280'
const BORDER = '#e5e7eb'
const SANS   = "'Outfit', 'Inter', system-ui, sans-serif"
const SERIF  = "'Cormorant', 'Georgia', serif"
const CARD_SHADOW = '0 8px 28px rgba(0,0,0,.06)'

function fmtPrice(dollars: number) { return '$' + dollars.toFixed(2) }

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return m === 0 ? (h12 + suffix) : (h12 + ':' + m.toString().padStart(2, '0') + suffix)
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

// Split last word off name for Cormorant accent
function splitNameAccent(name: string): [string, string] {
  const idx = name.lastIndexOf(' ')
  if (idx === -1) return ['', name]
  return [name.slice(0, idx + 1), name.slice(idx + 1)]
}

// ── SVG nav icons ─────────────────────────────────────────────────────────────

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="3" y1="6"  x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  )
}

function BagIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <path d="M16 10a4 4 0 0 1-8 0"/>
    </svg>
  )
}

function StarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  )
}

// ── Types ────────────────────────────────────────────────────────────────────

interface Category { id: string; name: string; color: string | null; ordering_archetype: string | null }
interface Product {
  id: string; name: string; description: string | null; price: number
  image_url: string | null; sort_order: number | null; category_id: string | null
  ordering_mode: string | null; ordering_archetype: string | null
  is_gluten_free: boolean | null; is_vegan: boolean | null; is_vegetarian: boolean | null
}
interface CartItem {
  product: Product; qty: number; unit_price: number
  modifiers: { id: string; name: string; priceCents: number }[]
  config?: { mode: 'build'; layers: string[]; added: { id: string; name: string; priceCents: number }[]; removed: { name: string }[] }
  note?: string
}
interface ModifierOption { id: string; name: string; priceCents: number; isDefault: boolean; allowQuantity: boolean; maxQuantity: number; displayOrder: number | null }
interface ModifierGroup { id: string; name: string; isRequired: boolean; minSelections: number; maxSelections: number; allowQuantity: boolean; selectionType: string; archetypeSlot: string | null; options: ModifierOption[] }
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
  // Keep theme for ArchetypeRenderer compatibility — override colors to Pipel
  const baseTheme = deriveTheme(templateId ?? 'editorial', brandKit ?? null, backgroundId ?? null)
  const theme = {
    ...baseTheme,
    bg: CANVAS, card: WHITE, ink: INK, accent: LIME,
    accentSoft: LIME + '22', muted: MUTED, line: BORDER,
    fontCss: SANS,
  }

  const bk = brandKit ?? {}
  const logoEmoji = (bk.logoEmoji as string | undefined) ?? '☕'
  const showDesc  = (bk.showDesc  as boolean | undefined) ?? true

  // Load Pipel fonts (Outfit + Cormorant) + template font
  useEffect(() => {
    const pairs: [string, string][] = [
      ['Outfit',    'Outfit:wght@400;600;700;800;900'],
      ['Cormorant', 'Cormorant:ital,wght@1,400;1,700;1,900'],
    ]
    const templateFont = (bk.font as string | undefined)
      ?? TEMPLATES.find(t => t.id === (templateId ?? 'editorial'))?.font ?? 'Inter'
    const GFONT_IDS: Record<string, string> = {
      'Fraunces':         'Fraunces:ital,wght@0,400;0,700;1,400;1,700',
      'Space Grotesk':    'Space+Grotesk:wght@400;600;700',
      'Cormorant':        'Cormorant:ital,wght@0,400;0,700;1,400;1,700',
      'Playfair Display': 'Playfair+Display:ital,wght@0,400;0,700;1,400;1,700',
    }
    if (GFONT_IDS[templateFont]) pairs.push([templateFont, GFONT_IDS[templateFont]])
    for (const [, q] of pairs) {
      const href = 'https://fonts.googleapis.com/css2?family=' + q + '&display=swap'
      if (!document.querySelector('link[href="' + href + '"]')) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'; link.href = href
        document.head.appendChild(link)
      }
    }
  }, [templateId, bk.font])

  const [cats]        = useState<Category[]>(initialCategories ?? [])
  const [rawProducts] = useState<Product[]>(initialProducts ?? [])
  const [activeCat, setActiveCat] = useState<string | null>(
    initialCategories && initialCategories.length > 0
      ? initialCategories[0].id
      : (initialProducts && initialProducts.length > 0 ? '__other__' : null),
  )
  const [searchQuery,   setSearchQuery]   = useState('')
  const [cart,          setCart]          = useState<CartItem[]>([])
  const [showCart,      setShowCart]      = useState(false)
  const [showCheckout,  setShowCheckout]  = useState(false)
  const [productModal,  setProductModal]  = useState<Product | null>(null)
  const [showQr,        setShowQr]        = useState(false)
  const [qrDataUrl,     setQrDataUrl]     = useState<string | null>(null)
  const [copied,        setCopied]        = useState(false)
  const [ordering,      setOrdering]      = useState(false)
  const [orderDone,     setOrderDone]     = useState<{ order_number: string; estimated_ready_minutes: number; total: number } | null>(null)
  const [checkoutForm,  setCheckoutForm]  = useState({ name: '', phone: '', email: '', fulfillment_type: 'pickup', special_instructions: '', payment_method: 'pay_on_pickup' })
  const [checkoutError, setCheckoutError] = useState('')
  const [stripeModal,   setStripeModal]   = useState<{ clientSecret: string; publishableKey: string; orderNumber: string; total: number } | null>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [modalMods, setModalMods] = useState<Record<string, string[]>>({})
  const [dietaryFilter, setDietaryFilter] = useState<Set<string>>(new Set())
  const [productNote, setProductNote] = useState('')

  useEffect(() => {
    if (!showQr || qrDataUrl) return
    QRCode.toDataURL(menuUrl, { width: 240, margin: 2, color: { dark: INK, light: WHITE } })
      .then(url => setQrDataUrl(url)).catch(() => null)
  }, [showQr, qrDataUrl, menuUrl])

  useEffect(() => { setModalMods({}); setProductNote('') }, [productModal])

  const catIds    = new Set(cats.map(c => c.id))
  const sipHero = (archetype: string | null) =>
    archetype && COFFEE_DRINK_TYPES.has(archetype) ? '/menu/sip-ff5055/' + archetype + '.webp' : null

  const products  = rawProducts
    .filter(p => !(itemOverrides?.[p.id]?.hidden))
    .map(p => {
      const ov = itemOverrides?.[p.id]
      const baseImg = ov?.photo_url !== undefined ? ov.photo_url : p.image_url
      return {
        ...p,
        description: ov?.desc !== undefined ? ov.desc : p.description,
        image_url:   baseImg ?? sipHero(p.ordering_archetype),
        price:       ov?.price_override !== undefined ? ov.price_override : p.price,
      }
    })

  const uncatProds  = products.filter(p => !p.category_id || !catIds.has(p.category_id))
  const hasUncat    = uncatProds.length > 0
  const cartCount   = cart.reduce((s, i) => s + i.qty, 0)
  const cartTotal   = cart.reduce((s, i) => s + i.unit_price * i.qty, 0)

  // Search + dietary filter — applies across all categories
  const searchLow = searchQuery.toLowerCase().trim()
  function matchesDietary(p: Product) {
    if (dietaryFilter.has('GF') && !p.is_gluten_free) return false
    if (dietaryFilter.has('V')  && !p.is_vegetarian) return false
    if (dietaryFilter.has('VG') && !p.is_vegan) return false
    return true
  }
  function matchesSearch(p: Product) {
    if (!matchesDietary(p)) return false
    if (!searchLow) return true
    return p.name.toLowerCase().includes(searchLow) || (p.description ?? '').toLowerCase().includes(searchLow)
  }
  function toggleDietary(tag: string) {
    setDietaryFilter(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag); else next.add(tag)
      return next
    })
  }

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

  function addToCartWithMods(p: Product, groups: ModifierGroup[], note?: string) {
    const mods: CartItem['modifiers'] = []
    let extraCents = 0
    for (const g of groups) {
      for (const mid of modalMods[g.id] ?? []) {
        const opt = g.options.find(o => o.id === mid)
        if (opt) { mods.push({ id: opt.id, name: opt.name, priceCents: opt.priceCents }); extraCents += opt.priceCents }
      }
    }
    const unitPrice = (Number(p.price) || 0) + extraCents / 100
    const trimNote = note?.trim() || undefined
    setCart(c => {
      if (mods.length > 0 || trimNote) return [...c, { product: p, qty: 1, unit_price: unitPrice, modifiers: mods, note: trimNote }]
      const idx = c.findIndex(i => i.product.id === p.id && i.modifiers.length === 0 && !i.note)
      if (idx >= 0) { const n = [...c]; n[idx] = { ...n[idx], qty: n[idx].qty + 1 }; return n }
      return [...c, { product: p, qty: 1, unit_price: unitPrice, modifiers: [] }]
    })
    setProductNote('')
  }

  function changeQty(idx: number, delta: number) {
    setCart(c => { const n = [...c]; n[idx] = { ...n[idx], qty: n[idx].qty + delta }; return n.filter(i => i.qty > 0) })
  }

  function scrollToSection(catId: string) {
    setActiveCat(catId)
    const el = sectionRefs.current[catId]
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 64
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
          ...(i.config ? { config: i.config } : {}),
          ...(i.note ? { note: i.note } : {}),
        })),
      }),
    }).then(r => r.json()).catch(() => ({ error: 'NETWORK_DROPPED' }))

    // S-ORD-CONFIRM — this used to render `{ error: 'Network error' }` as an ordinary checkout
    // failure. A dropped response is NOT a failed order: the row may already exist, the kitchen may
    // already have it, and for card payments the intent may already be created. Telling the
    // customer it failed is what produces the second order and the double charge.
    //
    // We cannot recover the order number here — it is generated server-side (place-order:139), so a
    // response that never arrives takes it with it. What we CAN do is refuse to invite a retry, and
    // point at the one place that knows the truth.
    if (res.error === 'NETWORK_DROPPED') {
      setCheckoutError(
        'We lost connection before we could confirm. Your order may already have been placed — ' +
        'please do NOT order again. Check your phone for a confirmation, or ask staff to look up ' +
        'your name before retrying.',
      )
      setOrdering(false)
      return
    }
    if (res.error) { setCheckoutError(res.error); setOrdering(false); return }

    // Persist the moment it is known, before anything else can throw. If the customer closes the
    // tab or the next step fails, the tracking page is still reachable from here.
    if (res.order_number) {
      try { sessionStorage.setItem('aria_last_order:' + _slug, String(res.order_number)) } catch { /* private mode */ }
    }

    // Card payment — show Stripe modal to collect card details
    if (res.stripe_client_secret) {
      setStripeModal({ clientSecret: res.stripe_client_secret, publishableKey: res.stripe_publishable_key, orderNumber: res.order_number, total: cartTotal })
      setOrdering(false)
      return
    }

    setOrderDone({ order_number: res.order_number, estimated_ready_minutes: res.estimated_ready_minutes, total: cartTotal })
    setCart([]); setShowCart(false); setShowCheckout(false); setOrdering(false)
  }

  function handleStripeSuccess() {
    const orderNumber = stripeModal?.orderNumber ?? ''
    // S-ORD-CONFIRM — for card orders the number exists before the charge, so a failure AFTER this
    // point can still be resolved from the order record rather than guessed at.
    if (orderNumber) {
      try { sessionStorage.setItem('aria_last_order:' + _slug, orderNumber) } catch { /* private mode */ }
    }
    setStripeModal(null)
    setOrderDone({ order_number: orderNumber, estimated_ready_minutes: 15, total: cartTotal })
    setCart([]); setShowCart(false); setShowCheckout(false)
  }

  function copyLink() {
    navigator.clipboard.writeText(menuUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  // Modal modifier state
  const modGroups: ModifierGroup[] = productModal ? (productModifiers?.[productModal.id] ?? []) : []
  const modalCat = productModal && productModal.category_id
    ? cats.find(c => c.id === productModal.category_id) ?? null
    : null
  const resolvedArchetype = productModal ? resolveArchetype(productModal, modalCat) : 'generic' as const
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

  // Hero product: first product with badge, or first with image, or first overall
  const allVisible = products.filter(matchesSearch)
  const heroProduct: Product | null = allVisible.find(p => !!(itemOverrides?.[p.id]?.badge))
    ?? allVisible.find(p => !!p.image_url)
    ?? allVisible[0]
    ?? null

  // ── Order done screen ──
  if (orderDone) return (
    <div style={{ minHeight: '100dvh', background: CANVAS, fontFamily: SANS, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: LIME + '33', border: '2px solid ' + LIME, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 20px' }}>✓</div>
      <h1 style={{ fontSize: 28, fontWeight: 400, fontStyle: 'italic', fontFamily: SERIF, color: INK, margin: '0 0 6px' }}>Order placed!</h1>
      <p style={{ color: MUTED, fontSize: 14, margin: '0 0 24px' }}>Your order is being prepared. We'll have it ready soon.</p>
      <div style={{ background: WHITE, borderRadius: 24, padding: 24, marginBottom: 12, boxShadow: CARD_SHADOW, maxWidth: 320, width: '100%' }}>
        <p style={{ fontSize: 11, color: MUTED, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Order number</p>
        <p style={{ fontSize: 32, fontWeight: 900, color: INK, margin: '0 0 20px', letterSpacing: 2, fontFamily: SANS }}>{orderDone.order_number}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid ' + BORDER, paddingTop: 16 }}>
          <div>
            <p style={{ fontSize: 11, color: MUTED, margin: '0 0 2px', fontWeight: 600 }}>Total</p>
            <p style={{ fontSize: 20, fontWeight: 900, color: INK, margin: 0 }}>{fmtPrice(orderDone.total)}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: MUTED, margin: '0 0 2px', fontWeight: 600 }}>Ready in approx.</p>
            <p style={{ fontSize: 20, fontWeight: 900, color: LIME, margin: 0 }}>{orderDone.estimated_ready_minutes} min</p>
          </div>
        </div>
      </div>
      <a
        href={'/menu/' + _slug + '/order/' + orderDone.order_number}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: 320, padding: '14px 0', borderRadius: 9999, border: '1.5px solid ' + BORDER, background: WHITE, color: INK, fontSize: 15, fontWeight: 700, textDecoration: 'none', marginBottom: 10, boxShadow: CARD_SHADOW }}
      >
        Track your order →
      </a>
      <button
        onClick={() => { setOrderDone(null); setCheckoutForm({ name: '', phone: '', email: '', fulfillment_type: 'pickup', special_instructions: '', payment_method: 'pay_on_pickup' }) }}
        style={{ width: '100%', maxWidth: 320, padding: '15px 0', borderRadius: 9999, border: 'none', background: LIME, color: INK, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: SANS }}
      >
        Back to menu
      </button>
    </div>
  )

  // ── Main layout ──
  return (
    <div style={{ minHeight: '100dvh', background: CANVAS, fontFamily: SANS, paddingBottom: 80 }}>

      {/* HEADER */}
      <div style={{ padding: '32px 20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, color: MUTED, fontWeight: 500 }}>{'Good ' + getGreeting() + ' 👋'}</div>
            {locationSubtitle && (
              <div style={{ fontSize: 13, color: MUTED, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12 }}>📍</span>
                {locationSubtitle}
              </div>
            )}
            {isOpenNow && closesAt && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#dcfce7', color: '#16a34a', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, marginTop: 6 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16a34a', display: 'inline-block', flexShrink: 0 }} />
                {'OPEN · TILL ' + fmtTime(closesAt)}
              </div>
            )}
          </div>
          <div style={{ width: 48, height: 48, borderRadius: '50%', border: '1.5px solid ' + BORDER, background: WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0, boxShadow: CARD_SHADOW }}>
            {logoEmoji}
          </div>
        </div>
        <h1 style={{ fontSize: 52, fontWeight: 700, fontStyle: 'italic', fontFamily: SERIF, color: INK, margin: '4px 0 0', lineHeight: 1.05 }}>
          Order
        </h1>
      </div>

      {/* SEARCH BAR */}
      <div style={{ padding: '0 20px 16px' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: MUTED, pointerEvents: 'none', lineHeight: 1 }}>
            🔍
          </span>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={"Search '" + (cats[0]?.name?.toLowerCase() ?? 'flat white') + "'..."}
            style={{
              width: '100%', padding: '13px 16px 13px 44px',
              borderRadius: 9999, border: '1.5px solid ' + BORDER,
              background: WHITE, fontSize: 14, color: INK,
              outline: 'none', boxSizing: 'border-box', fontFamily: SANS,
              boxShadow: CARD_SHADOW,
            }}
          />
        </div>
      </div>

      {/* STICKY CATEGORY PILLS + DIETARY FILTERS */}
      {cats.length > 0 && (
        <div style={{ position: 'sticky', top: 0, zIndex: 100, background: CANVAS, paddingBottom: 2, borderBottom: '1px solid ' + BORDER }}>
          {/* Dietary filter chips */}
          <div style={{ display: 'flex', gap: 6, padding: '8px 20px 0', overflowX: 'auto', scrollbarWidth: 'none' }}>
            {(['GF', 'V', 'VG'] as const).map(tag => {
              const active = dietaryFilter.has(tag)
              const label = tag === 'GF' ? 'Gluten Free' : tag === 'V' ? 'Vegetarian' : 'Vegan'
              return (
                <button
                  key={tag}
                  onClick={() => toggleDietary(tag)}
                  style={{
                    flexShrink: 0, padding: '5px 14px', borderRadius: 9999,
                    border: '1.5px solid ' + (active ? INK : BORDER),
                    background: active ? INK : WHITE,
                    color: active ? WHITE : MUTED,
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    fontFamily: SANS, whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <div style={{ overflowX: 'auto', scrollbarWidth: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px' }}>
            {cats.map(c => (
              <button
                key={c.id}
                onClick={() => scrollToSection(c.id)}
                style={{
                  flexShrink: 0, padding: '8px 20px', borderRadius: 9999,
                  border: activeCat === c.id ? 'none' : '1.5px solid ' + INK,
                  background: activeCat === c.id ? LIME : WHITE,
                  color: INK, fontSize: 13, fontWeight: activeCat === c.id ? 800 : 500,
                  cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap',
                }}
              >
                {c.name}
              </button>
            ))}
            {hasUncat && cats.length > 0 && (
              <button
                onClick={() => scrollToSection('__other__')}
                style={{
                  flexShrink: 0, padding: '8px 20px', borderRadius: 9999,
                  border: activeCat === '__other__' ? 'none' : '1.5px solid ' + INK,
                  background: activeCat === '__other__' ? LIME : WHITE,
                  color: INK, fontSize: 13, fontWeight: activeCat === '__other__' ? 800 : 500,
                  cursor: 'pointer', fontFamily: SANS,
                }}
              >
                Other
              </button>
            )}
            <div style={{ flex: 1, minWidth: 8 }} />
            <button
              onClick={() => setShowQr(true)}
              title="Share menu"
              style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', border: '1.5px solid ' + BORDER, background: WHITE, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: MUTED }}
            >
              ⬡
            </button>
          </div>
        </div>
      )}

      {/* PRODUCT GRID */}
      <div style={{ padding: '20px 20px 0' }}>
        {products.length === 0 && !hasUncat ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: MUTED }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>☕</div>
            <p style={{ fontSize: 16, fontWeight: 700, color: INK, margin: '0 0 6px' }}>Menu coming soon</p>
            <p style={{ fontSize: 13, margin: 0 }}>Check back shortly — this menu is being set up.</p>
          </div>
        ) : allVisible.length === 0 && searchLow ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: MUTED }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: INK, margin: '0 0 4px' }}>No results for "{searchQuery}"</p>
            <p style={{ fontSize: 13, margin: 0 }}>Try a different term</p>
          </div>
        ) : (
          <>
            {/* Chef's pick hero card */}
            {heroProduct && !searchLow && (
              <div
                onClick={() => { if (orderingEnabled) addToCart(heroProduct) }}
                style={{ background: WHITE, borderRadius: 24, boxShadow: CARD_SHADOW, padding: '16px 16px 16px 16px', marginBottom: 20, cursor: orderingEnabled ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 16 }}
              >
                {/* Image with lime glow */}
                <div style={{ width: 110, height: 110, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  {heroProduct.image_url ? (
                    <img
                      src={heroProduct.image_url}
                      alt={heroProduct.name}
                      style={{ width: 110, height: 110, objectFit: 'contain', filter: 'drop-shadow(0 0 18px rgba(217,245,78,0.5))' }}
                    />
                  ) : (
                    <div style={{ fontSize: 64, lineHeight: 1 }}>☕</div>
                  )}
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: INK, background: LIME, borderRadius: 9999, display: 'inline-block', padding: '3px 10px', marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Chef's pick
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: INK, fontFamily: SANS, lineHeight: 1.2, marginBottom: 4 }}>
                    {(() => { const [a, b] = splitNameAccent(heroProduct.name); return (<>{a}<span style={{ fontFamily: SERIF, fontStyle: 'italic', fontWeight: 700 }}>{b}</span></>) })()}
                  </div>
                  <DietaryBadges product={heroProduct} />
                  {showDesc && heroProduct.description && (
                    <div style={{ fontSize: 12, color: MUTED, marginBottom: 8, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', fontStyle: 'italic', fontFamily: SERIF }}>
                      {heroProduct.description}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 18, fontWeight: 900, color: INK }}>{fmtPrice(heroProduct.price)}</span>
                    {orderingEnabled && (
                      <button
                        onClick={e => { e.stopPropagation(); addToCart(heroProduct) }}
                        style={{ width: 34, height: 34, borderRadius: '50%', background: LIME, border: 'none', fontSize: 20, fontWeight: 900, cursor: 'pointer', color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        aria-label={'Add ' + heroProduct.name}
                      >+</button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Category sections */}
            {cats.map(cat => {
              const catProds = products.filter(p => p.category_id === cat.id && matchesSearch(p))
                .filter(p => !heroProduct || searchLow || p.id !== heroProduct.id)
              if (catProds.length === 0) return null
              return (
                <div key={cat.id} ref={el => { sectionRefs.current[cat.id] = el }} style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: MUTED, marginBottom: 12, fontFamily: SANS }}>
                    {cat.name}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {catProds.map(p => (
                      <ProductCard key={p.id} p={p} orderingEnabled={orderingEnabled} badge={itemOverrides?.[p.id]?.badge ?? null} showDesc={showDesc} onAdd={addToCart} onOpen={setProductModal} />
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Uncategorized products */}
            {hasUncat && (() => {
              const prods = uncatProds.filter(p => matchesSearch(p)).filter(p => !heroProduct || searchLow || p.id !== heroProduct.id)
              if (prods.length === 0) return null
              return (
                <div ref={el => { sectionRefs.current['__other__'] = el }} style={{ marginBottom: 28 }}>
                  {cats.length > 0 && (
                    <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: MUTED, marginBottom: 12 }}>Other</div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {prods.map(p => (
                      <ProductCard key={p.id} p={p} orderingEnabled={orderingEnabled} badge={itemOverrides?.[p.id]?.badge ?? null} showDesc={showDesc} onAdd={addToCart} onOpen={setProductModal} />
                    ))}
                  </div>
                </div>
              )
            })()}
          </>
        )}
      </div>

      {/* FOOTER */}
      <div style={{ textAlign: 'center', fontSize: 11, color: MUTED, padding: '8px 0 4px', letterSpacing: '0.04em' }}>Powered by Aria</div>
      <div style={{ textAlign: 'center', fontSize: 10, color: MUTED, padding: '0 24px 24px', lineHeight: 1.4, fontFamily: SANS, opacity: 0.7 }}>
        Dietary info set by the venue — check with staff for severe allergies.
      </div>

      {/* BOTTOM NAV */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: WHITE, borderTop: '1px solid ' + BORDER, paddingTop: 8, paddingBottom: 'max(8px, env(safe-area-inset-bottom))', display: 'flex', zIndex: 150, boxShadow: '0 -4px 20px rgba(0,0,0,0.06)' }}>
        {([
          { label: 'Home',   Icon: HomeIcon, action: () => window.scrollTo({ top: 0, behavior: 'smooth' }), active: true  },
          { label: 'Menu',   Icon: MenuIcon, action: () => window.scrollTo({ top: 0, behavior: 'smooth' }), active: false },
          { label: 'Orders', Icon: BagIcon,  action: () => { if (cartCount > 0) setShowCart(true) },         active: false, badge: cartCount > 0 ? cartCount : 0 },
          { label: 'Loyalty', Icon: StarIcon, action: () => {},                                               active: false },
        ] as const).map(item => (
          <button
            key={item.label}
            onClick={item.action as () => void}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', gap: 2, color: item.active ? INK : MUTED }}
          >
            <div style={{ position: 'relative', width: 48, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9999, background: item.active ? LIME : 'transparent' }}>
              <item.Icon />
              {'badge' in item && item.badge > 0 && (
                <span style={{ position: 'absolute', top: -2, right: 2, width: 18, height: 18, background: LIME, borderRadius: '50%', fontSize: 10, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid ' + WHITE }}>
                  {item.badge}
                </span>
              )}
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, fontFamily: SANS, letterSpacing: '0.01em' }}>{item.label}</span>
          </button>
        ))}
      </div>

      {/* BUILD MODE OVERLAY */}
      {productModal && resolveRenderMode(productModal) === 'build' && (
        <div style={{ position: 'fixed', inset: 0, background: CANVAS, zIndex: 200, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid ' + BORDER, position: 'sticky', top: 0, background: 'rgba(250,250,250,0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', zIndex: 10 }}>
            <button onClick={() => setProductModal(null)} style={{ background: WHITE, border: '1.5px solid ' + BORDER, borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', color: INK, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>←</button>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: INK, fontFamily: SANS }}>
                {(() => { const [a, b] = splitNameAccent(productModal.name); return (<>{a}<span style={{ fontFamily: SERIF, fontStyle: 'italic' }}>{b}</span></>) })()}
              </div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>{fmtPrice(Number(productModal.price))} base · drag to build</div>
            </div>
          </div>
          <ProductCustomiser
            modifierGroups={productModifiers?.[productModal.id] ?? []}
            productPrice={Number(productModal.price)}
            archetype={productModal.ordering_archetype ?? undefined}
            imageUrl={productModal.image_url ?? undefined}
            onAddToOrder={(cfg: BuildConfig) => {
              setCart(c => [...c, {
                product: productModal, qty: 1, unit_price: cfg.total,
                modifiers: cfg.modifiers,
                config: { mode: 'build', layers: cfg.layers as string[], added: cfg.added, removed: cfg.removed },
              }])
              setProductModal(null)
            }}
          />
        </div>
      )}

      {/* STANDARD PRODUCT MODAL */}
      {productModal && resolveRenderMode(productModal) !== 'build' && (
        <div onClick={() => setProductModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: CANVAS, borderRadius: '28px 28px 0 0', width: '100%', maxHeight: '92dvh', overflowY: 'auto', maxWidth: 540, margin: '0 auto', paddingBottom: 108 }}
          >
            {/* Product image card */}
            <div style={{ margin: '16px 16px 0', background: WHITE, borderRadius: 24, boxShadow: CARD_SHADOW, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {productModal.image_url ? (
                <img src={productModal.image_url} alt="" style={{ maxHeight: 200, maxWidth: '90%', objectFit: 'contain' }} />
              ) : (
                <div style={{ fontSize: 80, lineHeight: 1 }}>☕</div>
              )}
            </div>

            <div style={{ padding: '20px 20px 0' }}>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: INK, margin: '0 0 6px', fontFamily: SANS, lineHeight: 1.2 }}>
                {(() => { const [a, b] = splitNameAccent(productModal.name); return (<>{a}<span style={{ fontFamily: SERIF, fontStyle: 'italic', fontWeight: 700 }}>{b}</span></>) })()}
              </h2>
              {/* Dietary badges on modal */}
              <DietaryBadges product={productModal} />
              {(productModal.is_gluten_free || productModal.is_vegan || productModal.is_vegetarian) && (
                <p style={{ fontSize: 10, color: MUTED, margin: '4px 0 0', lineHeight: 1.4, fontFamily: SANS }}>
                  Dietary info set by the venue — check with staff for severe allergies.
                </p>
              )}
              {productModal.description && (
                <p style={{ fontSize: 14, fontStyle: 'italic', fontFamily: SERIF, color: MUTED, margin: '10px 0 16px', lineHeight: 1.65 }}>
                  {productModal.description}
                </p>
              )}
              <div style={{ fontSize: 26, fontWeight: 900, color: INK, marginBottom: 20, fontFamily: SANS }}>
                {fmtPrice(liveTotal)}
              </div>

              {modGroups.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: INK, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                    Customise
                  </div>
                  <ArchetypeRenderer
                    resolvedArchetype={resolvedArchetype}
                    modifierGroups={modGroups}
                    selectedMods={modalMods}
                    onToggleMod={toggleMod}
                    theme={theme}
                  />
                </div>
              )}

              {/* Note input */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.07em', fontFamily: SANS }}>
                  Add a note <span style={{ fontWeight: 400, textTransform: 'none' as const }}>(optional)</span>
                </label>
                <textarea
                  value={productNote}
                  onChange={e => setProductNote(e.target.value.slice(0, 200))}
                  placeholder="E.g. extra hot, no sugar, oat milk..."
                  maxLength={200}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 14, boxSizing: 'border-box' as const,
                    border: '1.5px solid ' + BORDER, fontSize: 14, color: INK, background: WHITE,
                    fontFamily: SANS, outline: 'none', resize: 'none' as const, minHeight: 56, lineHeight: 1.5,
                  }}
                />
                {productNote.length > 0 && (
                  <div style={{ fontSize: 11, color: MUTED, textAlign: 'right', marginTop: 3 }}>{productNote.length}/200</div>
                )}
              </div>

              {modalError && <p style={{ fontSize: 12, color: MUTED, marginBottom: 8, lineHeight: 1.4 }}>{modalError}</p>}
            </div>

            {/* Sticky CTA */}
            {orderingEnabled && (
              <div style={{
                position: 'sticky', bottom: 0,
                background: 'rgba(250,250,250,0.94)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                borderTop: '1px solid ' + BORDER, padding: '12px 20px 28px',
              }}>
                <div style={{ fontSize: 12, color: MUTED, textAlign: 'center', marginBottom: 8, fontFamily: SANS }}>
                  {'Earns ' + Math.round(liveTotal) + ' loyalty points'}
                </div>
                <button
                  onClick={() => { if (!modalError) { addToCartWithMods(productModal, modGroups, productNote); setProductModal(null) } }}
                  disabled={!!modalError}
                  style={{
                    width: '100%', padding: '15px 0', borderRadius: 9999, border: 'none',
                    background: modalError ? BORDER : LIME,
                    color: modalError ? MUTED : INK,
                    fontSize: 16, fontWeight: 800, cursor: modalError ? 'default' : 'pointer',
                    fontFamily: SANS,
                  }}
                >
                  {'Add to order · ' + fmtPrice(liveTotal)}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CART DRAWER */}
      {showCart && (
        <div onClick={() => setShowCart(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: CANVAS, borderRadius: '28px 28px 0 0', width: '100%', maxHeight: '90dvh', overflowY: 'auto', maxWidth: 540, margin: '0 auto' }}>

            {/* Cart header */}
            <div style={{ padding: '20px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 34, fontWeight: 400, fontStyle: 'italic', fontFamily: SERIF, color: INK, margin: 0 }}>
                <span style={{ fontStyle: 'normal', fontFamily: SANS, fontWeight: 800 }}>Your </span>
                <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontWeight: 700 }}>order</span>
              </h2>
              <button onClick={() => setShowCart(false)} style={{ width: 34, height: 34, borderRadius: '50%', border: '1.5px solid ' + BORDER, background: WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 18, color: INK }}>×</button>
            </div>

            {/* Cart items */}
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cart.map((item, idx) => (
                <div key={idx} style={{ background: WHITE, borderRadius: 20, boxShadow: CARD_SHADOW, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 72, height: 72, borderRadius: 14, background: CANVAS, flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid ' + BORDER }}>
                    {item.product.image_url
                      ? <img src={item.product.image_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="" />
                      : <span style={{ fontSize: 28 }}>☕</span>
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: INK, fontFamily: SANS }}>{item.product.name}</div>
                    {item.modifiers.length > 0 && (
                      <div style={{ fontSize: 12, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>{item.modifiers.map(m => m.name).join(', ')}</div>
                    )}
                    {item.config?.removed && item.config.removed.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {item.config.removed.map((r, ri) => (
                          <span key={ri} style={{ fontSize: 9, fontWeight: 800, color: '#ef4444', background: 'rgba(239,68,68,0.08)', borderRadius: 5, padding: '1px 5px', textTransform: 'uppercase' }}>
                            {'NO ' + r.name.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    )}
                    {item.note && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 4 }}>
                        <span style={{ fontSize: 11, lineHeight: 1.4 }}>📝</span>
                        <span style={{ fontSize: 11, color: MUTED, fontStyle: 'italic', lineHeight: 1.4, flex: 1 }}>{item.note}</span>
                      </div>
                    )}
                    <div style={{ fontSize: 15, fontWeight: 800, color: INK, marginTop: 4, fontFamily: SANS }}>{fmtPrice(item.unit_price * item.qty)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', background: CANVAS, borderRadius: 9999, border: '1.5px solid ' + BORDER, overflow: 'hidden', flexShrink: 0 }}>
                    <button onClick={() => changeQty(idx, -1)} style={{ width: 34, height: 34, background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>−</button>
                    <span style={{ fontSize: 14, fontWeight: 800, color: INK, minWidth: 22, textAlign: 'center' }}>{item.qty}</span>
                    <button onClick={() => changeQty(idx, 1)} style={{ width: 34, height: 34, background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>+</button>
                  </div>
                </div>
              ))}
            </div>

            {/* PayID card */}
            <div style={{ margin: '0 20px 12px', background: WHITE, borderRadius: 20, border: '2px solid ' + LIME, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: CARD_SHADOW }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: LIME, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: INK, lineHeight: 1 }}>Pay<br/>ID</span>
              </div>
              <div style={{ fontSize: 14, color: INK, lineHeight: 1.4 }}>
                Pay with <strong>PayID</strong> — save 1.5%, no card surcharge
              </div>
            </div>

            {/* Subtotal + loyalty + pickup */}
            <div style={{ margin: '0 20px 0', background: WHITE, borderRadius: 20, boxShadow: CARD_SHADOW, padding: '16px 16px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, color: INK, marginBottom: 14 }}>
                <span>Subtotal</span>
                <span style={{ fontWeight: 900 }}>{fmtPrice(cartTotal)}</span>
              </div>
              <div style={{ background: LIME, borderRadius: 9999, padding: '11px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 14 }}>🏅</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: INK, fontFamily: SANS }}>{'Earns ' + Math.round(cartTotal) + ' loyalty points'}</span>
              </div>
              <div style={{ border: '1.5px solid ' + BORDER, borderRadius: 9999, padding: '11px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{ fontSize: 14 }}>🕐</span>
                <span style={{ fontSize: 13, color: INK, fontFamily: SANS }}>{'Pickup · ' + businessName}</span>
              </div>
            </div>

            {/* Pay CTA sticky bar */}
            <div style={{ padding: '12px 20px 32px', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', position: 'sticky', bottom: 0, background: 'rgba(250,250,250,0.92)' }}>
              <button
                onClick={() => { setShowCart(false); setShowCheckout(true) }}
                disabled={cart.length === 0}
                style={{ width: '100%', padding: '16px 0', borderRadius: 9999, border: 'none', background: LIME, color: INK, fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: SANS }}
              >
                {'Pay ' + fmtPrice(cartTotal)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CHECKOUT MODAL */}
      {showCheckout && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: CANVAS, borderRadius: '28px 28px 0 0', width: '100%', maxWidth: 480, maxHeight: '92dvh', overflowY: 'auto', padding: '24px 20px 40px', fontFamily: SANS }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: INK }}>Checkout</h2>
              <button onClick={() => setShowCheckout(false)} style={{ background: WHITE, border: '1.5px solid ' + BORDER, borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 18, color: INK }}>×</button>
            </div>

            {/* Order type */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Order type</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(['pickup', 'delivery'] as const).map(type => (
                  <button key={type} onClick={() => setCheckoutForm(f => ({ ...f, fulfillment_type: type }))}
                    style={{ padding: '12px', borderRadius: 14, border: '2px solid ' + (checkoutForm.fulfillment_type === type ? LIME : BORDER), background: checkoutForm.fulfillment_type === type ? LIME + '18' : WHITE, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: INK, fontFamily: SANS }}>
                    {type === 'pickup' ? '🏃 Pickup' : '🛵 Delivery'}
                  </button>
                ))}
              </div>
            </div>

            {/* Details */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Your details</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {([
                  { key: 'name',  label: 'Full name *',          type: 'text',  placeholder: 'Jane Smith'    },
                  { key: 'phone', label: 'Mobile *',             type: 'tel',   placeholder: '0400 000 000'  },
                  { key: 'email', label: 'Email (for receipt)',  type: 'email', placeholder: 'jane@email.com' },
                ] as const).map(({ key, label, type, placeholder }) => (
                  <div key={key}>
                    <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4, fontWeight: 600 }}>{label}</label>
                    <input
                      type={type}
                      value={checkoutForm[key]}
                      onChange={e => setCheckoutForm(f => ({ ...f, [key]: e.target.value }))}
                      placeholder={placeholder}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 14, border: '1.5px solid ' + BORDER, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: SANS, color: INK, background: WHITE }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Special instructions */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4, fontWeight: 600 }}>Special instructions</label>
              <textarea
                value={checkoutForm.special_instructions}
                onChange={e => setCheckoutForm(f => ({ ...f, special_instructions: e.target.value }))}
                placeholder="Allergies, preferences…"
                style={{ width: '100%', padding: '12px 14px', borderRadius: 14, border: '1.5px solid ' + BORDER, fontSize: 14, outline: 'none', resize: 'vertical', minHeight: 64, boxSizing: 'border-box', fontFamily: SANS, color: INK, background: WHITE }}
              />
            </div>

            {/* Payment */}
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>Payment</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { value: 'pay_on_pickup', label: '💵 Pay on pickup / delivery', sub: null },
                  { value: 'pay_online',    label: '💳 Pay now by card', sub: 'Secured by Stripe — your card details are encrypted' },
                  { value: 'pay_payid',     label: '🏦 PayID / bank transfer', sub: 'Bank transfer details provided after ordering · Staff confirm when payment arrives' },
                ].map(({ value, label, sub }) => (
                  <button key={value} onClick={() => setCheckoutForm(f => ({ ...f, payment_method: value }))}
                    style={{ padding: '12px 16px', borderRadius: 14, border: '2px solid ' + (checkoutForm.payment_method === value ? LIME : BORDER), background: checkoutForm.payment_method === value ? LIME + '18' : WHITE, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: INK, textAlign: 'left' as const, fontFamily: SANS }}>
                    <span style={{ display: 'block' }}>{label}</span>
                    {sub && <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: MUTED, marginTop: 2 }}>{sub}</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Total row */}
            <div style={{ background: WHITE, borderRadius: 16, padding: '14px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: INK, boxShadow: CARD_SHADOW }}>
              <span>{'Total (' + cart.reduce((s, i) => s + i.qty, 0) + ' items)'}</span>
              <span>{fmtPrice(cartTotal)}</span>
            </div>

            {checkoutError && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{checkoutError}</p>}

            <button
              onClick={placeOrder}
              disabled={ordering}
              style={{ width: '100%', padding: '16px 0', borderRadius: 9999, border: 'none', background: ordering ? BORDER : LIME, color: INK, fontSize: 16, fontWeight: 800, cursor: ordering ? 'not-allowed' : 'pointer', fontFamily: SANS }}
            >
              {ordering ? 'Placing order…' : 'Place order · ' + fmtPrice(cartTotal)}
            </button>
          </div>
        </div>
      )}

      {/* Stripe payment modal — shown after place-order for card payments */}
      {stripeModal && (
        <StripePaymentModal
          clientSecret={stripeModal.clientSecret}
          publishableKey={stripeModal.publishableKey}
          orderNumber={stripeModal.orderNumber}
          total={stripeModal.total}
          onSuccess={handleStripeSuccess}
          onClose={() => setStripeModal(null)}
        />
      )}

      {/* QR / SHARE MODAL */}
      {showQr && (
        <div onClick={() => setShowQr(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: WHITE, borderRadius: 24, padding: '28px 24px', maxWidth: 320, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: INK, margin: '0 0 4px', fontFamily: SANS }}>Share this menu</h2>
            <p style={{ fontSize: 12, color: MUTED, margin: '0 0 20px' }}>Scan the QR code or copy the link</p>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR code" style={{ width: 200, height: 200, display: 'block', margin: '0 auto 20px', borderRadius: 12, border: '1px solid ' + BORDER }} />
            ) : (
              <div style={{ width: 200, height: 200, background: CANVAS, borderRadius: 12, margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: 12, border: '1px solid ' + BORDER }}>
                Generating…
              </div>
            )}
            <div style={{ background: CANVAS, borderRadius: 10, padding: '10px 14px', fontSize: 11, color: MUTED, wordBreak: 'break-all', marginBottom: 16, border: '1px solid ' + BORDER }}>
              {menuUrl}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={copyLink} style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: '1.5px solid ' + BORDER, background: copied ? LIME + '18' : WHITE, color: INK, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: SANS }}>
                {copied ? '✓ Copied' : 'Copy link'}
              </button>
              <button onClick={() => setShowQr(false)} style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: 'none', background: LIME, color: INK, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: SANS }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Dietary badges ────────────────────────────────────────────────────────────

function DietaryBadges({ product, small }: { product: Product; small?: boolean }) {
  const badges: string[] = []
  if (product.is_gluten_free) badges.push('GF')
  if (product.is_vegan) badges.push('VG')
  else if (product.is_vegetarian) badges.push('V')
  if (badges.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: small ? 3 : 6 }}>
      {badges.map(b => (
        <span key={b} style={{
          fontSize: small ? 9 : 10, fontWeight: 700, color: '#374151',
          border: '1px solid #d1d5db', background: WHITE,
          borderRadius: 9999, padding: small ? '1px 5px' : '2px 7px',
          letterSpacing: '0.04em', fontFamily: SANS,
        }}>{b}</span>
      ))}
    </div>
  )
}

// ── Product card (2-col grid) ─────────────────────────────────────────────────

function ProductCard({
  p, orderingEnabled, badge, showDesc, onAdd, onOpen,
}: {
  p: Product; orderingEnabled: boolean; badge: string | null; showDesc: boolean
  onAdd: (p: Product) => void; onOpen: (p: Product) => void
}) {
  const [a, b] = splitNameAccent(p.name)
  return (
    <div
      onClick={() => { if (orderingEnabled) onOpen(p) }}
      style={{ background: WHITE, borderRadius: 24, boxShadow: CARD_SHADOW, cursor: orderingEnabled ? 'pointer' : 'default', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    >
      {/* Image area */}
      <div style={{ height: 110, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '12px 8px 0', background: CANVAS }}>
        {p.image_url ? (
          <img src={p.image_url} alt={p.name} loading="lazy" style={{ maxHeight: 100, maxWidth: '100%', objectFit: 'contain', display: 'block' }} />
        ) : (
          <div style={{ fontSize: 48, lineHeight: 1 }}>☕</div>
        )}
      </div>
      {/* Card bottom */}
      <div style={{ padding: '10px 12px 12px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          {badge && (
            <span style={{ fontSize: 9, fontWeight: 800, color: INK, background: LIME, borderRadius: 9999, padding: '2px 8px', display: 'inline-block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {badge}
            </span>
          )}
          <div style={{ fontSize: 13, fontWeight: 700, color: INK, fontFamily: SANS, lineHeight: 1.3, marginBottom: 2 }}>
            {a}<span style={{ fontFamily: SERIF, fontStyle: 'italic' }}>{b}</span>
          </div>
          <DietaryBadges product={p} small />
          {showDesc && p.description && (
            <div style={{ fontSize: 11, color: MUTED, marginTop: 2, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', fontStyle: 'italic', fontFamily: SERIF }}>
              {p.description}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: INK, fontFamily: SANS }}>{fmtPrice(p.price)}</span>
          {orderingEnabled && (
            <button
              onClick={e => { e.stopPropagation(); onAdd(p) }}
              style={{ width: 28, height: 28, borderRadius: '50%', background: LIME, border: 'none', fontSize: 18, fontWeight: 900, cursor: 'pointer', color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
              aria-label={'Add ' + p.name}
            >+</button>
          )}
        </div>
      </div>
    </div>
  )
}