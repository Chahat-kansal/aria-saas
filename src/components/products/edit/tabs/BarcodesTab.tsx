'use client'
import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { inp } from '../shared'

interface Barcode { id: string; barcode: string; is_primary: boolean; barcode_type: 'item' | 'case' | 'pack'; notes: string | null }
interface Props { barcodes: Barcode[]; onChange: (barcodes: Barcode[], deletedIds: string[]) => void }

export default function BarcodesTab({ barcodes: init, onChange }: Props) {
  const [rows, setRows] = useState<Barcode[]>(init)
  const [deleted, setDeleted] = useState<string[]>([])

  const emit = (r: Barcode[], d: string[]) => { setRows(r); setDeleted(d); onChange(r, d) }
  const update = (i: number, k: keyof Barcode, v: any) => emit(rows.map((r, j) => j === i ? { ...r, [k]: v } : r), deleted)
  const setPrimary = (i: number) => emit(rows.map((r, j) => ({ ...r, is_primary: j === i })), deleted)
  const add = () => emit([...rows, { id: `new-${Date.now()}`, barcode: '', is_primary: rows.length === 0, barcode_type: 'item', notes: null }], deleted)
  const remove = (i: number) => {
    const row = rows[i]
    emit(rows.filter((_, j) => j !== i), row.id.startsWith('new-') ? deleted : [...deleted, row.id])
  }

  const th: React.CSSProperties = { padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left' }
  const td: React.CSSProperties = { padding: '6px 6px' }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={add} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Plus size={13} /> Add Barcode
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--divider)' }}>
            <th style={{ ...th, width: 56 }}>Primary</th>
            <th style={th}>Barcode</th>
            <th style={{ ...th, width: 120 }}>Type</th>
            <th style={th}>Notes</th>
            <th style={{ ...th, width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} style={{ borderBottom: '1px solid var(--divider)' }}>
              <td style={{ ...td, textAlign: 'center' }}>
                <input type="radio" name="primary-barcode" checked={r.is_primary} onChange={() => setPrimary(i)} style={{ accentColor: 'var(--violet)', width: 16, height: 16 }} />
              </td>
              <td style={td}><input style={{ ...inp, padding: '7px 10px', fontSize: 13 }} value={r.barcode} onChange={e => update(i, 'barcode', e.target.value)} placeholder="e.g. 9300675000000" /></td>
              <td style={td}>
                <select style={{ ...inp, padding: '7px 10px', fontSize: 13, background: 'var(--bg-input)' }} value={r.barcode_type} onChange={e => update(i, 'barcode_type', e.target.value)}>
                  <option value="item">Item</option>
                  <option value="case">Case</option>
                  <option value="pack">Pack</option>
                </select>
              </td>
              <td style={td}><input style={{ ...inp, padding: '7px 10px', fontSize: 13 }} value={r.notes ?? ''} onChange={e => update(i, 'notes', e.target.value || null)} placeholder="Optional" /></td>
              <td style={td}><button onClick={() => remove(i)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--destructive)', padding: 4 }}><Trash2 size={14} /></button></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No barcodes yet.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
