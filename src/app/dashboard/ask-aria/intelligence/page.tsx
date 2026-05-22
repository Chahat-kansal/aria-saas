'use client'
import { useEffect, useState, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Watch {
  id: string; competitor_name: string; competitor_url: string | null
  products_to_watch: string[]; is_active: boolean; last_checked_at: string | null
  last_result: { products_found?: Array<{ product_name: string; alert: boolean }> } | null
}
interface Schedule {
  id: string; name: string; report_type: string; send_at_hour: number
  send_on_days: number[]; recipients: string[]; is_active: boolean; last_sent_at: string | null
}
interface Alert {
  id: string; name: string; condition_type: string; condition_config: Record<string,unknown>
  recipients: string[]; is_active: boolean; last_triggered_at: string | null; trigger_count: number
}

const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="mb-4">
        <h2 className="font-semibold text-white text-base">{title}</h2>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{description}</p>
      </div>
      {children}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4 mb-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      {children}
    </div>
  )
}

function Input({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</label>
      <input {...props} className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
    </div>
  )
}

// ─── Competitor Watches ───────────────────────────────────────────────────────

function CompetitorSection() {
  const [watches, setWatches] = useState<Watch[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ competitor_name: '', competitor_url: '', products_to_watch: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    fetch('/api/aria/intelligence/watches').then(r => r.json()).then((j: { watches?: Watch[] }) => {
      setWatches(j.watches ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function add() {
    if (!form.competitor_name.trim()) return
    setSaving(true)
    await fetch('/api/aria/intelligence/watches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        competitor_name: form.competitor_name.trim(),
        competitor_url: form.competitor_url.trim() || null,
        products_to_watch: form.products_to_watch.split(',').map(s => s.trim()).filter(Boolean),
      }),
    })
    setForm({ competitor_name: '', competitor_url: '', products_to_watch: '' })
    setSaving(false)
    load()
  }

  async function toggle(id: string, current: boolean) {
    await fetch('/api/aria/intelligence/watches', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: !current }),
    })
    load()
  }

  return (
    <Section title="Competitor Price Monitoring" description="Aria checks competitor pricing daily at 9am and alerts you if they drop below yours.">
      {loading ? <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Loading…</p> : watches.length === 0 ? (
        <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.3)' }}>No competitors added yet.</p>
      ) : watches.map(w => (
        <Card key={w.id}>
          <div className="flex justify-between items-start">
            <div>
              <p className="font-medium text-white text-sm">{w.competitor_name}</p>
              {w.competitor_url && <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{w.competitor_url}</p>}
              {w.products_to_watch.length > 0 && (
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Watching: {w.products_to_watch.join(', ')}</p>
              )}
              {w.last_checked_at && (
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Last checked {new Date(w.last_checked_at).toLocaleString('en-AU')}</p>
              )}
            </div>
            <button onClick={() => toggle(w.id, w.is_active)} className="text-xs px-2.5 py-1 rounded-lg"
              style={{ background: w.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)', color: w.is_active ? '#22c55e' : 'rgba(255,255,255,0.4)' }}>
              {w.is_active ? 'Active' : 'Paused'}
            </button>
          </div>
        </Card>
      ))}

      <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(45,82,64,0.1)', border: '1px solid rgba(45,82,64,0.3)' }}>
        <p className="text-xs font-medium text-[#7FB897]">Add competitor watch</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Competitor name" value={form.competitor_name} onChange={e => setForm(p => ({ ...p, competitor_name: e.target.value }))} placeholder="e.g. Dan Murphy's" />
          <Input label="URL (optional)" value={form.competitor_url} onChange={e => setForm(p => ({ ...p, competitor_url: e.target.value }))} placeholder="e.g. danmurphys.com.au" />
        </div>
        <Input label="Products to watch (comma-separated)" value={form.products_to_watch} onChange={e => setForm(p => ({ ...p, products_to_watch: e.target.value }))} placeholder="e.g. Carlton Draught, Corona, Jack Daniel's" />
        <button onClick={add} disabled={saving || !form.competitor_name.trim()} className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
          style={{ background: '#2D5240', color: '#fff' }}>
          {saving ? 'Adding…' : 'Add watch'}
        </button>
      </div>
    </Section>
  )
}

