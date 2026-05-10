'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Schedule { id?: string; enabled: boolean; day_of_week: number; hour_utc: number; lookback_days: number; min_stock_threshold_days: number; notify_email: boolean; last_run_at?: string | null; last_order_id?: string | null }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DEFAULT: Schedule = { enabled: true, day_of_week: 2, hour_utc: 1, lookback_days: 7, min_stock_threshold_days: 3, notify_email: true }

function aestFromUtc(hourUtc: number) {
  const aest = (hourUtc + 10) % 24
  const suffix = aest >= 12 ? 'pm' : 'am'
  const h = aest % 12 || 12
  return `${h}:00${suffix} AEST`
}

function nextRunText(s: Schedule): string {
  const now = new Date()
  let d = new Date(now)
  const diff = (s.day_of_week - now.getUTCDay() + 7) % 7
  d.setUTCDate(d.getUTCDate() + (diff === 0 && now.getUTCHours() >= s.hour_utc ? 7 : diff))
  d.setUTCHours(s.hour_utc, 0, 0, 0)
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }) + ' at ' + aestFromUtc(s.hour_utc)
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} type="button" style={{ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', flexShrink: 0, background: checked ? 'var(--violet)' : 'var(--bg-elevated)', position: 'relative', transition: 'background 200ms' }}>
      <div style={{ position: 'absolute', top: 2, left: checked ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 200ms' }} />
    </button>
  )
}

export default function ReorderSchedulePage() {
  const [schedule, setSchedule] = useState<Schedule>(DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/pos/orders/schedule').then(r => r.json()).then(d => {
      if (d.schedule) setSchedule(d.schedule)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const set = (k: keyof Schedule, v: any) => setSchedule(s => ({ ...s, [k]: v }))

  async function save() {
    setSaving(true); setSaved(false)
    await fetch('/api/pos/orders/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(schedule) }).then(r => r.json()).then(d => { if (d.schedule) setSchedule(d.schedule) })
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000)
  }

  const inp: React.CSSProperties = { background: 'var(--bg-input)', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', fontFamily: "'Manrope',sans-serif" }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontFamily: "'Manrope',sans-serif" }}>Loading…</div>

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '24px' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Automatic Weekly Reorder</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Aria analyses sales and prepares a draft order automatically.</p>
        </div>

        <div style={{ background: 'var(--bg-surface)', borderRadius: 14, padding: 24, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Enable toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>Enable auto-reorder</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Aria creates a draft PO on the chosen schedule</div>
            </div>
            <Toggle checked={schedule.enabled} onChange={v => set('enabled', v)} />
          </div>

          {schedule.enabled && (
            <>
              {/* Day picker */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Day of week</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {DAYS.map((d, i) => (
                    <button key={d} onClick={() => set('day_of_week', i)}
                      style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid ${schedule.day_of_week === i ? 'var(--violet)' : 'var(--divider)'}`, background: schedule.day_of_week === i ? 'rgba(127,184,151,0.10)' : 'transparent', color: schedule.day_of_week === i ? 'var(--violet)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time (UTC hour) */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Time (AEST)</div>
                <select style={{ ...inp, width: '100%' }} value={schedule.hour_utc} onChange={e => set('hour_utc', parseInt(e.target.value))}>
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{aestFromUtc(i)} (UTC {i}:00)</option>
                  ))}
                </select>
              </div>

              {/* Lookback + threshold */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Analyse last N days</div>
                  <select style={inp} value={schedule.lookback_days} onChange={e => set('lookback_days', parseInt(e.target.value))}>
                    {[3,7,14,21,28].map(d => <option key={d} value={d}>{d} days</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Flag below N days stock</div>
                  <select style={inp} value={schedule.min_stock_threshold_days} onChange={e => set('min_stock_threshold_days', parseInt(e.target.value))}>
                    {[1,2,3,5,7,10].map(d => <option key={d} value={d}>{d} days</option>)}
                  </select>
                </div>
              </div>

              {/* Email notification */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Email me when the order is ready</div>
                <Toggle checked={schedule.notify_email} onChange={v => set('notify_email', v)} />
              </div>
            </>
          )}
        </div>

        {/* How it works */}
        <details style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
          <summary style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>How it works</summary>
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Every <strong>{DAYS[schedule.day_of_week]}</strong> at <strong>{aestFromUtc(schedule.hour_utc)}</strong>, Aria will:
            <ol style={{ marginTop: 8, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>Analyse the past {schedule.lookback_days} days of sales for each product</li>
              <li>Compare current stock levels to reorder thresholds</li>
              <li>Generate a draft Purchase Order</li>
              {schedule.notify_email && <li>Email you a summary with a link to review and approve</li>}
            </ol>
            <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: 'rgba(127,184,151,0.06)', fontSize: 12, color: 'var(--text-tertiary)' }}>
              You always approve before anything is sent to suppliers.
            </div>
          </div>
        </details>

        {/* Last run info */}
        {schedule.last_run_at && (
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
            Last run: {new Date(schedule.last_run_at).toLocaleString('en-AU')}
            {schedule.last_order_id && <> · <Link href={`/pos/orders/${schedule.last_order_id}`} style={{ color: 'var(--violet)' }}>View order →</Link></>}
          </div>
        )}

        {/* Next run */}
        {schedule.enabled && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
            Next scheduled run: <strong>{nextRunText(schedule)}</strong>
          </div>
        )}

        <button onClick={save} disabled={saving}
          style={{ padding: '10px 24px', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
