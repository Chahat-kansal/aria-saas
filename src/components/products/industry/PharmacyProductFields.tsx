'use client'
import type { Dispatch, SetStateAction } from 'react'
import type { ProductDraft } from './CommonFields'

interface Props { form: ProductDraft; setForm: Dispatch<SetStateAction<ProductDraft>> }

export default function PharmacyProductFields({ form, setForm }: Props) {
  const s = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))
  return (
    <div className="space-y-4 mt-4 pt-4 border-t">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Pharmacy & Health details</h3>
      <div className="grid grid-cols-2 gap-3">

        <div>
          <label className="block text-xs mb-1 font-medium">Expiry date</label>
          <input type="date"
            value={String(form.expiry_date ?? '')}
            onChange={e => s('expiry_date', e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs mb-1 font-medium">Shelf life (days from manufacture)</label>
          <input type="number" min={0}
            value={String(form.shelf_life_days ?? '')}
            onChange={e => s('shelf_life_days', e.target.value ? Number(e.target.value) : null)}
            className="w-full border rounded-xl px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs mb-1 font-medium">Barcode</label>
          <input value={String(form.barcode ?? '')}
            onChange={e => s('barcode', e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm font-mono"
          />
        </div>

        <div>
          <label className="block text-xs mb-1 font-medium">Storage temperature</label>
          <select value={String(form.storage_temp ?? '')}
            onChange={e => s('storage_temp', e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm">
            <option value="">— Select —</option>
            <option>Ambient</option>
            <option>Refrigerated (2-8°C)</option>
            <option>Cool & Dry</option>
            <option>Frozen</option>
          </select>
        </div>

        <div className="col-span-2">
          <label className="block text-xs mb-1 font-medium">Schedule level</label>
          <div className="flex gap-2 flex-wrap">
            {['None (OTC)','S2 (Pharmacy Only)','S3 (Pharmacist Only)','S4 (Prescription)','S8 (Controlled)'].map(s_ => (
              <button key={s_} type="button"
                onClick={() => s('schedule_level', form.schedule_level === s_ ? '' : s_)}
                className="px-3 py-1 rounded-lg text-xs border transition-colors"
                style={form.schedule_level === s_
                  ? { background: 'var(--violet-dim)', borderColor: 'var(--violet)', color: 'var(--violet)' }
                  : { borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}>
                {s_}
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-2">
          <label className="block text-xs mb-1 font-medium">Ingredients / Active ingredients</label>
          <textarea value={String(form.ingredients ?? '')}
            onChange={e => s('ingredients', e.target.value)}
            rows={2} placeholder="List active ingredients..."
            className="w-full border rounded-xl px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={!!form.requires_script}
              onChange={e => s('requires_script', e.target.checked)} className="rounded" />
            Requires prescription (script)
          </label>
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={!!form.is_schedule_drug}
              onChange={e => s('is_schedule_drug', e.target.checked)} className="rounded" />
            Scheduled drug / restricted
          </label>
        </div>
      </div>
    </div>
  )
}
