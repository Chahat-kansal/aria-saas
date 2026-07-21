'use client'
// BOOKINGS-CX-BUILD-1 — the ONE shared booking flow, mounted at both /book/[slug] (standalone)
// and [slug]/booking (CX tab). Same markup, same API calls, same design system either way — see
// BOOKINGS-UI-SPEC.md for the extracted values and the REUSE/EXTEND/NEW decisions this follows.
import { useState, useEffect, useCallback } from 'react'
import TurnstileWidget from '@/components/security/TurnstileWidget'
import { CxTabBar } from '@/app/[slug]/CxTabBar'
import { FloorCanvas, type FloorElement } from './FloorCanvas'
import { BG, INK, INK_MUTED, ACCENT, ACCENT_TEXT, RED, FD, FB, glassCard, pillPrimary, pillOutline, h1Style, shimmerCss } from './tokens'

interface Business { id: string; name: string; booking_link_slug: string | null; booking_table_mode?: 'auto' | 'area' | 'table' }
interface Service { id: string; name: string; duration_minutes: number; price: number | null; color: string; description: string | null; max_party_size?: number }
interface AreaRow { area: string; free: number; total: number }

type Step = 'service' | 'date' | 'time' | 'table' | 'details' | 'done'

function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function dateStr(d: Date) { return d.toISOString().slice(0, 10) }
function fmtDate(s: string) { return new Date(s + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }) }
function fmtTime(t: string) { const [h, m] = t.split(':'); const hr = parseInt(h); return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? 'pm' : 'am'}` }

// ── Progress dots — matches the pattern already used across the Pipel/CX onboarding flows ──
function ProgressDots({ steps, active }: { steps: Step[]; active: Step }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 24, padding: '0 4px' }}>
      {steps.map(s => (
        <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: steps.indexOf(active) >= steps.indexOf(s) ? ACCENT : 'rgba(10,10,10,0.10)' }} />
      ))}
    </div>
  )
}

// ── Slot grid — DELIBERATE DIVERGENCE from the mockup's free-typing stepper: discrete,
// conflict-aware slots from real availability. Density-first: designed for ~19 slots (Sip's real
// 07:00-17:00 day), not the mockup's handful — a 3-wide grid keeps 19 slots to ~7 tidy rows. ──
function SlotGrid({ slots, loading, selected, onSelect }: {
  slots: { time: string; available: boolean }[]
  loading: boolean
  selected: string | null
  onSelect: (t: string) => void
}) {
  if (loading) {
    return (
      <>
        <style>{shimmerCss()}</style>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="booking-skeleton" style={{ height: 44, borderRadius: 100 }} />
          ))}
        </div>
      </>
    )
  }

  if (slots.length === 0) {
    return (
      <div style={{ ...glassCard, padding: '28px 20px', textAlign: 'center' }}>
        <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 20, color: INK, margin: '0 0 6px' }}>No tables available this day</p>
        <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: 0 }}>Try another date, or a smaller party size.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
      {slots.map(s => {
        const active = selected === s.time
        return (
          <button
            key={s.time}
            disabled={!s.available}
            onClick={() => s.available && onSelect(s.time)}
            style={{
              height: 44, borderRadius: 100, border: 'none', cursor: s.available ? 'pointer' : 'not-allowed',
              fontFamily: FB, fontSize: 13, fontWeight: 700,
              background: active ? ACCENT : s.available ? 'rgba(255,255,255,0.72)' : 'rgba(10,10,10,0.04)',
              color: active ? ACCENT_TEXT : s.available ? INK : 'rgba(10,10,10,0.28)',
              boxShadow: active ? '0 0 14px rgba(217,245,78,0.45)' : s.available ? '0 2px 8px rgba(0,0,0,0.05)' : 'none',
            }}
          >
            {fmtTime(s.time)}
          </button>
        )
      })}
    </div>
  )
}

// ── Area picker — 'area' mode only; 'table' mode renders FloorCanvas directly (see step==='table' below) ──
function AreaPicker({ areas, selectedArea, onPickArea }: {
  areas: AreaRow[]
  selectedArea: string | null
  onPickArea: (area: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {areas.map(a => {
        const active = selectedArea === a.area
        const full = a.free === 0
        return (
          <button key={a.area} disabled={full} onClick={() => onPickArea(a.area)}
            style={{
              ...glassCard, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 16px', border: active ? '1px solid ' + ACCENT : glassCard.border as string,
              cursor: full ? 'not-allowed' : 'pointer', opacity: full ? 0.5 : 1, textAlign: 'left',
            }}>
            <span style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 18, color: INK }}>{a.area}</span>
            <span style={{ fontFamily: FB, fontSize: 12, fontWeight: 700, color: full ? INK_MUTED : ACCENT_TEXT, background: full ? 'rgba(10,10,10,0.06)' : ACCENT, borderRadius: 100, padding: '4px 10px' }}>
              {full ? 'Full' : a.free + ' free'}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Summary pill — Screen 2's lime bar (date/time/party as icon+label groups directly on lime fill) ──
function SummaryPill({ date, time, partySize }: { date: string; time: string; partySize: number }) {
  return (
    <div style={{
      background: ACCENT, borderRadius: 18, padding: '14px 18px', marginBottom: 20,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
    }}>
      <span style={{ fontFamily: FB, fontSize: 13, fontWeight: 700, color: ACCENT_TEXT }}>📅 {date || 'Choose a date'}</span>
      <span style={{ fontFamily: FB, fontSize: 13, fontWeight: 700, color: ACCENT_TEXT }}>🕐 {time || '—'}</span>
      <span style={{ fontFamily: FB, fontSize: 13, fontWeight: 700, color: ACCENT_TEXT }}>👤 {partySize} {partySize === 1 ? 'person' : 'people'}</span>
    </div>
  )
}

export function BookingFlow({ slug, withTabBar = false }: { slug: string; withTabBar?: boolean }) {
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'unavailable'>('loading')
  const [biz, setBiz] = useState<Business | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [step, setStep] = useState<Step>('service')

  const [selService, setSelService] = useState<Service | null>(null)
  const [partySize, setPartySize] = useState(2)
  const [selDate, setSelDate] = useState('')
  const [weekOf, setWeekOf] = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d })
  const [monthOf, setMonthOf] = useState<Date>(() => new Date())

  const [slots, setSlots] = useState<{ time: string; available: boolean }[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selTime, setSelTime] = useState('')

  const [tableMode, setTableMode] = useState<'auto' | 'area' | 'table'>('auto')
  const [elements, setElements] = useState<FloorElement[]>([])
  const [areas, setAreas] = useState<AreaRow[]>([])
  const [selTableId, setSelTableId] = useState<string | null>(null)
  const [selArea, setSelArea] = useState<string | null>(null)

  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' })
  const [turnstileToken, setTurnstileToken] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [booking, setBooking] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    if (!slug) { setLoadState('unavailable'); return }
    fetch('/api/bookings/public?slug=' + encodeURIComponent(slug))
      .then(r => r.json())
      .then(d => {
        if (d.business) {
          setBiz(d.business)
          setServices(d.services ?? [])
          setStep((d.services ?? []).length > 0 ? 'service' : 'date')
          setLoadState('ok')
        } else {
          setLoadState('unavailable')
        }
      })
      .catch(() => setLoadState('unavailable'))
  }, [slug])

  interface AvailabilityResponse {
    slots?: string[]
    availability?: { time: string; available: boolean }[]
    elements?: FloorElement[]
    areas?: AreaRow[]
    booking_table_mode?: 'auto' | 'area' | 'table'
  }

  const fetchAvailability = useCallback((date: string, time?: string): Promise<AvailabilityResponse | null> => {
    if (!biz) return Promise.resolve(null)
    const p = new URLSearchParams({ business_id: biz.id, date, party_size: String(partySize) })
    if (selService) p.set('service_id', selService.id)
    if (time) p.set('time', time)
    return fetch('/api/bookings/availability?' + p).then(r => r.json())
  }, [biz, selService, partySize])

  useEffect(() => {
    if (!biz || !selDate || step !== 'time') return
    setSlotsLoading(true)
    setSlots([])
    fetchAvailability(selDate).then(d => { setSlots(d?.availability ?? []); setSlotsLoading(false) })
  }, [biz, selDate, step, fetchAvailability])

  async function chooseTime(t: string) {
    setSelTime(t)
    setSelTableId(null); setSelArea(null)
    const mode = (biz?.booking_table_mode ?? 'auto')
    if (mode === 'auto') { setStep('details'); return }
    const d = await fetchAvailability(selDate, t)
    const gotElements = (d?.elements ?? []) as FloorElement[]
    const gotAreas = (d?.areas ?? []) as AreaRow[]
    setElements(gotElements)
    setAreas(gotAreas)
    setTableMode(mode)
    const bookableCount = gotElements.filter(e => e.element_type === 'table').length
    // Graceful degrade — no guest-selectable tables/areas configured for this business at all
    // (or none fit this party size): never show a broken/empty picker, just proceed to details.
    if (mode === 'table' && bookableCount === 0) { setStep('details'); return }
    if (mode === 'area' && gotAreas.length === 0) { setStep('details'); return }
    setStep('table')
  }

  async function submit() {
    if (!biz || !form.name || !selDate || !selTime) return
    setSubmitting(true); setError('')
    const res = await fetch('/api/bookings/public', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: biz.id,
        service_id: selService?.id ?? null,
        customer_name: form.name, customer_email: form.email || null, customer_phone: form.phone || null,
        booking_date: selDate, booking_time: selTime, notes: form.notes || null,
        party_size: partySize, turnstile_token: turnstileToken,
        table_id: selTableId, seating_area: selArea,
      }),
    })
    const d = await res.json().catch(() => ({}))
    if (d.booking) { setBooking(d.booking); setStep('done') }
    else setError(d.error || 'Could not confirm your booking. Please try again.')
    setSubmitting(false)
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(10,10,10,0.12)', background: '#fff', color: INK, fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: FB }
  const steps: Step[] = services.length > 0 ? ['service', 'date', 'time', 'details'] : ['date', 'time', 'details']

  const wrap = (children: React.ReactNode) => (
    <div style={{ minHeight: '100dvh', background: BG, fontFamily: FB, color: INK }}>
      <div style={{ maxWidth: '28rem', margin: '0 auto', padding: '40px 20px', paddingBottom: withTabBar ? 'calc(96px + env(safe-area-inset-bottom))' : 40 }}>
        {children}
      </div>
      {withTabBar && <CxTabBar slug={slug} active="booking" />}
    </div>
  )

  if (loadState === 'loading') return wrap(<p style={{ textAlign: 'center', color: INK_MUTED }}>Loading…</p>)

  if (loadState === 'unavailable') return wrap(
    <div style={{ ...glassCard, padding: '32px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
      <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, color: INK, margin: '0 0 8px' }}>Online bookings aren&apos;t available</h1>
      <p style={{ fontSize: 14, color: INK_MUTED, lineHeight: 1.6, margin: 0 }}>This business isn&apos;t taking online bookings right now. Please contact them directly.</p>
    </div>
  )

  if (!biz) return wrap(<p style={{ textAlign: 'center', color: INK_MUTED }}>Loading…</p>)

  return wrap(
    <div>
      <h1 style={{ ...h1Style, marginBottom: 6 }}>{biz.name}</h1>
      <p style={{ textAlign: 'center', fontFamily: FB, fontSize: 13, color: INK_MUTED, marginBottom: 20 }}>Book a table online</p>

      {step !== 'done' && <ProgressDots steps={steps} active={step === 'table' ? 'time' : step} />}

      {step === 'service' && (
        <div>
          <p style={{ fontFamily: FB, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Select a service</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {services.map(s => (
              <button key={s.id} onClick={() => { setSelService(s); setStep('date') }}
                style={{ ...glassCard, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', textAlign: 'left', cursor: 'pointer' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: FB, fontWeight: 700, color: INK, margin: 0, fontSize: 14 }}>{s.name}</p>
                  <p style={{ fontFamily: FB, fontSize: 12, color: INK_MUTED, margin: '3px 0 0' }}>{s.duration_minutes} min{s.price ? ` · $${s.price}` : ''}</p>
                </div>
              </button>
            ))}
            <button onClick={() => { setSelService(null); setStep('date') }} style={{ ...pillOutline, padding: '10px 0', marginTop: 4 }}>No preference — skip</button>
          </div>
        </div>
      )}

      {step === 'date' && (
        <div>
          <SummaryPill date={selDate ? fmtDate(selDate) : ''} time="" partySize={partySize} />

          {/* Bare calendar — no card, per the mockup: numbers float directly on the page
              background, only the selected date gets a filled lime circle. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button onClick={() => setMonthOf(p => new Date(p.getFullYear(), p.getMonth() - 1, 1))} style={{ background: 'none', border: 'none', fontSize: 18, color: INK, cursor: 'pointer', padding: 8 }}>‹</button>
            <span style={{ fontFamily: FB, fontSize: 15, fontWeight: 700, color: INK }}>{monthOf.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}</span>
            <button onClick={() => setMonthOf(p => new Date(p.getFullYear(), p.getMonth() + 1, 1))} style={{ background: 'none', border: 'none', fontSize: 18, color: INK, cursor: 'pointer', padding: 8 }}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 24 }}>
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d, i) => <div key={i} style={{ textAlign: 'center', fontSize: 11, color: INK_MUTED, fontFamily: FB, paddingBottom: 6 }}>{d}</div>)}
            {(() => {
              const start = new Date(monthOf.getFullYear(), monthOf.getMonth(), 1)
              const offset = (start.getDay() + 6) % 7
              const days: (Date | null)[] = Array(offset).fill(null)
              const inMonth = new Date(monthOf.getFullYear(), monthOf.getMonth() + 1, 0).getDate()
              for (let i = 1; i <= inMonth; i++) days.push(new Date(monthOf.getFullYear(), monthOf.getMonth(), i))
              const today = dateStr(new Date())
              return days.map((day, i) => {
                if (!day) return <div key={i} />
                const ds = dateStr(day)
                const isPast = ds < today
                const isSel = ds === selDate
                return (
                  <button key={ds} disabled={isPast} onClick={() => setSelDate(ds)}
                    style={{
                      aspectRatio: '1', borderRadius: '50%', border: 'none', cursor: isPast ? 'not-allowed' : 'pointer',
                      background: isSel ? ACCENT : 'transparent', color: isPast ? 'rgba(10,10,10,0.2)' : isSel ? ACCENT_TEXT : INK,
                      fontFamily: FB, fontSize: 14, fontWeight: isSel ? 700 : 400,
                    }}>
                    {day.getDate()}
                  </button>
                )
              })
            })()}
          </div>

          {/* Party-size stepper — one continuous lime pill, −/+ at the outer edges, per the mockup */}
          <div style={{
            background: ACCENT, borderRadius: 100, height: 52, marginBottom: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px',
          }}>
            <button onClick={() => setPartySize(p => Math.max(1, p - 1))} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(10,10,10,0.08)', fontSize: 20, cursor: 'pointer', color: ACCENT_TEXT, fontFamily: FB }}>−</button>
            <span style={{ fontFamily: FB, fontSize: 15, fontWeight: 700, color: ACCENT_TEXT }}>{partySize} {partySize === 1 ? 'person' : 'people'}</span>
            <button onClick={() => setPartySize(p => Math.min(20, p + 1))} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(10,10,10,0.08)', fontSize: 20, cursor: 'pointer', color: ACCENT_TEXT, fontFamily: FB }}>+</button>
          </div>

          <button onClick={() => selDate && setStep('time')} disabled={!selDate} style={{ ...pillPrimary, width: '100%', height: 50, opacity: selDate ? 1 : 0.5 }}>Apply</button>
        </div>
      )}

      {step === 'time' && (
        <div>
          <SummaryPill date={fmtDate(selDate)} time="" partySize={partySize} />
          <p style={{ fontFamily: FB, fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Choose a time</p>
          <div style={{ marginBottom: 20 }}>
            <SlotGrid slots={slots} loading={slotsLoading} selected={selTime} onSelect={chooseTime} />
          </div>
          <button onClick={() => setStep('date')} style={{ ...pillOutline, width: '100%', height: 46 }}>← Back</button>
        </div>
      )}

      {step === 'table' && (
        <div>
          <SummaryPill date={fmtDate(selDate)} time={fmtTime(selTime)} partySize={partySize} />
          <p style={{ fontFamily: FB, fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
            {tableMode === 'area' ? 'Choose a seating area' : 'Table Selection'}
          </p>
          <div style={{ marginBottom: 20 }}>
            {tableMode === 'table' ? (
              <FloorCanvas
                elements={elements}
                selectedId={selTableId}
                onSelectTable={id => setSelTableId(id)}
                interactive
                height={420}
              />
            ) : (
              <AreaPicker areas={areas} selectedArea={selArea} onPickArea={area => setSelArea(area)} />
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep('time')} style={{ ...pillOutline, flex: 1, height: 46 }}>← Back</button>
            <button
              onClick={() => setStep('details')}
              disabled={tableMode === 'table' ? !selTableId : !selArea}
              style={{ ...pillPrimary, flex: 2, height: 46, opacity: (tableMode === 'table' ? selTableId : selArea) ? 1 : 0.5 }}>
              Next →
            </button>
          </div>
        </div>
      )}

      {step === 'details' && (
        <div>
          <p style={{ fontFamily: FB, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Your details</p>
          <div style={{ ...glassCard, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: INK_MUTED, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {selService && <span>📋 {selService.name}</span>}
            <span>📅 {fmtDate(selDate)}</span>
            <span>🕐 {fmtTime(selTime)}</span>
            <span>👥 {partySize}</span>
          </div>
          {[
            { key: 'name', label: 'Full name *', type: 'text', placeholder: 'Jane Smith' },
            { key: 'email', label: 'Email (confirmation sent here)', type: 'email', placeholder: 'jane@email.com' },
            { key: 'phone', label: 'Mobile (for reminders)', type: 'tel', placeholder: '0412 345 678' },
            { key: 'notes', label: 'Special requests (optional)', type: 'text', placeholder: 'e.g. dietary requirements' },
          ].map(({ key, label, type, placeholder }) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: INK_MUTED, display: 'block', marginBottom: 4, fontFamily: FB }}>{label}</label>
              <input value={(form as Record<string, string>)[key]} type={type} placeholder={placeholder}
                onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} style={inputStyle} />
            </div>
          ))}
          {error && (
            <div style={{ ...glassCard, padding: '10px 14px', marginBottom: 12, border: '1px solid rgba(239,68,68,0.3)' }}>
              <p style={{ color: RED, fontSize: 13, fontFamily: FB, margin: 0 }}>{error}</p>
            </div>
          )}
          <div style={{ marginBottom: 14 }}>
            <TurnstileWidget onToken={setTurnstileToken} theme="light" />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(elements.length || areas.length ? 'table' : 'time')} style={{ ...pillOutline, flex: 1, height: 48 }}>← Back</button>
            <button onClick={submit} disabled={submitting || !form.name} style={{ ...pillPrimary, flex: 2, height: 48, opacity: submitting || !form.name ? 0.55 : 1 }}>
              {submitting ? 'Confirming…' : 'Confirm booking'}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && booking && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(217,245,78,0.20)', border: '2px solid ' + ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, marginBottom: 20, color: ACCENT_TEXT }}>✓</div>
          <h2 style={{ ...h1Style, fontSize: 26, marginBottom: 8 }}>Booking confirmed!</h2>
          <p style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED, marginBottom: 24 }}>
            {form.email ? `A confirmation has been sent to ${form.email}.` : 'Your booking is confirmed.'}
          </p>
          <div style={{ ...glassCard, padding: 20, textAlign: 'left', marginBottom: 20 }}>
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontWeight: 600, color: INK, marginBottom: 10, fontSize: 17 }}>{biz.name}</p>
            {selService && <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: '4px 0' }}>📋 {selService.name}</p>}
            <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: '4px 0' }}>📅 {fmtDate(selDate)}</p>
            <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: '4px 0' }}>🕐 {fmtTime(selTime)}</p>
            <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: '4px 0' }}>👥 {partySize}</p>
            <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: '4px 0' }}>👤 {form.name}</p>
          </div>
          {(booking.booking_token as string | null) && (
            <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED }}>
              Need to change?{' '}
              <a href={'/book/' + slug + '/manage?token=' + booking.booking_token} style={{ color: INK, fontWeight: 700 }}>Manage your booking</a>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
