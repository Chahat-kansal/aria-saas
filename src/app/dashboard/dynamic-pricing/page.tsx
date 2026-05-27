'use client'
import { useState, useEffect, useCallback } from 'react'
import { AriaSays } from '@/components/dashboard/AriaSays'

interface Suggestion {
  id: string
  product_id: string
  current_price: number
  suggested_price: number
  reason: string
  expected_margin_gain: number
  status: 'pending' | 'applied' | 'rejected'
  created_at: string
  applied_at: string | null
  pos_products?: { name: string; stock_quantity: number | null } | null
}

const C = {
  bg: '#0d0d14', card: '#13131a', border: 'rgba(255,255,255,0.07)',
  text: '#e8ede7', muted: 'rgba(255,255,255,0.5)', dim: 'rgba(255,255,255,0.3)',
  green: '#7FB897', sage: '#2D5240', amber: '#F59E0B', red: '#EF4444',
}

export default function DynamicPricingPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [totalGain, setTotalGain] = useState(0)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [applyingAll, setApplyingAll] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetch('/api/aria/dynamic-pricing').then(r => r.json())
      setSuggestions(d.suggestions ?? [])
      setTotalGain(d.total_annual_gain_aud ?? 0)
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function generate() {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/aria/dynamic-pricing', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed')
      load()
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setGenerating(false)
  }

  async function action(id: string, act: 'approve' | 'reject') {
    await fetch('/api/aria/dynamic-pricing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: act }),
    })
    load()
  }

  async function applyAllSafe() {
    if (!confirm(`Apply ${pending.length} pending price changes? Each one will update the product price immediately.`)) return
    setApplyingAll(true)
    for (const s of pending) {
      try {
        await fetch('/api/aria/dynamic-pricing', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: s.id, action: 'approve' }),
        })
      } catch { /* continue */ }
    }
    setApplyingAll(false)
    load()
  }

  const pending = suggestions.filter(s => s.status === 'pending')
  const applied = suggestions.filter(s => s.status === 'applied').slice(0, 10)

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, color: C.text, fontFamily: 'Inter, sans-serif' }}>
      <AriaSays businessId={null} page="dynamic-pricing" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>Dynamic pricing</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0' }}>Margin-lifting price suggestions from competitor moves, demand, and slow movers. You approve every change.</p>
        </div>
        <button onClick={generate} disabled={generating}
          style={{ padding: '10px 18px', background: C.sage, color: C.green, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: generating ? 0.6 : 1 }}>
          {generating ? '✨ Analysing…' : '✨ Generate suggestions'}
        </button>
      </div>

      {/* Headline metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 10, padding: 14 }}>
          <p style={{ fontSize: 11, color: C.muted, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Annual gain if all applied</p>
          <p style={{ fontSize: 26, fontWeight: 700, color: C.green, margin: '6px 0 0', fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>A${totalGain.toFixed(0)}</p>
        </div>
        <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 10, padding: 14 }}>
          <p style={{ fontSize: 11, color: C.muted, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending suggestions</p>
          <p style={{ fontSize: 26, fontWeight: 700, margin: '6px 0 0', fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>{pending.length}</p>
        </div>
        <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 10, padding: 14 }}>
          <p style={{ fontSize: 11, color: C.muted, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recently applied</p>
          <p style={{ fontSize: 26, fontWeight: 700, color: C.text, margin: '6px 0 0', fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>{applied.length}</p>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: C.red, fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Pending list */}
      <section style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Pending suggestions ({pending.length})</h2>
          {pending.length >= 3 && (
            <button onClick={applyAllSafe} disabled={applyingAll}
              style={{ padding: '6px 12px', background: 'rgba(127,184,151,0.08)', color: C.green, border: '1px solid ' + C.green + '55', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: applyingAll ? 0.6 : 1 }}>
              {applyingAll ? 'Applying…' : `Apply all ${pending.length}`}
            </button>
          )}
        </div>
        {loading ? (
          <p style={{ color: C.muted }}>Loading…</p>
        ) : pending.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: C.muted, fontSize: 13 }}>
            <p style={{ margin: 0 }}>No pending suggestions. Hit Generate to analyse your catalogue.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map(s => {
              const delta = s.suggested_price - s.current_price
              const pct = s.current_price > 0 ? (delta / s.current_price) * 100 : 0
              const up = delta > 0
              return (
                <div key={s.id} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid ' + C.border, borderRadius: 10, display: 'grid', gridTemplateColumns: '2fr 1.5fr 2fr auto', gap: 14, alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{s.pos_products?.name ?? 'Product'}</p>
                    {s.pos_products?.stock_quantity != null && (
                      <p style={{ fontSize: 11, color: C.dim, margin: '2px 0 0' }}>{s.pos_products.stock_quantity} in stock</p>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, color: C.muted, textDecoration: 'line-through' }}>A${Number(s.current_price).toFixed(2)}</span>
                    <span style={{ color: C.dim }}>→</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: up ? C.green : C.amber }}>A${Number(s.suggested_price).toFixed(2)}</span>
                    <span style={{ fontSize: 11, color: up ? C.green : C.amber, fontWeight: 700 }}>{up ? '+' : ''}{pct.toFixed(1)}%</span>
                  </div>
                  <div>
                    <p style={{ fontSize: 12, color: C.text, margin: 0, lineHeight: 1.45 }}>{s.reason}</p>
                    <p style={{ fontSize: 11, color: C.green, margin: '4px 0 0', fontWeight: 700 }}>~A${Number(s.expected_margin_gain).toFixed(0)} / year</p>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => action(s.id, 'approve')} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid ' + C.green, background: 'rgba(127,184,151,0.1)', color: C.green, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Apply</button>
                    <button onClick={() => action(s.id, 'reject')} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer' }}>Reject</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {applied.length > 0 && (
        <section style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px' }}>Recently applied</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {applied.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(127,184,151,0.04)', borderRadius: 8, fontSize: 12 }}>
                <span style={{ color: C.text }}>{s.pos_products?.name ?? 'Product'}</span>
                <span style={{ color: C.muted }}>A${Number(s.current_price).toFixed(2)} → <span style={{ color: C.green, fontWeight: 700 }}>A${Number(s.suggested_price).toFixed(2)}</span></span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
