'use client'
import type { Dispatch, SetStateAction } from 'react'
import type { ProductDraft } from './CommonFields'
import { ALLERGEN_OPTIONS } from '@/lib/industry/registry'

interface Props { form: ProductDraft; setForm: Dispatch<SetStateAction<ProductDraft>> }

export default function BakeryProductFields({ form, setForm }: Props) {
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
      <h3 className="text-sm font-semibold">Bakery details</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs mb-1">Shelf life (days)</label>
          <input
            type="number" min={0} max={365}
            value={String((form as { shelf_life_days?: number }).shelf_life_days ?? '')}
            onChange={e => setForm(f => ({ ...f, shelf_life_days: parseInt(e.target.value) || null }))}
            placeholder="3"
            className="w-full border rounded-xl px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs mb-1">Stock on hand (today's bake)</label>
          <input
            type="number" min={0}
            value={String((form as { stock_quantity?: number }).stock_quantity ?? 0)}
            onChange={e => setForm(f => ({ ...f, stock_quantity: parseInt(e.target.value) || 0 }))}
            className="w-full border rounded-xl px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <h4 className="text-xs font-medium mb-2">Allergens (legally required for bakery)</h4>
        <div className="grid grid-cols-3 gap-1">
          {ALLERGEN_OPTIONS.map(a => (
            <label key={a} className="flex items-center gap-2 text-xs py-1">
              <input type="checkbox" checked={allergens.includes(a)} onChange={() => toggleAllergen(a)} />
              {a.replace('_', ' ')}
            </label>
          ))}
        </div>
        {allergens.length > 0 && (
          <div className="text-xs text-[rgba(26,26,22,.5)] mt-2">
            Will appear as &ldquo;Contains: {allergens.join(', ').replace(/_/g, ' ')}&rdquo; on receipts and shelf tickets.
          </div>
        )}
      </div>
    </div>
  )
}
