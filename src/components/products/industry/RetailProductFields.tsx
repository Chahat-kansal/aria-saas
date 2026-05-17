'use client'
import type { Dispatch, SetStateAction } from 'react'
import type { ProductDraft } from './CommonFields'

interface Props { form: ProductDraft; setForm: Dispatch<SetStateAction<ProductDraft>> }

export default function RetailProductFields({ form, setForm }: Props) {
  return (
    <div className="space-y-4 mt-4 pt-4 border-t">
      <h3 className="text-sm font-semibold">Retail details</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs mb-1">SKU</label>
          <input
            value={String(form.sku ?? '')}
            onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-xs mb-1">Barcode</label>
          <input
            value={String(form.barcode ?? '')}
            onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-xs mb-1">Stock on hand</label>
          <input
            type="number" min={0}
            value={String((form as { stock_quantity?: number }).stock_quantity ?? 0)}
            onChange={e => setForm(f => ({ ...f, stock_quantity: parseInt(e.target.value) || 0 }))}
            className="w-full border rounded-xl px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs mb-1">Low stock threshold</label>
          <input
            type="number" min={0}
            value={String((form as { low_stock_threshold?: number }).low_stock_threshold ?? 5)}
            onChange={e => setForm(f => ({ ...f, low_stock_threshold: parseInt(e.target.value) || 0 }))}
            className="w-full border rounded-xl px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs mb-1">Bin location</label>
          <input
            value={String((form as { bin_location?: string }).bin_location ?? '')}
            onChange={e => setForm(f => ({ ...f, bin_location: e.target.value }))}
            placeholder="Aisle 3, Shelf B"
            className="w-full border rounded-xl px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs mb-1">Case quantity</label>
          <input
            type="number" min={1}
            value={String((form as { case_quantity?: number }).case_quantity ?? 1)}
            onChange={e => setForm(f => ({ ...f, case_quantity: parseInt(e.target.value) || 1 }))}
            className="w-full border rounded-xl px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs mb-1">Supplier SKU</label>
          <input
            value={String((form as { supplier_sku?: string }).supplier_sku ?? '')}
            onChange={e => setForm(f => ({ ...f, supplier_sku: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-xs mb-1">Supplier barcode</label>
          <input
            value={String((form as { supplier_barcode?: string }).supplier_barcode ?? '')}
            onChange={e => setForm(f => ({ ...f, supplier_barcode: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm font-mono"
          />
        </div>
      </div>
    </div>
  )
}
