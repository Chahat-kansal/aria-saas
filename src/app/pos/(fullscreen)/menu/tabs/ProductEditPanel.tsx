'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

type ProductData = {
  id?: string
  name: string
  description: string
  price: string
  category_id: string
  is_active: boolean
  show_online: boolean
  ordering_mode: string
  ordering_archetype: string
  builder_type: string
  kds_station: string
  prep_time_seconds: string
  allergens: string[]
  is_gluten_free: boolean
  is_vegan: boolean
  is_vegetarian: boolean
  notes: string
  tags: string
  image_url: string
  image_thumb_url: string
  image_source: string
}

type Category = { id: string; name: string }
type Outlet = { id: string; name: string }
type Variant = { id?: string; name: string; price: string; is_active: boolean; sort_order: number }
type ModGroup = { id: string; name: string; selection_type: string }

// Looser type accepted from callers — all string fields may arrive as null from DB
type ProductInput = {
  id: string
  name: string
  description: string | null
  price: number | string
  category_id: string | null
  is_active: boolean
  show_online: boolean
  ordering_mode: string
  ordering_archetype: string | null
  builder_type: string | null
  kds_station: string
  prep_time_seconds: number | string | null
  allergens: string[]
  is_gluten_free: boolean
  is_vegan: boolean
  is_vegetarian: boolean
  notes: string | null
  tags: string[] | string
  image_url: string | null
  image_thumb_url: string | null
  image_source: string | null
}

interface Props {
  product: ProductInput | null
  categories: Category[]
  outlets: Outlet[]
  businessId: string
  onClose: () => void
  onSaved: () => void
}

// ── Constants ──────────────────────────────────────────────────────────────

const EMPTY: ProductData = {
  name: '',
  description: '',
  price: '0',
  category_id: '',
  is_active: true,
  show_online: true,
  ordering_mode: 'inherit',
  ordering_archetype: '',
  builder_type: '',
  kds_station: 'barista',
  prep_time_seconds: '',
  allergens: [],
  is_gluten_free: false,
  is_vegan: false,
  is_vegetarian: false,
  notes: '',
  tags: '',
  image_url: '',
  image_thumb_url: '',
  image_source: 'manual',
}

const C = {
  bg: '#fafafa',
  ink: '#0a0a0a',
  accent: '#d9f54e',
  border: '#e5e7eb',
  dim: '#6b7280',
  cardBg: '#ffffff',
  errorBg: '#fff1f2',
  errorInk: '#be123c',
}

const TABS = ['Info', 'Image', 'Modifiers', 'Sizes', 'Outlets'] as const
type Tab = typeof TABS[number]

const ORDERING_MODES = [
  { value: 'inherit', label: 'Standard (inherit from category)' },
  { value: 'override', label: 'Override archetype' },
  { value: 'exclude', label: 'Hide from online' },
  { value: 'standard', label: 'Standard item' },
  { value: 'build', label: 'Build-your-own' },
]

const ORDERING_ARCHETYPES = [
  { value: '', label: 'None' },
  { value: 'coffee-spin', label: 'coffee-spin → Spin360 animation' },
  { value: 'bottle', label: 'bottle → Bottle viewer' },
  { value: 'salad', label: 'salad → Salad builder' },
  { value: 'toastie', label: 'toastie → Toastie builder' },
  { value: 'wrap', label: 'wrap → Wrap builder' },
  { value: 'bowl', label: 'bowl → Bowl builder' },
  { value: 'breakfast', label: 'breakfast → Breakfast builder' },
  { value: 'hero-photo', label: 'hero-photo → Hero photo card' },
]

const BUILDER_ARCHETYPES = ['salad', 'toastie', 'wrap', 'bowl', 'breakfast']

const KDS_STATIONS = ['barista', 'kitchen', 'cold', 'bar', 'expo']

// ── Field sub-components ───────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display: 'block',
      fontSize: 11,
      fontFamily: 'Outfit, sans-serif',
      fontWeight: 600,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: C.dim,
      marginBottom: 6,
    }}>
      {children}
    </label>
  )
}

function FieldWrap({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', ...style }}>
      {children}
    </div>
  )
}

