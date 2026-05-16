'use client'
import { useState, useEffect } from 'react'

interface Customer { id: string; name: string; email: string | null; account_balance: number; total_spent: number; last_visit: string | null }
const inp: React.CSSProperties = { background: 'var(--bg-base)', border: '1px solid var(--divider)', borderRadius: 8, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }

export default function BalancesPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ customer: Customer; type: 'credit' | 'debit' } | null>(null)
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const d = await fetch('/api/pos/balances').then(r => r.json()).catch(() => ({ customers: [] }))
    setCustomers(d.customers ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function apply() {
    if (!modal || !amount) return
    setSaving(true)
    await fetch('/api/pos/balances', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_id: modal.customer.id, amount: parseFloat(amount), type: modal.type }) })
    setModal(null); setAmount(''); load(); setSaving(false)
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 860, color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Account Balances</h1>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 24px' }}>Customers with positive account credit balances.</p>

      {modal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 14, padding: 24, width: 360 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>{modal.type === 'credit' ? 'Add Credit' : 'Deduct Balance'}</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 16px' }}>{modal.customer.name} · Balance: A${modal.customer.account_balance.toFixed(2)}</p>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Amount (A$) *</label>
            <input style={{ ...inp, marginBottom: 16 }} type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setModal(null)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={apply} disabled={saving || !amount} style={{ flex: 2, padding: '8px 0', borderRadius: 8, border: 'none', background: modal.type === 'credit' ? '#22c55e' : '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : modal.type === 'credit' ? 'Add Credit' : 'Deduct'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
      : customers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>💰</div>
          <p style={{ margin: 0 }}>No customers with positive balances yet.</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>Add account credit to customers in the terminal or customer profile.</p>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--divider)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: 'var(--bg-surface)' }}>
              {['Customer', 'Balance', 'Total Spent', 'Last Visit', ''].map(h => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {customers.map((c, i) => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--divider)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)' }}>
                  <td style={{ padding: '10px 14px' }}><div style={{ fontWeight: 600 }}>{c.name}</div>{c.email && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{c.email}</div>}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#22c55e' }}>A${c.account_balance.toFixed(2)}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>A${(c.total_spent ?? 0).toFixed(2)}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-tertiary)', fontSize: 12 }}>{c.last_visit ? new Date(c.last_visit).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setModal({ customer: c, type: 'credit' })} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>+ Credit</button>
                      <button onClick={() => setModal({ customer: c, type: 'debit' })} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(239,68,68,0.12)', color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>− Deduct</button>
                    </div>
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