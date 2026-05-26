'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

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
    } catch {}
  }, [today])

  useEffect(() => {
    poll()
    const id = setInterval(poll, 60_000)
    return () => clearInterval(id)
  }, [poll])

  const avg = count > 0 ? revenue / count : 0

  return (
    <div style={{ ...CARD, border: `1px solid ${flash ? G : 'rgba(255,255,255,0.07)'}`, background: flash ? 'rgba(29,158,117,0.1)' : '#13131a', transition: 'all 0.4s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)' }}>Live revenue today</span>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: G, display: 'inline-block' }} />
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: flash ? G : '#fff', transition: 'color 0.4s', lineHeight: 1 }}>
        A${revenue.toFixed(0)}
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
    const t  = new Date().toISOString().slice(0, 10)
    const y  = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const lw = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
    Promise.all([
      fetch(`/api/pos/reports?from=${t}&to=${t}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/pos/reports?from=${y}&to=${y}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/pos/reports?from=${lw}&to=${lw}`).then(r => r.json()).catch(() => ({})),
    ]).then(([a, b, c]) => setData({
      today:    a.summary?.total_revenue ?? 0,
      yesterday: b.summary?.total_revenue ?? 0,
      lastWeek:  c.summary?.total_revenue ?? 0,
    }))
  }, [businessId])

  if (!data) return null

  const pctDiff = (a: number, b: number) => b > 0 ? Math.round(((a - b) / b) * 100) : null

  function RevCol({ label, value, compare, compareLabel }: { label: string; value: number; compare?: number; compareLabel?: string }) {
    const p = compare !== undefined ? pctDiff(value, compare) : null
    return (
      <div style={{ flex: 1, minWidth: 140, padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1 }}>A${value.toFixed(0)}</div>
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
  const [hourly, setHourly] = useState<number[]>(Array(24).fill(0))
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch(`/api/pos/sales?business_id=${businessId}&limit=5000`)
      .then(r => r.json())
      .then((d: { sales?: Array<{ status?: string; created_at?: string; total_amount?: number }> }) => {
        const rev: number[] = Array(24).fill(0)
        const cnt: number[] = Array(24).fill(0)
        for (const s of (d.sales ?? []).filter(s => s.status !== 'voided')) {
          if (!s.created_at) continue
          const h = new Date(s.created_at).getHours()
          rev[h] += Number(s.total_amount ?? 0)
          cnt[h]++
        }
        setHourly(rev.map((r, i) => cnt[i] > 0 ? r / cnt[i] : 0))
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [businessId])

  if (!loaded) return null
  const max = Math.max(...hourly, 1)

  return (
    <div style={CARD}>
      <p style={LABEL}>Hourly revenue heatmap — peak hours (30-day avg)</p>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 48 }}>
        {hourly.map((v, h) => {
          const intensity = v / max
          return (
            <div key={h} title={`${h}:00 — avg A$${v.toFixed(0)}`}
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

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    fetch(`/api/pos/timesheets?from=${today}`)
      .then(r => r.json())
      .then((d: { sessions?: Shift[] }) => setStaff((d.sessions ?? []).filter((s: Shift) => !s.clock_out)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [businessId])

  const elapsed = (t: string) => {
    const m = Math.floor((Date.now() - new Date(t).getTime()) / 60000)
    return `${Math.floor(m / 60)}h ${m % 60}m`
  }

  return (
    <div style={CARD}>
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
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(29,158,117,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: G, flexShrink: 0 }}>
                {s.staff_name.split(' ').map((n: string) => n[0] ?? '').join('').slice(0, 2).toUpperCase()}
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
interface AriaAct { id: string; title: string; category: string; recommendation: string; priority: string }

export function AIActionStrip({ businessId }: { businessId: string }) {
  const [actions, setActions] = useState<AriaAct[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const stored: string[] = JSON.parse(localStorage.getItem('aria_dash_dismissed') ?? '[]')
      setDismissed(new Set(stored))
    } catch {}
    fetch(`/api/aria/actions?business_id=${businessId}`)
      .then(r => r.json())
      .then((d: { actions?: AriaAct[] }) => {
        setActions((d.actions ?? []).slice(0, 3))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [businessId])

  const dismiss = (id: string) => {
    const next = new Set([...dismissed, id])
    setDismissed(next)
    try { localStorage.setItem('aria_dash_dismissed', JSON.stringify([...next])) } catch {}
  }

  const visible = actions.filter(a => !dismissed.has(a.id))
  if (!loading && visible.length === 0) return null

  const catIcon: Record<string, string> = { customers: '👥', revenue: '💰', stock: '📦', reviews: '⭐', marketing: '📣', compliance: '✅' }

  return (
    <div>
      <p style={LABEL}>AI action items</p>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
        {loading ? [1, 2, 3].map(i => (
          <div key={i} style={{ minWidth: 220, height: 90, borderRadius: 14, background: 'rgba(255,255,255,0.04)', flexShrink: 0 }} />
        )) : visible.map(a => (
          <div key={a.id} style={{ minWidth: 220, maxWidth: 280, flexShrink: 0, padding: '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{catIcon[a.category] ?? '💡'} {a.title}</span>
              <button onClick={() => dismiss(a.id)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1, flexShrink: 0 }}>✕</button>
            </div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, marginBottom: 10 }}>{a.recommendation}</p>
            <a href={`/dashboard/ask-aria?q=${encodeURIComponent(a.title)}`}
              style={{ fontSize: 11, fontWeight: 700, color: G, textDecoration: 'none' }}>Do it →</a>
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
    fetch('https://api.open-meteo.com/v1/forecast?latitude=-37.8136&longitude=144.9631&daily=weathercode,precipitation_probability_max&timezone=Australia%2FMelbourne&forecast_days=2')
      .then(r => r.json())
      .then((d: { daily: { weathercode: number[]; precipitation_probability_max: number[] } }) => {
        setW({ code: d.daily.weathercode[1], rain: d.daily.precipitation_probability_max[1] })
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
