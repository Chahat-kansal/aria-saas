'use client'
import { useState } from 'react'

interface Props {
  iou: { id: string; from_name: string; to_name: string; amount: number }
  onDone: () => void
  onClose: () => void
}

const METHODS = ['cash', 'bank_transfer', 'in_app_credit', 'manual']
const inp: React.CSSProperties = { background: 'var(--bg-base)', border: '1px solid var(--divider)', borderRadius: 8, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }

export default function SettleIouModal({ iou, onDone, onClose }: Props) {
  const [method, setMethod] = useState('cash')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function settle() {
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/pos/split-ious/${iou.id}/settle`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, reference: reference || null, notes: notes || null }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed'); return }
      onDone()
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 14, width: 380, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>Settle IOU</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
          {iou.from_name} → {iou.to_name} · A${iou.amount.toFixed(2)}
        </p>

        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Payment method</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {METHODS.map(m => (
            <button key={m} onClick={() => setMethod(m)}
              style={{ padding: '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', background: method === m ? 'var(--violet)' : 'var(--bg-base)', color: method === m ? '#fff' : 'var(--text-secondary)' }}>
              {m.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Reference (optional)</label>
        <input style={{ ...inp, marginBottom: 12 }} value={reference} onChange={e => setReference(e.target.value)} placeholder="BSB/account, receipt no." />

        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
        <input style={{ ...inp, marginBottom: 16 }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes…" />

        {error && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 10 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={settle} disabled={saving} style={{ flex: 2, padding: '8px 0', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Settling…' : 'Mark Settled'}
          </button>
        </div>
      </div>
    </div>
  )
}
