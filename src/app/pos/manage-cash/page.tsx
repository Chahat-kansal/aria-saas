'use client'
import { useState, useEffect, useCallback } from 'react'

interface CashEntry {
  id: string
  type: string
  amount: number
  note: string | null
  created_at: string
}

export default function ManageCashPage() {
  const [entries, setEntries] = useState<CashEntry[]>([])
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [noTable, setNoTable] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ type: 'cash_in', amount: '', note: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/pos/cash')
      const d = await r.json()
      if (d.warning) { setNoTable(true); setLoading(false); return }
      const list: CashEntry[] = d.entries ?? []
      setEntries(list)
      const bal = list.reduce((sum, e) => {
        const sign = e.type === 'cash_out' || e.type === 'cash_drop' ? -1 : 1
        return sum + sign * (Number(e.amount) || 0)
      }, 0)
      setBalance(bal)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!form.amount || parseFloat(form.amount) <= 0) { alert('Enter a valid amount'); return }
    setSaving(true)
    try {
      await fetch('/api/pos/cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: form.type, amount: parseFloat(form.amount), note: form.note || null }),
      })
      setAddOpen(false)
      setForm({ type: 'cash_in', amount: '', note: '' })
      load()
    } finally {
      setSaving(false)
    }
  }

  const MOVEMENT_TYPES = [
    { value: 'opening_float', label: 'Opening float' },
    { value: 'cash_in', label: 'Cash in' },
    { value: 'cash_out', label: 'Cash out' },
    { value: 'cash_drop', label: 'Cash drop (banking)' },
    { value: 'reconciliation', label: 'Reconciliation adjustment' },
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Manage Cash</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Track till float, banking, and cash drops.</p>
        </div>
        {!noTable && (
          <button data-tour="cash_open" onClick={() => setAddOpen(true)} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: '#2D5240', color: '#006AFF' }}>
            + Record movement
          </button>
        )}
      </div>

      {!noTable && (
        <div className="rounded-2xl p-5 mb-6" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
          <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Current till balance</div>
          <div className={`text-3xl font-semibold mt-1 ${balance < 0 ? 'text-[#FF9F6B]' : 'text-[#7FB897]'}`}>A${balance.toFixed(2)}</div>
        </div>
      )}

      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
          <h2 className="text-sm font-semibold">Cash movements</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Loading…</div>
        ) : noTable ? (
          <div className="p-8 text-center">
            <p className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Cash movement table not yet set up.</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary, #6E7C6E)' }}>Cash sales from the terminal will appear here once the pos_cash_movements table is created.</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>No cash movements yet.</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary, #6E7C6E)' }}>Record an opening float to get started, or cash sales will appear automatically.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
              <tr>
                <th className="text-left px-5 py-2">Type</th>
                <th className="text-right px-5 py-2">Amount</th>
                <th className="text-left px-5 py-2">Note</th>
                <th className="text-left px-5 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => {
                const isOut = e.type === 'cash_out' || e.type === 'cash_drop'
                return (
                  <tr key={e.id} style={{ borderTop: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
                    <td className="px-5 py-2 capitalize">{(e.type ?? '').replace(/_/g, ' ')}</td>
                    <td className={`px-5 py-2 text-right font-medium ${isOut ? 'text-[#FF9F6B]' : 'text-[#7FB897]'}`}>
                      {isOut ? '−' : '+'}A${(Math.abs(Number(e.amount)) || 0).toFixed(2)}
                    </td>
                    <td className="px-5 py-2" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{e.note ?? '—'}</td>
                    <td className="px-5 py-2 text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{new Date(e.created_at).toLocaleString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {addOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setAddOpen(false)}>
          <div className="rounded-2xl p-6 w-full max-w-sm" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))', color: 'var(--text-primary, #E8EDE7)' }} onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold mb-4">Record cash movement</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full rounded-xl px-3 py-2 text-sm" style={{ background: 'var(--bg-input, #0F1612)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary, #E8EDE7)' }}>
                  {MOVEMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Amount (A$)</label>
                <input type="number" step="0.01" min={0.01} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="w-full rounded-xl px-3 py-2 text-sm" style={{ background: 'var(--bg-input, #0F1612)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary, #E8EDE7)' }} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Note (optional)</label>
                <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. End of day banking" className="w-full rounded-xl px-3 py-2 text-sm" style={{ background: 'var(--bg-input, #0F1612)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary, #E8EDE7)' }} />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setAddOpen(false)} className="px-4 py-2 rounded-xl text-sm" style={{ border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-secondary, #A8B5A8)' }}>Cancel</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: '#2D5240', color: '#006AFF' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
