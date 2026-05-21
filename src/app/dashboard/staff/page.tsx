'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import type { StaffMember } from '@/types/staff'

interface MemberRow extends StaffMember {
  staff_member_skills?: Array<{ staff_skills: { name: string; color: string } | null }>
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'bg-emerald-500/20 text-emerald-400',
    inactive: 'bg-yellow-500/20 text-yellow-400',
    terminated: 'bg-red-500/20 text-red-400',
  }
  return map[status] ?? 'bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)]'
}

function PortalBadge({ member }: { member: MemberRow }) {
  const [resending, setResending] = useState(false)
  const [msg, setMsg] = useState('')

  const resend = async () => {
    if (!member.business_id) return
    setResending(true)
    setMsg('')
    const r = await fetch('/api/staff/invite/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_member_id: member.id, business_id: member.business_id }),
    })
    const j = await r.json()
    setMsg(r.ok ? `Resent to ${j.email}` : (j.error ?? 'Failed'))
    setResending(false)
  }

  // Active: portal explicitly enabled, OR user has linked their account (user_id set after accepting invite)
  if (member.portal_enabled || (member.user_id && member.invite_sent_at)) {
    return <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Active</span>
  }
  if (member.invite_sent_at) {
    return (
      <div className="space-y-1">
        <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">Invited</span>
        <button onClick={resend} disabled={resending} className="block text-xs hover:underline" style={{ color: '#7FB897' }}>
          {resending ? 'Sending…' : 'Resend'}
        </button>
        {msg && <span className="block text-xs" style={{ color: msg.startsWith('Resent') ? '#7FB897' : '#ef4444' }}>{msg}</span>}
      </div>
    )
  }
  return <span className="text-xs px-2 py-0.5 rounded bg-[rgba(255,255,255,0.06)]" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Not invited</span>
}


interface StaffSale { served_by: string; total: number; count: number }

