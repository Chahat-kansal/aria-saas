'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

// ─── Types ─────────────────────────────────────────────────────────────────

interface Identity {
  first_name: string; last_name: string; preferred_name: string | null
  position: string; color: string; employment_type: string
}
interface Balance {
  leave_type: string; remaining_days: number
  accrued_days: number; taken_days: number
}
interface Shift {
  start_time: string; end_time: string; hours: number
  role: string | null; area_name: string | null; confirmed_by_staff: boolean
}

const LEAVE_LABELS: Record<string, string> = {
  annual: 'Annual leave', sick: 'Sick leave', personal: 'Personal leave',
}
const DOW_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const DOW_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

// ─── Design tokens — light palette (mockup) ───────────────────────────────

const BG        = '#f4f7f5'
const CARD      = '#ffffff'
const INK       = '#1d2a24'
const MUTED     = '#6b7d74'
const LINE      = '#e6ece8'
const SAGE      = '#7FB897'
const DEEP      = '#2D5240'
const SAGE_TINT = '#eef6f1'
const AMBER     = '#BA7517'
const SHADOW    = '0 1px 2px rgba(45,82,64,.06), 0 8px 24px rgba(45,82,64,.06)'

// ─── Helpers ──────────────────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Morning'
  if (h < 17) return 'Afternoon'
  return 'Evening'
}

// ─── Progress ring ─────────────────────────────────────────────────────────

function ProgressRing({ pct }: { pct: number }) {
  const r    = 22
  const circ = 2 * Math.PI * r          // ≈ 138.2
  const offset = circ * (1 - pct / 100)
  return (
    <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
      <svg width="52" height="52" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="26" cy="26" r={r} fill="none" stroke="#eef2ef" strokeWidth="6" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={SAGE} strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-display, serif)',
        fontSize: 12, fontWeight: 600, color: DEEP,
      }}>
        {pct}%
      </div>
    </div>
  )
}

// ─── Section label ─────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase',
      color: MUTED, margin: '22px 4px 10px', fontWeight: 600,
    }}>
      {text}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────

function Bone({ h = 16, r = 8 }: { h?: number; r?: number }) {
  return <div style={{ height: h, borderRadius: r, background: 'rgba(45,82,64,.08)' }} />
}

