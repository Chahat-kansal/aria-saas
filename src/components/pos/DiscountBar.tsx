'use client'
import { useState, useEffect, useCallback } from 'react'
import type { CartItem as EngineCartItem, AppliedDiscount } from '@/lib/pos/discount-engine'

export interface DiscountBarCartItem {
  product_id: string
  product_name: string
  category_id: string | null
  qty: number
  unit_price: number
}

interface Props {
  cart: DiscountBarCartItem[]
  appliedDiscounts: AppliedDiscount[]
  onApply: (discount: AppliedDiscount) => void
  onRemove: (promotionId: string) => void
  manualDiscountAmount: number
  onManualDiscount: (amount: number, reason: string) => void
  businessType?: string
}

function toEngineCart(cart: DiscountBarCartItem[]): EngineCartItem[] {
  return cart.map(i => ({
    product_id: i.product_id,
    product_name: i.product_name,
    category_id: i.category_id,
    quantity: i.qty,
    unit_price: i.unit_price,
    line_total: i.unit_price * i.qty,
  }))
}

const REASONS = ['Staff discount', 'Manager override', 'Customer complaint', 'Damaged goods', 'Promotional', 'Other']

export default function DiscountBar({ cart, appliedDiscounts, onApply, onRemove, manualDiscountAmount, onManualDiscount, businessType }: Props) {
  const [autoDiscounts, setAutoDiscounts]   = useState<AppliedDiscount[]>([])
  const [manualDiscounts, setManualDiscounts] = useState<AppliedDiscount[]>([])
  const [showPicker,  setShowPicker]  = useState(false)
  const [pickerMode,  setPickerMode]  = useState<'pct' | 'amt' | 'promo' | 'code'>('pct')
  const [inputVal,    setInputVal]    = useState('')
  const [codeInput,   setCodeInput]   = useState('')
  const [reason,      setReason]      = useState(REASONS[0])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  void businessType // all industries get discounts

  const fetchAuto = useCallback(async () => {
    if (!cart.length) { setAutoDiscounts([]); setManualDiscounts([]); return }
    try {
      const res = await fetch('/api/pos/promotions/applicable', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart: toEngineCart(cart), customer_id: (typeof window !== 'undefined' ? (JSON.parse(localStorage.getItem('aria_pos_customer') || 'null')?.id ?? null) : null) }),
      })
      const d = await res.json()
      setAutoDiscounts(d.auto ?? [])
      setManualDiscounts(d.manual ?? [])
    } catch { /* silent */ }
  }, [cart.map(i => `${i.product_id}:${i.qty}`).join(',')])

  useEffect(() => { fetchAuto() }, [fetchAuto])

  // Auto-apply detections when they appear
  useEffect(() => {
    for (const d of autoDiscounts) {
      if (!appliedDiscounts.some(a => a.promotion_id === d.promotion_id)) {
        onApply(d)
      }
    }
  }, [autoDiscounts])

  // No gate — all industries get discounts

  const totalOff = appliedDiscounts.reduce((s, d) => s + d.amount_off, 0) + manualDiscountAmount

  async function applyCode() {
    if (!codeInput.trim()) return
    setLoading(true); setError('')
    const res = await fetch('/api/pos/promotions/apply-code', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: codeInput.trim(), cart: toEngineCart(cart) }),
    })
    const d = await res.json()
    if (!d.valid || !d.discount) { setError(d.error ?? 'Invalid code'); setLoading(false); return }
    onApply(d.discount)
    setCodeInput(''); setShowPicker(false); setLoading(false)
  }

  function applyManual() {
    const val = parseFloat(inputVal)
    if (!val || val <= 0) return
    const cartTotal = cart.reduce((s, i) => s + i.unit_price * i.qty, 0)
    const amountOff = pickerMode === 'pct'
      ? parseFloat((cartTotal * val / 100).toFixed(2))
      : parseFloat(Math.min(val, cartTotal).toFixed(2))
    if (amountOff <= 0) return
    onManualDiscount(amountOff, reason)
    setInputVal(''); setShowPicker(false)
  }

  function applyPromo(d: AppliedDiscount) {
    onApply(d)
    setShowPicker(false)
  }

  return (
    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--divider)', background: 'var(--bg-surface)' }}>
      {/* Applied chips */}
      {(appliedDiscounts.length > 0 || manualDiscountAmount > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {appliedDiscounts.map(d => (
            <span key={d.promotion_id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 99,
              background: 'rgba(127,184,151,0.12)', color: '#7FB897', border: '1px solid rgba(127,184,151,0.25)',
            }}>
              {d.promotion_name} −A${d.amount_off.toFixed(2)}
              <button onClick={() => onRemove(d.promotion_id)} style={{ background: 'none', border: 'none', color: '#7FB897', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
            </span>
          ))}
          {manualDiscountAmount > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(245,158,11,0.1)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.2)' }}>
              Manual −A${manualDiscountAmount.toFixed(2)}
            </span>
          )}
        </div>
      )}

      {/* Total savings row */}
      {totalOff > 0 && (
        <div style={{ fontSize: 11, color: '#7FB897', fontWeight: 600, marginBottom: 6 }}>
          Total savings: A${totalOff.toFixed(2)}
        </div>
      )}

      {/* Add discount button */}
      {!showPicker ? (
        <button onClick={() => setShowPicker(true)} style={{
          fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
          background: 'none', border: '1px dashed var(--divider)', borderRadius: 7,
          padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit',
        }}>+ Add discount</button>
      ) : (
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Mode tabs */}
          <div style={{ display: 'flex', gap: 4 }}>
            {([['pct', '% Off'], ['amt', '$ Off'], ['promo', 'Promo'], ['code', 'Code']] as const).map(([mode, label]) => (
              <button key={mode} onClick={() => { setPickerMode(mode); setError('') }}
                style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  background: pickerMode === mode ? 'var(--violet)' : 'transparent',
                  color: pickerMode === mode ? '#fff' : 'var(--text-secondary)' }}>
                {label}
              </button>
            ))}
          </div>

          {(pickerMode === 'pct' || pickerMode === 'amt') && (
            <>
              <div style={{ display: 'flex', gap: 6 }}>
                <input autoFocus value={inputVal} onChange={e => setInputVal(e.target.value)}
                  placeholder={pickerMode === 'pct' ? 'e.g. 10' : 'e.g. 5.00'}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--divider)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
                <select value={reason} onChange={e => setReason(e.target.value)}
                  style={{ flex: 1, padding: '6px 8px', borderRadius: 7, border: '1px solid var(--divider)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 11, fontFamily: 'inherit', outline: 'none' }}>
                  {REASONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={applyManual} disabled={!inputVal} style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: !inputVal ? 0.5 : 1 }}>
                  Apply
                </button>
                <button onClick={() => setShowPicker(false)} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancel
                </button>
              </div>
            </>
          )}

          {pickerMode === 'promo' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {manualDiscounts.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: '8px 0' }}>No applicable promotions for current cart.</p>
              ) : manualDiscounts.map(d => (
                <button key={d.promotion_id} onClick={() => applyPromo(d)}
                  style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--divider)', background: 'var(--bg-base)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{d.promotion_name}</div>
                  <div style={{ fontSize: 11, color: '#7FB897' }}>−A${d.amount_off.toFixed(2)} · {d.description}</div>
                </button>
              ))}
              <button onClick={() => setShowPicker(false)} style={{ marginTop: 4, padding: '5px 0', borderRadius: 7, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
            </div>
          )}

          {pickerMode === 'code' && (
            <>
              <div style={{ display: 'flex', gap: 6 }}>
                <input autoFocus value={codeInput} onChange={e => setCodeInput(e.target.value.toUpperCase())}
                  placeholder="Enter coupon code"
                  onKeyDown={e => e.key === 'Enter' && applyCode()}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--divider)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none', textTransform: 'uppercase' as const }} />
              </div>
              {error && <p style={{ fontSize: 11, color: 'var(--destructive)', margin: 0 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={applyCode} disabled={loading || !codeInput.trim()} style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: loading || !codeInput.trim() ? 0.5 : 1 }}>
                  {loading ? '…' : 'Apply Code'}
                </button>
                <button onClick={() => { setShowPicker(false); setError('') }} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}