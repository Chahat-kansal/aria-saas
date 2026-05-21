'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface DayForecast {
  date: string
  day: string
  revenue_actual: number | null
  revenue_forecast: number
  expenses_actual: number | null
  expenses_forecast: number
  net: number
  cumulative: number
  is_past: boolean
}

const C = {
  bg:'var(--bg-base)', card:'var(--bg-surface)', text:'var(--text-primary)',
  muted:'var(--text-secondary)', dim:'var(--text-tertiary)',
  green:'#22C55E', red:'#EF4444', amber:'#F59E0B', violet:'#8B5CF6',
  border:'rgba(255,255,255,0.07)',
}

function fmt(n: number) { return `A$${Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits:0, maximumFractionDigits:0 })}` }

export default function CashFlowPage() {
  const { business } = useBusinessContext()
  const [days, setDays] = useState<DayForecast[]>([])
  const [loading, setLoading] = useState(true)
  const [horizon, setHorizon] = useState(30)

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    try {
      // Fetch last 90 days of sales for trend
      const [salesRes, expenseRes] = await Promise.all([
        fetch(`/api/pos/sales?business_id=${business.id}&limit=500`),
        fetch(`/api/pos/cash-sessions?business_id=${business.id}`),
      ])
      const salesData = await salesRes.json() as { sales?: Array<{ created_at:string; total_amount:number }> }
      const sales = salesData.sales ?? []

      // Build daily revenue actuals (last 30 days)
      const revenueByDate: Record<string, number> = {}
      for (const s of sales) {
        const d = s.created_at?.split('T')[0]
        if (d) revenueByDate[d] = (revenueByDate[d] ?? 0) + Number(s.total_amount ?? 0)
      }

      // Calculate 7-day rolling average per day-of-week
      const dowAvg: number[] = [0,0,0,0,0,0,0].map((_, dow) => {
        const entries = Object.entries(revenueByDate).filter(([d]) => new Date(d).getDay() === dow)
        if (!entries.length) return 0
        return entries.reduce((s, [,v]) => s + v, 0) / entries.length
      })

      // Generate forecast days
      const today = new Date()
      const forecastDays: DayForecast[] = []
      let cumulative = 0

      for (let i = -7; i < horizon; i++) {
        const d = new Date(today)
        d.setDate(today.getDate() + i)
        const dateStr = d.toISOString().split('T')[0]
        const dow = d.getDay()
        const isPast = i < 0
        const isToday = i === 0

        const actual = revenueByDate[dateStr] ?? null
        const forecast = dowAvg[dow] || (Object.values(revenueByDate).reduce((a,b)=>a+b,0) / Math.max(Object.keys(revenueByDate).length,1))
        const estExpenses = forecast * 0.7 // rough estimate: 70% of revenue as costs
        const net = (actual ?? forecast) - estExpenses
        cumulative += net

        forecastDays.push({
          date: dateStr,
          day: d.toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' }),
          revenue_actual: isPast ? (actual ?? 0) : isToday ? actual : null,
          revenue_forecast: forecast,
          expenses_forecast: estExpenses,
          expenses_actual: null,
          net: Math.round(net),
          cumulative: Math.round(cumulative),
          is_past: isPast,
        })
      }

      setDays(forecastDays)
    } catch { /* ignore */ }
    setLoading(false)
  }, [business?.id, horizon])

  useEffect(() => { load() }, [load])

  const totalForecastRevenue = days.filter(d=>!d.is_past).reduce((s,d)=>s+d.revenue_forecast,0)
  const totalActualRevenue = days.filter(d=>d.is_past).reduce((s,d)=>s+(d.revenue_actual??0),0)
  const netPosition = days[days.length-1]?.cumulative ?? 0

  return (
    <div style={{minHeight:'100%', background:C.bg, color:C.text, fontFamily:"'Manrope',sans-serif", padding:'24px 28px'}}>
      <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8}}>
        <div>
          <h1 style={{fontSize:22, fontWeight:800, marginBottom:4}}>Cash Flow Forecast</h1>
          <p style={{fontSize:13, color:C.muted}}>Revenue forecast based on your sales history by day-of-week. Expenses estimated at 70% of revenue.</p>
        </div>
        <div style={{display:'flex', gap:8}}>
          {[14,30,60].map(h => (
            <button key={h} onClick={()=>setHorizon(h)}
              style={{padding:'7px 14px', borderRadius:8, border:`1px solid ${horizon===h?C.violet:C.border}`, background:horizon===h?'rgba(139,92,246,0.1)':'transparent', color:horizon===h?C.violet:C.muted, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>
              {h}d
            </button>
          ))}
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:24}}>
        {[
          { label:`Last 7 days revenue`, value:fmt(totalActualRevenue), color:C.green, sub:'Actual' },
          { label:`Next ${horizon} days forecast`, value:fmt(totalForecastRevenue), color:C.violet, sub:'Projected' },
          { label:'Net cash position', value:(netPosition>=0?'+':'')+fmt(netPosition), color:netPosition>=0?C.green:C.red, sub:'After estimated costs' },
        ].map(s => (
          <div key={s.label} style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:'16px 20px'}}>
            <div style={{fontSize:11, color:C.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6}}>{s.label}</div>
            <div style={{fontSize:24, fontWeight:800, color:s.color}}>{s.value}</div>
            <div style={{fontSize:11, color:C.dim, marginTop:4}}>{s.sub}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{color:C.muted, textAlign:'center', padding:'40px 0'}}>Calculating…</div>
      ) : (
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%', borderCollapse:'collapse', fontSize:12}}>
            <thead>
              <tr style={{borderBottom:`1px solid ${C.border}`}}>
                {['Date','Revenue','Forecast','Est. Costs','Net','Cumulative'].map(h => (
                  <th key={h} style={{padding:'8px 12px', textAlign:'left', color:C.dim, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', fontSize:10}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d, i) => {
                const isToday = !d.is_past && i === 7
                return (
                  <tr key={d.date} style={{borderBottom:`1px solid ${C.border}`, background:isToday?'rgba(139,92,246,0.05)':'transparent'}}>
                    <td style={{padding:'8px 12px', fontWeight:isToday?700:400, color:isToday?C.violet:C.text}}>
                      {isToday && <span style={{fontSize:9, fontWeight:800, color:C.violet, marginRight:6}}>TODAY</span>}
                      {d.day}
                    </td>
                    <td style={{padding:'8px 12px', color:d.revenue_actual!=null?C.green:C.dim}}>
                      {d.revenue_actual!=null ? fmt(d.revenue_actual) : '—'}
                    </td>
                    <td style={{padding:'8px 12px', color:C.muted}}>{fmt(d.revenue_forecast)}</td>
                    <td style={{padding:'8px 12px', color:C.red}}>−{fmt(d.expenses_forecast)}</td>
                    <td style={{padding:'8px 12px', color:d.net>=0?C.green:C.red, fontWeight:600}}>
                      {d.net>=0?'+':''}{fmt(d.net)}
                    </td>
                    <td style={{padding:'8px 12px', color:d.cumulative>=0?C.green:C.red, fontWeight:700}}>
                      {d.cumulative>=0?'+':''}{fmt(d.cumulative)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{marginTop:20, padding:'12px 16px', background:'rgba(255,255,255,0.03)', borderRadius:10, fontSize:11, color:C.dim}}>
        💡 Forecast is based on your average revenue by day-of-week from historical sales. Expenses are estimated at 70% of revenue — update when you have actual cost data. Connect Xero for real expense tracking.
      </div>
    </div>
  )
}