// ─── Scheduled Reports ────────────────────────────────────────────────────────

function SchedulesSection() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', send_at_hour: '18', recipients: '' })
  const [days, setDays] = useState([1,2,3,4,5,6,7])
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    fetch('/api/aria/intelligence/schedules').then(r => r.json()).then((j: { schedules?: Schedule[] }) => {
      setSchedules(j.schedules ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function add() {
    if (!form.name.trim() || !form.recipients.trim()) return
    setSaving(true)
    await fetch('/api/aria/intelligence/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        report_type: 'daily_summary',
        send_at_hour: Number(form.send_at_hour) || 18,
        send_on_days: days,
        recipients: form.recipients.split(',').map(s => s.trim()).filter(Boolean),
      }),
    })
    setForm({ name: '', send_at_hour: '18', recipients: '' })
    setDays([1,2,3,4,5,6,7])
    setSaving(false)
    load()
  }

  async function toggle(id: string, current: boolean) {
    await fetch('/api/aria/intelligence/schedules', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: !current }),
    })
    load()
  }

  return (
    <Section title="Scheduled Reports" description="Aria sends your sales summary by email at your chosen time.">
      {loading ? <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Loading…</p> : schedules.length === 0 ? (
        <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.3)' }}>No reports scheduled yet.</p>
      ) : schedules.map(s => (
        <Card key={s.id}>
          <div className="flex justify-between items-start">
            <div>
              <p className="font-medium text-white text-sm">{s.name}</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Daily at {s.send_at_hour}:00 AEST · {s.recipients.join(', ')}
              </p>
              {s.last_sent_at && (
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Last sent {new Date(s.last_sent_at).toLocaleDateString('en-AU')}</p>
              )}
            </div>
            <button onClick={() => toggle(s.id, s.is_active)} className="text-xs px-2.5 py-1 rounded-lg"
              style={{ background: s.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)', color: s.is_active ? '#22c55e' : 'rgba(255,255,255,0.4)' }}>
              {s.is_active ? 'Active' : 'Paused'}
            </button>
          </div>
        </Card>
      ))}

      <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(45,82,64,0.1)', border: '1px solid rgba(45,82,64,0.3)' }}>
        <p className="text-xs font-medium text-[#7FB897]">Add scheduled report</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Report name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Daily Sales Summary" />
          <div>
            <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Send at hour (AEST 0-23)</label>
            <input type="number" min={0} max={23} value={form.send_at_hour}
              onChange={e => setForm(p => ({ ...p, send_at_hour: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
          </div>
        </div>
        <div>
          <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Send on days</label>
          <div className="flex gap-1.5">
            {DAY_NAMES.map((d, i) => {
              const val = i + 1
              const active = days.includes(val)
              return (
                <button key={d} onClick={() => setDays(prev => active ? prev.filter(x => x !== val) : [...prev, val])}
                  className="px-2 py-1 rounded text-xs"
                  style={{ background: active ? 'rgba(45,82,64,0.5)' : 'rgba(255,255,255,0.05)', color: active ? '#7FB897' : 'rgba(255,255,255,0.4)', border: "1px solid " + (active ? "rgba(45,82,64,0.5)" : "rgba(255,255,255,0.08)") }}>
                  {d}
                </button>
              )
            })}
          </div>
        </div>
        <Input label="Recipients (comma-separated emails)" value={form.recipients} onChange={e => setForm(p => ({ ...p, recipients: e.target.value }))} placeholder="owner@example.com, manager@example.com" />
        <button onClick={add} disabled={saving || !form.name.trim() || !form.recipients.trim()} className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
          style={{ background: '#2D5240', color: '#fff' }}>
          {saving ? 'Adding…' : 'Add report'}
        </button>
      </div>
    </Section>
  )
}

// ─── Condition Alerts ─────────────────────────────────────────────────────────

function AlertsSection() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', condition_type: 'stock_below', product_name: '', threshold: '10', period_hours: '24', recipients: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    fetch('/api/aria/intelligence/alerts').then(r => r.json()).then((j: { alerts?: Alert[] }) => {
      setAlerts(j.alerts ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function add() {
    if (!form.name.trim()) return
    setSaving(true)
    const config: Record<string,unknown> = { type: form.condition_type }
    if (form.product_name.trim()) config.product_name = form.product_name.trim()
    if (form.threshold) config.threshold = Number(form.threshold)
    if (form.period_hours) config.period_hours = Number(form.period_hours)

    await fetch('/api/aria/intelligence/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        condition_type: form.condition_type,
        condition_config: config,
        recipients: form.recipients.split(',').map(s => s.trim()).filter(Boolean),
      }),
    })
    setForm({ name: '', condition_type: 'stock_below', product_name: '', threshold: '10', period_hours: '24', recipients: '' })
    setSaving(false)
    load()
  }

  async function toggle(id: string, current: boolean) {
    await fetch('/api/aria/intelligence/alerts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: !current }),
    })
    load()
  }

  return (
    <Section title="Condition Alerts" description="Aria watches for conditions and notifies you when they're triggered.">
      {loading ? <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Loading…</p> : alerts.length === 0 ? (
        <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.3)' }}>No alerts configured yet.</p>
      ) : alerts.map(a => (
        <Card key={a.id}>
          <div className="flex justify-between items-start">
            <div>
              <p className="font-medium text-white text-sm">{a.name}</p>
              <p className="text-xs mt-0.5 capitalize" style={{ color: 'rgba(255,255,255,0.4)' }}>{a.condition_type.replace(/_/g, ' ')}</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                Triggered {a.trigger_count}× {a.last_triggered_at ? `· Last: ${new Date(a.last_triggered_at).toLocaleDateString('en-AU')}` : ''}
              </p>
            </div>
            <button onClick={() => toggle(a.id, a.is_active)} className="text-xs px-2.5 py-1 rounded-lg"
              style={{ background: a.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)', color: a.is_active ? '#22c55e' : 'rgba(255,255,255,0.4)' }}>
              {a.is_active ? 'Active' : 'Paused'}
            </button>
          </div>
        </Card>
      ))}

      <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(45,82,64,0.1)', border: '1px solid rgba(45,82,64,0.3)' }}>
        <p className="text-xs font-medium text-[#7FB897]">Add condition alert</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Alert name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Monster Energy low stock" />
          <div>
            <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Condition type</label>
            <select value={form.condition_type} onChange={e => setForm(p => ({ ...p, condition_type: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}>
              <option value="stock_below">Stock below threshold</option>
              <option value="revenue_below">Revenue below target</option>
              <option value="no_sales">No sales</option>
            </select>
          </div>
          <Input label="Product name (optional)" value={form.product_name} onChange={e => setForm(p => ({ ...p, product_name: e.target.value }))} placeholder="Leave blank for all products" />
          <Input label={form.condition_type === 'no_sales' ? 'Hours of inactivity' : 'Threshold'} type="number" value={form.threshold} onChange={e => setForm(p => ({ ...p, threshold: e.target.value }))} placeholder={form.condition_type === 'revenue_below' ? 'e.g. 500' : 'e.g. 10'} />
        </div>
        <Input label="Alert recipients (comma-separated emails)" value={form.recipients} onChange={e => setForm(p => ({ ...p, recipients: e.target.value }))} placeholder="owner@example.com" />
        <button onClick={add} disabled={saving || !form.name.trim()} className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
          style={{ background: '#2D5240', color: '#fff' }}>
          {saving ? 'Adding…' : 'Add alert'}
        </button>
      </div>
    </Section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IntelligencePage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8" style={{ background: '#0d0d14', minHeight: '100vh', color: '#e5e7eb' }}>
      <div className="mb-8">
        <h1 className="font-semibold text-white text-xl">Aria Intelligence</h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Competitor monitoring, scheduled reports, and proactive condition alerts.
        </p>
      </div>
      <CompetitorSection />
      <SchedulesSection />
      <AlertsSection />
    </div>
  )
}
