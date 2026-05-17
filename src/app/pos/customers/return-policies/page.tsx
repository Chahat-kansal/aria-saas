'use client'
import { useState, useEffect, useCallback } from 'react'

interface Policy {
  id: string
  category_id: string | null
  return_window_days: number
  requires_photo: boolean
  allowed_conditions: string[]
  allowed_refund_methods: string[]
}
interface Category { id: string; name: string }

export default function ReturnPoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<Partial<Policy>>({
    return_window_days: 30, requires_photo: false,
    allowed_conditions: ['new', 'good'],
    allowed_refund_methods: ['original_payment', 'store_credit'],
  })

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([
      fetch('/api/pos/return-policies').then(r => r.json()),
      fetch('/api/pos/categories').then(r => r.json()),
    ])
    setPolicies(p.policies ?? [])
    setCategories(c.categories ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    await fetch('/api/pos/return-policies', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setForm({ return_window_days: 30, requires_photo: false, allowed_conditions: ['new', 'good'], allowed_refund_methods: ['original_payment', 'store_credit'] })
    load()
  }

  if (loading) return <div className="p-6">Loading…</div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold mb-2">Return policies</h1>
      <p className="text-xs text-[rgba(26,26,22,.5)] mb-6">Set return windows per category. Default (no category) applies when a more specific rule doesn't match.</p>

      <div className="bg-white rounded-2xl border p-4 mb-6">
        <h2 className="text-sm font-semibold mb-3">New policy</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs mb-1">Category (or default)</label>
            <select value={form.category_id ?? ''} onChange={e => setForm(f => ({ ...f, category_id: e.target.value || null }))} className="w-full border rounded-xl px-3 py-2 text-sm">
              <option value="">— Default (all other) —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1">Return window (days)</label>
            <input type="number" min={0} max={365} value={form.return_window_days ?? 30}
              onChange={e => setForm(f => ({ ...f, return_window_days: parseInt(e.target.value) || 0 }))}
              className="w-full border rounded-xl px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.requires_photo ?? false} onChange={e => setForm(f => ({ ...f, requires_photo: e.target.checked }))} />
              Photo required for damaged returns
            </label>
          </div>
        </div>
        <button onClick={save} className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold bg-[#1a1a16] text-white">Save policy</button>
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[rgba(0,0,0,.02)] text-xs font-medium text-[rgba(26,26,22,.5)]">
            <tr>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-right px-4 py-3">Window</th>
              <th className="text-left px-4 py-3">Photo</th>
            </tr>
          </thead>
          <tbody>
            {policies.map(p => (
              <tr key={p.id} className="border-t border-[rgba(0,0,0,.04)]">
                <td className="px-4 py-3">{p.category_id ? (categories.find(c => c.id === p.category_id)?.name ?? 'Unknown') : 'Default'}</td>
                <td className="px-4 py-3 text-right">{p.return_window_days} days</td>
                <td className="px-4 py-3">{p.requires_photo ? 'Required' : 'Optional'}</td>
              </tr>
            ))}
            {policies.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-[rgba(26,26,22,.4)]">No policies yet. Create a default policy above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
