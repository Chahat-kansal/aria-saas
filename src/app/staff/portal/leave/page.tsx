'use client'
import { useEffect, useState, useCallback } from 'react'

interface LeaveRequest {
  id: string; leave_type: string; start_date: string
  end_date: string; days_taken: number; status: string; notes: string | null
}
interface Balance { leave_type: string; remaining_days: number; accrued_days: number; taken_days: number }

const LEAVE_TYPES = [
  { value: 'annual', label: 'Annual leave' },
  { value: 'sick', label: 'Sick leave' },
  { value: 'personal', label: 'Personal leave' },
  { value: 'other', label: 'Other' },
]

function statusBadge(s: string) {
  if (s === 'approved') return { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' }
  if (s === 'declined') return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' }
  return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' }
}

const INP = { background: 'var(--bg-page, #0E1411)', border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-primary, #E8EDE7)' }

export default function StaffLeavePage() {
  const [leave, setLeave] = useState<LeaveRequest[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ leave_type: 'annual', start_date: '', end_date: '', notes: '' })

  const load = useCallback(() => {
    fetch('/api/staff/portal/leave').then(r => r.json()).then((j: { leave?: LeaveRequest[]; balances?: Balance[] }) => {
      setLeave(j.leave ?? [])
      setBalances(j.balances ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!form.start_date || !form.end_date) { setError('Please select dates'); return }
    setSubmitting(true); setError('')
    const r = await fetch('/api/staff/portal/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const j = await r.json() as { error?: string }
    if (r.ok) {
      setShowForm(false)
      setForm({ leave_type: 'annual', start_date: '', end_date: '', notes: '' })
      load()
    } else {
      setError(j.error ?? 'Failed to submit')
    }
    setSubmitting(false)
  }

  if (loading) return <div className="text-sm py-8 text-center" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Loading…</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-baseline">
        <h1 className="text-xl font-medium">Leave</h1>
        <button onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 rounded-lg text-sm text-white"
          style={{ background: '#2D5240' }}>
          {showForm ? 'Cancel' : '+ Request leave'}
        </button>
      </div>

      {/* Balances */}
      {balances.length > 0 && (
        <div className="rounded-xl p-4 space-y-2"
          style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
          <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Your balances</div>
          {balances.map(b => (
            <div key={b.leave_type} className="flex justify-between text-sm">
              <span className="capitalize" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{b.leave_type.replace('_', ' ')}</span>
              <span><span className="font-medium">{b.remaining_days}d</span> <span style={{ color: 'var(--text-secondary, #A8B5A8)' }}>remaining</span></span>
            </div>
          ))}
        </div>
      )}

      {/* Request form */}
      {showForm && (
        <div className="rounded-xl p-4 space-y-3"
          style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Leave type</label>
            <select value={form.leave_type} onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))}
              className="w-full px-3 py-2 rounded text-sm outline-none" style={INP}>
              {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>From</label>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full px-2 py-2 rounded text-sm outline-none" style={INP} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>To</label>
              <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                className="w-full px-2 py-2 rounded text-sm outline-none" style={INP} />
            </div>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Notes (optional)</label>
            <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Reason for leave…" className="w-full px-3 py-2 rounded text-sm outline-none" style={INP} />
          </div>
          {error && <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>}
          <button onClick={submit} disabled={submitting}
            className="w-full py-2 rounded text-sm font-medium text-white disabled:opacity-50"
            style={{ background: '#2D5240' }}>
            {submitting ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      )}

      {/* History */}
      <div className="space-y-2">
        {leave.length === 0 ? (
          <div className="text-sm text-center py-6" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>No leave requests yet.</div>
        ) : leave.map(req => {
          const badge = statusBadge(req.status)
          return (
            <div key={req.id} className="rounded-xl p-3"
              style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-medium capitalize">{req.leave_type.replace('_', ' ')}</span>
                <span className="text-xs px-2 py-0.5 rounded capitalize" style={{ background: badge.bg, color: badge.color }}>{req.status}</span>
              </div>
              <div className="text-sm mt-0.5" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                {new Date(req.start_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                {' – '}
                {new Date(req.end_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                {' · '}{req.days_taken} day{Number(req.days_taken) !== 1 ? 's' : ''}
              </div>
              {req.notes && <div className="text-xs mt-1 italic" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{req.notes}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
