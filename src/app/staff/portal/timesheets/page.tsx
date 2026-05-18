'use client'
import { useEffect, useState } from 'react'

interface Timesheet {
  id: string; clock_in: string; clock_out: string | null
  hours_worked: number; pay_estimate: string | null
  status: string; approved: boolean; notes: string | null
}

export default function StaffTimesheetsPage() {
  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [totalHours, setTotalHours] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/staff/portal/timesheets?weeks=4')
      .then(r => r.json())
      .then((j: { timesheets?: Timesheet[]; totalHours?: number }) => {
        setTimesheets(j.timesheets ?? [])
        setTotalHours(Number(j.totalHours) || 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-sm py-8 text-center" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Loading…</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-baseline">
        <h1 className="text-xl font-medium">My Hours</h1>
        <span className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          {totalHours.toFixed(1)}h last 4 weeks
        </span>
      </div>

      {timesheets.length === 0 ? (
        <div className="text-sm text-center py-8" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          No timesheet records yet.
        </div>
      ) : (
        <div className="space-y-2">
          {timesheets.map(t => (
            <div key={t.id} className="rounded-xl p-3"
              style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
              <div className="flex justify-between items-baseline">
                <div className="font-medium text-sm">
                  {new Date(t.clock_in).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${t.approved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                  {t.approved ? 'Approved' : t.status === 'active' ? 'Active' : 'Pending'}
                </span>
              </div>
              <div className="text-sm mt-0.5" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                {t.clock_in.slice(11, 16)}
                {t.clock_out ? ` – ${t.clock_out.slice(11, 16)}` : ' – Active'}
                {' · '}{t.hours_worked.toFixed(1)}h
                {t.pay_estimate && ` · Est. ${t.pay_estimate}`}
              </div>
              {t.notes && <div className="text-xs mt-1 italic" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{t.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
