'use client'
import { useState } from 'react'
import type { ShiftEntry } from '@/lib/staff/roster'

interface StaffOption { id: string; first_name: string; last_name: string; color: string; position: string }
interface AreaOption { id: string; name: string }

interface Props {
  initialShift?: Partial<ShiftEntry>
  day: string
  staff: StaffOption[]
  areas: AreaOption[]
  onSave: (shift: Omit<ShiftEntry, 'cost_cents' | 'hours'>) => void
  onClose: () => void
}

const INP = "w-full px-3 py-2 rounded-lg text-sm outline-none"
const INP_STYLE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }

export default function ShiftModal({ initialShift, day, staff, areas, onSave, onClose }: Props) {
  const [staffId, setStaffId] = useState(initialShift?.staff_member_id ?? '')
  const [startTime, setStartTime] = useState(initialShift?.start_time?.slice(11, 16) ?? '09:00')
  const [endTime, setEndTime] = useState(initialShift?.end_time?.slice(11, 16) ?? '17:00')
  const [breakMins, setBreakMins] = useState(String(initialShift?.break_minutes ?? 30))
  const [areaId, setAreaId] = useState(initialShift?.area_id ?? '')
  const [notes, setNotes] = useState(initialShift?.notes ?? '')

  const startMs = new Date(`${day}T${startTime}`).getTime()
  const endMs = new Date(`${day}T${endTime}`).getTime()
  const diffHours = Math.max(0, (endMs - startMs) / 3600_000 - (Number(breakMins) || 0) / 60)

  const handleSave = () => {
    if (!staffId || !startTime || !endTime) return
    const sm = staff.find(s => s.id === staffId)
    const area = areas.find(a => a.id === areaId)
    onSave({
      id: initialShift?.id ?? crypto.randomUUID(),
      staff_member_id: staffId,
      staff_name: sm ? `${sm.first_name} ${sm.last_name}` : '',
      staff_color: sm?.color ?? '#6366f1',
      outlet_id: initialShift?.outlet_id ?? null,
      area_id: areaId || null,
      area_name: area?.name ?? null,
      role: sm?.position ?? null,
      start_time: `${day}T${startTime}:00`,
      end_time: `${day}T${endTime}:00`,
      break_minutes: Number(breakMins) || 0,
      notes: notes || null,
      ai_generated: false,
      confirmed_by_staff: false,
      status: 'scheduled',
    })
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-2xl p-5 space-y-4" style={{ background: '#1a2420', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex justify-between items-baseline">
          <h2 className="text-base font-semibold text-white">
            {initialShift?.id ? 'Edit shift' : 'Add shift'} — {new Date(day + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}
          </h2>
          <button onClick={onClose} className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Staff member</label>
            <select value={staffId} onChange={e => setStaffId(e.target.value)} className={INP} style={INP_STYLE}>
              <option value="" style={{ background: '#1a2420', color: '#fff' }}>Select staff…</option>
              {staff.map(s => <option key={s.id} value={s.id} style={{ background: '#1a2420', color: '#fff' }}>{s.first_name} {s.last_name} — {s.position}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Start</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={INP} style={INP_STYLE} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>End</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={INP} style={INP_STYLE} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Break (min)</label>
              <input type="number" value={breakMins} onChange={e => setBreakMins(e.target.value)} min="0" max="120" step="15" className={INP} style={INP_STYLE} />
            </div>
          </div>

          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{diffHours.toFixed(1)}h paid · cost calculated on save</p>

          {areas.length > 0 && (
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Area (optional)</label>
              <select value={areaId} onChange={e => setAreaId(e.target.value)} className={INP} style={INP_STYLE}>
                <option value="" style={{ background: '#1a2420', color: '#fff' }}>Any area</option>
                {areas.map(a => <option key={a.id} value={a.id} style={{ background: '#1a2420', color: '#fff' }}>{a.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Opening duties" className={INP} style={INP_STYLE} />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={handleSave} disabled={!staffId}
            className="flex-1 py-2 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
            style={{ background: '#2D5240', color: '#fff' }}>
            {initialShift?.id ? 'Update shift' : 'Add shift'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
