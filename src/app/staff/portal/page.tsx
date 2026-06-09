'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

// ─── Types (unchanged) ───────────────────────────────────────────────────────

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
  annual: 'Annual', sick: 'Sick', personal: 'Personal',
}

// ─── SVG Icons ───────────────────────────────────────────────────────────────

const IconCalendar = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
  </svg>
)
const IconSun = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
    <circle cx="12" cy="12" r="4"/>
    <line x1="12" y1="2" x2="12" y2="5"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/>
    <line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/>
    <line x1="2" y1="12" x2="5" y2="12"/>
    <line x1="19" y1="12" x2="22" y2="12"/>
    <line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/>
    <line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/>
  </svg>
)
const IconClock = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
    <circle cx="12" cy="12" r="9"/>
    <polyline points="12 7 12 12 15 15"/>
  </svg>
)
const IconSliders = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
    <line x1="4" y1="6" x2="20" y2="6"/>
    <line x1="4" y1="12" x2="20" y2="12"/>
    <line x1="4" y1="18" x2="20" y2="18"/>
    <circle cx="9" cy="6" r="2" fill="var(--bg-elevated, #1A2620)"/>
    <circle cx="15" cy="12" r="2" fill="var(--bg-elevated, #1A2620)"/>
    <circle cx="9" cy="18" r="2" fill="var(--bg-elevated, #1A2620)"/>
  </svg>
)

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function Bone({ h = 16, w = '100%', radius = 8 }: { h?: number; w?: number | string; radius?: number }) {
  return (
    <div style={{
      height: h, width: w, borderRadius: radius,
      background: 'rgba(127,184,151,0.1)',
    }} />
  )
}

