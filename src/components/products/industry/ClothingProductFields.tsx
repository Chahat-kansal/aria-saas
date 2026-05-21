'use client'
import type { Dispatch, SetStateAction } from 'react'
import type { ProductDraft } from './CommonFields'
import { SIZE_OPTIONS_CLOTHING, SIZE_OPTIONS_SHOES, GENDER_OPTIONS, FIT_OPTIONS } from '@/lib/industry/registry'

interface Props { form: ProductDraft; setForm: Dispatch<SetStateAction<ProductDraft>> }

const COMMON_COLORS = ['Black','White','Grey','Navy','Red','Blue','Green','Pink','Yellow','Orange','Brown','Purple','Beige','Khaki','Multicolor']
const MATERIAL_OPTIONS = ['Cotton','Polyester','Linen','Wool','Silk','Nylon','Rayon','Denim','Leather','Faux Leather','Cashmere','Bamboo','Spandex/Lycra','Mixed']

export default function ClothingProductFields({ form, setForm }: Props) {
  const s = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))
  const isFootwear = String(form.category ?? form.subcategory ?? '').toLowerCase().includes('shoe') ||
                     String(form.category ?? form.subcategory ?? '').toLowerCase().includes('footwear') ||
                     String(form.name ?? '').toLowerCase().includes('shoe') ||
                     String(form.name ?? '').toLowerCase().includes('boot') ||
                     String(form.name ?? '').toLowerCase().includes('sneaker')

  return (
    <div className="space-y-4 mt-4 pt-4 border-t">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Clothing & Fashion details</h3>
      <div className="grid grid-cols-2 gap-3">

        {/* Colour */}
        <div>
          <label className="block text-xs mb-1 font-medium">Colour</label>
          <select
            value={String(form.colour ?? '')}
            onChange={e => s('colour', e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm"
          >
            <option value="">— Select colour —</option>
            {COMMON_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Size */}
        <div>
          <label className="block text-xs mb-1 font-medium">{isFootwear ? 'Shoe Size' : 'Size'}</label>
          <select
            value={String(form.size ?? '')}
            onChange={e => s('size', e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm"
          >
            <option value="">— Select size —</option>
            {(isFootwear ? SIZE_OPTIONS_SHOES : SIZE_OPTIONS_CLOTHING).map(sz =>
              <option key={sz} value={sz}>{sz}</option>
            )}
          </select>
        </div>

        {/* Gender */}
        <div>
          <label className="block text-xs mb-1 font-medium">Gender</label>
          <select
            value={String(form.gender ?? '')}
            onChange={e => s('gender', e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm"
          >
            <option value="">— Select —</option>
            {GENDER_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Material */}
        <div>
          <label className="block text-xs mb-1 font-medium">Material / Fabric</label>
          <select
            value={String(form.material ?? '')}
            onChange={e => s('material', e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm"
          >
            <option value="">— Select —</option>
            {MATERIAL_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* Fit type — not for footwear */}
        {!isFootwear && (
          <div className="col-span-2">
            <label className="block text-xs mb-1 font-medium">Fit</label>
            <div className="flex gap-2 flex-wrap">
              {FIT_OPTIONS.map(fit => (
                <button key={fit} type="button"
                  onClick={() => s('fit_type', form.fit_type === fit ? '' : fit)}
                  className="px-3 py-1 rounded-lg text-xs border transition-colors"
                  style={form.fit_type === fit
                    ? { background: 'var(--violet-dim)', borderColor: 'var(--violet)', color: 'var(--violet)' }
                    : { borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
                >
                  {fit}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Brand */}
        <div>
          <label className="block text-xs mb-1 font-medium">Brand</label>
          <input
            value={String(form.brand ?? '')}
            onChange={e => s('brand', e.target.value)}
            placeholder="e.g. Levi's, Nike"
            className="w-full border rounded-xl px-3 py-2 text-sm"
          />
        </div>

        {/* Country of origin */}
        <div>
          <label className="block text-xs mb-1 font-medium">Country of origin</label>
          <input
            value={String(form.country_of_origin ?? '')}
            onChange={e => s('country_of_origin', e.target.value)}
            placeholder="e.g. Australia, China"
            className="w-full border rounded-xl px-3 py-2 text-sm"
          />
        </div>

        {/* Barcode */}
        <div>
          <label className="block text-xs mb-1 font-medium">Barcode</label>
          <input
            value={String(form.barcode ?? '')}
            onChange={e => s('barcode', e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm font-mono"
            placeholder="Scan or enter barcode"
          />
        </div>

        {/* SKU */}
        <div>
          <label className="block text-xs mb-1 font-medium">SKU / Style code</label>
          <input
            value={String(form.sku ?? '')}
            onChange={e => s('sku', e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm font-mono"
          />
        </div>
      </div>

      {/* Note: no expiry date for clothing */}
      <p className="text-[11px] text-[var(--text-tertiary)] italic">
        Clothing products do not require an expiry date. Use Variants to manage multiple colours or sizes of the same style.
      </p>
    </div>
  )
}
