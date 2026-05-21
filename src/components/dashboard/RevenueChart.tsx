'use client'
import { useEffect, useRef } from 'react'

interface Props {
  businessId: string
}

export default function RevenueChart({ businessId }: Props) {
  const chartRef = useRef<HTMLCanvasElement>(null)
  const instanceRef = useRef<unknown>(null)

  useEffect(() => {
    if (!businessId || !chartRef.current) return
    async function load() {
      const res = await fetch('/api/pos/sales?business_id=' + businessId + '&limit=500')
      const data = await res.json() as { sales?: Array<{ created_at: string; total_amount: number; status: string }> }
      const sales = (data.sales ?? []).filter(s => s.status !== 'voided')

      const byDate: Record<string, number> = {}
      for (const s of sales) {
        const d = s.created_at?.split('T')[0]
        if (d) byDate[d] = (byDate[d] ?? 0) + Number(s.total_amount ?? 0)
      }

      const days: string[] = []
      const values: number[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const key = d.toISOString().split('T')[0]
        days.push(d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric' }))
        values.push(Math.round(byDate[key] ?? 0))
      }

      const win = window as unknown as Record<string, unknown>
      function build() {
        if (!win.Chart || !chartRef.current) return
        const CJS = win.Chart as { new(el: HTMLCanvasElement, cfg: unknown): unknown }
        if (instanceRef.current) (instanceRef.current as { destroy(): void }).destroy()
        instanceRef.current = new CJS(chartRef.current, {
          type: 'bar',
          data: {
            labels: days,
            datasets: [{
              label: 'Revenue',
              data: values,
              backgroundColor: 'rgba(29,158,117,0.7)',
              borderRadius: 6,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 } }, grid: { display: false } },
              y: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 }, callback: (v: number) => '$' + Math.round(v) }, grid: { color: 'rgba(255,255,255,0.05)' } },
            }
          }
        })
      }
      if (win.Chart) { build() } else {
        const s = document.createElement('script')
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
        s.onload = build
        document.head.appendChild(s)
      }
    }
    load()
  }, [businessId])

  return (
    <div style={{ background: 'rgba(29,158,117,0.05)', borderRadius: 16, border: '1px solid rgba(29,158,117,0.2)', padding: '20px', marginTop: 16 }}>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Last 7 days revenue</p>
      <div style={{ position: 'relative', height: 180 }}>
        <canvas ref={chartRef} role="img" aria-label="Bar chart of daily revenue for the last 7 days" />
      </div>
    </div>
  )
}
