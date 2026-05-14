'use client'
import { useState } from 'react'

interface CartItem { id?: string; product: { id: string; name: string }; qty: number; unitPrice: number; label?: string; seat?: number }
interface SplitCheck { label: string; item_ids?: string[]; amount?: number }

interface Props {
  saleId?: string
  cart: CartItem[]
  total: number
  onConfirm: (splits: SplitCheck[]) => void
  onClose: () => void
}

type Mode = 'even' | 'item' | 'seat' | 'custom'

export function SplitBillModal({ saleId: _saleId, cart, total, onConfirm, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('even')
  const [ways, setWays] = useState(2)
  const [itemAssign, setItemAssign] = useState<Record<string, number>>({})
  const [customAmounts, setCustomAmounts] = useState<string[]>(['', ''])
  const [checkCount, setCheckCount] = useState(2)

  const perCheck = total / ways
  const perCheckRounded = Math.round(perCheck * 100) / 100
  const lastCheck = Math.round((total - perCheckRounded * (ways - 1)) * 100) / 100

  const customTotal = customAmounts.reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const customDiff = Math.round((customTotal - total) * 100) / 100

  const seats = [...new Set(cart.map(i => i.seat).filter((s): s is number => s != null))]

  function buildSplits(): SplitCheck[] {
    if (mode === 'even') {
      return Array.from({ length: ways }, (_, i) => ({
        label: `Check ${i + 1}`,
        amount: i < ways - 1 ? perCheckRounded : lastCheck,
      }))
    }
    if (mode === 'item') {
      const checks: Record<number, { items: CartItem[] }> = {}
      for (const item of cart) {
        const checkNum = itemAssign[item.product.id] ?? 1
        if (!checks[checkNum]) checks[checkNum] = { items: [] }
        checks[checkNum].items.push(item)
      }
      return Object.entries(checks).map(([num, { items }]) => ({
        label: `Check ${num}`,
        item_ids: items.map(i => i.id).filter(Boolean) as string[],
        amount: Math.round(items.reduce((s, i) => s + i.unitPrice * i.qty, 0) * 100) / 100,
      }))
    }
    if (mode === 'seat') {
      return seats.map(seat => {
        const seatItems = cart.filter(i => i.seat === seat)
        return {
          label: `Seat ${seat}`,
          item_ids: seatItems.map(i => i.id).filter(Boolean) as string[],
          amount: Math.round(seatItems.reduce((s, i) => s + i.unitPrice * i.qty, 0) * 100) / 100,
        }
      })
    }
    // custom
    return customAmounts.map((v, i) => ({
      label: `Check ${i + 1}`,
      amount: Math.round((parseFloat(v) || 0) * 100) / 100,
    }))
  }

  const TAB: React.CSSProperties = { padding: '7px 14px', borderRadius: 8, border: 'none', fontSize: 12,
    fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#111a14', border: '1px solid rgba(127,184,151,0.2)', borderRadius: 20,
          padding: 28, width: '100%', maxWidth: 480, maxHeight: '88vh', overflowY: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 800, margin: 0 }}>
            Split Bill · <span style={{ color: '#7FB897' }}>A${total.toFixed(2)}</span>
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 22, flexWrap: 'wrap' }}>
          {(['even','item','seat','custom'] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)}
              style={{ ...TAB, background: mode === m ? '#7FB897' : 'rgba(255,255,255,0.06)',
                color: mode === m ? '#111a14' : 'rgba(255,255,255,0.6)' }}>
              {m === 'even' ? 'Even Split' : m === 'item' ? 'By Item' : m === 'seat' ? 'By Seat' : 'Custom'}
            </button>
          ))}
        </div>

        {/* Even Split */}
        {mode === 'even' && (
          <div>
            <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 8 }}>Number of ways</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <button onClick={() => setWays(w => Math.max(2, w - 1))}
                style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 20, cursor: 'pointer' }}>−</button>
              <span style={{ fontSize: 28, fontWeight: 800, color: '#fff', minWidth: 40, textAlign: 'center' }}>{ways}</span>
              <button onClick={() => setWays(w => w + 1)}
                style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 20, cursor: 'pointer' }}>+</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array.from({ length: ways }, (_, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px',
                  background: 'rgba(127,184,151,0.06)', borderRadius: 10, border: '1px solid rgba(127,184,151,0.12)' }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Check {i + 1}</span>
                  <span style={{ color: '#7FB897', fontWeight: 700, fontSize: 14 }}>
                    A${(i < ways - 1 ? perCheckRounded : lastCheck).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* By Item */}
        {mode === 'item' && (
          <div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>Assign each item to a check number</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cart.map(item => (
                <div key={item.product.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10 }}>
                  <div>
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{item.label ?? item.product.name}</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginLeft: 8 }}>×{item.qty} · A${(item.unitPrice * item.qty).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1,2,3,4].map(n => (
                      <button key={n} onClick={() => setItemAssign(a => ({ ...a, [item.product.id]: n }))}
                        style={{ width: 28, height: 28, borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          background: (itemAssign[item.product.id] ?? 1) === n ? '#7FB897' : 'rgba(255,255,255,0.08)',
                          color: (itemAssign[item.product.id] ?? 1) === n ? '#111a14' : 'rgba(255,255,255,0.5)' }}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* By Seat */}
        {mode === 'seat' && (
          <div>
            {seats.length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No seat numbers assigned to cart items. Assign seats in Sprint D table flow first.</p>
            ) : (
              seats.map(seat => {
                const seatItems = cart.filter(i => i.seat === seat)
                const seatTotal = seatItems.reduce((s, i) => s + i.unitPrice * i.qty, 0)
                return (
                  <div key={seat} style={{ marginBottom: 12, padding: '12px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ color: '#7FB897', fontWeight: 700, fontSize: 13 }}>Seat {seat}</span>
                      <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>A${seatTotal.toFixed(2)}</span>
                    </div>
                    {seatItems.map(i => (
                      <div key={i.product.id} style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                        {i.label ?? i.product.name} ×{i.qty}
                      </div>
                    ))}
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* Custom */}
        {mode === 'custom' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Checks:</span>
              <button onClick={() => { if (checkCount > 2) { setCheckCount(c => c - 1); setCustomAmounts(a => a.slice(0, -1)) } }}
                style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer' }}>−</button>
              <span style={{ color: '#fff', fontWeight: 700 }}>{checkCount}</span>
              <button onClick={() => { setCheckCount(c => c + 1); setCustomAmounts(a => [...a, '']) }}
                style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer' }}>+</button>
            </div>
            {Array.from({ length: checkCount }, (_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', width: 60 }}>Check {i + 1}</label>
                <input type="text" inputMode="decimal" value={customAmounts[i] ?? ''} placeholder="0.00"
                  onChange={e => setCustomAmounts(a => { const n = [...a]; n[i] = e.target.value; return n })}
                  style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
              </div>
            ))}
            <div style={{ fontSize: 12, marginTop: 6, color: customDiff === 0 ? '#7FB897' : '#EF4444' }}>
              Total: A${customTotal.toFixed(2)} {customDiff !== 0 && `(${customDiff > 0 ? '+' : ''}${customDiff.toFixed(2)} vs A$${total.toFixed(2)})`}
            </div>
          </div>
        )}

        {/* Confirm */}
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button
            disabled={mode === 'custom' && customDiff !== 0}
            onClick={() => onConfirm(buildSplits())}
            style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none',
              background: mode === 'custom' && customDiff !== 0 ? 'rgba(127,184,151,0.3)' : '#7FB897',
              color: '#fff', fontSize: 14, fontWeight: 700, cursor: mode === 'custom' && customDiff !== 0 ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit' }}>
            Split Bill
          </button>
        </div>
      </div>
    </div>
  )
}