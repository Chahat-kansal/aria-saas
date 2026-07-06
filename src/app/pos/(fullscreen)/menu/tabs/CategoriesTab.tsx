'use client'

import { useState, useEffect, useCallback } from 'react'

type Category = {
  id: string
  name: string
  color: string | null
  is_active: boolean
  sort_order: number
  ordering_archetype: string | null
  product_count?: number
}

type Props = {
  businessId: string
  initialCategories?: Category[]
  onFilterProducts?: (categoryId: string) => void
}

const COLOR_PRESETS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#0ea5e9', '#f97316', '#0a0a0a']

const ARCHETYPE_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'food', label: 'Food' },
  { value: 'bottle', label: 'Bottle' },
  { value: 'cup', label: 'Cup' },
  { value: 'bowl', label: 'Bowl' },
  { value: 'photo', label: 'Photo' },
  { value: 'generic', label: 'Generic' },
]

const styles: Record<string, React.CSSProperties> = {
  root: {
    background: '#fafafa',
    color: '#0a0a0a',
    fontFamily: "'Outfit', system-ui, sans-serif",
    minHeight: '100%',
    padding: '24px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '20px',
  },
  heading: {
    fontFamily: "'Cormorant Garamond', 'Cormorant', Georgia, serif",
    fontStyle: 'italic',
    fontSize: '24px',
    fontWeight: 600,
    color: '#0a0a0a',
    margin: 0,
    lineHeight: 1.1,
  },
  addBtn: {
    background: '#d9f54e',
    color: '#0a0a0a',
    border: 'none',
    padding: '8px 16px',
    fontSize: '13px',
    fontFamily: "'Outfit', system-ui, sans-serif",
    fontWeight: 600,
    cursor: 'pointer',
    letterSpacing: '0.02em',
  },
  addForm: {
    background: '#f5f5f5',
    border: '1px solid #e8e8e8',
    padding: '20px',
    marginBottom: '16px',
  },
  formRow: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-end',
    flexWrap: 'wrap' as const,
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    flex: 1,
    minWidth: '140px',
  },
  label: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#6b7280',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  },
  input: {
    border: '1px solid #e8e8e8',
    background: '#fff',
    color: '#0a0a0a',
    padding: '8px 10px',
    fontSize: '14px',
    fontFamily: "'Outfit', system-ui, sans-serif",
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  select: {
    border: '1px solid #e8e8e8',
    background: '#fff',
    color: '#0a0a0a',
    padding: '8px 10px',
    fontSize: '14px',
    fontFamily: "'Outfit', system-ui, sans-serif",
    outline: 'none',
    width: '100%',
    cursor: 'pointer',
  },
  swatchRow: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  presetSwatch: {
    width: '22px',
    height: '22px',
    border: '2px solid transparent',
    cursor: 'pointer',
    display: 'inline-block',
  },
  hexInput: {
    border: '1px solid #e8e8e8',
    background: '#fff',
    color: '#0a0a0a',
    padding: '4px 8px',
    fontSize: '12px',
    fontFamily: "'Outfit', system-ui, sans-serif",
    width: '80px',
    outline: 'none',
  },
  formActions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginTop: '16px',
  },
  saveBtn: {
    background: '#d9f54e',
    color: '#0a0a0a',
    border: 'none',
    padding: '8px 20px',
    fontSize: '13px',
    fontFamily: "'Outfit', system-ui, sans-serif",
    fontWeight: 600,
    cursor: 'pointer',
    letterSpacing: '0.02em',
  },
  cancelBtn: {
    background: 'transparent',
    color: '#6b7280',
    border: '1px solid #e8e8e8',
    padding: '8px 16px',
    fontSize: '13px',
    fontFamily: "'Outfit', system-ui, sans-serif",
    cursor: 'pointer',
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    background: '#fff',
    border: '1px solid #e8e8e8',
    minHeight: '52px',
  },
  swatch: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    flexShrink: 0,
    border: '1px solid rgba(0,0,0,0.08)',
    display: 'inline-block',
  },
  nameArea: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
  },
  nameSpan: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#0a0a0a',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  nameInput: {
    fontSize: '14px',
    fontFamily: "'Outfit', system-ui, sans-serif",
    fontWeight: 500,
    color: '#0a0a0a',
    border: 'none',
    borderBottom: '2px solid #d9f54e',
    background: 'transparent',
    outline: 'none',
    padding: '0 2px',
    minWidth: '80px',
    width: '140px',
  },
  countBadge: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#6b7280',
    background: '#f5f5f5',
    border: '1px solid #e8e8e8',
    padding: '2px 6px',
    flexShrink: 0,
    fontVariantNumeric: 'tabular-nums',
  },
  archetypePill: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#6b7280',
    background: '#f0f0f0',
    border: '1px solid #e8e8e8',
    padding: '2px 7px',
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    flexShrink: 0,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    flexShrink: 0,
  },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: '#6b7280',
    fontSize: '14px',
    padding: '4px 6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  },
  iconBtnDanger: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: '#ef4444',
    fontSize: '16px',
    padding: '4px 6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  },
  iconBtnAccent: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: '#0a0a0a',
    fontSize: '13px',
    padding: '4px 6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  },
  divider: {
    width: '1px',
    height: '16px',
    background: '#e8e8e8',
    flexShrink: 0,
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '40px 20px',
    color: '#6b7280',
    fontSize: '14px',
  },
  loadingState: {
    textAlign: 'center' as const,
    padding: '40px 20px',
    color: '#6b7280',
    fontSize: '14px',
    fontStyle: 'italic',
  },
}

