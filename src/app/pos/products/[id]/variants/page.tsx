'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface VariantGroup {
  id: string
  name: string
  values: string[]
  affects_price: boolean
  price_map: Record<string, number>
}

interface Product { id: string; name: string; price: number }

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: 'var(--text-primary)',
  muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  violet: '#006AFF', green: '#00B140', red: '#EF4444',
  border: 'rgba(255,255,255,0.07)',
}

const iS: React.CSSProperties = {
  background: 'var(--bg-base)', border: `1px solid ${C.border}`, borderRadius: 8,
  padding: '8px 12px', fontSize: 13, color: C.text, outline: 'none',
  fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
}

const PRESETS = {
  'Size (clothing)': ['XS', 'S', 'M', 'L', 'XL', '2XL'],
  'Size (shoes)': ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'],
  'Colour': ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Navy', 'Grey'],
  'Gender': ['Men', 'Women', 'Unisex'],
  'Material': ['Cotton', 'Polyester', 'Wool', 'Silk', 'Linen'],
}

export default function ProductVariantsPage() {
  const params = useParams()
  const router = useRouter()
  const productId = params?.id as string

  const [product, setProduct] = useState<Product | null>(null)
  const [groups, setGroups] = useState<VariantGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [newGroup, setNewGroup] = useState({ name: '', values: '' })
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [pRes, gRes] = await Promise.all([
      fetch(`/api/pos/products/${productId}`),
      fetch(`/api/pos/variant-groups?product_id=${productId}`),
    ])
    const pd = await pRes.json() as { product?: Product }
    const gd = await gRes.json() as { groups?: VariantGroup[] }
    setProduct(pd.product ?? null)
    setGroups(gd.groups ?? [])
    setLoading(false)
  }, [productId])

  useEffect(() => { load() }, [load])

  async function addGroup() {
    if (!newGroup.name.trim() || !newGroup.values.trim()) return
    setSaving('new')
    const values = newGroup.values.split(',').map(v => v.trim()).filter(Boolean)
    const res = await fetch('/api/pos/variant-groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, name: newGroup.name, values }),
    })
    if (res.ok) { setNewGroup({ name: '', values: '' }); setAdding(false); load() }
    setSaving(null)
  }

  async function removeGroup(id: string) {
    if (!confirm('Remove this variant group?')) return
    await fetch(`/api/pos/variant-groups/${id}`, { method: 'DELETE' })
    setGroups(g => g.filter(x => x.id !== id))
  }

  async function togglePrice(group: VariantGroup) {
    setSaving(group.id)
    await fetch(`/api/pos/variant-groups/${group.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ affects_price: !group.affects_price }),
    })
    setGroups(g => g.map(x => x.id === group.id ? { ...x, affects_price: !x.affects_price } : x))
    setSaving(null)
  }

  async function updatePrice(group: VariantGroup, value: string, price: number) {
    const newMap = { ...group.price_map, [value]: price }
    setSaving(group.id)
    await fetch(`/api/pos/variant-groups/${group.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price_map: newMap }),
    })
    setGroups(g => g.map(x => x.id === group.id ? { ...x, price_map: newMap } : x))
    setSaving(null)
  }

  async function addValue(group: VariantGroup, val: string) {
    const trimmed = val.trim()
    if (!trimmed || group.values.includes(trimmed)) return
    const newValues = [...group.values, trimmed]
    setSaving(group.id)
    await fetch(`/api/pos/variant-groups/${group.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: newValues }),
    })
    setGroups(g => g.map(x => x.id === group.id ? { ...x, values: newValues } : x))
    setSaving(null)
  }

  async function removeValue(group: VariantGroup, val: string) {
    const newValues = group.values.filter(v => v !== val)
    setSaving(group.id)
    await fetch(`/api/pos/variant-groups/${group.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: newValues }),
    })
    setGroups(g => g.map(x => x.id === group.id ? { ...x, values: newValues } : x))
    setSaving(null)
  }

  if (loading) return <div style={{ padding: 40, color: C.muted, fontFamily: "'Manrope',sans-serif" }}>Loading…</div>

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif", padding: '24px 28px', maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <button onClick={() => router.back()} style={{ fontSize: 12, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8, padding: 0 }}>
          ← Back to product
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
          {product?.name} — Variants
        </h1>
        <p style={{ fontSize: 13, color: C.muted }}>
          Define size, colour, and other variant options. At checkout, staff will select the variant before adding to cart.
        </p>
      </div>

      {/* Presets */}
      {groups.length === 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Quick-add common variant groups</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(PRESETS).map(([name, values]) => (
              <button key={name} onClick={async () => {
                setSaving('preset')
                await fetch('/api/pos/variant-groups', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ product_id: productId, name, values }),
                })
                setSaving(null)
                load()
              }}
              style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(139,92,246,0.06)', color: C.violet, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                + {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Existing groups */}
      {groups.map(group => (
        <div key={group.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{group.name}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted, cursor: 'pointer' }}>
                <input type="checkbox" checked={group.affects_price} onChange={() => togglePrice(group)} />
                Different prices per variant
              </label>
              <button onClick={() => removeGroup(group.id)}
                style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.red, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                Remove
              </button>
            </div>
          </div>

          {/* Values */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {group.values.map(val => (
              <div key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: 'rgba(139,92,246,0.08)', border: `1px solid rgba(139,92,246,0.2)` }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.violet }}>{val}</span>
                {group.affects_price && (
                  <input type="number" step="0.01" placeholder={product?.price?.toFixed(2) ?? '0.00'}
                    defaultValue={group.price_map[val] ?? ''}
                    onBlur={e => { const p = parseFloat(e.target.value); if (!isNaN(p)) updatePrice(group, val, p) }}
                    style={{ ...iS, width: 70, padding: '3px 8px', fontSize: 12 }} />
                )}
                <button onClick={() => removeValue(group, val)}
                  style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' }}>×</button>
              </div>
            ))}
            {/* Add value inline */}
            <input
              placeholder="+ Add value, press Enter"
              onKeyDown={e => { if (e.key === 'Enter') { addValue(group, (e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = '' } }}
              style={{ ...iS, width: 180, padding: '6px 10px' }}
            />
          </div>
          {saving === group.id && <div style={{ fontSize: 12, color: C.muted }}>Saving…</div>}
        </div>
      ))}

      {/* Add new group */}
      {adding ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>New variant group</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.dim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Group name</label>
              <input value={newGroup.name} onChange={e => setNewGroup(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Size, Colour, Material" style={iS} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.dim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Values (comma-separated)</label>
              <input value={newGroup.values} onChange={e => setNewGroup(p => ({ ...p, values: e.target.value }))}
                placeholder="e.g. XS, S, M, L, XL" style={iS} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setAdding(false); setNewGroup({ name: '', values: '' }) }}
              style={{ padding: '9px 18px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
            <button onClick={addGroup} disabled={saving === 'new' || !newGroup.name.trim() || !newGroup.values.trim()}
              style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (!newGroup.name.trim() || !newGroup.values.trim()) ? 0.5 : 1 }}>
              {saving === 'new' ? 'Adding…' : 'Add group'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          style={{ width: '100%', padding: '14px 0', borderRadius: 12, border: `2px dashed rgba(139,92,246,0.3)`, background: 'rgba(139,92,246,0.04)', color: C.violet, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          + Add variant group
        </button>
      )}

      {/* Preview matrix */}
      {groups.length >= 2 && (
        <div style={{ marginTop: 24, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Variant matrix preview</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ padding: '6px 10px', textAlign: 'left', color: C.muted, fontWeight: 600 }}>{groups[0].name} \ {groups[1]?.name}</th>
                  {groups[1]?.values.map(v => (
                    <th key={v} style={{ padding: '6px 10px', color: C.muted, fontWeight: 600 }}>{v}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups[0].values.map(v0 => (
                  <tr key={v0}>
                    <td style={{ padding: '6px 10px', fontWeight: 600 }}>{v0}</td>
                    {groups[1]?.values.map(v1 => (
                      <td key={v1} style={{ padding: '6px 10px', textAlign: 'center', color: C.dim }}>
                        {v0}/{v1}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
