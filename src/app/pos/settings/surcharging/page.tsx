'use client'
import { useState, useEffect } from 'react'

interface Rule { id: string; name: string; payment_type: string; amount_type: string; amount: number; is_active: boolean }
const inp: React.CSSProperties = { background: 'var(--bg-base)', border: '1px solid var(--divider)', borderRadius: 8, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }

export default function SurchargingPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', payment_type: 'card', amount_type: 'percent', amount: '' })
  const [saving, setSaving] = useState(false)

  async function load() {
    const d = await fetch('/api/pos/surcharge-rules').then(r => r.json()).catch(() => ({ rules: [] }))
    setRules(d.rules ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function add() {
    if (!form.name || !form.amount) return
    setSaving(true)
    await fetch('/api/pos/surcharge-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }) })
    setForm({ name: '', payment_type: 'card', amount_type: 'percent', amount: '' }); load(); setSaving(false)
  }

  async function toggle(rule: Rule) {
    await fetch('/api/pos/surcharge-rules', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rule.id, is_active: !rule.is_active }) })
    load()
  }

  async function del(id: string) {
    if (!confirm('Delete this surcharge rule?')) return
    await fetch('/api/pos/surcharge-rules', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    load()
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 760, color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Surcharging</h1>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px' }}>Configure payment surcharges applied at checkout. Australia: surcharges must not exceed cost of acceptance.</p>
      <p style={{ fontSize: 11, color: '#F59E0B', margin: '0 0 24px' }}>⚠ ACCC rules apply — card surcharges may not exceed your merchant fee rate.</p>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: '18px 20px', marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 14px' }}>Add Surcharge Rule</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Name *</label>
            <input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Card Surcharge" />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Payment Type</label>
            <select style={{ ...inp, background: 'var(--bg-base)' }} value={form.payment_type} onChange={e => setForm(f => ({ ...f, payment_type: e.target.value }))}>
              <option value="card">Card (any)</option>
              <option value="eftpos">EFTPOS</option>
              <option value="amex">Amex/Diners</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Type</label>
            <select style={{ ...inp, background: 'var(--bg-base)' }} value={form.amount_type} onChange={e => setForm(f => ({ ...f, amount_type: e.target.value }))}>
              <option value="percent">% of total</option>
              <option value="flat">Flat A$</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Amount</label>
            <input style={inp} type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder={form.amount_type === 'percent' ? '1.5' : '0.50'} />
          </div>
        </div>
        <button onClick={add} disabled={saving || !form.name || !form.amount}
          style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Adding…' : 'Add Rule'}
        </button>
      </div>

      {loading ? <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
      : rules.length === 0 ? <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>No surcharge rules yet.</div>
      : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rules.map(r => (
            <div key={r.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{r.payment_type} · {r.amount_type === 'percent' ? `${r.amount}%` : `A$${r.amount.toFixed(2)} flat`}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div onClick={() => toggle(r)} style={{ width: 36, height: 20, borderRadius: 10, background: r.is_active ? 'var(--violet)' : 'var(--divider)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                  <div style={{ position: 'absolute', top: 2, left: r.is_active ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                </div>
                <button onClick={() => del(r.id)} style={{ background: 'none', border: 'none', color: 'var(--destructive)', cursor: 'pointer', fontSize: 13 }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
