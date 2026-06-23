'use client'
import { useState, useEffect, useCallback } from 'react'

// INV-REPORTS — owner-side reports panel for the dashboard inventory page. Library (export PDF), period
// toggle, and auto-email scheduling onto the existing scheduled_pdf_reports rail. All data is live.

const C = { surface: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.07)', green: '#7FB897', red: '#ef4444', amber: '#f59e0b', text: '#E8EDE7', dim: 'rgba(255,255,255,0.4)', muted: 'rgba(255,255,255,0.25)' }
interface LibItem { type: string; title: string; blurb: string }
interface Schedule { id: string; label: string; page_path: string; frequency: string; day_of_week: number | null; send_hour_aest: number | null; recipients: Array<{ name?: string; email: string }>; is_active: boolean; next_send_at: string | null }
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function InventoryReportsPanel() {
  const [lib, setLib] = useState<LibItem[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [period, setPeriod] = useState<'daily' | 'weekly'>('daily')
  // schedule form
  const [schedType, setSchedType] = useState('sold_vs_stock')
  const [schedFreq, setSchedFreq] = useState<'daily' | 'weekly'>('daily')
  const [schedEmail, setSchedEmail] = useState('')
  const [schedDow, setSchedDow] = useState(1)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    setState('loading')
    try {
      const d = await fetch('/api/inventory/reports?schedules=1').then(r => r.json())
      setLib(d.library ?? []); setSchedules(d.schedules ?? []); setState('ok')
    } catch { setState('error') }
  }, [])
  useEffect(() => { load() }, [load])

  const exportPdf = (type: string) => window.open(`/api/inventory/reports?type=${type}&period=${period}&format=pdf`, '_blank')

  async function schedule() {
    if (!schedEmail.trim()) { setMsg('Enter a recipient email.'); return }
    setSaving(true); setMsg('')
    try {
      const r = await fetch('/api/inventory/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: schedType, period: schedFreq, frequency: schedFreq, day_of_week: schedFreq === 'weekly' ? schedDow : undefined, send_hour_aest: 8, recipients: [schedEmail.trim()] }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ok) { setMsg('✓ Scheduled — it will auto-email.'); setSchedEmail(''); load() }
      else setMsg(d.error ? `Couldn't schedule: ${d.error}` : 'Could not schedule.')
    } catch { setMsg('Something went wrong.') }
    setSaving(false)
  }
  async function unschedule(id: string) {
    await fetch(`/api/inventory/reports?id=${id}`, { method: 'DELETE' }).catch(() => {})
    load()
  }

  if (state === 'loading') return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{[...Array(3)].map((_, i) => <div key={i} style={{ height: 56, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }} />)}</div>
  if (state === 'error') return <div style={{ padding: 24, textAlign: 'center', color: C.red }}>Couldn&apos;t load reports. <button onClick={load} style={{ color: C.green, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Retry</button></div>

  const sel: React.CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, padding: '8px 10px', fontFamily: 'inherit' }
  return (
    <div style={{ color: C.text }}>
      {/* period + library */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 700 }}>Report library</p>
        <div style={{ display: 'flex', gap: 4, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, padding: 3 }}>
          {(['daily', 'weekly'] as const).map(p => <button key={p} onClick={() => setPeriod(p)} style={{ padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: period === p ? C.green : 'transparent', color: period === p ? '#0E1812' : C.dim }}>{p === 'daily' ? 'Daily' : 'Weekly'}</button>)}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
        {lib.map(item => (
          <button key={item.type} onClick={() => exportPdf(item.type)} style={{ textAlign: 'left', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit', color: C.text }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b style={{ fontSize: 13, fontWeight: 600 }}>{item.title}</b><span style={{ fontSize: 10, fontWeight: 700, color: C.green }}>PDF ↓</span></div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 3, lineHeight: 1.4 }}>{item.blurb}</div>
          </button>
        ))}
      </div>

      {/* schedule auto-email */}
      <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Auto-email a report</p>
      <p style={{ fontSize: 11.5, color: C.dim, marginBottom: 10 }}>Owner opt-in — the scheduled report is generated as a branded PDF and emailed via the existing report cron.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <select value={schedType} onChange={e => setSchedType(e.target.value)} style={sel}>{lib.map(i => <option key={i.type} value={i.type} style={{ background: '#13131a' }}>{i.title}</option>)}</select>
        <select value={schedFreq} onChange={e => setSchedFreq(e.target.value as 'daily' | 'weekly')} style={sel}><option value="daily" style={{ background: '#13131a' }}>Daily</option><option value="weekly" style={{ background: '#13131a' }}>Weekly</option></select>
        {schedFreq === 'weekly' && <select value={schedDow} onChange={e => setSchedDow(Number(e.target.value))} style={sel}>{DOW.map((d, i) => <option key={i} value={i} style={{ background: '#13131a' }}>{d}</option>)}</select>}
        <input value={schedEmail} onChange={e => setSchedEmail(e.target.value)} placeholder="recipient@email.com" style={{ ...sel, flex: 1, minWidth: 180 }} />
        <button onClick={schedule} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.green, color: '#0E1812', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Schedule'}</button>
      </div>
      {msg && <p style={{ fontSize: 12, color: msg.startsWith('✓') ? C.green : C.amber, marginBottom: 12 }}>{msg}</p>}

      {schedules.length > 0 && (
        <>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '14px 0 8px' }}>Scheduled reports</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {schedules.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px' }}>
                <div><b style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</b><div style={{ fontSize: 11, color: C.dim }}>{s.frequency === 'weekly' && s.day_of_week != null ? `${DOW[s.day_of_week]} ` : ''}{(s.send_hour_aest ?? 8)}:00 AEST · {(s.recipients ?? []).map(r => r.email).join(', ')}</div></div>
                <button onClick={() => unschedule(s.id)} style={{ fontSize: 11, color: C.red, background: 'none', border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Remove</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
