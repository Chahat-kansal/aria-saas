'use client'
import { useEffect, useState, useCallback } from 'react'

interface Shift {
  week_start: string; start_time: string; end_time: string
  hours: number; role: string | null; area_name: string | null
  confirmed_by_staff: boolean; shift_id: string
}

// ─── Design tokens — identical to home page ──────────────────────────────
const CARD      = '#ffffff'
const INK       = '#1d2a24'
const MUTED     = '#6b7d74'
const LINE      = '#e6ece8'
const SAGE      = '#7FB897'
const DEEP      = '#2D5240'
const SAGE_TINT = '#eef6f1'
const AMBER     = '#BA7517'
const SHADOW    = '0 1px 2px rgba(45,82,64,.06), 0 8px 24px rgba(45,82,64,.06)'

const DOW_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

// ─── Week-section label ───────────────────────────────────────────────────
function weekLabel(weekStart: string): string {
  const d = new Date(weekStart)
  return 'Week of ' + d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

// ─── Skeleton bone ────────────────────────────────────────────────────────
function Bone({ h = 16, r = 8, w = '100%' }: { h?: number; r?: number; w?: string | number }) {
  return <div style={{ height: h, width: w, borderRadius: r, background: 'rgba(45,82,64,.08)' }} />
}

function SkeletonCard() {
  return (
    <div style={{
      background: CARD, borderRadius: 18, boxShadow: SHADOW,
      border: '1px solid ' + LINE, borderLeft: '3px solid rgba(127,184,151,.2)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 16px', display: 'flex', gap: 12 }}>
        <div style={{ width: 56, flexShrink: 0 }}><Bone h={62} r={12} /></div>
        <div style={{ flex: 1 }}>
          <Bone h={13} r={5} w="55%" />
          <div style={{ marginTop: 8 }}><Bone h={18} r={6} w="70%" /></div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <Bone h={22} r={99} w={60} />
            <Bone h={22} r={99} w={72} />
          </div>
        </div>
      </div>
      <div style={{ padding: '11px 16px', borderTop: '1px dashed ' + LINE }}>
        <Bone h={13} r={5} w="45%" />
      </div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────
export default function StaffSchedulePage() {
  const [shifts,     setShifts]     = useState<Shift[]>([])
  const [loading,    setLoading]    = useState(true)
  const [confirming, setConfirming] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/staff/portal/schedule').then(r => r.json()).then((j: { shifts?: Shift[] }) => {
      setShifts(j.shifts ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // ── Confirm logic — PRESERVED EXACTLY from original ─────────────────────
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

  const todayStr    = new Date().toDateString()
  const tomorrowStr = new Date(Date.now() + 86400_000).toDateString()

  // Group shifts by week_start, sorted chronologically
  const weeks = Array.from(new Set(shifts.map(s => s.week_start))).sort()

  return (
    <div>

      {/* ── Page header ────────────────────────────────────────────────── */}
      <div style={{ paddingBottom: 16, marginBottom: 22, borderBottom: '1px solid ' + LINE }}>
        <h1 style={{
          fontFamily: 'var(--font-display, serif)',
          fontSize: 26, fontWeight: 600, color: INK,
          margin: 0, lineHeight: 1.15,
        }}>
          My Schedule
        </h1>
        <p style={{ fontSize: 13, color: MUTED, marginTop: 5 }}>
          Next 4 weeks of published shifts
        </p>
      </div>

      {/* ── Loading ────────────────────────────────────────────────────── */}
      {loading && (
        <div className="animate-pulse" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {!loading && shifts.length === 0 && (
        <div style={{
          background: CARD, borderRadius: 20,
          boxShadow: SHADOW, border: '1px solid ' + LINE,
          padding: '40px 24px', textAlign: 'center',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, background: SAGE_TINT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 24,
          }}>
            📅
          </div>
          <div style={{
            fontFamily: 'var(--font-display, serif)',
            fontSize: 20, fontWeight: 600, color: INK, marginBottom: 8,
          }}>
            No shifts scheduled yet
          </div>
          <p style={{
            fontSize: 13, color: MUTED, lineHeight: 1.6,
            maxWidth: 260, margin: '0 auto',
          }}>
            No published shifts in the next 4 weeks. Your manager will notify you when shifts are posted.
          </p>
        </div>
      )}

      {/* ── Shift list grouped by week ─────────────────────────────────── */}
      {!loading && shifts.length > 0 && (
        <div>
          {weeks.map(week => {
            const weekShifts = shifts.filter(s => s.week_start === week)
            return (
              <div key={week} style={{ marginBottom: 28 }}>

                {/* Week section label */}
                <div style={{
                  fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase',
                  color: MUTED, margin: '0 4px 10px', fontWeight: 600,
                }}>
                  {weekLabel(week)}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {weekShifts.map(s => {
                    const date       = new Date(s.start_time)
                    const isToday    = date.toDateString() === todayStr
                    const isTomorrow = date.toDateString() === tomorrowStr
                    const isSpinning = confirming === s.shift_id

                    // Left accent: sage = confirmed, amber = needs confirm, subtle = today highlight
                    const leftColor = s.confirmed_by_staff ? SAGE : AMBER

                    return (
                      <div key={s.shift_id} style={{
                        background: CARD, borderRadius: 18,
                        boxShadow: SHADOW,
                        border: '1px solid ' + LINE,
                        borderLeft: '3px solid ' + leftColor,
                        overflow: 'hidden',
                      }}>

                        <div style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>

                          {/* Day box */}
                          <div style={{
                            width: 56, flexShrink: 0, textAlign: 'center',
                            background: isToday ? 'rgba(127,184,151,.16)' : SAGE_TINT,
                            borderRadius: 12, padding: '8px 6px',
                          }}>
                            <div style={{
                              fontSize: 10, fontWeight: 700, color: DEEP,
                              letterSpacing: '.06em', textTransform: 'uppercase',
                            }}>
                              {DOW_SHORT[date.getDay()]}
                            </div>
                            <div style={{
                              fontFamily: 'var(--font-display, serif)',
                              fontSize: 24, fontWeight: 600, color: DEEP, lineHeight: 1,
                            }}>
                              {date.getDate()}
                            </div>
                          </div>

                          {/* Shift info */}
                          <div style={{ flex: 1, minWidth: 0 }}>

                            {/* Date label row */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                              {isToday && (
                                <span style={{
                                  fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
                                  color: SAGE, textTransform: 'uppercase',
                                }}>
                                  Today
                                </span>
                              )}
                              {isTomorrow && (
                                <span style={{
                                  fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
                                  color: AMBER, textTransform: 'uppercase',
                                }}>
                                  Tomorrow
                                </span>
                              )}
                              <span style={{ fontSize: 12.5, color: MUTED }}>
                                {date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}
                              </span>
                            </div>

                            {/* Time — display font */}
                            <div style={{
                              fontFamily: 'var(--font-display, serif)',
                              fontSize: 17, fontWeight: 600, color: INK, marginBottom: 8,
                            }}>
                              {s.start_time.slice(11, 16)} – {s.end_time.slice(11, 16)}
                            </div>

                            {/* Role / area / hours chips */}
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {s.role && (
                                <span style={{
                                  fontSize: 11, background: SAGE_TINT, color: DEEP,
                                  padding: '3px 9px', borderRadius: 999,
                                  border: '1px solid ' + LINE,
                                }}>
                                  {s.role}
                                </span>
                              )}
                              {s.area_name && (
                                <span style={{
                                  fontSize: 11, background: '#f0f4f1', color: '#42594e',
                                  padding: '3px 9px', borderRadius: 999,
                                  border: '1px solid ' + LINE,
                                }}>
                                  {s.area_name}
                                </span>
                              )}
                              <span style={{
                                fontSize: 11, background: '#f0f4f1', color: '#42594e',
                                padding: '3px 9px', borderRadius: 999,
                                border: '1px solid ' + LINE,
                              }}>
                                {s.hours.toFixed(1)} hrs
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Confirm / confirmed action row */}
                        {!s.confirmed_by_staff ? (
                          <button
                            onClick={() => confirm(s)}
                            disabled={isSpinning}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 7,
                              width: '100%', background: '#fff',
                              color: AMBER, fontWeight: 600, fontSize: 13,
                              padding: '11px 16px',
                              border: 'none',
                              borderTop: '1px dashed ' + LINE,
                              cursor: isSpinning ? 'default' : 'pointer',
                              fontFamily: 'inherit',
                              opacity: isSpinning ? 0.55 : 1,
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="15" height="15">
                              <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>
                            </svg>
                            {isSpinning ? 'Confirming…' : 'Tap to confirm this shift'}
                          </button>
                        ) : (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 7,
                            padding: '11px 16px',
                            borderTop: '1px dashed ' + LINE,
                            color: DEEP, fontWeight: 600, fontSize: 13,
                            background: SAGE_TINT,
                          }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            Shift confirmed
                          </div>
                        )}

                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Footer note */}
          <div style={{
            textAlign: 'center', paddingTop: 8, paddingBottom: 4,
            fontSize: 12, color: MUTED,
          }}>
            Showing all published shifts · 4-week window
          </div>
        </div>
      )}

    </div>
  )
}
