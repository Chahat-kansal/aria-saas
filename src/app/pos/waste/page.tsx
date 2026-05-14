'use client'
import { useState, useEffect } from 'react'

interface WasteEntry { id: string; product_name: string; quantity: number; unit: string | null; reason: string | null; recorded_by: string | null; cost_cents: number | null; recorded_at: string }

const REASONS = ['Spoilage', 'Overproduction', 'Dropped', 'Expired', 'Quality issue', 'Other']
const inp: React.CSSProperties = { background: 'var(--bg-base)', border: '1px solid var(--divider)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function WastePage() {
  const [entries, setEntries] = useState<WasteEntry[]>([])
  const [totalCents, setTotalCents] = useState(0)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ product_name: '', quantity: '', unit: 'g', reason: 'Spoilage', recorded_by: '', cost_cents: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const res = await fetch('/api/pos/waste?days=30').then(r => r.json()).catch(() => ({ entries: [], total_cost_cents: 0 }))
    setEntries(res.entries ?? [])
    setTotalCents(res.total_cost_cents ?? 0)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const todayCents = entries
    .filter(e => new Date(e.recorded_at).toDateString() === new Date().toDateString())
    .reduce((s, e) => s + (e.cost_cents ?? 0), 0)

  async function log() {
    if (!form.product_name.trim() || !form.quantity) return
    setSaving(true); setError('')
    const res = await fetch('/api/pos/waste', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_name: form.product_name.trim(),
        quantity: parseFloat(form.quantity),
        unit: form.unit || null,
        reason: form.reason || null,
        recorded_by: form.recorded_by.trim() || null,
        cost_cents: form.cost_cents ? Math.round(parseFloat(form.cost_cents) * 100) : null,
      }),
    }).then(r => r.json()).catch(() => ({ error: 'Network error' }))
    if (res.error) { setError(res.error); setSaving(false); return }
    setForm({ product_name: '', quantity: '', unit: 'g', reason: 'Spoilage', recorded_by: '', cost_cents: '' })
    load()
    setSaving(false)
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '24px 28px', maxWidth: 860 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Waste Log</h1>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 24px' }}>Record food waste to track COGS and identify loss patterns.</p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: "Today's waste cost",   value: `A$${(todayCents / 100).toFixed(2)}`,  color: todayCents > 0 ? '#EF4444' : '#7FB897' },
          { label: '30-day waste cost',    value: `A$${(totalCents / 100).toFixed(2)}`,  color: 'var(--text-primary)' },
          { label: 'Entries this month',   value: String(entries.length),                color: 'var(--text-primary)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 12, padding: '14px 18px' }}>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
            <p style={{ fontSize: 20, fontWeight: 800, margin: 0, color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Log form */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: '18px 20px', marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 14px' }}>Log Waste</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Product name *</label>
            <input style={inp} value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} placeholder="e.g. Oat milk, Croissant" />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Quantity *</label>
            <input style={inp} type="number" step="0.1" min={0} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="e.g. 500" />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Unit</label>
            <input style={inp} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="g, ml, ea, kg" />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Reason</label>
            <select style={{ ...inp, background: 'var(--bg-base)' }} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}>
              {REASONS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Recorded by</label>
            <input style={inp} value={form.recorded_by} onChange={e => setForm(f => ({ ...f, recorded_by: e.target.value }))} placeholder="Staff name" />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Est. cost (A$)</label>
            <input style={inp} type="number" step="0.01" min={0} value={form.cost_cents} onChange={e => setForm(f => ({ ...f, cost_cents: e.target.value }))} placeholder="0.00" />
          </div>
        </div>
        {error && <p style={{ color: 'var(--destructive)', fontSize: 12, marginBottom: 10 }}>{error}</p>}
        <button onClick={log} disabled={saving || !form.product_name.trim() || !form.quantity}
          style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Logging…' : 'Log Waste'}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>No waste logged yet in the last 30 days.</div>
      ) : (
        <div style={{ border: '1px solid var(--divider)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--divider)' }}>
                {['When', 'Product', 'Qty', 'Reason', 'By', 'Cost'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-tertiary)', fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={e.id} style={{ borderBottom: i < entries.length - 1 ? '1px solid var(--divider)' : 'none' }}>
                  <td style={{ padding: '9px 12px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{formatDate(e.recorded_at)}</td>
                  <td style={{ padding: '9px 12px', fontWeight: 600 }}>{e.product_name}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>{e.quantity}{e.unit ? ` ${e.unit}` : ''}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>{e.reason ?? '—'}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>{e.recorded_by ?? '—'}</td>
                  <td style={{ padding: '9px 12px', color: e.cost_cents ? '#EF4444' : 'var(--text-tertiary)', fontWeight: e.cost_cents ? 700 : 400 }}>
                    {e.cost_cents ? `A$${(e.cost_cents / 100).toFixed(2)}` : '—'}
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
