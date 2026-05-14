'use client'
import { useState } from 'react'
import type { ModifierGroup } from '@/types/pos-modifiers'

interface Props {
  initial?: Partial<ModifierGroup>
  onSave: (data: Partial<ModifierGroup>) => Promise<void>
  onCancel: () => void
}

export function GroupForm({ initial, onSave, onCancel }: Props) {
  const [name,           setName]           = useState(initial?.name ?? '')
  const [selType,        setSelType]        = useState<'single'|'multi'>(initial?.selection_type ?? 'single')
  const [required,       setRequired]       = useState(initial?.is_required ?? false)
  const [minSel,         setMinSel]         = useState(String(initial?.min_selections ?? 0))
  const [maxSel,         setMaxSel]         = useState(String(initial?.max_selections ?? ''))
  const [allowQty,       setAllowQty]       = useState(initial?.allow_quantity ?? false)
  const [conversational, setConversational] = useState(initial?.show_conversational_buttons ?? false)
  const [color,          setColor]          = useState(initial?.color ?? '#7FB897')
  const [saving,         setSaving]         = useState(false)

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 7, padding: '8px 10px', color: '#fff', fontSize: 13,
    outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit',
  }
  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 4 }
  const row: React.CSSProperties = { marginBottom: 12 }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    await onSave({
      name: name.trim(),
      selection_type: selType,
      is_required: required,
      min_selections: parseInt(minSel) || 0,
      max_selections: maxSel.trim() ? parseInt(maxSel) : null,
      allow_quantity: allowQty,
      show_conversational_buttons: conversational,
      color,
    })
    setSaving(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={row}>
        <label style={labelStyle}>Group name *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Milk Type" style={inputStyle} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Selection type</label>
          <select value={selType} onChange={e => setSelType(e.target.value as 'single'|'multi')} style={{ ...inputStyle }}>
            <option value="single">Single choice</option>
            <option value="multi">Multi-select</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Accent color</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              style={{ width: 36, height: 36, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{color}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Min selections</label>
          <input type="number" min="0" value={minSel} onChange={e => setMinSel(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Max selections (blank = unlimited)</label>
          <input type="number" min="0" value={maxSel} onChange={e => setMaxSel(e.target.value)} placeholder="∞" style={inputStyle} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Required', val: required, set: setRequired },
          { label: 'Allow quantity (+/−)', val: allowQty, set: setAllowQty },
          { label: 'Conversational (Add/Extra/No)', val: conversational, set: setConversational },
        ].map(({ label, val, set }) => (
          <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
            <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} />
            {label}
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving || !name.trim()} style={{ flex: 2, padding: '9px 0', borderRadius: 8, border: 'none', background: '#7FB897', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, opacity: saving || !name.trim() ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save Group'}
        </button>
      </div>
    </div>
  )
}