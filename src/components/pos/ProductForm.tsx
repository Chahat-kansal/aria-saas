'use client'
import { useState, useEffect, useRef } from 'react'
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
  image_thumb_url: string
  is_age_restricted: boolean
  is_weight_based: boolean
  price_per_kg: number
}

const EMPTY: ProductFormData = {
  name: '', sku: '', barcode: '', description: '',
  category_id: '', brand: '', supplier_id: '',
  container_type: 'unknown',
  cost_price: 0, price: 0, tax_rate: 10,
  tax_code_id: null, additional_tax_code_ids: [],
  stock_quantity: 0, low_stock_threshold: 5, case_quantity: 1,
  is_active: true, track_stock: true,
  image_url: '', image_thumb_url: '',
  is_age_restricted: false,
  is_weight_based: false, price_per_kg: 0,
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

type ImgState = 'idle' | 'removing-bg' | 'uploading' | 'error'

export function ProductForm({ initial, mode, suppliers = [], categories = [] }: Props) {
  const router = useRouter()
  const [data, setData] = useState<ProductFormData>({ ...EMPTY, ...initial })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [taxCodes, setTaxCodes] = useState<Array<{ id: string; code: string; name: string }>>([])

  // Image picker state
  const [imgFile, setImgFile] = useState<File | null>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [removeBg, setRemoveBg] = useState(false)
  const [imgState, setImgState] = useState<ImgState>('idle')
  const [imgError, setImgError] = useState<string | null>(null)
  const [credits, setCredits] = useState<{ free_remaining: number; paid_credits: number } | null>(null)
  const [aiGenBusy, setAiGenBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/pos/tax-codes').then(r => r.json()).then(d => setTaxCodes(d.tax_codes ?? [])).catch(() => {})
    fetch('/api/pos/image-credits').then(r => r.json()).then(d => setCredits(d)).catch(() => {})
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

  // ─── Image helpers ─────────────────────────────────────────────────────
  const processAndUpload = async (file: File | Blob, withBgRemoval: boolean) => {
    setImgError(null)
    let uploadFile: File | Blob = file

    if (withBgRemoval) {
      setImgState('removing-bg')
      try {
        const { removeBackground } = await import('@imgly/background-removal')
        const blob = await removeBackground(file instanceof File ? file : new File([file], 'image.png', { type: 'image/png' }))
        uploadFile = blob
        if (localPreview) URL.revokeObjectURL(localPreview)
        setLocalPreview(URL.createObjectURL(blob))
      } catch {
        setImgError('Background removal failed — uploading original')
        uploadFile = file
      }
    }

    setImgState('uploading')
    try {
      const fd = new FormData()
      fd.append('file', uploadFile)
      if (data.id) fd.append('productId', data.id)

      const res = await fetch('/api/pos/products/upload-image', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Upload failed')
      }
      const json = await res.json() as { image_url: string; image_thumb_url: string }
      set('image_url', json.image_url)
      set('image_thumb_url', json.image_thumb_url ?? '')
      setImgState('idle')
    } catch (e) {
      setImgState('error')
      setImgError((e as Error).message ?? 'Image upload failed')
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileInputRef.current) fileInputRef.current.value = ''

    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
    if (!ALLOWED.includes(file.type)) { setImgError('Image must be JPEG, PNG, or WebP'); return }
    if (file.size > 5 * 1024 * 1024) { setImgError('Image must be ≤5MB'); return }

    setImgFile(file)
    if (localPreview) URL.revokeObjectURL(localPreview)
    setLocalPreview(URL.createObjectURL(file))
    setImgError(null)
    await processAndUpload(file, removeBg)
  }

  const handleRemoveBgToggle = async (checked: boolean) => {
    setRemoveBg(checked)
    if (imgFile) await processAndUpload(imgFile, checked)
  }

  const handleAiGen = async () => {
    setAiGenBusy(true)
    setImgError(null)
    const catName = categories.find(c => c.id === data.category_id)?.name ?? ''
    try {
      const res = await fetch('/api/pos/products/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: data.id || undefined,
          name: data.name || 'Product',
          description: data.description || undefined,
          categoryName: catName || undefined,
          businessId: (initial as any)?.business_id ?? undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Generation failed')
      }
      const json = await res.json() as { image_url: string; image_thumb_url: string | null; remaining_credits: number }
      set('image_url', json.image_url)
      set('image_thumb_url', json.image_thumb_url ?? '')
      setLocalPreview(null)
      setImgFile(null)
      if (credits) setCredits({ ...credits, paid_credits: json.remaining_credits })
    } catch (e) {
      setImgError((e as Error).message ?? 'AI generation failed')
    }
    setAiGenBusy(false)
  }
  // ─── End image helpers ─────────────────────────────────────────────────

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
        image_thumb_url: data.image_thumb_url || null,
        is_age_restricted: data.is_age_restricted,
        is_weight_based: data.is_weight_based,
        price_per_kg: data.is_weight_based ? data.price_per_kg : null,
      }

      const url = mode === 'create' ? '/api/pos/products' : '/api/pos/products/' + data.id
      const method = mode === 'create' ? 'POST' : 'PATCH'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Save failed (' + res.status + ')')
      }
      const result = await res.json() as { product?: { id: string } }
      if (mode === 'create') {
        router.push('/pos/products/' + (result.product?.id ?? '') + '/edit')
      } else {
        router.push('/pos/products')
      }
    } catch (e) {
      setError((e as Error).message ?? 'Unknown error')
      setSaving(false)
    }
  }

  const previewSrc = localPreview || data.image_url || null
  const imgBusy = imgState === 'uploading' || imgState === 'removing-bg' || aiGenBusy
  const canAiGen = !!data.name.trim() && (credits?.paid_credits ?? 0) > 0 && !imgBusy
  const creditLabel = credits === null ? '' : '(' + credits.paid_credits + ' credits)'

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

      {/* Image picker */}
      <GlassPanel elevated style={{ padding: 20, marginBottom: 14 }}>
        <MetricLabel>Product image</MetricLabel>
        <div style={{ marginTop: 14, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* Preview */}
          <div style={{ width: 100, height: 100, borderRadius: 10, background: '#f4f4f5', border: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
            {imgBusy && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(244,244,245,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, zIndex: 1 }}>
                {imgState === 'removing-bg' ? 'Removing\nBG...' : aiGenBusy ? 'Generating...' : 'Uploading...'}
              </div>
            )}
            {previewSrc ? (
              <img src={previewSrc} alt="Product" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
            ) : (
              <span style={{ fontSize: 36, color: '#c4c4c8' }}>{'☕'}</span>
            )}
          </div>

          {/* Controls */}
          <div style={{ flex: 1 }}>
            {/* File picker button */}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--divider)', cursor: imgBusy ? 'wait' : 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 10, opacity: imgBusy ? 0.6 : 1 }}>
              {'📷 Choose photo'}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
                disabled={imgBusy}
              />
            </label>

            {/* BG removal toggle — shown when a file has been selected */}
            {imgFile && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: imgBusy ? 'wait' : 'pointer', marginBottom: 8, color: 'var(--text-primary)' }}>
                <input
                  type="checkbox"
                  checked={removeBg}
                  disabled={imgBusy}
                  onChange={e => handleRemoveBgToggle(e.target.checked)}
                />
                {'Remove background (free, in-browser)'}
              </label>
            )}

            {/* AI gen button — shown when no image uploaded yet */}
            {!data.image_url && (
              <div style={{ marginBottom: 8 }}>
                <button
                  onClick={handleAiGen}
                  disabled={!canAiGen}
                  title={credits?.paid_credits === 0 ? 'No AI credits — purchase credits to generate' : ''}
                  style={{ padding: '7px 14px', borderRadius: 8, background: canAiGen ? 'var(--gradient-aria)' : 'var(--bg-card)', border: canAiGen ? 'none' : '1px solid var(--divider)', color: canAiGen ? '#fff' : 'var(--text-tertiary)', cursor: canAiGen ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', opacity: aiGenBusy ? 0.6 : 1 }}
                >
                  {'✨ Generate with AI ' + creditLabel}
                </button>
                {credits?.paid_credits === 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8 }}>{'No credits — add more in Settings'}</span>
                )}
              </div>
            )}

            {/* Status / error */}
            {imgState !== 'idle' && !imgError && (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                {imgState === 'uploading' && '⬆ Uploading...'}
                {imgState === 'removing-bg' && '✂ Removing background...'}
                {imgState === 'error' && '⚠ Upload failed'}
              </div>
            )}
            {imgError && (
              <div style={{ fontSize: 12, color: 'var(--destructive)', marginTop: 4 }}>{imgError}</div>
            )}

            {/* Clear image */}
            {data.image_url && !imgBusy && (
              <button
                onClick={() => { set('image_url', ''); set('image_thumb_url', ''); setLocalPreview(null); setImgFile(null); setRemoveBg(false); setImgState('idle'); setImgError(null) }}
                style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 6, display: 'block' }}
              >
                {'✕ Remove image'}
              </button>
            )}
          </div>
        </div>
      </GlassPanel>

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
                <option value="">{'— None —'}</option>
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
              <option value="">{'— Auto (from tax rate) —'}</option>
              {taxCodes.map(tc => <option key={tc.id} value={tc.id}>{tc.code} {' — '} {tc.name}</option>)}
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={data.is_weight_based} onChange={e => {
              set('is_weight_based', e.target.checked)
              if (e.target.checked && data.price_per_kg === 0 && data.price > 0) {
                set('price_per_kg', data.price)
              }
            }} />
            Sell by weight (price per kg — e.g. bakery, deli, produce)
          </label>
          {data.is_weight_based && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Price per kg ($)">
                <input type="number" min="0" step="0.01" value={data.price_per_kg}
                  onChange={e => { const v = parseFloat(e.target.value) || 0; set('price_per_kg', v); set('price', v) }}
                  style={iS} placeholder="e.g. 12.00" />
              </Field>
              <div style={{ paddingTop: 20, fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                Cashier will enter weight at checkout.<br />
                Price = weight {'×'} $/kg
              </div>
            </div>
          )}
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
        <MetricLabel>{'Supplier & status'}</MetricLabel>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Supplier">
            <select value={data.supplier_id} onChange={e => set('supplier_id', e.target.value)} style={iS}>
              <option value="">{'— None —'}</option>
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
