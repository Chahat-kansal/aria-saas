'use client'
import { useEffect, useState, useCallback } from 'react'

interface LeaveRequest {
  id: string
  staff_id: string
  staff_name?: string
  leave_type: string
  start_date: string
  end_date: string
  days_taken: number
  status: string
  notes: string | null
  created_at: string
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: 'Annual leave',
  sick: 'Sick leave',
  personal: 'Personal leave',
  parental: 'Parental leave',
  other: 'Other',
}

function statusBadge(s: string) {
  if (s === 'approved') return { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' }
  if (s === 'declined') return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' }
  return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' }
}

export default function LeavePage() {
  const [leave, setLeave] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [actioning, setActioning] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ staff_id: '', leave_type: 'annual', start_date: '', end_date: '', notes: '' })
  const [staffList, setStaffList] = useState<Array<{ id: string; first_name: string; last_name: string }>>([])

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/staff/leave?status=${filter}`)
    const j = await r.json() as { leave?: LeaveRequest[] }
    setLeave(j.leave ?? [])
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/staff/members?status=active').then(r => r.json()).then((j: { members?: Array<{ id: string; first_name: string; last_name: string }> }) => {
      setStaffList(j.members ?? [])
    }).catch(() => { /* non-fatal */ })
  }, [])

  const action = async (id: string, status: 'approved' | 'declined') => {
    setActioning(id)
    await fetch(`/api/staff/leave/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setActioning(null)
    load()
  }

  const submitRequest = async () => {
    if (!form.staff_id || !form.start_date || !form.end_date) return
    await fetch('/api/staff/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setForm({ staff_id: '', leave_type: 'annual', start_date: '', end_date: '', notes: '' })
    setShowForm(false)
    load()
  }

  const INP = { background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-primary, #E8EDE7)' }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      <header className="flex justify-between items-baseline flex-wrap gap-3">
        <h1 className="text-2xl font-medium">Leave requests</h1>
        <button onClick={() => setShowForm(v => !v)}
          className="px-4 py-1.5 text-sm rounded-lg font-medium text-white"
          style={{ background: '#2D5240' }}>
          + New request
        </button>
      </header>

      {/* New leave request form */}
      {showForm && (
        <div className="rounded-xl p-4 space-y-3"
          style={{ background: 'rgba(45,82,64,0.1)', border: '1px solid rgba(45,82,64,0.3)' }}>
          <p className="text-sm font-medium" style={{ color: '#7FB897' }}>New leave request</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Staff member</label>
              <select value={form.staff_id} onChange={e => setForm(p => ({ ...p, staff_id: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INP}>
                <option value="">Select staff…</option>
                {staffList.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Leave type</label>
              <select value={form.leave_type} onChange={e => setForm(p => ({ ...p, leave_type: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INP}>
                {Object.entries(LEAVE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Start date</label>
              <input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INP} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>End date</label>
              <input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INP} />
            </div>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Notes (optional)</label>
            <input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="e.g. Doctor's appointment" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INP} />
          </div>
          <div className="flex gap-2">
            <button onClick={submitRequest} disabled={!form.staff_id || !form.start_date || !form.end_date}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40" style={{ background: '#2D5240' }}>
              Submit request
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary, #A8B5A8)' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-1.5 flex-wrap">
        {['pending', 'approved', 'declined', 'all'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className="px-3 py-1 rounded-lg text-xs capitalize"
            style={{
              background: filter === s ? 'rgba(127,184,151,0.2)' : 'rgba(255,255,255,0.05)',
              color: filter === s ? '#7FB897' : 'var(--text-secondary, #A8B5A8)',
              border: `1px solid ${filter === s ? 'rgba(127,184,151,0.3)' : 'rgba(255,255,255,0.08)'}`,
            }}>
            {s}
          </button>
        ))}
      </div>

      {/* Leave list */}
      {loading ? (
        <div className="text-center py-8 text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Loading…</div>
      ) : leave.length === 0 ? (
        <div className="text-center py-12 text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>No leave requests.</div>
      ) : (
        <div className="space-y-2">
          {leave.map(req => {
            const badge = statusBadge(req.status)
            return (
              <div key={req.id} className="rounded-xl p-4"
                style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  <div>
                    <div className="font-medium">{req.staff_name ?? 'Staff member'}</div>
                    <div className="text-sm mt-0.5" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                      {LEAVE_TYPE_LABELS[req.leave_type] ?? req.leave_type} · {req.start_date} to {req.end_date} ({req.days_taken} day{req.days_taken !== 1 ? 's' : ''})
                    </div>
                    {req.notes && <div className="text-xs mt-1 italic" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{req.notes}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full capitalize"
                      style={{ background: badge.bg, color: badge.color }}>
                      {req.status}
                    </span>
                    {req.status === 'pending' && (
                      <>
                        <button onClick={() => action(req.id, 'approved')} disabled={actioning === req.id}
                          className="text-xs px-3 py-1 rounded-lg text-white disabled:opacity-50"
                          style={{ background: '#2D5240' }}>
                          Approve
                        </button>
                        <button onClick={() => action(req.id, 'declined')} disabled={actioning === req.id}
                          className="text-xs px-3 py-1 rounded-lg disabled:opacity-50"
                          style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                          Decline
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
