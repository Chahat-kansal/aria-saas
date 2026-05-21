'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface PromoIdea {
  title: string
  description: string
  discount: string
  channel: string
  estimated_uplift: string
  message_template: string
}

interface SlowDay {
  day: string
  avg_revenue: number
  vs_best: number
  transactions: number
}

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: 'var(--text-primary)',
  muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  green: '#22C55E', amber: '#F59E0B', violet: '#8B5CF6', red: '#EF4444',
  border: 'rgba(255,255,255,0.07)',
}

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const CHANNEL_ICONS: Record<string,string> = { sms:'📱', email:'✉️', social:'📣', instore:'🏪', all:'🎯' }

export default function SlowDayPage() {
  const { business } = useBusinessContext()
  const [slowDays, setSlowDays] = useState<SlowDay[]>([])
  const [ideas, setIdeas] = useState<PromoIdea[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [sentMsg, setSentMsg] = useState<string | null>(null)
  const chartRef = useRef<HTMLCanvasElement>(null)
  const chartInstance = useRef<unknown>(null)

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    try {
      const res = await fetch('/api/pos/sales?business_id=' + business.id + '&limit=1000')
      const d = await res.json() as { sales?: Array<{created_at:string; total_amount:number; status:string}> }
      const sales = (d.sales ?? []).filter(s => s.status !== 'voided')

      const byDow: Record<number, number[]> = {0:[],1:[],2:[],3:[],4:[],5:[],6:[]}
      const dailyRevenue: Record<string, number> = {}
      for (const s of sales) {
        const dt = new Date(s.created_at)
        const dateStr = dt.toISOString().split('T')[0]
        dailyRevenue[dateStr] = (dailyRevenue[dateStr] ?? 0) + Number(s.total_amount ?? 0)
      }
      for (const [dateStr, rev] of Object.entries(dailyRevenue)) {
        const dow = new Date(dateStr).getDay()
        byDow[dow].push(rev)
      }

      const dowAvg = Object.entries(byDow).map(([dow, revs]) => ({
        day: DAYS[Number(dow)],
        avg_revenue: revs.length ? revs.reduce((a,b)=>a+b,0)/revs.length : 0,
        transactions: revs.length,
        dow: Number(dow),
      }))

      const best = Math.max(...dowAvg.map(d => d.avg_revenue), 1)
      const result = dowAvg
        .map(d => ({ ...d, vs_best: Math.round((d.avg_revenue / best) * 100) }))
        .sort((a,b) => a.avg_revenue - b.avg_revenue)

      setSlowDays(result)
      if (result.length > 0) setSelectedDay(result[0].day)
    } catch { /* ignore */ }
    setLoading(false)
  }, [business?.id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!chartRef.current || slowDays.length === 0) return
    const win = window as unknown as Record<string, unknown>
    function build() {
      if (!win.Chart) return
      const CJS = win.Chart as { new(el: HTMLCanvasElement, cfg: unknown): unknown }
      if (chartInstance.current) (chartInstance.current as { destroy(): void }).destroy()
      const sorted = [...slowDays].sort((a, b) => a.dow - b.dow)
      chartInstance.current = new CJS(chartRef.current!, {
        type: 'bar',
        data: {
          labels: sorted.map(d => d.day),
          datasets: [{
            label: 'Avg Revenue',
            data: sorted.map(d => Math.round(d.avg_revenue)),
            backgroundColor: sorted.map(d => d.vs_best < 60 ? 'rgba(239,68,68,0.7)' : d.vs_best < 85 ? 'rgba(245,158,11,0.7)' : 'rgba(34,197,94,0.7)'),
            borderRadius: 6,
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 11 } }, grid: { display: false } },
            y: { ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 }, callback: (v: number) => '$' + Math.round(v) }, grid: { color: 'rgba(255,255,255,0.05)' } },
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
  }, [slowDays])

  async function generateIdeas() {
    if (!business?.id || !selectedDay) return
    setGenerating(true)
    try {
      const res = await fetch('/api/aria/slow-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, slow_day: selectedDay }),
      })
      const d = await res.json()
      setIdeas(d.ideas ?? [])
    } catch { /* ignore */ }
    setGenerating(false)
  }

  useEffect(() => {
    if (selectedDay && business?.id) generateIdeas()
  }, [selectedDay, business?.id])

  const worstDay = slowDays[0]
  const bestDay = slowDays[slowDays.length - 1]
  const gap = bestDay && worstDay ? bestDay.avg_revenue - worstDay.avg_revenue : 0

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Inter',sans-serif", padding: '24px 28px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Slow Day Filler</h1>
        <p style={{ fontSize: 13, color: C.muted }}>AI-generated promotions to boost your quietest days.</p>
      </div>

      {loading ? (
        <div style={{ color: C.muted, textAlign: 'center', padding: '60px 0' }}>Analysing your sales patterns...</div>
      ) : (
        <>

          <div style={{ position: 'relative', height: 200, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', padding: '16px', marginBottom: 20 }}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Average revenue by day</p>
            <canvas ref={chartRef} role="img" aria-label="Bar chart of average revenue by day of week" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Slowest day', value: worstDay?.day ?? '—', sub: worstDay ? 'A$' + Math.round(worstDay.avg_revenue) + ' avg' : '', color: C.red },
              { label: 'Busiest day', value: bestDay?.day ?? '—', sub: bestDay ? 'A$' + Math.round(bestDay.avg_revenue) + ' avg' : '', color: C.green },
              { label: 'Revenue gap', value: 'A$' + Math.round(gap), sub: 'per day potential uplift', color: C.amber },
            ].map(s => (
              <div key={s.label} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '16px 20px' }}>
                <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
            {/* Day selector */}
            <div>
              <p style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Select a day to boost</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {slowDays.map(d => {
                  const isSelected = selectedDay === d.day
                  const barW = d.vs_best
                  return (
                    <button key={d.day} onClick={() => setSelectedDay(d.day)}
                      style={{ background: isSelected ? 'rgba(139,92,246,0.12)' : C.card, border: '1px solid ' + (isSelected ? 'rgba(139,92,246,0.4)' : C.border), borderRadius: 10, padding: '12px 14px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: isSelected ? C.violet : C.text }}>{d.day}</span>
                        <span style={{ fontSize: 11, color: C.muted }}>A${Math.round(d.avg_revenue)}</span>
                      </div>
                      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                        <div style={{ height: 4, width: barW + '%', background: isSelected ? C.violet : (barW < 50 ? C.red : C.green), borderRadius: 2, transition: 'width 0.3s' }} />
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Promo ideas */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  AI Promo Ideas for {selectedDay}
                </p>
                <button onClick={generateIdeas} disabled={generating}
                  style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: generating ? 0.5 : 1 }}>
                  {generating ? '✨ Generating...' : '↻ Refresh ideas'}
                </button>
              </div>

              {generating ? (
                <div style={{ color: C.muted, textAlign: 'center', padding: '40px 0' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>✨</div>
                  Aria is crafting promotions for {selectedDay}...
                </div>
              ) : ideas.length === 0 ? (
                <div style={{ color: C.muted, textAlign: 'center', padding: '40px 0' }}>Select a day to see AI-generated promo ideas</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {ideas.map((idea, i) => (
                    <div key={i} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '16px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 18 }}>{CHANNEL_ICONS[idea.channel] ?? '🎯'}</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{idea.title}</span>
                          </div>
                          <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{idea.description}</p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: C.amber }}>{idea.discount}</div>
                          <div style={{ fontSize: 10, color: C.green, marginTop: 2 }}>+{idea.estimated_uplift}</div>
                        </div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, borderLeft: '3px solid ' + C.violet }}>
                        <p style={{ fontSize: 11, color: C.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Message template</p>
                        <p style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>{idea.message_template}</p>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => { navigator.clipboard.writeText(idea.message_template); setSentMsg('Copied!'); setTimeout(() => setSentMsg(null), 2000) }}
                          style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          📋 Copy message
                        </button>
                        <a href="/dashboard/social"
                          style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.1)', color: C.violet, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'inline-block' }}>
                          📱 Post to social
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {sentMsg && (
                <div style={{ position: 'fixed', bottom: 24, right: 24, background: C.green, color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>
                  {sentMsg}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
