'use client'
import { useEffect, useState, useCallback } from 'react'
import TimesheetTable from '@/components/staff/TimesheetTable'
import type { TimesheetEntry } from '@/lib/staff/timesheets'

function getMondayOf(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

export default function TimesheetsPage() {
  const [weekStart, setWeekStart] = useState(() => getMondayOf(new Date()))
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([])
  const [totalHours, setTotalHours] = useState(0)
  const [totalPayCents, setTotalPayCents] = useState(0)
  const [activeCount, setActiveCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState<string | null>(null)
  const [approvingAll, setApprovingAll] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/staff/timesheets?week_start=${weekStart}`)
    const j = await r.json() as { timesheets?: TimesheetEntry[]; totalHours?: number; totalPayCents?: number; activeCount?: number }
    setTimesheets(j.timesheets ?? [])
    setTotalHours(Number(j.totalHours) || 0)
    setTotalPayCents(Number(j.totalPayCents) || 0)
    setActiveCount(Number(j.activeCount) || 0)
    setLoading(false)
  }, [weekStart])

  useEffect(() => { load() }, [load])

  const approve = async (id: string) => {
    setApproving(id)
    await fetch(`/api/staff/timesheets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true }),
    })
    setApproving(null)
    load()
  }

  const approveAll = async () => {
    setApprovingAll(true)
    for (const t of timesheets.filter(t => !t.approved && t.clock_out)) {
      await fetch(`/api/staff/timesheets/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true }),
      })
    }
    setApprovingAll(false)
    load()
  }

  const prevWeek = () => {
    const d = new Date(weekStart + 'T12:00:00Z'); d.setDate(d.getDate() - 7)
    setWeekStart(d.toISOString().slice(0, 10))
  }
  const nextWeek = () => {
    const d = new Date(weekStart + 'T12:00:00Z'); d.setDate(d.getDate() + 7)
    setWeekStart(d.toISOString().slice(0, 10))
  }
  const exportCSV = () => {
    const end = new Date(weekStart + 'T12:00:00Z'); end.setDate(end.getDate() + 6)
    window.open(`/api/staff/timesheets/report?from=${weekStart}&to=${end.toISOString().slice(0, 10)}&format=csv`)
  }

  const pendingCount = timesheets.filter(t => !t.approved && t.clock_out).length

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      <header className="flex justify-between items-baseline flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-medium">Timesheets</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
            Week of {new Date(weekStart + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV}
            className="px-3 py-1.5 text-sm rounded-lg"
            style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))', color: 'var(--text-secondary, #A8B5A8)' }}>
            Export CSV
          </button>
          {pendingCount > 0 && (
            <button onClick={approveAll} disabled={approvingAll}
              className="px-4 py-1.5 text-sm rounded-lg font-medium text-white disabled:opacity-50"
              style={{ background: '#2D5240' }}>
              {approvingAll ? 'Approving…' : `Approve all (${pendingCount})`}
            </button>
          )}
        </div>
      </header>

      {/* Week navigation */}
      <div className="flex items-center gap-2">
        <button onClick={prevWeek}
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
          ‹
        </button>
        <span className="text-sm font-medium min-w-[160px] text-center">
          {new Date(weekStart + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – {
            (() => { const d = new Date(weekStart + 'T12:00:00Z'); d.setDate(d.getDate() + 6); return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) })()
          }
        </span>
        <button onClick={nextWeek}
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
          ›
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total hours', value: `${totalHours.toFixed(1)}h` },
          { label: 'Est. labour cost', value: `$${(totalPayCents / 100).toFixed(2)}` },
          { label: 'Currently clocked in', value: String(activeCount) },
          { label: 'Pending approval', value: String(pendingCount) },
        ].map(c => (
          <div key={c.label} className="rounded-lg p-3"
            style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{c.label}</div>
            <div className="text-xl font-medium">{c.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8 text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Loading…</div>
      ) : (
        <TimesheetTable
          timesheets={timesheets}
          onApprove={approve}
          onEdit={id => alert(`Edit timesheet ${id} — inline edit coming in Sprint N`)}
          approving={approving}
        />
      )}
    </div>
  )
}
