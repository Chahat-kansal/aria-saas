'use client'
import type { ShiftEntry } from '@/lib/staff/roster'

interface Props {
  shift: ShiftEntry
  onEdit: (shift: ShiftEntry) => void
  onDelete: (id: string) => void
  compact?: boolean
}

export default function ShiftCard({ shift, onEdit, onDelete, compact }: Props) {
  const start = shift.start_time.slice(11, 16)
  const end = shift.end_time.slice(11, 16)
  const cost = (shift.cost_cents / 100).toFixed(0)
  const color = shift.staff_color ?? '#6366f1'

  return (
    <div
      className="rounded px-1.5 py-1 text-xs cursor-pointer group relative select-none mb-1"
      style={{ background: color + '33', borderLeft: `3px solid ${color}` }}
      onClick={() => onEdit(shift)}
    >
      {shift.ai_generated && (
        <span className="absolute top-0.5 right-4 text-[9px] opacity-60">✨</span>
      )}
      <div className="font-medium truncate" style={{ color }}>
        {shift.staff_name.split(' ')[0]}
      </div>
      {!compact && (
        <>
          <div className="truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>{start}–{end}</div>
          <div style={{ color: 'rgba(255,255,255,0.4)' }}>${cost} · {shift.hours.toFixed(1)}h</div>
        </>
      )}
      <button
        onClick={e => { e.stopPropagation(); onDelete(shift.id) }}
        className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-500 text-[10px] leading-none"
      >
        ✕
      </button>
    </div>
  )
}
