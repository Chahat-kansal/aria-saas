'use client'
import type { Dispatch, SetStateAction } from 'react'
import type { ProductDraft } from './CommonFields'
import RetailProductFields from './RetailProductFields'
import { CONTAINER_TYPES } from '@/lib/industry/registry'

interface Props { form: ProductDraft; setForm: Dispatch<SetStateAction<ProductDraft>> }

export default function LiquorProductFields({ form, setForm }: Props) {
  return (
    <>
      <RetailProductFields form={form} setForm={setForm} />
      <div className="space-y-4 mt-4 pt-4 border-t">
        <h3 className="text-sm font-semibold">Liquor compliance</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs mb-1">Container type</label>
            <select
              value={String((form as { container_type?: string }).container_type ?? '')}
              onChange={e => setForm(f => ({ ...f, container_type: e.target.value || null }))}
              className="w-full border rounded-xl px-3 py-2 text-sm"
            >
              <option value="">— Select —</option>
              {CONTAINER_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1">Alcohol % ABV</label>
            <input
              type="number" step="0.1" min={0} max={100}
              value={String((form as { alcohol_percentage?: number }).alcohol_percentage ?? '')}
              onChange={e => setForm(f => ({ ...f, alcohol_percentage: parseFloat(e.target.value) || null }))}
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs mb-1">Standard drinks</label>
            <input
              type="number" step="0.1" min={0}
              value={String((form as { standard_drinks?: number }).standard_drinks ?? '')}
              onChange={e => setForm(f => ({ ...f, standard_drinks: parseFloat(e.target.value) || null }))}
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs mb-1">Vintage (year)</label>
            <input
              type="number" min={1900} max={2100}
              value={String((form as { vintage?: number }).vintage ?? '')}
              onChange={e => setForm(f => ({ ...f, vintage: parseInt(e.target.value) || null }))}
              placeholder="Wines only"
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={(form as { age_restricted?: boolean }).age_restricted ?? true}
                onChange={e => setForm(f => ({ ...f, age_restricted: e.target.checked }))}
              />
              Age-restricted (18+ ID check at till)
            </label>
          </div>
        </div>
      </div>
    </>
  )
}
