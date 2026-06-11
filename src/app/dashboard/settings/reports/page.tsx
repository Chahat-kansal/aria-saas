'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface Recipient { name: string; email: string }
interface ScheduledReport {
  id: string; label: string; frequency: string
  day_of_week: number | null; day_of_month: number | null
  hour_aest: number; recipients: Recipient[]
  pages_allowed: string[]; include_share_link: boolean
  is_active: boolean; next_send_at: string | null; last_sent_at: string | null
  created_at: string
}

const ALL_KPIS = [
  { key: 'revenue',          label: 'Revenue',           desc: 'Total weekly revenue' },
  { key: 'transactions',     label: 'Transactions',      desc: 'Number of sales' },
  { key: 'avg_order_value',  label: 'Avg Order Value',   desc: 'Average ticket size' },
  { key: 'labour_cost_pct',  label: 'Labour Cost %',     desc: 'Labour as % of revenue' },
  { key: 'customer_count',   label: 'Customer Count',    desc: 'Unique customers served' },
  { key: 'new_customers',    label: 'New Customers',     desc: 'First-time customers' },
  { key: 'top_product',      label: 'Top Product',       desc: 'Best-selling item' },
  { key: 'low_stock_count',  label: 'Low Stock Items',   desc: 'Products below reorder point' },
]

const PAGES = ['Overview', 'Cash Flow', 'Invoices', 'Sales & Revenue', 'Staff & Labour', 'Weekly Reports', 'Profit Leaks', 'Competitor Intelligence']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

