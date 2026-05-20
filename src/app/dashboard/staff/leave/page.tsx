'use client'
import { useEffect, useState, useCallback } from 'react'

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', elevated: 'var(--bg-elevated)', text: 'var(--text-primary, #E8EDE7)', muted: 'var(--text-secondary, #A8B5A8)', green: '#7FB897', darkGreen: '#2D5240', border: 'var(--divider, rgba(232,237,231,0.08))', red: '#ef4444', amber: '#f59e0b' }
const INP: React.CSSProperties = { background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontSize: 14, width: '100%', outline: 'none' }

interface LeaveRequest {
  id: string; staff_id: string; staff_name?: string; leave_type: string
  start_date: string; end_date: string; days_taken: number; status: string
  notes: string | null; created_at: string; approved_at?: string | null
  staff_members?: { first_name: string; last_name: string }
}

interface LeaveBalance {
  staff_member_id: string; leave_type: string; opening_balance_days: number
  accrued_days: number; taken_days: number; adjusted_days: number
  staff_name?: string
}

const LEAVE_TYPES: Record<string, string> = { annual: 'Annual leave', sick: 'Sick leave', personal: 'Personal leave', parental: 'Parental leave', other: 'Other' }

function statusColor(s: string) {
  if (s === 'approved') return { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' }
  if (s === 'declined') return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' }
  return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' }
}

function daysBetween(start: string, end: string) {
  const d1 = new Date(start), d2 = new Date(end)
  return Math.max(1, Math.ceil((d2.getTime() - d1.getTime()) / 86400000) + 1)
}

export default function LeavePage() {
  const [leave, setLeave] = useState<LeaveRequest[]>([])
  const [balances, setBalances] = useState<LeaveBalance[]>([])
  const [staffList, setStaffList] = useState<Array<{ id: string; first_name: string; last_name: string; employment_type: string }>>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [tab, setTab] = useState<'requests' | 'balances' | 'calendar'>('requests')
  const [actioning, setActioning] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ staff_id: '', leave_type: 'annual', start_date: '', end_date: '', notes: '' })
  const [bid, setBid] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [leaveRes, membersRes] = await Promise.all([
      fetch(`/api/staff/leave?status=${filter}`),
      fetch('/api/staff/members?status=active'),
    ])
    const [leaveData, membersData] = await Promise.all([leaveRes.json(), membersRes.json()])
    setLeave(leaveData.leave ?? [])
    setStaffList(membersData.members ?? [])
    if (membersData.business_id) setBid(membersData.business_id)
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  const loadBalances = useCallback(async () => {
    if (!bid) return
    const r = await fetch(`/api/staff/leave/balances?business_id=${bid}`)
    const d = await r.json()
    setBalances(d.balances ?? [])
  }, [bid])

  useEffect(() => { if (tab === 'balances' && bid) loadBalances() }, [tab, bid, loadBalances])

  const action = async (id: string, status: 'approved' | 'declined') => {
    setActioning(id)
    await fetch(`/api/staff/leave/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    setActioning(null)
    load()
  }

  const submit = async () => {
    if (!form.staff_id || !form.start_date || !form.end_date) return
    const days = daysBetween(form.start_date, form.end_date)
    await fetch('/api/staff/leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, business_id: bid, days_taken: days }) })
    setForm({ staff_id: '', leave_type: 'annual', start_date: '', end_date: '', notes: '' })
    setShowForm(false)
    load()
  }

  const pending = leave.filter(l => l.status === 'pending')
  const approvedThisMonth = leave.filter(l => l.status === 'approved' && l.start_date >= new Date().toISOString().slice(0,7)).length

  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const approvedLeave = leave.filter(l => l.status === 'approved')
  const todayStr = now.toISOString().slice(0, 10)

  return (
    <div style={{ padding: 24, maxWidth: 900, color: C.text, fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Leave management</h1>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{pending.length} pending · {approvedThisMonth} approved this month</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} style={{ background: C.darkGreen, color: C.green, border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
          + New request
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Pending', value: pending.length, color: C.amber },
          { label: 'Approved this month', value: approvedThisMonth, color: C.green },
          { label: 'Total days taken (year)', value: leave.filter(l=>l.status==='approved').reduce((s,l)=>s+l.days_taken,0), color: C.text },
          { label: 'Staff on leave today', value: leave.filter(l => l.status==='approved' && l.start_date <= todayStr && l.end_date >= todayStr).length, color: '#60a5fa' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: C.card, borderRadius: 12, padding: '14px 16px' }}>
            <p style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Fraunces, serif', fontStyle: 'italic', color }}>{value}</p>
            <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {(['requests','balances','calendar'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 600 : 400, background: tab === t ? C.darkGreen : 'transparent', color: tab === t ? C.green : C.muted }}>
            {t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      {/* New request form */}
      {showForm && (
        <div style={{ background: 'rgba(45,82,64,0.1)', border: '1px solid rgba(45,82,64,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: C.green, marginBottom: 12 }}>New leave request</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 4 }}>Staff member</label>
              <select value={form.staff_id} onChange={e => setForm(p=>({...p,staff_id:e.target.value}))} style={INP}>
                <option value="" style={{background:'#1a2420'}}>Select staff…</option>
                {staffList.map(s => <option key={s.id} value={s.id} style={{background:'#1a2420'}}>{s.first_name} {s.last_name} ({s.employment_type})</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 4 }}>Leave type</label>
              <select value={form.leave_type} onChange={e => setForm(p=>({...p,leave_type:e.target.value}))} style={INP}>
                {Object.entries(LEAVE_TYPES).map(([k,v]) => <option key={k} value={k} style={{background:'#1a2420'}}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 4 }}>Start date</label>
              <input type="date" value={form.start_date} onChange={e => setForm(p=>({...p,start_date:e.target.value}))} style={INP} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 4 }}>
                End date {form.start_date && form.end_date && <span style={{color:C.green}}>({daysBetween(form.start_date,form.end_date)} days)</span>}
              </label>
              <input type="date" value={form.end_date} onChange={e => setForm(p=>({...p,end_date:e.target.value}))} style={INP} />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 4 }}>Notes (optional)</label>
            <input value={form.notes} onChange={e => setForm(p=>({...p,notes:e.target.value}))} placeholder="Reason for leave…" style={INP} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={submit} disabled={!form.staff_id||!form.start_date||!form.end_date} style={{ background: C.darkGreen, color: C.green, border: 'none', borderRadius: 8, padding: '9px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: !form.staff_id ? 0.5 : 1 }}>Submit</button>
            <button onClick={() => setShowForm(false)} style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* REQUESTS TAB */}
      {tab === 'requests' && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {['pending','approved','declined','all'].map(s => (
              <button key={s} onClick={() => setFilter(s)} style={{ padding: '5px 14px', borderRadius: 20, border: `1px solid ${filter===s?C.green+'44':C.border}`, background: filter===s?'rgba(127,184,151,0.1)':'transparent', color: filter===s?C.green:C.muted, fontSize: 12, cursor: 'pointer', fontWeight: filter===s?600:400, textTransform: 'capitalize' }}>{s}</button>
            ))}
          </div>
          {loading ? <p style={{ color: C.muted, fontSize: 14 }}>Loading…</p> : leave.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>No {filter} leave requests.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {leave.map(req => {
                const sc = statusColor(req.status)
                const sm = req.staff_members
                const name = req.staff_name ?? (sm ? `${sm.first_name} ${sm.last_name}` : 'Staff member')
                return (
                  <div key={req.id} style={{ background: C.card, borderRadius: 12, padding: '14px 18px', border: `1px solid ${C.border}`, borderLeft: `4px solid ${req.status==='approved'?C.green:req.status==='declined'?C.red:C.amber}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 15 }}>{name}</span>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: sc.bg, color: sc.color, fontWeight: 600 }}>{req.status}</span>
                        </div>
                        <p style={{ fontSize: 13, color: C.muted }}>{LEAVE_TYPES[req.leave_type] ?? req.leave_type} · {req.start_date} → {req.end_date} · <strong style={{ color: C.text }}>{req.days_taken} day{req.days_taken!==1?'s':''}</strong></p>
                        {req.notes && <p style={{ fontSize: 12, color: C.muted, marginTop: 4, fontStyle: 'italic' }}>"{req.notes}"</p>}
                        {req.approved_at && <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Approved {new Date(req.approved_at).toLocaleDateString('en-AU')}</p>}
                      </div>
                      {req.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                          <button onClick={() => action(req.id,'approved')} disabled={actioning===req.id} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: C.darkGreen, color: C.green, border: 'none', cursor: 'pointer', fontWeight: 600 }}>Approve</button>
                          <button onClick={() => action(req.id,'declined')} disabled={actioning===req.id} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: C.red, border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer' }}>Decline</button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* BALANCES TAB */}
      {tab === 'balances' && (
        <div>
          <p style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>Leave entitlements for the current financial year. Annual leave accrues at 4 weeks/year, sick leave at 10 days/year (Fair Work Act).</p>
          {balances.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <p style={{ color: C.muted, fontSize: 14 }}>No leave balances yet.</p>
              <p style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>Balances are tracked once staff members are added and leave is submitted.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {balances.map((b, i) => {
                const remaining = (b.opening_balance_days + b.accrued_days + b.adjusted_days) - b.taken_days
                const pct = Math.min(100, b.taken_days / Math.max(1, b.opening_balance_days + b.accrued_days) * 100)
                return (
                  <div key={i} style={{ background: C.card, borderRadius: 12, padding: '14px 18px', border: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: 14 }}>{b.staff_name ?? 'Staff member'}</p>
                        <p style={{ fontSize: 12, color: C.muted }}>{LEAVE_TYPES[b.leave_type] ?? b.leave_type}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 20, fontWeight: 700, color: remaining >= 0 ? C.green : C.red }}>{remaining.toFixed(1)} days</p>
                        <p style={{ fontSize: 11, color: C.muted }}>remaining</p>
                      </div>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 8 }}>
                      <div style={{ height: 4, background: pct > 80 ? C.red : pct > 50 ? C.amber : C.green, borderRadius: 2, width: `${pct}%` }} />
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: C.muted }}>
                      <span>Opening: {b.opening_balance_days}d</span>
                      <span>Accrued: {b.accrued_days}d</span>
                      <span>Taken: {b.taken_days}d</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* CALENDAR TAB */}
      {tab === 'calendar' && (
        <div>
          <p style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>
            Approved leave — {now.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 8 }}>
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 11, color: C.muted, padding: '4px 0' }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = new Date(now.getFullYear(), now.getMonth(), i + 1)
              const dayStr = day.toISOString().slice(0, 10)
              const onLeave = approvedLeave.filter(l => l.start_date <= dayStr && l.end_date >= dayStr)
              const isToday = dayStr === todayStr
              return (
                <div key={i} style={{ minHeight: 56, borderRadius: 8, padding: '6px 8px', background: isToday ? 'rgba(127,184,151,0.1)' : C.card, border: `1px solid ${isToday ? C.green + '44' : C.border}` }}>
                  <p style={{ fontSize: 11, fontWeight: isToday ? 700 : 400, color: isToday ? C.green : C.muted, marginBottom: 4 }}>{i + 1}</p>
                  {onLeave.slice(0, 2).map((l, li) => (
                    <div key={li} style={{ fontSize: 9, padding: '1px 4px', borderRadius: 4, background: 'rgba(127,184,151,0.15)', color: C.green, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.staff_name ?? 'Staff'}
                    </div>
                  ))}
                  {onLeave.length > 2 && <div style={{ fontSize: 9, color: C.muted }}>+{onLeave.length - 2}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
