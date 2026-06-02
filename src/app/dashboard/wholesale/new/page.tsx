'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, Plus, Minus, ChevronLeft, Package, Check, X, ClipboardList, Sparkles } from 'lucide-react'

interface Customer {
  id: string
  name: string
  email: string | null
  business_name: string | null
  wholesale_tier: number | null
  wholesale_discount_pct: number | null
}

interface Product {
  id: string
  name: string
  sku: string | null
  price: number
  cost_price: number | null
  stock_quantity: number | null
  category: string | null
  is_active: boolean
}

interface CartItem {
  product_id: string | null
  name: string
  sku: string | null
  quantity: number
  unit_price: number
  retail_price: number
  line_total: number
}

interface AriaSuggestion {
  items: Array<{ product_id: string; name: string; sku: string | null; quantity: number; unit_price: number }>
  summary: string
}

const C = {
  bg: '#0E1411',
  card: 'rgba(255,255,255,0.03)',
  raised: 'rgba(255,255,255,0.05)',
  accent: '#7FB897',
  forest: '#2D5240',
  border: 'rgba(255,255,255,0.08)',
  borderActive: 'rgba(127,184,151,0.18)',
  text: '#fff',
  muted: 'rgba(255,255,255,0.6)',
  tertiary: 'rgba(255,255,255,0.35)',
  danger: '#f87171',
  warning: '#fbbf24',
}

const INP: React.CSSProperties = {
  background: C.raised, border: '1px solid ' + C.border, borderRadius: 8,
  padding: '8px 12px', color: C.text, fontSize: 13, width: '100%', outline: 'none',
}

function calcWholesalePrice(product: Product, customer: Customer | null): number {
  if (product.cost_price != null && Number(product.cost_price) > 0) return Number(product.cost_price)
  const retail = Number(product.price) || 0
  const tier = Number(customer?.wholesale_tier) || 0
  if (tier === 1) return Math.round(retail * 0.85 * 100) / 100
  if (tier === 2) return Math.round(retail * 0.78 * 100) / 100
  if (tier === 3) return Math.round(retail * 0.70 * 100) / 100
  return retail
}

const STEPS = ['Customer', 'Products', 'Review'] as const

