'use client'
import { useState, useEffect, useCallback } from 'react'
import { AriaSays } from '@/components/dashboard/AriaSays'

interface Bundle {
  id: string
  bundle_name: string
  bundle_pitch: string | null
  product_ids: string[]
  bundle_price: number
  individual_total: number
  total_cost: number | null
  margin_at_bundle: number | null
  status: 'pending' | 'active' | 'rejected' | 'archived'
  source: 'aria' | 'owner'
  times_sold: number
  created_at: string
}

interface ProductLookup { id: string; name: string }

const C = {
  bg: '#0d0d14', card: '#13131a', border: 'rgba(255,255,255,0.07)',
  text: '#e8ede7', muted: 'rgba(255,255,255,0.5)', dim: 'rgba(255,255,255,0.3)',
  green: '#7FB897', sage: '#2D5240', amber: '#F59E0B', red: '#EF4444', violet: '#A78BFA',
}

const STATUS_COLOR: Record<string, string> = {
  pending: C.amber, active: C.green, rejected: C.dim, archived: C.dim,
}

export default function BundlesPage() {
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [products, setProducts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [bRes, pRes] = await Promise.all([
        fetch('/api/aria/bundle-builder').then(r => r.json()),
        fetch('/api/pos/products').then(r => r.json()).catch(() => ({ products: [] })),
      ])
      setBundles(bRes.bundles ?? [])
      const map: Record<string, string> = {}
      for (const p of (pRes.products ?? []) as ProductLookup[]) map[p.id] = p.name
      setProducts(map)
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
      const res = await fetch('/api/aria/bundle-builder', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed')
      load()
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setGenerating(false)
  }

  async function action(id: string, act: 'approve' | 'reject' | 'archive') {
    await fetch('/api/aria/bundle-builder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: act }),
    })
    load()
  }

  function bundleProductNames(b: Bundle): string[] {
    const ids = Array.isArray(b.product_ids) ? b.product_ids : []
    return ids.map(id => products[id] ?? id.slice(0, 8))
  }

  const pending = bundles.filter(b => b.status === 'pending')
  const active = bundles.filter(b => b.status === 'active')

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, color: C.text, fontFamily: 'Inter, sans-serif' }}>
      <AriaSays businessId={null} page="bundles" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>AI bundle builder</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0' }}>Aria finds products that sell together and builds profitable bundles. You approve every one.</p>
        </div>
        <button onClick={generate} disabled={generating}
          style={{ padding: '10px 18px', background: C.sage, color: C.green, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: generating ? 0.6 : 1 }}>
          {generating ? '✨ Building…' : '✨ Generate bundles'}
        </button>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Active bundles', value: active.length, color: C.green },
          { label: 'Pending', value: pending.length, color: pending.length > 0 ? C.amber : C.dim },
          { label: 'Total sales', value: bundles.reduce((s, b) => s + b.times_sold, 0), color: C.text },
        ].map(m => (
          <div key={m.label} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 10, padding: 14 }}>
            <p style={{ fontSize: 11, color: C.muted, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: m.color, margin: '6px 0 0', fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>{m.value}</p>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: C.red, fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Pending */}
      <section style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px' }}>Pending approval ({pending.length})</h2>
        {loading ? (
          <p style={{ color: C.muted }}>Loading…</p>
        ) : pending.length === 0 ? (
          <p style={{ color: C.muted, fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No pending bundles. Hit Generate to analyse your basket data.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
            {pending.map(b => {
              const saving = Number(b.individual_total) - Number(b.bundle_price)
              const savingPct = b.individual_total > 0 ? (saving / Number(b.individual_total)) * 100 : 0
              const margin = b.margin_at_bundle != null ? Number(b.margin_at_bundle) * 100 : null
              return (
                <div key={b.id} style={{ padding: '16px 18px', background: 'rgba(127,184,151,0.04)', border: '1px solid ' + C.border, borderRadius: 12 }}>
                  <p style={{ fontSize: 11, color: b.source === 'aria' ? C.violet : C.muted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
                    {b.source === 'aria' ? '✦ Aria suggested' : 'Owner created'}
                  </p>
                  <h3 style={{ fontSize: 18, fontWeight: 700, margin: '4px 0 6px', fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>{b.bundle_name}</h3>
                  {b.bundle_pitch && <p style={{ fontSize: 12, color: C.muted, margin: '0 0 12px', lineHeight: 1.5 }}>{b.bundle_pitch}</p>}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {bundleProductNames(b).map((name, i) => (
                      <span key={i} style={{ padding: '3px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 12, fontSize: 12, color: C.text }}>{name}</span>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '10px 12px', background: 'rgba(0,0,0,0.25)', borderRadius: 8, marginBottom: 12 }}>
                    <div>
                      <p style={{ fontSize: 10, color: C.dim, margin: 0, textTransform: 'uppercase' }}>Individually</p>
                      <p style={{ fontSize: 13, color: C.muted, margin: '2px 0 0', textDecoration: 'line-through' }}>A${Number(b.individual_total).toFixed(2)}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 10, color: C.dim, margin: 0, textTransform: 'uppercase' }}>Bundle price</p>
                      <p style={{ fontSize: 15, color: C.green, fontWeight: 700, margin: '2px 0 0' }}>A${Number(b.bundle_price).toFixed(2)}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 10, color: C.dim, margin: 0, textTransform: 'uppercase' }}>Margin</p>
                      <p style={{ fontSize: 15, color: margin != null && margin > 30 ? C.green : C.amber, fontWeight: 700, margin: '2px 0 0' }}>{margin != null ? margin.toFixed(0) + '%' : '—'}</p>
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: C.muted, margin: '0 0 10px' }}>Customer sees: <strong style={{ color: C.green }}>{savingPct.toFixed(0)}% off</strong> (saves A${saving.toFixed(2)})</p>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => action(b.id, 'approve')} style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid ' + C.green, background: 'rgba(127,184,151,0.1)', color: C.green, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Approve</button>
                    <button onClick={() => action(b.id, 'reject')} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer' }}>Reject</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Active */}
      {active.length > 0 && (
        <section style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px' }}>Active bundles ({active.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {active.map(b => (
              <div key={b.id} style={{ padding: '12px 16px', background: 'rgba(127,184,151,0.04)', border: '1px solid ' + C.border, borderRadius: 10, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 14, alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, margin: 0, fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>{b.bundle_name}</p>
                  <p style={{ fontSize: 11, color: C.dim, margin: '2px 0 0' }}>{bundleProductNames(b).join(' · ')}</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>Price</p>
                  <p style={{ fontSize: 14, color: C.green, fontWeight: 700, margin: '2px 0 0' }}>A${Number(b.bundle_price).toFixed(2)}</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>Times sold</p>
                  <p style={{ fontSize: 14, color: C.text, margin: '2px 0 0' }}>{b.times_sold}</p>
                </div>
                <button onClick={() => action(b.id, 'archive')} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, fontSize: 11, cursor: 'pointer' }}>Archive</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