function SkeletonLayout() {
  return (
    <div className="animate-pulse space-y-4">
      {/* header */}
      <div className="flex items-center gap-3">
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(127,184,151,0.12)' }} />
        <div className="space-y-2 flex-1">
          <Bone h={18} w="45%" />
          <Bone h={12} w="60%" />
        </div>
      </div>
      {/* shift card */}
      <div style={{ height: 96, borderRadius: 16, background: 'rgba(127,184,151,0.08)' }} />
      {/* stats row */}
      <div className="grid grid-cols-2 gap-3">
        <Bone h={60} radius={14} />
        <Bone h={60} radius={14} />
      </div>
      {/* leave balances */}
      <Bone h={80} radius={16} />
      {/* quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Bone h={76} radius={16} />
        <Bone h={76} radius={16} />
        <Bone h={76} radius={16} />
        <Bone h={76} radius={16} />
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StaffPortalHome() {
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [balances, setBalances] = useState<Balance[]>([])
  const [nextShift, setNextShift] = useState<Shift | null>(null)
  const [weekHours, setWeekHours] = useState(0)
  const [loading, setLoading] = useState(true)
  const [unauthorized, setUnauthorized] = useState(false)

  // Unchanged data fetch — same sources, same logic
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
      const upcoming = ((sched as { shifts?: Shift[] }).shifts ?? []).filter(s => new Date(s.start_time) > now)
      setNextShift(upcoming[0] ?? null)
      setWeekHours(Number((ts as { totalHours?: number }).totalHours) || 0)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <SkeletonLayout />

  if (unauthorized || !identity) return (
    <div className="text-center py-20 space-y-3">
      <div style={{ fontSize: 40, lineHeight: 1 }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#A8B5A8" strokeWidth="1.5" strokeLinecap="round" className="mx-auto">
          <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        </svg>
      </div>
      <p className="text-sm font-medium" style={{ color: 'var(--text-primary, #E8EDE7)' }}>Portal access not set up</p>
      <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Contact your manager to send you an invite.</p>
      <a href="/staff/login" className="text-sm hover:underline" style={{ color: 'var(--accent, #7FB897)' }}>Log in →</a>
    </div>
  )

  const displayName = identity.preferred_name ?? identity.first_name
  const initials = identity.first_name[0] + identity.last_name[0]
  const empType = identity.employment_type.replace('_', ' ')

  // Best leave balance to surface in stats row
  const annualBalance = balances.find(b => b.leave_type === 'annual') ?? balances[0] ?? null

  const CARD = {
    background: 'var(--bg-elevated, #1A2620)',
    border: '1px solid var(--divider, rgba(232,237,231,0.06))',
  }

  return (
    <div className="space-y-4">

      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 pt-1">
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: identity.color,
          boxShadow: `0 0 0 3px rgba(127,184,151,0.15), 0 0 0 6px rgba(127,184,151,0.06)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 600, fontSize: 17, flexShrink: 0,
        }}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold truncate" style={{ fontSize: 20, color: 'var(--text-primary, #E8EDE7)' }}>
            Hi, {displayName} 👋
          </h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{identity.position}</span>
            <span className="text-xs px-2 py-0.5 rounded-full capitalize"
              style={{ background: 'rgba(127,184,151,0.12)', color: '#7FB897' }}>
              {empType}
            </span>
          </div>
        </div>
      </header>

      {/* ── Next shift ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl p-4" style={{
        ...CARD,
        borderLeft: nextShift ? '3px solid #7FB897' : `1px solid var(--divider, rgba(232,237,231,0.06))`,
      }}>
        <div className="text-xs uppercase tracking-widest mb-3 font-medium"
          style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          Next shift
        </div>

        {nextShift ? (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold" style={{ fontSize: 16, color: 'var(--text-primary, #E8EDE7)' }}>
                  {new Date(nextShift.start_time).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}
                </div>
                <div className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                  {nextShift.start_time.slice(11, 16)} – {nextShift.end_time.slice(11, 16)}
                  <span className="mx-1.5 opacity-40">·</span>
                  <span className="font-medium" style={{ color: '#7FB897' }}>{nextShift.hours.toFixed(1)}h</span>
                </div>
              </div>
              {/* hour badge */}
              <div className="rounded-xl px-3 py-1.5 text-center flex-shrink-0"
                style={{ background: 'rgba(127,184,151,0.1)', minWidth: 52 }}>
                <div className="font-bold" style={{ color: '#7FB897', fontSize: 18, lineHeight: 1 }}>
                  {nextShift.hours.toFixed(0)}
                </div>
                <div className="text-xs" style={{ color: 'rgba(127,184,151,0.6)' }}>hrs</div>
              </div>
            </div>

            {/* role / area chips */}
            {(nextShift.role || nextShift.area_name) && (
              <div className="flex gap-2 flex-wrap">
                {nextShift.role && (
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(232,237,231,0.06)', color: 'var(--text-secondary, #A8B5A8)' }}>
                    {nextShift.role}
                  </span>
                )}
                {nextShift.area_name && (
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(232,237,231,0.06)', color: 'var(--text-secondary, #A8B5A8)' }}>
                    {nextShift.area_name}
                  </span>
                )}
              </div>
            )}

            {/* confirm CTA */}
            {!nextShift.confirmed_by_staff && (
              <Link href="/staff/portal/schedule"
                className="flex items-center gap-1.5 text-xs font-medium mt-1 hover:underline"
                style={{ color: '#f59e0b' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="10"/>
                </svg>
                Tap to confirm this shift
              </Link>
            )}
          </div>
        ) : (
          /* Intentional empty state */
          <div className="flex items-center gap-4 py-2">
            <div style={{ color: 'rgba(127,184,151,0.3)' }}>
              <IconCalendar />
            </div>
            <div>
              <div className="text-sm font-medium" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                No published shifts yet
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'rgba(232,237,231,0.3)' }}>
                Shifts will appear here once your manager publishes the roster.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Stats row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Hours this week */}
        <div className="rounded-xl p-4" style={CARD}>
          <div className="text-xs uppercase tracking-widest mb-1"
            style={{ color: 'var(--text-secondary, #A8B5A8)' }}>This week</div>
          <div className="flex items-baseline gap-1">
            <span className="font-bold" style={{ fontSize: 26, lineHeight: 1, color: 'var(--text-primary, #E8EDE7)' }}>
              {weekHours.toFixed(1)}
            </span>
            <span className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>h</span>
          </div>
          <div className="text-xs mt-1" style={{ color: 'rgba(232,237,231,0.25)' }}>hours worked</div>
        </div>

        {/* Best leave balance */}
        {annualBalance ? (
          <div className="rounded-xl p-4" style={CARD}>
            <div className="text-xs uppercase tracking-widest mb-1"
              style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
              {LEAVE_LABELS[annualBalance.leave_type] ?? annualBalance.leave_type} leave
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-bold" style={{ fontSize: 26, lineHeight: 1, color: 'var(--text-primary, #E8EDE7)' }}>
                {annualBalance.remaining_days}
              </span>
              <span className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>d</span>
            </div>
            <div className="text-xs mt-1" style={{ color: 'rgba(232,237,231,0.25)' }}>remaining</div>
          </div>
        ) : (
          <div className="rounded-xl p-4" style={CARD}>
            <div className="text-xs uppercase tracking-widest mb-1"
              style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Leave</div>
            <div className="text-sm mt-2" style={{ color: 'rgba(232,237,231,0.3)' }}>No balances set</div>
          </div>
        )}
      </div>

      {/* ── Leave balances detail ────────────────────────────────────────── */}
      {balances.length > 0 && (
        <div className="rounded-2xl p-4 space-y-3" style={CARD}>
          <div className="text-xs uppercase tracking-widest font-medium"
            style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
            Leave balances {new Date().getFullYear()}
          </div>
          {balances.map(b => {
            const total = Math.max(b.accrued_days, 1)
            const pct = Math.min(100, Math.round((b.remaining_days / total) * 100))
            const isLow = pct < 25
            return (
              <div key={b.leave_type}>
                <div className="flex justify-between items-baseline mb-1.5">
                  <span className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                    {LEAVE_LABELS[b.leave_type] ?? b.leave_type}
                  </span>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
                    {b.remaining_days}
                    <span className="text-xs font-normal ml-0.5" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                      / {b.accrued_days}d
                    </span>
                  </span>
                </div>
                {/* Progress bar */}
                <div style={{ height: 3, borderRadius: 2, background: 'rgba(127,184,151,0.1)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`,
                    borderRadius: 2,
                    background: isLow ? '#f59e0b' : '#7FB897',
                    transition: 'width 400ms ease-out',
                  }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Quick actions ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {([
          { href: '/staff/portal/schedule', label: 'My Schedule', desc: 'View & confirm shifts', Icon: IconCalendar },
          { href: '/staff/portal/leave',    label: 'Request Leave', desc: 'Submit a leave request', Icon: IconSun },
          { href: '/staff/portal/timesheets', label: 'My Hours',   desc: 'Clock-in history',      Icon: IconClock },
          { href: '/staff/portal/availability', label: 'Availability', desc: 'Set unavailable times', Icon: IconSliders },
        ] as const).map(({ href, label, desc, Icon }) => (
          <Link key={href} href={href}
            className="rounded-2xl p-4 block transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30 active:translate-y-0 active:shadow-none"
            style={{
              ...CARD,
              textDecoration: 'none',
            }}>
            <div className="mb-2.5" style={{ color: '#7FB897', opacity: 0.85 }}>
              <Icon />
            </div>
            <div className="font-medium text-sm" style={{ color: 'var(--text-primary, #E8EDE7)' }}>{label}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{desc}</div>
          </Link>
        ))}
      </div>

    </div>
  )
}