const inputBase: React.CSSProperties = {
  width: '100%',
  fontFamily: 'Outfit, sans-serif',
  fontSize: 14,
  color: C.ink,
  background: C.cardBg,
  border: '1px solid ' + C.border,
  borderRadius: 4,
  padding: '8px 10px',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      cursor: 'pointer',
      fontFamily: 'Outfit, sans-serif',
      fontSize: 13,
      color: C.ink,
      userSelect: 'none',
    }}>
      <span
        role="checkbox"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={e => (e.key === ' ' || e.key === 'Enter') && onChange(!checked)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          width: 36,
          height: 20,
          borderRadius: 10,
          background: checked ? C.ink : C.border,
          padding: 2,
          transition: 'background 0.2s',
          flexShrink: 0,
        }}
      >
        <span style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: checked ? C.accent : '#ffffff',
          transform: checked ? 'translateX(16px)' : 'translateX(0)',
          transition: 'transform 0.2s, background 0.2s',
          display: 'block',
        }} />
      </span>
      {label}
    </label>
  )
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      cursor: 'pointer',
      fontFamily: 'Outfit, sans-serif',
      fontSize: 13,
      color: C.ink,
      userSelect: 'none',
    }}>
      <span
        role="checkbox"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={e => (e.key === ' ' || e.key === 'Enter') && onChange(!checked)}
        style={{
          width: 18,
          height: 18,
          borderRadius: 3,
          border: '1.5px solid ' + (checked ? C.ink : C.border),
          background: checked ? C.ink : C.cardBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4l3 3 5-6" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {label}
    </label>
  )
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      margin: '20px 0 14px',
    }}>
      <span style={{
        fontFamily: 'Outfit, sans-serif',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: C.dim,
        whiteSpace: 'nowrap',
      }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  )
}

// ── Image source button ────────────────────────────────────────────────────

function SourceBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '7px 14px',
        fontFamily: 'Outfit, sans-serif',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.04em',
        border: '1.5px solid ' + (active ? C.ink : C.border),
        background: active ? C.ink : C.cardBg,
        color: active ? C.accent : C.ink,
        borderRadius: 4,
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ProductEditPanel({ product, categories, outlets, businessId, onClose, onSaved }: Props) {
  const isEdit = !!product?.id

  const [form, setForm] = useState<ProductData>(() => {
    if (!product) return { ...EMPTY }
    return {
      ...EMPTY,
      name: product.name ?? '',
      description: product.description ?? '',
      price: String(product.price ?? '0'),
      category_id: product.category_id ?? '',
      is_active: product.is_active ?? true,
      show_online: product.show_online ?? true,
      ordering_mode: product.ordering_mode ?? 'inherit',
      ordering_archetype: product.ordering_archetype ?? '',
      builder_type: product.builder_type ?? '',
      kds_station: product.kds_station ?? 'barista',
      prep_time_seconds: product.prep_time_seconds != null ? String(product.prep_time_seconds) : '',
      allergens: product.allergens ?? [],
      is_gluten_free: product.is_gluten_free ?? false,
      is_vegan: product.is_vegan ?? false,
      is_vegetarian: product.is_vegetarian ?? false,
      notes: product.notes ?? '',
      tags: Array.isArray(product.tags) ? (product.tags as string[]).join(', ') : (product.tags ?? ''),
      image_url: product.image_url ?? '',
      image_thumb_url: product.image_thumb_url ?? '',
      image_source: product.image_source ?? 'manual',
    }
  })

  const [activeTab, setActiveTab] = useState<Tab>('Info')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [variants, setVariants] = useState<Variant[]>([])
  const [linkedGroups, setLinkedGroups] = useState<ModGroup[]>([])
  const [allGroups, setAllGroups] = useState<ModGroup[]>([])
  const [imgPreview, setImgPreview] = useState<string | null>(product?.image_url || null)
  const [imgLoading, setImgLoading] = useState(false)
  const [bgRemoved, setBgRemoved] = useState(false)
  const [imgFile, setImgFile] = useState<File | null>(null)
  const [outletAvail, setOutletAvail] = useState<Record<string, boolean>>({})
  const [imageSource, setImageSource] = useState<'upload' | 'camera' | 'ai' | 'url'>('upload')
  const [aiPrompt, setAiPrompt] = useState('')
  const [stockUrl, setStockUrl] = useState('')
  const [linkGroupId, setLinkGroupId] = useState('')
  const [groupLoading, setGroupLoading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // ── Load product detail on edit ──────────────────────────────────────────

  useEffect(() => {
    if (!isEdit || !product?.id) return
    const pid = product.id

    async function load() {
      try {
        const res = await fetch('/api/pos/menu/products/' + pid)
        if (!res.ok) return
        const data = await res.json()
        if (data.variants) setVariants(data.variants)
        if (data.modifierGroups) setLinkedGroups(data.modifierGroups)
        if (data.outletAvailability) {
          const map: Record<string, boolean> = {}
          for (const o of data.outletAvailability) {
            map[o.outlet_id] = o.available
          }
          setOutletAvail(map)
        }
      } catch { /* non-fatal */ }
    }

    async function loadGroups() {
      try {
        const res = await fetch('/api/pos/menu/modifier-groups?business_id=' + businessId)
        if (!res.ok) return
        const data = await res.json()
        setAllGroups(Array.isArray(data) ? data : (data.groups ?? []))
      } catch { /* non-fatal */ }
    }

    load()
    loadGroups()
  }, [isEdit, product, businessId])

  // Also load groups for create mode (for linking after save)
  useEffect(() => {
    if (isEdit) return
    async function loadGroups() {
      try {
        const res = await fetch('/api/pos/menu/modifier-groups?business_id=' + businessId)
        if (!res.ok) return
        const data = await res.json()
        setAllGroups(Array.isArray(data) ? data : (data.groups ?? []))
      } catch { /* non-fatal */ }
    }
    loadGroups()
  }, [isEdit, businessId])

  // ── Helpers ───────────────────────────────────────────────────────────────

  const setField = useCallback(<K extends keyof ProductData>(key: K, value: ProductData[K]) => {
    setForm(f => ({ ...f, [key]: value }))
  }, [])

  const allergenString = form.allergens.join(', ')

  function handleAllergenChange(raw: string) {
    const arr = raw.split(',').map(s => s.trim()).filter(Boolean)
    setField('allergens', arr)
  }

  // ── Image handling ────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImgFile(file)
    setImgPreview(URL.createObjectURL(file))
    setBgRemoved(false)
  }

  async function handleBgRemove(checked: boolean) {
    setBgRemoved(checked)
    if (!checked || !imgFile) return
    setImgLoading(true)
    try {
      const { removeBackground } = await import('@imgly/background-removal')
      const blob = await removeBackground(imgFile)
      const url = URL.createObjectURL(blob)
      setImgPreview(url)
      setImgFile(new File([blob], 'product.png', { type: 'image/png' }))
    } catch (err) {
      setError('Background removal failed: ' + String(err))
    } finally {
      setImgLoading(false)
    }
  }

  async function handleUploadImage() {
    if (!imgFile) return
    setImgLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', imgFile)
      fd.append('product_id', product?.id ?? 'new')
      fd.append('business_id', businessId)
      const res = await fetch('/api/pos/products/upload-image', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Upload failed')
      const data = await res.json()
      setField('image_url', data.image_url ?? '')
      setField('image_thumb_url', data.image_thumb_url ?? '')
      setImgPreview(data.image_url ?? imgPreview)
    } catch (err) {
      setError('Upload failed: ' + String(err))
    } finally {
      setImgLoading(false)
    }
  }

  async function handleAiGenerate() {
    if (!aiPrompt && !form.name) return
    setImgLoading(true)
    try {
      const res = await fetch('/api/pos/products/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, product_name: form.name, prompt: aiPrompt }),
      })
      if (!res.ok) throw new Error('Generation failed')
      const data = await res.json()
      setField('image_url', data.image_url ?? '')
      setImgPreview(data.image_url ?? null)
    } catch (err) {
      setError('AI generation failed: ' + String(err))
    } finally {
      setImgLoading(false)
    }
  }

  // ── Modifier group linking ────────────────────────────────────────────────

  async function handleLinkGroup() {
    if (!linkGroupId || !product?.id) return
    setGroupLoading(true)
    try {
      const res = await fetch('/api/pos/menu/modifier-groups/' + linkGroupId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'link', product_id: product.id }),
      })
      if (!res.ok) throw new Error('Link failed')
      const group = allGroups.find(g => g.id === linkGroupId)
      if (group) setLinkedGroups(prev => [...prev, group])
      setLinkGroupId('')
    } catch (err) {
      setError('Link failed: ' + String(err))
    } finally {
      setGroupLoading(false)
    }
  }

  async function handleUnlinkGroup(groupId: string) {
    if (!product?.id) return
    try {
      const res = await fetch('/api/pos/menu/modifier-groups/' + groupId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unlink', product_id: product.id }),
      })
      if (!res.ok) throw new Error('Unlink failed')
      setLinkedGroups(prev => prev.filter(g => g.id !== groupId))
    } catch (err) {
      setError('Unlink failed: ' + String(err))
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    setError(null)
    if (!form.name.trim()) { setError('Product name is required.'); return }
    const priceVal = parseFloat(form.price)
    if (isNaN(priceVal) || priceVal < 0) { setError('Price must be 0 or greater.'); return }

    setSaving(true)
    try {
      const payload = {
        ...form,
        business_id: businessId,
        price: priceVal,
        prep_time_seconds: form.prep_time_seconds ? parseInt(form.prep_time_seconds, 10) : null,
        tags: form.tags.split(',').map(s => s.trim()).filter(Boolean),
      }

      let res: Response
      if (isEdit) {
        res = await fetch('/api/pos/menu/products/' + product?.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch('/api/pos/menu/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error ?? 'Save failed')
      }

      onSaved()
      onClose()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  // ── Archive ───────────────────────────────────────────────────────────────

  async function handleArchive() {
    if (!product?.id) return
    if (!window.confirm('Archive this product? It will be hidden from POS and online.')) return
    setSaving(true)
    try {
      const res = await fetch('/api/pos/menu/products/' + product.id, { method: 'DELETE' })
      if (!res.ok) throw new Error('Archive failed')
      onSaved()
      onClose()
    } catch (err) {
      setError(String(err))
      setSaving(false)
    }
  }

  // ── Duplicate ─────────────────────────────────────────────────────────────

  async function handleDuplicate() {
    if (!product?.id) return
    setSaving(true)
    try {
      const payload = {
        ...form,
        business_id: businessId,
        name: form.name + ' (copy)',
        price: parseFloat(form.price),
        prep_time_seconds: form.prep_time_seconds ? parseInt(form.prep_time_seconds, 10) : null,
        tags: form.tags.split(',').map(s => s.trim()).filter(Boolean),
      }
      const res = await fetch('/api/pos/menu/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Duplicate failed')
      onSaved()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const showArchetypeField = form.ordering_mode !== 'exclude'
  const showBuilderType = BUILDER_ARCHETYPES.includes(form.ordering_archetype)
  const unlinkedGroups = allGroups.filter(g => !linkedGroups.find(l => l.id === g.id))

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: C.bg,
      fontFamily: 'Outfit, sans-serif',
      color: C.ink,
      overflow: 'hidden',
    }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px 14px',
        borderBottom: '1px solid ' + C.border,
        flexShrink: 0,
        background: C.cardBg,
      }}>
        <div>
          <p style={{
            margin: 0,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: C.dim,
            marginBottom: 2,
          }}>
            {isEdit ? 'Edit product' : 'New product'}
          </p>
          <h2 style={{
            margin: 0,
            fontFamily: 'Cormorant, Georgia, serif',
            fontStyle: 'italic',
            fontWeight: 600,
            fontSize: 22,
            color: C.ink,
            lineHeight: 1.1,
          }}>
            {form.name || 'Untitled'}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 6,
            color: C.dim,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 4,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* ── Inner tab bar ── */}
      <div style={{
        display: 'flex',
        gap: 4,
        padding: '10px 20px',
        borderBottom: '1px solid ' + C.border,
        flexShrink: 0,
        background: C.cardBg,
        overflowX: 'auto',
      }}>
        {TABS.map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '5px 14px',
              fontFamily: 'Outfit, sans-serif',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.04em',
              border: 'none',
              borderRadius: 20,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              background: activeTab === tab ? C.ink : 'transparent',
              color: activeTab === tab ? C.accent : C.dim,
              transition: 'all 0.15s',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div style={{
          margin: '10px 20px 0',
          padding: '10px 14px',
          background: C.errorBg,
          border: '1px solid ' + C.errorInk,
          borderRadius: 4,
          fontSize: 13,
          color: C.errorInk,
          fontFamily: 'Outfit, sans-serif',
          flexShrink: 0,
        }}>
          {error}
        </div>
      )}

      {/* ── Scrollable body ── */}
      <div ref={scrollRef} style={{
        flex: 1,
        overflowY: 'auto',
        padding: '18px 20px',
      }}>

        {/* ════ INFO TAB ════ */}
        {activeTab === 'Info' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <FieldWrap>
              <FieldLabel>Name *</FieldLabel>
              <input
                style={inputBase}
                value={form.name}
                onChange={e => setField('name', e.target.value)}
                placeholder="e.g. Flat White"
                autoFocus
              />
            </FieldWrap>

            <FieldWrap>
              <FieldLabel>Description</FieldLabel>
              <textarea
                style={{ ...inputBase, resize: 'vertical', minHeight: 68 }}
                value={form.description}
                onChange={e => setField('description', e.target.value)}
                placeholder="Short description shown online and on receipts"
                rows={3}
              />
            </FieldWrap>

            {/* Price + Category — 2 col */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FieldWrap>
                <FieldLabel>Price ($)</FieldLabel>
                <input
                  style={inputBase}
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={e => setField('price', e.target.value)}
                />
              </FieldWrap>
              <FieldWrap>
                <FieldLabel>Category</FieldLabel>
                <select
                  style={{ ...inputBase, appearance: 'none' }}
                  value={form.category_id}
                  onChange={e => setField('category_id', e.target.value)}
                >
                  <option value="">Uncategorised</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </FieldWrap>
            </div>

            <SectionDivider label="Online ordering" />

            <FieldWrap>
              <FieldLabel>Ordering Mode</FieldLabel>
              <select
                style={{ ...inputBase, appearance: 'none' }}
                value={form.ordering_mode}
                onChange={e => setField('ordering_mode', e.target.value)}
              >
                {ORDERING_MODES.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </FieldWrap>

            {showArchetypeField && (
              <FieldWrap>
                <FieldLabel>Ordering Archetype</FieldLabel>
                <select
                  style={{ ...inputBase, appearance: 'none' }}
                  value={form.ordering_archetype}
                  onChange={e => setField('ordering_archetype', e.target.value)}
                >
                  {ORDERING_ARCHETYPES.map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </FieldWrap>
            )}

            {showBuilderType && (
              <FieldWrap>
                <FieldLabel>Builder Type</FieldLabel>
                <select
                  style={{ ...inputBase, appearance: 'none' }}
                  value={form.builder_type}
                  onChange={e => setField('builder_type', e.target.value)}
                >
                  <option value="">— select —</option>
                  {BUILDER_ARCHETYPES.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </FieldWrap>
            )}

            <SectionDivider label="Kitchen" />

            {/* KDS station + Prep time */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FieldWrap>
                <FieldLabel>KDS Station</FieldLabel>
                <select
                  style={{ ...inputBase, appearance: 'none' }}
                  value={form.kds_station}
                  onChange={e => setField('kds_station', e.target.value)}
                >
                  {KDS_STATIONS.map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </FieldWrap>
              <FieldWrap>
                <FieldLabel>Prep time override (seconds)</FieldLabel>
                <input
                  style={inputBase}
                  type="number"
                  min="0"
                  step="10"
                  value={form.prep_time_seconds}
                  onChange={e => setField('prep_time_seconds', e.target.value)}
                  placeholder="e.g. 180 = 3 min"
                />
              </FieldWrap>
            </div>

            <SectionDivider label="Dietary" />

            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <Checkbox checked={form.is_gluten_free} onChange={v => setField('is_gluten_free', v)} label="Gluten-free" />
              <Checkbox checked={form.is_vegetarian} onChange={v => setField('is_vegetarian', v)} label="Vegetarian" />
              <Checkbox checked={form.is_vegan} onChange={v => setField('is_vegan', v)} label="Vegan" />
            </div>

            <FieldWrap>
              <FieldLabel>Allergens (comma-separated)</FieldLabel>
              <input
                style={inputBase}
                value={allergenString}
                onChange={e => handleAllergenChange(e.target.value)}
                placeholder="e.g. gluten, dairy, nuts"
              />
            </FieldWrap>

            <SectionDivider label="Internal" />

            <FieldWrap>
              <FieldLabel>Internal notes</FieldLabel>
              <textarea
                style={{ ...inputBase, resize: 'vertical', minHeight: 56 }}
                value={form.notes}
                onChange={e => setField('notes', e.target.value)}
                placeholder="Staff-only notes, preparation instructions..."
                rows={2}
              />
            </FieldWrap>

            <FieldWrap>
              <FieldLabel>Tags (comma-separated)</FieldLabel>
              <input
                style={inputBase}
                value={form.tags}
                onChange={e => setField('tags', e.target.value)}
                placeholder="e.g. seasonal, bestseller, new"
              />
            </FieldWrap>

            <SectionDivider label="Visibility" />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Toggle
                checked={form.is_active}
                onChange={v => setField('is_active', v)}
                label="Active (shows in POS)"
              />
              <Toggle
                checked={form.show_online}
                onChange={v => setField('show_online', v)}
                label="Visible online"
              />
            </div>

          </div>
        )}

        {/* ════ IMAGE TAB ════ */}
        {activeTab === 'Image' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Current preview */}
            {imgPreview && (
              <div style={{
                width: 200,
                height: 200,
                border: '1px solid ' + C.border,
                borderRadius: 4,
                overflow: 'hidden',
                background: C.cardBg,
                flexShrink: 0,
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgPreview}
                  alt={form.name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
            )}

            {imgLoading && (
              <p style={{ fontSize: 13, color: C.dim, margin: 0 }}>Processing…</p>
            )}

            <div>
              <FieldLabel>Source</FieldLabel>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                <SourceBtn active={imageSource === 'upload'} onClick={() => setImageSource('upload')}>Upload</SourceBtn>
                <SourceBtn active={imageSource === 'camera'} onClick={() => setImageSource('camera')}>Camera</SourceBtn>
                <SourceBtn active={imageSource === 'ai'} onClick={() => setImageSource('ai')}>AI Generate</SourceBtn>
                <SourceBtn active={imageSource === 'url'} onClick={() => setImageSource('url')}>Stock URL</SourceBtn>
              </div>
            </div>

            {imageSource === 'upload' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '9px 18px',
                    fontFamily: 'Outfit, sans-serif',
                    fontSize: 13,
                    fontWeight: 600,
                    border: '1.5px solid ' + C.border,
                    background: C.cardBg,
                    color: C.ink,
                    borderRadius: 4,
                    cursor: 'pointer',
                    alignSelf: 'flex-start',
                  }}
                >
                  Choose file
                </button>
                {imgFile && (
                  <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>{imgFile.name}</p>
                )}
              </div>
            )}

            {imageSource === 'camera' && (
              <div>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  style={{
                    padding: '9px 18px',
                    fontFamily: 'Outfit, sans-serif',
                    fontSize: 13,
                    fontWeight: 600,
                    border: '1.5px solid ' + C.border,
                    background: C.cardBg,
                    color: C.ink,
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  Open camera
                </button>
              </div>
            )}

            {imageSource === 'ai' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <FieldWrap>
                  <FieldLabel>Prompt</FieldLabel>
                  <input
                    style={inputBase}
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    placeholder={'Describe the image, e.g. "overhead flat white on marble"'}
                  />
                </FieldWrap>
                <button
                  type="button"
                  onClick={handleAiGenerate}
                  disabled={imgLoading}
                  style={{
                    padding: '9px 18px',
                    fontFamily: 'Outfit, sans-serif',
                    fontSize: 13,
                    fontWeight: 600,
                    border: 'none',
                    background: C.ink,
                    color: C.accent,
                    borderRadius: 4,
                    cursor: imgLoading ? 'not-allowed' : 'pointer',
                    alignSelf: 'flex-start',
                    opacity: imgLoading ? 0.6 : 1,
                  }}
                >
                  {imgLoading ? 'Generating…' : 'Generate'}
                </button>
              </div>
            )}

            {imageSource === 'url' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <FieldWrap>
                  <FieldLabel>Image URL</FieldLabel>
                  <input
                    style={inputBase}
                    type="url"
                    value={stockUrl}
                    onChange={e => setStockUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </FieldWrap>
                <button
                  type="button"
                  onClick={() => {
                    setField('image_url', stockUrl)
                    setImgPreview(stockUrl)
                    setField('image_source', 'url')
                  }}
                  style={{
                    padding: '9px 18px',
                    fontFamily: 'Outfit, sans-serif',
                    fontSize: 13,
                    fontWeight: 600,
                    border: 'none',
                    background: C.ink,
                    color: C.accent,
                    borderRadius: 4,
                    cursor: 'pointer',
                    alignSelf: 'flex-start',
                  }}
                >
                  Use URL
                </button>
              </div>
            )}

            {/* BG removal */}
            {imgFile && (
              <Checkbox
                checked={bgRemoved}
                onChange={handleBgRemove}
                label="Remove background (free, runs in-browser)"
              />
            )}

            {/* Upload to storage */}
            {imgFile && (
              <button
                type="button"
                onClick={handleUploadImage}
                disabled={imgLoading}
                style={{
                  padding: '9px 18px',
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: 13,
                  fontWeight: 600,
                  border: 'none',
                  background: C.accent,
                  color: C.ink,
                  borderRadius: 4,
                  cursor: imgLoading ? 'not-allowed' : 'pointer',
                  alignSelf: 'flex-start',
                  opacity: imgLoading ? 0.6 : 1,
                }}
              >
                {imgLoading ? 'Uploading…' : 'Upload image to storage'}
              </button>
            )}

            {form.image_url && (
              <p style={{ fontSize: 11, color: C.dim, margin: 0, wordBreak: 'break-all' }}>
                Saved: {form.image_url}
              </p>
            )}

          </div>
        )}

        {/* ════ MODIFIERS TAB ════ */}
        {activeTab === 'Modifiers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {!isEdit && (
              <div style={{
                padding: '10px 14px',
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: 4,
                fontSize: 13,
                color: '#92400e',
              }}>
                Save the product first, then link modifier groups.
              </div>
            )}

            {/* Linked groups */}
            {linkedGroups.length === 0 ? (
              <p style={{ fontSize: 13, color: C.dim, margin: 0 }}>No modifier groups linked.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {linkedGroups.map(g => (
                  <div
                    key={g.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: C.cardBg,
                      border: '1px solid ' + C.border,
                      borderRadius: 4,
                    }}
                  >
                    <div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{g.name}</p>
                      <p style={{ margin: 0, fontSize: 11, color: C.dim, marginTop: 2 }}>{g.selection_type}</p>
                    </div>
                    {isEdit && (
                      <button
                        type="button"
                        onClick={() => handleUnlinkGroup(g.id)}
                        style={{
                          padding: '5px 12px',
                          fontFamily: 'Outfit, sans-serif',
                          fontSize: 12,
                          border: '1px solid ' + C.border,
                          background: 'none',
                          color: C.errorInk,
                          borderRadius: 4,
                          cursor: 'pointer',
                        }}
                      >
                        Unlink
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Link new group */}
            {isEdit && unlinkedGroups.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                <select
                  style={{ ...inputBase, flex: 1 }}
                  value={linkGroupId}
                  onChange={e => setLinkGroupId(e.target.value)}
                >
                  <option value="">— select group to link —</option>
                  {unlinkedGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleLinkGroup}
                  disabled={!linkGroupId || groupLoading}
                  style={{
                    padding: '8px 16px',
                    fontFamily: 'Outfit, sans-serif',
                    fontSize: 13,
                    fontWeight: 600,
                    border: 'none',
                    background: linkGroupId ? C.ink : C.border,
                    color: linkGroupId ? C.accent : C.dim,
                    borderRadius: 4,
                    cursor: linkGroupId ? 'pointer' : 'not-allowed',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {groupLoading ? 'Linking…' : '+ Link Group'}
                </button>
              </div>
            )}

          </div>
        )}

        {/* ════ SIZES TAB ════ */}
        {activeTab === 'Sizes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              padding: '10px 14px',
              background: '#f0fdf4',
              border: '1px solid #86efac',
              borderRadius: 4,
              fontSize: 13,
              color: '#166534',
            }}>
              Size variants are best managed as modifier groups (single-select, each option with a price adjustment).
              Use the Modifiers tab to link a size group to this product.
            </div>

            {variants.length > 0 && (
              <div>
                <SectionDivider label="Existing size variants" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {variants.map((v, i) => (
                    <div
                      key={v.id ?? i}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 100px 80px',
                        gap: 8,
                        alignItems: 'center',
                        padding: '8px 12px',
                        background: C.cardBg,
                        border: '1px solid ' + C.border,
                        borderRadius: 4,
                      }}
                    >
                      <input
                        style={{ ...inputBase, padding: '6px 8px' }}
                        value={v.name}
                        onChange={e => {
                          const next = [...variants]
                          next[i] = { ...next[i], name: e.target.value }
                          setVariants(next)
                        }}
                        placeholder="Size name"
                      />
                      <input
                        style={{ ...inputBase, padding: '6px 8px', fontVariantNumeric: 'tabular-nums' }}
                        type="number"
                        step="0.01"
                        min="0"
                        value={v.price}
                        onChange={e => {
                          const next = [...variants]
                          next[i] = { ...next[i], price: e.target.value }
                          setVariants(next)
                        }}
                        placeholder="Price"
                      />
                      <Toggle
                        checked={v.is_active}
                        onChange={val => {
                          const next = [...variants]
                          next[i] = { ...next[i], is_active: val }
                          setVariants(next)
                        }}
                        label=""
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setVariants(prev => [...prev, { name: '', price: '0', is_active: true, sort_order: prev.length }])}
              style={{
                padding: '8px 16px',
                fontFamily: 'Outfit, sans-serif',
                fontSize: 13,
                fontWeight: 600,
                border: '1.5px dashed ' + C.border,
                background: 'none',
                color: C.dim,
                borderRadius: 4,
                cursor: 'pointer',
                alignSelf: 'flex-start',
              }}
            >
              + Add size
            </button>
          </div>
        )}

        {/* ════ OUTLETS TAB ════ */}
        {activeTab === 'Outlets' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {outlets.length <= 1 ? (
              <p style={{ fontSize: 13, color: C.dim, margin: 0 }}>
                Outlet availability is only relevant when you have multiple outlets.
              </p>
            ) : (
              <>
                <div style={{
                  padding: '10px 14px',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: 4,
                  fontSize: 13,
                  color: '#1e40af',
                }}>
                  Detailed outlet stock levels are managed in the Inventory section.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {outlets.map(outlet => (
                    <div
                      key={outlet.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: C.cardBg,
                        border: '1px solid ' + C.border,
                        borderRadius: 4,
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{outlet.name}</span>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: outletAvail[outlet.id] !== false ? '#166534' : C.dim,
                        background: outletAvail[outlet.id] !== false ? '#dcfce7' : '#f3f4f6',
                        padding: '3px 9px',
                        borderRadius: 3,
                      }}>
                        {outletAvail[outlet.id] !== false ? 'Available' : 'Unavailable'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

      </div>

      {/* ── Sticky footer ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 20px',
        borderTop: '1px solid ' + C.border,
        background: C.cardBg,
        flexShrink: 0,
        gap: 8,
      }}>
        {/* Left: destructive actions (edit only) */}
        <div style={{ display: 'flex', gap: 8 }}>
          {isEdit && (
            <>
              <button
                type="button"
                onClick={handleArchive}
                disabled={saving}
                style={{
                  padding: '8px 14px',
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: 12,
                  fontWeight: 600,
                  border: '1px solid ' + C.border,
                  background: 'none',
                  color: C.errorInk,
                  borderRadius: 4,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.5 : 1,
                }}
              >
                Archive
              </button>
              <button
                type="button"
                onClick={handleDuplicate}
                disabled={saving}
                style={{
                  padding: '8px 14px',
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: 12,
                  fontWeight: 600,
                  border: '1px solid ' + C.border,
                  background: 'none',
                  color: C.ink,
                  borderRadius: 4,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.5 : 1,
                }}
              >
                Duplicate
              </button>
            </>
          )}
        </div>

        {/* Right: cancel + save */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 18px',
              fontFamily: 'Outfit, sans-serif',
              fontSize: 13,
              fontWeight: 600,
              border: '1px solid ' + C.border,
              background: 'none',
              color: C.ink,
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '9px 22px',
              fontFamily: 'Outfit, sans-serif',
              fontSize: 13,
              fontWeight: 700,
              border: 'none',
              background: saving ? C.border : C.accent,
              color: saving ? C.dim : C.ink,
              borderRadius: 4,
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
              letterSpacing: '0.02em',
            }}
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
          </button>
        </div>
      </div>

    </div>
  )
}