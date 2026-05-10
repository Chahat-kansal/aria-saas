'use client'
import { useState } from 'react'
import { Trash2, Plus, Star } from 'lucide-react'
import { inp } from '../shared'

interface Image { id: string; image_url: string; is_primary: boolean; sort_order: number; alt_text: string | null }
interface Props { images: Image[]; onChange: (images: Image[], deletedIds: string[]) => void }

export default function ImagesTab({ images: init, onChange }: Props) {
  const [rows, setRows] = useState<Image[]>(init)
  const [deleted, setDeleted] = useState<string[]>([])
  const [urlInput, setUrlInput] = useState('')

  const emit = (r: Image[], d: string[]) => { setRows(r); setDeleted(d); onChange(r, d) }
  const setPrimary = (i: number) => emit(rows.map((r, j) => ({ ...r, is_primary: j === i })), deleted)
  const remove = (i: number) => {
    const row = rows[i]
    const next = rows.filter((_, j) => j !== i).map((r, j) => ({ ...r, sort_order: j }))
    if (next.length > 0 && !next.some(r => r.is_primary)) next[0].is_primary = true
    emit(next, row.id.startsWith('new-') ? deleted : [...deleted, row.id])
  }
  const addUrl = () => {
    if (!urlInput.trim()) return
    const newRow: Image = { id: `new-${Date.now()}`, image_url: urlInput.trim(), is_primary: rows.length === 0, sort_order: rows.length, alt_text: null }
    emit([...rows, newRow], deleted)
    setUrlInput('')
  }
  const updateAlt = (i: number, v: string) => emit(rows.map((r, j) => j === i ? { ...r, alt_text: v || null } : r), deleted)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Add by URL */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={{ ...inp, flex: 1 }} value={urlInput} onChange={e => setUrlInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addUrl()} placeholder="Paste image URL then press Enter or click Add" />
        <button onClick={addUrl} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 8, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
          <Plus size={14} /> Add
        </button>
      </div>

      {/* Image grid */}
      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)', fontSize: 13, border: '2px dashed var(--divider)', borderRadius: 12 }}>
          No images yet. Paste a URL above to add one.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {rows.map((img, i) => (
            <div key={img.id} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: img.is_primary ? '2px solid var(--violet)' : '1px solid var(--divider)', background: 'var(--bg-elevated)' }}>
              <img src={img.image_url} alt={img.alt_text ?? ''} loading="lazy"
                style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
              <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input style={{ ...inp, padding: '5px 8px', fontSize: 11 }} value={img.alt_text ?? ''}
                  onChange={e => updateAlt(i, e.target.value)} placeholder="Alt text" />
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => setPrimary(i)} title="Set as primary"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '5px', borderRadius: 6, border: 'none', background: img.is_primary ? 'var(--violet)' : 'var(--bg-input)', color: img.is_primary ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
                    <Star size={11} /> {img.is_primary ? 'Primary' : 'Set primary'}
                  </button>
                  <button onClick={() => remove(i)} style={{ padding: '5px 8px', borderRadius: 6, border: 'none', background: 'rgba(201,112,112,0.1)', color: 'var(--destructive)', cursor: 'pointer' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
