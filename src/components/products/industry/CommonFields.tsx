'use client'
import type { Dispatch, SetStateAction } from 'react'

export interface ProductDraft {
  name?: string
  price?: number | string
  cost_price?: number | string
  description?: string
  category_id?: string | null
  image_url?: string | null
  sku?: string | null
  barcode?: string | null
  [key: string]: unknown
}

interface Category { id: string; name: string }

interface Props {
  form: ProductDraft
  setForm: Dispatch<SetStateAction<ProductDraft>>
  categories: Category[]
}

export default function CommonFields({ form, setForm, categories }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className="block text-xs mb-1">Name *</label>
        <input
          value={String(form.name ?? '')}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className="w-full border rounded-xl px-3 py-2 text-sm"
          placeholder="Product name"
        />
      </div>
      <div>
        <label className="block text-xs mb-1">Sell price (incl. tax) *</label>
        <input
          type="number" step="0.01" min={0}
          value={String(form.price ?? '')}
          onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
          className="w-full border rounded-xl px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs mb-1">Cost price</label>
        <input
          type="number" step="0.01" min={0}
          value={String(form.cost_price ?? '')}
          onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))}
          className="w-full border rounded-xl px-3 py-2 text-sm"
        />
      </div>
      <div className="col-span-2">
        <label className="block text-xs mb-1">Category</label>
        <select
          value={(form.category_id as string | null | undefined) ?? ''}
          onChange={e => setForm(f => ({ ...f, category_id: e.target.value || null }))}
          className="w-full border rounded-xl px-3 py-2 text-sm"
        >
          <option value="">— Select category —</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="col-span-2">
        <label className="block text-xs mb-1">Description</label>
        <textarea
          value={String(form.description ?? '')}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          rows={2}
          className="w-full border rounded-xl px-3 py-2 text-sm"
        />
      </div>
    </div>
  )
}
