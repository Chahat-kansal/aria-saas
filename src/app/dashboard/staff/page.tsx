'use client'
import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { StaffMember } from '@/types/staff'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

const G = '#7FB897', G2 = '#1D9E75'
const card: React.CSSProperties = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 16 }
const tabBtnStyle = (a: boolean): React.CSSProperties => ({ padding: '6px 16px', borderRadius: 7, border: `1px solid ${a ? 'rgba(127,184,151,0.4)' : 'rgba(255,255,255,0.08)'}`, background: a ? 'rgba(127,184,151,0.1)' : 'transparent', color: a ? G : 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' })
const smBtn = (c = G2): React.CSSProperties => ({ padding: '4px 12px', borderRadius: 6, border: `1px solid ${c}44`, background: `${c}15`, color: c, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' })
const inp: React.CSSProperties = { padding: '6px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e8ede7', fontSize: 12, fontFamily: 'inherit' }

type Tab = 'schedule' | 'timesheets' | 'performance' | 'leave' | 'team'

interface MR extends StaffMember {
  staff_member_skills?: Array<{ staff_skills: { name: string; color: string } | null }>
}
interface TS { id: string; staff_name: string; clock_in: string; clock_out: string | null; total_minutes: number | null; pay_rate_cents?: number; approved: boolean; status: string }
interface Shift { id: string; staff_name: string | null; shift_date: string; start_time: string; end_time: string; role: string; ai_generated: boolean }
interface LR { id: string; staff_name: string | null; leave_type: string; start_date: string; end_date: string; notes: string | null; status: string }
interface FD { day: string; date: string; predicted_revenue: number; recommended_staff: number }
interface PerfRow { name: string; revenue: number; count: number; hours: number }
interface RosterShift { staff_id: string; staff_name: string; date: string; start_time: string; end_time: string; break_minutes?: number; role?: string; hours?: number; cost_cents?: number }
interface Roster { id: string; week_starting: string; status: string; shifts: RosterShift[]; total_hours: number; total_cost_cents: number; aria_reasoning?: string }

const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4']
const ini = (n: string) => n.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2)
const avatarBg = (n: string) => COLORS[(n.charCodeAt(0) ?? 0) % COLORS.length]
const fmtTime = (ts: string) => ts?.includes('T') ? ts.slice(11, 16) : (ts?.slice(0, 5) ?? '--:--')
const fmtHrs = (m: number | null) => m == null ? '—' : `${Math.floor(m / 60)}h ${m % 60}m`
const monOfWeek = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10) }

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return <div style={{ width: size, height: size, borderRadius: '50%', background: avatarBg(name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{ini(name)}</div>
}

function LiveWidget({ bid }: { bid: string }) {
  const [active, setActive] = useState<TS[]>([])
  useEffect(() => {
    if (!bid) return
    const load = () => { const t = new Date().toISOString().slice(0, 10); fetch(`/api/pos/timesheets?from=${t}T00:00:00&to=${t}T23:59:59`).then(r => r.json()).then(d => setActive((d.sessions ?? []).filter((s: TS) => !s.clock_out))).catch(() => {}) }
    load(); const iv = setInterval(load, 120000); return () => clearInterval(iv)
  }, [bid])
  return (
    <div style={{ background: 'rgba(29,158,117,0.05)', border: '1px solid rgba(29,158,117,0.15)', borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
      <span style={{ fontSize: 11, color: G, fontWeight: 700, letterSpacing: '0.06em' }}>ON SHIFT</span>
      {active.length === 0
        ? <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No staff currently clocked in</span>
        : active.map(t => { const m = Math.floor((Date.now() - new Date(t.clock_in).getTime()) / 60000); return (<div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Avatar name={t.staff_name} size={24} /><span style={{ fontSize: 12 }}>{t.staff_name}</span><span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{Math.floor(m / 60)}h {m % 60}m</span></div>) })}
    </div>
  )
}

function ClockWidget({ bid }: { bid: string }) {
  const [name, setName] = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('aria-clock-name') ?? '' : ''))
  const [active, setActive] = useState<{ id: string; clock_in: string } | null>(null)
  const [working, setWorking] = useState(false)
  const [msg, setMsg] = useState('')
  const [todayMins, setTodayMins] = useState(0)

  const load = useCallback(async () => {
    if (!bid || !name.trim()) return
    const today = new Date().toISOString().slice(0, 10)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    const r = await fetch(`/api/pos/timesheets?from=${today}T00:00:00&to=${tomorrow}T00:00:00`).then(r => r.json()).catch(() => ({ sessions: [] }))
    const mine = ((r.sessions ?? []) as TS[]).filter(s => (s.staff_name ?? '').toLowerCase() === name.trim().toLowerCase())
    const open = mine.find(s => !s.clock_out)
    setActive(open ? { id: open.id, clock_in: open.clock_in } : null)
    const completed = mine.filter(s => s.clock_out)
    let mins = completed.reduce((sum, s) => sum + (s.total_minutes ?? 0), 0)
    if (open) mins += Math.floor((Date.now() - new Date(open.clock_in).getTime()) / 60000)
    setTodayMins(mins)
  }, [bid, name])

  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id) }, [load])

  async function clockIn() {
    if (!name.trim()) { setMsg('Enter your name first'); return }
    if (typeof window !== 'undefined') localStorage.setItem('aria-clock-name', name.trim())
    setWorking(true); setMsg('')
    const r = await fetch('/api/pos/timesheets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staff_name: name.trim() }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) setMsg(d.error ?? 'Could not clock in')
    else { setMsg('Clocked in'); setTimeout(() => setMsg(''), 1800) }
    setWorking(false); load()
  }
  async function clockOut() {
    if (!active) return
    setWorking(true); setMsg('')
    const r = await fetch('/api/pos/timesheets', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: active.id }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) setMsg(d.error ?? 'Could not clock out')
    else { setMsg('Clocked out'); setTimeout(() => setMsg(''), 1800) }
    setWorking(false); load()
  }

  return (
    <div style={{ background: active ? 'rgba(127,184,151,0.06)' : 'rgba(255,255,255,0.02)', border: '1px solid ' + (active ? 'rgba(127,184,151,0.25)' : 'rgba(255,255,255,0.06)'), borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
      <span style={{ fontSize: 11, color: active ? G : 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.06em' }}>{active ? 'CLOCKED IN' : 'CLOCK IN/OUT'}</span>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
        style={{ ...inp, width: 160, height: 28, padding: '4px 10px' }} />
      {active ? (
        <button onClick={clockOut} disabled={working} style={{ ...smBtn('#ef4444'), opacity: working ? 0.5 : 1 }}>
          {working ? '…' : 'Clock out'}
        </button>
      ) : (
        <button onClick={clockIn} disabled={working || !name.trim()} style={{ ...smBtn(G2), opacity: (working || !name.trim()) ? 0.5 : 1 }}>
          {working ? '…' : 'Clock in'}
        </button>
      )}
      {todayMins > 0 && (
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>Today: <strong style={{ color: '#e8ede7' }}>{Math.floor(todayMins / 60)}h {todayMins % 60}m</strong></span>
      )}
      {msg && <span style={{ fontSize: 11, color: msg.includes('not') || msg.includes('Could') ? '#ef4444' : G }}>{msg}</span>}
    </div>
  )
}

function LabourMetrics({ bid }: { bid: string }) {
  const [d, setD] = useState({ labour: 0, revenue: 0, hours: 0 })
  useEffect(() => {
    if (!bid) return
    const mon = monOfWeek(); const sun = new Date(mon + 'T00:00:00'); sun.setDate(sun.getDate() + 6); const sunStr = sun.toISOString().slice(0, 10)
    Promise.all([
      fetch(`/api/pos/timesheets?from=${mon}T00:00:00&to=${sunStr}T23:59:59`).then(r => r.json()),
      fetch(`/api/pos/sales?business_id=${bid}&since=${mon}T00:00:00&limit=1000`).then(r => r.json()),
    ]).then(([ts, sl]) => {
      const done: TS[] = (ts.sessions ?? []).filter((s: TS) => s.clock_out)
      const labour = done.reduce((s, t) => s + ((t.total_minutes ?? 0) / 60) * ((t.pay_rate_cents ?? 2500) / 100), 0)
      const hours = done.reduce((s, t) => s + (t.total_minutes ?? 0) / 60, 0)
      const revenue = (sl.sales ?? []).reduce((s: number, x: Record<string, unknown>) => s + Number(x.total_amount ?? 0), 0)
      setD({ labour, revenue, hours })
    }).catch(() => {})
  }, [bid])
  const ratio = d.revenue > 0 ? (d.labour / d.revenue) * 100 : 0
  const rc = ratio < 30 ? '#10b981' : ratio < 40 ? '#f59e0b' : '#ef4444'
  const metrics: [string, string, string][] = [['Labour cost (wk)', `$${d.labour.toFixed(0)}`, G], ['Revenue (wk)', `$${d.revenue.toFixed(0)}`, G], ['Hours worked', `${d.hours.toFixed(1)}h`, G], ['Labour ratio', `${ratio.toFixed(1)}%`, rc]]
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
      {metrics.map(([label, val, color]) => (
        <div key={label} style={{ flex: 1, minWidth: 110, ...card, padding: '12px 14px' }}>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
          <p style={{ fontSize: 18, fontWeight: 700, color }}>{val}</p>
          {label === 'Labour ratio' && <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Benchmark 25–35%</p>}
        </div>
      ))}
    </div>
  )
}

function ScheduleTab({ bid }: { bid: string }) {
  const [ws, setWs] = useState(monOfWeek)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [forecast, setForecast] = useState<FD[]>([])
  const [suggested, setSuggested] = useState<Array<Record<string, string>>>([])
  const [aiLoading, setAiLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [addForm, setAddForm] = useState<{ date: string; staff_name: string; start_time: string; end_time: string; role: string } | null>(null)

  const weekDates = Array.from({ length: 7 }, (_, i) => { const d = new Date(ws + 'T00:00:00'); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10) })
  const DS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const load = useCallback(() => {
    fetch(`/api/pos/staff-shifts?from=${weekDates[0]}&to=${weekDates[6]}`).then(r => r.json()).then(d => setShifts(d.shifts ?? [])).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekDates[0], weekDates[6]])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (bid) load() }, [bid, ws])

  const navWeek = (n: number) => { const d = new Date(ws + 'T00:00:00'); d.setDate(d.getDate() + n * 7); setWs(d.toISOString().slice(0, 10)) }

  async function autoSchedule() {
    setAiLoading(true); setMsg('')
    const r = await fetch('/api/aria/staff-schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bid }) })
    const data = await r.json()
    setForecast(data.forecast ?? []); setSuggested(data.suggested_shifts ?? [])
    setMsg(data.suggested_shifts?.length ? `AI suggests ${data.suggested_shifts.length} shifts — confirm to save.` : 'No suggestions generated.')
    setAiLoading(false)
  }

  async function confirmSchedule() {
    await fetch('/api/pos/staff-shifts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(suggested.map(s => ({ ...s, ai_generated: true }))) })
    setSuggested([]); setMsg('Schedule saved!'); load()
  }

  async function saveShift() {
    if (!addForm?.date || !addForm.start_time || !addForm.end_time || !addForm.staff_name) return
    await fetch('/api/pos/staff-shifts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staff_name: addForm.staff_name, shift_date: addForm.date, start_time: addForm.start_time, end_time: addForm.end_time, role: addForm.role || 'staff' }) })
    setAddForm(null); load()
  }

  const byDate = weekDates.reduce((a, date) => { a[date] = shifts.filter(s => s.shift_date === date); return a }, {} as Record<string, Shift[]>)

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={() => navWeek(-1)} style={smBtn()}>‹ Prev</button>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{weekDates[0]} – {weekDates[6]}</span>
        <button onClick={() => navWeek(1)} style={smBtn()}>Next ›</button>
        <button onClick={autoSchedule} disabled={aiLoading} style={{ ...smBtn(G2), padding: '6px 14px', fontSize: 12 }}>{aiLoading ? 'Generating…' : '✦ Auto-schedule this week'}</button>
        {suggested.length > 0 && <button onClick={confirmSchedule} style={{ ...smBtn(G), padding: '6px 14px', fontSize: 12 }}>Confirm {suggested.length} shifts</button>}
      </div>
      {msg && <p style={{ fontSize: 12, color: G, marginBottom: 10 }}>{msg}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 20 }}>
        {weekDates.map((date, i) => (
          <div key={date} style={{ ...card, padding: 8, minHeight: 90 }}>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{DS[i]}<br /><strong style={{ color: '#e8ede7', fontSize: 13 }}>{date.slice(8)}</strong></p>
            {(byDate[date] ?? []).map(s => (
              <div key={s.id} style={{ background: s.ai_generated ? 'rgba(127,184,151,0.08)' : 'rgba(99,102,241,0.08)', borderLeft: `2px solid ${s.ai_generated ? G : '#6366f1'}`, borderRadius: 4, padding: '3px 6px', marginBottom: 3 }}>
                <p style={{ fontSize: 10, fontWeight: 600, color: '#e8ede7', margin: 0 }}>{s.staff_name ?? '?'}</p>
                <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', margin: 0 }}>{fmtTime(s.start_time)}–{fmtTime(s.end_time)}</p>
                <button onClick={() => fetch(`/api/pos/staff-shifts?id=${s.id}`, { method: 'DELETE' }).then(load)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', fontSize: 10, padding: 0 }}>✕</button>
              </div>
            ))}
            {suggested.filter(s => s.shift_date === date).map((s, j) => (
              <div key={j} style={{ background: 'rgba(245,158,11,0.08)', borderLeft: '2px dashed #f59e0b', borderRadius: 4, padding: '3px 6px', marginBottom: 3 }}>
                <p style={{ fontSize: 10, fontWeight: 600, color: '#f59e0b', margin: 0 }}>{s.staff_name} (AI)</p>
                <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', margin: 0 }}>{s.start_time}–{s.end_time}</p>
              </div>
            ))}
            <button onClick={() => setAddForm({ date, staff_name: '', start_time: '09:00', end_time: '17:00', role: 'staff' })} style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4 }}>+ add</button>
          </div>
        ))}
      </div>
      {addForm && (
        <div style={{ ...card, marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Add shift for {addForm.date}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {(['staff_name:Name', 'start_time:Start (HH:MM)', 'end_time:End (HH:MM)', 'role:Role'] as const).map(f => {
              const [key, label] = f.split(':')
              return <input key={key} placeholder={label} value={(addForm as Record<string, string>)[key] ?? ''} onChange={e => setAddForm({ ...addForm, [key]: e.target.value })} style={{ ...inp, width: 130 }} />
            })}
            <button onClick={saveShift} style={smBtn(G2)}>Save</button>
            <button onClick={() => setAddForm(null)} style={smBtn()}>Cancel</button>
          </div>
        </div>
      )}
      <RosterBuilder bid={bid} weekStart={ws} forecast={forecast} />
      {forecast.length > 0 && (
        <div style={{ ...card }}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Next week demand forecast</p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>Based on last 4 weeks of sales data</p>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={forecast}>
              <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="l" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v}`} />
              <YAxis yAxisId="r" orientation="right" tick={{ fill: G, fontSize: 9 }} axisLine={false} tickLine={false} domain={[0, 8]} />
              <Tooltip contentStyle={{ background: '#1a2620', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11 }} />
              <Bar yAxisId="l" dataKey="predicted_revenue" fill="rgba(127,184,151,0.35)" radius={[3, 3, 0, 0]} name="Predicted Revenue ($)" />
              <Line yAxisId="r" dataKey="recommended_staff" stroke={G} strokeWidth={2} dot={{ r: 3, fill: G }} name="Staff needed" />
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ marginTop: 8 }}>{forecast.map(f => <p key={f.day} style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '2px 0' }}>{f.day}: ${f.predicted_revenue} predicted → {f.recommended_staff} staff</p>)}</div>
        </div>
      )}
    </div>
  )
}

function RosterBuilder({ bid, weekStart, forecast }: { bid: string; weekStart: string; forecast: FD[] }) {
  const [roster, setRoster] = useState<Roster | null>(null)
  const [generating, setGenerating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const weekDates = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart + 'T00:00:00'); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10) })
  const DS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const load = useCallback(async () => {
    setMsg(''); setErr('')
    try {
      const r = await fetch('/api/aria/roster').then(r => r.json())
      const match = ((r.rosters ?? []) as Roster[]).find(x => x.week_starting === weekStart)
      setRoster(match ?? null)
    } catch { /* silent */ }
  }, [weekStart])
  useEffect(() => { if (bid) load() }, [bid, weekStart, load])

  async function generate() {
    setGenerating(true); setErr(''); setMsg('')
    try {
      const forecastHint = forecast.map(f => ({ day: f.day, date: f.date, predicted_revenue: f.predicted_revenue, recommended_staff: f.recommended_staff }))
      const r = await fetch('/api/aria/roster', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_starting: weekStart, forecast: forecastHint }),
      })
      const d = await r.json()
      if (!r.ok || d.error) { setErr(d.error ?? 'Generation failed'); return }
      setRoster(d.roster)
      setMsg(`Draft roster ready · ${d.roster?.shifts?.length ?? 0} shifts · ${(d.roster?.total_hours ?? 0).toFixed(1)}h`)
    } catch (e) { setErr((e as Error).message) }
    setGenerating(false)
  }

  async function publish() {
    if (!roster) return
    if (!confirm(`Publish this roster and SMS ${new Set(roster.shifts.map(s => s.staff_id)).size} staff their shifts?`)) return
    setPublishing(true); setErr(''); setMsg('')
    try {
      const r1 = await fetch(`/api/aria/roster?id=${roster.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'published' }),
      }).then(r => r.json())
      if (r1.error) { setErr(r1.error); setPublishing(false); return }
      const r2 = await fetch('/api/aria/roster/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: roster.id }),
      }).then(r => r.json())
      setRoster(r1.roster ?? roster)
      if (r2.error) setMsg(`Published. Notify failed: ${r2.error}`)
      else setMsg(`Published — SMS sent to ${r2.sent ?? 0} staff${r2.errors?.length ? ` (${r2.errors.length} missing phone)` : ''}.`)
    } catch (e) { setErr((e as Error).message) }
    setPublishing(false)
  }

  async function discard() {
    if (!roster || !confirm('Discard this draft roster?')) return
    await fetch(`/api/aria/roster?id=${roster.id}`, { method: 'DELETE' })
    setRoster(null); setMsg('Discarded.')
  }

  // Group shifts by staff for the grid
  const byStaff: Record<string, { name: string; role?: string; shifts: Record<string, RosterShift> }> = {}
  for (const s of roster?.shifts ?? []) {
    if (!byStaff[s.staff_id]) byStaff[s.staff_id] = { name: s.staff_name, role: s.role, shifts: {} }
    byStaff[s.staff_id].shifts[s.date] = s
  }
  const staffRows = Object.entries(byStaff)

  return (
    <div style={{ ...card, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>✦ Roster generator</p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Uses demand forecast + staff availability + Fair Work rules → assigned weekly roster</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={generate} disabled={generating} style={{ ...smBtn(G2), padding: '6px 14px', fontSize: 12, opacity: generating ? 0.6 : 1 }}>
            {generating ? '✨ Generating…' : roster ? '✨ Regenerate' : '✨ Generate roster'}
          </button>
          {roster && roster.status === 'draft' && (
            <>
              <button onClick={publish} disabled={publishing} style={{ ...smBtn(G), padding: '6px 14px', fontSize: 12, opacity: publishing ? 0.6 : 1 }}>
                {publishing ? 'Publishing…' : '✓ Publish & notify staff'}
              </button>
              <button onClick={discard} style={{ ...smBtn('#ef4444'), padding: '6px 14px', fontSize: 12 }}>Discard</button>
            </>
          )}
        </div>
      </div>
      {msg && <p style={{ fontSize: 11, color: G, margin: '6px 0' }}>{msg}</p>}
      {err && <p style={{ fontSize: 11, color: '#ef4444', margin: '6px 0' }}>⚠ {err}</p>}
      {roster?.aria_reasoning && (
        <div style={{ background: 'rgba(99,102,241,0.06)', borderLeft: '3px solid #6366f1', borderRadius: '0 8px 8px 0', padding: '8px 12px', margin: '8px 0', fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
          {roster.aria_reasoning}
        </div>
      )}
      {roster && staffRows.length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 700 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Staff</th>
                {weekDates.map((d, i) => (
                  <th key={d} style={{ padding: '6px 8px', fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', textAlign: 'center' }}>{DS[i]}<br /><span style={{ fontSize: 9 }}>{d.slice(8)}</span></th>
                ))}
                <th style={{ padding: '6px 8px', fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', textAlign: 'center' }}>Hrs</th>
              </tr>
            </thead>
            <tbody>
              {staffRows.map(([staffId, info]) => {
                const totalHrs = Object.values(info.shifts).reduce((a, s) => a + Number(s.hours ?? 0), 0)
                return (
                  <tr key={staffId} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 600 }}>{info.name}{info.role ? <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>{info.role}</span> : null}</td>
                    {weekDates.map(d => {
                      const s = info.shifts[d]
                      const over = s && Number(s.hours ?? 0) > 10
                      return (
                        <td key={d} style={{ padding: 4, textAlign: 'center' }}>
                          {s ? (
                            <div style={{ padding: '3px 5px', borderRadius: 5, background: over ? 'rgba(239,68,68,0.1)' : 'rgba(127,184,151,0.1)', border: '1px solid ' + (over ? 'rgba(239,68,68,0.3)' : 'rgba(127,184,151,0.25)') }} title={over ? '>10h shift' : undefined}>
                              <p style={{ fontSize: 10, fontWeight: 700, color: over ? '#ef4444' : G, margin: 0 }}>{s.start_time}–{s.end_time}</p>
                              <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', margin: 0 }}>{Number(s.hours ?? 0).toFixed(1)}h</p>
                            </div>
                          ) : <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>—</span>}
                        </td>
                      )
                    })}
                    <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: G }}>{totalHrs.toFixed(1)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 11, color: 'rgba(255,255,255,0.5)', flexWrap: 'wrap' }}>
            <span>Total: <strong style={{ color: '#e8ede7' }}>{roster.total_hours.toFixed(1)}h</strong></span>
            <span>Labour cost: <strong style={{ color: '#f59e0b' }}>A${(roster.total_cost_cents / 100).toFixed(2)}</strong></span>
            <span style={{ padding: '2px 8px', borderRadius: 99, background: roster.status === 'published' ? 'rgba(127,184,151,0.15)' : 'rgba(99,102,241,0.15)', color: roster.status === 'published' ? G : '#6366f1', fontWeight: 700, textTransform: 'uppercase', fontSize: 9 }}>{roster.status}</span>
          </div>
        </div>
      )}
      {!roster && !generating && (
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>No draft roster yet. The demand forecast above will be passed to Aria when you generate one.</p>
      )}
    </div>
  )
}

function TimesheetTab({ bid }: { bid: string }) {
  const [sessions, setSessions] = useState<TS[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [week, setWeek] = useState(monOfWeek)

  const load = useCallback(() => {
    const sun = new Date(week + 'T00:00:00'); sun.setDate(sun.getDate() + 6)
    fetch(`/api/pos/timesheets?from=${week}T00:00:00&to=${sun.toISOString().slice(0, 10)}T23:59:59`).then(r => r.json()).then(d => setSessions(d.sessions ?? [])).catch(() => {})
  }, [week])
  useEffect(() => { if (bid) load() }, [bid, week, load])

  const approve = async (id: string) => { await fetch('/api/pos/timesheets', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: id, approve: true }) }); load() }
  const approveAll = async () => { await Promise.all([...selected].map(id => approve(id))); setSelected(new Set()) }
  const csvExport = () => {
    const rows = [['Staff', 'Clock In', 'Clock Out', 'Hours', 'Rate ($/hr)', 'Cost', 'Status'],
      ...sessions.map(s => { const h = (s.total_minutes ?? 0) / 60; const r = (s.pay_rate_cents ?? 0) / 100; return [s.staff_name, s.clock_in, s.clock_out ?? '', h.toFixed(2), r.toFixed(2), (h * r).toFixed(2), s.approved ? 'Approved' : 'Pending'] })]
    const a = document.createElement('a'); a.href = 'data:text/csv,' + encodeURIComponent(rows.map(r => r.join(',')).join('\n')); a.download = `timesheets-${week}.csv`; a.click()
  }

  const done = sessions.filter(s => s.clock_out)
  const totals: Record<string, { hrs: number; cost: number }> = {}
  done.forEach(s => { totals[s.staff_name] = totals[s.staff_name] ?? { hrs: 0, cost: 0 }; const h = (s.total_minutes ?? 0) / 60; const r = (s.pay_rate_cents ?? 0) / 100; totals[s.staff_name].hrs += h; totals[s.staff_name].cost += h * r })

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => { const d = new Date(week + 'T00:00:00'); d.setDate(d.getDate() - 7); setWeek(d.toISOString().slice(0, 10)) }} style={smBtn()}>‹ Prev</button>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Week of {week}</span>
        <button onClick={() => { const d = new Date(week + 'T00:00:00'); d.setDate(d.getDate() + 7); setWeek(d.toISOString().slice(0, 10)) }} style={smBtn()}>Next ›</button>
        {selected.size > 0 && <button onClick={approveAll} style={smBtn(G2)}>Approve {selected.size}</button>}
        <button onClick={csvExport} style={smBtn()}>Export CSV</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {['', 'Staff', 'Date', 'Clock In', 'Clock Out', 'Hours', 'Cost', 'Status', ''].map((h, i) => <th key={i} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>)}
          </tr></thead>
          <tbody>{sessions.map(s => {
            const hrs = (s.total_minutes ?? 0) / 60; const rate = (s.pay_rate_cents ?? 0) / 100
            return (
              <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '6px 10px' }}><input type="checkbox" checked={selected.has(s.id)} onChange={e => { const ns = new Set(selected); e.target.checked ? ns.add(s.id) : ns.delete(s.id); setSelected(ns) }} /></td>
                <td style={{ padding: '6px 10px', fontWeight: 600 }}>{s.staff_name}</td>
                <td style={{ padding: '6px 10px', color: 'rgba(255,255,255,0.5)' }}>{s.clock_in.slice(0, 10)}</td>
                <td style={{ padding: '6px 10px' }}>{s.clock_in.slice(11, 16)}</td>
                <td style={{ padding: '6px 10px' }}>{s.clock_out ? s.clock_out.slice(11, 16) : <span style={{ color: G }}>Active</span>}</td>
                <td style={{ padding: '6px 10px' }}>{fmtHrs(s.total_minutes)}</td>
                <td style={{ padding: '6px 10px', color: G }}>${(hrs * rate).toFixed(2)}</td>
                <td style={{ padding: '6px 10px' }}><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: s.approved ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)', color: s.approved ? '#10b981' : 'rgba(255,255,255,0.4)' }}>{s.approved ? 'Approved' : 'Pending'}</span></td>
                <td style={{ padding: '6px 10px' }}>{!s.approved && s.clock_out && <button onClick={() => approve(s.id)} style={smBtn(G2)}>Approve</button>}</td>
              </tr>
            )
          })}</tbody>
        </table>
      </div>
      {Object.keys(totals).length > 0 && (
        <div style={{ ...card, marginTop: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, marginBottom: 8 }}>Weekly totals per staff</p>
          {Object.entries(totals).map(([name, v]) => (
            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span>{name}</span><span style={{ color: G }}>{v.hrs.toFixed(1)}h · ${v.cost.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PerformanceTab({ bid }: { bid: string }) {
  const [rows, setRows] = useState<PerfRow[]>([])
  const [period, setPeriod] = useState(30)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!bid) return
    setLoading(true)
    const since = new Date(Date.now() - period * 86400000).toISOString()
    const sinceWk = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
    Promise.all([
      fetch(`/api/pos/sales?business_id=${bid}&limit=2000&since=${since}`).then(r => r.json()),
      fetch(`/api/pos/timesheets?from=${sinceWk}T00:00:00&to=${new Date().toISOString().slice(0, 10)}T23:59:59`).then(r => r.json()),
    ]).then(([sl, ts]) => {
      const sm: Record<string, { revenue: number; count: number }> = {}
      ;(sl.sales ?? []).filter((s: Record<string, unknown>) => s.status !== 'voided' && s.served_by).forEach((s: Record<string, unknown>) => {
        const k = s.served_by as string; sm[k] = sm[k] ?? { revenue: 0, count: 0 }; sm[k].revenue += Number(s.total_amount ?? 0); sm[k].count++
      })
      const hm: Record<string, number> = {}
      ;(ts.sessions ?? []).filter((s: TS) => s.clock_out).forEach((s: TS) => { hm[s.staff_name] = (hm[s.staff_name] ?? 0) + (s.total_minutes ?? 0) / 60 })
      const all = new Set([...Object.keys(sm), ...Object.keys(hm)])
      const data: PerfRow[] = [...all].map(name => ({ name, revenue: sm[name]?.revenue ?? 0, count: sm[name]?.count ?? 0, hours: hm[name] ?? 0 }))
      data.sort((a, b) => (b.hours > 0 ? b.revenue / b.hours : 0) - (a.hours > 0 ? a.revenue / a.hours : 0))
      setRows(data); setLoading(false)
    }).catch(() => setLoading(false))
  }, [bid, period])

  const MEDALS = ['🥇', '🥈', '🥉']
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[7, 30, 90].map(p => <button key={p} onClick={() => setPeriod(p)} style={tabBtnStyle(period === p)}>{p}d</button>)}
      </div>
      {loading ? <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Loading…</p>
        : rows.length === 0 ? <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No data. Ensure sales have served_by set.</p>
        : rows.map((r, i) => {
          const rph = r.hours > 0 ? r.revenue / r.hours : 0
          const best = (() => { const b = rows[0]; return b.hours > 0 ? b.revenue / b.hours : 1 })()
          return (
            <div key={r.name} style={{ ...card, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{MEDALS[i] ?? i + 1}</span>
              <Avatar name={r.name} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</span>
                  <span style={{ fontSize: 12, color: G, fontWeight: 700 }}>${Math.round(r.revenue).toLocaleString()}</span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 4 }}>
                  <div style={{ height: 4, width: `${Math.round((rph / (best || 1)) * 100)}%`, background: 'linear-gradient(90deg,#1D9E75,#7FB897)', borderRadius: 2 }} />
                </div>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', margin: 0 }}>{r.count} sales · ${r.count > 0 ? Math.round(r.revenue / r.count) : 0} avg · {r.hours.toFixed(1)}h worked · <strong style={{ color: G }}>${rph.toFixed(0)}/hr</strong></p>
              </div>
            </div>
          )
        })}
    </div>
  )
}

function LeaveTab({ bid }: { bid: string }) {
  const [leave, setLeave] = useState<LR[]>([])
  const [form, setForm] = useState({ staff_name: '', leave_type: 'annual', start_date: '', end_date: '', notes: '' })
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => { fetch('/api/pos/staff-leave').then(r => r.json()).then(d => setLeave(d.leave ?? [])).catch(() => {}) }, [])
  useEffect(() => { if (bid) load() }, [bid, load])

  const update = (id: string, status: string) => fetch(`/api/pos/staff-leave?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }).then(load)
  const save = async () => {
    if (!form.start_date || !form.end_date) return
    setSaving(true)
    await fetch('/api/pos/staff-leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form }) })
    setSaving(false); setAdding(false); setForm({ staff_name: '', leave_type: 'annual', start_date: '', end_date: '', notes: '' }); load()
  }

  const SC: Record<string, string> = { pending: '#f59e0b', approved: '#10b981', declined: '#ef4444' }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{leave.length} requests</span>
        <button onClick={() => setAdding(!adding)} style={smBtn(G2)}>+ New request</button>
      </div>
      {adding && (
        <div style={{ ...card, marginBottom: 14 }}>
          <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>New leave request</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input placeholder="Staff name" value={form.staff_name} onChange={e => setForm({ ...form, staff_name: e.target.value })} style={inp} />
            <select value={form.leave_type} onChange={e => setForm({ ...form, leave_type: e.target.value })} style={{ ...inp, background: '#1a2420' }}>
              {['annual', 'sick', 'personal', 'unpaid'].map(t => <option key={t} value={t} style={{ background: '#1a2420' }}>{t}</option>)}
            </select>
            <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} style={inp} />
            <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} style={inp} />
            <input placeholder="Notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...inp, minWidth: 150 }} />
            <button onClick={save} disabled={saving} style={smBtn(G2)}>{saving ? 'Saving…' : 'Submit'}</button>
          </div>
        </div>
      )}
      {leave.length === 0
        ? <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No leave requests.</p>
        : leave.map(l => (
          <div key={l.id} style={{ ...card, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {l.staff_name && <Avatar name={l.staff_name} size={32} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{l.staff_name ?? 'Staff'} · <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.5)', textTransform: 'capitalize' }}>{l.leave_type}</span></p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: 0 }}>{l.start_date} → {l.end_date}{l.notes ? ` · ${l.notes}` : ''}</p>
            </div>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: `${SC[l.status] ?? '#fff'}20`, color: SC[l.status] ?? 'rgba(255,255,255,0.5)', textTransform: 'capitalize' }}>{l.status}</span>
            {l.status === 'pending' && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => update(l.id, 'approved')} style={smBtn(G2)}>Approve</button>
                <button onClick={() => update(l.id, 'declined')} style={smBtn('#ef4444')}>Decline</button>
              </div>
            )}
          </div>
        ))}
    </div>
  )
}

function PortalBadge({ member }: { member: MR }) {
  const [resending, setResending] = useState(false)
  const [msg, setMsg] = useState('')
  const resend = async () => {
    if (!member.business_id) return; setResending(true)
    const r = await fetch('/api/staff/invite/resend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staff_member_id: member.id, business_id: member.business_id }) })
    const j = await r.json(); setMsg(r.ok ? `Resent to ${j.email}` : (j.error ?? 'Failed')); setResending(false)
  }
  if (member.portal_enabled || (member.user_id && member.invite_sent_at)) return <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(16,185,129,0.2)', color: '#10b981' }}>Active</span>
  if (member.invite_sent_at) return (
    <div>
      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.2)', color: '#f59e0b' }}>Invited</span>
      <button onClick={resend} disabled={resending} style={{ display: 'block', fontSize: 10, color: G, background: 'none', border: 'none', cursor: 'pointer' }}>{resending ? '…' : 'Resend'}</button>
      {msg && <span style={{ fontSize: 10, color: msg.startsWith('Resent') ? G : '#ef4444' }}>{msg}</span>}
    </div>
  )
  return <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Not invited</span>
}

function TeamTab({ bid }: { bid: string }) {
  const [members, setMembers] = useState<MR[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')

  const load = useCallback((q: string, s: string) => {
    setLoading(true)
    const p = new URLSearchParams({ status: s }); if (q) p.set('q', q)
    fetch(`/api/staff/members?${p}`).then(r => r.json()).then(d => setMembers(d.members ?? [])).finally(() => setLoading(false))
  }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(search, statusFilter) }, [statusFilter])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => load(search, statusFilter), 350); return () => clearTimeout(t) }, [search])

  const dn = (m: MR) => m.preferred_name ?? `${m.first_name} ${m.last_name}`
  const pay = (m: MR) => m.pay_rate_cents ? `$${(m.pay_rate_cents / 100).toFixed(2)}/hr` : '—'
  const SC: Record<string, [string, string]> = { active: ['rgba(16,185,129,0.2)', '#10b981'], inactive: ['rgba(245,158,11,0.2)', '#f59e0b'], terminated: ['rgba(239,68,68,0.2)', '#ef4444'] }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="Search name or position…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, width: 220 }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inp, background: '#1a2420' }}>
          {['active', 'inactive', 'terminated', 'all'].map(s => <option key={s} value={s} style={{ background: '#1a2420' }}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
        <Link href="/dashboard/staff/new" style={{ padding: '7px 14px', borderRadius: 8, background: '#2D5240', color: G, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>+ Add staff</Link>
      </div>
      {loading
        ? <p style={{ textAlign: 'center', padding: '32px 0', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Loading…</p>
        : members.length === 0
          ? <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.3)' }}><p>No staff found.</p><Link href="/dashboard/staff/new" style={{ color: G, fontSize: 12 }}>Add first member →</Link></div>
          : <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Name', 'Position', 'Type', 'Pay', 'Skills', 'Portal', 'Status', ''].map((h, i) => <th key={i} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>)}
              </tr></thead>
              <tbody>{members.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '8px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: m.color ?? '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>{m.first_name[0]}{m.last_name[0]}</div>
                      <div><p style={{ fontWeight: 600, margin: 0 }}>{dn(m)}</p><p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', margin: 0 }}>{m.work_email ?? m.personal_email ?? ''}</p></div>
                    </div>
                  </td>
                  <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.5)' }}>{m.position}</td>
                  <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.5)', textTransform: 'capitalize' }}>{(m.employment_type ?? '').replace('_', ' ')}</td>
                  <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.5)' }}>{pay(m)}</td>
                  <td style={{ padding: '8px 10px' }}><div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>{(m.staff_member_skills ?? []).slice(0, 2).map((s, j) => s.staff_skills && <span key={j} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: (s.staff_skills.color ?? '#6366f1') + '33', color: s.staff_skills.color ?? '#6366f1' }}>{s.staff_skills.name}</span>)}</div></td>
                  <td style={{ padding: '8px 10px' }}><PortalBadge member={m} /></td>
                  <td style={{ padding: '8px 10px' }}><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: SC[m.status]?.[0] ?? 'rgba(255,255,255,0.06)', color: SC[m.status]?.[1] ?? 'rgba(255,255,255,0.5)', textTransform: 'capitalize' }}>{m.status}</span></td>
                  <td style={{ padding: '8px 10px' }}><Link href={`/dashboard/staff/${m.id}`} style={{ fontSize: 11, color: G }}>View →</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>}
      <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 10 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#3B82F6', marginBottom: 4 }}>Payroll & Xero integration</p>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Aria tracks hours and wages. Transfer payroll via your accounting software.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="https://www.xero.com/au/accounting-software/payroll/" target="_blank" rel="noopener noreferrer" style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(59,130,246,0.3)', color: '#3B82F6', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>Connect Xero</a>
          <a href="https://www.myob.com/au" target="_blank" rel="noopener noreferrer" style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(59,130,246,0.3)', color: '#3B82F6', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>Connect MYOB</a>
        </div>
      </div>
    </div>
  )
}

export default function StaffPage() {
  const { business } = useBusinessContext()
  const bid = business?.id ?? ''
  const [tab, setTab] = useState<Tab>('schedule')
  const TABS: { id: Tab; label: string }[] = [
    { id: 'schedule', label: 'Schedule' },
    { id: 'timesheets', label: 'Timesheets' },
    { id: 'performance', label: 'Performance' },
    { id: 'leave', label: 'Leave' },
    { id: 'team', label: 'Team' },
  ]
  return (
    <div style={{ padding: 24, maxWidth: 1280, color: '#e8ede7' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Staff</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Deputy-level scheduling, timesheets &amp; analytics</p>
        </div>
        <Link href="/dashboard/staff/new" style={{ padding: '8px 16px', borderRadius: 8, background: '#2D5240', color: G, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>+ Add staff</Link>
      </div>
      {bid && <LiveWidget bid={bid} />}
      {bid && <ClockWidget bid={bid} />}
      {bid && (tab === 'schedule' || tab === 'timesheets') && <LabourMetrics bid={bid} />}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 12 }}>
        {TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={tabBtnStyle(tab === t.id)}>{t.label}</button>)}
      </div>
      {tab === 'schedule' && bid && <ScheduleTab bid={bid} />}
      {tab === 'timesheets' && bid && <TimesheetTab bid={bid} />}
      {tab === 'performance' && bid && <PerformanceTab bid={bid} />}
      {tab === 'leave' && bid && <LeaveTab bid={bid} />}
      {tab === 'team' && <TeamTab bid={bid} />}
    </div>
  )
}
