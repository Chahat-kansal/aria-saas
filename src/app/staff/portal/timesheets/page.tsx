'use client'
import { useEffect, useState } from 'react'

interface Timesheet {
  id: string; clock_in: string; clock_out: string | null
  hours_worked: number; pay_estimate: string | null
  status: string; approved: boolean; notes: string | null
}

// ─── Design tokens — same palette as home / schedule / leave ────────────
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

// ─── Week helpers ─────────────────────────────────────────────────────────
function weekMonday(clockIn: string): string {
  const d   = new Date(clockIn)
  const day = d.getDay() || 7          // Mon=1 … Sun=7
  const mon = new Date(d)
  mon.setDate(d.getDate() - day + 1)
  return mon.toISOString().slice(0, 10)
}

function weekLabel(monDate: string): string {
  const d = new Date(monDate)
  return 'Week of ' + d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

// ─── Status chip + left-border ────────────────────────────────────────────
function entryStyle(t: Timesheet) {
  if (t.approved)            return { label: 'Approved', chipBg: 'rgba(127,184,151,.18)', chipColor: DEEP,  left: SAGE  }
  if (t.status === 'active') return { label: 'Active',   chipBg: 'rgba(186,117,23,.12)',  chipColor: AMBER, left: AMBER }
  return                            { label: 'Pending',  chipBg: 'rgba(107,125,116,.12)', chipColor: MUTED, left: LINE  }
}

// ─── Skeleton ─────────────────────────────────────────────────────────────
function Bone({ h = 16, r = 8, w = '100%' }: { h?: number; r?: number; w?: string | number }) {
  return <div style={{ height: h, width: w, borderRadius: r, background: 'rgba(45,82,64,.08)' }} />
}

function SkeletonCard() {
  return (
    <div style={{
      background: CARD, borderRadius: 16, boxShadow: SHADOW,
      border: '1px solid ' + LINE, borderLeft: '3px solid rgba(127,184,151,.25)',
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bone h={38} r={8} w={38} />
          <Bone h={13} r={5} w={100} />
        </div>
        <Bone h={22} r={99} w={64} />
      </div>
      <Bone h={18} r={6} w="60%" />
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <Bone h={22} r={99} w={60} />
      </div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────
export default function StaffTimesheetsPage() {
  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [totalHours, setTotalHours] = useState(0)
  const [loading,    setLoading]    = useState(true)

  // ── Data fetch — PRESERVED EXACTLY ───────────────────────────────────────
  useEffect(() => {
    fetch('/api/staff/portal/timesheets?weeks=4')
      .then(r => r.json())
      .then((j: { timesheets?: Timesheet[]; totalHours?: number }) => {
        setTimesheets(j.timesheets ?? [])
        setTotalHours(Number(j.totalHours) || 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) return (
    <div>
      <div style={{ paddingBottom: 16, marginBottom: 22, borderBottom: '1px solid ' + LINE }}>
        <div className="animate-pulse"><Bone h={26} r={6} w="35%" /></div>
      </div>
      <div className="animate-pulse" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )

  // Group by ISO week, most recent first
  const weekKeys = Array.from(new Set(timesheets.map(t => weekMonday(t.clock_in)))).sort().reverse()

  return (
    <div>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingBottom: 16, marginBottom: 22, borderBottom: '1px solid ' + LINE,
      }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-display, serif)',
            fontSize: 26, fontWeight: 600, color: INK,
            margin: 0, lineHeight: 1.15,
          }}>
            My Hours
          </h1>
          <p style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
            Last 4 weeks of clock-in records
          </p>
        </div>

        {/* Total hours badge */}
        <div style={{
          background: SAGE_TINT, borderRadius: 14,
          padding: '8px 14px', textAlign: 'center', flexShrink: 0,
        }}>
          <div style={{
            fontFamily: 'var(--font-display, serif)',
            fontSize: 22, fontWeight: 600, color: DEEP, lineHeight: 1,
          }}>
            {totalHours.toFixed(1)}<span style={{ fontSize: 13, color: MUTED }}>h</span>
          </div>
          <div style={{ fontSize: 10, color: MUTED, marginTop: 2, letterSpacing: '.04em' }}>
            total
          </div>
        </div>
      </div>

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {timesheets.length === 0 && (
        <div style={{
          background: CARD, borderRadius: 20, boxShadow: SHADOW,
          border: '1px solid ' + LINE, padding: '40px 24px', textAlign: 'center',
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: 15, background: SAGE_TINT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px', fontSize: 22,
          }}>
            🕒
          </div>
          <div style={{
            fontFamily: 'var(--font-display, serif)',
            fontSize: 18, fontWeight: 600, color: INK, marginBottom: 6,
          }}>
            No timesheet entries yet
          </div>
          <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.55, maxWidth: 240, margin: '0 auto' }}>
            Your clock-in history will appear here once shifts are tracked.
          </p>
        </div>
      )}

      {/* ── Grouped timesheet list ────────────────────────────────────────── */}
      {timesheets.length > 0 && (
        <div>
          {weekKeys.map(week => {
            const entries = timesheets.filter(t => weekMonday(t.clock_in) === week)
            return (
              <div key={week} style={{ marginBottom: 28 }}>

                {/* Week section label */}
                <div style={{
                  fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase',
                  color: MUTED, margin: '0 4px 10px', fontWeight: 600,
                }}>
                  {weekLabel(week)}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {entries.map(t => {
                    const st      = entryStyle(t)
                    const date    = new Date(t.clock_in)
                    const inTime  = t.clock_in.slice(11, 16)
                    const outTime = t.clock_out ? t.clock_out.slice(11, 16) : null

                    return (
                      <div key={t.id} style={{
                        background: CARD, borderRadius: 16,
                        boxShadow: SHADOW,
                        border: '1px solid ' + LINE,
                        borderLeft: '3px solid ' + st.left,
                        padding: '14px 16px',
                      }}>

                        {/* Header row */}
                        <div style={{
                          display: 'flex', justifyContent: 'space-between',
                          alignItems: 'flex-start', marginBottom: 8, gap: 8,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {/* Mini day box */}
                            <div style={{
                              background: SAGE_TINT, borderRadius: 9,
                              padding: '4px 8px', textAlign: 'center', flexShrink: 0,
                            }}>
                              <div style={{
                                fontSize: 9, fontWeight: 700, color: DEEP,
                                letterSpacing: '.06em', textTransform: 'uppercase',
                              }}>
                                {DOW_SHORT[date.getDay()]}
                              </div>
                              <div style={{
                                fontFamily: 'var(--font-display, serif)',
                                fontSize: 18, fontWeight: 600, color: DEEP, lineHeight: 1,
                              }}>
                                {date.getDate()}
                              </div>
                            </div>
                            <span style={{ fontSize: 12.5, color: MUTED }}>
                              {date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </div>

                          {/* Status chip */}
                          <span style={{
                            fontSize: 11, fontWeight: 600,
                            padding: '3px 10px', borderRadius: 999,
                            background: st.chipBg, color: st.chipColor,
                            flexShrink: 0,
                          }}>
                            {st.label}
                          </span>
                        </div>

                        {/* Time — display font */}
                        <div style={{
                          fontFamily: 'var(--font-display, serif)',
                          fontSize: 17, fontWeight: 600, color: INK, marginBottom: 8,
                        }}>
                          {inTime}
                          {outTime ? ' – ' + outTime : null}
                          {!outTime && (
                            <span style={{ color: AMBER }}> – Active</span>
                          )}
                        </div>

                        {/* Chips: hours + pay estimate */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: 11, background: SAGE_TINT, color: DEEP,
                            padding: '3px 9px', borderRadius: 999,
                            border: '1px solid ' + LINE,
                          }}>
                            {t.hours_worked.toFixed(1)} hrs
                          </span>
                          {t.pay_estimate && (
                            <span style={{
                              fontSize: 11, background: '#f6efe5', color: '#7a4f1a',
                              padding: '3px 9px', borderRadius: 999,
                              border: '1px solid ' + LINE,
                            }}>
                              {t.pay_estimate}
                            </span>
                          )}
                        </div>

                        {/* Notes */}
                        {t.notes && (
                          <div style={{ fontSize: 12, color: MUTED, marginTop: 6, fontStyle: 'italic' }}>
                            {t.notes}
                          </div>
                        )}

                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          <div style={{ textAlign: 'center', paddingTop: 4, fontSize: 12, color: MUTED }}>
            Showing last 4 weeks of clock-in records
          </div>
        </div>
      )}

    </div>
  )
}