function SkeletonLayout() {
  return (
    <div className="animate-pulse" style={{ marginTop: -24 }}>
      <div style={{ height: 168, margin: '0 -16px', background: 'rgba(45,82,64,.18)', borderRadius: '0 0 26px 26px' }} />
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Bone h={130} r={20} />
        <div className="grid grid-cols-2 gap-3"><Bone h={100} r={18} /><Bone h={100} r={18} /></div>
        <Bone h={100} r={20} />
        <Bone h={80} r={18} />
        <div className="grid grid-cols-2 gap-3"><Bone h={80} r={17} /><Bone h={80} r={17} /><Bone h={80} r={17} /><Bone h={80} r={17} /></div>
      </div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function StaffPortalHome() {
  const [identity,     setIdentity]     = useState<Identity | null>(null)
  const [balances,     setBalances]     = useState<Balance[]>([])
  const [nextShift,    setNextShift]    = useState<Shift | null>(null)
  const [weekHours,    setWeekHours]    = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [unauthorized, setUnauthorized] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/staff/portal/me'),
      fetch('/api/staff/portal/schedule'),
      fetch('/api/staff/portal/timesheets?weeks=1'),
    ]).then(async ([meRes, schedRes, tsRes]) => {
      if (meRes.status === 401) { setUnauthorized(true); setLoading(false); return }
      const [me, sched, ts] = await Promise.all([meRes.json(), schedRes.json(), tsRes.json()])
      setIdentity((me as { identity?: Identity }).identity ?? null)
      setBalances((me as { balances?: Balance[] }).balances ?? [])
      const now      = new Date()
      const upcoming = ((sched as { shifts?: Shift[] }).shifts ?? [])
        .filter(s => new Date(s.start_time) > now)
      setNextShift(upcoming[0] ?? null)
      setWeekHours(Number((ts as { totalHours?: number }).totalHours) || 0)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <SkeletonLayout />

  if (unauthorized || !identity) return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.5" strokeLinecap="round">
        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
      <p className="font-medium" style={{ color: INK }}>Portal access not set up</p>
      <p className="text-sm" style={{ color: MUTED }}>Contact your manager to send you an invite.</p>
      <a href="/staff/login" className="text-sm hover:underline" style={{ color: DEEP }}>Log in →</a>
    </div>
  )

  const displayName = identity.preferred_name ?? identity.first_name
  const initials    = identity.first_name[0] + identity.last_name[0]
  const empType     = identity.employment_type.replace(/_/g, ' ')

  const shiftDate  = nextShift ? new Date(nextShift.start_time) : null
  const isToday    = shiftDate ? shiftDate.toDateString() === new Date().toDateString() : false
  const isTomorrow = shiftDate
    ? shiftDate.toDateString() === new Date(Date.now() + 86400_000).toDateString()
    : false

  const hoursPct = Math.min(100, Math.round((weekHours / 38) * 100))

  return (
    <div style={{ background: BG, margin: '0 -16px', padding: '0 16px' }}>

      {/* ── Hero topbar ─────────────────────────────────────────────────── */}
      <div style={{
        margin: '0 -16px',
        padding: '12px 20px 22px',
        background: 'linear-gradient(180deg, #2D5240 0%, #356048 100%)',
        borderRadius: '0 0 26px 26px',
        position: 'relative',
        overflow: 'hidden',
        color: '#ffffff',
      }}>
        {/* Leaf radial glow */}
        <div style={{
          position: 'absolute', right: -30, top: -30,
          width: 160, height: 160, borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,.14), transparent 60%)',
          pointerEvents: 'none',
        }} />

        {/* Greeting row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, position: 'relative', zIndex: 1 }}>
          <div style={{
            width: 54, height: 54, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #9fd0b3, #7FB897)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display, serif)',
            fontWeight: 600, fontSize: 20, color: DEEP,
            boxShadow: '0 0 0 3px rgba(255,255,255,.25), 0 0 0 6px rgba(255,255,255,.12)',
          }}>
            {initials}
          </div>
          <div>
            <h2 style={{
              fontFamily: 'var(--font-display, serif)',
              fontWeight: 500, fontSize: 21, lineHeight: 1.1, margin: 0,
            }}>
              {greeting()}, {displayName}
            </h2>
            <div style={{ fontSize: 12.5, opacity: 0.82, marginTop: 3 }}>
              {identity.position}
            </div>
            <span style={{
              display: 'inline-block', fontSize: 10.5,
              background: 'rgba(255,255,255,.18)',
              padding: '2px 9px', borderRadius: 999,
              marginTop: 6, letterSpacing: '.02em', textTransform: 'capitalize',
            }}>
              {empType}
            </span>
          </div>
        </div>

        {/* Streak strip — visual style from mockup, honest placeholder */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginTop: 16,
          background: 'rgba(255,255,255,.12)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          border: '1px solid rgba(255,255,255,.18)',
          borderRadius: 16, padding: '11px 14px',
          position: 'relative', zIndex: 1,
        }}>
          <span style={{ fontSize: 22 }}>🔥</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Shift streak</div>
            <span style={{ display: 'block', fontSize: 11.5, opacity: 0.8, marginTop: 1 }}>
              Coming soon — confirm shifts to build your streak
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[0,1,2,3,4,5,6].map(i => (
              <span key={i} style={{
                width: 9, height: 9, borderRadius: '50%',
                background: 'rgba(255,255,255,.3)',
                display: 'inline-block',
              }} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div style={{ paddingBottom: 8 }}>

        {/* ── Next shift ─────────────────────────────────────────────────── */}
        <SectionLabel text="Your next shift" />
        <div style={{
          background: CARD, borderRadius: 20,
          boxShadow: SHADOW, border: '1px solid ' + LINE,
          overflow: 'hidden',
        }}>
          {/* Accent gradient bar */}
          <div style={{ height: 4, background: 'linear-gradient(90deg, ' + SAGE + ', ' + DEEP + ')' }} />

          {nextShift && shiftDate ? (
            <>
              <div style={{ padding: '16px 17px', display: 'flex', gap: 14, alignItems: 'center' }}>
                {/* Day box */}
                <div style={{
                  textAlign: 'center', background: SAGE_TINT,
                  borderRadius: 14, padding: '9px 13px', minWidth: 58, flexShrink: 0,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: DEEP, letterSpacing: '.06em' }}>
                    {DOW_SHORT[shiftDate.getDay()]}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-display, serif)',
                    fontSize: 26, fontWeight: 600, color: DEEP, lineHeight: 1,
                  }}>
                    {shiftDate.getDate()}
                  </div>
                </div>

                {/* Shift info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'var(--font-display, serif)',
                    fontSize: 18, fontWeight: 600, color: INK,
                  }}>
                    {nextShift.start_time.slice(11, 16)} – {nextShift.end_time.slice(11, 16)}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
                    {nextShift.role && (
                      <span style={{
                        fontSize: 11, background: SAGE_TINT, color: DEEP,
                        padding: '3px 9px', borderRadius: 999,
                        border: '1px solid ' + LINE,
                      }}>
                        {nextShift.role}
                      </span>
                    )}
                    {nextShift.area_name && (
                      <span style={{
                        fontSize: 11, background: '#f0f4f1', color: '#42594e',
                        padding: '3px 9px', borderRadius: 999,
                        border: '1px solid ' + LINE,
                      }}>
                        {nextShift.area_name}
                      </span>
                    )}
                    <span style={{
                      fontSize: 11, background: '#f0f4f1', color: '#42594e',
                      padding: '3px 9px', borderRadius: 999,
                      border: '1px solid ' + LINE,
                    }}>
                      {nextShift.hours.toFixed(1)} hrs
                    </span>
                  </div>
                </div>
              </div>

              {/* Confirm / confirmed row */}
              {!nextShift.confirmed_by_staff ? (
                <Link href="/staff/portal/schedule" style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  textDecoration: 'none',
                  background: '#fff', color: AMBER,
                  fontWeight: 600, fontSize: 13,
                  padding: '12px 17px',
                  borderTop: '1px dashed ' + LINE,
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="16" height="16">
                    <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>
                  </svg>
                  Tap to confirm this shift
                </Link>
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '12px 17px',
                  borderTop: '1px dashed ' + LINE,
                  color: DEEP, fontWeight: 600, fontSize: 13,
                  background: SAGE_TINT,
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {'Shift confirmed — see you ' + (isToday ? 'today' : isTomorrow ? 'tomorrow' : DOW_FULL[shiftDate.getDay()])}
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: '16px 17px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>
                <line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/>
              </svg>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: INK }}>No published shifts yet</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                  Shifts appear here once your manager publishes the roster.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── This week stats ─────────────────────────────────────────────── */}
        <SectionLabel text="This week" />
        <div className="grid grid-cols-2 gap-3">
          {/* Hours with progress ring */}
          <div style={{
            background: CARD, borderRadius: 18,
            boxShadow: SHADOW, padding: 15,
            border: '1px solid ' + LINE,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <ProgressRing pct={hoursPct} />
              <div style={{
                width: 30, height: 30, borderRadius: 9, background: SAGE_TINT,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
              }}>
                ⏱️
              </div>
            </div>
            <div style={{
              fontFamily: 'var(--font-display, serif)',
              fontSize: 25, fontWeight: 600, marginTop: 9, lineHeight: 1, color: INK,
            }}>
              {weekHours.toFixed(1)}<span style={{ fontSize: 14, color: MUTED }}>h</span>
            </div>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 3 }}>Hours worked</div>
          </div>

          {/* Leave balance or empty state */}
          {(() => {
            const b = balances.find(x => x.leave_type === 'annual') ?? balances[0]
            if (b) return (
              <div style={{
                background: CARD, borderRadius: 18,
                boxShadow: SHADOW, padding: 15,
                border: '1px solid ' + LINE,
              }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 9, background: '#f6efe5',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
                  }}>
                    🏖️
                  </div>
                </div>
                <div style={{
                  fontFamily: 'var(--font-display, serif)',
                  fontSize: 25, fontWeight: 600, marginTop: 9, lineHeight: 1, color: INK,
                }}>
                  {b.remaining_days}<span style={{ fontSize: 14, color: MUTED }}>d</span>
                </div>
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 3 }}>
                  {(LEAVE_LABELS[b.leave_type] ?? b.leave_type).split(' ')[0] + ' remaining'}
                </div>
              </div>
            )
            return (
              <div style={{
                background: CARD, borderRadius: 18,
                boxShadow: SHADOW, padding: 15,
                border: '1px solid ' + LINE,
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
              }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>🏖️</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: INK }}>Leave</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Not set up yet</div>
              </div>
            )
          })()}
        </div>

        {/* ── Training ──────────────────────────────────────────────────────── */}
        <SectionLabel text="Your training" />
        <div style={{
          background: 'linear-gradient(135deg, #2D5240, #3a6b50)',
          borderRadius: 20, padding: 17,
          color: '#ffffff',
          position: 'relative', overflow: 'hidden',
          boxShadow: SHADOW,
        }}>
          <span style={{
            position: 'absolute', top: 14, right: 14,
            background: 'rgba(255,255,255,.16)',
            fontSize: 10.5, padding: '3px 10px', borderRadius: 999,
          }}>
            Coming soon
          </span>
          <h3 style={{
            fontFamily: 'var(--font-display, serif)',
            fontWeight: 600, fontSize: 17, marginBottom: 4,
          }}>
            Keep your skills sharp ☕
          </h3>
          <p style={{ fontSize: 12.5, opacity: 0.85, lineHeight: 1.45, maxWidth: 230 }}>
            Training modules and certifications will appear here once the training system is live.
          </p>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{
              flex: 1, height: 7,
              background: 'rgba(255,255,255,.2)',
              borderRadius: 99, overflow: 'hidden',
            }}>
              <div style={{ height: '100%', width: '0%', background: '#ffd98a', borderRadius: 99 }} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>—</div>
          </div>
        </div>

        {/* ── Leave balances ───────────────────────────────────────────────── */}
        <SectionLabel text="Leave balances" />
        {balances.length > 0 ? (
          <div style={{
            background: CARD, borderRadius: 18,
            boxShadow: SHADOW, padding: '15px 16px',
            border: '1px solid ' + LINE,
          }}>
            {balances.map((b, idx) => {
              const total  = Math.max(b.accrued_days, 1)
              const pct    = Math.min(100, Math.round((b.remaining_days / total) * 100))
              const isLow  = pct < 25
              const barBg  = isLow
                ? 'linear-gradient(90deg, #e9b765, ' + AMBER + ')'
                : 'linear-gradient(90deg, ' + SAGE + ', ' + DEEP + ')'
              return (
                <div key={b.leave_type} style={{ marginBottom: idx < balances.length - 1 ? 13 : 0 }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    fontSize: 12.5, marginBottom: 6,
                  }}>
                    <b style={{ fontWeight: 600, color: INK }}>
                      {LEAVE_LABELS[b.leave_type] ?? b.leave_type}
                    </b>
                    <span style={{ color: MUTED }}>
                      {b.remaining_days} / {b.accrued_days} days
                    </span>
                  </div>
                  <div style={{ height: 8, background: '#eef2ef', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{
                      display: 'block', height: '100%', borderRadius: 99,
                      width: pct + '%',
                      background: barBg,
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{
            background: CARD, borderRadius: 18,
            boxShadow: SHADOW, padding: '15px 16px',
            border: '1px solid ' + LINE,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="9"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <p style={{ fontSize: 13, color: MUTED }}>
                Leave balances not set up yet — contact your manager.
              </p>
            </div>
          </div>
        )}

        {/* ── Quick actions ────────────────────────────────────────────────── */}
        <SectionLabel text="Quick actions" />
        <div className="grid grid-cols-2 gap-3">
          {([
            { href: '/staff/portal/schedule',     emoji: '📅', label: 'My schedule',   desc: 'See all shifts' },
            { href: '/staff/portal/leave',        emoji: '🏖️', label: 'Request leave', desc: 'Book time off' },
            { href: '/staff/portal/timesheets',   emoji: '🕒', label: 'Timesheets',    desc: 'Clock history' },
            { href: '/staff/portal/messages',     emoji: '✉️',  label: 'Messages',      desc: 'Your inbox' },
          ] as const).map(({ href, emoji, label, desc }) => (
            <Link
              key={href}
              href={href}
              className="transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
              style={{
                background: CARD,
                border: '1px solid ' + LINE,
                borderRadius: 17, padding: 15,
                boxShadow: SHADOW,
                textDecoration: 'none',
                display: 'block',
              }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: 11, background: SAGE_TINT,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, marginBottom: 10,
              }}>
                {emoji}
              </div>
              <b style={{ fontSize: 13.5, fontWeight: 600, display: 'block', color: INK }}>{label}</b>
              <span style={{ fontSize: 11, color: MUTED, display: 'block', marginTop: 2 }}>{desc}</span>
            </Link>
          ))}
        </div>

      </div>
    </div>
  )
}
