'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { StaffMember, StaffPayRate } from '@/types/staff'

type Tab = 'overview' | 'visa' | 'pay' | 'bank' | 'skills' | 'documents' | 'leave'

type MemberDetail = StaffMember & {
  // Visa / right to work
  visa_type?: string | null
  visa_subclass?: string | null
  visa_expiry_date?: string | null
  visa_work_restrictions?: string | null
  passport_expiry_date?: string | null
  passport_country?: string | null
  right_to_work_verified?: boolean
  right_to_work_verified_date?: string | null
  date_of_birth?: string | null
  // Banking / tax
  bank_account_name?: string | null
  bank_bsb?: string | null
  bank_account_number?: string | null
  tax_file_number?: string | null
  notes?: string | null
  // Relations
  staff_member_skills?: Array<{ staff_skills: { name: string; color: string } | null; certified_at: string | null }>
  staff_pay_rates?: StaffPayRate[]
  staff_documents?: Array<{ id: string; document_name: string; document_type: string; expiry_date: string | null; file_url: string | null; is_verified: boolean }>
  staff_leave?: Array<{ id: string; leave_type: string; start_date: string; end_date: string; days_taken: number | null; status: string }>
}

function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400_000)
}

function ExpiryBadge({ date, label }: { date?: string | null; label: string }) {
  if (!date) return <span className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Not recorded</span>
  const days = daysUntil(date)
  if (days === null) return null
  const color = days < 0 ? '#ef4444' : days < 30 ? '#f97316' : days < 90 ? '#f59e0b' : '#22c55e'
  const label2 = days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d remaining`
  return (
    <div>
      <span className="text-sm">{date}</span>
      <span className="ml-2 text-xs px-2 py-0.5 rounded" style={{ background: color + '22', color }}>{label2}</span>
    </div>
  )
}

export default function StaffProfilePage() {
  const params = useParams() as { id: string }
  const [member, setMember] = useState<MemberDetail | null>(null)
  const [rates, setRates] = useState<StaffPayRate[]>([])
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [edit, setEdit] = useState<Partial<MemberDetail>>({})
  const [visaInsight, setVisaInsight] = useState('')
  const [loadingInsight, setLoadingInsight] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [memberRes, ratesRes] = await Promise.all([
      fetch(`/api/staff/members/${params.id}`),
      fetch(`/api/staff/members/${params.id}/pay-rates`),
    ])
    if (!memberRes.ok) {
      setNotFound(true)
      setLoading(false)
      return
    }
    const [mr, rr] = await Promise.all([memberRes.json(), ratesRes.json()])
    if (!mr.member) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setMember(mr.member)
    setEdit(mr.member)
    setRates(rr.rates ?? [])
    setLoading(false)
  }, [params.id])

  useEffect(() => { load() }, [load])

  const sendInvite = async () => {
    if (!member) return
    setInviting(true); setInviteMsg('')
    const r = await fetch('/api/staff/invite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_member_id: params.id }),
    })
    const j = await r.json() as { email?: string; error?: string }
    setInviteMsg(r.ok ? `Invite sent to ${j.email}` : (j.error ?? 'Failed'))
    setInviting(false)
    if (r.ok) load()
  }

  const save = async () => {
    setSaving(true); setSaveMsg('')
    const r = await fetch(`/api/staff/members/${params.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edit),
    })
    const j = await r.json() as { member?: MemberDetail; error?: string }
    setSaving(false)
    if (r.ok && j.member) {
      setMember(j.member); setEdit(j.member); setEditing(false)
      setSaveMsg('Saved')
      setTimeout(() => setSaveMsg(''), 2000)
    } else {
      setSaveMsg(j.error ?? 'Failed to save')
    }
  }

  const fetchVisaInsight = async () => {
    if (!member) return
    setLoadingInsight(true)
    // Get business_id from the member's business
    const r = await fetch('/api/staff/members?status=all').then(res => res.json()) as { members?: { id: string }[] }
    // We need business_id — get it from the window/URL via another call
    const bizR = await fetch('/api/integrations/status').then(res => res.json())
    // Actually just use the staff-visa-insight endpoint with what we have
    const snap = await fetch('/api/aria/staff-visa-insight', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: params.id, business_id: (member as unknown as Record<string,unknown>).business_id }),
    }).then(res => res.json()) as { insight?: string }
    setVisaInsight(snap.insight ?? 'No insight available.')
    setLoadingInsight(false)
  }

  const setF = (k: keyof MemberDetail, v: unknown) => setEdit(e => ({ ...e, [k]: v }))

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'visa', label: 'Visa & Right to Work' },
    { key: 'pay', label: 'Pay' },
    { key: 'bank', label: 'Bank & Tax' },
    { key: 'skills', label: 'Skills' },
    { key: 'documents', label: 'Documents' },
    { key: 'leave', label: 'Leave' },
  ]

  const PAY_RATE_LABELS: Record<string, string> = {
    default: 'Default', weekday: 'Weekday', weekend: 'Weekend',
    evening: 'Evening', public_holiday: 'Public Holiday', overtime: 'Overtime', custom: 'Custom',
  }

  if (loading) return <div className="p-6 text-sm" style={{ color: 'var(--text-secondary, #E8EDE7)' }}>Loading…</div>
  if (notFound) return (
    <div className="p-6 space-y-3" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      <p>Staff member not found.</p>
      <Link href="/dashboard/staff" className="text-sm hover:underline" style={{ color: '#7FB897' }}>← Back to team</Link>
    </div>
  )
  if (!member) return null

  const displayName = member.preferred_name ?? `${member.first_name} ${member.last_name}`
  const hasPortal = member.portal_enabled && member.user_id
  const canInvite = !hasPortal && (member.work_email || member.personal_email)

  const inp = (k: keyof MemberDetail, type = 'text', placeholder = '') => (
    <input type={type} value={String(edit[k] ?? '')} onChange={e => setF(k, e.target.value)} placeholder={placeholder}
      className="w-full px-3 py-1.5 rounded-lg text-sm"
      style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(127,184,151,0.3)', color: 'var(--text-primary, #E8EDE7)' }} />
  )

  const sel = (k: keyof MemberDetail, opts: string[]) => (
    <select value={String(edit[k] ?? '')} onChange={e => setF(k, e.target.value)}
      className="w-full px-3 py-1.5 rounded-lg text-sm"
      style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(127,184,151,0.3)', color: 'var(--text-primary, #E8EDE7)' }}>
      <option value="">— select —</option>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )

  const row = (label: string, value: React.ReactNode, editEl?: React.ReactNode) => (
    <div>
      <div className="text-xs mb-0.5" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{label}</div>
      <div className="text-sm">{editing && editEl ? editEl : (value ?? <span style={{ color: 'var(--text-secondary, #A8B5A8)' }}>—</span>)}</div>
    </div>
  )

  return (
    <div className="p-6 max-w-4xl space-y-5" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-semibold shrink-0"
            style={{ background: member.color ?? '#6366f1' }}>
            {member.first_name[0]}{member.last_name[0]}
          </div>
          <div>
            <h1 className="text-2xl font-medium">{displayName}</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{member.position}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
              {member.employment_type?.replace('_', ' ')} · {member.status}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {saveMsg && <span className="text-xs" style={{ color: saveMsg === 'Saved' ? '#7FB897' : '#ef4444' }}>{saveMsg}</span>}
          {editing ? (
            <>
              <button onClick={save} disabled={saving}
                className="px-4 py-1.5 text-sm rounded-lg font-medium disabled:opacity-50"
                style={{ background: '#2D5240', color: '#7FB897' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => { setEditing(false); setEdit(member) }}
                className="px-4 py-1.5 text-sm rounded-lg" style={{ border: '1px solid var(--divider)', color: 'var(--text-secondary, #A8B5A8)' }}>
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)}
              className="px-4 py-1.5 text-sm rounded-lg"
              style={{ border: '1px solid rgba(127,184,151,0.3)', color: '#7FB897' }}>
              Edit
            </button>
          )}
          {canInvite && (
            <button onClick={sendInvite} disabled={inviting} className="px-4 py-1.5 text-sm rounded-lg"
              style={{ border: '1px solid rgba(127,184,151,0.2)', color: '#7FB897' }}>
              {inviting ? 'Sending…' : 'Send portal invite'}
            </button>
          )}
          {hasPortal && <span className="px-3 py-1.5 text-xs rounded-lg bg-emerald-500/20 text-emerald-400">Portal active</span>}
          <Link href="/dashboard/staff" className="px-4 py-1.5 text-sm rounded-lg"
            style={{ border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-secondary, #A8B5A8)' }}>
            ← Team
          </Link>
        </div>
      </div>

      {inviteMsg && <p className="text-sm" style={{ color: inviteMsg.startsWith('Invite sent') ? '#7FB897' : '#ef4444' }}>{inviteMsg}</p>}

      {/* Visa expiry alert banner */}
      {(() => {
        const vDays = daysUntil(member.visa_expiry_date)
        const pDays = daysUntil(member.passport_expiry_date)
        const alerts: string[] = []
        if (vDays !== null && vDays < 90) alerts.push(`Visa ${vDays < 0 ? 'expired' : `expires in ${vDays}d`}`)
        if (pDays !== null && pDays < 90) alerts.push(`Passport ${pDays < 0 ? 'expired' : `expires in ${pDays}d`}`)
        if (!alerts.length) return null
        return (
          <div className="rounded-xl px-4 py-3 flex items-center gap-2 text-sm"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
            ⚠ {alerts.join(' · ')} — update details or check with a registered migration agent.
          </div>
        )
      })()}

      {/* Tabs */}
      <div className="flex gap-0.5 flex-wrap" style={{ borderBottom: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2 text-sm transition-colors whitespace-nowrap"
            style={{
              color: tab === t.key ? '#7FB897' : 'var(--text-secondary, #A8B5A8)',
              borderBottom: tab === t.key ? '2px solid #7FB897' : '2px solid transparent',
              marginBottom: -1,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          {row('First name', member.first_name, inp('first_name'))}
          {row('Last name', member.last_name, inp('last_name'))}
          {row('Preferred name', member.preferred_name, inp('preferred_name'))}
          {row('Position', member.position, inp('position'))}
          {row('Employment type', member.employment_type?.replace('_', ' '),
            sel('employment_type', ['full_time','part_time','casual','contractor']))}
          {row('Status', member.status, sel('status', ['active','inactive','terminated']))}
          {row('Start date', member.start_date, inp('start_date', 'date'))}
          {row('Date of birth', member.date_of_birth, inp('date_of_birth', 'date'))}
          {row('Work email', member.work_email, inp('work_email', 'email'))}
          {row('Personal email', member.personal_email, inp('personal_email', 'email'))}
          {row('Mobile', member.mobile, inp('mobile', 'tel'))}
          {row('Notes', member.notes, <textarea value={String(edit.notes ?? '')} onChange={e => setF('notes', e.target.value)}
            rows={2} className="w-full px-3 py-1.5 rounded-lg text-sm resize-none"
            style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(127,184,151,0.3)', color: 'var(--text-primary, #E8EDE7)' }} />)}
          <div className="col-span-2 mt-2">
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Emergency contact</p>
            <div className="grid grid-cols-2 gap-4">
              {row('Name', member.emergency_contact_name, inp('emergency_contact_name'))}
              {row('Phone', member.emergency_contact_phone, inp('emergency_contact_phone', 'tel'))}
              {row('Relationship', member.emergency_contact_relationship, inp('emergency_contact_relationship'))}
            </div>
          </div>
        </div>
      )}

      {/* Visa & Right to Work */}
      {tab === 'visa' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 text-sm">
            {row('Visa type', member.visa_type,
              sel('visa_type', ['Australian Citizen','Permanent Resident','Student Visa','Working Holiday','Temporary Skill Shortage','Partner Visa','Bridging Visa','Other']))}
            {row('Visa subclass', member.visa_subclass, inp('visa_subclass', 'text', 'e.g. 482'))}
            {row('Visa expiry', <ExpiryBadge date={member.visa_expiry_date} label="visa" />, inp('visa_expiry_date', 'date'))}
            {row('Work restrictions', member.visa_work_restrictions, inp('visa_work_restrictions', 'text', 'e.g. 40h/fortnight'))}
            {row('Passport country', member.passport_country, inp('passport_country'))}
            {row('Passport expiry', <ExpiryBadge date={member.passport_expiry_date} label="passport" />, inp('passport_expiry_date', 'date'))}
            {row('Right to work verified',
              member.right_to_work_verified
                ? <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Verified {member.right_to_work_verified_date ?? ''}</span>
                : <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400">Not verified</span>,
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={Boolean(edit.right_to_work_verified)} onChange={e => setF('right_to_work_verified', e.target.checked)} />
                <span className="text-sm">Verified</span>
              </label>)}
            {row('Verification date', member.right_to_work_verified_date, inp('right_to_work_verified_date', 'date'))}
          </div>

          {/* Aria visa insight */}
          <div className="rounded-xl p-4 space-y-3"
            style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                Aria Visa Insight
              </p>
              <button onClick={fetchVisaInsight} disabled={loadingInsight}
                className="text-xs px-3 py-1 rounded-lg disabled:opacity-50"
                style={{ background: 'rgba(45,82,64,0.3)', color: '#7FB897', border: '1px solid rgba(45,82,64,0.4)' }}>
                {loadingInsight ? 'Analysing…' : 'Get Aria insight'}
              </button>
            </div>
            {visaInsight ? (
              <p className="text-sm" style={{ color: 'var(--text-primary, #E8EDE7)' }}>{visaInsight}</p>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                Click "Get Aria insight" to receive an AI-powered analysis of this staff member's visa situation and recommended actions.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Pay */}
      {tab === 'pay' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            {row('Pay type', member.pay_type, sel('pay_type', ['hourly','salary']))}
            {row('Hourly rate', member.pay_rate_cents ? `$${(Number(member.pay_rate_cents) / 100).toFixed(2)}/hr` : '—',
              <input type="number" step="0.01" placeholder="0.00"
                value={String(edit.pay_rate_cents ? (Number(edit.pay_rate_cents) / 100).toFixed(2) : '')}
                onChange={e => setF('pay_rate_cents', Math.round(Number(e.target.value) * 100))}
                className="w-full px-3 py-1.5 rounded-lg text-sm"
                style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(127,184,151,0.3)', color: 'var(--text-primary, #E8EDE7)' }} />)}
            {row('Superannuation', `${member.superannuation_rate ?? 11.5}%`,
              <input type="number" step="0.1" value={String(edit.superannuation_rate ?? 11.5)} onChange={e => setF('superannuation_rate', Number(e.target.value))}
                className="w-full px-3 py-1.5 rounded-lg text-sm"
                style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(127,184,151,0.3)', color: 'var(--text-primary, #E8EDE7)' }} />)}
            {row('Pay frequency', member.pay_frequency, sel('pay_frequency', ['weekly','fortnightly','monthly']))}
          </div>
          {rates.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Pay rate history</p>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
                    {['Type','Rate','From','Until'].map(h => <th key={h} className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rates.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
                      <td className="px-3 py-2">{PAY_RATE_LABELS[r.rate_type] ?? r.rate_type}</td>
                      <td className="px-3 py-2 font-medium">${r.hourly_rate_dollars}/hr</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{r.effective_from}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{r.effective_until ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Bank & Tax */}
      {tab === 'bank' && (
        <div className="space-y-3">
          <div className="rounded-xl px-4 py-2 text-xs" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b' }}>
            Sensitive — only visible to authorised managers. Not shared with the staff portal.
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {row('Account name', member.bank_account_name, inp('bank_account_name'))}
            {row('BSB', member.bank_bsb, inp('bank_bsb', 'text', '000-000'))}
            {row('Account number', member.bank_account_number, inp('bank_account_number'))}
            {row('Tax File Number', member.tax_file_number ? '••• ••• •••' : '—',
              <input type="text" value={String(edit.tax_file_number ?? '')} onChange={e => setF('tax_file_number', e.target.value)}
                placeholder="123 456 789"
                className="w-full px-3 py-1.5 rounded-lg text-sm"
                style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(127,184,151,0.3)', color: 'var(--text-primary, #E8EDE7)' }} />)}
          </div>
        </div>
      )}

      {/* Skills */}
      {tab === 'skills' && (
        <div>
          {!(member.staff_member_skills ?? []).length
            ? <p className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>No skills assigned.</p>
            : <div className="flex flex-wrap gap-2">
                {(member.staff_member_skills ?? []).map((s, i) => s.staff_skills && (
                  <div key={i} className="px-3 py-1.5 rounded-lg text-sm"
                    style={{ background: (s.staff_skills.color ?? '#6366f1') + '22', color: s.staff_skills.color ?? '#6366f1' }}>
                    {s.staff_skills.name}
                    {s.certified_at && <span className="ml-2 text-xs opacity-70">cert {s.certified_at.slice(0, 10)}</span>}
                  </div>
                ))}
              </div>}
        </div>
      )}

      {/* Documents */}
      {tab === 'documents' && (
        <div>
          {!(member.staff_documents ?? []).length
            ? <p className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>No documents uploaded.</p>
            : <div className="space-y-2">
                {(member.staff_documents ?? []).map(d => (
                  <div key={d.id} className="flex justify-between items-center p-3 rounded-lg"
                    style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
                    <div>
                      <div className="font-medium text-sm">{d.document_name}</div>
                      <div className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                        {d.document_type}
                        {d.expiry_date && <> · <ExpiryBadge date={d.expiry_date} label="doc" /></>}
                        {d.is_verified && ' · ✓ verified'}
                      </div>
                    </div>
                    {d.file_url && <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="text-xs hover:underline" style={{ color: '#7FB897' }}>View</a>}
                  </div>
                ))}
              </div>}
        </div>
      )}

      {/* Leave */}
      {tab === 'leave' && (
        <div>
          {!(member.staff_leave ?? []).length
            ? <p className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>No leave records.</p>
            : <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
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
              </table>}
        </div>
      )}
    </div>
  )
}
