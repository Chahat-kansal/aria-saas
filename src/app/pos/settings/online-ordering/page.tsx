'use client'
import { useState, useEffect, useCallback } from 'react'
import type { CSSProperties } from 'react'
import { resolveArchetype } from '@/lib/ordering/resolveArchetype'

interface Category {
  id: string
  name: string
  color: string | null
  ordering_archetype: string | null
}

interface Product {
  id: string
  name: string
  category_id: string | null
  ordering_mode: string | null
  ordering_archetype: string | null
}

interface ModGroup {
  id: string
  name: string
  display_name: string | null
  archetype_slot: string | null
}

const ARCHETYPES = [
  { value: '',        label: 'Not set (generic fallback)' },
  { value: 'food',   label: 'Food — photo grid' },
  { value: 'cup',    label: 'Cup — coffee / hot drink' },
  { value: 'bottle', label: 'Bottle — cold drink' },
  { value: 'bowl',   label: 'Bowl' },
  { value: 'photo',  label: 'Photo — hero image' },
  { value: 'generic', label: 'Generic — no visual' },
]

const MODES = [
  { value: 'inherit',  label: 'Inherit from category' },
  { value: 'override', label: 'Override' },
  { value: 'exclude',  label: 'Exclude (always generic)' },
]

const SLOTS = [
  { value: '',            label: '— no slot —' },
  { value: 'size',        label: 'Size' },
  { value: 'dairy',       label: 'Dairy / Milk type' },
  { value: 'temperature', label: 'Temperature' },
  { value: 'extras',      label: 'Extras / Add-ons' },
  { value: 'sauce',       label: 'Sauce' },
  { value: 'protein',     label: 'Protein' },
  { value: 'sides',       label: 'Sides' },
  { value: 'toppings',    label: 'Toppings' },
]

const sel: CSSProperties = {
  fontSize: 13,
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  background: '#fff',
  color: '#111827',
  cursor: 'pointer',
}

const badge: CSSProperties = {
  fontSize: 11,
  color: '#6b7280',
  background: '#f3f4f6',
  borderRadius: 4,
  padding: '2px 7px',
  minWidth: 56,
  textAlign: 'center',
  display: 'inline-block',
}