export default function CategoriesTab({ businessId, initialCategories, onFilterProducts }: Props) {
  const [categories, setCategories] = useState<Category[]>(
    (initialCategories ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)
  )
  const [loading, setLoading] = useState(!initialCategories)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6366f1')
  const [newArchetype, setNewArchetype] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadCategories = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pos/menu/categories')
      const data = await res.json()
      const sorted = (data.categories ?? []).slice().sort(
        (a: Category, b: Category) => a.sort_order - b.sort_order
      )
      setCategories(sorted)
    } catch {
      // keep existing state on failure
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!initialCategories) {
      loadCategories()
    }
  }, [initialCategories, loadCategories])

  async function patchCategory(payload: Record<string, unknown>) {
    const res = await fetch('/api/pos/menu/categories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error('PATCH failed')
    return res.json()
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id)
    setEditingName(cat.name)
  }

  async function commitRename(cat: Category) {
    if (!editingName.trim() || editingName.trim() === cat.name) {
      setEditingId(null)
      return
    }
    try {
      await patchCategory({ id: cat.id, name: editingName.trim() })
      setCategories(prev =>
        prev.map(c => c.id === cat.id ? { ...c, name: editingName.trim() } : c)
      )
    } catch {
      // revert
    }
    setEditingId(null)
  }

  async function toggleActive(cat: Category) {
    const next = !cat.is_active
    setCategories(prev =>
      prev.map(c => c.id === cat.id ? { ...c, is_active: next } : c)
    )
    try {
      await patchCategory({ id: cat.id, is_active: next })
    } catch {
      setCategories(prev =>
        prev.map(c => c.id === cat.id ? { ...c, is_active: !next } : c)
      )
    }
  }

  async function moveCategory(idx: number, dir: -1 | 1) {
    const next = idx + dir
    if (next < 0 || next >= categories.length) return
    const a = categories[idx]
    const b = categories[next]
    const newA = { ...a, sort_order: b.sort_order }
    const newB = { ...b, sort_order: a.sort_order }
    const updated = categories.map((c, i) => {
      if (i === idx) return newA
      if (i === next) return newB
      return c
    }).sort((x, y) => x.sort_order - y.sort_order)
    setCategories(updated)
    try {
      await Promise.all([
        patchCategory({ id: a.id, sort_order: b.sort_order }),
        patchCategory({ id: b.id, sort_order: a.sort_order }),
      ])
    } catch {
      await loadCategories()
    }
  }

  async function handleDelete(cat: Category) {
    const hasProducts = (cat.product_count ?? 0) > 0
    const msg = hasProducts
      ? 'This category has ' + cat.product_count + ' product(s). Delete anyway?'
      : 'Delete category "' + cat.name + '"?'
    if (!window.confirm(msg)) return
    const prevCategories = categories
    setCategories(prev => prev.filter(c => c.id !== cat.id))
    try {
      const res = await fetch('/api/pos/menu/categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cat.id }),
      })
      if (!res.ok) throw new Error('DELETE failed')
    } catch {
      setCategories(prevCategories)
    }
  }

  async function handleAdd() {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/pos/menu/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          color: newColor,
          ordering_archetype: newArchetype || null,
          business_id: businessId,
        }),
      })
      if (!res.ok) throw new Error('POST failed')
      setShowAdd(false)
      setNewName('')
      setNewColor('#6366f1')
      setNewArchetype('')
      await loadCategories()
    } catch {
      // keep form open
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <h2 style={styles.heading}>Categories</h2>
        <button
          style={styles.addBtn}
          onClick={() => setShowAdd(v => !v)}
          type="button"
        >
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showAdd && (
        <div style={styles.addForm}>
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <span style={styles.label}>Name</span>
              <input
                style={styles.input}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Category name"
                onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                autoFocus
              />
            </div>
            <div style={styles.formGroup}>
              <span style={styles.label}>Archetype</span>
              <select
                style={styles.select}
                value={newArchetype}
                onChange={e => setNewArchetype(e.target.value)}
              >
                {ARCHETYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: '14px' }}>
            <span style={styles.label}>Color</span>
            <div style={{ ...styles.swatchRow, marginTop: '8px' }}>
              {COLOR_PRESETS.map(hex => (
                <button
                  key={hex}
                  type="button"
                  title={hex}
                  style={{
                    ...styles.presetSwatch,
                    background: hex,
                    borderColor: newColor === hex ? '#0a0a0a' : 'transparent',
                    outline: newColor === hex ? '2px solid #d9f54e' : 'none',
                    outlineOffset: '1px',
                  }}
                  onClick={() => setNewColor(hex)}
                />
              ))}
              <input
                style={styles.hexInput}
                value={newColor}
                onChange={e => setNewColor(e.target.value)}
                placeholder="#000000"
                maxLength={7}
              />
              <span
                style={{
                  width: '22px',
                  height: '22px',
                  background: newColor,
                  display: 'inline-block',
                  border: '1px solid #e8e8e8',
                  flexShrink: 0,
                }}
              />
            </div>
          </div>
          <div style={styles.formActions}>
            <button
              style={{ ...styles.saveBtn, opacity: saving ? 0.6 : 1 }}
              onClick={handleAdd}
              disabled={saving || !newName.trim()}
              type="button"
            >
              {saving ? 'Saving…' : 'Save Category'}
            </button>
            <button
              style={styles.cancelBtn}
              onClick={() => { setShowAdd(false); setNewName(''); setNewColor('#6366f1'); setNewArchetype('') }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={styles.loadingState}>Loading categories…</div>
      ) : categories.length === 0 ? (
        <div style={styles.emptyState}>No categories yet. Add one above.</div>
      ) : (
        <div style={styles.list}>
          {categories.map((cat, idx) => (
            <div key={cat.id} style={{
              ...styles.card,
              opacity: cat.is_active ? 1 : 0.5,
            }}>
              {/* Color swatch */}
              <span
                style={{
                  ...styles.swatch,
                  background: cat.color ?? '#e8e8e8',
                }}
              />

              {/* Name — editable or static */}
              <div style={styles.nameArea}>
                {editingId === cat.id ? (
                  <input
                    style={styles.nameInput}
                    value={editingName}
                    autoFocus
                    onChange={e => setEditingName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename(cat)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    onBlur={() => commitRename(cat)}
                  />
                ) : (
                  <span style={styles.nameSpan}>{cat.name}</span>
                )}
              </div>

              {/* Count badge */}
              <span style={styles.countBadge}>
                {(cat.product_count ?? 0) + ' item' + ((cat.product_count ?? 0) === 1 ? '' : 's')}
              </span>

              {/* Archetype pill */}
              {cat.ordering_archetype && (
                <span style={styles.archetypePill}>{cat.ordering_archetype}</span>
              )}

              {/* Actions */}
              <div style={styles.actions}>
                {/* View products in this category */}
                {onFilterProducts && (
                  <>
                    <button
                      style={{ ...styles.iconBtnAccent, fontSize: '13px' }}
                      title={'View products in ' + cat.name}
                      onClick={() => onFilterProducts(cat.id)}
                      type="button"
                    >
                      →
                    </button>
                    <div style={styles.divider} />
                  </>
                )}

                {/* Visibility toggle */}
                <button
                  style={styles.iconBtn}
                  title={cat.is_active ? 'Hide category' : 'Show category'}
                  onClick={() => toggleActive(cat)}
                  type="button"
                >
                  {cat.is_active ? '👁' : '🙈'}
                </button>

                <div style={styles.divider} />

                {/* Move up */}
                <button
                  style={{ ...styles.iconBtn, opacity: idx === 0 ? 0.25 : 1 }}
                  title="Move up"
                  onClick={() => moveCategory(idx, -1)}
                  disabled={idx === 0}
                  type="button"
                >
                  ↑
                </button>

                {/* Move down */}
                <button
                  style={{ ...styles.iconBtn, opacity: idx === categories.length - 1 ? 0.25 : 1 }}
                  title="Move down"
                  onClick={() => moveCategory(idx, 1)}
                  disabled={idx === categories.length - 1}
                  type="button"
                >
                  ↓
                </button>

                <div style={styles.divider} />

                {/* Rename */}
                <button
                  style={styles.iconBtnAccent}
                  title="Rename"
                  onClick={() => {
                    if (editingId === cat.id) {
                      setEditingId(null)
                    } else {
                      startEdit(cat)
                    }
                  }}
                  type="button"
                >
                  ✎
                </button>

                {/* Delete */}
                <button
                  style={styles.iconBtnDanger}
                  title="Delete category"
                  onClick={() => handleDelete(cat)}
                  type="button"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}