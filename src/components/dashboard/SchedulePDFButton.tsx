'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

const PAGE_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard Overview',
  '/dashboard/sales': 'Sales Report',
  '/dashboard/invoices': 'Invoices',
  '/dashboard/staff': 'Staff Report',
  '/dashboard/cash-flow': 'Cash Flow',
  '/dashboard/reports': 'Business Report',
  '/dashboard/profit-leaks': 'Profit Leaks',
  '/dashboard/competitors': 'Competitor Watch',
  '/dashboard/customers': 'Customer Report',
}

const DAY_OPTS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface RecipientRow { name: string; email: string }

export function SchedulePDFButton({ compact = false }: { compact?: boolean }) {
  const { business } = useBusinessContext()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const defaultLabel = PAGE_LABELS[pathname] ?? 'Dashboard Report'
  const [label, setLabel] = useState(defaultLabel)
  const [freq, setFreq] = useState<'daily' | 'weekly' | 'monthly'>('weekly')
  const [dayOfWeek, setDayOfWeek] = useState(1)
  const [dayOfMonth, setDayOfMonth] = useState(1)
  const [hourAest, setHourAest] = useState(8)
  const [recipients, setRecipients] = useState<RecipientRow[]>([{ name: '', email: '' }])

  const addRecipient = () => {
    if (recipients.length < 5) setRecipients(r => [...r, { name: '', email: '' }])
  }
  const updateRecipient = (i: number, field: 'name' | 'email', val: string) => {
    setRecipients(r => r.map((row, idx) => idx === i ? { ...row, [field]: val } : row))
  }
  const removeRecipient = (i: number) => setRecipients(r => r.filter((_, idx) => idx !== i))

  const submit = async () => {
    if (!business?.id || !label.trim() || !recipients.some(r => r.email.trim())) return
    setSaving(true)
    const validRecipients = recipients.filter(r => r.email.trim())
    const res = await fetch('/api/scheduled-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: business.id,
        label: label.trim(),
        frequency: freq,
        day_of_week: freq === 'weekly' ? dayOfWeek : null,
        day_of_month: freq === 'monthly' ? dayOfMonth : null,
        hour_aest: hourAest,
        recipients: validRecipients,
        pages_allowed: [pathname],
        include_share_link: true,
      }),
    }).then(r => r.json()).catch(() => ({}))
    setSaving(false)
    if (res.ok) { setDone(true); setTimeout(() => { setOpen(false); setDone(false) }, 2000) }
  }

  return (
    <>
      <button
        onClick={() => { setLabel(PAGE_LABELS[pathname] ?? 'Dashboard Report'); setOpen(true) }}
        aria-label="Schedule PDF report"
        title="Schedule PDF report"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: compact ? '5px 8px' : '6px 12px',
          borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.55)',
          fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
      >
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="4" width="14" height="14" rx="2" />
          <path d="M3 8h14M7 2v3M13 2v3" strokeLinecap="round" />
        </svg>
        {!compact && 'Schedule PDF'}
      </button>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div style={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '28px 28px 24px', width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#F5F3EC', margin: 0 }}>Schedule PDF Report</h2>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '2px 6px' }}>×</button>
            </div>

            {done ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#7FB897', fontWeight: 600, fontSize: 15 }}>
                Report scheduled successfully!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Report Label</label>
                  <input
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#F5F3EC', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Frequency</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['daily', 'weekly', 'monthly'] as const).map(f => (
                      <button key={f} onClick={() => setFreq(f)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid ' + (freq === f ? '#7FB897' : 'rgba(255,255,255,0.1)'), background: freq === f ? 'rgba(127,184,151,0.12)' : 'transparent', color: freq === f ? '#7FB897' : 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {freq === 'weekly' && (
                  <div>
                    <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Day of Week</label>
                    <select value={dayOfWeek} onChange={e => setDayOfWeek(Number(e.target.value))} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: '#1a1f2e', color: '#F5F3EC', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}>
                      {DAY_OPTS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  </div>
                )}
                {freq === 'monthly' && (
                  <div>
                    <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Day of Month</label>
                    <input type="number" min={1} max={28} value={dayOfMonth} onChange={e => setDayOfMonth(Number(e.target.value))} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#F5F3EC', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                )}

                <div>
                  <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Send Time (AEST)</label>
                  <select value={hourAest} onChange={e => setHourAest(Number(e.target.value))} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: '#1a1f2e', color: '#F5F3EC', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}>
                    {[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map(h => (
                      <option key={h} value={h}>{h}:00 AEST</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recipients (up to 5)</label>
                    {recipients.length < 5 && (
                      <button onClick={addRecipient} style={{ fontSize: 11, color: '#7FB897', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, padding: 0 }}>+ Add</button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {recipients.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: 6 }}>
                        <input placeholder="Name" value={r.name} onChange={e => updateRecipient(i, 'name', e.target.value)} style={{ flex: '0 0 120px', padding: '8px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#F5F3EC', fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
                        <input placeholder="Email" type="email" value={r.email} onChange={e => updateRecipient(i, 'email', e.target.value)} style={{ flex: 1, padding: '8px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#F5F3EC', fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
                        {recipients.length > 1 && (
                          <button onClick={() => removeRecipient(i)} style={{ padding: '0 8px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 16 }}>×</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={submit}
                  disabled={saving || !label.trim() || !recipients.some(r => r.email.trim())}
                  style={{ width: '100%', padding: '11px 0', borderRadius: 10, border: 'none', background: saving ? 'rgba(127,184,151,0.4)' : '#2D5240', color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', marginTop: 4 }}
                >
                  {saving ? 'Scheduling…' : 'Schedule Report'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
