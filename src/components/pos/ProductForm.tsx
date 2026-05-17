'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { MetricLabel } from '@/components/ui/MetricLabel'
import { detectContainerType } from '@/lib/container-detect'

export interface ProductFormData {
  id?: string
  name: string
  sku: string
  barcode: string
  description: string
  category_id: string
  brand: string
  supplier_id: string
  container_type: string
  cost_price: number
  price: number
  tax_rate: number
  tax_code_id: string | null
  additional_tax_code_ids: string[]
  stock_quantity: number
  low_stock_threshold: number
  case_quantity: number
  is_active: boolean
  track_stock: boolean
  image_url: string
  is_age_restricted: boolean
}

const EMPTY: ProductFormData = {
  name: '', sku: '', barcode: '', description: '',
  category_id: '', brand: '', supplier_id: '',
  container_type: 'unknown',
  cost_price: 0, price: 0, tax_rate: 10,
  tax_code_id: null, additional_tax_code_ids: [],
  stock_quantity: 0, low_stock_threshold: 5, case_quantity: 1,
  is_active: true, track_stock: true,
  image_url: '', is_age_restricted: false,
}

interface Props {
  initial?: Partial<ProductFormData>
  mode: 'create' | 'edit'
  suppliers?: { id: string; name: string }[]
  categories?: { id: string; name: string }[]
}

