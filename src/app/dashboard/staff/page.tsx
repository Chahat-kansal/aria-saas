'use client'
import { useEffect, useState } from 'react'
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
  if (member.portal_enabled && member.user_id) {
    return <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Active</span>
  }
  if (member.invite_sent_at) {
    return <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">Invited</span>
  }
  return <span className="text-xs px-2 py-0.5 rounded bg-[rgba(255,255,255,0.06)]" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Not invited</span>
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
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="terminated">Terminated</option>
          <option value="all">All</option>
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
  )
}
