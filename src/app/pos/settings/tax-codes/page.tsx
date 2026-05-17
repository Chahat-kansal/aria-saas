'use client'
import { useState, useEffect, useCallback } from 'react'

interface TaxCode {
  id: string; code: string; name: string; rate: number
  category: string; is_inclusive: boolean; is_active: boolean; is_system: boolean
  description: string | null
}

export default function TaxCodesPage() {
  const [codes, setCodes] = useState<TaxCode[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<TaxCode | null>(null)

  const fetchCodes = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/pos/tax-codes')
    const d = await r.json()
    setCodes(d.tax_codes ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchCodes() }, [fetchCodes])

  async function saveNew(form: Partial<TaxCode>) {
    const r = await fetch('/api/pos/tax-codes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (r.ok) { setShowAdd(false); fetchCodes() }
  }

  async function saveEdit(id: string, form: Partial<TaxCode>) {
    const r = await fetch(`/api/pos/tax-codes/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (r.ok) { setEditing(null); fetchCodes() }
  }

  async function remove(id: string, isSystem: boolean) {
    if (isSystem) { alert('Cannot delete system tax code — edit it to deactivate'); return }
    if (!confirm('Deactivate this tax code?')) return
    await fetch(`/api/pos/tax-codes/${id}`, { method: 'DELETE' })
    fetchCodes()
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">Tax Codes</h1>
          <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Avalara-grade tax code library. System codes pre-seeded for Australian compliance (GST, WET, LCT, etc).</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#1a1a16] text-white">+ New tax code</button>
      </div>

      {loading ? <div className="text-sm text-[rgba(26,26,22,.5)]">Loading…</div> : (
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[rgba(0,0,0,.02)] text-xs font-medium text-[rgba(26,26,22,.5)]">
              <tr>
                <th className="text-left px-4 py-3">Code</th>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-right px-4 py-3">Rate</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-left px-4 py-3">Inclusive</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {codes.map(c => (
                <tr key={c.id} className="border-t border-[rgba(0,0,0,.04)]">
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{c.code}{c.is_system && <span className="ml-2 text-[10px] text-[rgba(26,26,22,.4)]">SYSTEM</span>}</td>
                  <td className="px-4 py-3">{c.name}</td>
                  <td className="px-4 py-3 text-right">{(Number(c.rate) || 0).toFixed(2)}%</td>
                  <td className="px-4 py-3 capitalize text-xs">{c.category}</td>
                  <td className="px-4 py-3 text-xs">{c.is_inclusive ? 'Inclusive' : 'On top'}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => setEditing(c)} className="text-xs text-[#8B5CF6] mr-3">Edit</button>
                    {!c.is_system && <button onClick={() => remove(c.id, c.is_system)} className="text-xs text-red-600">Deactivate</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(showAdd || editing) && (
        <TaxCodeModal
          initial={editing ?? undefined}
          onSave={(form) => editing ? saveEdit(editing.id, form) : saveNew(form)}
          onClose={() => { setShowAdd(false); setEditing(null) }}
        />
      )}
    </div>
  )
}

function TaxCodeModal({ initial, onSave, onClose }: { initial?: Partial<TaxCode>; onSave: (f: Partial<TaxCode>) => void; onClose: () => void }) {
  const [form, setForm] = useState<Partial<TaxCode>>({
    code: initial?.code ?? '', name: initial?.name ?? '', rate: initial?.rate ?? 10,
    category: initial?.category ?? 'standard', is_inclusive: initial?.is_inclusive ?? true,
    description: initial?.description ?? null,
  })
  const isEditingSystem = initial?.is_system === true
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">{initial ? 'Edit tax code' : 'New tax code'}</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[rgba(26,26,22,.5)] mb-1">Code (e.g. GST)</label>
            <input disabled={!!initial} value={form.code ?? ''} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className="w-full border rounded-xl px-3 py-2 text-sm font-mono disabled:bg-gray-50" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[rgba(26,26,22,.5)] mb-1">Display name</label>
            <input value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[rgba(26,26,22,.5)] mb-1">Rate %</label>
              <input type="number" step={0.5} min={0} max={100} value={form.rate ?? 0} onChange={e => setForm(f => ({ ...f, rate: parseFloat(e.target.value) || 0 }))} className="w-full border rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[rgba(26,26,22,.5)] mb-1">Category</label>
              <select value={form.category ?? 'standard'} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm">
                <option value="standard">Standard</option>
                <option value="reduced">Reduced</option>
                <option value="zero">Zero-rated</option>
                <option value="exempt">Exempt</option>
                <option value="special">Special (e.g. WET)</option>
                <option value="luxury">Luxury (e.g. LCT)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={isEditingSystem} checked={form.is_inclusive ?? true} onChange={e => setForm(f => ({ ...f, is_inclusive: e.target.checked }))} />
              Tax-inclusive pricing
            </label>
            <p className="text-xs text-[rgba(26,26,22,.4)] mt-1">When checked, prices already include this tax. When unchecked, tax is added on top.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-[rgba(26,26,22,.5)] mb-1">Description (optional)</label>
            <textarea value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full border rounded-xl px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm">Cancel</button>
          <button onClick={() => onSave(form)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#1a1a16] text-white">Save</button>
        </div>
      </div>
    </div>
  )
}
