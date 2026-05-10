'use client'
import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { inp, Toggle } from '../shared'

interface SupplierLink { id: string; supplier_id: string; sku: string; last_cost: number | null; last_ordered: string | null; is_active: boolean }
interface Props { productSuppliers: SupplierLink[]; suppliers: { id: string; name: string }[]; onChange: (rows: SupplierLink[], deletedIds: string[]) => void }

export default function SuppliersTab({ productSuppliers: init, suppliers, onChange }: Props) {
  const [rows, setRows] = useState<SupplierLink[]>(init)
  const [deleted, setDeleted] = useState<string[]>([])

  const emit = (r: SupplierLink[], d: string[]) => { setRows(r); setDeleted(d); onChange(r, d) }
  const update = (i: number, k: keyof SupplierLink, v: any) => emit(rows.map((r, j) => j === i ? { ...r, [k]: v } : r), deleted)
  const add = () => {
    if (!suppliers.length) return
    emit([...rows, { id: `new-${Date.now()}`, supplier_id: suppliers[0].id, sku: '', last_cost: null, last_ordered: null, is_active: true }], deleted)
  }
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
          <Plus size={13} /> Add Supplier
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--divider)' }}>
            {['Supplier','Supplier SKU','Last Cost','Last Ordered','Active',''].map((h, i) => <th key={i} style={th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} style={{ borderBottom: '1px solid var(--divider)' }}>
              <td style={td}>
                <select style={{ ...inp, padding: '7px 10px', fontSize: 13, background: 'var(--bg-input)' }} value={r.supplier_id} onChange={e => update(i, 'supplier_id', e.target.value)}>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </td>
              <td style={td}><input style={{ ...inp, padding: '7px 10px', fontSize: 13 }} value={r.sku} onChange={e => update(i, 'sku', e.target.value)} placeholder="e.g. CDR-24" /></td>
              <td style={{ ...td, color: 'var(--text-tertiary)' }}>{r.last_cost != null ? `$${Number(r.last_cost).toFixed(2)}` : '—'}</td>
              <td style={{ ...td, color: 'var(--text-tertiary)', fontSize: 12 }}>{r.last_ordered ? new Date(r.last_ordered).toLocaleDateString('en-AU') : '—'}</td>
              <td style={td}><Toggle label="" checked={r.is_active} onChange={v => update(i, 'is_active', v)} /></td>
              <td style={td}><button onClick={() => remove(i)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--destructive)', padding: 4 }}><Trash2 size={14} /></button></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No suppliers linked. Click + Add Supplier.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
