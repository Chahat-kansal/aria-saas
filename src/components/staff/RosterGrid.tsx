'use client'
import type { ShiftEntry } from '@/lib/staff/roster'
import ShiftCard from './ShiftCard'

interface StaffRow {
  id: string
  name: string
  position: string
  color: string
}

interface Props {
  weekDays: string[]
  staff: StaffRow[]
  shifts: ShiftEntry[]
  onCellClick: (staffId: string, day: string) => void
  onShiftEdit: (shift: ShiftEntry) => void
  onShiftDelete: (id: string) => void
}

export default function RosterGrid({ weekDays, staff, shifts, onCellClick, onShiftEdit, onShiftDelete }: Props) {
  const shiftMap = new Map<string, ShiftEntry[]>()
  for (const s of shifts) {
    const key = `${s.staff_member_id}:${s.start_time.slice(0, 10)}`
    if (!shiftMap.has(key)) shiftMap.set(key, [])
    shiftMap.get(key)!.push(s)
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="text-left px-3 py-2 text-xs font-medium w-36 sticky left-0 z-10"
              style={{ background: '#13131a', color: 'rgba(255,255,255,0.4)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              Staff
            </th>
            {weekDays.map(day => {
              const label = new Date(day + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
              const isToday = day === new Date().toISOString().slice(0, 10)
              return (
                <th key={day} className="text-center px-2 py-2 text-xs font-medium"
                  style={{
                    background: isToday ? 'rgba(127,184,151,0.1)' : '#13131a',
                    color: isToday ? '#7FB897' : 'rgba(255,255,255,0.4)',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    borderLeft: '1px solid rgba(255,255,255,0.06)',
                  }}>
                  {label}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {staff.length === 0 ? (
            <tr>
              <td colSpan={weekDays.length + 1} className="px-3 py-8 text-center text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                No active staff found. Add staff members first.
              </td>
            </tr>
          ) : staff.map((sm, rowIdx) => (
            <tr key={sm.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: rowIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
              <td className="px-3 py-2 sticky left-0 z-10" style={{ background: rowIdx % 2 === 0 ? '#0d0d14' : '#0f0f16' }}>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-medium shrink-0"
                    style={{ background: sm.color ?? '#6366f1' }}>
                    {sm.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <div className="font-medium text-white text-xs truncate max-w-[90px]">{sm.name.split(' ')[0]}</div>
                    <div className="text-[10px] truncate max-w-[90px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{sm.position}</div>
                  </div>
                </div>
              </td>
              {weekDays.map(day => {
                const key = `${sm.id}:${day}`
                const dayShifts = shiftMap.get(key) ?? []
                const isToday = day === new Date().toISOString().slice(0, 10)
                return (
                  <td key={day}
                    onClick={() => onCellClick(sm.id, day)}
                    className="px-1 py-1 align-top cursor-pointer transition-colors"
                    style={{
                      minWidth: '90px',
                      minHeight: '56px',
                      verticalAlign: 'top',
                      borderLeft: '1px solid rgba(255,255,255,0.06)',
                      background: isToday ? 'rgba(127,184,151,0.04)' : 'transparent',
                    }}
                    title={`Add shift for ${sm.name} on ${day}`}>
                    {dayShifts.map(s => (
                      <ShiftCard key={s.id} shift={s} onEdit={onShiftEdit} onDelete={onShiftDelete} />
                    ))}
                    {dayShifts.length === 0 && (
                      <div className="h-10 rounded flex items-center justify-center text-[10px] opacity-0 hover:opacity-100 transition-opacity"
                        style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.3)' }}>
                        + Add
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
