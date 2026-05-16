'use client'
import { useState, useEffect } from 'react'

interface Transfer { id: string; created_at: string; product_name?: string; from_outlet_name?: string; to_outlet_name?: string; quantity: number; notes: string | null; pos_products?: { name: string } | null }

export default function TransferReportsPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/pos/transfer-reports').then(r => r.json()).then(d => {
      setTransfers(d.transfers ?? [])
      if (d.note) setNote(d.note)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return (
    <div style={{ padding: '24px 28px', maxWidth: 860, color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Transfer Reports</h1>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 24px' }}>History of stock transfers between outlets. Create transfers from the Transfers page.</p>

      {loading ? <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
      : (
        <>
          {note && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
              📦 {note}. Use <a href="/pos/transfers" style={{ color: 'var(--violet)' }}>Transfers</a> to move stock between outlets.
            </div>
          )}
          {transfers.length === 0 && !note ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔄</div>
              <p style={{ margin: 0 }}>No stock transfers yet.</p>
              <p style={{ fontSize: 12, marginTop: 4 }}>Transfer stock between outlets from the <a href="/pos/transfers" style={{ color: 'var(--violet)' }}>Transfers</a> page.</p>
            </div>
          ) : transfers.length > 0 ? (
            <div style={{ border: '1px solid var(--divider)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: 'var(--bg-surface)' }}>
                  {['Date', 'Product', 'From', 'To', 'Qty', 'Notes'].map(h => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {transfers.map((t, i) => (
                    <tr key={t.id} style={{ borderTop: '1px solid var(--divider)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)' }}>
                      <td style={{ padding: '10px 14px', color: 'var(--text-tertiary)', fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(t.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{t.pos_products?.name ?? t.product_name ?? '—'}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{t.from_outlet_name ?? '—'}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{t.to_outlet_name ?? '—'}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700 }}>{t.quantity}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-tertiary)', fontSize: 12 }}>{t.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}