const iS: React.CSSProperties = {
  width: '100%', padding: '9px 11px', borderRadius: 7,
  background: 'var(--bg-input)', border: '1px solid var(--divider)',
  color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

export function ProductForm({ initial, mode, suppliers = [], categories = [] }: Props) {
  const router = useRouter()
  const [data, setData] = useState<ProductFormData>({ ...EMPTY, ...initial })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [taxCodes, setTaxCodes] = useState<Array<{ id: string; code: string; name: string }>>([])

  useEffect(() => {
    fetch('/api/pos/tax-codes').then(r => r.json()).then(d => setTaxCodes(d.tax_codes ?? [])).catch(() => {})
  }, [])

  // Auto-detect container type from product name
  useEffect(() => {
    if (mode === 'create' && data.name && data.container_type === 'unknown') {
      const detected = detectContainerType(data.name)
      if (detected !== 'unknown') setData(d => ({ ...d, container_type: detected }))
    }
  }, [data.name, mode, data.container_type])

  const margin = data.price > 0 && data.cost_price > 0
    ? Math.round(((data.price - data.cost_price) / data.price) * 1000) / 10
    : 0

  const set = <K extends keyof ProductFormData>(k: K, v: ProductFormData[K]) =>
    setData(d => ({ ...d, [k]: v }))

  const save = async () => {
    if (!data.name.trim()) { setError('Product name is required'); return }
    if (data.price <= 0) { setError('Sale price must be greater than $0'); return }
    setSaving(true); setError(null)
    try {
      const payload = {
        name: data.name.trim(),
        sku: data.sku.trim() || undefined,
        barcode: data.barcode.trim() || null,
        description: data.description.trim() || null,
        category_id: data.category_id || null,
        supplier_id: data.supplier_id || null,
        container_type: data.container_type,
        cost_price: data.cost_price,
        price: data.price,
        tax_rate: data.tax_rate,
        tax_code_id: data.tax_code_id || null,
        additional_tax_code_ids: data.additional_tax_code_ids ?? [],
        stock_quantity: data.stock_quantity,
        low_stock_threshold: data.low_stock_threshold,
        case_quantity: data.case_quantity,
        is_active: data.is_active,
        track_stock: data.track_stock,
        image_url: data.image_url || null,
        is_age_restricted: data.is_age_restricted,
      }

      const url = mode === 'create' ? '/api/pos/products' : `/api/pos/products/${data.id}`
      const method = mode === 'create' ? 'POST' : 'PATCH'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? `Save failed (${res.status})`)
      }
      const result = await res.json() as { product?: { id: string } }
      if (mode === 'create') {
        router.push(`/pos/products/${result.product?.id ?? ''}/edit`)
      } else {
        router.push('/pos/products')
      }
    } catch (e) {
      setError((e as Error).message ?? 'Unknown error')
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', padding: '28px 24px', fontFamily: "'Manrope',sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <MetricLabel>{mode === 'create' ? 'New product' : 'Edit product'}</MetricLabel>
        <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 26, margin: '4px 0 0', color: 'var(--text-primary)' }}>
          {data.name || 'Untitled product'}
        </h1>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: 'var(--destructive-bg)', color: 'var(--destructive)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Basic info */}
      <GlassPanel elevated style={{ padding: 20, marginBottom: 14 }}>
        <MetricLabel>Basic info</MetricLabel>
        <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
          <Field label="Name *">
            <input value={data.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Carlton Dry 6-pack" style={iS} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="SKU">
              <input value={data.sku} onChange={e => set('sku', e.target.value)} placeholder="Auto-generated if blank" style={iS} />
            </Field>
            <Field label="Barcode">
              <input value={data.barcode} onChange={e => set('barcode', e.target.value)} placeholder="Scan or type EAN" style={iS} />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Category">
              <select value={data.category_id} onChange={e => set('category_id', e.target.value)} style={iS}>
                <option value="">— None —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Container type">
              <select value={data.container_type} onChange={e => set('container_type', e.target.value)} style={iS}>
                <option value="unknown">Not specified</option>
                <option value="can">Can / stubbie</option>
                <option value="bottle">Bottle</option>
                <option value="case">Case / slab</option>
                <option value="cask">Cask</option>
                <option value="glass">Glass / nip</option>
              </select>
            </Field>
          </div>
          <Field label="Description">
            <textarea value={data.description} onChange={e => set('description', e.target.value)} rows={2} placeholder="Optional — appears on receipts" style={{ ...iS, resize: 'vertical' }} />
          </Field>
        </div>
      </GlassPanel>

      {/* Pricing */}
      <GlassPanel elevated style={{ padding: 20, marginBottom: 14 }}>
        <MetricLabel>Pricing</MetricLabel>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
          <Field label="Cost price ($)">
            <input type="number" step="0.01" min="0" value={data.cost_price || ''} onChange={e => set('cost_price', parseFloat(e.target.value) || 0)} placeholder="0.00" style={iS} />
          </Field>
          <Field label="Sale price ($) *">
            <input type="number" step="0.01" min="0" value={data.price || ''} onChange={e => set('price', parseFloat(e.target.value) || 0)} placeholder="0.00" style={iS} />
          </Field>
          <Field label="Tax rate (%)">
            <input type="number" step="1" min="0" max="100" value={data.tax_rate} onChange={e => set('tax_rate', parseFloat(e.target.value) || 0)} style={iS} />
          </Field>
          <Field label="Margin">
            <div style={{ ...iS, display: 'flex', alignItems: 'center', background: 'var(--bg-base)', fontWeight: 700, color: margin > 30 ? 'var(--success)' : margin > 10 ? 'var(--warning)' : 'var(--destructive)' }}>
              {margin}%
            </div>
          </Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <Field label="Tax code">
            <select value={data.tax_code_id ?? ''} onChange={e => set('tax_code_id', e.target.value || null)} style={iS}>
              <option value="">— Auto (from tax rate) —</option>
              {taxCodes.map(tc => <option key={tc.id} value={tc.id}>{tc.code} — {tc.name}</option>)}
            </select>
          </Field>
        </div>
      </GlassPanel>

      {/* Inventory */}
      <GlassPanel elevated style={{ padding: 20, marginBottom: 14 }}>
        <MetricLabel>Inventory</MetricLabel>
        <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={data.track_stock} onChange={e => set('track_stock', e.target.checked)} />
            Track inventory levels for this product
          </label>
          {data.track_stock && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
              <Field label="Stock on hand">
                <input type="number" min="0" value={data.stock_quantity} onChange={e => set('stock_quantity', parseInt(e.target.value) || 0)} style={iS} />
              </Field>
              <Field label="Reorder when below">
                <input type="number" min="0" value={data.low_stock_threshold} onChange={e => set('low_stock_threshold', parseInt(e.target.value) || 0)} style={iS} />
              </Field>
              <Field label="Case quantity">
                <input type="number" min="1" value={data.case_quantity} onChange={e => set('case_quantity', parseInt(e.target.value) || 1)} style={iS} />
              </Field>
              <Field label="Age restricted">
                <div style={{ paddingTop: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={data.is_age_restricted} onChange={e => set('is_age_restricted', e.target.checked)} />
                    18+ required
                  </label>
                </div>
              </Field>
            </div>
          )}
        </div>
      </GlassPanel>

      {/* Supplier + status */}
      <GlassPanel elevated style={{ padding: 20, marginBottom: 24 }}>
        <MetricLabel>Supplier & status</MetricLabel>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Supplier">
            <select value={data.supplier_id} onChange={e => set('supplier_id', e.target.value)} style={iS}>
              <option value="">— None —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <div style={{ paddingTop: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={data.is_active} onChange={e => set('is_active', e.target.checked)} />
                Active — show in terminal product grid
              </label>
            </div>
          </Field>
        </div>
      </GlassPanel>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button onClick={() => router.push('/pos/products')} style={{ padding: '10px 18px', borderRadius: 8, background: 'transparent', border: '1px solid var(--divider)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
          Cancel
        </button>
        <button onClick={save} disabled={saving} style={{ padding: '10px 24px', borderRadius: 8, background: 'var(--gradient-aria)', border: 'none', color: '#fff', cursor: saving ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', boxShadow: '0 4px 16px var(--violet-glow)', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving...' : mode === 'create' ? 'Save product' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
