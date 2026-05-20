'use client'
import { inp, lbl, field, Toggle } from '../shared'

interface Props {
  data: { name: string; sku: string; description: string; is_active: boolean; show_online: boolean; is_age_restricted: boolean; is_weight_based?: boolean; price_per_kg?: number }
  onChange: (data: Props['data']) => void
}

export default function GeneralTab({ data, onChange }: Props) {
  const set = (k: keyof Props['data'], v: any) => onChange({ ...data, [k]: v })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 16 }}>
        {field('Name *',
          <input style={inp} value={data.name} onChange={e => set('name', e.target.value)} placeholder="Product name" autoFocus />
        )}
        {field('SKU',
          <input style={inp} value={data.sku} onChange={e => set('sku', e.target.value)} placeholder="Auto-generated" />
        )}
      </div>
      {field('Description',
        <textarea style={{ ...inp, minHeight: 90, resize: 'vertical' }} value={data.description}
          onChange={e => set('description', e.target.value)} placeholder="Optional product description" />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Toggle label="Active — visible on terminal" checked={data.is_active} onChange={v => set('is_active', v)} />
        <Toggle label="Show online" checked={data.show_online} onChange={v => set('show_online', v)} />
        <Toggle label="Age restricted — requires ID verification" checked={data.is_age_restricted} onChange={v => set('is_age_restricted', v)} />
      </div>
    </div>
  )
}
