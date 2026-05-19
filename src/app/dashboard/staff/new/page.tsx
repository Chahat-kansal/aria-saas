'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const COLORS = ['#6366f1','#2D5240','#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899']

export default function NewStaffMemberPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    first_name: '', last_name: '', preferred_name: '', position: '',
    employment_type: 'casual', personal_email: '', work_email: '', mobile: '',
    pay_type: 'hourly', pay_rate_dollars: '', superannuation_rate: '11.5',
    start_date: '', color: '#6366f1',
  })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.first_name.trim() || !form.last_name.trim() || !form.position.trim()) {
      setError('First name, last name and position are required.')
      return
    }
    setSaving(true); setError('')
    const r = await fetch('/api/staff/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        pay_rate_dollars: form.pay_rate_dollars ? Number(form.pay_rate_dollars) : undefined,
        superannuation_rate: Number(form.superannuation_rate) || 11.5,
      }),
    })
    const j = await r.json() as { member?: { id: string }; error?: string }
    setSaving(false)
    if (!r.ok) { setError(j.error ?? 'Failed to save'); return }
    router.push(`/dashboard/staff/${j.member!.id}`)
  }

  return (
    <div className="p-6 max-w-2xl space-y-6" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      <header>
        <Link href="/dashboard/staff" className="text-xs hover:underline mb-2 block" style={{ color: '#7FB897' }}>
          ← Back to staff
        </Link>
        <h1 className="text-2xl font-medium">Add staff member</h1>
      </header>

      <div className="rounded-xl p-5 space-y-4"
        style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>

        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          Personal details
        </p>

        <div className="grid grid-cols-2 gap-3">
          {([
            ['first_name', 'First name *'],
            ['last_name', 'Last name *'],
            ['preferred_name', 'Preferred name'],
            ['position', 'Position / role *'],
          ] as [keyof typeof form, string][]).map(([key, label]) => (
            <div key={key}>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{label}</label>
              <input type="text" value={form[key]} onChange={e => set(key, e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-primary, #E8EDE7)' }} />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Employment type</label>
            <select value={form.employment_type} onChange={e => set('employment_type', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-primary, #E8EDE7)' }}>
              <option value="full_time" style={{ background: '#1a2420', color: '#e8ede7' }}>Full-time</option>
              <option value="part_time" style={{ background: '#1a2420', color: '#e8ede7' }}>Part-time</option>
              <option value="casual" style={{ background: '#1a2420', color: '#e8ede7' }}>Casual</option>
              <option value="contractor" style={{ background: '#1a2420', color: '#e8ede7' }}>Contractor</option>
            </select>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Start date</label>
            <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-primary, #E8EDE7)' }} />
          </div>
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide pt-2" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          Contact
        </p>

        <div className="grid grid-cols-2 gap-3">
          {([
            ['work_email', 'Work email'],
            ['personal_email', 'Personal email'],
            ['mobile', 'Mobile'],
          ] as [keyof typeof form, string][]).map(([key, label]) => (
            <div key={key}>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{label}</label>
              <input type={key.includes('email') ? 'email' : 'tel'} value={form[key]} onChange={e => set(key, e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-primary, #E8EDE7)' }} />
            </div>
          ))}
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide pt-2" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          Pay
        </p>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Pay type</label>
            <select value={form.pay_type} onChange={e => set('pay_type', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-primary, #E8EDE7)' }}>
              <option value="hourly" style={{ background: '#1a2420', color: '#e8ede7' }}>Hourly</option>
              <option value="salary" style={{ background: '#1a2420', color: '#e8ede7' }}>Salary</option>
            </select>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Rate ($/hr)</label>
            <input type="number" step="0.01" min="0" placeholder="0.00" value={form.pay_rate_dollars}
              onChange={e => set('pay_rate_dollars', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-primary, #E8EDE7)' }} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Super rate (%)</label>
            <input type="number" step="0.1" min="0" value={form.superannuation_rate}
              onChange={e => set('superannuation_rate', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-primary, #E8EDE7)' }} />
          </div>
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide pt-2" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          Colour
        </p>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map(c => (
            <button key={c} type="button" onClick={() => set('color', c)}
              className="w-8 h-8 rounded-full transition-transform hover:scale-110"
              style={{ background: c, outline: form.color === c ? `3px solid white` : 'none', outlineOffset: 2 }} />
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-3">
        <button onClick={save} disabled={saving}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
          style={{ background: '#2D5240', color: '#7FB897' }}>
          {saving ? 'Saving…' : 'Add staff member'}
        </button>
        <Link href="/dashboard/staff"
          className="px-6 py-2.5 rounded-xl text-sm"
          style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary, #A8B5A8)' }}>
          Cancel
        </Link>
      </div>
    </div>
  )
}
