'use client'
import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react'
import { useProductIndustry } from '@/lib/industry/use-industry'
import { INDUSTRY_LABELS } from '@/lib/industry/registry'
import CommonFields, { type ProductDraft } from './CommonFields'
import RetailProductFields from './RetailProductFields'
import LiquorProductFields from './LiquorProductFields'
import CafeProductFields from './CafeProductFields'
import BakeryProductFields from './BakeryProductFields'
import RestaurantProductFields from './RestaurantProductFields'
import ClothingProductFields from './ClothingProductFields'
import PharmacyProductFields from './PharmacyProductFields'
import ConvenienceProductFields from './ConvenienceProductFields'

interface Category { id: string; name: string }

interface Props {
  form: ProductDraft
  setForm: Dispatch<SetStateAction<ProductDraft>>
}

export default function IndustryProductForm({ form, setForm }: Props) {
  const industry = useProductIndustry()
  const [categories, setCategories] = useState<Category[]>([])
  const [aiBusy, setAiBusy] = useState(false)

  const loadCategories = useCallback(async () => {
    try {
      const r = await fetch('/api/pos/categories')
      const d = await r.json()
      setCategories(d.categories ?? [])
    } catch { /* swallow */ }
  }, [])
  useEffect(() => { loadCategories() }, [loadCategories])

  async function aiSuggest() {
    if (!form.name) { alert('Enter a product name first'); return }
    setAiBusy(true)
    try {
      const r = await fetch('/api/aria/product-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, industry, partial: form }),
      })
      const d = await r.json()
      if (d.suggestion) setForm(f => ({ ...f, ...d.suggestion }))
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs px-2 py-1 rounded-full bg-[rgba(127,184,151,.15)] text-[#2D5240]">
          {INDUSTRY_LABELS[industry] ?? industry} product
        </span>
        <button
          type="button"
          onClick={aiSuggest}
          disabled={aiBusy}
          className="text-xs px-3 py-1.5 rounded-lg border border-[rgba(127,184,151,.4)] text-[#2D5240] hover:bg-[rgba(127,184,151,.1)] disabled:opacity-50"
        >
          {aiBusy ? 'Asking Aria…' : '✨ AI suggest fields'}
        </button>
      </div>
      <CommonFields form={form} setForm={setForm} categories={categories} />
      {industry === 'retail'       && <RetailProductFields      form={form} setForm={setForm} />}
      {industry === 'liquor'       && <LiquorProductFields      form={form} setForm={setForm} />}
      {industry === 'cafe'         && <CafeProductFields        form={form} setForm={setForm} />}
      {industry === 'bakery'       && <BakeryProductFields      form={form} setForm={setForm} />}
      {industry === 'restaurant'   && <RestaurantProductFields  form={form} setForm={setForm} />}
      {industry === 'fashion'      && <ClothingProductFields    form={form} setForm={setForm} />}
      {industry === 'pharmacy'     && <PharmacyProductFields    form={form} setForm={setForm} />}
      {industry === 'convenience'  && <ConvenienceProductFields form={form} setForm={setForm} />}
    </div>
  )
}
