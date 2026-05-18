'use client'
import { useEffect, useState, useCallback } from 'react'

interface Shift {
  week_start: string; start_time: string; end_time: string
  hours: number; role: string | null; area_name: string | null
  confirmed_by_staff: boolean; shift_id: string
}

export default function StaffSchedulePage() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/staff/portal/schedule').then(r => r.json()).then((j: { shifts?: Shift[] }) => {
      setShifts(j.shifts ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const confirm = async (shift: Shift) => {
    setConfirming(shift.shift_id)
    await fetch('/api/staff/portal/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_start: shift.week_start, shift_id: shift.shift_id }),
    })
    setConfirming(null)
    load()
  }

  if (loading) return <div className="text-sm py-8 text-center" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Loading…</div>

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-medium">My Schedule</h1>
      <p className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Next 4 weeks of published shifts</p>

      {shifts.length === 0 ? (
        <div className="text-sm text-center py-8" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          No published shifts in the next 4 weeks.
        </div>
      ) : (
        <div className="space-y-3">
          {shifts.map((s, i) => {
            const date = new Date(s.start_time)
            const isToday = date.toDateString() === new Date().toDateString()
            const isTomorrow = date.toDateString() === new Date(Date.now() + 86400_000).toDateString()
            return (
              <div key={i} className="rounded-xl p-4"
                style={{
                  background: 'var(--bg-elevated, #1A2620)',
                  border: `1px solid ${isToday ? 'var(--accent, #7FB897)' : 'var(--divider, rgba(232,237,231,0.04))'}`,
                }}>
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <div className="font-medium text-sm">
                      {isToday ? <span style={{ color: 'var(--accent, #7FB897)' }}>Today · </span>
                        : isTomorrow ? <span style={{ color: 'var(--accent, #7FB897)' }}>Tomorrow · </span>
                        : null}
                      {date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}
                    </div>
                    <div className="text-sm mt-0.5" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                      {s.start_time.slice(11, 16)} – {s.end_time.slice(11, 16)} · {s.hours.toFixed(1)}h
                      {s.role && ` · ${s.role}`}
                      {s.area_name && ` @ ${s.area_name}`}
                    </div>
                  </div>
                  {!s.confirmed_by_staff ? (
                    <button onClick={() => confirm(s)} disabled={confirming === s.shift_id}
                      className="text-xs px-3 py-1.5 rounded-lg text-white disabled:opacity-50 flex-shrink-0"
                      style={{ background: '#2D5240' }}>
                      {confirming === s.shift_id ? '…' : 'Confirm'}
                    </button>
                  ) : (
                    <span className="text-xs flex-shrink-0" style={{ color: '#22c55e' }}>✓ Confirmed</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
