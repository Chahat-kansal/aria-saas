'use client'
import { useState } from 'react'

interface Props {
  iou: { id: string; from_name: string; to_name: string; amount: number }
  onDone: () => void
  onClose: () => void
}

const inp: React.CSSProperties = { background: 'var(--bg-base)', border: '1px solid var(--divider)', borderRadius: 8, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }

export default function DisputeIouModal({ iou, onDone, onClose }: Props) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function dispute() {
    if (!reason.trim()) { setError('Reason is required'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/pos/split-ious/${iou.id}/dispute`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed'); return }
      onDone()
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 14, width: 380, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>Dispute IOU</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
          {iou.from_name} → {iou.to_name} · A${(Number(iou.amount) || 0).toFixed(2)}
        </p>
        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#f59e0b' }}>⚠ This will lock the IOU until the dispute is resolved.</p>

        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Reason *</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
          style={{ ...inp, resize: 'vertical', marginBottom: 16 }} placeholder="Describe the dispute…" />

        {error && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 10 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={dispute} disabled={saving || !reason.trim()} style={{ flex: 2, padding: '8px 0', borderRadius: 8, border: 'none', background: '#f59e0b', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving || !reason.trim() ? 0.6 : 1 }}>
            {saving ? 'Disputing…' : 'Flag Dispute'}
          </button>
        </div>
      </div>
    </div>
  )
}