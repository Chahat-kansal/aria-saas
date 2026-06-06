'use client'
import { useState, useCallback } from 'react'

interface Product { id: string; name: string; price: number | null }
interface Schedule { id: string; product_id: string; new_price: number; effective_date: string; ends_at: string | null; label: string | null; status: string; pos_products: { name: string } | null }
interface Business { id: string; name: string | null; trading_name: string | null }
interface Suggestion { product_name: string; promo_price: number; starts: string; ends: string; label: string; rationale: string }
interface Props { business: Business; products: Product[]; activeSchedules: Schedule[] }

const G = '#7FB897'
const BG = '#0d0d14'
const PANEL = '#13131a'
const BORDER = 'rgba(255,255,255,0.07)'
const inp: React.CSSProperties = { background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}`, borderRadius: 6, color: '#e5e7eb', fontSize: 11, padding: '4px 8px', width: '100%', boxSizing: 'border-box' }
const lbl: React.CSSProperties = { fontSize: 10, color: '#6b7280', display: 'block', marginBottom: 3 }
const sec: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8, marginTop: 14 }

export default function TimedPricesApp({ business, products, activeSchedules: initSched }: Props) {
  const [schedules, setSchedules] = useState(initSched)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [suggLoading, setSuggLoading] = useState(false)
  const [selProd, setSelProd] = useState('')
  const [promoPrice, setPromoPrice] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [schedLabel, setSchedLabel] = useState('')
  const [printToo, setPrintToo] = useState(false)
  const [schedErr, setSchedErr] = useState('')
  const [schedSaving, setSchedSaving] = useState(false)

  async function fetchSuggestions() {
    setSuggLoading(true)
    try {
      const r = await fetch('/api/tickets/price-schedules?suggest=1').then(r => r.json())
      setSuggestions(r.suggestions ?? [])
      setSchedules(r.schedules ?? schedules)
    } catch (e) { console.error('[non-fatal]', e) }
    setSuggLoading(false)
  }

  const applySuggestion = useCallback((s: Suggestion) => {
    const prod = products.find(p => p.name === s.product_name)
    setSelProd(prod?.id ?? '')
    setPromoPrice(String(s.promo_price))
    setStartsAt(s.starts)
    setEndsAt(s.ends)
    setSchedLabel(s.label)
  }, [products])

  async function schedulePrice() {
    if (!selProd || !promoPrice || !startsAt) { setSchedErr('Product, promo price and start date required'); return }
    setSchedSaving(true); setSchedErr('')
    try {
      const r = await fetch('/api/tickets/price-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: selProd, new_price: Number(promoPrice), effective_date: startsAt, ends_at: endsAt || null, label: schedLabel || null, print_ticket: printToo }),
      }).then(r => r.json())
      if (r.error) { setSchedErr(r.error); return }
      setSchedules(p => [r.schedule, ...p])
      setSelProd(''); setPromoPrice(''); setStartsAt(''); setEndsAt(''); setSchedLabel(''); setPrintToo(false)
    } catch (e) {
      setSchedErr((e as Error).message)
    } finally { setSchedSaving(false) }
  }

  async function cancelSched(id: string) {
    await fetch(`/api/tickets/price-schedules/${id}`, { method: 'DELETE' })
    setSchedules(p => p.filter(s => s.id !== id))
  }

  const selProdData = products.find(p => p.id === selProd)

  return (
    <div style={{ background: BG, color: '#e5e7eb', minHeight: '100vh', fontFamily: 'Inter,system-ui,sans-serif', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ background: PANEL, borderBottom: `1px solid ${BORDER}`, padding: '10px 20px', flexShrink: 0 }}>
        <h1 style={{ fontFamily: 'Georgia,serif', fontStyle: 'italic', color: '#fff', fontSize: 17, margin: 0 }}>Timed Prices</h1>
        <p style={{ fontSize: 10, color: '#6b7280', margin: 0 }}>Schedule a promo price — auto-reverts when it ends</p>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left — AI suggestions + form */}
        <div style={{ width: 320, flexShrink: 0, borderRight: `1px solid ${BORDER}`, padding: 16, overflowY: 'auto', background: PANEL }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <p style={{ ...sec, margin: 0 }}>Aria suggestions</p>
            <button onClick={fetchSuggestions} disabled={suggLoading}
              style={{ padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: G, color: '#070d09', fontSize: 10, fontWeight: 600 }}>
              {suggLoading ? '…' : 'Get ideas'}
            </button>
          </div>

          {suggestions.length === 0 && (
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 14 }}>
              Tap "Get ideas" and Aria will suggest 3 promo prices based on your products and sales data.
            </p>
          )}

          {suggestions.map((s, i) => (
            <div key={i} onClick={() => applySuggestion(s)}
              style={{ padding: '10px 12px', borderRadius: 10, marginBottom: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`, cursor: 'pointer' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>
                {s.product_name} → <span style={{ color: G }}>${(Number(s.promo_price) || 0).toFixed(2)}</span>
              </div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>{s.label} · {s.rationale}</div>
            </div>
          ))}

          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14, marginTop: 4 }}>
            <p style={{ ...sec, marginTop: 0 }}>Schedule a price</p>

            <label style={lbl}>Product</label>
            <select value={selProd} onChange={e => setSelProd(e.target.value)} style={{ ...inp, marginBottom: 6 }}>
              <option value="">Select product…</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} — ${(Number(p.price) || 0).toFixed(2)}</option>)}
            </select>

            {selProdData && (
              <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>
                Current price: <span style={{ color: '#fff' }}>${(Number(selProdData.price) || 0).toFixed(2)}</span>
              </p>
            )}

            <label style={lbl}>Promo price ($)</label>
            <input type="number" step="0.01" value={promoPrice} onChange={e => setPromoPrice(e.target.value)} placeholder="e.g. 29.99" style={{ ...inp, marginBottom: 6 }} />

            <label style={lbl}>Label (e.g. Weekend sale)</label>
            <input value={schedLabel} onChange={e => setSchedLabel(e.target.value)} placeholder="Optional label" style={{ ...inp, marginBottom: 6 }} />

            <label style={lbl}>Starts</label>
            <input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} style={{ ...inp, marginBottom: 6 }} />

            <label style={lbl}>Ends (optional — auto-reverts)</label>
            <input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} style={{ ...inp, marginBottom: 10 }} />

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
              <input type="checkbox" checked={printToo} onChange={e => setPrintToo(e.target.checked)} />
              Also queue a shelf ticket for this product
            </label>

            {schedErr && <p style={{ fontSize: 11, color: '#ef4444', marginBottom: 8 }}>{schedErr}</p>}

            <button onClick={schedulePrice} disabled={schedSaving}
              style={{ width: '100%', padding: '8px', borderRadius: 8, border: 'none', cursor: schedSaving ? 'not-allowed' : 'pointer', background: G, color: '#070d09', fontSize: 12, fontWeight: 600 }}>
              {schedSaving ? 'Scheduling…' : 'Schedule · auto-reverts'}
            </button>
          </div>
        </div>

        {/* Right — active schedules */}
        <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 14 }}>Active & upcoming</p>

          {schedules.length === 0 ? (
            <div style={{ padding: '32px 24px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: `1px solid ${BORDER}`, textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>No active schedules</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>Schedule your first promo price on the left.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {schedules.map(s => (
                <div key={s.id} style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                      {(s.pos_products as { name: string } | null)?.name ?? s.product_id}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>
                      <span style={{ color: G, fontWeight: 600 }}>${(Number(s.new_price) || 0).toFixed(2)}</span>
                      {s.label ? ` · ${s.label}` : ''}
                      {' · from '}{new Date(s.effective_date).toLocaleDateString('en-AU')}
                      {s.ends_at ? ` → ${new Date(s.ends_at).toLocaleDateString('en-AU')}` : ' (no end)'}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, fontWeight: 600, background: s.status === 'active' ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.1)', color: s.status === 'active' ? '#4ade80' : '#fbbf24' }}>
                    {s.status}
                  </span>
                  <button onClick={() => cancelSched(s.id)}
                    style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer', background: 'rgba(239,68,68,0.07)', color: '#f87171', fontSize: 11 }}>
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
