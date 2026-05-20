'use client'
import { useEffect, useState, useCallback } from 'react'

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', elevated: 'var(--bg-elevated)', text: 'var(--text-primary,#E8EDE7)', muted: 'var(--text-secondary,#A8B5A8)', green: '#7FB897', darkGreen: '#2D5240', border: 'var(--divider,rgba(232,237,231,0.08))', red: '#ef4444', amber: '#f59e0b' }
const INP: React.CSSProperties = { background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontSize: 13, outline: 'none' }

interface Timesheet {
  id: string; staff_member_id: string | null; staff_name: string
  clock_in: string; clock_out: string | null; break_minutes: number
  break_type: string; hours_worked: number | null; pay_rate_cents: number
  total_pay_cents: number; is_overtime: boolean; overtime_cents: number
  notes: string | null; approved: boolean; approved_by: string | null; status: string
}

function getMondayOf(date: Date) {
  const d = new Date(date), day = d.getDay(), diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff); return d.toISOString().slice(0, 10)
}
function fmt(iso: string | null) { if (!iso) return '—'; return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true }) }
function fmtHours(h: number) { return `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m` }

export default function TimesheetsPage() {
  const [weekStart, setWeekStart] = useState(() => getMondayOf(new Date()))
  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState<string | null>(null)
  const [approvingAll, setApprovingAll] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [staffList, setStaffList] = useState<Array<{ id: string; first_name: string; last_name: string }>>([])
  const [form, setForm] = useState({ staff_member_id: '', clock_in_date: '', clock_in_time: '09:00', clock_out_time: '17:00', break_minutes: 30, break_type: 'unpaid', notes: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/staff/timesheets?week_start=${weekStart}`)
    const j = await r.json()
    setTimesheets(j.timesheets ?? [])
    setLoading(false)
  }, [weekStart])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/staff/members?status=active').then(r => r.json()).then(d => setStaffList(d.members ?? []))
  }, [])

  const approve = async (id: string) => {
    setApproving(id)
    await fetch(`/api/staff/timesheets/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approved: true }) })
    setApproving(null); load()
  }

  const approveAll = async () => {
    setApprovingAll(true)
    for (const t of timesheets.filter(t => !t.approved && t.clock_out)) {
      await fetch(`/api/staff/timesheets/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approved: true }) })
    }
    setApprovingAll(false); load()
  }

  const saveManual = async () => {
    if (!form.staff_member_id || !form.clock_in_date) return
    setSaving(true)
    const clockIn = `${form.clock_in_date}T${form.clock_in_time}:00`
    const clockOut = `${form.clock_in_date}T${form.clock_out_time}:00`
    await fetch('/api/staff/timesheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_member_id: form.staff_member_id, clock_in: clockIn, clock_out: clockOut, break_minutes: form.break_minutes, break_type: form.break_type, notes: form.notes }),
    })
    setSaving(false); setShowAddForm(false); load()
    setForm({ staff_member_id: '', clock_in_date: '', clock_in_time: '09:00', clock_out_time: '17:00', break_minutes: 30, break_type: 'unpaid', notes: '' })
  }

  const deleteSheet = async (id: string) => {
    if (!confirm('Delete this timesheet?')) return
    await fetch(`/api/staff/timesheets/${id}`, { method: 'DELETE' })
    load()
  }

  const prevWeek = () => { const d = new Date(weekStart + 'T12:00:00Z'); d.setDate(d.getDate() - 7); setWeekStart(d.toISOString().slice(0, 10)) }
  const nextWeek = () => { const d = new Date(weekStart + 'T12:00:00Z'); d.setDate(d.getDate() + 7); setWeekStart(d.toISOString().slice(0, 10)) }

  const totalHours = timesheets.reduce((s, t) => s + (Number(t.hours_worked) || 0), 0)
  const totalPay = timesheets.reduce((s, t) => s + (t.total_pay_cents || 0), 0)
  const activeCount = timesheets.filter(t => !t.clock_out).length
  const pendingCount = timesheets.filter(t => !t.approved && t.clock_out).length
  const overtimeCount = timesheets.filter(t => t.is_overtime).length

  const byStaff = timesheets.reduce((acc, t) => {
    const key = t.staff_name || 'Unknown'
    if (!acc[key]) acc[key] = { hours: 0, pay: 0, sheets: [] }
    acc[key].hours += Number(t.hours_worked) || 0
    acc[key].pay += t.total_pay_cents || 0
    acc[key].sheets.push(t)
    return acc
  }, {} as Record<string, { hours: number; pay: number; sheets: Timesheet[] }>)

  const weekEnd = (() => { const d = new Date(weekStart + 'T12:00:00Z'); d.setDate(d.getDate() + 6); return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) })()

  return (
    <div style={{ padding: 24, maxWidth: 1000, color: C.text, fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Timesheets</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <button onClick={prevWeek} style={{ ...INP, padding: '4px 10px', cursor: 'pointer' }}>‹</button>
            <span style={{ fontSize: 13, fontWeight: 500, minWidth: 180, textAlign: 'center' }}>
              {new Date(weekStart + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – {weekEnd}
            </span>
            <button onClick={nextWeek} style={{ ...INP, padding: '4px 10px', cursor: 'pointer' }}>›</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setShowAddForm(v => !v)} style={{ padding: '7px 16px', borderRadius: 8, background: C.darkGreen, color: C.green, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>+ Add entry</button>
          {pendingCount > 0 && (
            <button onClick={approveAll} disabled={approvingAll} style={{ padding: '7px 16px', borderRadius: 8, background: C.green, color: C.darkGreen, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              {approvingAll ? 'Approving…' : `Approve all (${pendingCount})`}
            </button>
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total hours', value: fmtHours(totalHours), color: C.green },
          { label: 'Labour cost', value: `$${(totalPay / 100).toFixed(2)}`, color: C.text },
          { label: 'Active now', value: String(activeCount), color: '#60a5fa' },
          { label: 'Pending approval', value: String(pendingCount), color: pendingCount > 0 ? C.amber : C.muted },
          { label: 'Overtime shifts', value: String(overtimeCount), color: overtimeCount > 0 ? C.red : C.muted },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: C.card, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Fraunces, serif', fontStyle: 'italic', color }}>{value}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Manual entry form */}
      {showAddForm && (
        <div style={{ background: 'rgba(45,82,64,0.08)', border: `1px solid ${C.green}33`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: C.green, marginBottom: 12 }}>Add timesheet entry</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Staff member</label>
              <select value={form.staff_member_id} onChange={e => setForm(f => ({ ...f, staff_member_id: e.target.value }))} style={{ ...INP, width: '100%' }}>
                <option value="" style={{ background: '#1a2420' }}>Select staff…</option>
                {staffList.map(s => <option key={s.id} value={s.id} style={{ background: '#1a2420' }}>{s.first_name} {s.last_name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Date</label>
              <input type="date" value={form.clock_in_date} onChange={e => setForm(f => ({ ...f, clock_in_date: e.target.value }))} style={{ ...INP, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Break type</label>
              <select value={form.break_type} onChange={e => setForm(f => ({ ...f, break_type: e.target.value }))} style={{ ...INP, width: '100%' }}>
                <option value="unpaid" style={{ background: '#1a2420' }}>Unpaid break</option>
                <option value="paid" style={{ background: '#1a2420' }}>Paid break</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Clock in</label>
              <input type="time" value={form.clock_in_time} onChange={e => setForm(f => ({ ...f, clock_in_time: e.target.value }))} style={{ ...INP, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Clock out</label>
              <input type="time" value={form.clock_out_time} onChange={e => setForm(f => ({ ...f, clock_out_time: e.target.value }))} style={{ ...INP, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Break (mins)</label>
              <input type="number" value={form.break_minutes} onChange={e => setForm(f => ({ ...f, break_minutes: parseInt(e.target.value) || 0 }))} min={0} max={120} style={{ ...INP, width: '100%' }} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Notes</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes…" style={{ ...INP, width: '100%' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveManual} disabled={saving || !form.staff_member_id || !form.clock_in_date} style={{ padding: '8px 18px', borderRadius: 8, background: C.darkGreen, color: C.green, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Save entry</button>
            <button onClick={() => setShowAddForm(false)} style={{ padding: '8px 14px', borderRadius: 8, background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Grouped by staff */}
      {loading ? <p style={{ color: C.muted }}>Loading…</p> : Object.keys(byStaff).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>
          <p style={{ marginBottom: 8, fontSize: 15 }}>No timesheets for this week</p>
          <p style={{ fontSize: 13 }}>Staff clock in via the Staff Portal or POS terminal. You can also add entries manually.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Object.entries(byStaff).map(([name, data]) => (
            <div key={name} style={{ background: C.card, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 16, alignItems: 'center', padding: '12px 16px', background: 'rgba(127,184,151,0.06)', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{name}</span>
                <span style={{ fontSize: 12, color: C.green }}>{fmtHours(data.hours)}</span>
                <span style={{ fontSize: 12, color: C.muted }}>${(data.pay / 100).toFixed(2)}</span>
                {data.hours > 38 && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(239,68,68,0.15)', color: C.red }}>⚠ {fmtHours(data.hours - 38)} OT</span>}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['Date','In','Out','Break','Hours','Pay','Status',''].map(h => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, color: C.muted, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.sheets.map(t => {
                    const dayStr = new Date(t.clock_in).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
                    const hours = Number(t.hours_worked) || 0
                    const isActive = !t.clock_out
                    return (
                      <tr key={t.id} style={{ borderBottom: `1px solid ${C.border}`, background: t.is_overtime ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
                        <td style={{ padding: '10px 14px' }}>{dayStr}</td>
                        <td style={{ padding: '10px 14px' }}>{fmt(t.clock_in)}</td>
                        <td style={{ padding: '10px 14px', color: isActive ? C.green : C.text }}>{isActive ? '● Active' : fmt(t.clock_out)}</td>
                        <td style={{ padding: '10px 14px', color: C.muted }}>
                          {t.break_minutes}m <span style={{ fontSize: 10, color: t.break_type === 'paid' ? C.green : C.muted }}>({t.break_type ?? 'unpaid'})</span>
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: t.is_overtime ? C.red : C.text }}>{hours > 0 ? fmtHours(hours) : '—'}</td>
                        <td style={{ padding: '10px 14px', color: C.green }}>${((t.total_pay_cents || 0) / 100).toFixed(2)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          {t.approved ? (
                            <span style={{ fontSize: 11, color: C.green }}>✓ Approved</span>
                          ) : !t.clock_out ? (
                            <span style={{ fontSize: 11, color: '#60a5fa' }}>● Clocked in</span>
                          ) : (
                            <button onClick={() => approve(t.id)} disabled={approving === t.id} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: C.darkGreen, color: C.green, border: 'none', cursor: 'pointer' }}>Approve</button>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <button onClick={() => deleteSheet(t.id)} style={{ fontSize: 11, color: C.muted, background: 'transparent', border: 'none', cursor: 'pointer' }}>✕</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
