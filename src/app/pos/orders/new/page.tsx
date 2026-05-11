'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, X, ArrowLeft, Package, Loader2 } from 'lucide-react'

interface Product {
  id: string; name: string; sku: string | null; price: number;
  stock_quantity: number | null; track_stock: boolean; is_active: boolean;
  image_url: string | null; barcode: string | null;
  pos_outlet_inventory?: { items_on_hand: number; cases_reorder_amount: number; last_case_cost: number | null }[];
  pos_product_suppliers?: { pos_suppliers: { name: string } | null; is_primary?: boolean }[];
}

interface DraftLine {
  product_id: string; product_name: string; product_sku: string | null
  supplier_name: string | null
  quantity_cases: number; quantity_items: number
  last_purchase_price: number | null; confirmed_price: number | null
  open_market_low: number | null; open_market_high: number | null; open_market_source: string | null
  market_loading: boolean; sort_order: number
}

const V = 'var(--violet)'
const inp: React.CSSProperties = { background: 'var(--bg-input)', border: 'none', borderRadius: 7, padding: '8px 10px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', fontFamily: "'Manrope',sans-serif" }

function stockStatus(p: Product): 'out' | 'low' | 'ok' {
  if (!p.track_stock) return 'ok'
  const qty = p.pos_outlet_inventory?.[0]?.items_on_hand ?? p.stock_quantity ?? 0
  if (qty <= 0) return 'out'
  if (qty <= 10) return 'low'
  return 'ok'
}

