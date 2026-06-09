'use client'
import { useEffect, useState, useCallback } from 'react'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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

// ─── Design tokens — same palette as other portal pages ─────────────────
const CARD      = '#ffffff'
const INK       = '#1d2a24'
const MUTED     = '#6b7d74'
const LINE      = '#e6ece8'
const SAGE      = '#7FB897'
const DEEP      = '#2D5240'
const SAGE_TINT = '#eef6f1'
const AMBER     = '#BA7517'
const SHADOW    = '0 1px 2px rgba(45,82,64,.06), 0 8px 24px rgba(45,82,64,.06)'

// Light-mode input style (replaces dark INP from previous build)
const INP = { background: CARD, border: '1px solid ' + LINE, color: INK }

// ─── Skeleton ─────────────────────────────────────────────────────────────
function Bone({ h = 16, r = 8, w = '100%' }: { h?: number; r?: number; w?: string | number }) {
  return <div style={{ height: h, width: w, borderRadius: r, background: 'rgba(45,82,64,.08)' }} />
}

function SkeletonDayRow() {
  return (
    <div style={{
      background: CARD, borderRadius: 14, boxShadow: SHADOW,
      border: '1px solid ' + LINE, borderLeft: '3px solid rgba(127,184,151,.25)',
      padding: '13px 16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Bone h={14} r={5} w="28%" />
        <Bone h={22} r={99} w={82} />
      </div>
    </div>
  )
}

// ─── Section label ────────────────────────────────────────────────────────
function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase',
      color: MUTED, margin: '0 4px 10px', fontWeight: 600,
    }}>
      {text}
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────
export default function StaffAvailabilityPage() {
  const [availability,   setAvailability]   = useState<Availability[]>([])
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [toast,          setToast]          = useState('')

  const [recurringDays,   setRecurringDays]   = useState<Set<number>>(new Set())
  const [recurringConfig, setRecurringConfig] = useState<Record<number, { from: string; until: string; reason: string }>>({})

  const [showOneOff,   setShowOneOff]   = useState(false)
  const [oneOff,       setOneOff]       = useState({ specific_date: '', unavailable_from: '', unavailable_until: '', reason: '' })
  const [savingOneOff, setSavingOneOff] = useState(false)

  // ── load() — PRESERVED EXACTLY ──────────────────────────────────────────
  const load = useCallback(() => {
    fetch('/api/staff/portal/availability').then(r => r.json()).then((j: { availability?: Availability[] }) => {
      const avail = j.availability ?? []
      setAvailability(avail)
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

  // ── showToast() — PRESERVED EXACTLY ─────────────────────────────────────
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  // ── toggleDay() — PRESERVED EXACTLY ─────────────────────────────────────
  const toggleDay = (dow: number) => {
    setRecurringDays(prev => {
      const next = new Set(prev)
      if (next.has(dow)) next.delete(dow)
      else next.add(dow)
      return next
    })
  }

  // ── saveRecurring() — PRESERVED EXACTLY ─────────────────────────────────
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

  // ── saveOneOff() — PRESERVED EXACTLY ────────────────────────────────────
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

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) return (
    <div>
      <div style={{ paddingBottom: 16, marginBottom: 22, borderBottom: '1px solid ' + LINE }}>
        <div className="animate-pulse"><Bone h={26} r={6} w="40%" /></div>
      </div>
      <div className="animate-pulse" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[0,1,2,3,4,5,6].map(i => <SkeletonDayRow key={i} />)}
      </div>
    </div>
  )

  return (
    <div>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{ paddingBottom: 16, marginBottom: 22, borderBottom: '1px solid ' + LINE }}>
        <h1 style={{
          fontFamily: 'var(--font-display, serif)',
          fontSize: 26, fontWeight: 600, color: INK,
          margin: 0, lineHeight: 1.15,
        }}>
          My Availability
        </h1>
        <p style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
          Let your manager know when you can't work
        </p>
      </div>

      {/* ── Weekly recurring section ──────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <SectionLabel text="Weekly recurring" />
          <span style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>Tap a day you can't work</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {DAYS.map((day, dow) => {
            const active = recurringDays.has(dow)
            const cfg    = recurringConfig[dow] ?? { from: '', until: '', reason: '' }
            return (
              <div key={dow} style={{
                background: CARD, borderRadius: 14,
                boxShadow: SHADOW,
                border: '1px solid ' + (active ? 'rgba(186,117,23,.25)' : LINE),
                borderLeft: '3px solid ' + (active ? AMBER : SAGE),
                overflow: 'hidden',
              }}>
                {/* Day toggle row */}
                <button
                  onClick={() => toggleDay(dow)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '13px 16px',
                    background: active ? 'rgba(186,117,23,.05)' : CARD,
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 500, color: INK }}>{day}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    padding: '3px 10px', borderRadius: 999,
                    background: active ? 'rgba(186,117,23,.12)' : SAGE_TINT,
                    color: active ? AMBER : DEEP,
                  }}>
                    {active ? 'Unavailable' : 'Available'}
                  </span>
                </button>

                {/* Expanded time + reason inputs (when unavailable) */}
                {active && (
                  <div style={{
                    padding: '12px 16px 14px',
                    borderTop: '1px dashed ' + LINE,
                    background: 'rgba(186,117,23,.03)',
                  }}>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>
                          From (blank = all day)
                        </label>
                        {/* onChange PRESERVED EXACTLY */}
                        <input type="time" value={cfg.from}
                          onChange={e => setRecurringConfig(c => ({ ...c, [dow]: { ...c[dow] ?? {}, from: e.target.value, until: c[dow]?.until ?? '', reason: c[dow]?.reason ?? '' } }))}
                          className="w-full rounded-lg outline-none"
                          style={{ ...INP, padding: '7px 10px', fontSize: 13 }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>
                          Until
                        </label>
                        {/* onChange PRESERVED EXACTLY */}
                        <input type="time" value={cfg.until}
                          onChange={e => setRecurringConfig(c => ({ ...c, [dow]: { ...c[dow] ?? {}, until: e.target.value, from: c[dow]?.from ?? '', reason: c[dow]?.reason ?? '' } }))}
                          className="w-full rounded-lg outline-none"
                          style={{ ...INP, padding: '7px 10px', fontSize: 13 }}
                        />
                      </div>
                      <div className="col-span-2">
                        {/* onChange PRESERVED EXACTLY */}
                        <input type="text" value={cfg.reason} placeholder="Reason (optional)"
                          onChange={e => setRecurringConfig(c => ({ ...c, [dow]: { ...c[dow] ?? {}, reason: e.target.value, from: c[dow]?.from ?? '', until: c[dow]?.until ?? '' } }))}
                          className="w-full rounded-lg outline-none"
                          style={{ ...INP, padding: '7px 10px', fontSize: 13 }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Save recurring button — onClick + disabled PRESERVED EXACTLY */}
        <button
          onClick={saveRecurring}
          disabled={saving}
          style={{
            marginTop: 14, width: '100%', padding: '12px',
            borderRadius: 12, fontSize: 14, fontWeight: 600,
            background: saving ? 'rgba(45,82,64,.55)' : DEEP,
            color: '#ffffff', border: 'none',
            cursor: saving ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {saving ? 'Saving…' : 'Save recurring availability'}
        </button>
      </div>

      {/* ── One-off dates section ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 12,
        }}>
          <SectionLabel text="One-off unavailable dates" />
          {/* Toggle button — onClick PRESERVED EXACTLY */}
          <button
            onClick={() => setShowOneOff(!showOneOff)}
            style={{
              fontSize: 13, fontWeight: 600,
              color: showOneOff ? MUTED : DEEP,
              background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit',
              marginBottom: 10,
            }}
          >
            {showOneOff ? 'Cancel' : '+ Add date'}
          </button>
        </div>

        {/* One-off form */}
        {showOneOff && (
          <div style={{
            background: CARD, borderRadius: 18, boxShadow: SHADOW,
            padding: '18px 16px', border: '1px solid ' + LINE, marginBottom: 14,
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <div style={{
              fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase',
              color: MUTED, fontWeight: 600,
            }}>
              Add unavailability
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>Date</label>
                {/* onChange PRESERVED EXACTLY */}
                <input type="date" value={oneOff.specific_date}
                  onChange={e => setOneOff(p => ({ ...p, specific_date: e.target.value }))}
                  className="w-full rounded-lg text-sm outline-none"
                  style={{ ...INP, padding: '8px 6px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>From</label>
                {/* onChange PRESERVED EXACTLY */}
                <input type="time" value={oneOff.unavailable_from}
                  onChange={e => setOneOff(p => ({ ...p, unavailable_from: e.target.value }))}
                  className="w-full rounded-lg text-sm outline-none"
                  style={{ ...INP, padding: '8px 6px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>Until</label>
                {/* onChange PRESERVED EXACTLY */}
                <input type="time" value={oneOff.unavailable_until}
                  onChange={e => setOneOff(p => ({ ...p, unavailable_until: e.target.value }))}
                  className="w-full rounded-lg text-sm outline-none"
                  style={{ ...INP, padding: '8px 6px' }}
                />
              </div>
            </div>

            {/* onChange PRESERVED EXACTLY */}
            <input type="text" value={oneOff.reason}
              onChange={e => setOneOff(p => ({ ...p, reason: e.target.value }))}
              placeholder="Reason (optional)"
              className="w-full rounded-lg text-sm outline-none"
              style={{ ...INP, padding: '9px 12px' }}
            />

            {/* onClick + disabled PRESERVED EXACTLY */}
            <button
              onClick={saveOneOff}
              disabled={savingOneOff || !oneOff.specific_date}
              style={{
                width: '100%', padding: '11px', borderRadius: 10,
                fontSize: 14, fontWeight: 600,
                background: (savingOneOff || !oneOff.specific_date) ? 'rgba(45,82,64,.45)' : DEEP,
                color: '#ffffff', border: 'none',
                cursor: (savingOneOff || !oneOff.specific_date) ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {savingOneOff ? 'Saving…' : 'Add unavailability'}
            </button>
          </div>
        )}

        {/* One-off date list */}
        {oneOffDates.length === 0 ? (
          <div style={{
            background: CARD, borderRadius: 18, boxShadow: SHADOW,
            border: '1px solid ' + LINE, padding: '28px 20px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>📆</div>
            <div style={{
              fontFamily: 'var(--font-display, serif)',
              fontSize: 16, fontWeight: 600, color: INK, marginBottom: 4,
            }}>
              No one-off dates set
            </div>
            <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
              Add a date when you&apos;re unavailable to work.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {oneOffDates.map(a => {
              // Append T12:00:00 to avoid timezone boundary issues — PRESERVED from original
              const dateObj = a.specific_date ? new Date(a.specific_date + 'T12:00:00') : null
              const timeRange = (a.unavailable_from && a.unavailable_until)
                ? a.unavailable_from + ' – ' + a.unavailable_until
                : 'All day'
              return (
                <div key={a.id} style={{
                  background: CARD, borderRadius: 14,
                  boxShadow: SHADOW,
                  border: '1px solid ' + LINE,
                  borderLeft: '3px solid ' + AMBER,
                  padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  {/* Mini amber day box */}
                  {dateObj && (
                    <div style={{
                      background: 'rgba(186,117,23,.1)',
                      borderRadius: 9, padding: '5px 9px',
                      textAlign: 'center', flexShrink: 0,
                    }}>
                      <div style={{
                        fontSize: 9, fontWeight: 700, color: AMBER,
                        letterSpacing: '.06em', textTransform: 'uppercase',
                      }}>
                        {DOW_SHORT[dateObj.getDay()]}
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-display, serif)',
                        fontSize: 18, fontWeight: 600, color: AMBER, lineHeight: 1,
                      }}>
                        {dateObj.getDate()}
                      </div>
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: INK, marginBottom: 3 }}>
                      {dateObj
                        ? dateObj.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
                        : ''}
                    </div>
                    <div style={{ fontSize: 12, color: MUTED }}>
                      {timeRange}
                      {a.reason && (
                        <span style={{ marginLeft: 4, opacity: 0.7 }}>· {a.reason}</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Toast notification ────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 z-50"
          style={{
            bottom: 80,
            background: DEEP, color: SAGE,
            padding: '10px 20px', borderRadius: 12,
            fontSize: 13, fontWeight: 500,
            boxShadow: '0 8px 24px rgba(45,82,64,.3)',
            whiteSpace: 'nowrap',
          }}>
          {toast}
        </div>
      )}

    </div>
  )
}
