'use client'
import { useState, useEffect } from 'react'

interface PriceSet { id: string; name: string; description: string | null; is_default: boolean; sort_order: number | null; outlet_name: string | null }

const inp: React.CSSProperties = { background: 'var(--bg-base)', border: '1px solid var(--divider)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }

export default function PriceSetsPage() {
  const [sets, setSets] = useState<PriceSet[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', description: '', is_default: false })
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const res = await fetch('/api/pos/price-sets').then(r => r.json()).catch(() => ({ sets: [] }))
    setSets(res.sets ?? res.data ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function save() {
    if (!form.name.trim()) return
    setSaving(true); setError('')
    try {
      const url = editing ? `/api/pos/price-sets?id=${editing}` : '/api/pos/price-sets'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.name.trim(), description: form.description || null, is_default: form.is_default }) })
      const d = await res.json()
      if (!res.ok || d.error) { setError(d.error ?? 'Failed to save'); setSaving(false); return }
      setForm({ name: '', description: '', is_default: false }); setEditing(null)
      load()
    } catch (e) { setError((e as Error).message) }
    setSaving(false)
  }

  async function del(id: string) {
    if (!confirm('Delete this price set?')) return
    setDeleting(id)
    await fetch(`/api/pos/price-sets?id=${id}`, { method: 'DELETE' })
    setSets(s => s.filter(p => p.id !== id))
    setDeleting(null)
  }

  function startEdit(ps: PriceSet) {
    setEditing(ps.id)
    setForm({ name: ps.name, description: ps.description ?? '', is_default: ps.is_default })
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '24px 28px', maxWidth: 720 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Price Sets</h1>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 24px' }}>Named price sets for different contexts (e.g. Happy Hour, Staff, Wholesale).</p>

      {/* Create / edit form */}
      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: '18px 20px', marginBottom: 24, border: '1px solid var(--divider)' }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 14px' }}>{editing ? 'Edit Price Set' : 'New Price Set'}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Name *</label>
            <input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Happy Hour" />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Description</label>
            <input style={inp} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14 }}>
          <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} />
          Set as default price set
        </label>
        {error && <p style={{ color: 'var(--destructive)', fontSize: 12, marginBottom: 8 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={save} disabled={saving || !form.name.trim()}
            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
          </button>
          {editing && (
            <button onClick={() => { setEditing(null); setForm({ name: '', description: '', is_default: false }) }}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
      ) : sets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-tertiary)', fontSize: 13 }}>
          No price sets yet. Create one above.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--divider)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--divider)', background: 'var(--bg-elevated)' }}>
                {['Name', 'Description', 'Default', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sets.map(ps => (
                <tr key={ps.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{ps.name}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{ps.description ?? '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {ps.is_default && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(127,184,151,0.15)', color: '#7FB897', fontWeight: 700 }}>Default</span>}
                  </td>
                  <td style={{ padding: '10px 14px', display: 'flex', gap: 8 }}>
                    <button onClick={() => startEdit(ps)} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                    <button onClick={() => del(ps.id)} disabled={deleting === ps.id} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: 'var(--destructive)', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {deleting === ps.id ? '…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}