export default function OnlineOrderingPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts]     = useState<Product[]>([])
  const [modGroups, setModGroups]   = useState<ModGroup[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/pos/archetype')
      const d = await r.json()
      setCategories(d.categories ?? [])
      setProducts(d.products ?? [])
      setModGroups(d.modifierGroups ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function mark(key: string, on: boolean) {
    setSaving(prev => { const s = new Set(prev); on ? s.add(key) : s.delete(key); return s })
  }

  async function patchCat(id: string, ordering_archetype: string | null) {
    mark('cat-' + id, true)
    try {
      await fetch('/api/pos/categories?id=' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordering_archetype }),
      })
    } finally { mark('cat-' + id, false) }
  }

  async function patchProd(id: string, ordering_mode: string, ordering_archetype: string | null) {
    mark('prod-' + id, true)
    try {
      await fetch('/api/pos/products/' + id + '?action=update_general', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordering_mode, ordering_archetype }),
      })
    } finally { mark('prod-' + id, false) }
  }

  async function patchMg(id: string, archetype_slot: string | null) {
    mark('mg-' + id, true)
    try {
      await fetch('/api/pos/modifier-groups/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archetype_slot }),
      })
    } finally { mark('mg-' + id, false) }
  }

  function setCatArch(catId: string, val: string) {
    const v = val || null
    setCategories(prev => prev.map(c => c.id === catId ? { ...c, ordering_archetype: v } : c))
    patchCat(catId, v)
  }

  function setProdMode(prodId: string, val: string) {
    const prod = products.find(p => p.id === prodId)
    setProducts(prev => prev.map(p => p.id === prodId ? { ...p, ordering_mode: val } : p))
    patchProd(prodId, val, prod?.ordering_archetype ?? null)
  }

  function setProdArch(prodId: string, val: string) {
    const prod = products.find(p => p.id === prodId)
    const v = val || null
    setProducts(prev => prev.map(p => p.id === prodId ? { ...p, ordering_archetype: v } : p))
    patchProd(prodId, prod?.ordering_mode ?? 'inherit', v)
  }

  function setMgSlot(mgId: string, val: string) {
    const v = val || null
    setModGroups(prev => prev.map(mg => mg.id === mgId ? { ...mg, archetype_slot: v } : mg))
    patchMg(mgId, v)
  }

  if (loading) {
    return <div style={{ padding: 32, color: '#6b7280', fontFamily: 'Inter, sans-serif' }}>Loading…</div>
  }

  const catIds = new Set(categories.map(c => c.id))
  const uncategorized = products.filter(p => !p.category_id || !catIds.has(p.category_id))

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px', fontFamily: 'Inter, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>
        Online Ordering — Product Archetypes
      </h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 28px' }}>
        Set a visual archetype for each category. Products inherit it by default; individual items can override or be excluded.
      </p>

      {categories.map(cat => {
        const catProds = products.filter(p => p.category_id === cat.id)
        const isSavingCat = saving.has('cat-' + cat.id)
        return (
          <div key={cat.id} style={{ marginBottom: 16, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#f9fafb', borderBottom: catProds.length > 0 ? '1px solid #e5e7eb' : 'none' }}>
              {cat.color && (
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
              )}
              <span style={{ fontWeight: 600, fontSize: 14, color: '#111827', flex: 1 }}>{cat.name}</span>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>Category default</span>
              <select value={cat.ordering_archetype ?? ''} onChange={e => setCatArch(cat.id, e.target.value)} disabled={isSavingCat} style={sel}>
                {ARCHETYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
              {isSavingCat && <span style={{ fontSize: 11, color: '#9ca3af' }}>saving…</span>}
            </div>

            {catProds.map((prod, idx) => {
              const mode = prod.ordering_mode ?? 'inherit'
              const effective = resolveArchetype(prod, cat)
              const isSaving = saving.has('prod-' + prod.id)
              const isLast = idx === catProds.length - 1
              return (
                <div key={prod.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px 7px 26px', borderBottom: isLast ? 'none' : '1px solid #f3f4f6', background: '#fff' }}>
                  <span style={{ flex: 1, fontSize: 13, color: '#374151' }}>{prod.name}</span>
                  <span style={badge}>{effective}</span>
                  <select value={mode} onChange={e => setProdMode(prod.id, e.target.value)} disabled={isSaving} style={sel}>
                    {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  {mode === 'override' && (
                    <select value={prod.ordering_archetype ?? ''} onChange={e => setProdArch(prod.id, e.target.value)} disabled={isSaving} style={sel}>
                      {ARCHETYPES.filter(a => a.value !== '').map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                  )}
                  {isSaving && <span style={{ fontSize: 11, color: '#9ca3af' }}>saving…</span>}
                </div>
              )
            })}

            {catProds.length === 0 && (
              <div style={{ padding: '7px 14px 7px 26px', fontSize: 12, color: '#9ca3af' }}>No active products</div>
            )}
          </div>
        )
      })}

      {uncategorized.length > 0 && (
        <div style={{ marginBottom: 16, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: '#9ca3af' }}>Uncategorized</span>
          </div>
          {uncategorized.map((prod, idx) => {
            const mode = prod.ordering_mode ?? 'inherit'
            const effective = resolveArchetype(prod, null)
            const isSaving = saving.has('prod-' + prod.id)
            const isLast = idx === uncategorized.length - 1
            return (
              <div key={prod.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px 7px 26px', borderBottom: isLast ? 'none' : '1px solid #f3f4f6', background: '#fff' }}>
                <span style={{ flex: 1, fontSize: 13, color: '#374151' }}>{prod.name}</span>
                <span style={badge}>{effective}</span>
                <select value={mode} onChange={e => setProdMode(prod.id, e.target.value)} disabled={isSaving} style={sel}>
                  {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                {mode === 'override' && (
                  <select value={prod.ordering_archetype ?? ''} onChange={e => setProdArch(prod.id, e.target.value)} disabled={isSaving} style={sel}>
                    {ARCHETYPES.filter(a => a.value !== '').map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                )}
                {isSaving && <span style={{ fontSize: 11, color: '#9ca3af' }}>saving…</span>}
              </div>
            )
          })}
        </div>
      )}

      {categories.length === 0 && uncategorized.length === 0 && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
          No active products found. Add products in the POS menu builder first.
        </div>
      )}

      {modGroups.length > 0 && (
        <div style={{ marginTop: 36 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>Modifier Group Slots</h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
            Assign a semantic slot to each modifier group so the ordering interface can organise options intelligently.
          </p>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
            {modGroups.map((mg, idx) => {
              const isSaving = saving.has('mg-' + mg.id)
              const isLast = idx === modGroups.length - 1
              return (
                <div key={mg.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: isLast ? 'none' : '1px solid #f3f4f6', background: '#fff' }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#111827' }}>
                    {mg.display_name ?? mg.name}
                  </span>
                  <select value={mg.archetype_slot ?? ''} onChange={e => setMgSlot(mg.id, e.target.value)} disabled={isSaving} style={sel}>
                    {SLOTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  {isSaving && <span style={{ fontSize: 11, color: '#9ca3af' }}>saving…</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}