'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface DayForecast {
  date: string; day: string; revenue_actual: number | null; revenue_forecast: number
  expenses_actual: number | null; expenses_forecast: number
  net: number; cumulative: number; is_past: boolean
}

const C = {
  bg:'var(--bg-base)', card:'var(--bg-surface)', text:'var(--text-primary)',
  muted:'var(--text-secondary)', dim:'var(--text-tertiary)',
  green:'#22C55E', red:'#EF4444', amber:'#F59E0B', violet:'#8B5CF6',
  border:'rgba(255,255,255,0.07)',
}
function fmt(n: number) { return ('A$' + Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits:0, maximumFractionDigits:0 + ')}') }

export default function CashFlowPage() {
  const { business } = useBusinessContext()
  const [days, setDays] = useState<DayForecast[]>([])
  const [loading, setLoading] = useState(true)
  const [horizon, setHorizon] = useState(30)
  const [scenario, setScenario] = useState<'base'|'optimistic'|'pessimistic'>('base')
  const [view, setView] = useState<'chart'|'table'>('chart')
  const chartRef = useRef<HTMLCanvasElement>(null)
  const chartInstance = useRef<unknown>(null)

  const SCENARIO_MULT = { base: 1, optimistic: 1.2, pessimistic: 0.75 }

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    try {
      const salesRes = await fetch(('/api/pos/sales?business_id=' + business.id + '&limit=500'))
      const salesData = await salesRes.json() as { sales?: Array<{ created_at:string; total_amount:number; status:string }> }
      const sales = (salesData.sales ?? []).filter(s => s.status !== 'voided')

      const revenueByDate: Record<string, number> = {}
      for (const s of sales) {
        const d = s.created_at?.split('T')[0]
        if (d) revenueByDate[d] = (revenueByDate[d] ?? 0) + Number(s.total_amount ?? 0)
      }
      const dowAvg: number[] = [0,1,2,3,4,5,6].map(dow => {
        const entries = Object.entries(revenueByDate).filter(([d]) => new Date(d).getDay() === dow)
        if (!entries.length) return 0
        return entries.reduce((s, [,v]) => s + v, 0) / entries.length
      })
      const mult = SCENARIO_MULT[scenario]
      const today = new Date()
      const forecastDays: DayForecast[] = []
      let cumulative = 0
      for (let i = -7; i < horizon; i++) {
        const d = new Date(today); d.setDate(today.getDate() + i)
        const dateStr = d.toISOString().split('T')[0]
        const dow = d.getDay()
        const isPast = i < 0
        const actual = revenueByDate[dateStr] ?? null
        const avgRevenue = (Object.values(revenueByDate).reduce((a,b)=>a+b,0) / Math.max(Object.keys(revenueByDate).length,1))
        const baseRevenue = dowAvg[dow] || avgRevenue
        const forecast = baseRevenue * mult
        const estExpenses = forecast * 0.68
        const net = (actual ?? forecast) - estExpenses
        cumulative += net
        forecastDays.push({ date: dateStr, day: d.toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' }), revenue_actual: isPast ? (actual ?? 0) : null, revenue_forecast: Math.round(forecast), expenses_forecast: Math.round(estExpenses), expenses_actual: null, net: Math.round(net), cumulative: Math.round(cumulative), is_past: isPast })
      }
      setDays(forecastDays)
    } catch { /* ignore */ }
    setLoading(false)
  }, [business?.id, horizon, scenario])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (view !== 'chart' || !chartRef.current || days.length === 0) return
    const win = window as unknown as Record<string,unknown>
    function buildChart() {
      if (!(win.Chart as unknown)) return
      const ChartJS = win.Chart as { new(el: HTMLCanvasElement, cfg: unknown): unknown; instances?: Record<string, {destroy():void}> }
      if (chartInstance.current) { (chartInstance.current as {destroy():void}).destroy() }
      const labels = days.map(d => d.day)
      const actuals = days.map(d => d.revenue_actual)
      const forecasts = days.map(d => d.revenue_forecast)
      const cumul = days.map(d => d.cumulative)
      chartInstance.current = new ChartJS(chartRef.current!, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { type: 'bar', label: 'Actual Revenue', data: actuals, backgroundColor: 'rgba(34,197,94,0.7)', borderRadius: 4, order: 2 },
            { type: 'bar', label: 'Forecast Revenue', data: forecasts, backgroundColor: 'rgba(139,92,246,0.4)', borderRadius: 4, order: 3 },
            { type: 'line', label: 'Cumulative Net', data: cumul, borderColor: '#F59E0B', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.4, yAxisID: 'y2', order: 1 },
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 9 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 14 }, grid: { color: 'rgba(255,255,255,0.04)' } },
            y: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 9 }, callback: (v: number) => ('$' + Math.round(v/1000) + 'k') }, grid: { color: 'rgba(255,255,255,0.04)' } },
            y2: { position: 'right', ticks: { color: '#F59E0B', font: { size: 9 }, callback: (v: number) => ('$' + Math.round(v/1000) + 'k') }, grid: { drawOnChartArea: false } },
          }
        }
      })
    }
    if (win.Chart) { buildChart() } else {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
      s.onload = buildChart
      document.head.appendChild(s)
    }
  }, [days, view])

  const totalForecastRevenue = days.filter(d=>!d.is_past).reduce((s,d)=>s+d.revenue_forecast,0)
  const totalActualRevenue = days.filter(d=>d.is_past).reduce((s,d)=>s+(d.revenue_actual??0),0)
  const netPosition = days[days.length-1]?.cumulative ?? 0

  return (
    <div style={{minHeight:'100%', background:C.bg, color:C.text, fontFamily:"'Inter',sans-serif", padding:'24px 28px'}}>
      <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12}}>
        <div>
          <h1 style={{fontSize:22, fontWeight:700, marginBottom:4}}>Cash Flow Forecast</h1>
          <p style={{fontSize:13, color:C.muted}}>Revenue forecast based on your historical sales patterns.</p>
        </div>
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          {(['base','optimistic','pessimistic'] as const).map(s => (
            <button key={s} onClick={()=>setScenario(s)}
              style={{padding:'6px 12px', borderRadius:8, border:('1px solid ' + scenario===s?(s==='optimistic'?C.green:s==='pessimistic'?C.red:C.violet):C.border), background:scenario===s?(s==='optimistic'?C.green:s==='pessimistic'?C.red:C.violet + '20'):'transparent', color:scenario===s?(s==='optimistic'?C.green:s==='pessimistic'?C.red:C.violet):C.muted, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', textTransform:'capitalize'}}>
              {s}
            </button>
          ))}
          <div style={{width:1, background:C.border, margin:'0 4px'}} />
          {(['chart','table'] as const).map(v => (
            <button key={v} onClick={()=>setView(v)}
              style={{padding:'6px 12px', borderRadius:8, border:('1px solid ' + view===v?C.violet:C.border), background:view===v?'rgba(139,92,246,0.1)':'transparent', color:view===v?C.violet:C.muted, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', textTransform:'capitalize'}}>
              {v}
            </button>
          ))}
          {([14,30,60] as const).map(h => (
            <button key={h} onClick={()=>setHorizon(h)}
              style={{padding:'6px 12px', borderRadius:8, border:'1px solid ${horizon===h?C.amber:C.border}', background:horizon===h?'rgba(245,158,11,0.1)':'transparent', color:horizon===h?C.amber:C.muted, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>
              {h}d
            </button>
          ))}
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:24}}>
        {[
          { label:'Last 7 days actual', value:fmt(totalActualRevenue), color:C.green },
          { label:('Next ' + horizon + 'd forecast'), value:fmt(totalForecastRevenue), color:C.violet },
          { label:'Projected net position', value:(netPosition>=0?'+':'')+fmt(netPosition), color:netPosition>=0?C.green:C.red },
        ].map(s => (
          <div key={s.label} style={{background:C.card, border:('1px solid ' + C.border), borderRadius:12, padding:'16px 20px'}}>
            <div style={{fontSize:11, color:C.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6}}>{s.label}</div>
            <div style={{fontSize:26, fontWeight:700, color:s.color}}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Custom legend */}
      {view === 'chart' && (
        <div style={{display:'flex', gap:16, marginBottom:12, flexWrap:'wrap'}}>
          {[
            { color:'rgba(34,197,94,0.7)', label:'Actual revenue' },
            { color:'rgba(139,92,246,0.4)', label:'Forecast revenue' },
            { color:'#F59E0B', label:'Cumulative net', line:true },
          ].map(l => (
            <span key={l.label} style={{display:'flex', alignItems:'center', gap:6, fontSize:11, color:C.muted}}>
              <span style={{width:l.line?24:10, height:l.line?2:10, borderRadius:l.line?0:2, background:l.color, display:'inline-block'}} />
              {l.label}
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{color:C.muted, textAlign:'center', padding:'60px 0'}}>Calculating…</div>
      ) : view === 'chart' ? (
        <div style={{position:'relative', height:320, background:C.card, borderRadius:12, border:('1px solid ' + C.border), padding:'16px'}}>
          <canvas ref={chartRef} role="img" aria-label="Cash flow forecast chart showing actual and forecast revenue with cumulative net position" />
        </div>
      ) : (
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%', borderCollapse:'collapse', fontSize:12}}>
            <thead>
              <tr style={{borderBottom:('1px solid ' + C.border)}}>
                {['Date','Actual Revenue','Forecast','Est. Costs','Daily Net','Cumulative'].map(h => (
                  <th key={h} style={{padding:'8px 12px', textAlign:'left', color:C.dim, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', fontSize:10}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d, i) => {
                const isToday = !d.is_past && i === 7
                return (
                  <tr key={d.date} style={{borderBottom:('1px solid ' + C.border), background:isToday?'rgba(139,92,246,0.05)':'transparent'}}>
                    <td style={{padding:'8px 12px', fontWeight:isToday?700:400, color:isToday?C.violet:C.text}}>
                      {isToday && <span style={{fontSize:9, fontWeight:800, color:C.violet, marginRight:6, background:'rgba(139,92,246,0.15)', padding:'1px 5px', borderRadius:4}}>TODAY</span>}
                      {d.day}
                    </td>
                    <td style={{padding:'8px 12px', color:d.revenue_actual!=null?C.green:C.dim}}>{d.revenue_actual!=null?fmt(d.revenue_actual):'—'}</td>
                    <td style={{padding:'8px 12px', color:C.muted}}>{fmt(d.revenue_forecast)}</td>
                    <td style={{padding:'8px 12px', color:C.red}}>−{fmt(d.expenses_forecast)}</td>
                    <td style={{padding:'8px 12px', color:d.net>=0?C.green:C.red, fontWeight:600}}>{d.net>=0?'+':''}{fmt(d.net)}</td>
                    <td style={{padding:'8px 12px', color:d.cumulative>=0?C.green:C.red, fontWeight:700}}>{d.cumulative>=0?'+':''}{fmt(d.cumulative)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{marginTop:20, padding:'12px 16px', background:'rgba(255,255,255,0.02)', borderRadius:10, fontSize:11, color:C.dim}}>
        Scenarios: <b style={{color:C.green}}>Optimistic</b> +20%, <b style={{color:C.amber}}>Base</b> historical average, <b style={{color:C.red}}>Pessimistic</b> -25%. Expenses estimated at 68% of revenue.
      </div>
    </div>
  )
}
