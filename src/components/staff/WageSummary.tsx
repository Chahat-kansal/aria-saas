'use client'
import type { RosterSummary } from '@/lib/staff/roster'

interface Props {
  summary: RosterSummary
  weekDays: string[]
}

export default function WageSummary({ summary, weekDays }: Props) {
  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex justify-between items-baseline flex-wrap gap-2">
        <div className="flex gap-4 text-sm flex-wrap">
          <span className="font-medium text-white">
            ${(summary.total_cost_cents / 100).toFixed(2)}
            <span className="font-normal ml-1" style={{ color: 'rgba(255,255,255,0.5)' }}>est. wage cost</span>
          </span>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>{summary.total_hours.toFixed(1)}h total</span>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>{Object.keys(summary.by_staff).length} staff</span>
        </div>
        {summary.conflicts.length > 0 && (
          <span className="text-xs text-red-400 font-medium">
            ⚠ {summary.conflicts.length} conflict{summary.conflicts.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {summary.conflicts.length > 0 && (
        <div className="text-xs text-red-400 space-y-0.5">
          {summary.conflicts.map((c, i) => (
            <div key={i}>{c.staff_name}: {c.shift1} overlaps {c.shift2}</div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-7 gap-1 text-xs">
        {weekDays.map(day => {
          const d = summary.by_day[day]
          const label = new Date(day + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short' })
          return (
            <div key={day} className="text-center">
              <div style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</div>
              <div className="font-medium text-white">{d ? `$${(d.cost_cents / 100).toFixed(0)}` : '—'}</div>
              <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{d ? `${d.shift_count}sh` : ''}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
