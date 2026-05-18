'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface DailyNarrative { headline: string; pattern: string; action: string }
interface Totals { count: number; gross_revenue: number; avg_ticket: number }
interface Comparison { revenue_delta_pct: number; count_delta_pct: number; ticket_delta_pct: number }
interface TopProduct { product_name: string; revenue: number; units: number }

export default function DailySummaryCard() {
  const [totals, setTotals] = useState<Totals | null>(null)
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [narrative, setNarrative] = useState<DailyNarrative | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await fetch('/api/pos/daily-summary')
        if (!r.ok || cancelled) return
        const d = await r.json()
        if (cancelled) return
        setTotals(d.totals ?? null)
        setComparison(d.comparison ?? null)
        setTopProducts(d.top_products?.slice(0, 3) ?? [])

        // Load AI narrative
        const nr = await fetch('/api/aria/daily-narrative', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ summary: d }),
        })
        if (nr.ok && !cancelled) {
          const nd = await nr.json()
          setNarrative(nd.narrative ?? null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  function DeltaBadge({ pct }: { pct: number }) {
    const up = pct >= 0
    return (
      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium ml-1" style={{ background: up ? 'rgba(127,184,151,0.15)' : 'rgba(255,107,107,0.15)', color: up ? '#7FB897' : '#FF6B6B' }}>
        {up ? '+' : ''}{pct.toFixed(1)}%
      </span>
    )
  }

  if (loading) return (
    <div className="rounded-2xl p-5 animate-pulse" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
      <div className="h-4 w-24 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
    </div>
  )

  return (
    <div className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary, #E8EDE7)' }}>Today so far</h3>
        <Link href="/pos/sales-history" className="text-xs" style={{ color: '#7FB897' }}>Full history →</Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          ['Revenue', totals ? `A$${totals.gross_revenue.toFixed(2)}` : '—', comparison?.revenue_delta_pct],
          ['Transactions', totals ? String(totals.count) : '—', comparison?.count_delta_pct],
          ['Avg ticket', totals ? `A$${totals.avg_ticket.toFixed(2)}` : '—', comparison?.ticket_delta_pct],
        ].map(([label, value, delta]) => (
          <div key={label as string}>
            <div className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{label as string}</div>
            <div className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
              {value as string}
              {typeof delta === 'number' && <DeltaBadge pct={delta} />}
            </div>
          </div>
        ))}
      </div>

      {topProducts.length > 0 && (
        <div>
          <div className="text-xs mb-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Top sellers</div>
          <div className="space-y-1">
            {topProducts.map(p => (
              <div key={p.product_name} className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-primary, #E8EDE7)' }}>{p.product_name}</span>
                <span style={{ color: 'var(--text-secondary, #A8B5A8)' }}>A${(Number(p.revenue) || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {narrative && (narrative.headline || narrative.pattern || narrative.action) && (
        <div className="rounded-xl p-3 text-xs space-y-1" style={{ background: 'rgba(127,184,151,0.06)', border: '1px solid rgba(127,184,151,0.1)' }}>
          {narrative.headline && <div style={{ color: 'var(--text-primary, #E8EDE7)' }}>{narrative.headline}</div>}
          {narrative.pattern && <div style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{narrative.pattern}</div>}
          {narrative.action && <div style={{ color: '#7FB897' }}>{narrative.action}</div>}
        </div>
      )}
    </div>
  )
}
