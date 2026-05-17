'use client'
import { useState, useEffect, useCallback } from 'react'

interface Holiday {
  id: string; name: string; starts_at: string; ends_at: string
  affected_tax_code_ids: string[]; affected_category_ids: string[]
  affected_product_ids: string[]; is_active: boolean; outlet_id: string | null
}
interface TaxCode { id: string; code: string; name: string }

export default function TaxHolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [codes, setCodes] = useState<TaxCode[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [hs, cs] = await Promise.all([
      fetch('/api/pos/tax-holidays').then(r => r.json()),
      fetch('/api/pos/tax-codes').then(r => r.json()),
    ])
    setHolidays(hs.holidays ?? [])
    setCodes(cs.tax_codes ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function save(form: Partial<Holiday>) {
    const r = await fetch('/api/pos/tax-holidays', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (r.ok) { setShowAdd(false); load() }
    else { const e = await r.json(); alert(e.error ?? 'Save failed') }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Tax holidays</h1>
          <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Schedule tax-free windows. Useful for council tax-free weekends, charity events, or back-to-school.</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#1a1a16] text-white">+ New holiday</button>
      </div>

      {loading ? <div className="text-sm">Loading…</div> : holidays.length === 0 ? (
        <div className="bg-white rounded-2xl border p-8 text-center text-sm text-[rgba(26,26,22,.5)]">No tax holidays scheduled.</div>
      ) : (
        <div className="space-y-2">
          {holidays.map(h => (
            <div key={h.id} className="bg-white rounded-xl border p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{h.name}</div>
                <div className="text-xs text-[rgba(26,26,22,.5)]">{new Date(h.starts_at).toLocaleDateString()} — {new Date(h.ends_at).toLocaleDateString()}</div>
                <div className="text-xs text-[rgba(26,26,22,.4)] mt-1">{h.affected_tax_code_ids.length} tax codes suspended</div>
              </div>
              <span className={`text-xs px-2 py-1 rounded ${h.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{h.is_active ? 'Active' : 'Inactive'}</span>
            </div>
          ))}
        </div>
      )}

      {showAdd && <HolidayModal codes={codes} onSave={save} onClose={() => setShowAdd(false)} />}
    </div>
  )
}

function HolidayModal({ codes, onSave, onClose }: { codes: TaxCode[]; onSave: (f: Partial<Holiday>) => void; onClose: () => void }) {
  const [form, setForm] = useState<Partial<Holiday>>({
    name: '', starts_at: '', ends_at: '', affected_tax_code_ids: [], affected_category_ids: [], affected_product_ids: [],
  })
  function toggleCode(id: string) {
    setForm(f => ({
      ...f,
      affected_tax_code_ids: f.affected_tax_code_ids?.includes(id)
        ? f.affected_tax_code_ids.filter(x => x !== id)
        : [...(f.affected_tax_code_ids ?? []), id],
    }))
  }
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">New tax holiday</h2>
        <div className="space-y-3">
          <input placeholder="Name e.g. Tax-free weekend" value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1">Starts</label>
              <input type="datetime-local" value={form.starts_at ?? ''} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs mb-1">Ends</label>
              <input type="datetime-local" value={form.ends_at ?? ''} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs mb-2">Tax codes suspended during holiday:</label>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {codes.map(c => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.affected_tax_code_ids?.includes(c.id) ?? false} onChange={() => toggleCode(c.id)} />
                  <span className="font-mono text-xs">{c.code}</span> — {c.name}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm">Cancel</button>
          <button onClick={() => onSave(form)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#1a1a16] text-white">Create holiday</button>
        </div>
      </div>
    </div>
  )
}
