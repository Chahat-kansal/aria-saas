'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Identity {
  first_name: string; last_name: string; preferred_name: string | null
  position: string; color: string; employment_type: string
}
interface Balance { leave_type: string; remaining_days: number }
interface Shift {
  start_time: string; end_time: string; hours: number
  role: string | null; area_name: string | null; confirmed_by_staff: boolean
}

const LEAVE_LABELS: Record<string, string> = {
  annual: 'Annual leave', sick: 'Sick leave', personal: 'Personal leave',
}

export default function StaffPortalHome() {
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [balances, setBalances] = useState<Balance[]>([])
  const [nextShift, setNextShift] = useState<Shift | null>(null)
  const [weekHours, setWeekHours] = useState(0)
  const [loading, setLoading] = useState(true)
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
      const now = new Date()
      const upcoming = ((sched as { shifts?: Shift[] }).shifts ?? []).filter(s => new Date(s.start_time) > now)
      setNextShift(upcoming[0] ?? null)
      setWeekHours(Number((ts as { totalHours?: number }).totalHours) || 0)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-sm py-8 text-center" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Loading…</div>

  if (unauthorized || !identity) return (
    <div className="text-center py-16 space-y-2">
      <p style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Portal access not set up.</p>
      <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Contact your manager to send you an invite.</p>
      <a href="/login" className="text-sm hover:underline" style={{ color: 'var(--accent, #7FB897)' }}>Log in →</a>
    </div>
  )

  const displayName = identity.preferred_name ?? identity.first_name

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-medium text-lg"
          style={{ background: identity.color }}>
          {identity.first_name[0]}{identity.last_name[0]}
        </div>
        <div>
          <h1 className="text-xl font-medium">Hi {displayName} 👋</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
            {identity.position} · {identity.employment_type.replace('_', ' ')}
          </p>
        </div>
      </header>

      {/* Next shift */}
      <div className="rounded-xl p-4" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Next shift</div>
        {nextShift ? (
          <div>
            <div className="font-medium">
              {new Date(nextShift.start_time).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}
            </div>
            <div className="text-sm mt-0.5" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
              {nextShift.start_time.slice(11, 16)} – {nextShift.end_time.slice(11, 16)} · {nextShift.hours.toFixed(1)}h
              {nextShift.area_name && ` · ${nextShift.area_name}`}
            </div>
            {!nextShift.confirmed_by_staff && (
              <Link href="/staff/portal/schedule" className="text-xs text-yellow-400 mt-1 inline-block hover:underline">
                ⚠ Tap to confirm
              </Link>
            )}
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>No upcoming published shifts.</p>
        )}
      </div>

      {/* This week's hours */}
      <div className="rounded-xl p-4" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
        <div className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>This week</div>
        <div className="text-2xl font-medium">
          {weekHours.toFixed(1)}h <span className="text-sm font-normal" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>worked</span>
        </div>
      </div>

      {/* Leave balances */}
      {balances.length > 0 && (
        <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
          <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Leave balances ({new Date().getFullYear()})</div>
          {balances.map(b => (
            <div key={b.leave_type} className="flex justify-between items-baseline text-sm">
              <span style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{LEAVE_LABELS[b.leave_type] ?? b.leave_type}</span>
              <span className="font-medium">{b.remaining_days} days remaining</span>
            </div>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { href: '/staff/portal/schedule', label: 'My Schedule', desc: 'View & confirm shifts' },
          { href: '/staff/portal/leave', label: 'Request Leave', desc: 'Submit a leave request' },
          { href: '/staff/portal/timesheets', label: 'My Hours', desc: 'Clock-in history' },
          { href: '/staff/portal/availability', label: 'Availability', desc: 'Set unavailable times' },
        ].map(item => (
          <Link key={item.href} href={item.href}
            className="rounded-xl p-4 transition-colors"
            style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
            <div className="font-medium text-sm">{item.label}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{item.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
