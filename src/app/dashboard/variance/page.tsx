'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { VarianceExtensions } from '@/components/dashboard/Prompt55Extensions'
import { AriaSays } from '@/components/dashboard/AriaSays'

interface VItem {
  item_id: string
  item_name: string
  theoretical_stock: number
  actual_stock: number
  variance: number
  variance_value_cents: number
  variance_pct: number
}

interface AiInsight {
  item_id: string
  insight: string
}

function downloadCSV(items: VItem[]) {
  const headers = ['Product', 'Expected', 'Actual', 'Variance', 'Value Gap (A$)', '%']
  const rows = items.map(i => [
    i.item_name,
    i.theoretical_stock,
    i.actual_stock,
    i.variance,
    (i.variance_value_cents / 100).toFixed(2),
    i.variance_pct,
  ])
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = 'variance-report.csv'
  a.click()
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '...' : s
}

export default function VariancePage() {
  const { business } = useBusinessContext()
  const [items, setItems] = useState<VItem[]>([])
  const [insights, setInsights] = useState<AiInsight[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState<'table' | 'chart'>('chart')
  const [expanded, setExpanded] = useState<string | null>(null)
  const chartRef = useRef<HTMLCanvasElement>(null)
  const chartInstance = useRef<unknown>(null)

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/aria/variance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      const d = await res.json()
      setItems(d.items ?? [])
      setInsights(d.ai_insights ?? [])
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [business?.id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (view !== 'chart' || !chartRef.current || items.length === 0) return
    const win = window as unknown as Record<string, unknown>
    function buildChart() {
      if (!win.Chart) return
      type ChartCtor = { new(el: HTMLCanvasElement, cfg: unknown): unknown }
      const ChartJS = win.Chart as ChartCtor
      if (chartInstance.current) (chartInstance.current as { destroy(): void }).destroy()
      const sorted = [...items]
        .sort((a, b) => a.variance_value_cents - b.variance_value_cents)
        .slice(0, 15)
      chartInstance.current = new ChartJS(chartRef.current!, {
        type: 'bar',
        data: {
          labels: sorted.map(i => truncate(i.item_name, 18)),
          datasets: [{
            label: 'Shrinkage Value',
            data: sorted.map(i => -(i.variance_value_cents / 100)),
            backgroundColor: sorted.map(i =>
              i.variance < 0 ? 'rgba(239,68,68,0.7)' : 'rgba(34,197,94,0.7)'
            ),
            borderRadius: 4,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              ticks: {
                color: 'rgba(255,255,255,0.4)',
                font: { size: 10 },
                callback: (v: number) => '$' + Math.abs(v),
              },
              grid: { color: 'rgba(255,255,255,0.05)' },
            },
            y: {
              ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } },
              grid: { display: false },
            },
          },
        },
      })
    }
    if (win.Chart) {
      buildChart()
    } else {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
      s.onload = buildChart
      document.head.appendChild(s)
    }
  }, [items, view])

  const lossItems = items.filter(i => i.variance < 0)
  const surplusItems = items.filter(i => i.variance > 0)
  const totalShrinkage = lossItems.reduce((s, i) => s + i.variance_value_cents, 0)

  const chartHeight = Math.max(300, Math.min(items.length, 15) * 36 + 80)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <AriaSays businessId={business?.id ?? null} page="variance" />
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Variance &amp; Shrinkage</h1>
          <p style={{ color: '#6b7280' }}>Gap between expected and actual stock. Top 15 worst items in chart.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['chart', 'table'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="text-xs px-3 py-2 rounded-xl transition-colors capitalize"
              style={{
                background: view === v ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
                color: view === v ? '#8B5CF6' : 'rgba(255,255,255,0.4)',
                border: view === v ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {v}
            </button>
          ))}
          {items.length > 0 && (
            <button
              onClick={() => downloadCSV(items)}
              className="text-xs px-3 py-2 rounded-xl transition-colors"
              style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              Export CSV
            </button>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="text-xs px-3 py-2 rounded-xl transition-colors disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af' }}
          >
            {loading ? '...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-red-900/20 text-red-400">{error}</div>
      )}

      {loading && items.length === 0 && (
        <div className="animate-pulse space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-12 rounded-xl bg-[rgba(255,255,255,0.04)]" />
          ))}
        </div>
      )}

      {!loading && items.length === 0 && !error && (
        <div
          className="rounded-xl p-12 text-center"
          style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="text-3xl mb-3">🎉</div>
          <p className="text-white font-semibold mb-1">No significant variance detected</p>
          <p className="text-sm" style={{ color: '#6b7280' }}>Your stock levels are accurate.</p>
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div
              className="rounded-xl p-4"
              style={{
                background: totalShrinkage > 0 ? 'rgba(239,68,68,0.1)' : '#13131a',
                border: totalShrinkage > 0 ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <p className="text-xs mb-1" style={{ color: '#6b7280' }}>Total shrinkage</p>
              <p
                className="text-2xl font-semibold"
                style={{ color: totalShrinkage > 0 ? '#ef4444' : '#fff' }}
              >
                A${(totalShrinkage / 100).toFixed(2)}
              </p>
            </div>
            <div
              className="rounded-xl p-4"
              style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <p className="text-xs mb-1" style={{ color: '#6b7280' }}>Items with loss</p>
              <p className="text-2xl font-semibold text-red-400">{lossItems.length}</p>
            </div>
            <div
              className="rounded-xl p-4"
              style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <p className="text-xs mb-1" style={{ color: '#6b7280' }}>Items with surplus</p>
              <p className="text-2xl font-semibold text-emerald-400">{surplusItems.length}</p>
            </div>
          </div>

          {view === 'chart' ? (
            <div
              style={{
                position: 'relative',
                height: chartHeight,
                background: '#13131a',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.07)',
                padding: '16px',
              }}
            >
              <canvas
                ref={chartRef}
                role="img"
                aria-label="Horizontal bar chart showing shrinkage value by product"
              />
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    {['Product', 'Expected', 'Actual', 'Variance', 'Value Gap', 'AI Insight'].map(h => (
                      <th
                        key={h}
                        className="px-3 py-3 text-left text-xs font-medium"
                        style={{ color: '#6b7280' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody style={{ background: '#0d0d14' }}>
                  {items.map(item => {
                    const isLoss = item.variance < 0
                    const insight = insights.find(ins => ins.item_id === item.item_id)
                    return (
                      <tr
                        key={item.item_id}
                        className="cursor-pointer hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          background: isLoss ? 'rgba(239,68,68,0.04)' : 'rgba(16,185,129,0.04)',
                        }}
                        onClick={() => setExpanded(expanded === item.item_id ? null : item.item_id)}
                      >
                        <td className="px-3 py-3 text-white font-medium">{item.item_name}</td>
                        <td className="px-3 py-3" style={{ color: '#9ca3af' }}>{item.theoretical_stock}</td>
                        <td className="px-3 py-3" style={{ color: '#9ca3af' }}>{item.actual_stock}</td>
                        <td className="px-3 py-3">
                          <span className={isLoss ? 'text-red-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                            {isLoss ? '' : '+'}{item.variance} ({item.variance_pct}%)
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={isLoss ? 'text-red-400' : 'text-emerald-400'}>
                            {isLoss ? '-' : '+'}A${(item.variance_value_cents / 100).toFixed(2)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs" style={{ color: '#6b7280' }}>
                          {insight ? truncate(insight.insight, 50) : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {expanded && (() => {
            const item = items.find(i => i.item_id === expanded)
            const insight = insights.find(ins => ins.item_id === expanded)
            if (!item || !insight) return null
            return (
              <div
                className="mt-3 px-4 py-3 rounded-xl text-xs"
                style={{ background: 'rgba(255,255,255,0.03)', color: '#d1d5db', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <strong style={{ color: '#fff' }}>{item.item_name}:</strong> {insight.insight}
              </div>
            )
          })()}

          <p className="text-xs mt-3" style={{ color: 'rgba(255,255,255,0.2)' }}>
            Based on stock movements and sales in the last 30 days.
          </p>
        </>
      )}
      <VarianceExtensions />
    </div>
  )
}
