'use client'
import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { inp, lbl } from '../shared'

interface Price { id: string; price_set_id: string; outlet_id: string | null; quantity: number; price: number; cost: number | null; margin_pct: number | null }
interface Inventory { id: string; outlet_id: string; case_cost: number | null; item_cost: number | null; last_case_cost: number | null; last_item_cost: number | null }
interface Props {
  prices: Price[]
  inventory: Inventory[]
  priceSets: { id: string; name: string; is_default: boolean }[]
  outlets: { id: string; name: string; is_global: boolean }[]
  onChange: (prices: Price[], deletedIds: string[], inventory: Inventory[]) => void
}

function calcMargin(price: number, cost: number | null) {
  if (!cost || !price || price <= 0) return null
  return (((price - cost) / price) * 100).toFixed(1)
}

export default function SellCostTab({ prices: initPrices, inventory: initInv, priceSets, outlets, onChange }: Props) {
  const [prices, setPrices] = useState<Price[]>(initPrices)
  const [deleted, setDeleted] = useState<string[]>([])
  const [inventory, setInventory] = useState<Inventory[]>(initInv)
  const [showTax, setShowTax] = useState(false)

  const emit = (p: Price[], d: string[], inv: Inventory[]) => { setPrices(p); setDeleted(d); setInventory(inv); onChange(p, d, inv) }

  const updatePrice = (idx: number, k: keyof Price, v: any) => {
    const next = prices.map((p, i) => i === idx ? { ...p, [k]: v } : p)
    emit(next, deleted, inventory)
  }

  const addPrice = () => {
    const defaultSet = priceSets.find(ps => ps.is_default) ?? priceSets[0]
    if (!defaultSet) return
    const newRow: Price = { id: `new-${Date.now()}`, price_set_id: defaultSet.id, outlet_id: null, quantity: 1, price: 0, cost: null, margin_pct: null }
    emit([...prices, newRow], deleted, inventory)
  }

  const deletePrice = (idx: number) => {
    const row = prices[idx]
    const newDeleted = row.id.startsWith('new-') ? deleted : [...deleted, row.id]
    emit(prices.filter((_, i) => i !== idx), newDeleted, inventory)
  }

  const updateCost = (outletId: string, k: 'case_cost' | 'item_cost', v: string) => {
    const next = inventory.map(inv => inv.outlet_id === outletId ? { ...inv, [k]: v === '' ? null : parseFloat(v) } : inv)
    emit(prices, deleted, next)
  }

  const th: React.CSSProperties = { padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left' as const, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '8px 6px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Prices section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Prices</h3>
          <button onClick={addPrice} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={13} /> New Price Point
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                <th style={th}>Price Set</th>
                <th style={th}>Outlet</th>
                <th style={th}>Qty</th>
                <th style={th}>Price</th>
                <th style={th}>Cost</th>
                <th style={th}>Margin %</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {prices.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                  <td style={td}>
                    <select style={{ ...inp, padding: '6px 10px', fontSize: 12 }} value={p.price_set_id} onChange={e => updatePrice(i, 'price_set_id', e.target.value)}>
                      {priceSets.map(ps => <option key={ps.id} value={ps.id}>{ps.name}</option>)}
                    </select>
                  </td>
                  <td style={td}>
                    <select style={{ ...inp, padding: '6px 10px', fontSize: 12 }} value={p.outlet_id ?? ''} onChange={e => updatePrice(i, 'outlet_id', e.target.value || null)}>
                      <option value="">All outlets</option>
                      {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </td>
                  <td style={td}><input type="number" min="1" style={{ ...inp, padding: '6px 8px', fontSize: 12, width: 60 }} value={p.quantity} onChange={e => updatePrice(i, 'quantity', parseInt(e.target.value) || 1)} /></td>
                  <td style={td}><input type="number" min="0" step="0.01" style={{ ...inp, padding: '6px 8px', fontSize: 12, width: 90 }} value={p.price} onChange={e => updatePrice(i, 'price', parseFloat(e.target.value) || 0)} /></td>
                  <td style={td}><input type="number" min="0" step="0.01" style={{ ...inp, padding: '6px 8px', fontSize: 12, width: 90 }} value={p.cost ?? ''} onChange={e => updatePrice(i, 'cost', e.target.value === '' ? null : parseFloat(e.target.value))} placeholder="—" /></td>
                  <td style={{ ...td, color: (() => { const m = calcMargin(p.price, p.cost); return m ? (parseFloat(m) < 20 ? 'var(--warning)' : 'var(--success)') : 'var(--text-tertiary)' })(), fontWeight: 600 }}>
                    {calcMargin(p.price, p.cost) ? `${calcMargin(p.price, p.cost)}%` : '—'}
                  </td>
                  <td style={td}><button onClick={() => deletePrice(i)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--destructive)', padding: 4 }}><Trash2 size={14} /></button></td>
                </tr>
              ))}
              {prices.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No price points yet. Click + New Price Point.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cost per outlet */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Cost per Outlet</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={showTax} onChange={e => setShowTax(e.target.checked)} /> Show costs including tax
          </label>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                {['Outlet','Last Case Cost','Last Item Cost','Case Cost','Item Cost'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {inventory.map(inv => {
                const outlet = outlets.find(o => o.id === inv.outlet_id)
                return (
                  <tr key={inv.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                    <td style={{ ...td, fontWeight: 600 }}>{outlet?.name ?? inv.outlet_id}</td>
                    <td style={{ ...td, color: 'var(--text-tertiary)' }}>{inv.last_case_cost != null ? `$${Number(inv.last_case_cost).toFixed(2)}` : '—'}</td>
                    <td style={{ ...td, color: 'var(--text-tertiary)' }}>{inv.last_item_cost != null ? `$${Number(inv.last_item_cost).toFixed(2)}` : '—'}</td>
                    <td style={td}><input type="number" min="0" step="0.01" style={{ ...inp, padding: '6px 8px', fontSize: 12, width: 100 }} value={inv.case_cost ?? ''} onChange={e => updateCost(inv.outlet_id, 'case_cost', e.target.value)} placeholder="—" /></td>
                    <td style={td}><input type="number" min="0" step="0.01" style={{ ...inp, padding: '6px 8px', fontSize: 12, width: 100 }} value={inv.item_cost ?? ''} onChange={e => updateCost(inv.outlet_id, 'item_cost', e.target.value)} placeholder="—" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
