'use client'
import { useState, useEffect, useCallback } from 'react'
import SalesHistoryFilters, { type SalesFilters } from '@/components/pos/SalesHistoryFilters'
import SaleDetailDrawer from '@/components/pos/SaleDetailDrawer'

interface Sale {
  id: string
  sale_number: string
  total_amount: number
  payment_method: string | null
  status: string
  created_at: string
  customer_name: string | null
  served_by: string | null
}

const today = new Date()
const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0)
const todayEnd = new Date(today); todayEnd.setHours(23, 59, 59, 999)

const STATUS_COLOR: Record<string, string> = { completed: '#7FB897', voided: '#FF6B6B', refunded: '#FFB347', parked: '#A8B5A8' }

function downloadCSV(sales: Sale[]) {
  const rows = [
    ['Sale #', 'Date', 'Customer', 'Payment', 'Total', 'Status'].join(','),
    ...sales.map(s => [
      s.sale_number,
      new Date(s.created_at).toLocaleString(),
      s.customer_name ?? '',
      s.payment_method ?? '',
      (Number(s.total_amount) || 0).toFixed(2),
      s.status,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
  ]
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'sales-export.csv'; a.click()
  URL.revokeObjectURL(url)
}

export default function SalesHistoryPage() {
  const [filters, setFilters] = useState<SalesFilters>({
    starts_at: todayStart.toISOString(),
    ends_at: todayEnd.toISOString(),
    status: '',
    payment_method: '',
    search: '',
  })
  const [sales, setSales] = useState<Sale[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const LIMIT = 50

  const fetchSales = useCallback(async (f: SalesFilters, off: number) => {
    setLoading(true)
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off) })
    if (f.status) params.set('status', f.status)
    if (f.payment_method) params.set('payment_method', f.payment_method)
    if (f.starts_at) params.set('starts_at', f.starts_at)
    if (f.ends_at) params.set('ends_at', f.ends_at)
    if (f.search) params.set('search', f.search)
    const r = await fetch(`/api/pos/sales-history?${params}`)
    const d = await r.json()
    setSales(d.sales ?? [])
    setTotal(d.total ?? 0)
    setLoading(false)
  }, [])

  useEffect(() => { fetchSales(filters, offset) }, [fetchSales, filters, offset])

  function applyFilters() { setOffset(0); fetchSales(filters, 0) }

  return (
    <div className="p-5 max-w-5xl mx-auto" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold">Sales History</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{total} records · click any row to view details</p>
        </div>
        <button onClick={() => downloadCSV(sales)} className="px-3 py-1.5 rounded-xl text-xs font-medium" style={{ border: '1px solid rgba(127,184,151,0.2)', color: '#7FB897' }}>
          Export CSV
        </button>
      </div>

      <div className="mb-4">
        <SalesHistoryFilters filters={filters} setFilters={setFilters} onApply={applyFilters} />
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
        {loading ? (
          <div className="p-10 text-center text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Loading…</div>
        ) : sales.length === 0 ? (
          <div className="p-10 text-center text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>No sales found for the selected filters.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
                {['Sale #', 'Time', 'Customer', 'Payment', 'Total', 'Status', 'Served by'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sales.map(s => (
                <tr
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className="cursor-pointer transition-colors"
                  style={{ borderTop: '1px solid var(--divider, rgba(232,237,231,0.04))' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(127,184,151,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: '#7FB897' }}>{s.sale_number}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{new Date(s.created_at).toLocaleTimeString()}</td>
                  <td className="px-4 py-3 text-xs">{s.customer_name ?? '—'}</td>
                  <td className="px-4 py-3 text-xs capitalize">{s.payment_method ?? '—'}</td>
                  <td className="px-4 py-3 font-medium">${(Number(s.total_amount) || 0).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${STATUS_COLOR[s.status] ?? '#A8B5A8'}22`, color: STATUS_COLOR[s.status] ?? '#A8B5A8' }}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{s.served_by ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > LIMIT && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))} className="px-4 py-1.5 rounded-xl" style={{ border: '1px solid var(--divider)', color: 'var(--text-secondary)', opacity: offset === 0 ? 0.4 : 1 }}>← Prev</button>
          <span style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
          <button disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)} className="px-4 py-1.5 rounded-xl" style={{ border: '1px solid var(--divider)', color: 'var(--text-secondary)', opacity: offset + LIMIT >= total ? 0.4 : 1 }}>Next →</button>
        </div>
      )}

      {selectedId && (
        <SaleDetailDrawer
          saleId={selectedId}
          onClose={() => setSelectedId(null)}
          onVoided={() => fetchSales(filters, offset)}
        />
      )}
    </div>
  )
}
