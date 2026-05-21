'use client'
import { useState, useEffect, useCallback } from 'react'
import CashSessionPanel from '@/components/pos/CashSessionPanel'
import ZReportView from '@/components/pos/ZReportView'

interface Sale { id: string; sale_number: string; total_amount: number; payment_method: string | null; status: string; created_at: string }

export default function EndOfDayPage() {
  const [closedSessionId, setClosedSessionId] = useState<string | null>(null)
  const [sessionData, setSessionData] = useState<Record<string, unknown> | null>(null)
  const [summaryData, setSummaryData] = useState<Record<string, unknown> | null>(null)
  const [todaySales, setTodaySales] = useState<Sale[]>([])
  const [narrative, setNarrative] = useState<{ headline: string; pattern: string; action: string } | null>(null)
  const [loadingSales, setLoadingSales] = useState(true)

  const loadSales = useCallback(async () => {
    setLoadingSales(true)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const params = new URLSearchParams({ starts_at: today.toISOString(), limit: '100' })
    const r = await fetch(`/api/pos/sales-history?${params}`)
    if (r.ok) { const d = await r.json(); setTodaySales(d.sales ?? []) }
    setLoadingSales(false)
  }, [])

  const loadSummary = useCallback(async () => {
    const r = await fetch('/api/pos/daily-summary')
    if (r.ok) { const d = await r.json(); setSummaryData(d) }
  }, [])

  useEffect(() => { loadSales(); loadSummary() }, [loadSales, loadSummary])

  async function handleSessionClosed(sessionId: string) {
    setClosedSessionId(sessionId)
    const r = await fetch(`/api/pos/cash-sessions/${sessionId}`)
    if (r.ok) { const d = await r.json(); setSessionData(d.session) }
    // Load AI narrative
    const nr = await fetch('/api/aria/daily-narrative', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: summaryData }),
    })
    if (nr.ok) { const nd = await nr.json(); setNarrative(nd.narrative ?? null) }
  }

  const totalRevenue = todaySales.filter(s => s.status === 'completed').reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)
  const STATUS_COLOR: Record<string, string> = { completed: '#006AFF', voided: '#FF6B6B', refunded: '#FFB347', parked: '#6B6B6B' }

  return (
    <div className="p-5 max-w-5xl mx-auto" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      <h1 className="text-xl font-semibold mb-1">End of Day</h1>
      <p className="text-xs mb-6" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Close your till, reconcile cash, and generate the Z-report.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        {/* Cash session panel */}
        <CashSessionPanel onSessionClosed={handleSessionClosed} />

        {/* Daily summary */}
        <div className="rounded-2xl p-5 space-y-3" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
          <h2 className="text-sm font-semibold">Today's summary</h2>
          <div className="grid grid-cols-3 gap-3 text-sm">
            {[
              ['Transactions', String(todaySales.filter(s => s.status === 'completed').length)],
              ['Revenue', `A$${totalRevenue.toFixed(2)}`],
              ['Voids', String(todaySales.filter(s => s.status === 'voided').length)],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{k}</div>
                <div className="font-semibold" style={{ color: 'var(--text-primary, #E8EDE7)' }}>{v}</div>
              </div>
            ))}
          </div>
          {narrative && (
            <div className="rounded-xl p-3 text-xs space-y-1" style={{ background: 'rgba(127,184,151,0.06)', border: '1px solid rgba(127,184,151,0.1)' }}>
              {narrative.headline && <div style={{ color: 'var(--text-primary, #E8EDE7)' }}>{narrative.headline}</div>}
              {narrative.pattern && <div style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{narrative.pattern}</div>}
              {narrative.action && <div style={{ color: '#006AFF' }}>{narrative.action}</div>}
            </div>
          )}
        </div>
      </div>

      {/* Z-Report */}
      {closedSessionId && sessionData && (
        <div className="mb-6">
          <ZReportView
            session={sessionData as unknown as Parameters<typeof ZReportView>[0]['session']}
            summary={summaryData ? {
              count: (summaryData.totals as Record<string, number>)?.count ?? 0,
              gross_revenue: (summaryData.totals as Record<string, number>)?.gross_revenue ?? 0,
              tax_collected: (summaryData.totals as Record<string, number>)?.tax_collected ?? 0,
              discounts_given: (summaryData.totals as Record<string, number>)?.discounts_given ?? 0,
              avg_ticket: (summaryData.totals as Record<string, number>)?.avg_ticket ?? 0,
            } : undefined}
            topProducts={(summaryData?.top_products as Parameters<typeof ZReportView>[0]['topProducts']) ?? []}
          />
        </div>
      )}

      {/* Today's sales mini-list */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
        <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
          <h2 className="text-sm font-semibold">Today&apos;s sales ({todaySales.length})</h2>
        </div>
        {loadingSales ? (
          <div className="p-6 text-center text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Loading…</div>
        ) : todaySales.length === 0 ? (
          <div className="p-6 text-center text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>No sales today yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
                {['Sale #', 'Time', 'Payment', 'Total', 'Status'].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {todaySales.slice(0, 20).map(s => (
                <tr key={s.id} style={{ borderTop: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
                  <td className="px-4 py-2 font-mono text-xs" style={{ color: '#006AFF' }}>{s.sale_number}</td>
                  <td className="px-4 py-2 text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{new Date(s.created_at).toLocaleTimeString()}</td>
                  <td className="px-4 py-2 text-xs capitalize">{s.payment_method ?? '—'}</td>
                  <td className="px-4 py-2 font-medium">${(Number(s.total_amount) || 0).toFixed(2)}</td>
                  <td className="px-4 py-2">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${STATUS_COLOR[s.status] ?? '#6B6B6B'}22`, color: STATUS_COLOR[s.status] ?? '#6B6B6B' }}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
