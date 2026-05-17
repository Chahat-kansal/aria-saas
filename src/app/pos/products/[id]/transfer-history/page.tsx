'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'

interface TransferRef {
  id: string
  transfer_number: string
  status: string
  from_outlet_id: string | null
  to_outlet_id: string | null
  shipped_at: string | null
  received_at: string | null
  reconciled_at: string | null
}

interface HistoryRow {
  id: string
  quantity_requested: number
  quantity_sent: number
  quantity_received: number
  variance_units: number
  unit_cost: number
  pos_inventory_transfers: TransferRef
}

export default function ProductTransferHistory() {
  const params = useParams<{ id: string }>()
  const productId = params?.id
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!productId) return
    const r = await fetch(`/api/pos/transfers/history?product_id=${productId}`)
    const d = await r.json()
    setHistory(d.history ?? [])
    setLoading(false)
  }, [productId])
  useEffect(() => { load() }, [load])

  if (loading) return <div className="p-6 text-[var(--text-secondary)]">Loading…</div>

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-semibold mb-2 text-[var(--text-primary)]">Transfer history</h1>
      <p className="text-xs text-[var(--text-secondary)] mb-6">All inventory transfers that have included this product.</p>
      {history.length === 0 ? (
        <div className="bg-[var(--bg-elevated)] rounded-2xl border border-[var(--divider)] p-8 text-center text-sm text-[var(--text-secondary)]">No transfer history for this product yet.</div>
      ) : (
        <div className="bg-[var(--bg-elevated)] rounded-2xl border border-[var(--divider)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-secondary)]">
              <tr>
                <th className="text-left px-4 py-3">Transfer</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Requested</th>
                <th className="text-right px-4 py-3">Sent</th>
                <th className="text-right px-4 py-3">Received</th>
                <th className="text-right px-4 py-3">Variance</th>
                <th className="text-left px-4 py-3">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {history.map(h => {
                const t = h.pos_inventory_transfers
                const lastDate = t.reconciled_at ?? t.received_at ?? t.shipped_at ?? null
                const variance = Number(h.variance_units) || 0
                return (
                  <tr key={h.id} className="border-t border-[var(--divider)] text-[var(--text-primary)]">
                    <td className="px-4 py-3 font-mono text-xs text-[var(--violet)]">{t.transfer_number}</td>
                    <td className="px-4 py-3 text-xs capitalize">{t.status.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-right">{h.quantity_requested}</td>
                    <td className="px-4 py-3 text-right">{h.quantity_sent}</td>
                    <td className="px-4 py-3 text-right">{h.quantity_received}</td>
                    <td className={`px-4 py-3 text-right font-medium ${variance < 0 ? 'text-[var(--destructive)]' : variance > 0 ? 'text-[var(--success)]' : ''}`}>
                      {variance > 0 ? '+' : ''}{variance || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                      {lastDate ? new Date(lastDate).toLocaleDateString('en-AU') : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
