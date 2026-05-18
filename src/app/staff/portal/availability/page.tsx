'use client'
import { useEffect, useState, useCallback } from 'react'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface Availability {
  id: string
  day_of_week: number | null
  specific_date: string | null
  unavailable_from: string | null
  unavailable_until: string | null
  reason: string | null
  is_recurring: boolean
}

interface RecurringDay {
  day_of_week: number
  unavailable_from: string
  unavailable_until: string
  reason: string
}

const INP = { background: 'var(--bg-page, #0E1411)', border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-primary, #E8EDE7)' }

export default function StaffAvailabilityPage() {
  const [availability, setAvailability] = useState<Availability[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  // Recurring unavailability per day
  const [recurringDays, setRecurringDays] = useState<Set<number>>(new Set())
  const [recurringConfig, setRecurringConfig] = useState<Record<number, { from: string; until: string; reason: string }>>({})

  // One-off date
  const [showOneOff, setShowOneOff] = useState(false)
  const [oneOff, setOneOff] = useState({ specific_date: '', unavailable_from: '', unavailable_until: '', reason: '' })
  const [savingOneOff, setSavingOneOff] = useState(false)

  const load = useCallback(() => {
    fetch('/api/staff/portal/availability').then(r => r.json()).then((j: { availability?: Availability[] }) => {
      const avail = j.availability ?? []
      setAvailability(avail)
      // Hydrate recurring state
      const days = new Set<number>()
      const config: Record<number, { from: string; until: string; reason: string }> = {}
      for (const a of avail) {
        if (a.is_recurring && a.day_of_week != null) {
          days.add(a.day_of_week)
          config[a.day_of_week] = {
            from: a.unavailable_from ?? '',
            until: a.unavailable_until ?? '',
            reason: a.reason ?? '',
          }
        }
      }
      setRecurringDays(days)
      setRecurringConfig(config)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const toggleDay = (dow: number) => {
    setRecurringDays(prev => {
      const next = new Set(prev)
      if (next.has(dow)) next.delete(dow)
      else next.add(dow)
      return next
    })
  }

  const saveRecurring = async () => {
    setSaving(true)
    const recurring: RecurringDay[] = [...recurringDays].map(dow => ({
      day_of_week: dow,
      unavailable_from: recurringConfig[dow]?.from || '00:00',
      unavailable_until: recurringConfig[dow]?.until || '23:59',
      reason: recurringConfig[dow]?.reason || '',
    }))
    const r = await fetch('/api/staff/portal/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ replace_recurring: true, recurring }),
    })
    if (r.ok) { showToast('Recurring availability saved'); load() }
    else showToast('Save failed — try again')
    setSaving(false)
  }

  const saveOneOff = async () => {
    if (!oneOff.specific_date) { showToast('Please select a date'); return }
    setSavingOneOff(true)
    const r = await fetch('/api/staff/portal/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        specific_date: oneOff.specific_date,
        unavailable_from: oneOff.unavailable_from || null,
        unavailable_until: oneOff.unavailable_until || null,
        reason: oneOff.reason || null,
      }),
    })
    if (r.ok) {
      setOneOff({ specific_date: '', unavailable_from: '', unavailable_until: '', reason: '' })
      setShowOneOff(false)
      showToast('Unavailability added')
      load()
    } else {
      showToast('Save failed — try again')
    }
    setSavingOneOff(false)
  }

  const oneOffDates = availability.filter(a => !a.is_recurring && a.specific_date)

  if (loading) return <div className="text-sm py-8 text-center" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Loading…</div>

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-medium">My Availability</h1>

      {/* Recurring unavailability */}
      <section>
        <div className="flex justify-between items-baseline mb-3">
          <h2 className="font-medium text-sm">Weekly recurring</h2>
          <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Tap a day you can't work</p>
        </div>
        <div className="space-y-2">
          {DAYS.map((day, dow) => {
            const active = recurringDays.has(dow)
            const cfg = recurringConfig[dow] ?? { from: '', until: '', reason: '' }
            return (
              <div key={dow} className="rounded-xl overflow-hidden"
                style={{ border: `1px solid ${active ? 'rgba(239,68,68,0.3)' : 'var(--divider, rgba(232,237,231,0.04))'}` }}>
                <button onClick={() => toggleDay(dow)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm"
                  style={{ background: active ? 'rgba(239,68,68,0.08)' : 'var(--bg-elevated, #1A2620)' }}>
                  <span className="font-medium">{day}</span>
                  <span className="text-xs" style={{ color: active ? '#ef4444' : 'var(--text-secondary, #A8B5A8)' }}>
                    {active ? 'Unavailable' : 'Available'}
                  </span>
                </button>
                {active && (
                  <div className="px-4 pb-3 grid grid-cols-2 gap-2" style={{ background: 'rgba(239,68,68,0.04)' }}>
                    <div>
                      <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>From (leave blank = all day)</label>
                      <input type="time" value={cfg.from}
                        onChange={e => setRecurringConfig(c => ({ ...c, [dow]: { ...c[dow] ?? {}, from: e.target.value, until: c[dow]?.until ?? '', reason: c[dow]?.reason ?? '' } }))}
                        className="w-full px-2 py-1.5 rounded text-xs outline-none" style={INP} />
                    </div>
                    <div>
                      <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Until</label>
                      <input type="time" value={cfg.until}
                        onChange={e => setRecurringConfig(c => ({ ...c, [dow]: { ...c[dow] ?? {}, until: e.target.value, from: c[dow]?.from ?? '', reason: c[dow]?.reason ?? '' } }))}
                        className="w-full px-2 py-1.5 rounded text-xs outline-none" style={INP} />
                    </div>
                    <div className="col-span-2">
                      <input type="text" value={cfg.reason} placeholder="Reason (optional)"
                        onChange={e => setRecurringConfig(c => ({ ...c, [dow]: { ...c[dow] ?? {}, reason: e.target.value, from: c[dow]?.from ?? '', until: c[dow]?.until ?? '' } }))}
                        className="w-full px-2 py-1.5 rounded text-xs outline-none" style={INP} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <button onClick={saveRecurring} disabled={saving}
          className="mt-3 w-full py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
          style={{ background: '#2D5240' }}>
          {saving ? 'Saving…' : 'Save recurring availability'}
        </button>
      </section>

      {/* One-off dates */}
      <section>
        <div className="flex justify-between items-baseline mb-3">
          <h2 className="font-medium text-sm">One-off dates</h2>
          <button onClick={() => setShowOneOff(!showOneOff)} className="text-xs" style={{ color: 'var(--accent, #7FB897)' }}>
            {showOneOff ? 'Cancel' : '+ Add date'}
          </button>
        </div>

        {showOneOff && (
          <div className="rounded-xl p-4 space-y-3 mb-3"
            style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Date</label>
                <input type="date" value={oneOff.specific_date} onChange={e => setOneOff(p => ({ ...p, specific_date: e.target.value }))}
                  className="w-full px-2 py-2 rounded text-sm outline-none" style={INP} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>From</label>
                <input type="time" value={oneOff.unavailable_from} onChange={e => setOneOff(p => ({ ...p, unavailable_from: e.target.value }))}
                  className="w-full px-2 py-2 rounded text-sm outline-none" style={INP} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Until</label>
                <input type="time" value={oneOff.unavailable_until} onChange={e => setOneOff(p => ({ ...p, unavailable_until: e.target.value }))}
                  className="w-full px-2 py-2 rounded text-sm outline-none" style={INP} />
              </div>
            </div>
            <input type="text" value={oneOff.reason} onChange={e => setOneOff(p => ({ ...p, reason: e.target.value }))}
              placeholder="Reason (optional)" className="w-full px-3 py-2 rounded text-sm outline-none" style={INP} />
            <button onClick={saveOneOff} disabled={savingOneOff || !oneOff.specific_date}
              className="w-full py-2 rounded text-sm font-medium text-white disabled:opacity-40"
              style={{ background: '#2D5240' }}>
              {savingOneOff ? 'Saving…' : 'Add unavailability'}
            </button>
          </div>
        )}

        {oneOffDates.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>No one-off dates set.</p>
        ) : (
          <div className="space-y-2">
            {oneOffDates.map(a => (
              <div key={a.id} className="rounded-xl p-3 flex justify-between items-start"
                style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
                <div>
                  <div className="text-sm font-medium">
                    {a.specific_date ? new Date(a.specific_date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) : ''}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                    {a.unavailable_from && a.unavailable_until
                      ? `${a.unavailable_from} – ${a.unavailable_until}`
                      : 'All day'}
                    {a.reason && ` · ${a.reason}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-sm font-medium z-50"
          style={{ background: '#2D5240', color: '#7FB897', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
