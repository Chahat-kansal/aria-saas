'use client'
import { useState } from 'react'
import type { ModifierGroup, Modifier } from '@/types/pos-modifiers'

interface Props {
  group: ModifierGroup
  businessId: string
  onRefresh: () => void
}

export function ModifierEditor({ group, businessId, onRefresh }: Props) {
  const [adding,    setAdding]    = useState(false)
  const [newName,   setNewName]   = useState('')
  const [newPrice,  setNewPrice]  = useState('0')
  const [newQty,    setNewQty]    = useState(false)
  const [newMax,    setNewMax]    = useState('1')
  const [newDefault,setNewDefault]= useState(false)
  const [saving,    setSaving]    = useState(false)

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6, padding: '6px 8px', color: '#fff', fontSize: 12,
    outline: 'none', fontFamily: 'inherit',
  }

  const handleAddModifier = async () => {
    if (!newName.trim()) return
    setSaving(true)
    await fetch('/api/pos/modifiers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        group_id: group.id, business_id: businessId,
        name: newName.trim(), price_adjustment: parseFloat(newPrice) || 0,
        allow_quantity: newQty, max_quantity: parseInt(newMax) || 1,
        is_default: newDefault,
      }),
    })
    setNewName(''); setNewPrice('0'); setNewQty(false); setNewMax('1'); setNewDefault(false)
    setAdding(false)
    setSaving(false)
    onRefresh()
  }

  const toggle86 = async (m: Modifier) => {
    await fetch(`/api/pos/modifiers/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !m.is_active }),
    })
    onRefresh()
  }

  const deleteModifier = async (m: Modifier) => {
    if (!confirm(`Delete "${m.name}"?`)) return
    await fetch(`/api/pos/modifiers/${m.id}`, { method: 'DELETE' })
    onRefresh()
  }

  const modifiers = group.modifiers ?? []

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ color: group.color ?? '#7FB897', fontSize: 14, fontWeight: 700, margin: 0 }}>
          {group.name}
          <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
            {group.selection_type} · {modifiers.length} options
          </span>
        </h3>
        <button onClick={() => setAdding(v => !v)}
          style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(127,184,151,0.3)', background: 'rgba(127,184,151,0.08)', color: '#7FB897', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
          + Add option
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div style={{ background: 'rgba(127,184,151,0.06)', border: '1px solid rgba(127,184,151,0.2)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Option name *" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' as const }} />
            <input type="number" step="0.01" value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="±$0.00" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' as const }} />
            <input type="number" min="1" value={newMax} onChange={e => setNewMax(e.target.value)} placeholder="Max qty" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' as const }} />
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={newQty} onChange={e => setNewQty(e.target.checked)} /> Allow qty
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={newDefault} onChange={e => setNewDefault(e.target.checked)} /> Default
            </label>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setAdding(false)} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>Cancel</button>
            <button onClick={handleAddModifier} disabled={saving || !newName.trim()} style={{ flex: 2, padding: '6px 0', borderRadius: 6, border: 'none', background: '#7FB897', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700 }}>
              {saving ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {/* Modifier list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {modifiers.map(m => (
          <div key={m.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px', borderRadius: 7,
            background: m.is_active ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)',
            border: '1px solid rgba(255,255,255,0.06)',
            opacity: m.is_active ? 1 : 0.4,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ color: m.is_active ? '#fff' : 'rgba(255,255,255,0.5)', fontSize: 13 }}>{m.name}</span>
              {m.price_adjustment !== 0 && (
                <span style={{ fontSize: 11, color: m.price_adjustment > 0 ? '#7FB897' : '#f87171', marginLeft: 6 }}>
                  {m.price_adjustment > 0 ? '+' : ''}A${m.price_adjustment.toFixed(2)}
                </span>
              )}
              {m.is_default && <span style={{ fontSize: 10, color: '#7FB897', marginLeft: 6, opacity: 0.7 }}>default</span>}
            </div>
            <button onClick={() => toggle86(m)}
              style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, border: `1px solid ${m.is_active ? 'rgba(239,68,68,0.3)' : 'rgba(127,184,151,0.3)'}`, background: 'transparent', color: m.is_active ? '#f87171' : '#7FB897', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
              {m.is_active ? '86' : 'Restore'}
            </button>
            <button onClick={() => deleteModifier(m)}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>×</button>
          </div>
        ))}
        {modifiers.length === 0 && (
          <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>No options yet</p>
        )}
      </div>
    </div>
  )
}