'use client'
import type { ShiftEntry } from '@/lib/staff/roster'
import ShiftCard from './ShiftCard'

interface StaffRow {
  id: string
  name: string
  position: string
  color: string
}

export interface LeaveRecord {
  staff_member_id: string
  start_date: string
  end_date: string
  leave_type: string
}

export interface AvailRow {
  staff_member_id: string
  day_of_week: number
  available: boolean
  start_time: string | null
  end_time: string | null
}

interface Props {
  weekDays: string[]
  staff: StaffRow[]
  shifts: ShiftEntry[]
  leave: LeaveRecord[]
  availability: AvailRow[]
  onCellClick: (staffId: string, day: string) => void
  onShiftEdit: (shift: ShiftEntry) => void
  onShiftDelete: (id: string) => void
}

function isInLeave(day: string, l: LeaveRecord) {
  return day >= l.start_date && day <= l.end_date
}

export default function RosterGrid({ weekDays, staff, shifts, leave, availability, onCellClick, onShiftEdit, onShiftDelete }: Props) {
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
          ) : staff.map((sm, rowIdx) => {
            const smLeave = leave.filter(l => l.staff_member_id === sm.id)
            const smAvail = availability.filter(a => a.staff_member_id === sm.id)
            const hasLeaveThisWeek = smLeave.some(l => weekDays.some(d => isInLeave(d, l)))
            const hasUnavailableDay = smAvail.some(a => !a.available && weekDays.some(d => new Date(d + 'T12:00:00').getDay() === a.day_of_week))
            return (
              <tr key={sm.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: rowIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                <td className="px-3 py-2 sticky left-0 z-10" style={{ background: rowIdx % 2 === 0 ? '#0d0d14' : '#0f0f16' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-medium shrink-0"
                      style={{ background: sm.color ?? '#6366f1' }}>
                      {sm.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <div className="font-medium text-white text-xs flex items-center gap-0.5">
                        <span className="truncate max-w-[72px]">{sm.name.split(' ')[0]}</span>
                        {hasLeaveThisWeek && <span title="On leave this week" style={{ fontSize: 10, lineHeight: 1 }}>🏖</span>}
                        {!hasLeaveThisWeek && hasUnavailableDay && <span title="Has unavailable day this week" style={{ fontSize: 10, lineHeight: 1 }}>🕐</span>}
                      </div>
                      <div className="text-[10px] truncate max-w-[90px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{sm.position}</div>
                    </div>
                  </div>
                </td>
                {weekDays.map(day => {
                  const key = `${sm.id}:${day}`
                  const dayShifts = shiftMap.get(key) ?? []
                  const isToday = day === new Date().toISOString().slice(0, 10)
                  const dow = new Date(day + 'T12:00:00').getDay()
                  const activeLeave = smLeave.find(l => isInLeave(day, l))
                  const unavailRow = smAvail.find(a => a.day_of_week === dow && !a.available)
                  const hasShifts = dayShifts.length > 0

                  let cellBg = isToday ? 'rgba(127,184,151,0.04)' : 'transparent'
                  let borderLeft = '1px solid rgba(255,255,255,0.06)'
                  if (activeLeave) {
                    cellBg = 'rgba(245,158,11,0.15)'
                    borderLeft = hasShifts ? '2px solid rgba(239,68,68,0.7)' : '1px solid rgba(245,158,11,0.35)'
                  } else if (unavailRow) {
                    cellBg = 'repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(107,114,128,0.1) 4px,rgba(107,114,128,0.1) 8px)'
                  }

                  return (
                    <td key={day}
                      onClick={() => onCellClick(sm.id, day)}
                      className="px-1 py-1 align-top cursor-pointer"
                      style={{ minWidth: '90px', verticalAlign: 'top', borderLeft, background: cellBg }}
                      title={activeLeave
                        ? `${sm.name.split(' ')[0]}: ${activeLeave.leave_type.replace(/_/g, ' ')} leave`
                        : unavailRow ? `${sm.name.split(' ')[0]}: unavailable`
                        : `Add shift for ${sm.name}`}>
                      {activeLeave && (
                        <div className="text-[9px] font-medium px-1 py-0.5 mb-0.5 rounded" style={{ color: '#F59E0B', background: 'rgba(245,158,11,0.2)', display: 'inline-block' }}>
                          {activeLeave.leave_type.replace(/_/g, ' ')}
                        </div>
                      )}
                      {!activeLeave && unavailRow && (
                        <div className="text-[9px] px-1 mb-0.5" style={{ color: 'rgba(107,114,128,0.7)' }}>unavail</div>
                      )}
                      {dayShifts.map(s => (
                        <ShiftCard key={s.id} shift={s} onEdit={onShiftEdit} onDelete={onShiftDelete} />
                      ))}
                      {!hasShifts && !activeLeave && !unavailRow && (
                        <div className="h-10 rounded flex items-center justify-center text-[10px] opacity-0 hover:opacity-100 transition-opacity"
                          style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.3)' }}>
                          + Add
                        </div>
                      )}
                      {hasShifts && (activeLeave || unavailRow) && (
                        <div className="text-[9px] mt-0.5 px-1" style={{ color: '#ef4444' }}>⚠ conflict</div>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
