'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// ─── Types (unchanged data shape) ────────────────────────────────────────────

interface Identity {
  first_name: string; last_name: string; preferred_name: string | null
  position: string; color: string; employment_type: string
}
interface Balance { leave_type: string; remaining_days: number; accrued_days: number; taken_days: number }
interface Shift {
  start_time: string; end_time: string; hours: number
  role: string | null; area_name: string | null; confirmed_by_staff: boolean
}

const LEAVE_LABELS: Record<string, string> = {
  annual: 'Annual leave', sick: 'Sick leave', personal: 'Personal leave',
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const SAGE = '#7FB897'
const DEEP = '#2D5240'
const AMBER = '#BA7517'
const DARK = '#0E1411'
const CARD_BG = '#1A2620'
const TEXT_PRI = '#E8EDE7'
const TEXT_SEC = '#A8B5A8'
const DIVIDER = 'rgba(232,237,231,0.06)'

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const IcHome = ({ active }: { active?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? SAGE : 'none'} stroke={active ? SAGE : TEXT_SEC} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
)
const IcCalendar = ({ active }: { active?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? SAGE : TEXT_SEC} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>
    <line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/>
  </svg>
)
const IcAward = ({ active }: { active?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? SAGE : TEXT_SEC} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
  </svg>
)
const IcSun = ({ active }: { active?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? SAGE : TEXT_SEC} strokeWidth="1.75" strokeLinecap="round">
    <circle cx="12" cy="12" r="4"/>
    <line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/>
    <line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
    <line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/>
  </svg>
)
const IcMail = ({ active }: { active?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? SAGE : TEXT_SEC} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
)
const IcClock = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
    <circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/>
  </svg>
)
const IcSliders = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
    <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
    <circle cx="9" cy="6" r="2" fill={CARD_BG}/><circle cx="15" cy="12" r="2" fill={CARD_BG}/><circle cx="9" cy="18" r="2" fill={CARD_BG}/>
  </svg>
)

// ─── Bottom tab nav ───────────────────────────────────────────────────────────