export default function WholesaleNewPage() {
  const { business } = useBusinessContext()
  const bid = business?.id
  const router = useRouter()
  const searchParams = useSearchParams()
  const existingOrderId = searchParams.get('orderId')

  const [step] = useState(1)

  // Customer selection
  const [customerSearch, setCustomerSearch] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [showCustomerList, setShowCustomerList] = useState(false)

  // Product search
  const [productSearch, setProductSearch] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [productsLoading, setProductsLoading] = useState(false)

  // Cart
  const [cart, setCart] = useState<CartItem[]>([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [showCart, setShowCart] = useState(false)

  // Aria suggestion
  const [suggestion, setSuggestion] = useState<AriaSuggestion | null>(null)
  const [suggestionLoading, setSuggestionLoading] = useState(false)
  const [suggestionDismissed, setSuggestionDismissed] = useState(false)

  const customerSearchRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch customers on search
  useEffect(() => {
    if (!bid) return
    if (customerSearchRef.current) clearTimeout(customerSearchRef.current)
    customerSearchRef.current = setTimeout(async () => {
      if (customerSearch.length < 1) { setCustomers([]); return }
      const res = await fetch('/api/customers?business_id=' + bid + '&search=' + encodeURIComponent(customerSearch) + '&limit=10').then(r => r.json()).catch(() => ({}))
      setCustomers(res.customers ?? [])
      setShowCustomerList(true)
    }, 300)
  }, [bid, customerSearch])

  // Fetch products
  const fetchProducts = useCallback(async () => {
    if (!bid) return
    setProductsLoading(true)
    const res = await fetch('/api/pos/products?business_id=' + bid + '&limit=200&active=true').then(r => r.json()).catch(() => ({}))
    const prods: Product[] = res.products ?? res.data ?? []
    setProducts(prods)
    const cats = [...new Set(prods.map(p => p.category).filter(Boolean))] as string[]
    setCategories(cats)
    setProductsLoading(false)
  }, [bid])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  // Filter products
  useEffect(() => {
    let filtered = products
    if (selectedCategory !== 'all') filtered = filtered.filter(p => p.category === selectedCategory)
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase()
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q))
      )
    }
    setFilteredProducts(filtered.slice(0, 60))
  }, [products, selectedCategory, productSearch])

  // Fetch Aria suggestion when customer selected
  useEffect(() => {
    if (!bid || !selectedCustomer || suggestionDismissed) return
    setSuggestionLoading(true)
    fetch('/api/wholesale/orders/aria-suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: bid, customer_id: selectedCustomer.id }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.suggestion?.items?.length > 0) setSuggestion(data.suggestion)
        setSuggestionLoading(false)
      })
      .catch(() => setSuggestionLoading(false))
  }, [bid, selectedCustomer, suggestionDismissed])

  function addToCart(product: Product) {
    const unitPrice = calcWholesalePrice(product, selectedCustomer)
    setCart(prev => {
      const existing = prev.findIndex(i => i.product_id === product.id)
      if (existing >= 0) {
        return prev.map((i, idx) => idx === existing
          ? { ...i, quantity: i.quantity + 1, line_total: Math.round((i.unit_price * (i.quantity + 1)) * 100) / 100 }
          : i
        )
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        quantity: 1,
        unit_price: unitPrice,
        retail_price: Number(product.price) || 0,
        line_total: unitPrice,
      }]
    })
  }

  function updateQty(idx: number, delta: number) {
    setCart(prev => {
      const item = prev[idx]
      if (!item) return prev
      const newQty = item.quantity + delta
      if (newQty <= 0) return prev.filter((_, i) => i !== idx)
      return prev.map((i, j) => j === idx
        ? { ...i, quantity: newQty, line_total: Math.round(i.unit_price * newQty * 100) / 100 }
        : i
      )
    })
  }

  function applySuggestion() {
    if (!suggestion) return
    const newItems: CartItem[] = suggestion.items.map(item => ({
      product_id: item.product_id,
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      unit_price: item.unit_price,
      retail_price: item.unit_price,
      line_total: Math.round(item.unit_price * item.quantity * 100) / 100,
    }))
    setCart(newItems)
    setSuggestion(null)
  }

  const subtotal = cart.reduce((s, i) => s + i.line_total, 0)
  const discountPct = Number(selectedCustomer?.wholesale_discount_pct) || 0
  const discountAmount = Math.round(subtotal * (discountPct / 100) * 100) / 100
  const gst = Math.round((subtotal - discountAmount) * 0.10 * 100) / 100
  const cartTotal = subtotal - discountAmount + gst

  async function saveOrder(andRedirect: boolean) {
    if (!bid) return
    setSaving(true)
    try {
      // Create draft order
      const orderRes = await fetch('/api/wholesale/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: bid, customer_id: selectedCustomer?.id ?? null }),
      }).then(r => r.json())

      if (!orderRes.order) { setSaving(false); return }
      const orderId = orderRes.order.id

      // Add items
      for (const item of cart) {
        await fetch('/api/wholesale/orders/' + orderId + '/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id: item.product_id,
            sku: item.sku,
            name: item.name,
            quantity: item.quantity,
            unit_price_override: item.unit_price,
          }),
        })
      }

      // Recalculate totals
      await fetch('/api/wholesale/orders/' + orderId + '/totals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })

      // Update notes if any
      if (notes.trim()) {
        await fetch('/api/wholesale/orders/' + orderId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes }),
        })
      }

      setSaving(false)
      if (andRedirect) {
        router.push('/dashboard/wholesale/' + orderId + '/review')
      } else {
        router.push('/dashboard/wholesale')
      }
    } catch {
      setSaving(false)
    }
  }

  // Cart summary sidebar
  const CartPanel = (
    <div style={{ background: C.card, borderRadius: 12, border: '1px solid ' + C.border, padding: 16, position: 'sticky', top: 80 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <ClipboardList size={14} color={C.accent} />
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Order cart</span>
        {cart.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 11, background: C.forest, color: C.accent, padding: '2px 8px', borderRadius: 10 }}>
            {cart.length} items
          </span>
        )}
      </div>

      {cart.length === 0 ? (
        <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', padding: '16px 0' }}>Add products to start</p>
      ) : (
        <div style={{ marginBottom: 12, maxHeight: 240, overflowY: 'auto' }}>
          {cart.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid ' + C.border }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                {item.sku && <div style={{ fontSize: 10, color: C.tertiary, fontFamily: 'JetBrains Mono, monospace' }}>{item.sku}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button onClick={() => updateQty(idx, -1)} style={{ background: 'transparent', border: '1px solid ' + C.border, borderRadius: 4, color: C.muted, padding: '2px 6px', cursor: 'pointer', fontSize: 12 }}>
                  <Minus size={10} />
                </button>
                <span style={{ fontSize: 12, color: C.text, minWidth: 20, textAlign: 'center' }}>{item.quantity}</span>
                <button onClick={() => updateQty(idx, 1)} style={{ background: 'transparent', border: '1px solid ' + C.border, borderRadius: 4, color: C.muted, padding: '2px 6px', cursor: 'pointer', fontSize: 12 }}>
                  <Plus size={10} />
                </button>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, minWidth: 60, textAlign: 'right' }}>
                ${item.line_total.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      )}

      {cart.length > 0 && (
        <div style={{ paddingTop: 12, borderTop: '1px solid ' + C.border }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.muted, marginBottom: 4 }}>
            <span>Subtotal</span><span>${subtotal.toFixed(2)}</span>
          </div>
          {discountAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.accent, marginBottom: 4 }}>
              <span>Customer discount ({discountPct}%)</span><span>−${discountAmount.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.muted, marginBottom: 8 }}>
            <span>GST (10%)</span><span>${gst.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, color: C.text }}>
            <span>Total</span><span>${cartTotal.toFixed(2)} AUD</span>
          </div>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Notes</label>
        <textarea
          style={{ ...INP, height: 64, resize: 'none', fontFamily: 'inherit' }}
          placeholder="Delivery instructions, special requests..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={() => saveOrder(true)}
          disabled={saving || cart.length === 0}
          style={{
            width: '100%', padding: '10px', background: C.forest, color: C.accent,
            border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            opacity: cart.length === 0 ? 0.5 : 1,
          }}
        >
          {saving ? 'Saving...' : 'Review order →'}
        </button>
        <button
          onClick={() => saveOrder(false)}
          disabled={saving || cart.length === 0}
          style={{
            width: '100%', padding: '10px', background: 'transparent', color: C.muted,
            border: '1px solid ' + C.border, borderRadius: 8, fontSize: 13, cursor: 'pointer',
            opacity: cart.length === 0 ? 0.5 : 1,
          }}
        >
          Save as draft
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ padding: '24px', minHeight: '100vh', background: C.bg }}>
      {/* Sticky top bar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: C.bg, paddingBottom: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button
            onClick={() => router.push('/dashboard/wholesale')}
            style={{ background: 'transparent', border: '1px solid ' + C.border, borderRadius: 8, padding: '6px 12px', color: C.muted, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <ChevronLeft size={12} /> Wholesale
          </button>
          <h1 style={{ margin: 0, fontSize: 18, color: C.text, fontFamily: 'Cormorant, serif', fontStyle: 'italic' }}>New wholesale order</h1>
        </div>

        {/* Step pills */}
        <div style={{ display: 'flex', gap: 8 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                background: i + 1 <= step ? C.forest : C.raised,
                color: i + 1 <= step ? C.accent : C.tertiary,
                border: '1px solid ' + (i + 1 === step ? C.borderActive : C.border),
              }}>
                {i + 1 < step ? <Check size={10} /> : i + 1}
              </div>
              <span style={{ fontSize: 12, color: i + 1 === step ? C.text : C.muted }}>{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Customer block */}
      <div style={{ background: C.card, borderRadius: 12, border: '1px solid ' + C.border, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 10 }}>Customer</div>
        {selectedCustomer ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{selectedCustomer.business_name || selectedCustomer.name}</div>
              <div style={{ fontSize: 12, color: C.muted }}>{selectedCustomer.email}</div>
              {selectedCustomer.wholesale_tier && selectedCustomer.wholesale_tier > 0 && (
                <div style={{ fontSize: 11, color: C.accent, marginTop: 2 }}>
                  Tier {selectedCustomer.wholesale_tier} wholesale pricing
                  {selectedCustomer.wholesale_discount_pct ? ' + ' + selectedCustomer.wholesale_discount_pct + '% order discount' : ''}
                </div>
              )}
            </div>
            <button
              onClick={() => { setSelectedCustomer(null); setSuggestion(null); setSuggestionDismissed(false) }}
              style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...INP, width: 'auto' }}>
              <Search size={12} color={C.muted} />
              <input
                style={{ background: 'transparent', border: 'none', outline: 'none', color: C.text, fontSize: 13, flex: 1 }}
                placeholder="Search customer name or business..."
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                onFocus={() => customers.length > 0 && setShowCustomerList(true)}
              />
            </div>
            {showCustomerList && customers.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                background: '#1a2820', border: '1px solid ' + C.border, borderRadius: 8,
                marginTop: 4, overflow: 'hidden',
              }}>
                {customers.map(c => (
                  <div
                    key={c.id}
                    onClick={() => { setSelectedCustomer(c); setShowCustomerList(false); setCustomerSearch('') }}
                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid ' + C.border }}
                  >
                    <div style={{ fontSize: 13, color: C.text }}>{c.business_name || c.name}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{c.email}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Aria suggestion card */}
      {selectedCustomer && !suggestionDismissed && (suggestionLoading || suggestion) && (
        <div style={{ background: 'rgba(127,184,151,0.06)', borderRadius: 12, border: '1px solid ' + C.borderActive, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Sparkles size={14} color={C.accent} />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>Aria suggests</span>
            <button onClick={() => setSuggestionDismissed(true)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: C.tertiary, cursor: 'pointer' }}>
              <X size={12} />
            </button>
          </div>
          {suggestionLoading ? (
            <p style={{ fontSize: 12, color: C.muted }}>Checking order history...</p>
          ) : suggestion ? (
            <div>
              <p style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>{suggestion.summary}</p>
              <div style={{ marginBottom: 10 }}>
                {suggestion.items.slice(0, 4).map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.text, padding: '3px 0' }}>
                    <span>{item.name} × {item.quantity}</span>
                    <span style={{ color: C.muted }}>${(item.unit_price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={applySuggestion}
                style={{ padding: '7px 14px', background: C.forest, color: C.accent, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Use suggested items
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Two-column layout */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Product picker — 60% */}
        <div style={{ flex: '0 0 60%', minWidth: 0 }}>
          <div style={{ background: C.card, borderRadius: 12, border: '1px solid ' + C.border, padding: 16 }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...INP, width: 'auto', marginBottom: 10 }}>
                <Search size={12} color={C.muted} />
                <input
                  style={{ background: 'transparent', border: 'none', outline: 'none', color: C.text, fontSize: 13, flex: 1 }}
                  placeholder="Search products or SKUs..."
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                />
              </div>
              {categories.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['all', ...categories].map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      style={{
                        padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        border: '1px solid ' + (selectedCategory === cat ? C.borderActive : C.border),
                        background: selectedCategory === cat ? 'rgba(127,184,151,0.1)' : 'transparent',
                        color: selectedCategory === cat ? C.accent : C.muted,
                        textTransform: 'capitalize',
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {productsLoading ? (
              <p style={{ fontSize: 12, color: C.muted }}>Loading products...</p>
            ) : filteredProducts.length === 0 ? (
              <p style={{ fontSize: 12, color: C.muted }}>No products found.</p>
            ) : (
              <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                {filteredProducts.map(product => {
                  const inCart = cart.find(i => i.product_id === product.id)
                  const wsPrice = calcWholesalePrice(product, selectedCustomer)
                  return (
                    <div
                      key={product.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
                        borderBottom: '1px solid ' + C.border,
                      }}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: 8, background: C.raised,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <Package size={16} color={C.tertiary} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                          {product.sku && <span style={{ fontSize: 10, color: C.tertiary, fontFamily: 'JetBrains Mono, monospace' }}>{product.sku}</span>}
                          {product.stock_quantity != null && (
                            <span style={{ fontSize: 10, color: product.stock_quantity <= 5 ? C.danger : C.muted }}>
                              {product.stock_quantity} in stock
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>${wsPrice.toFixed(2)}</div>
                        <div style={{ fontSize: 10, color: C.tertiary }}>RRP ${(Number(product.price) || 0).toFixed(2)}</div>
                      </div>
                      <button
                        onClick={() => addToCart(product)}
                        style={{
                          width: 28, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: inCart ? C.forest : C.raised,
                          color: inCart ? C.accent : C.muted,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}
                      >
                        {inCart ? <Check size={12} /> : <Plus size={12} />}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Cart — 40% */}
        <div style={{ flex: '0 0 40%', minWidth: 0 }} className="wholesale-cart-desktop">
          {CartPanel}
        </div>
      </div>

      {/* Mobile cart FAB */}
      {cart.length > 0 && (
        <div className="wholesale-cart-fab" style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 30 }}>
          <button
            onClick={() => setShowCart(true)}
            style={{
              padding: '12px 20px', background: C.forest, color: C.accent,
              border: 'none', borderRadius: 24, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
              whiteSpace: 'nowrap',
            }}
          >
            View cart · {cart.length} items · ${cartTotal.toFixed(2)}
          </button>
        </div>
      )}

      {/* Mobile cart bottom sheet */}
      {showCart && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowCart(false)}>
          <div
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: '#0E1411', borderRadius: '16px 16px 0 0', padding: 20, maxHeight: '80vh', overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Order cart</span>
              <button onClick={() => setShowCart(false)} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer' }}><X size={16} /></button>
            </div>
            {CartPanel}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .wholesale-cart-desktop { display: none !important; }
        }
        @media (min-width: 769px) {
          .wholesale-cart-fab { display: none !important; }
        }
      `}</style>
    </div>
  )
}
