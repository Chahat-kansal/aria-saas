'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import IndustryProductForm from '@/components/products/industry/IndustryProductForm'
import type { ProductDraft } from '@/components/products/industry/CommonFields'

// Session key for draft persistence across navigation (cleared on window close)
const DRAFT_KEY = (bid?: string) => `aria_product_draft_${bid ?? 'default'}`

interface Supplier { id: string; name: string }
interface Category { id: string; name: string }
interface Draft {
  id?: string; name?: string; sku?: string; barcode?: string; description?: string;
  price?: number; cost_price?: number; tax_rate?: number;
  stock_quantity?: number; low_stock_threshold?: number; track_stock?: boolean;
  category_id?: string; supplier_id?: string; image_url?: string; container_type?: string;
  is_active?: boolean;
}

interface Props {
  step: number
  id?: string
  businessId?: string
  draft: Draft
  suppliers: Supplier[]
  categories: Category[]
}

const STEPS = [
  { n: 1, label: 'Identity' },
  { n: 2, label: 'Category' },
  { n: 3, label: 'Pricing' },
  { n: 4, label: 'Inventory' },
  { n: 5, label: 'Review' },
]

const V = 'var(--violet)'
const C = {
  bg: 'var(--bg-base)', surface: 'var(--bg-surface)', elevated: 'var(--bg-elevated)',
  text: 'var(--text-primary)', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  divider: 'var(--divider)',
}
const inp: React.CSSProperties = {
  width: '100%', background: 'var(--bg-input)', border: 'none', borderRadius: 8,
  padding: '10px 12px', fontSize: 13, color: C.text, outline: 'none',
  fontFamily: "'Manrope',sans-serif", boxSizing: 'border-box',
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: C.muted,
  marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em',
}
const btn = (primary = false): React.CSSProperties => ({
  padding: '10px 22px', borderRadius: 9, border: 'none', cursor: 'pointer',
  fontSize: 13, fontWeight: 700, fontFamily: "'Manrope',sans-serif",
  background: primary ? V : 'var(--bg-elevated)', color: primary ? '#fff' : C.muted,
})

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={lbl}>{label}</label>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value?: string | number | boolean }) {
  const display = value === undefined || value === null || value === '' ? '—' : String(value)
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.divider}`, fontSize: 13 }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ color: C.text, fontWeight: 500 }}>{display}</span>
    </div>
  )
}

export default function ProductWizard({ step, id, businessId, draft, suppliers, categories }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Step 1 state — unified ProductDraft for IndustryProductForm
  const [ipDraft, setIpDraft] = useState<ProductDraft>({
    name: draft.name ?? '',
    sku: draft.sku ?? '',
    barcode: draft.barcode ?? '',
    description: draft.description ?? '',
  })
  // Keep individual vars as aliases for save logic below
  const name = String(ipDraft.name ?? '')
  const sku = String(ipDraft.sku ?? '')
  const barcode = String(ipDraft.barcode ?? '')
  const description = String(ipDraft.description ?? '')

  // Barcode lookup — autofill from global_products / Open Food Facts
  const [barcodeLookupResult, setBarcodeLookupResult] = useState<Record<string, unknown> | null>(null)
  const [barcodeLookupStatus, setBarcodeLookupStatus] = useState<'idle'|'loading'|'found'|'not_found'>('idle')
  const barcodeRef = useRef<string>('')

  useEffect(() => {
    const bc = String(ipDraft.barcode ?? '').trim()
    if (bc.length < 6) { setBarcodeLookupStatus('idle'); return }
    if (bc === barcodeRef.current) return
    barcodeRef.current = bc
    const timer = setTimeout(async () => {
      setBarcodeLookupStatus('loading')
      try {
        const r = await fetch(`/api/products/barcode-lookup?barcode=${encodeURIComponent(bc)}`)
        const d = await r.json()
        if (d.found && d.product) {
          setBarcodeLookupResult(d.product)
          setBarcodeLookupStatus('found')
        } else {
          setBarcodeLookupStatus('not_found')
        }
      } catch { setBarcodeLookupStatus('idle') }
    }, 600)
    return () => clearTimeout(timer)
  }, [ipDraft.barcode])

  const applyBarcodeLookup = useCallback(() => {
    if (!barcodeLookupResult) return
    const p = barcodeLookupResult as any
    setIpDraft(f => ({
      ...f,
      name: p.name ?? f.name,
      brand: p.brand ?? f.brand,
      description: p.description ?? f.description,
      size: p.size ?? f.size,
      image_url: p.image_url ?? f.image_url,
    }))
    if (p.suggested_price_cents) setPrice(String(p.suggested_price_cents / 100))
    if (p.category) setCategoryId(p.category)
    setBarcodeLookupStatus('idle')
    setBarcodeLookupResult(null)
  }, [barcodeLookupResult])

  // Draft persistence — restore from sessionStorage on mount, save on every change
  const [draftRestored, setDraftRestored] = useState(false)
  const [showResumeBanner, setShowResumeBanner] = useState(false)

  // Restore draft on first mount (if no id — meaning new product, not editing existing)
  useEffect(() => {
    if (id || draftRestored) return // don't restore when editing existing product
    try {
      const key = DRAFT_KEY(businessId)
      const saved = sessionStorage.getItem(key)
      if (saved) {
        const d = JSON.parse(saved)
        if (d.ipDraft?.name) { // only restore if there's meaningful data
          setIpDraft(d.ipDraft ?? {})
          if (d.categoryId) setCategoryId(d.categoryId)
          if (d.supplierId) setSupplierId(d.supplierId)
          if (d.containerType) setContainerType(d.containerType)
          if (d.imageUrl) setImageUrl(d.imageUrl)
          if (d.price) setPrice(d.price)
          if (d.costPrice) setCostPrice(d.costPrice)
          if (d.taxRate) setTaxRate(d.taxRate)
          if (d.stockQty) setStockQty(d.stockQty)
          if (d.lowStockThreshold) setLowStockThreshold(d.lowStockThreshold)
          if (d.trackStock !== undefined) setTrackStock(d.trackStock)
          setShowResumeBanner(true)
        }
      }
    } catch { /* ignore */ }
    setDraftRestored(true)
  }, []) // eslint-disable-line

  // Step 2 state
  const [categoryId, setCategoryId] = useState(draft.category_id ?? '')
  const [supplierId, setSupplierId] = useState(draft.supplier_id ?? '')
  const [containerType, setContainerType] = useState(draft.container_type ?? 'unknown')
  const [imageUrl, setImageUrl] = useState(draft.image_url ?? '')

  // Step 3 state
  const [price, setPrice] = useState(draft.price != null ? String(draft.price) : '')
  const [costPrice, setCostPrice] = useState(draft.cost_price != null ? String(draft.cost_price) : '')
  const [taxRate, setTaxRate] = useState(draft.tax_rate != null ? String(draft.tax_rate) : '10')

  // Step 4 state
  const [trackStock, setTrackStock] = useState(draft.track_stock ?? true)
  const [stockQty, setStockQty] = useState(draft.stock_quantity != null ? String(draft.stock_quantity) : '0')
  const [lowStockThreshold, setLowStockThreshold] = useState(draft.low_stock_threshold != null ? String(draft.low_stock_threshold) : '5')

  // Save draft to sessionStorage whenever any field changes
  useEffect(() => {
    if (!draftRestored || id) return // don't save while still restoring or editing existing
    try {
      const snapshot = { ipDraft, categoryId, supplierId, containerType, imageUrl, price, costPrice, taxRate, stockQty, lowStockThreshold, trackStock, savedAt: Date.now() }
      sessionStorage.setItem(DRAFT_KEY(businessId), JSON.stringify(snapshot))
    } catch { /* ignore */ }
  }, [ipDraft, categoryId, supplierId, containerType, imageUrl, price, costPrice, taxRate, stockQty, lowStockThreshold, trackStock, draftRestored, id, businessId])

  const margin = (() => {
    const p = parseFloat(price); const c = parseFloat(costPrice)
    if (!p || !c || p <= 0) return null
    return (((p - c) / p) * 100).toFixed(1)
  })()

  const patch = useCallback(async (payload: Record<string, unknown>, action?: string) => {
    if (!id) return false
    const url = action ? `/api/pos/products/${id}?action=${action}` : `/api/pos/products/${id}`
    const res = await fetch(url, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return res.ok
  }, [id])

  // ── Step 1: atomic draft creation via Supabase RPC ──────────────
  async function saveStep1() {
    if (!name.trim()) { setError('Product name is required'); return }
    setSaving(true); setError('')
    try {
      // Try the atomic RPC first — creates product + outlet_inventory rows + default price + loyalty
      if (businessId) {
        const { supabase: sb } = await import('@/lib/supabase')
        if (sb) {
          const { data: productId, error: rpcError } = await sb.rpc('create_product_draft', {
            p_business_id: businessId,
            p_name: name.trim(),
            p_sku: sku || null,
            p_barcode: barcode || null,
            p_brand: null,
            p_description: description || null,
          })
          if (!rpcError && productId) {
            setSaving(false)
            router.push(`/pos/products/new?id=${productId}&step=2`)
            return
          }
          // RPC not yet migrated — fall through to REST POST
        }
      }
      // Fallback: REST POST (works without the RPC migration)
      const res = await fetch('/api/pos/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), sku, barcode, description, is_active: false }),
      })
      const d = await res.json()
      if (d.product?.id) {
        setSaving(false)
        router.push(`/pos/products/new?id=${d.product.id}&step=2`)
      } else {
        setError(d.error ?? 'Failed to create draft'); setSaving(false)
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create draft'); setSaving(false)
    }
  }

  // ── Steps 2-4: PATCH draft ──────────────────────────────────────
  async function saveStep2() {
    setSaving(true); setError('')
    const ok = await patch({ category_id: categoryId || null, supplier_id: supplierId || null, container_type: containerType, image_url: imageUrl || null })
    if (ok) { setSaving(false); router.push(`/pos/products/new?id=${id}&step=3`) }
    else { setError('Save failed'); setSaving(false) }
  }

  async function saveStep3() {
    if (!price) { setError('Sale price is required'); return }
    setSaving(true); setError('')
    const ok = await patch({ price: parseFloat(price), cost_price: costPrice ? parseFloat(costPrice) : null, tax_rate: parseFloat(taxRate) || 10 })
    if (ok) { setSaving(false); router.push(`/pos/products/new?id=${id}&step=4`) }
    else { setError('Save failed'); setSaving(false) }
  }

  async function saveStep4() {
    setSaving(true); setError('')
    const ok = await patch({
      track_stock: trackStock,
      stock_quantity: trackStock ? (parseInt(stockQty) || 0) : null,
      low_stock_threshold: parseInt(lowStockThreshold) || 5,
    })
    if (ok) { setSaving(false); router.push(`/pos/products/new?id=${id}&step=5`) }
    else { setError('Save failed'); setSaving(false) }
  }

  async function saveDraft() {
    setSaving(true); setError('')
    // Use update_general action to keep active=false (draft saved, return to list)
    const ok = await patch({ is_active: false }, 'update_general')
    if (ok) router.push('/pos/products?tab=drafts')
    else { setError('Save failed'); setSaving(false) }
  }

  async function activate() {
    setSaving(true); setError('')
    // Activate via update_general action — new schema action param
    const ok = await patch({ is_active: true }, 'update_general')
    if (ok) router.push(`/pos/products/${id}`)
    else { setError('Save failed'); setSaving(false) }
  }

  function goBack() {
    if (step > 1) {
      const base = id ? `/pos/products/new?id=${id}&step=${step - 1}` : `/pos/products/new?step=${step - 1}`
      router.push(base)
    } else {
      try { sessionStorage.removeItem(DRAFT_KEY(businessId)) } catch { /* ignore */ }
      router.push('/pos/products')
    }
  }

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '16px 28px', borderBottom: `1px solid ${C.divider}`, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={goBack} style={{ ...btn(), padding: '7px 14px', fontSize: 12 }}>← Back</button>
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Add Product</h1>
        {id && <span style={{ fontSize: 11, color: C.dim, marginLeft: 4 }}>Draft · {id.slice(0, 8)}</span>}
      </div>

      {/* Stepper */}
      <div style={{ padding: '20px 28px 0', display: 'flex', gap: 4, alignItems: 'center' }}>
        {STEPS.map((s, i) => (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
              background: step > s.n ? V : step === s.n ? V : 'var(--bg-elevated)',
              color: step >= s.n ? '#fff' : C.dim,
            }}>
              {step > s.n ? '✓' : s.n}
            </div>
            <span style={{ fontSize: 12, fontWeight: step === s.n ? 700 : 400, color: step === s.n ? C.text : C.dim }}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div style={{ width: 32, height: 2, background: step > s.n ? V : C.divider, margin: '0 4px' }} />
            )}
          </div>
        ))}
      </div>

      {/* Form */}
      <div style={{ maxWidth: 580, margin: '28px auto', padding: '0 28px 60px' }}>
        <div style={{ background: C.surface, borderRadius: 14, padding: '28px', boxShadow: 'var(--shadow-card)' }}>

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 24px' }}>Product Identity</h2>
              <IndustryProductForm form={ipDraft} setForm={setIpDraft} />
            </>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 24px' }}>Category & Details</h2>
              <Field label={<>Category <span style={{ color: C.dim, fontSize: 11, fontWeight: 400, letterSpacing: '0.04em' }}>(optional)</span></>}>
                <select style={inp} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                  <option value="">No category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label={<>Supplier <span style={{ color: C.dim, fontSize: 11, fontWeight: 400, letterSpacing: '0.04em' }}>(optional)</span></>}>
                <select style={inp} value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                  <option value="">No supplier</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Container type">
                <select style={inp} value={containerType} onChange={e => setContainerType(e.target.value)}>
                  {['unknown','bottle','can','keg','carton','box','bag','packet'].map(t => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </Field>
              <Field label="Image URL">
                <input style={inp} value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://…" />
              </Field>
            </>
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 24px' }}>Pricing</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Sale price (AUD) *">
                  <input style={inp} type="text" inputMode="decimal" pattern="^\d*\.?\d{0,2}$" value={price}
                    onChange={e => setPrice(e.target.value)} placeholder="0.00" autoFocus
                    onKeyDown={e => { const ok = ['0','1','2','3','4','5','6','7','8','9','.','Backspace','Delete','Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown']; if (!ok.includes(e.key) && !e.metaKey && !e.ctrlKey) e.preventDefault() }} />
                </Field>
                <Field label="Cost price (AUD)">
                  <input style={inp} type="text" inputMode="decimal" pattern="^\d*\.?\d{0,2}$" value={costPrice}
                    onChange={e => setCostPrice(e.target.value)} placeholder="0.00"
                    onKeyDown={e => { const ok = ['0','1','2','3','4','5','6','7','8','9','.','Backspace','Delete','Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown']; if (!ok.includes(e.key) && !e.metaKey && !e.ctrlKey) e.preventDefault() }} />
                </Field>
              </div>
              <Field label="GST rate (%)">
                <select style={inp} value={taxRate} onChange={e => setTaxRate(e.target.value)}>
                  <option value="0">0% — GST exempt</option>
                  <option value="10">10% — Standard GST</option>
                </select>
              </Field>
              {margin !== null && (
                <div style={{ padding: '12px 16px', borderRadius: 9, background: 'var(--bg-elevated)', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: C.muted }}>Gross margin</span>
                  <span style={{ fontWeight: 700, color: parseFloat(margin) < 20 ? 'var(--warning)' : 'var(--success)' }}>
                    {margin}%
                  </span>
                </div>
              )}
            </>
          )}

          {/* ── STEP 4 ── */}
          {step === 4 && (
            <>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 24px' }}>Inventory</h2>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', marginBottom: 18, borderBottom: `1px solid ${C.divider}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Track inventory</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Deduct stock when sold at terminal</div>
                </div>
                <button onClick={() => setTrackStock(v => !v)} style={{
                  width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: trackStock ? V : 'var(--bg-elevated)', position: 'relative', transition: 'background 200ms',
                }}>
                  <div style={{
                    position: 'absolute', top: 3, left: trackStock ? 23 : 3, width: 18, height: 18,
                    borderRadius: '50%', background: '#fff', transition: 'left 200ms',
                  }} />
                </button>
              </div>
              {trackStock && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Field label="Current stock">
                    <input style={inp} type="number" min="0" step="1" value={stockQty}
                      onChange={e => setStockQty(e.target.value)} autoFocus />
                  </Field>
                  <Field label="Low stock alert">
                    <input style={inp} type="number" min="0" step="1" value={lowStockThreshold}
                      onChange={e => setLowStockThreshold(e.target.value)} />
                  </Field>
                </div>
              )}
            </>
          )}

          {/* ── STEP 5: Review ── */}
          {step === 5 && (
            <>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 24px' }}>Review & Activate</h2>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Identity</div>
              <Row label="Name" value={draft.name ?? name} />
              <Row label="SKU" value={draft.sku ?? sku} />
              <Row label="Barcode" value={draft.barcode ?? barcode} />
              <div style={{ fontSize: 12, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 18, marginBottom: 10 }}>Pricing</div>
              <Row label="Sale price" value={draft.price != null ? `$${Number(draft.price).toFixed(2)}` : price ? `$${parseFloat(price).toFixed(2)}` : undefined} />
              <Row label="Cost price" value={draft.cost_price != null ? `$${Number(draft.cost_price).toFixed(2)}` : undefined} />
              <Row label="GST rate" value={`${draft.tax_rate ?? taxRate}%`} />
              <div style={{ fontSize: 12, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 18, marginBottom: 10 }}>Inventory</div>
              <Row label="Track stock" value={(draft.track_stock ?? trackStock) ? 'Yes' : 'No'} />
              {(draft.track_stock ?? trackStock) && <Row label="Opening stock" value={draft.stock_quantity ?? stockQty} />}
              <div style={{ marginTop: 24, padding: '14px 16px', borderRadius: 9, background: 'rgba(127,184,151,0.08)', border: '1px solid rgba(127,184,151,0.2)', fontSize: 13, color: C.muted }}>
                ✦ Activating adds this product to the terminal product grid immediately.
              </div>
            </>
          )}

          {error && (
            <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(201,112,112,0.1)', color: 'var(--destructive)', fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, paddingTop: 20, borderTop: `1px solid ${C.divider}` }}>
            <button onClick={goBack} style={btn()} disabled={saving}>
              {step === 1 ? 'Cancel' : '← Back'}
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              {step === 5 ? (
                <>
                  <button onClick={saveDraft} style={btn()} disabled={saving}>Save as draft</button>
                  <button onClick={activate} style={{ ...btn(true), opacity: saving ? 0.6 : 1 }} disabled={saving}>
                    {saving ? 'Saving…' : 'Activate product →'}
                  </button>
                </>
              ) : (
                <button
                  onClick={step === 1 ? saveStep1 : step === 2 ? saveStep2 : step === 3 ? saveStep3 : saveStep4}
                  style={{ ...btn(true), opacity: saving ? 0.6 : 1 }} disabled={saving}>
                  {saving ? 'Saving…' : 'Save & Continue →'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
