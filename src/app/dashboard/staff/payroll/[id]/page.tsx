'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface PayrollRun {
  id: string
  period_start: string
  period_end: string
  status: string
  total_gross_cents: number
  total_super_cents: number
  total_net_estimate_cents: number
  staff_count: number
  approved_at: string | null
}

interface LineItem {
  id: string
  staff_name: string
  position: string
  employment_type: string
  hours_worked: number
  hourly_rate_cents: number
  gross_pay_cents: number
  superannuation_rate: number
  super_cents: number
  net_estimate_cents: number
}

const dollar = (cents: number) => `$${((Number(cents) || 0) / 100).toFixed(2)}`

export default function PayrollRunPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [run, setRun] = useState<PayrollRun | null>(null)
  const [lines, setLines] = useState<LineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    fetch(`/api/staff/payroll/${id}`)
      .then(r => r.json())
      .then((j: { run?: PayrollRun; lines?: LineItem[] }) => {
        setRun(j.run ?? null)
        setLines(j.lines ?? [])
        setLoading(false)
      })
  }, [id])

  const approve = async () => {
    if (!confirm('Approve this payroll run? This will lock all included timesheets.')) return
    setApproving(true)
    const r = await fetch(`/api/staff/payroll/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    })
    setApproving(false)
    if (r.ok) {
      showToast('Payroll run approved')
      setRun(prev => prev ? { ...prev, status: 'approved', approved_at: new Date().toISOString() } : prev)
    } else {
      showToast('Approval failed')
    }
  }

  if (loading) return <div className="p-6 text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Loading…</div>
  if (!run) return <div className="p-6 text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Payroll run not found.</div>

  return (
    <div className="p-6 max-w-4xl space-y-6" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      <header className="flex justify-between items-baseline flex-wrap gap-4">
        <div>
          <button onClick={() => router.back()} className="text-xs mb-1 block hover:underline" style={{ color: '#7FB897' }}>
            ← Back to payroll
          </button>
          <h1 className="text-2xl font-medium">
            Payroll {run.period_start} – {run.period_end}
          </h1>
        </div>
        <div className="flex gap-2">
          <a href={`/api/staff/payroll/${id}/export`}
            className="px-3 py-1.5 text-sm rounded hover:opacity-80"
            style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-secondary, #A8B5A8)' }}>
            Xero CSV ↓
          </a>
          {run.status === 'draft' && (
            <button onClick={approve} disabled={approving}
              className="px-4 py-1.5 text-sm rounded font-medium text-white disabled:opacity-50"
              style={{ background: '#16a34a' }}>
              {approving ? 'Approving…' : 'Approve payroll'}
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total gross', value: dollar(run.total_gross_cents) },
          { label: 'Superannuation', value: dollar(run.total_super_cents) },
          { label: 'Net estimate', value: dollar(run.total_net_estimate_cents) },
        ].map(c => (
          <div key={c.label} className="rounded-lg p-4"
            style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{c.label}</div>
            <div className="text-xl font-medium">{c.value}</div>
          </div>
        ))}
      </div>

      {run.status === 'approved' && run.approved_at && (
        <p className="text-xs text-emerald-400">
          Approved {new Date(run.approved_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--bg-elevated, #1A2620)', borderBottom: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
              {['Staff', 'Position', 'Hours', 'Rate/hr', 'Gross', 'Super (%)', 'Net'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wide font-medium"
                  style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map(l => (
              <tr key={l.id} style={{ borderBottom: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
                <td className="px-4 py-3 font-medium">{l.staff_name}</td>
                <td className="px-4 py-3" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{l.position}</td>
                <td className="px-4 py-3">{Number(l.hours_worked).toFixed(1)}h</td>
                <td className="px-4 py-3">{dollar(l.hourly_rate_cents)}</td>
                <td className="px-4 py-3 font-medium">{dollar(l.gross_pay_cents)}</td>
                <td className="px-4 py-3" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                  {dollar(l.super_cents)} ({Number(l.superannuation_rate).toFixed(1)}%)
                </td>
                <td className="px-4 py-3">{dollar(l.net_estimate_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-lg z-50"
          style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.08))' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
