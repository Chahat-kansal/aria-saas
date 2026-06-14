'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useCountUp } from '@/lib/anim/use-count-up'

const G = '#1D9E75'
const CARD: React.CSSProperties = { padding: '16px 20px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)', background: '#13131a' }
const LABEL: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)', marginBottom: 10 } as const

// ─── 1. Live Revenue Ticker ───────────────────────────────────────────────────
export function LiveRevenueTicker({ businessId }: { businessId: string }) {
  const [revenue, setRevenue] = useState(0)
  const [count, setCount] = useState(0)
  const [flash, setFlash] = useState(false)
  const prevRef = useRef(0)
  const today = new Date().toISOString().slice(0, 10)

  const poll = useCallback(async () => {
    try {
      const d = await fetch(`/api/pos/reports?from=${today}&to=${today}`).then(r => r.json())
      const rev: number = d.summary?.total_revenue ?? 0
      const cnt: number = d.summary?.transaction_count ?? 0
      if (prevRef.current > 0 && rev > prevRef.current) {
        setFlash(true)
        setTimeout(() => setFlash(false), 1500)
      }
      prevRef.current = rev
      setRevenue(rev)
      setCount(cnt)
    } catch (e) { console.error('[silent-catch]', e) }
  }, [today])

  useEffect(() => {
    poll()
    const id = setInterval(poll, 60_000)
    return () => clearInterval(id)
  }, [poll])

  // Supabase Realtime: update instantly on new sale
  useEffect(() => {
    if (!supabase || !businessId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (supabase as any)
      .channel(`sales-${businessId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'pos_sales',
        filter: `business_id=eq.${businessId}`,
      }, (payload: { new: { total_amount?: number } }) => {
        const amt = Number(payload.new?.total_amount ?? 0)
        setRevenue(prev => prev + amt)
        setCount(prev => prev + 1)
        setFlash(true)
        setTimeout(() => setFlash(false), 1500)
      })
      .subscribe()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return () => { (supabase as any).removeChannel(channel) }
  }, [businessId])

  const avg = count > 0 ? revenue / count : 0
  // AN-D spell 12 number-counter — animate revenue display value
  const revenueDisplay = useCountUp(revenue)

  return (
    <div style={{ ...CARD, border: `1px solid ${flash ? G : 'rgba(255,255,255,0.07)'}`, background: flash ? 'rgba(29,158,117,0.1)' : '#13131a', transition: 'all 0.4s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)' }}>Live revenue today</span>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: G, display: 'inline-block', animation: 'pulse 2s infinite' }} />
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: flash ? G : '#fff', transition: 'color 0.4s', lineHeight: 1 }}>
        A${revenueDisplay.toFixed(0)}
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
        {count} transaction{count !== 1 ? 's' : ''}{count > 0 ? ` · avg A$${avg.toFixed(0)}` : ''}
      </div>
    </div>
  )
}

// ─── 2. Three-Way Revenue Comparison ─────────────────────────────────────────
export function ThreeWayRevenue({ businessId }: { businessId: string }) {
  const [data, setData] = useState<{ today: number; yesterday: number; lastWeek: number } | null>(null)

  useEffect(() => {
    fetch('/api/pos/revenue-comparison')
      .then(r => r.json())
      .then((d: { today?: number; yesterday?: number; lastWeek?: number }) => setData({
        today: d.today ?? 0,
        yesterday: d.yesterday ?? 0,
        lastWeek: d.lastWeek ?? 0,
      }))
      .catch(() => {})
  }, [businessId])

  if (!data) return null

  const pctDiff = (a: number, b: number) => b > 0 ? Math.round(((a - b) / b) * 100) : null

  function RevCol({ label, value, compare, compareLabel }: { label: string; value: number; compare?: number; compareLabel?: string }) {
    const p = compare !== undefined ? pctDiff(value, compare) : null
    // AN-D spell 12 number-counter — animate KPI value
    const display = useCountUp(value)
    return (
      <div style={{ flex: 1, minWidth: 140, padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1 }}>A${display.toFixed(0)}</div>
        {p !== null && (
          <div style={{ fontSize: 11, marginTop: 6, color: p >= 0 ? G : '#f87171' }}>
            {p >= 0 ? '↑' : '↓'} {Math.abs(p)}% vs {compareLabel}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <p style={LABEL}>Revenue comparison</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <RevCol label="Today so far"        value={data.today}     compare={data.yesterday} compareLabel="yesterday" />
        <RevCol label="Same time yesterday" value={data.yesterday} />
        <RevCol label="Same day last week"  value={data.lastWeek} />
      </div>
    </div>
  )
}

// ─── 3. Hourly Revenue Heatmap ────────────────────────────────────────────────
export function HourlyHeatmap({ businessId }: { businessId: string }) {
  const [hourly, setHourly] = useState<Array<{ hour: number; avg: number }>>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/pos/hourly-heatmap')
      .then(r => r.json())
      .then((d: { hourly?: Array<{ hour: number; avg: number }> }) => {
        if (d.hourly) setHourly(d.hourly)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [businessId])

  if (!loaded) return null
  const max = Math.max(...hourly.map(h => h.avg), 1)

  return (
    <div style={CARD}>
      <p style={LABEL}>Hourly revenue heatmap — peak hours (30-day avg)</p>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 48 }}>
        {hourly.map(({ hour, avg }) => {
          const intensity = avg / max
          return (
            <div key={hour} title={`${hour}:00–${hour + 1}:00 avg A$${avg}`}
              style={{ flex: 1, borderRadius: '3px 3px 0 0', height: `${Math.max(8, intensity * 100)}%`, background: `rgba(127,184,151,${(0.1 + intensity * 0.9).toFixed(2)})` }} />
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        {['12am', '6am', '12pm', '6pm', '11pm'].map(l => (
          <span key={l} style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>{l}</span>
        ))}
      </div>
    </div>
  )
}

// ─── 4. Staff on Shift ────────────────────────────────────────────────────────
interface Shift { staff_name: string; clock_in: string; clock_out: string | null }

export function StaffOnShift({ businessId }: { businessId: string }) {
  const [staff, setStaff] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10)
    fetch(`/api/pos/timesheets?from=${today}`)
      .then(r => r.json())
      .then((d: { sessions?: Shift[] }) => setStaff((d.sessions ?? []).filter((s: Shift) => !s.clock_out)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    reload()
    const id = setInterval(reload, 5 * 60_000)
    return () => clearInterval(id)
  }, [reload])

  // Supabase Realtime for clock-in/out events
  useEffect(() => {
    if (!supabase || !businessId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (supabase as any)
      .channel(`timesheets-${businessId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pos_timesheets',
        filter: `business_id=eq.${businessId}`,
      }, () => { reload() })
      .subscribe()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return () => { (supabase as any).removeChannel(channel) }
  }, [businessId, reload])

  const elapsed = (t: string) => {
    const m = Math.floor((Date.now() - new Date(t).getTime()) / 60000)
    return `${Math.floor(m / 60)}h ${m % 60}m`
  }

  return (
    <div style={CARD}>
      {/* AN-E spell 17 activity-pulse: pulsing green dot on staff avatar (active on shift) */}
      <style>{`
        @keyframes anActivityPulse{0%,100%{box-shadow:0 0 0 0 rgba(29,158,117,.6)}50%{box-shadow:0 0 0 6px rgba(29,158,117,0)}}
        .an-activity-pulse{animation:anActivityPulse 1.8s ease-in-out infinite}
        @media (prefers-reduced-motion: reduce){.an-activity-pulse{animation:none!important}}
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={{ ...LABEL, marginBottom: 0 }}>Staff on shift</p>
        <span style={{ fontSize: 11, color: staff.length > 0 ? G : 'rgba(255,255,255,0.3)' }}>{staff.length} clocked in</span>
      </div>
      {loading ? (
        <div style={{ height: 32, background: 'rgba(255,255,255,0.06)', borderRadius: 8 }} />
      ) : staff.length === 0 ? (
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No staff clocked in</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {staff.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ position: 'relative', width: 32, height: 32, borderRadius: '50%', background: 'rgba(29,158,117,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: G, flexShrink: 0 }}>
                {s.staff_name.split(' ').map((n: string) => n[0] ?? '').join('').slice(0, 2).toUpperCase()}
                <span className="an-activity-pulse" style={{ position: 'absolute', bottom: -1, right: -1, width: 9, height: 9, borderRadius: '50%', background: G, border: '2px solid #13131a' }} aria-hidden />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>{s.staff_name}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{elapsed(s.clock_in)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 5. AI Action Items Strip ─────────────────────────────────────────────────
interface AriaAct { id: string; title: string; category: string; recommendation: string; priority: string; status: string }

export function AIActionStrip({ businessId }: { businessId: string }) {
  const [actions, setActions] = useState<AriaAct[]>([])
  const [dismissing, setDismissing] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/aria/actions?business_id=${businessId}`)
      .then(r => r.json())
      .then((d: { actions?: AriaAct[] }) => {
        setActions((d.actions ?? []).filter(a => a.status === 'pending').slice(0, 3))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [businessId])

  const dismiss = async (id: string) => {
    setDismissing(prev => new Set([...prev, id]))
    try {
      await fetch(`/api/aria/actions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ignored' }),
      })
      setActions(prev => prev.filter(a => a.id !== id))
    } finally {
      setDismissing(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  if (!loading && actions.length === 0) return (
    <div style={{ ...CARD, border: '1px solid rgba(29,158,117,0.15)' }}>
      <p style={{ fontSize: 12, color: G }}>✓ All clear — Aria has no urgent actions for you today</p>
    </div>
  )

  const catIcon: Record<string, string> = { customers: '👥', revenue: '💰', stock: '📦', reviews: '⭐', marketing: '📣', compliance: '✅' }

  return (
    <div>
      <p style={LABEL}>AI action items</p>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
        {loading ? [1, 2, 3].map(i => (
          <div key={i} style={{ minWidth: 220, height: 90, borderRadius: 14, background: 'rgba(255,255,255,0.04)', flexShrink: 0 }} />
        )) : actions.map(a => (
          <div key={a.id} style={{ minWidth: 220, maxWidth: 280, flexShrink: 0, padding: '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{catIcon[a.category] ?? '💡'} {a.title}</span>
              <button onClick={() => dismiss(a.id)} disabled={dismissing.has(a.id)}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1, flexShrink: 0 }}>✕</button>
            </div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, marginBottom: 10 }}>{a.recommendation}</p>
            <a href={`/dashboard/ask-aria?q=${encodeURIComponent(a.title)}`}
              style={{ fontSize: 11, fontWeight: 700, color: G, textDecoration: 'none' }}>Fix with Aria →</a>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── 6. Weather Widget ────────────────────────────────────────────────────────
function weatherInfo(code: number): [string, string] {
  if (code <= 1)  return ['☀️', 'Sunny']
  if (code <= 3)  return ['⛅', 'Cloudy']
  if (code <= 48) return ['🌫️', 'Foggy']
  if (code <= 67) return ['🌧️', 'Rainy']
  if (code <= 77) return ['🌨️', 'Snowy']
  return ['⛈️', 'Stormy']
}

export function WeatherWidget() {
  const [w, setW] = useState<{ code: number; rain: number } | null>(null)

  useEffect(() => {
    fetch('/api/weather?mode=forecast')
      .then(r => r.json())
      .then((d: { daily?: { weathercode: number[]; precipitation_probability_max: number[] } | null }) => {
        if (d.daily) setW({ code: d.daily.weathercode[1], rain: d.daily.precipitation_probability_max[1] })
      })
      .catch(() => {})
  }, [])

  if (!w) return null
  const [emoji, label] = weatherInfo(w.code)
  const isRainy = w.code >= 51

  return (
    <div style={CARD}>
      <p style={LABEL}>Tomorrow&apos;s forecast — Melbourne</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 28 }}>{emoji}</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{label}</div>
          <div style={{ fontSize: 11, marginTop: 3, color: isRainy ? '#f87171' : G }}>
            {isRainy
              ? `${w.rain}% rain chance — expect 15% lower foot traffic`
              : 'Good weather — foot traffic should be normal'}
          </div>
        </div>
      </div>
    </div>
  )
}