export default function OrderBuilderPage() {
  const router = useRouter()
  const sp = useSearchParams()
  const [products, setProducts] = useState<Product[]>([])
  const [draft, setDraft] = useState<DraftLine[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all')
  const [saving, setSaving] = useState(false)
  const [savedOrderId, setSavedOrderId] = useState<string | null>(null)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/pos/products').then(r => r.json()),
    ]).then(([pd]) => {
      setBusinessId(pd.business_id ?? null)
      const prods = (pd.products ?? []).filter((p: Product) => p.is_active)
      prods.sort((a: Product, b: Product) => {
        const sa = stockStatus(a), sb = stockStatus(b)
        if (sa === 'out' && sb !== 'out') return -1
        if (sb === 'out' && sa !== 'out') return 1
        if (sa === 'low' && sb === 'ok') return -1
        if (sb === 'low' && sa === 'ok') return 1
        return 0
      })
      setProducts(prods)
    }).catch(() => {})
  }, [])

  const fetchMarket = useCallback(async (line: DraftLine) => {
    const clearLoading = () => setDraft(prev => prev.map(l =>
      l.product_id === line.product_id ? { ...l, market_loading: false } : l
    ))
    if (!businessId) { clearLoading(); return }
    const product = products.find(p => p.id === line.product_id)
    if (!product) { clearLoading(); return }
    const params = new URLSearchParams({
      productId: line.product_id,
      businessId,
      productName: line.product_name,
      ...(product.barcode ? { barcode: product.barcode } : {}),
    })
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 6000)
      const res = await fetch(`/api/pos/orders/market-prices?${params}`, { signal: ctrl.signal })
      clearTimeout(timer)
      const { results } = await res.json()
      const prices = ((results ?? []) as any[]).map((r: any) => r.shelf_price).filter(Boolean)
      setDraft(prev => prev.map(l => l.product_id === line.product_id ? {
        ...l,
        market_loading: false,
        open_market_low: prices.length ? Math.min(...prices) : null,
        open_market_high: prices.length ? Math.max(...prices) : null,
        open_market_source: prices.length ? (results as any[]).map((r: any) => r.source_name).join(', ') : null,
      } : l))
    } catch { clearLoading() }
  }, [businessId, products])

  function addProduct(p: Product) {
    const existing = draft.find(l => l.product_id === p.id)
    if (existing) {
      setDraft(prev => prev.map(l => l.product_id === p.id ? { ...l, quantity_cases: l.quantity_cases + 1 } : l))
      return
    }
    const inv = p.pos_outlet_inventory?.[0]
    const lastPrice = inv?.last_case_cost ?? null
    const newLine: DraftLine = {
      product_id: p.id, product_name: p.name, product_sku: p.sku,
      supplier_name: p.pos_product_suppliers?.[0]?.pos_suppliers?.name ?? null,
      quantity_cases: inv?.cases_reorder_amount || 1, quantity_items: 0,
      last_purchase_price: lastPrice, confirmed_price: lastPrice,
      open_market_low: null, open_market_high: null, open_market_source: null,
      market_loading: true, sort_order: draft.length,
    }
    setDraft(prev => [...prev, newLine])
    setTimeout(() => fetchMarket(newLine), 100)
  }

  function removeLine(productId: string) { setDraft(prev => prev.filter(l => l.product_id !== productId)) }
  function updateLine(productId: string, k: keyof DraftLine, v: any) { setDraft(prev => prev.map(l => l.product_id === productId ? { ...l, [k]: v } : l)) }

  const grandTotal = draft.reduce((s, l) => s + (l.quantity_cases * (l.confirmed_price ?? 0)), 0)

  async function saveDraft(andNavigate = false) {
    setSaving(true)
    try {
      let orderId = savedOrderId
      if (!orderId) {
        const res = await fetch('/api/pos/orders', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'manual', created_by: 'user' }),
        }).then(r => r.json())
        orderId = res.order?.id ?? null
        if (!orderId) throw new Error(res.error ?? 'Failed to create order')
        setSavedOrderId(orderId)
      }
      // Save lines
      await Promise.all(draft.map((l, i) =>
        fetch(`/api/pos/orders/${orderId}/lines`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...l, sort_order: i, market_loading: undefined }),
        })
      ))
      const orderNumber = `PO-${new Date().getFullYear()}-####`
      setToast(`Order saved`)
      setTimeout(() => setToast(''), 3000)
      if (andNavigate && orderId) router.push(`/pos/orders/${orderId}`)
    } catch (e: any) { setToast(e.message ?? 'Save failed') }
    setSaving(false)
  }

  const filtered = products.filter(p => {
    const s = stockStatus(p)
    if (filter === 'low' && s !== 'low') return false
    if (filter === 'out' && s !== 'out') return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q)
  })

  // Group draft by supplier
  const groups = draft.reduce((acc, l) => {
    const key = l.supplier_name ?? 'No supplier'
    if (!acc[key]) acc[key] = []
    acc[key].push(l)
    return acc
  }, {} as Record<string, DraftLine[]>)

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <Link href="/pos/orders" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 12 }}>
          <ArrowLeft size={14} /> Orders
        </Link>
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, flex: 1 }}>New Order</h1>
        <button onClick={() => saveDraft(false)} disabled={saving || !draft.length}
          style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: !draft.length ? 0.4 : 1 }}>
          {saving ? 'Saving…' : savedOrderId ? 'Update Draft' : 'Save Draft'}
        </button>
        <button onClick={() => saveDraft(true)} disabled={saving || !draft.length}
          style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: V, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, opacity: !draft.length ? 0.4 : 1 }}>
          {saving ? <Loader2 size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> : null}
          Finalize & Review →
        </button>
        {toast && <span style={{ fontSize: 12, color: 'var(--success)', marginLeft: 8 }}>✓ {toast}</span>}
      </div>

      {/* Two-pane body */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 420px', overflow: 'hidden' }}>
        {/* LEFT: Products */}
        <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--divider)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)', flexShrink: 0 }}>
            <input style={{ ...inp, width: '100%', boxSizing: 'border-box', marginBottom: 10 }}
              value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…" />
            <div style={{ display: 'flex', gap: 6 }}>
              {(['all','low','out'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: '5px 12px', borderRadius: 7, border: `1px solid ${filter === f ? V : 'var(--divider)'}`,
                  background: filter === f ? 'rgba(127,184,151,0.10)' : 'transparent',
                  color: filter === f ? V : 'var(--text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  {f === 'all' ? 'All' : f === 'low' ? 'Low Stock' : 'Out of Stock'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.map(p => {
              const s = stockStatus(p)
              const inv = p.pos_outlet_inventory?.[0]
              const qty = inv?.items_on_hand ?? p.stock_quantity ?? 0
              const lastPrice = inv?.last_case_cost
              const inDraft = draft.some(l => l.product_id === p.id)
              return (
                <div key={p.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
                      {p.sku && <span>{p.sku}</span>}
                      {p.track_stock && (
                        <span style={{ padding: '1px 7px', borderRadius: 99, fontSize: 10, fontWeight: 600,
                          background: s === 'out' ? 'rgba(201,112,112,0.12)' : s === 'low' ? 'rgba(212,169,94,0.12)' : 'rgba(127,184,151,0.08)',
                          color: s === 'out' ? 'var(--destructive)' : s === 'low' ? 'var(--warning)' : 'var(--text-tertiary)',
                        }}>
                          {s === 'out' ? 'Out' : `${qty} left`}
                        </span>
                      )}
                      {lastPrice != null && <span>Last: ${lastPrice.toFixed(2)}/case</span>}
                    </div>
                  </div>
                  <button onClick={() => addProduct(p)} style={{
                    padding: '7px 14px', borderRadius: 8, border: `1px solid ${inDraft ? V : 'var(--divider)'}`,
                    background: inDraft ? 'rgba(127,184,151,0.10)' : 'transparent',
                    color: inDraft ? V : 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    <Plus size={12} /> {inDraft ? 'Add more' : 'Add'}
                  </button>
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                <Package size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
                <div>No products {search ? `matching "${search}"` : `with ${filter} stock`}</div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Order draft */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Order Draft</span>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(127,184,151,0.10)', color: V }}>{draft.length} items</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            {draft.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-tertiary)', fontSize: 13 }}>
                <Package size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
                <div>Tap + Add on a product to begin</div>
              </div>
            ) : Object.entries(groups).map(([supplier, lines]) => (
              <div key={supplier} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>{supplier}</div>
                {lines.map(line => {
                  const lineTotal = line.quantity_cases * (line.confirmed_price ?? 0)
                  return (
                    <div key={line.product_id} style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: 12, marginBottom: 8, position: 'relative' }}>
                      <button onClick={() => removeLine(line.product_id)} style={{ position: 'absolute', top: 8, right: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 2 }}>
                        <X size={13} />
                      </button>
                      <div style={{ fontSize: 13, fontWeight: 600, paddingRight: 20, marginBottom: 8, color: 'var(--text-primary)' }}>{line.product_name}</div>
                      {/* Qty */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-input)', borderRadius: 7, padding: '5px 10px' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Cases</span>
                          <input type="number" min="0" style={{ ...inp, width: 50, padding: '0', background: 'transparent', fontSize: 13, fontWeight: 700 }}
                            value={line.quantity_cases}
                            onChange={e => updateLine(line.product_id, 'quantity_cases', parseInt(e.target.value) || 0)} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-input)', borderRadius: 7, padding: '5px 10px' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Items</span>
                          <input type="number" min="0" style={{ ...inp, width: 50, padding: '0', background: 'transparent', fontSize: 13, fontWeight: 700 }}
                            value={line.quantity_items}
                            onChange={e => updateLine(line.product_id, 'quantity_items', parseInt(e.target.value) || 0)} />
                        </div>
                      </div>
                      {/* Prices */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12 }}>
                        {line.last_purchase_price != null && (
                          <div style={{ color: 'var(--text-tertiary)' }}>Last paid: <strong>${line.last_purchase_price.toFixed(2)}</strong>/case</div>
                        )}
                        {line.market_loading ? (
                          <div style={{ color: 'var(--text-tertiary)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Loader2 size={11} style={{ animation: 'spin 0.7s linear infinite' }} /> Loading…
                          </div>
                        ) : line.open_market_low != null ? (
                          <div style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}
                            title={line.open_market_source?.includes('estimate')
                              ? 'Estimated retail price based on industry typical markup (last paid × 1.60).'
                              : 'Public retail shelf price. Wholesale is typically 55-65% of this figure.'}>
                            {line.open_market_source?.includes('estimate')
                              ? `≈ $${line.open_market_low.toFixed(2)} estimated retail ⓘ`
                              : `Market ref: $${line.open_market_low.toFixed(2)}–$${(line.open_market_high ?? line.open_market_low).toFixed(2)} · ${line.open_market_source} ⓘ`}
                          </div>
                        ) : (
                          <div style={{ color: 'var(--text-tertiary)', opacity: 0.6, fontSize: 11 }}>No estimate available</div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Your price:</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-input)', borderRadius: 6, padding: '4px 8px' }}>
                            <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>$</span>
                            <input type="number" min="0" step="0.01" style={{ ...inp, width: 70, padding: 0, background: 'transparent', fontSize: 13 }}
                              value={line.confirmed_price ?? ''}
                              placeholder="0.00"
                              onChange={e => updateLine(line.product_id, 'confirmed_price', e.target.value === '' ? null : parseFloat(e.target.value))} />
                          </div>
                        </div>
                      </div>
                      {/* Line total */}
                      <div style={{ marginTop: 8, textAlign: 'right', fontFamily: "'Instrument Serif',Georgia,serif", fontStyle: 'italic', fontWeight: 500, fontSize: 16,
                        background: 'linear-gradient(135deg,var(--sage-light,#9FC9B0),var(--sage,#7FB897))',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                        ${lineTotal.toFixed(2)}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          {/* Bottom bar */}
          {draft.length > 0 && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--divider)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{draft.length} products · {draft.reduce((s, l) => s + l.quantity_cases, 0)} cases</span>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>Estimated total</div>
                <div style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontStyle: 'italic', fontWeight: 500, fontSize: 22,
                  background: 'linear-gradient(135deg,var(--sage-light,#9FC9B0),var(--sage,#7FB897))',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  ${grandTotal.toFixed(2)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
