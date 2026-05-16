'use client'
import { useState, useEffect } from 'react'

interface Policies { max_discount_pct?: number; void_requires_manager?: boolean; max_refund_no_approval?: number; min_sale_amount?: number; require_customer_for_sale?: boolean }

export default function EnterprisePoliciesPage() {
  const [policies, setPolicies] = useState<Policies>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/pos/enterprise-policies').then(r => r.json()).then(d => { setPolicies(d.policies ?? {}); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true); setSaved(false)
    await fetch('/api/pos/enterprise-policies', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(policies) })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const inp: React.CSSProperties = { background: 'var(--bg-base)', border: '1px solid var(--divider)', borderRadius: 8, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 600, color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Enterprise Policies</h1>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 28px' }}>Configure operational rules and approval thresholds that apply across all registers and outlets.</p>

      {loading ? <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {[
            { key: 'max_discount_pct', label: 'Maximum discount (%)', desc: 'Cashiers cannot apply discounts above this threshold without manager override', type: 'number', placeholder: 'e.g. 20' },
            { key: 'max_refund_no_approval', label: 'Max refund without approval (A$)', desc: 'Refunds above this amount require a manager PIN', type: 'number', placeholder: 'e.g. 50' },
            { key: 'min_sale_amount', label: 'Minimum sale amount (A$)', desc: 'Sales below this amount cannot be processed', type: 'number', placeholder: 'e.g. 0' },
          ].map(field => (
            <div key={field.key} style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{field.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{field.desc}</div>
                </div>
                <input style={{ ...inp, width: 100, textAlign: 'right' }} type={field.type} min="0" value={(policies as any)[field.key] ?? ''} onChange={e => setPolicies(p => ({ ...p, [field.key]: e.target.value === '' ? undefined : parseFloat(e.target.value) }))} placeholder={field.placeholder} />
              </div>
            </div>
          ))}

          {[
            { key: 'void_requires_manager', label: 'Void requires manager PIN', desc: 'A manager PIN must be entered before any sale can be voided' },
            { key: 'require_customer_for_sale', label: 'Require customer for every sale', desc: 'Cashier must select or create a customer before completing a sale' },
          ].map(field => (
            <div key={field.key} style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 12, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{field.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{field.desc}</div>
              </div>
              <div onClick={() => setPolicies(p => ({ ...p, [field.key]: !(p as any)[field.key] }))}
                style={{ width: 40, height: 22, borderRadius: 11, background: (policies as any)[field.key] ? 'var(--violet)' : 'var(--divider)', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                <div style={{ position: 'absolute', top: 3, left: (policies as any)[field.key] ? 20 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={saving} style={{ padding: '9px 24px', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save Policies'}
            </button>
            {saved && <span style={{ fontSize: 13, color: '#22c55e', alignSelf: 'center' }}>✓ Saved</span>}
          </div>
        </div>
      )}
    </div>
  )
}