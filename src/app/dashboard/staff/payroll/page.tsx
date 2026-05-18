'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface PayrollRun {
  id: string
  period_start: string
  period_end: string
  status: string
  total_gross_cents: number
  total_super_cents: number
  staff_count: number
  created_at: string
}

function statusBadge(s: string) {
  if (s === 'approved') return 'bg-emerald-500/20 text-emerald-400'
  if (s === 'paid') return 'bg-blue-500/20 text-blue-400'
  return 'bg-yellow-500/20 text-yellow-400'
}

function getDefaultPeriod() {
  const now = new Date()
  const day = now.getDate()
  const month = now.getMonth()
  const year = now.getFullYear()
  const pad = (n: number) => String(n).padStart(2, '0')
  if (day <= 14) {
    return {
      start: `${year}-${pad(month + 1)}-01`,
      end: `${year}-${pad(month + 1)}-14`,
    }
  }
  const lastDay = new Date(year, month + 1, 0).getDate()
  return {
    start: `${year}-${pad(month + 1)}-15`,
    end: `${year}-${pad(month + 1)}-${lastDay}`,
  }
}

export default function PayrollPage() {
  const [runs, setRuns] = useState<PayrollRun[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [toast, setToast] = useState('')
  const defaultPeriod = getDefaultPeriod()
  const [form, setForm] = useState({ period_start: defaultPeriod.start, period_end: defaultPeriod.end })

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500) }

  const load = () => {
    fetch('/api/staff/payroll').then(r => r.json()).then((j: { runs?: PayrollRun[] }) => {
      setRuns(j.runs ?? [])
      setLoading(false)
    })
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    if (!form.period_start || !form.period_end) return
    setCreating(true)
    const r = await fetch('/api/staff/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const j = await r.json() as { run_id?: string; line_count?: number; error?: string }
    setCreating(false)
    if (r.ok) {
      setShowForm(false)
      showToast(`Payroll run created — ${j.line_count} staff`)
      load()
    } else {
      showToast(j.error ?? 'Failed to create payroll run')
    }
  }

  return (
    <div className="p-6 max-w-4xl space-y-6" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      <header className="flex justify-between items-baseline flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-medium">Payroll</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
            Payroll runs from approved timesheets
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: '#2D5240', color: '#7FB897' }}>
          {showForm ? 'Cancel' : '+ New payroll run'}
        </button>
      </header>

      {showForm && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.08))' }}>
          <p className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
            Aggregates all approved timesheets in the selected period into a payroll run.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Period start</label>
              <input type="date" value={form.period_start}
                onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-primary, #E8EDE7)' }} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Period end</label>
              <input type="date" value={form.period_end}
                onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-primary, #E8EDE7)' }} />
            </div>
          </div>
          <button onClick={create} disabled={creating}
            className="w-full py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: '#2D5240', color: '#7FB897' }}>
            {creating ? 'Generating…' : 'Generate payroll run'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Loading…</div>
      ) : runs.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <p className="text-lg" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>No payroll runs yet.</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
            Approve timesheets first, then generate a payroll run.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map(run => (
            <Link key={run.id} href={`/dashboard/staff/payroll/${run.id}`}
              className="block rounded-xl p-4 transition-colors"
              style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
              <div className="flex justify-between items-baseline flex-wrap gap-2">
                <div>
                  <div className="font-medium">{run.period_start} – {run.period_end}</div>
                  <div className="text-sm mt-0.5" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                    {run.staff_count} staff ·
                    Gross: ${((Number(run.total_gross_cents) || 0) / 100).toFixed(2)} ·
                    Super: ${((Number(run.total_super_cents) || 0) / 100).toFixed(2)}
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded capitalize ${statusBadge(run.status)}`}>
                  {run.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-lg z-50"
          style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.08))' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
