'use client'
import { useState, useEffect, useCallback } from 'react'

interface ReceiptTemplate {
  id: string
  template_name: string
  width_mm: 58 | 76 | 80 | 112
  header_text: string | null
  footer_text: string | null
  logo_url: string | null
  show_tax_breakdown: boolean
  show_qr_code: boolean
  show_loyalty_balance: boolean
  paper_cut_mode: 'full' | 'partial' | 'none'
  outlet_id: string | null
}

const WIDTH_OPTIONS = [58, 76, 80, 112] as const
const CUT_MODES = ['full', 'partial', 'none'] as const

export default function ReceiptTemplatesPage() {
  const [templates, setTemplates] = useState<ReceiptTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<ReceiptTemplate | null>(null)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/pos/receipt-templates')
    const d = await r.json()
    setTemplates(d.templates ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  async function saveNew(form: Partial<ReceiptTemplate>) {
    const r = await fetch('/api/pos/receipt-templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (r.ok) { setShowAdd(false); fetchTemplates() }
  }

  async function saveEdit(id: string, form: Partial<ReceiptTemplate>) {
    const r = await fetch(`/api/pos/receipt-templates/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (r.ok) { setEditing(null); fetchTemplates() }
  }

  async function remove(id: string) {
    if (!confirm('Delete this receipt template?')) return
    await fetch(`/api/pos/receipt-templates/${id}`, { method: 'DELETE' })
    fetchTemplates()
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">Receipt Templates</h1>
          <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Customise receipt layout per outlet — header, footer, paper width, and cut mode.</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#1a1a16] text-white">+ New template</button>
      </div>

      {loading ? <div className="text-sm text-[rgba(26,26,22,.5)]">Loading…</div> : (
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] overflow-hidden">
          {templates.length === 0 ? (
            <p className="text-sm text-[rgba(26,26,22,.4)] p-8 text-center">No templates yet. Create one to customise your receipts.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[rgba(0,0,0,.02)] text-xs font-medium text-[rgba(26,26,22,.5)]">
                <tr>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-right px-4 py-3">Width</th>
                  <th className="text-left px-4 py-3">Cut</th>
                  <th className="text-left px-4 py-3">Options</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {templates.map(t => (
                  <tr key={t.id} className="border-t border-[rgba(0,0,0,.04)]">
                    <td className="px-4 py-3 font-medium">{t.template_name}</td>
                    <td className="px-4 py-3 text-right text-xs">{t.width_mm}mm</td>
                    <td className="px-4 py-3 text-xs capitalize">{t.paper_cut_mode}</td>
                    <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.5)]">
                      {[t.show_tax_breakdown && 'Tax', t.show_qr_code && 'QR', t.show_loyalty_balance && 'Loyalty'].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => setEditing(t)} className="text-xs text-[#8B5CF6] mr-3">Edit</button>
                      <button onClick={() => remove(t.id)} className="text-xs text-red-600">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {(showAdd || editing) && (
        <TemplateModal
          initial={editing ?? undefined}
          onSave={(form) => editing ? saveEdit(editing.id, form) : saveNew(form)}
          onClose={() => { setShowAdd(false); setEditing(null) }}
        />
      )}
    </div>
  )
}

function TemplateModal({
  initial, onSave, onClose,
}: {
  initial?: Partial<ReceiptTemplate>
  onSave: (f: Partial<ReceiptTemplate>) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<Partial<ReceiptTemplate>>({
    template_name: initial?.template_name ?? '',
    width_mm: initial?.width_mm ?? 80,
    header_text: initial?.header_text ?? '',
    footer_text: initial?.footer_text ?? '',
    logo_url: initial?.logo_url ?? '',
    show_tax_breakdown: initial?.show_tax_breakdown ?? true,
    show_qr_code: initial?.show_qr_code ?? false,
    show_loyalty_balance: initial?.show_loyalty_balance ?? false,
    paper_cut_mode: initial?.paper_cut_mode ?? 'partial',
  })
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">{initial?.id ? 'Edit template' : 'New template'}</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[rgba(26,26,22,.5)] mb-1">Template name</label>
            <input value={form.template_name ?? ''} onChange={e => setForm(f => ({ ...f, template_name: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Default" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[rgba(26,26,22,.5)] mb-1">Paper width</label>
              <select value={form.width_mm ?? 80} onChange={e => setForm(f => ({ ...f, width_mm: parseInt(e.target.value) as 58|76|80|112 }))} className="w-full border rounded-xl px-3 py-2 text-sm">
                {WIDTH_OPTIONS.map(w => <option key={w} value={w}>{w}mm</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[rgba(26,26,22,.5)] mb-1">Paper cut</label>
              <select value={form.paper_cut_mode ?? 'partial'} onChange={e => setForm(f => ({ ...f, paper_cut_mode: e.target.value as 'full'|'partial'|'none' }))} className="w-full border rounded-xl px-3 py-2 text-sm">
                {CUT_MODES.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[rgba(26,26,22,.5)] mb-1">Header text</label>
            <textarea value={form.header_text ?? ''} onChange={e => setForm(f => ({ ...f, header_text: e.target.value }))} rows={2} className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Thank you for visiting!" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[rgba(26,26,22,.5)] mb-1">Footer text</label>
            <textarea value={form.footer_text ?? ''} onChange={e => setForm(f => ({ ...f, footer_text: e.target.value }))} rows={2} className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Powered by AriaPOS" />
          </div>
          <div className="space-y-2">
            {([
              ['show_tax_breakdown', 'Show tax breakdown'],
              ['show_qr_code', 'Show QR code'],
              ['show_loyalty_balance', 'Show loyalty balance'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!(form[key])} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} />
                {label}
              </label>
            ))}
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
