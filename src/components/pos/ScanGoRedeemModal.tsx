'use client'
import { useState } from 'react'

export interface ScanGoItem { product_id: string; name: string; price_cents: number; qty: number; age_restricted: boolean }
const money = (c: number) => '$' + (c / 100).toFixed(2)

// Cashier-side redeem of a customer scan-and-go cart. Enforces an ID check before
// the items can be added when any item is age-restricted (AU liquor licensing law).
export function ScanGoRedeemModal({ open, onClose, onRedeemed }: {
  open: boolean
  onClose: () => void
  onRedeemed: (r: { token: string; items: ScanGoItem[]; idConfirmed: boolean }) => Promise<void> | void
}) {
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [items, setItems] = useState<ScanGoItem[] | null>(null)
  const [needsId, setNeedsId] = useState(false)
  const [idConfirmed, setIdConfirmed] = useState(false)
  const [adding, setAdding] = useState(false)

  if (!open) return null

  function reset() { setToken(''); setItems(null); setError(''); setNeedsId(false); setIdConfirmed(false) }
  function close() { reset(); onClose() }

  async function redeem() {
    if (!token.trim()) return
    setLoading(true); setError(''); setItems(null)
    try {
      const res = await fetch('/api/pos/scan-and-go/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token.trim() }) })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Could not load cart'); setLoading(false); return }
      setItems(d.items ?? [])
      setNeedsId(!!d.requires_id_check)
    } catch { setError('Network error') }
    setLoading(false)
  }

  async function addToSale() {
    if (!items) return
    if (needsId && !idConfirmed) return
    setAdding(true)
    await onRedeemed({ token: token.trim().toUpperCase(), items, idConfirmed })
    setAdding(false)
    close()
  }

  const subtotal = (items ?? []).reduce((n, i) => n + i.price_cents * i.qty, 0)

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, background: '#fff', borderRadius: 16, padding: 22, fontFamily: 'system-ui, sans-serif', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, flex: 1, color: '#111' }}>Scan customer cart</h2>
          <button onClick={close} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#666' }}>×</button>
        </div>

        {!items ? (
          <>
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 12px' }}>Scan the customer&apos;s cart QR, or type the code shown on their phone.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={token} onChange={e => setToken(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && redeem()} placeholder="Cart code (e.g. 7K2Q9XF4)" autoFocus
                style={{ flex: 1, padding: '11px 12px', borderRadius: 10, border: '1.5px solid #111', fontSize: 16, letterSpacing: '0.1em', textTransform: 'uppercase' }} />
              <button onClick={redeem} disabled={loading || !token.trim()} style={{ padding: '0 18px', borderRadius: 10, border: 'none', background: '#111', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{loading ? '…' : 'Load'}</button>
            </div>
            {error && <p style={{ color: '#d11', fontSize: 13, marginTop: 10 }}>{error}</p>}
          </>
        ) : (
          <>
            {needsId && (
              <div style={{ background: idConfirmed ? '#ecfdf5' : '#fef2f2', border: `2px solid ${idConfirmed ? '#10b981' : '#ef4444'}`, borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                {idConfirmed ? (
                  <div style={{ color: '#065f46', fontWeight: 700, fontSize: 14 }}>✓ ID confirmed</div>
                ) : (
                  <>
                    <div style={{ color: '#991b1b', fontWeight: 800, fontSize: 14, marginBottom: 6 }}>⚠ ID CHECK REQUIRED — verify customer is 18+</div>
                    <button onClick={() => setIdConfirmed(true)} style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>ID confirmed</button>
                  </>
                )}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {items.map((it, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#111', padding: '6px 0', borderBottom: '1px solid #eee' }}>
                  <span>{it.qty}× {it.name} {it.age_restricted && <span style={{ color: '#ef4444', fontSize: 11, fontWeight: 700 }}>18+</span>}</span>
                  <span style={{ fontWeight: 600 }}>{money(it.price_cents * it.qty)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, marginTop: 6, color: '#111' }}>
                <span>Total</span><span>{money(subtotal)}</span>
              </div>
            </div>
            <button onClick={addToSale} disabled={adding || (needsId && !idConfirmed)} style={{ width: '100%', height: 48, borderRadius: 12, border: 'none', background: needsId && !idConfirmed ? '#ccc' : '#111', color: '#fff', fontSize: 16, fontWeight: 800, cursor: needsId && !idConfirmed ? 'default' : 'pointer' }}>
              {adding ? 'Adding…' : needsId && !idConfirmed ? 'Confirm ID to continue' : 'Add to sale'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