function BottomNav() {
  const pathname = usePathname()
  const tabs = [
    { href: '/staff/portal',          label: 'Home',     Icon: IcHome },
    { href: '/staff/portal/schedule', label: 'Schedule', Icon: IcCalendar },
    { href: '/staff/portal/training', label: 'Training', Icon: IcAward },
    { href: '/staff/portal/leave',    label: 'Leave',    Icon: IcSun },
    { href: '/staff/portal/messages', label: 'Inbox',    Icon: IcMail },
  ]
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
      background: CARD_BG,
      borderTop: `1px solid ${DIVIDER}`,
      display: 'flex', height: 60,
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {tabs.map(({ href, label, Icon }) => {
        const active = pathname === href
        return (
          <Link key={href} href={href} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 3, textDecoration: 'none',
            color: active ? SAGE : TEXT_SEC,
          }}>
            <Icon active={active} />
            <span style={{ fontSize: 10, fontWeight: active ? 600 : 400 }}>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Bone({ h = 16, w = '100%', r = 8 }: { h?: number; w?: number | string; r?: number }) {
  return <div style={{ height: h, width: w, borderRadius: r, background: 'rgba(127,184,151,0.1)' }} />
}

function SkeletonLayout() {
  return (
    <div className="animate-pulse">
      {/* hero header placeholder */}
      <div style={{ height: 140, margin: '-24px -16px 0', background: `${DEEP}80` }} />
      <div className="space-y-4 mt-4">
        <Bone h={100} r={16} />
        <div className="grid grid-cols-2 gap-3"><Bone h={72} r={14} /><Bone h={72} r={14} /></div>
        <Bone h={80} r={16} />
        <div className="grid grid-cols-2 gap-3"><Bone h={80} r={16} /><Bone h={80} r={16} /><Bone h={80} r={16} /><Bone h={80} r={16} /></div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StaffPortalHome() {
  const [identity, setIdentity]   = useState<Identity | null>(null)
  const [balances, setBalances]   = useState<Balance[]>([])
  const [nextShift, setNextShift] = useState<Shift | null>(null)
  const [weekHours, setWeekHours] = useState(0)
  const [loading, setLoading]     = useState(true)
  const [unauthorized, setUnauthorized] = useState(false)

  // Data fetch — same sources, same logic (unchanged)
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
      const now = new Date()
      const upcoming = ((sched as { shifts?: Shift[] }).shifts ?? [])
        .filter(s => new Date(s.start_time) > now)
      setNextShift(upcoming[0] ?? null)
      setWeekHours(Number((ts as { totalHours?: number }).totalHours) || 0)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <>
      <SkeletonLayout />
      <BottomNav />
    </>
  )

  if (unauthorized || !identity) return (
    <>
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={TEXT_SEC} strokeWidth="1.5" strokeLinecap="round">
          <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        </svg>
        <p className="font-medium" style={{ color: TEXT_PRI }}>Portal access not set up</p>
        <p className="text-sm" style={{ color: TEXT_SEC }}>Contact your manager to send you an invite.</p>
        <a href="/staff/login" className="text-sm hover:underline" style={{ color: SAGE }}>Log in →</a>
      </div>
      <BottomNav />
    </>
  )

  const displayName = identity.preferred_name ?? identity.first_name
  const initials    = identity.first_name[0] + identity.last_name[0]
  const empType     = identity.employment_type.replace(/_/g, ' ')

  // Next shift display helpers
  const shiftDate = nextShift ? new Date(nextShift.start_time) : null
  const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const isToday = shiftDate
    ? shiftDate.toDateString() === new Date().toDateString()
    : false
  const isTomorrow = shiftDate
    ? shiftDate.toDateString() === new Date(Date.now() + 86400_000).toDateString()
    : false

  const CARD: React.CSSProperties = {
    background: CARD_BG,
    border: `1px solid ${DIVIDER}`,
    borderRadius: 16,
  }

  return (
    <>
      {/* ── Content (padded for bottom nav) ──────────────────────────────── */}
      <div style={{ paddingBottom: 76 }}>

        {/* ── Hero header (full-bleed gradient, breaks out of layout px-4) ── */}
        <div style={{
          margin: '-24px -16px 0',
          padding: '36px 20px 28px',
          background: `linear-gradient(160deg, ${DEEP} 0%, #162019 100%)`,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* subtle radial glow behind avatar */}
          <div style={{
            position: 'absolute', top: -30, left: -30, width: 180, height: 180,
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(127,184,151,0.12) 0%, transparent 70%)`,
            pointerEvents: 'none',
          }} />

          <div className="flex items-center gap-4 relative">
            {/* Avatar with sage ring glow */}
            <div style={{
              width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
              background: identity.color,
              boxShadow: `0 0 0 3px rgba(127,184,151,0.25), 0 0 0 6px rgba(127,184,151,0.08)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 18,
            }}>
              {initials}
            </div>

            <div className="min-w-0">
              <h1 style={{
                fontSize: 22, fontWeight: 700, color: TEXT_PRI,
                fontFamily: 'var(--font-display, serif)',
                margin: 0, lineHeight: 1.2,
              }}>
                {displayName}
              </h1>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span style={{ fontSize: 13, color: 'rgba(232,237,231,0.6)' }}>
                  {identity.position}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
                  padding: '2px 10px', borderRadius: 99,
                  background: 'rgba(127,184,151,0.18)', color: SAGE,
                }}>
                  {empType}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Main content (standard spacing from here) ──────────────────── */}
        <div className="space-y-4 mt-4">

          {/* ── Next shift ─────────────────────────────────────────────── */}
          <div style={{
            ...CARD,
            borderLeft: nextShift ? `3px solid ${SAGE}` : `1px solid ${DIVIDER}`,
            padding: 16,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: TEXT_SEC, marginBottom: 14 }}>
              Next shift
            </div>

            {nextShift && shiftDate ? (
              <div className="flex gap-3 items-start">
                {/* Day box */}
                <div style={{
                  width: 52, height: 60, borderRadius: 10, flexShrink: 0,
                  background: `rgba(127,184,151,0.1)`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: SAGE, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {DOW_SHORT[shiftDate.getDay()]}
                  </span>
                  <span style={{ fontSize: 26, fontWeight: 800, color: TEXT_PRI, lineHeight: 1, fontFamily: 'var(--font-display, serif)' }}>
                    {shiftDate.getDate()}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  {/* Date label */}
                  <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRI }}>
                    {isToday ? <span style={{ color: SAGE }}>Today · </span>
                      : isTomorrow ? <span style={{ color: SAGE }}>Tomorrow · </span>
                      : null}
                    {shiftDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  </div>

                  {/* Time + hours */}
                  <div style={{ fontSize: 13, color: TEXT_SEC, marginTop: 3 }}>
                    {nextShift.start_time.slice(11, 16)} – {nextShift.end_time.slice(11, 16)}
                    <span style={{ margin: '0 6px', opacity: 0.4 }}>·</span>
                    <span style={{ color: SAGE, fontWeight: 600 }}>{nextShift.hours.toFixed(1)}h</span>
                  </div>

                  {/* Role / area chips */}
                  {(nextShift.role || nextShift.area_name) && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {nextShift.role && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(232,237,231,0.07)', color: TEXT_SEC }}>
                          {nextShift.role}
                        </span>
                      )}
                      {nextShift.area_name && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(232,237,231,0.07)', color: TEXT_SEC }}>
                          {nextShift.area_name}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Confirm CTA */}
                  {!nextShift.confirmed_by_staff ? (
                    <Link href="/staff/portal/schedule" style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      marginTop: 10, fontSize: 12, fontWeight: 600,
                      color: AMBER, textDecoration: 'none',
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10"/><path d="M12 9v4M12 17h.01"/>
                      </svg>
                      Tap to confirm shift
                    </Link>
                  ) : (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 10, fontSize: 12, color: SAGE }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      Confirmed
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 0' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(127,184,151,0.3)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>
                  <line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/>
                </svg>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: TEXT_SEC }}>No published shifts yet</div>
                  <div style={{ fontSize: 12, color: 'rgba(232,237,231,0.3)', marginTop: 2 }}>
                    Shifts appear here once your manager publishes the roster.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Stats row ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            {/* Hours this week */}
            <div style={{ ...CARD, padding: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: TEXT_SEC, marginBottom: 8 }}>
                This week
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <span style={{ fontSize: 30, fontWeight: 800, color: TEXT_PRI, lineHeight: 1, fontFamily: 'var(--font-display, serif)' }}>
                  {weekHours.toFixed(1)}
                </span>
                <span style={{ fontSize: 14, color: TEXT_SEC }}>h</span>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(232,237,231,0.3)', marginTop: 4 }}>hours worked</div>
            </div>

            {/* Leave balance — data-driven, honest empty state */}
            {balances.length > 0 ? (() => {
              const b = balances.find(x => x.leave_type === 'annual') ?? balances[0]
              return (
                <div style={{ ...CARD, padding: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: TEXT_SEC, marginBottom: 8 }}>
                    {LEAVE_LABELS[b.leave_type]?.split(' ')[0] ?? b.leave_type}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                    <span style={{ fontSize: 30, fontWeight: 800, color: TEXT_PRI, lineHeight: 1, fontFamily: 'var(--font-display, serif)' }}>
                      {b.remaining_days}
                    </span>
                    <span style={{ fontSize: 14, color: TEXT_SEC }}>d</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(232,237,231,0.3)', marginTop: 4 }}>days remaining</div>
                </div>
              )
            })() : (
              <div style={{ ...CARD, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: TEXT_SEC, marginBottom: 8 }}>Leave</div>
                <div style={{ fontSize: 12, color: 'rgba(232,237,231,0.3)' }}>Not set up yet</div>
              </div>
            )}
          </div>

          {/* ── Leave balances detail bars ──────────────────────────────── */}
          {balances.length > 0 ? (
            <div style={{ ...CARD, padding: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: TEXT_SEC, marginBottom: 14 }}>
                Leave balances {new Date().getFullYear()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {balances.map(b => {
                  const total = Math.max(b.accrued_days, 1)
                  const pct   = Math.min(100, Math.round((b.remaining_days / total) * 100))
                  const isLow = pct < 25
                  return (
                    <div key={b.leave_type}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: TEXT_SEC }}>
                          {LEAVE_LABELS[b.leave_type] ?? b.leave_type}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRI }}>
                          {b.remaining_days}
                          <span style={{ fontSize: 11, fontWeight: 400, color: TEXT_SEC, marginLeft: 2 }}>
                            / {b.accrued_days}d
                          </span>
                        </span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: 'rgba(127,184,151,0.1)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${pct}%`, borderRadius: 2,
                          background: isLow ? AMBER : SAGE,
                          transition: 'width 500ms ease-out',
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            /* Honest empty state — no balance data yet */
            <div style={{ ...CARD, padding: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: TEXT_SEC, marginBottom: 10 }}>
                Leave balances {new Date().getFullYear()}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(127,184,151,0.25)" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p style={{ fontSize: 13, color: 'rgba(232,237,231,0.35)' }}>
                  Leave balances not set up yet — contact your manager.
                </p>
              </div>
            </div>
          )}

          {/* ── Quick action tiles (2×2) ───────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            {([
              { href: '/staff/portal/schedule',     label: 'My Schedule',   desc: 'View & confirm shifts', icon: <IcCalendar /> },
              { href: '/staff/portal/leave',        label: 'Request Leave', desc: 'Submit a leave request', icon: <IcSun /> },
              { href: '/staff/portal/timesheets',   label: 'My Hours',      desc: 'Clock-in history',      icon: <IcClock /> },
              { href: '/staff/portal/availability', label: 'Availability',  desc: 'Set unavailable times', icon: <IcSliders /> },
            ] as const).map(({ href, label, desc, icon }) => (
              <Link key={href} href={href}
                className="transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30 active:translate-y-0 active:shadow-none"
                style={{ ...CARD, padding: 16, display: 'block', textDecoration: 'none' }}>
                <div style={{ color: SAGE, opacity: 0.85, marginBottom: 10 }}>
                  {icon}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRI }}>{label}</div>
                <div style={{ fontSize: 11, color: TEXT_SEC, marginTop: 3 }}>{desc}</div>
              </Link>
            ))}
          </div>

          {/* ── Training section — coming soon (no fake data ever) ─────── */}
          <div style={{ ...CARD, padding: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: TEXT_SEC, marginBottom: 12 }}>
              Training
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: 'rgba(127,184,151,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(127,184,151,0.4)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(232,237,231,0.5)' }}>Coming soon</div>
                <div style={{ fontSize: 11, color: 'rgba(232,237,231,0.3)', marginTop: 2 }}>
                  Certifications and modules will appear here.
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Bottom tab nav (fixed) ────────────────────────────────────────── */}
      <BottomNav />
    </>
  )
}