function nextSendLabel(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const DEFAULT_FORM = { label: '', frequency: 'weekly', day_of_week: 1, day_of_month: 1, hour_aest: 8, pages_allowed: [] as string[], include_share_link: true, recipients: [{ name: '', email: '' }] as Recipient[] }

export default function ScheduledReportsPage() {
  const { business } = useBusinessContext()
  const [reports, setReports] = useState<ScheduledReport[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [selectedKpis, setSelectedKpis] = useState<string[]>(['revenue', 'transactions', 'avg_order_value', 'new_customers', 'top_product'])
  const [kpiSaving, setKpiSaving] = useState(false)
  const [kpiSaved, setKpiSaved] = useState(false)
  const [reportEmail, setReportEmail] = useState<string | null>(null)

  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'var(--bg-input,rgba(255,255,255,0.05))', border: '1px solid var(--divider,rgba(255,255,255,0.1))', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: 'var(--text-primary,#fff)', outline: 'none', fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    const d = await fetch(`/api/scheduled-reports?business_id=${business.id}`).then(r => r.json()).catch(() => ({}))
    setReports(d.reports ?? [])
    setLoading(false)
  }, [business?.id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!business?.id) return
    fetch('/api/settings/reports-kpi').then(r => r.json()).then(d => {
      if (Array.isArray(d.kpis)) setSelectedKpis(d.kpis)
      if (d.report_email) setReportEmail(d.report_email)
    }).catch(() => {})
  }, [business?.id])

  async function saveKpis() {
    setKpiSaving(true)
    await fetch('/api/settings/reports-kpi', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kpis: selectedKpis }) }).catch(() => {})
    setKpiSaving(false); setKpiSaved(true)
    setTimeout(() => setKpiSaved(false), 1800)
  }

  function toggleKpi(key: string) {
    setSelectedKpis(ks => ks.includes(key) ? ks.filter(k => k !== key) : [...ks, key])
  }

  async function create() {
    if (!business?.id || !form.label || !form.recipients.some(r => r.email)) return
    setCreating(true)
    const body = {
      business_id: business.id,
      label: form.label,
      frequency: form.frequency,
      day_of_week: form.frequency === 'weekly' ? form.day_of_week : null,
      day_of_month: form.frequency === 'monthly' ? form.day_of_month : null,
      hour_aest: form.hour_aest,
      recipients: form.recipients.filter(r => r.email),
      pages_allowed: form.pages_allowed,
      include_share_link: form.include_share_link,
    }
    const res = await fetch('/api/scheduled-reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json()
    if (res.ok && d.id) {
      setShowForm(false)
      setForm(DEFAULT_FORM)
      load()
    }
    setCreating(false)
  }

  async function toggleActive(id: string, is_active: boolean) {
    await fetch(`/api/scheduled-reports/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active }) })
    setReports(rs => rs.map(r => r.id === id ? { ...r, is_active } : r))
  }

  async function remove(id: string) {
    await fetch(`/api/scheduled-reports/${id}`, { method: 'DELETE' })
    setReports(rs => rs.filter(r => r.id !== id))
  }

  function togglePage(key: string) {
    setForm(f => ({ ...f, pages_allowed: f.pages_allowed.includes(key) ? f.pages_allowed.filter(p => p !== key) : [...f.pages_allowed, key] }))
  }

  function updateRecipient(i: number, field: 'name' | 'email', val: string) {
    setForm(f => { const rs = [...f.recipients]; rs[i] = { ...rs[i], [field]: val }; return { ...f, recipients: rs } })
  }

  function addRecipient() {
    if (form.recipients.length >= 5) return
    setForm(f => ({ ...f, recipients: [...f.recipients, { name: '', email: '' }] }))
  }

  function removeRecipient(i: number) {
    setForm(f => ({ ...f, recipients: f.recipients.filter((_, idx) => idx !== i) }))
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 800 }}>
      {/* Weekly Report KPI Builder */}
      <div style={{ marginBottom: 32, padding: '20px 24px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14 }}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Weekly Report KPIs</h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            Choose which metrics appear in your Monday morning weekly report email.
            {reportEmail && <span style={{ color: 'rgba(255,255,255,0.35)', marginLeft: 6 }}>Sending to: {reportEmail}</span>}
          </p>
          <p style={{ fontSize: 11, color: 'rgba(127,184,151,0.7)', marginTop: 4 }}>Cron: every Monday at 10 PM AEST (0 22 * * 0)</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginBottom: 16 }}>
          {ALL_KPIS.map(kpi => {
            const active = selectedKpis.includes(kpi.key)
            return (
              <button key={kpi.key} onClick={() => toggleKpi(kpi.key)}
                style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: `1px solid ${active ? '#7FB897' : 'rgba(255,255,255,0.1)'}`, background: active ? 'rgba(127,184,151,0.08)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${active ? '#7FB897' : 'rgba(255,255,255,0.2)'}`, background: active ? '#7FB897' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', flexShrink: 0 }}>{active ? '✓' : ''}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: active ? '#7FB897' : 'rgba(255,255,255,0.8)' }}>{kpi.label}</span>
                </div>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: 0, paddingLeft: 22 }}>{kpi.desc}</p>
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={saveKpis} disabled={kpiSaving || selectedKpis.length === 0}
            style={{ padding: '8px 20px', borderRadius: 9, border: 'none', background: selectedKpis.length === 0 ? 'rgba(255,255,255,0.05)' : '#7FB897', color: '#fff', fontSize: 13, fontWeight: 700, cursor: selectedKpis.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: kpiSaving ? 0.6 : 1 }}>
            {kpiSaving ? 'Saving…' : 'Save KPI Selection'}
          </button>
          {kpiSaved && <span style={{ fontSize: 12, color: '#7FB897' }}>✓ Saved — applies to next weekly report</span>}
          {selectedKpis.length === 0 && <span style={{ fontSize: 12, color: '#F59E0B' }}>Select at least one KPI</span>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Scheduled PDF Reports</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Send recurring PDF reports to your accountant, partners, or team automatically.</p>
        </div>
        <button onClick={() => setShowForm(s => !s)} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: '#7FB897', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
          + Schedule report
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '20px 24px', marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 18 }}>New scheduled report</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Report label *</label>
              <input style={inp} value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Monthly Cash Flow for Accountant" />
            </div>
            <div>
              <label style={lbl}>Frequency</label>
              <select style={inp} value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            {form.frequency === 'weekly' && (
              <div>
                <label style={lbl}>Day of week</label>
                <select style={inp} value={form.day_of_week} onChange={e => setForm(f => ({ ...f, day_of_week: Number(e.target.value) }))}>
                  {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
            )}
            {form.frequency === 'monthly' && (
              <div>
                <label style={lbl}>Day of month</label>
                <select style={inp} value={form.day_of_month} onChange={e => setForm(f => ({ ...f, day_of_month: Number(e.target.value) }))}>
                  {[1, 5, 10, 15, 20, 25, 28].map(d => <option key={d} value={d}>{d === 1 ? '1st' : d === 28 ? 'Last (28th)' : `${d}th`}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={lbl}>Send time (AEST)</label>
              <select style={inp} value={form.hour_aest} onChange={e => setForm(f => ({ ...f, hour_aest: Number(e.target.value) }))}>
                {HOURS.map(h => <option key={h} value={h}>{h === 0 ? '12:00 AM' : h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h - 12}:00 PM`}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Pages to include</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {PAGES.map(p => {
                const checked = form.pages_allowed.includes(p)
                return (
                  <button key={p} onClick={() => togglePage(p)} style={{ padding: '5px 12px', borderRadius: 99, border: `1px solid ${checked ? '#7FB897' : 'rgba(255,255,255,0.12)'}`, background: checked ? 'rgba(127,184,151,0.1)' : 'transparent', color: checked ? '#7FB897' : 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {checked ? '✓ ' : ''}{p}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Recipients *</label>
            {form.recipients.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                <input style={inp} placeholder="Name" value={r.name} onChange={e => updateRecipient(i, 'name', e.target.value)} />
                <input style={inp} type="email" placeholder="Email *" value={r.email} onChange={e => updateRecipient(i, 'email', e.target.value)} />
                {form.recipients.length > 1 && <button onClick={() => removeRecipient(i)} style={{ padding: '0 10px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)', color: '#F87171', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>×</button>}
              </div>
            ))}
            {form.recipients.length < 5 && <button onClick={addRecipient} style={{ fontSize: 12, color: '#7FB897', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>+ Add recipient</button>}
          </div>

          <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="incl-share" checked={form.include_share_link} onChange={e => setForm(f => ({ ...f, include_share_link: e.target.checked }))} style={{ accentColor: '#7FB897' }} />
            <label htmlFor="incl-share" style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Include live dashboard link in email</label>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={create} disabled={creating || !form.label || !form.recipients.some(r => r.email)} style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: '#7FB897', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: creating || !form.label || !form.recipients.some(r => r.email) ? 0.5 : 1, fontFamily: 'inherit' }}>
              {creating ? 'Scheduling…' : 'Schedule report'}
            </button>
            <button onClick={() => setShowForm(false)} style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.4)', padding: '40px 0', textAlign: 'center' }}>Loading…</div>
      ) : reports.length === 0 ? (
        <div style={{ color: 'rgba(255,255,255,0.4)', padding: '60px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📅</div>
          <p>No scheduled reports yet. Create one to automatically email PDF reports.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {reports.map(report => (
            <div key={report.id} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${report.is_active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`, borderRadius: 12, padding: '14px 18px', opacity: report.is_active ? 1 : 0.5 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{report.label}</span>
                    {!report.is_active && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }}>Paused</span>}
                  </div>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: '0 0 4px' }}>
                    {report.frequency === 'weekly' ? `Weekly · ${DAY_NAMES[report.day_of_week ?? 1]}` : report.frequency === 'monthly' ? `Monthly · ${report.day_of_month}th` : 'Daily'} at {report.hour_aest}:00 AEST
                  </p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '0 0 4px' }}>
                    To: {report.recipients.map(r => r.name ? `${r.name} <${r.email}>` : r.email).join(', ')}
                  </p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: 0 }}>
                    Next: {nextSendLabel(report.next_send_at)}
                    {report.last_sent_at ? ` · Last sent ${new Date(report.last_sent_at).toLocaleDateString('en-AU')}` : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => toggleActive(report.id, !report.is_active)} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>{report.is_active ? 'Pause' : 'Resume'}</button>
                  <button onClick={() => remove(report.id)} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)', color: '#F87171', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
