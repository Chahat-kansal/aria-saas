'use client'
import { useState, useEffect, useCallback } from 'react'

// INV-COST-1 — rich inventory-value surface (Stripe/Linear-grade). Hero (cost⇄retail + margin +
// completeness) · ranked breakdown with provenance · cost-source legend · missing-cost callout with
// inline add-cost. All four states (loading / error / empty / populated). Canonical data only — values
// from items_on_hand × resolved cost; unknown-cost products are flagged, never counted as $0.

type Source = 'outlet' | 'last_delivery' | 'catalogue' | 'unknown'
interface Row { id: string; name: string; units: number; unit_cost: number | null; cost_source: Source; value_at_cost: number | null; price: number; value_at_retail: number; margin_pct: number | null }
interface Valuation { at_cost: number; at_retail: number; products_total: number; products_valued: number; products_unknown_cost: number; units_on_hand: number; margin_pct: number | null; margin_incomplete: boolean; products: Row[] }
interface Missing { id: string; name: string; price: number }
interface Payload { stock_value: Valuation; missing_costs: Missing[] }

// Dashboard tokens + INV-COST accents.
const C = {
  forest: '#2D5240', green: '#7FB897', gold: '#C9A37A', amber: '#BA7517', red: '#E24B4A',
  surface: 'rgba(255,255,255,0.03)', surface2: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.08)',
  text: '#E8EDE7', dim: 'rgba(255,255,255,0.45)', muted: 'rgba(255,255,255,0.25)',
}
const DISPLAY = "'Cormorant', Georgia, serif"
const money = (n: number) => `A$${(Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const SOURCE_META: Record<Source, { label: string; color: string }> = {
  outlet: { label: 'Outlet', color: C.green },
  last_delivery: { label: 'Last delivery', color: C.gold },
  catalogue: { label: 'Catalogue', color: '#A78BFA' },
  unknown: { label: 'No cost', color: C.amber },
}

function Chip({ source }: { source: Source }) {
  const m = SOURCE_META[source]
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: m.color, background: m.color + '1a', border: `1px solid ${m.color}40`, whiteSpace: 'nowrap' }}>{m.label}</span>
}

export default function InventoryValuePanel() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [mode, setMode] = useState<'cost' | 'retail'>('cost')
  const [sort, setSort] = useState<'value' | 'margin'>('value')
  const [costInputs, setCostInputs] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      const r = await fetch('/api/pos/inventory/cost')
      if (!r.ok) throw new Error('failed')
      setData(await r.json())
    } catch { setError(true) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  async function saveCost(productId: string) {
    const val = Number(costInputs[productId])
    if (!(val > 0)) return
    setSavingId(productId)
    try {
      await fetch('/api/pos/inventory/cost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: productId, cost_price: val }) })
      await load()
      setCostInputs(s => { const n = { ...s }; delete n[productId]; return n })
    } finally { setSavingId(null) }
  }

  // ── LOADING (skeleton rows, not a spinner) ──
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ height: 132, borderRadius: 16, background: C.surface, border: '1px solid ' + C.border }} />
        <div style={{ borderRadius: 12, border: '1px solid ' + C.border, overflow: 'hidden' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ height: 46, borderTop: i ? '1px solid ' + C.border : 'none', background: i % 2 ? C.surface : 'transparent', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12 }}>
              <div style={{ height: 12, width: '34%', borderRadius: 6, background: C.surface2 }} />
              <div style={{ height: 12, width: 70, borderRadius: 6, background: C.surface2, marginLeft: 'auto' }} />
              <div style={{ height: 12, width: 56, borderRadius: 6, background: C.surface2 }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── ERROR (retry) ──
  if (error) {
    return (
      <div style={{ padding: 32, borderRadius: 16, background: C.surface, border: `1px solid ${C.red}40`, textAlign: 'center' }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>Couldn&apos;t load inventory value</p>
        <p style={{ fontSize: 13, color: C.dim, marginBottom: 16 }}>Something went wrong fetching your stock valuation.</p>
        <button onClick={load} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: C.green, color: '#0E1812', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Try again</button>
      </div>
    )
  }

  const sv = data?.stock_value
  const missing = data?.missing_costs ?? []
  const total = sv?.products_total ?? 0
  const costed = sv?.products_valued ?? 0
  const pct = total > 0 ? Math.round((costed / total) * 100) : 0

  // ── EMPTY (no products costed → guided first-costs, not blank) ──
  if (!sv || total === 0) {
    return (
      <div style={{ padding: 40, borderRadius: 16, background: C.surface, border: '1px solid ' + C.border, textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>📦</div>
        <p style={{ fontSize: 22, fontFamily: DISPLAY, fontStyle: 'italic', color: C.text, marginBottom: 6 }}>Value your stock</p>
        <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.6, marginBottom: 18 }}>
          Once your products carry a unit cost and on-hand stock, you&apos;ll see total value at cost vs retail, blended margin, and per-product breakdowns here. {missing.length > 0 ? `${missing.length} product${missing.length === 1 ? '' : 's'} need a cost to begin.` : 'Add costs on your products or receive stock to begin.'}
        </p>
        {missing.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
            {missing.slice(0, 8).map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: C.surface2, border: '1px solid ' + C.border }}>
                <span style={{ flex: 1, fontSize: 13, color: C.text }}>{m.name}</span>
                <span style={{ fontSize: 11, color: C.dim }}>sells {money(m.price)}</span>
                <input inputMode="decimal" placeholder="unit cost" value={costInputs[m.id] ?? ''} onChange={e => setCostInputs(s => ({ ...s, [m.id]: e.target.value }))}
                  style={{ width: 96, padding: '6px 9px', borderRadius: 7, background: '#16201B', border: '1px solid ' + C.border, color: C.text, fontSize: 12, fontFamily: 'inherit' }} />
                <button onClick={() => saveCost(m.id)} disabled={savingId === m.id || !(Number(costInputs[m.id]) > 0)}
                  style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: C.green, color: '#0E1812', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: Number(costInputs[m.id]) > 0 ? 1 : 0.5 }}>{savingId === m.id ? '…' : 'Add'}</button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── POPULATED ──
  const heroValue = mode === 'cost' ? sv.at_cost : sv.at_retail
  const rows = [...sv.products].sort((a, b) => sort === 'margin'
    ? (b.margin_pct ?? -1) - (a.margin_pct ?? -1)
    : ((mode === 'cost' ? (b.value_at_cost ?? -1) - (a.value_at_cost ?? -1) : b.value_at_retail - a.value_at_retail)))
  const topRows = rows.slice(0, 20)
  const maxVal = Math.max(1, ...topRows.map(r => (mode === 'cost' ? (r.value_at_cost ?? 0) : r.value_at_retail)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* HERO */}
      <div style={{ padding: 22, borderRadius: 16, background: `linear-gradient(135deg, ${C.forest}38, ${C.surface})`, border: '1px solid ' + C.border }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Inventory value · at {mode}</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 46, lineHeight: 1, fontFamily: DISPLAY, fontStyle: 'italic', fontWeight: 600, color: mode === 'cost' ? C.gold : C.green }}>{money(heroValue)}</span>
              {sv.margin_pct != null && (
                <span style={{ fontSize: 13, fontWeight: 700, padding: '4px 10px', borderRadius: 999, color: C.green, background: C.green + '1a', border: `1px solid ${C.green}40` }}>{sv.margin_pct}% margin</span>
              )}
            </div>
            <p style={{ fontSize: 12, color: C.dim, marginTop: 8 }}>
              {money(sv.at_cost)} cost · {money(sv.at_retail)} retail · {sv.units_on_hand.toLocaleString('en-AU')} units on hand
            </p>
          </div>
          {/* cost ⇄ retail toggle */}
          <div style={{ display: 'flex', background: '#16201B', borderRadius: 10, padding: 3, border: '1px solid ' + C.border }}>
            {(['cost', 'retail'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                style={{ padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, textTransform: 'capitalize', fontFamily: 'inherit', background: mode === m ? C.green : 'transparent', color: mode === m ? '#0E1812' : C.dim }}>{m}</button>
            ))}
          </div>
        </div>

        {/* completeness meter */}
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: pct < 100 ? C.amber : C.green, fontWeight: 600 }}>{costed} of {total} products costed</span>
            <span style={{ fontSize: 12, color: C.dim }}>{pct}% complete{sv.margin_incomplete ? ' · value incomplete' : ''}</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: '#16201B', overflow: 'hidden', border: '1px solid ' + C.border }}>
            <div style={{ height: '100%', width: `${pct}%`, background: pct < 100 ? C.amber : C.green, transition: 'width 300ms' }} />
          </div>
        </div>
      </div>

      {/* MISSING-COST CALLOUT (real action, not a dead empty-state) */}
      {missing.length > 0 && (
        <div style={{ padding: 16, borderRadius: 14, background: C.amber + '12', border: `1px solid ${C.amber}40` }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.amber, marginBottom: 2 }}>⚠ {missing.length} product{missing.length === 1 ? '' : 's'} need a cost</p>
          <p style={{ fontSize: 12, color: C.dim, marginBottom: 12 }}>These are excluded from your value-at-cost and margin until you add a unit cost. Add one to complete the picture.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {missing.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: C.surface2, border: '1px solid ' + C.border }}>
                <span style={{ flex: 1, fontSize: 13, color: C.text }}>{m.name}</span>
                <span style={{ fontSize: 11, color: C.dim }}>sells {money(m.price)}</span>
                <input inputMode="decimal" placeholder="unit cost" value={costInputs[m.id] ?? ''} onChange={e => setCostInputs(s => ({ ...s, [m.id]: e.target.value }))}
                  style={{ width: 96, padding: '6px 9px', borderRadius: 7, background: '#16201B', border: '1px solid ' + C.border, color: C.text, fontSize: 12, fontFamily: 'inherit' }} />
                <button onClick={() => saveCost(m.id)} disabled={savingId === m.id || !(Number(costInputs[m.id]) > 0)}
                  style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: C.green, color: '#0E1812', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: Number(costInputs[m.id]) > 0 ? 1 : 0.5 }}>{savingId === m.id ? '…' : 'Add'}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BREAKDOWN */}
      <div style={{ borderRadius: 14, border: '1px solid ' + C.border, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: C.surface }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Top products by value</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['value', 'margin'] as const).map(s => (
              <button key={s} onClick={() => setSort(s)}
                style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 7, border: '1px solid ' + C.border, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize', background: sort === s ? C.green : 'transparent', color: sort === s ? '#0E1812' : C.dim }}>{s}</button>
            ))}
          </div>
        </div>
        <div>
          {topRows.map((r, i) => {
            const shown = mode === 'cost' ? r.value_at_cost : r.value_at_retail
            const barPct = Math.round(((Number(shown) || 0) / maxVal) * 100)
            return (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) 0.9fr 0.8fr 0.7fr', gap: 10, alignItems: 'center', padding: '10px 16px', borderTop: '1px solid ' + C.border, background: i % 2 ? C.surface : 'transparent' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                    <Chip source={r.cost_source} />
                  </div>
                  <div style={{ height: 4, marginTop: 6, borderRadius: 999, background: '#16201B', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${barPct}%`, background: r.cost_source === 'unknown' ? C.amber : C.green }} />
                  </div>
                </div>
                <div style={{ fontSize: 12, color: C.dim, textAlign: 'right' }}>
                  {r.units} × {r.unit_cost != null ? money(r.unit_cost) : <span style={{ color: C.amber }}>no cost</span>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: mode === 'cost' ? C.gold : C.green, textAlign: 'right' }}>
                  {shown != null ? money(shown) : '—'}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, textAlign: 'right', color: r.margin_pct == null ? C.amber : r.margin_pct < 0 ? C.red : C.green }}>
                  {r.margin_pct == null ? '—' : `${r.margin_pct}%`}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* COST-SOURCE LEGEND */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, padding: '12px 16px', borderRadius: 12, background: C.surface, border: '1px solid ' + C.border }}>
        <span style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cost source</span>
        {(['outlet', 'last_delivery', 'catalogue', 'unknown'] as Source[]).map(s => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Chip source={s} />
            <span style={{ fontSize: 11, color: C.dim }}>
              {s === 'outlet' ? 'per-outlet actual' : s === 'last_delivery' ? 'last receipt' : s === 'catalogue' ? 'product catalogue' : 'no cost yet'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
