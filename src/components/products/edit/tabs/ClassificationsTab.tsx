'use client'
import { inp, lbl, field } from '../shared'

interface Props {
  data: { category_id: string; brand_id: string; family_id: string; container_type: string; track_stock: boolean; tax_rate: number }
  categories: { id: string; name: string }[]
  brands: { id: string; name: string }[]
  families: { id: string; name: string }[]
  onChange: (data: Props['data']) => void
}

const CONTAINERS = ['unknown','bottle','can','keg','carton','box','bag','packet','jar','tube']
const TAX_OPTIONS = [{ v: 0, label: '0% — GST exempt' }, { v: 10, label: '10% — Standard GST' }]

export default function ClassificationsTab({ data, categories, brands, families, onChange }: Props) {
  const set = (k: keyof Props['data'], v: any) => onChange({ ...data, [k]: v })
  const sel = (extra?: React.CSSProperties): React.CSSProperties => ({ ...inp, background: 'var(--bg-input)', ...extra })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {field('Category',
          <select style={sel()} value={data.category_id} onChange={e => set('category_id', e.target.value)}>
            <option value="">No category</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {field('Brand',
          <select style={sel()} value={data.brand_id} onChange={e => set('brand_id', e.target.value)}>
            <option value="">No brand</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        {field('Family / Department',
          <select style={sel()} value={data.family_id} onChange={e => set('family_id', e.target.value)}>
            <option value="">No family</option>
            {families.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
        {field('Container type',
          <select style={sel()} value={data.container_type} onChange={e => set('container_type', e.target.value)}>
            {CONTAINERS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        )}
        {field('GST rate',
          <select style={sel()} value={data.tax_rate} onChange={e => set('tax_rate', parseFloat(e.target.value))}>
            {TAX_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        )}
        {field('Track inventory',
          <select style={sel()} value={data.track_stock ? '1' : '0'} onChange={e => set('track_stock', e.target.value === '1')}>
            <option value="1">Yes — deduct stock on sale</option>
            <option value="0">No — unlimited stock</option>
          </select>
        )}
      </div>
    </div>
  )
}
