'use client'
import type { TimesheetEntry } from '@/lib/staff/timesheets'

interface Props {
  timesheets: TimesheetEntry[]
  onApprove: (id: string) => void
  onEdit: (id: string) => void
  approving: string | null
}

function statusBadge(t: TimesheetEntry) {
  if (t.approved) return 'bg-emerald-500/20 text-emerald-400'
  if (!t.clock_out) return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-blue-500/20 text-blue-400'
}

function statusLabel(t: TimesheetEntry) {
  if (t.approved) return 'Approved'
  if (!t.clock_out) return 'Active'
  return 'Pending'
}

export default function TimesheetTable({ timesheets, onApprove, onEdit, approving }: Props) {
  if (!timesheets.length) {
    return (
      <div className="text-center py-12 text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
        No timesheet entries for this period.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: 'var(--bg-elevated, #1A2620)', borderBottom: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
            {['Staff', 'Date', 'Clock In', 'Clock Out', 'Break', 'Hours', 'Est. Pay', 'Status', ''].map(h => (
              <th key={h} className="text-left px-3 py-2.5 text-xs uppercase tracking-wide font-medium"
                style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timesheets.map(t => (
            <tr key={t.id} style={{ borderBottom: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
              <td className="px-3 py-2.5 font-medium">{t.staff_name}</td>
              <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                {new Date(t.clock_in).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              </td>
              <td className="px-3 py-2.5">{t.clock_in.slice(11, 16)}</td>
              <td className="px-3 py-2.5">
                {t.clock_out ? t.clock_out.slice(11, 16) : <span className="text-yellow-400">Active</span>}
              </td>
              <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{t.break_minutes}m</td>
              <td className="px-3 py-2.5 font-medium">{t.hours_worked > 0 ? `${t.hours_worked.toFixed(1)}h` : '—'}</td>
              <td className="px-3 py-2.5">
                {t.total_pay_cents ? `$${(t.total_pay_cents / 100).toFixed(2)}` : '—'}
              </td>
              <td className="px-3 py-2.5">
                <span className={`text-xs px-2 py-0.5 rounded ${statusBadge(t)}`}>{statusLabel(t)}</span>
              </td>
              <td className="px-3 py-2.5">
                <div className="flex gap-1">
                  {!t.approved && t.clock_out && (
                    <button onClick={() => onApprove(t.id)} disabled={approving === t.id}
                      className="text-xs px-2 py-1 rounded text-white disabled:opacity-50"
                      style={{ background: '#2D5240' }}>
                      {approving === t.id ? '…' : 'Approve'}
                    </button>
                  )}
                  {!t.approved && (
                    <button onClick={() => onEdit(t.id)}
                      className="text-xs px-2 py-1 rounded"
                      style={{ background: 'var(--bg-surface, #0D1510)', border: '1px solid var(--divider, rgba(232,237,231,0.04))', color: 'var(--text-secondary, #A8B5A8)' }}>
                      Edit
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
