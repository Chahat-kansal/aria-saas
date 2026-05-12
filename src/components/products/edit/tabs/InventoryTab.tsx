'use client'
import { useState } from 'react'
import { ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { inp, Toggle } from '../shared'

interface Inv { id: string; outlet_id: string; items_on_hand: number; items_reorder_level: number; items_reorder_amount: number; items_reorder_limit: number | null; items_max_on_hand: number | null; cases_on_hand: number; cases_reorder_level: number; cases_reorder_amount: number; cases_reorder_limit: number | null; cases_max_on_hand: number | null; items_per_case: number; reorder_rounding: string }
interface Props { inventory: Inv[]; outlets: { id: string; name: string }[]; onChange: (inventory: Inv[]) => void; productId: string }

const ROUNDING = ['no_rounding','round_up','round_down','case_only']

export default function InventoryTab({ inventory: initInv, outlets, onChange, productId }: Props) {
  const [inventory, setInventory] = useState<Inv[]>(initInv)
  const [open, setOpen] = useState<Record<string, boolean>>(Object.fromEntries((initInv).map(i => [i.id, true])))

  const update = (id: string, k: keyof Inv, v: any) => {
    const next = inventory.map(inv => inv.id === id ? { ...inv, [k]: v } : inv)
    setInventory(next); onChange(next)
  }

  const applyToAll = (sourceId: string) => {
    const src = inventory.find(i => i.id === sourceId)
    if (!src) return
    const next = inventory.map(inv => inv.id === sourceId ? inv : {
      ...inv,
      items_reorder_level: src.items_reorder_level, items_reorder_amount: src.items_reorder_amount,
      items_reorder_limit: src.items_reorder_limit, items_max_on_hand: src.items_max_on_hand,
      cases_reorder_level: src.cases_reorder_level, cases_reorder_amount: src.cases_reorder_amount,
      cases_reorder_limit: src.cases_reorder_limit, cases_max_on_hand: src.cases_max_on_hand,
      items_per_case: src.items_per_case, reorder_rounding: src.reorder_rounding,
    })
    setInventory(next); onChange(next)
  }

  const n = (v: any) => (v == null || v === '') ? '' : String(v)
  const numInp = (id: string, k: keyof Inv, placeholder = '0') => (
    <input type="number" min="0" style={{ ...inp, padding: '7px 10px', fontSize: 13 }}
      value={n(inventory.find(i => i.id === id)?.[k])}
      onChange={e => update(id, k, e.target.value === '' ? null : parseFloat(e.target.value))}
      placeholder={placeholder} />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {inventory.map(inv => {
        const outlet = outlets.find(o => o.id === inv.outlet_id)
        const isOpen = open[inv.id]
        const casesCalc = inv.items_per_case > 0 ? Math.floor(inv.items_on_hand / inv.items_per_case) : 0
        return (
          <div key={inv.id} style={{ background: 'var(--bg-surface)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--divider)' }}>
            <button onClick={() => setOpen(s => ({ ...s, [inv.id]: !s[inv.id] }))}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{outlet?.name ?? 'Outlet'}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{inv.items_on_hand} items · {casesCalc} cases</span>
                {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </div>
            </button>
            {isOpen && (
              <div style={{ padding: '0 16px 16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                      {['Field','Cases','Items'].map(h => (
                        <th key={h} style={{ padding: '8px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', textAlign: h === 'Field' ? 'left' : 'center', letterSpacing: '0.06em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'On Hand', ck: 'cases_on_hand' as keyof Inv, ik: 'items_on_hand' as keyof Inv },
                      { label: 'Reorder Level', ck: 'cases_reorder_level' as keyof Inv, ik: 'items_reorder_level' as keyof Inv },
                      { label: 'Reorder Amount', ck: 'cases_reorder_amount' as keyof Inv, ik: 'items_reorder_amount' as keyof Inv },
                      { label: 'Reorder Limit', ck: 'cases_reorder_limit' as keyof Inv, ik: 'items_reorder_limit' as keyof Inv },
                      { label: 'Max On Hand', ck: 'cases_max_on_hand' as keyof Inv, ik: 'items_max_on_hand' as keyof Inv },
                    ].map(({ label, ck, ik }) => (
                      <tr key={label} style={{ borderBottom: '1px solid var(--divider)' }}>
                        <td style={{ padding: '8px', color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'center' }}>{numInp(inv.id, ck)}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'center' }}>{numInp(inv.id, ik)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                      <td style={{ padding: '8px', color: 'var(--text-secondary)', fontWeight: 500 }}>Items per Case</td>
                      <td colSpan={2} style={{ padding: '4px 8px' }}>{numInp(inv.id, 'items_per_case', '1')}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '8px', color: 'var(--text-secondary)', fontWeight: 500 }}>Reorder Rounding</td>
                      <td colSpan={2} style={{ padding: '4px 8px' }}>
                        <select style={{ ...inp, padding: '7px 10px', fontSize: 13 }} value={inv.reorder_rounding}
                          onChange={e => update(inv.id, 'reorder_rounding', e.target.value)}>
                          {ROUNDING.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
                        </select>
                      </td>
                    </tr>
                  </tbody>
                </table>
                {inventory.length > 1 && (
                  <button onClick={() => applyToAll(inv.id)}
                    style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <Copy size={12} /> Copy reorder rules to all outlets
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
      {inventory.length === 0 && (
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 13, marginBottom: 8 }}>
            No inventory records found for this product.
          </p>
          <button
            onClick={async () => {
              const res = await fetch(
                `/api/pos/products/${productId}/init-inventory`,
                { method: 'POST' }
              )
              if (res.ok) window.location.reload()
            }}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
            }}>
            Create inventory records
          </button>
        </div>
      )}
    </div>
  )
}
