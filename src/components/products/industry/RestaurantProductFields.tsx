'use client'
import type { Dispatch, SetStateAction } from 'react'
import type { ProductDraft } from './CommonFields'
import { ALLERGEN_OPTIONS, COURSE_TYPES } from '@/lib/industry/registry'

interface Props { form: ProductDraft; setForm: Dispatch<SetStateAction<ProductDraft>> }

const KDS_STATIONS = ['kitchen', 'grill', 'cold', 'expo', 'pastry', 'bar'] as const

export default function RestaurantProductFields({ form, setForm }: Props) {
  const allergens = ((form as { allergens?: string[] }).allergens ?? []) as string[]
  function toggleAllergen(a: string) {
    setForm(f => {
      const cur = ((f as { allergens?: string[] }).allergens ?? []) as string[]
      const next = cur.includes(a) ? cur.filter(x => x !== a) : [...cur, a]
      return { ...f, allergens: next }
    })
  }
  return (
    <div className="space-y-4 mt-4 pt-4 border-t">
      <h3 className="text-sm font-semibold">Restaurant details</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs mb-1">Course</label>
          <select
            value={String((form as { course_type?: string }).course_type ?? '')}
            onChange={e => setForm(f => ({ ...f, course_type: e.target.value || null }))}
            className="w-full border rounded-xl px-3 py-2 text-sm"
          >
            <option value="">— Select course —</option>
            {COURSE_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1">KDS station</label>
          <select
            value={String((form as { kds_station?: string }).kds_station ?? 'kitchen')}
            onChange={e => setForm(f => ({ ...f, kds_station: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm"
          >
            {KDS_STATIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1">Prep time (seconds)</label>
          <input
            type="number" min={0}
            value={String((form as { prep_time_seconds?: number }).prep_time_seconds ?? '')}
            onChange={e => setForm(f => ({ ...f, prep_time_seconds: parseInt(e.target.value) || null }))}
            placeholder="600 (= 10 min for a main)"
            className="w-full border rounded-xl px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <h4 className="text-xs font-medium mb-2">Allergens</h4>
        <div className="grid grid-cols-3 gap-1">
          {ALLERGEN_OPTIONS.map(a => (
            <label key={a} className="flex items-center gap-2 text-xs py-1">
              <input type="checkbox" checked={allergens.includes(a)} onChange={() => toggleAllergen(a)} />
              {a.replace('_', ' ')}
            </label>
          ))}
        </div>
      </div>
      <div className="text-xs text-[rgba(26,26,22,.5)] italic">
        Recipe ingredients and modifier groups (no onions, extra cheese) are managed
        on the product detail page after save.
      </div>
    </div>
  )
}