function Leaderboard({ businessId }: { businessId: string }) {
  const [data, setData] = React.useState<StaffSale[]>([])
  const [loading, setLoading] = React.useState(true)
  const [period, setPeriod] = React.useState(30)

  React.useEffect(() => {
    if (!businessId) return
    setLoading(true)
    const since = new Date(Date.now() - period * 86400000).toISOString()
    fetch('/api/pos/sales?business_id=' + businessId + '&limit=2000&since=' + since)
      .then(r => r.json())
      .then(d => {
        const sales = (d.sales ?? []).filter((s: { status?: string; served_by?: string }) => s.status !== 'voided' && s.served_by)
        const byStaff: Record<string, { total: number; count: number }> = {}
        for (const s of sales) {
          const name = (s as { served_by?: string }).served_by ?? 'Unknown'
          if (!byStaff[name]) byStaff[name] = { total: 0, count: 0 }
          byStaff[name].total += Number((s as { total_amount?: number }).total_amount ?? 0)
          byStaff[name].count++
        }
        const sorted = Object.entries(byStaff).map(([served_by, v]) => ({ served_by, ...v })).sort((a, b) => b.total - a.total)
        setData(sorted)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [businessId, period])

  const best = data[0]?.total ?? 1
  const MEDALS = ['🥇', '🥈', '🥉']

  return (
    <div style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid rgba(232,237,231,0.04)', borderRadius: 12, padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary, #E8EDE7)', margin: 0 }}>Sales Leaderboard</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {[7, 30, 90].map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid ' + (period === p ? 'rgba(127,184,151,0.5)' : 'rgba(232,237,231,0.08)'), background: period === p ? 'rgba(127,184,151,0.1)' : 'transparent', color: period === p ? '#7FB897' : 'var(--text-secondary, #A8B5A8)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {p}d
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary, #A8B5A8)', fontSize: 13 }}>Loading...</div>
      ) : data.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary, #A8B5A8)', fontSize: 13 }}>
          No sales data with staff attribution yet. Make sure served_by is recorded in sales.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.map((staff, i) => (
            <div key={staff.served_by} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 18, width: 28, textAlign: 'center', flexShrink: 0 }}>{MEDALS[i] ?? (i + 1)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary, #E8EDE7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{staff.served_by}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#7FB897', flexShrink: 0, marginLeft: 8 }}>A${Math.round(staff.total).toLocaleString('en-AU')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                    <div style={{ height: 4, width: (staff.total / best * 100) + '%', background: i === 0 ? '#1D9E75' : i === 1 ? '#7FB897' : 'rgba(127,184,151,0.4)', borderRadius: 2, transition: 'width 0.5s' }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary, #A8B5A8)', flexShrink: 0 }}>{staff.count} sales · A${Math.round(staff.total / staff.count).toLocaleString('en-AU')} avg</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {business?.id && <SalesLeaderboard businessId={business.id} />}
    </div>
  )
}

function SalesLeaderboard({ businessId }: { businessId: string }) {
  const [period, setPeriod] = React.useState<'today'|'week'|'month'>('week')
  const [data, setData] = React.useState<Array<{name: string; total: number; count: number}>>([])
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!businessId) return
    setLoading(true)
    const days = period === 'today' ? 1 : period === 'week' ? 7 : 30
    const since = new Date(Date.now() - days * 86400000).toISOString()
    fetch('/api/pos/sales?business_id=' + businessId + '&limit=1000&since=' + since)
      .then(r => r.json())
      .then((d: { sales?: Array<{served_by?: string; total_amount?: number}> }) => {
        const map: Record<string, {total: number; count: number}> = {}
        for (const s of d.sales ?? []) {
          const name = s.served_by || 'Unknown'
          if (!map[name]) map[name] = { total: 0, count: 0 }
          map[name].total += Number(s.total_amount ?? 0)
          map[name].count += 1
        }
        const sorted = Object.entries(map)
          .map(([name, v]) => ({ name, ...v }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 10)
        setData(sorted)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [businessId, period])

  const max = data[0]?.total || 1

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)', padding: '20px', marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Sales leaderboard</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['today', 'week', 'month'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid ' + (period === p ? '#1D9E75' : 'rgba(255,255,255,0.1)'), background: period === p ? 'rgba(29,158,117,0.2)' : 'transparent', color: period === p ? '#1D9E75' : 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
              {p}
            </button>
          ))}
        </div>
      </div>
      {loading && <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Loading...</p>}
      {!loading && data.length === 0 && <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>No sales data for this period.</p>}
      {data.map((row, i) => (
        <div key={row.name} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: i === 0 ? '#F59E0B' : '#fff', fontWeight: i === 0 ? 700 : 400 }}>
              {i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : (i + 1) + '. '}{row.name}
            </span>
            <span style={{ fontSize: 13, color: '#1D9E75', fontWeight: 600 }}>A${Math.round(row.total).toLocaleString()}</span>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
            <div style={{ height: 4, width: Math.round((row.total / max) * 100) + '%', background: 'linear-gradient(90deg,#1D9E75,#7FB897)', borderRadius: 2, transition: 'width 0.4s ease' }} />
          </div>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{row.count} transactions</p>
        </div>
      ))}
    </div>
  )
}

