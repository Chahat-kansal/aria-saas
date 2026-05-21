'use client'
import type { Dispatch, SetStateAction } from 'react'
import type { ProductDraft } from './CommonFields'
import { ALLERGEN_OPTIONS } from '@/lib/industry/registry'

interface Props { form: ProductDraft; setForm: Dispatch<SetStateAction<ProductDraft>> }

export default function ConvenienceProductFields({ form, setForm }: Props) {
  const s = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))
  const allergens: string[] = Array.isArray(form.allergens) ? form.allergens as string[] : []
  const toggleAllergen = (a: string) => {
    s('allergens', allergens.includes(a) ? allergens.filter(x => x !== a) : [...allergens, a])
  }

  return (
    <div className="space-y-4 mt-4 pt-4 border-t">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Convenience Store details</h3>
      <div className="grid grid-cols-2 gap-3">

        <div>
          <label className="block text-xs mb-1 font-medium">Barcode</label>
          <input value={String(form.barcode ?? '')}
            onChange={e => s('barcode', e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm font-mono" />
        </div>

        <div>
          <label className="block text-xs mb-1 font-medium">Expiry date</label>
          <input type="date" value={String(form.expiry_date ?? '')}
            onChange={e => s('expiry_date', e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="block text-xs mb-1 font-medium">Shelf life (days)</label>
          <input type="number" min={0} value={String(form.shelf_life_days ?? '')}
            onChange={e => s('shelf_life_days', e.target.value ? Number(e.target.value) : null)}
            className="w-full border rounded-xl px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="block text-xs mb-1 font-medium">Storage</label>
          <select value={String(form.storage_temp ?? '')}
            onChange={e => s('storage_temp', e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm">
            <option value="">— Select —</option>
            <option>Ambient</option>
            <option>Refrigerated (2-8°C)</option>
            <option>Frozen (-18°C)</option>
          </select>
        </div>

        <div className="col-span-2">
          <label className="block text-xs mb-1 font-medium">Allergens</label>
          <div className="flex gap-2 flex-wrap">
            {ALLERGEN_OPTIONS.map(a => (
              <button key={a} type="button"
                onClick={() => toggleAllergen(a)}
                className="px-2.5 py-1 rounded-lg text-xs border capitalize transition-colors"
                style={allergens.includes(a)
                  ? { background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.4)', color: '#DC2626' }
                  : { borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}>
                {a}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={!!form.is_age_restricted}
              onChange={e => s('is_age_restricted', e.target.checked)} className="rounded" />
            Age restricted (18+)
          </label>
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={!!form.gst_exempt}
              onChange={e => s('gst_exempt', e.target.checked)} className="rounded" />
            GST exempt (fresh food)
          </label>
        </div>
      </div>
    </div>
  )
}
