'use client'
import { useState, useEffect } from 'react'
import { inp, lbl, field, Toggle } from '../shared'
import { nanoSuggest, nanoSupported } from '@/lib/ai/nano'

interface Props {
  data: { name: string; sku: string; description: string; is_active: boolean; show_online: boolean; is_age_restricted: boolean; is_weight_based?: boolean; price_per_kg?: number }
  onChange: (data: Props['data']) => void
}

export default function GeneralTab({ data, onChange }: Props) {
  const set = (k: keyof Props['data'], v: any) => onChange({ ...data, [k]: v })
  // FA-2.6: optional on-device (Chrome) description suggestion. Feature-detected after mount; the
  // affordance is hidden entirely on browsers without the Prompt API. nanoSuggest never throws.
  const [nanoOk, setNanoOk] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  useEffect(() => { setNanoOk(nanoSupported()) }, [])
  const suggestDescription = async () => {
    if (!data.name.trim()) return
    setSuggesting(true)
    try {
      const out = await nanoSuggest(`Write a single short, appealing retail product description (max 25 words) for a product called "${data.name.trim()}". Return only the description sentence, no quotes.`)
      if (out) set('description', out)
    } finally {
      setSuggesting(false)
    }
  }
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
      <div style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <label style={{ ...lbl, marginBottom: 0 }}>Description</label>
          {nanoOk && (
            <button type="button" onClick={suggestDescription} disabled={suggesting || !data.name.trim()}
              title="Suggest a description on your device (Chrome)"
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, color: 'var(--violet)', cursor: suggesting || !data.name.trim() ? 'default' : 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', opacity: suggesting || !data.name.trim() ? 0.5 : 1 }}>
              ✨ {suggesting ? 'Thinking…' : 'Suggest'}
            </button>
          )}
        </div>
        <textarea style={{ ...inp, minHeight: 90, resize: 'vertical' }} value={data.description}
          onChange={e => set('description', e.target.value)} placeholder="Optional product description" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Toggle label="Active — visible on terminal" checked={data.is_active} onChange={v => set('is_active', v)} />
        <Toggle label="Show online" checked={data.show_online} onChange={v => set('show_online', v)} />
        <Toggle label="Age restricted — requires ID verification" checked={data.is_age_restricted} onChange={v => set('is_age_restricted', v)} />
      </div>
    </div>
  )
}