export default function StaffPage() {
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')

  const load = async (q: string, s: string) => {
    setLoading(true)
    const params = new URLSearchParams({ status: s })
    if (q) params.set('q', q)
    const r = await fetch(`/api/staff/members?${params}`)
    const j = await r.json()
    setMembers(j.members ?? [])
    setLoading(false)
  }

  useEffect(() => { load(search, statusFilter) }, [statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(() => load(search, statusFilter), 350)
    return () => clearTimeout(t)
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  const displayName = (m: MemberRow) => m.preferred_name ?? `${m.first_name} ${m.last_name}`
  const payDisplay = (m: MemberRow) => m.pay_rate_cents ? `$${(Number(m.pay_rate_cents) / 100).toFixed(2)}/hr` : '—'

  return (
    <div className="p-6 max-w-7xl space-y-6" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      <header className="flex justify-between items-baseline flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-medium">Staff</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
            {members.length} {statusFilter !== 'all' ? statusFilter : ''} staff member{members.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/dashboard/staff/timesheets" className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'rgba(45,82,64,0.3)', border: '1px solid rgba(45,82,64,0.5)', color: '#7FB897' }}>
            Timesheets
          </Link>
          <Link href="/dashboard/staff/leave" className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'rgba(45,82,64,0.3)', border: '1px solid rgba(45,82,64,0.5)', color: '#7FB897' }}>
            Leave
          </Link>
          <Link href="/dashboard/staff/roster" className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'rgba(45,82,64,0.3)', border: '1px solid rgba(45,82,64,0.5)', color: '#7FB897' }}>
            Roster Builder
          </Link>
          <Link href="/dashboard/staff/payroll" className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'rgba(45,82,64,0.3)', border: '1px solid rgba(45,82,64,0.5)', color: '#7FB897' }}>
            Payroll
          </Link>
          <Link href="/dashboard/staff/messages" className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'rgba(45,82,64,0.3)', border: '1px solid rgba(45,82,64,0.5)', color: '#7FB897' }}>
            Messages
          </Link>
          <Link href="/dashboard/staff/announcements" className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'rgba(45,82,64,0.3)', border: '1px solid rgba(45,82,64,0.5)', color: '#7FB897' }}>
            Announcements
          </Link>
          <Link href="/dashboard/staff/new" className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: '#2D5240', color: '#7FB897' }}>
            + Add staff member
          </Link>
        </div>
      </header>

      <div className="flex gap-3 flex-wrap">
        <input type="text" placeholder="Search name or position…" value={search} onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm w-64"
          style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))', color: 'var(--text-primary, #E8EDE7)' }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))', color: 'var(--text-primary, #E8EDE7)' }}>
          <option value="active" style={{ background: '#1a2420', color: '#e8ede7' }}>Active</option>
          <option value="inactive" style={{ background: '#1a2420', color: '#e8ede7' }}>Inactive</option>
          <option value="terminated" style={{ background: '#1a2420', color: '#e8ede7' }}>Terminated</option>
          <option value="all" style={{ background: '#1a2420', color: '#e8ede7' }}>All</option>
        </select>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Loading…</div>
      ) : members.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          <p className="text-lg mb-2">No staff members found.</p>
          <Link href="/dashboard/staff/new" className="text-sm hover:underline" style={{ color: '#7FB897' }}>Add your first staff member →</Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-elevated, #1A2620)', borderBottom: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
                {['Name','Position','Employment','Pay rate','Skills','Portal','Status',''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wide font-medium" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0"
                        style={{ background: m.color ?? '#6366f1' }}>
                        {m.first_name[0]}{m.last_name[0]}
                      </div>
                      <div>
                        <div className="font-medium">{displayName(m)}</div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{m.work_email ?? m.personal_email ?? ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{m.position}</td>
                  <td className="px-4 py-3 capitalize" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{(m.employment_type ?? '').replace('_', ' ')}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{payDisplay(m)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {(m.staff_member_skills ?? []).slice(0, 3).map((s, i) => s.staff_skills && (
                        <span key={i} className="text-xs px-2 py-0.5 rounded"
                          style={{ background: (s.staff_skills.color ?? '#6366f1') + '33', color: s.staff_skills.color ?? '#6366f1' }}>
                          {s.staff_skills.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3"><PortalBadge member={m} /></td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded capitalize ${statusBadge(m.status)}`}>{m.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/staff/${m.id}`} className="text-xs hover:underline" style={{ color: '#7FB897' }}>View →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
      <div style={{ marginTop: 24 }}>
        <Leaderboard businessId={members[0]?.business_id ?? ''} />
      </div>
  )
}

