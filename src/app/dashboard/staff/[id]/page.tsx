'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { StaffMember, StaffPayRate } from '@/types/staff'

type Tab = 'overview' | 'pay' | 'skills' | 'documents' | 'leave'

const PAY_RATE_LABELS: Record<string, string> = {
  default: 'Default', weekday: 'Weekday', weekend: 'Weekend',
  evening: 'Evening', public_holiday: 'Public Holiday', overtime: 'Overtime', custom: 'Custom',
}

type MemberDetail = StaffMember & {
  staff_member_skills?: Array<{ staff_skills: { name: string; color: string } | null; certified_at: string | null }>
  staff_pay_rates?: StaffPayRate[]
  staff_documents?: Array<{ id: string; document_name: string; document_type: string; expiry_date: string | null; file_url: string | null; is_verified: boolean }>
  staff_leave?: Array<{ id: string; leave_type: string; start_date: string; end_date: string; days_taken: number | null; status: string }>
}

export default function StaffProfilePage() {
  const params = useParams() as { id: string }
  const [member, setMember] = useState<MemberDetail | null>(null)
  const [rates, setRates] = useState<StaffPayRate[]>([])
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')

  const load = async () => {
    const [mr, rr] = await Promise.all([
      fetch(`/api/staff/members/${params.id}`).then(r => r.json()),
      fetch(`/api/staff/members/${params.id}/pay-rates`).then(r => r.json()),
    ])
    setMember(mr.member ?? null)
    setRates(rr.rates ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [params.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const sendInvite = async () => {
    if (!member) return
    setInviting(true); setInviteMsg('')
    const r = await fetch('/api/staff/invite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_member_id: params.id }),
    })
    const j = await r.json()
    setInviteMsg(r.ok ? `Invite sent to ${j.email}` : (j.error ?? 'Failed'))
    setInviting(false)
    if (r.ok) load()
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' }, { key: 'pay', label: 'Pay rates' },
    { key: 'skills', label: 'Skills' }, { key: 'documents', label: 'Documents' },
    { key: 'leave', label: 'Leave' },
  ]

  if (loading) return <div className="p-6" style={{ color: 'var(--text-primary, #E8EDE7)' }}>Loading…</div>
  if (!member) return <div className="p-6" style={{ color: 'var(--text-primary, #E8EDE7)' }}>Staff member not found.</div>

  const displayName = member.preferred_name ?? `${member.first_name} ${member.last_name}`
  const hasPortal = member.portal_enabled && member.user_id
  const canInvite = !hasPortal && (member.work_email || member.personal_email)

  return (
    <div className="p-6 max-w-4xl space-y-6" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-semibold"
            style={{ background: member.color ?? '#6366f1' }}>
            {member.first_name[0]}{member.last_name[0]}
          </div>
          <div>
            <h1 className="text-2xl font-medium">{displayName}</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{member.position}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
              {member.employment_type.replace('_', ' ')} · {member.status}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canInvite && (
            <button onClick={sendInvite} disabled={inviting} className="px-4 py-2 text-sm rounded-lg"
              style={{ border: '1px solid rgba(127,184,151,0.3)', color: '#7FB897' }}>
              {inviting ? 'Sending…' : 'Send portal invite'}
            </button>
          )}
          {hasPortal && <span className="px-3 py-2 text-xs rounded-lg bg-emerald-500/20 text-emerald-400">Portal active</span>}
          <Link href="/dashboard/staff" className="px-4 py-2 text-sm rounded-lg"
            style={{ border: '1px solid var(--divider, rgba(232,237,231,0.04))', color: 'var(--text-secondary, #A8B5A8)' }}>
            ← Back
          </Link>
        </div>
      </div>
      {inviteMsg && <p className="text-sm" style={{ color: inviteMsg.startsWith('Invite sent') ? '#7FB897' : '#FF6B6B' }}>{inviteMsg}</p>}

      <div className="flex gap-1" style={{ borderBottom: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className="px-4 py-2 text-sm transition-colors"
            style={{ color: tab === t.key ? '#7FB897' : 'var(--text-secondary, #A8B5A8)', borderBottom: tab === t.key ? '2px solid #7FB897' : '2px solid transparent', marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-5 text-sm">
          {([
            ['Email (work)', member.work_email],
            ['Email (personal)', member.personal_email],
            ['Mobile', member.mobile],
            ['Start date', member.start_date],
            ['Pay type', member.pay_type],
            ['Pay rate', member.pay_rate_cents ? `$${(Number(member.pay_rate_cents) / 100).toFixed(2)}/hr` : '—'],
            ['Superannuation', `${member.superannuation_rate}%`],
            ['Emergency contact', member.emergency_contact_name ? `${member.emergency_contact_name} (${member.emergency_contact_relationship ?? ''}) ${member.emergency_contact_phone ?? ''}`.trim() : null],
          ] as [string, string | null | undefined][]).map(([label, value]) => (
            <div key={label}>
              <div className="text-xs mb-0.5" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{label}</div>
              <div>{value ?? '—'}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'pay' && (
        <div>
          {rates.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>No pay rates configured. Base rate from overview applies.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
                  {['Type','Rate','From','Until','Notes'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rates.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
                    <td className="px-3 py-2">{PAY_RATE_LABELS[r.rate_type] ?? r.rate_type}</td>
                    <td className="px-3 py-2 font-medium">${r.hourly_rate_dollars}/hr</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{r.effective_from}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{r.effective_until ?? '—'}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{r.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'skills' && (
        <div>
          {(member.staff_member_skills ?? []).length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>No skills assigned.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(member.staff_member_skills ?? []).map((s, i) => s.staff_skills && (
                <div key={i} className="px-3 py-1.5 rounded-lg text-sm"
                  style={{ background: (s.staff_skills.color ?? '#6366f1') + '22', color: s.staff_skills.color ?? '#6366f1' }}>
                  {s.staff_skills.name}
                  {s.certified_at && <span className="ml-2 text-xs opacity-70">cert {s.certified_at.slice(0, 10)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'documents' && (
        <div>
          {(member.staff_documents ?? []).length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>No documents uploaded.</p>
          ) : (
            <div className="space-y-2">
              {(member.staff_documents ?? []).map(d => (
                <div key={d.id} className="flex justify-between items-center p-3 rounded-lg"
                  style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
                  <div>
                    <div className="font-medium text-sm">{d.document_name}</div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                      {d.document_type}{d.expiry_date ? ` · expires ${d.expiry_date}` : ''}{d.is_verified ? ' · ✓ verified' : ''}
                    </div>
                  </div>
                  {d.file_url && <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="text-xs hover:underline" style={{ color: '#7FB897' }}>View</a>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'leave' && (
        <div>
          {(member.staff_leave ?? []).length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>No leave records.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
                  {['Type','Start','End','Days','Status'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(member.staff_leave ?? []).map(l => (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
                    <td className="px-3 py-2 capitalize">{l.leave_type}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{l.start_date}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{l.end_date}</td>
                    <td className="px-3 py-2">{l.days_taken ?? '—'}</td>
                    <td className="px-3 py-2 capitalize" style={{ color: l.status === 'approved' ? '#7FB897' : 'var(--text-secondary, #A8B5A8)' }}>{l.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
