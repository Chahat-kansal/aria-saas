'use client'
import { useState, useEffect, useCallback } from 'react'

// INV-PAR-1 — the reorder surface (Linear/Stripe density, matching the staff-app "Aria suggests" +
// reorder look). SETTINGS (lead time / buffer / review cycle, owner-tunable + recompute) · BELOW-REORDER
// list ranked by days-of-cover urgency (the replenishment engine made real) · PAR TABLE (editable
// overrides) · days-of-cover as the hero per item. All four states. Real data only — par derived from
// real velocity; nothing fabricated.

type Abc = 'A' | 'B' | 'C' | 'dead'
interface Row { product_id: string; name: string; units_per_day: number; abc_tier: Abc; reorder_point: number; target_stock: number; reorder_qty: number; on_hand: number; days_of_cover: number | null; below_reorder: boolean; suggested_qty: number; review: boolean; no_history?: boolean; cover_confidence?: 'ok' | 'low' | 'none'; confidence_note?: string | null }
interface Settings { lead_time_days: number; buffer_weeks: number; review_cycle_days: number; default_reorder_qty: number; min_velocity_per_day: number }
interface Data { settings: Settings; rows: Row[]; below_count: number; reviewed_count: number }

const C = {
  sage: '#7FB897', green: '#2D5240', gold: '#C9A37A', amber: '#BA7517', red: '#E24B4A', blue: '#6E8FB8',
  surface: 'rgba(255,255,255,0.03)', surface2: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.08)',
  text: '#E8EDE7', dim: 'rgba(255,255,255,0.45)',
}
const DISPLAY = "'Cormorant', Georgia, serif"
const ABC_COLOR: Record<Abc, string> = { A: C.sage, B: C.blue, C: C.gold, dead: C.red }
const coverColor = (d: number | null) => d == null ? C.dim : d < 2 ? C.red : d < 5 ? C.amber : C.sage

function Chip({ tier }: { tier: Abc }) {
  return <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 999, color: ABC_COLOR[tier], background: ABC_COLOR[tier] + '1a', border: `1px solid ${ABC_COLOR[tier]}40` }}>{tier === 'dead' ? 'Dead' : tier}</span>
}

export default function InventoryReorderPanel() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<Settings | null>(null)
  const [sort, setSort] = useState<'cover' | 'velocity' | 'tier'>('cover')
  const [edits, setEdits] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      const r = await fetch('/api/pos/inventory/reorder')
      if (!r.ok) throw new Error('failed')
      const d = await r.json(); setData(d); setDraft(d.settings)
    } catch { setError(true) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  async function saveSettings() {
    if (!draft) return
    setBusy(true)
    const r = await fetch('/api/pos/inventory/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'settings', ...draft }) }).then(r => r.json()).catch(() => null)
    if (r?.rows) { setData(r); setDraft(r.settings) }
    setBusy(false)
  }
  async function recompute() {
    setBusy(true)
    const r = await fetch('/api/pos/inventory/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'recompute' }) }).then(r => r.json()).catch(() => null)
    if (r?.rows) setData(r)
    setBusy(false)
  }
  async function saveOverride(id: string, field: 'reorder_point' | 'target_stock' | 'reorder_qty') {
    const v = Number(edits[id + field])
    if (!(v >= 0)) return
    await fetch('/api/pos/inventory/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'override', product_id: id, [field]: v }) })
    setEdits(s => { const n = { ...s }; delete n[id + field]; return n })
    await load()
  }

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ height: 64, borderRadius: 12, background: C.surface, border: '1px solid ' + C.border }} />
      <div style={{ borderRadius: 12, border: '1px solid ' + C.border, overflow: 'hidden' }}>
        {[...Array(6)].map((_, i) => <div key={i} style={{ height: 52, borderTop: i ? '1px solid ' + C.border : 'none', background: i % 2 ? C.surface : 'transparent', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12 }}><div style={{ height: 12, width: '36%', borderRadius: 6, background: C.surface2 }} /><div style={{ height: 12, width: 60, borderRadius: 6, background: C.surface2, marginLeft: 'auto' }} /></div>)}
      </div>
    </div>
  )

  if (error) return (
    <div style={{ padding: 32, borderRadius: 16, background: C.surface, border: `1px solid ${C.red}40`, textAlign: 'center' }}>
      <p style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>Couldn&apos;t load reorder data</p>
      <button onClick={load} style={{ marginTop: 12, padding: '9px 20px', borderRadius: 9, border: 'none', background: C.sage, color: '#0E1812', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Try again</button>
    </div>
  )

  if (!data || data.rows.length === 0) return (
    <div style={{ padding: 40, borderRadius: 16, background: C.surface, border: '1px solid ' + C.border, textAlign: 'center', maxWidth: 540, margin: '0 auto' }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>🛒</div>
      <p style={{ fontSize: 22, fontFamily: DISPLAY, fontStyle: 'italic', color: C.text, marginBottom: 6 }}>Set your reorder rules</p>
      <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.6 }}>Once products have sales velocity, Aria auto-calculates a reorder point and target for each — and tells you what to order before you run out. Make a few sales, then recompute.</p>
      <button onClick={recompute} disabled={busy} style={{ marginTop: 16, padding: '10px 22px', borderRadius: 10, border: 'none', background: C.green, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{busy ? 'Computing…' : 'Compute reorder levels'}</button>
    </div>
  )

  const below = data.rows.filter(r => r.below_reorder)
  // MS9 PHASE 6 — "nothing to order" and "we can't tell" are different facts. A product counts as
  // forecastable only with real history AND a nonzero velocity; when NONE qualifies, saying
  // "everything is above its reorder point" would be a false all-clear built on an absence of data.
  const forecastable = data.rows.filter(r => !r.no_history && r.units_per_day > 0).length
  const neverSold = data.rows.filter(r => r.no_history).length
  const parRows = [...data.rows].sort((a, b) =>
    sort === 'velocity' ? b.units_per_day - a.units_per_day
    : sort === 'tier' ? (['A', 'B', 'C', 'dead'].indexOf(a.abc_tier) - ['A', 'B', 'C', 'dead'].indexOf(b.abc_tier))
    : (a.days_of_cover ?? 1e9) - (b.days_of_cover ?? 1e9))
  const numInput = { width: 60, padding: '5px 7px', borderRadius: 7, background: '#16201B', border: '1px solid ' + C.border, color: C.text, fontSize: 12, fontFamily: 'inherit' } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* SETTINGS */}
      <div style={{ padding: 14, borderRadius: 14, background: `linear-gradient(135deg, rgba(45,82,64,0.25), ${C.surface})`, border: '1px solid ' + C.border }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Reorder rules</p>
          <button onClick={recompute} disabled={busy} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.sage, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{busy ? '…' : '↻ Recompute'}</button>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {([['lead_time_days', 'Lead time (days)'], ['buffer_weeks', 'Safety buffer (weeks)'], ['review_cycle_days', 'Review cycle (days)'], ['default_reorder_qty', 'MOQ / pack']] as const).map(([k, label]) => (
            <div key={k}>
              <label style={{ fontSize: 10, color: C.dim, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
              <input type="number" min={0} step={k === 'buffer_weeks' ? 0.5 : 1} value={draft?.[k] ?? 0} onChange={e => setDraft(d => d ? { ...d, [k]: Number(e.target.value) } : d)} style={{ ...numInput, width: 80 }} />
            </div>
          ))}
          <button onClick={saveSettings} disabled={busy} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.green, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{busy ? 'Saving…' : 'Save & recompute'}</button>
        </div>
      </div>

      {/* BELOW-REORDER LIST (the "Aria suggests" replenishment engine, real) */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 2px 10px' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Aria suggests — replenish</p>
          <span style={{ fontSize: 12, color: below.length ? C.amber : C.dim }}>{below.length} below reorder point{data.reviewed_count ? ` · ${data.reviewed_count} to review` : ''}</span>
        </div>
        {below.length === 0 && forecastable === 0 ? (
          /* MS9 PHASE 6 — the honest empty state. Not a blank panel, not a fabricated all-clear:
             what is missing, why it matters, and what fills it. */
          <div style={{ padding: 24, borderRadius: 12, background: C.surface, border: '1px solid ' + C.border, textAlign: 'center' }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>Not enough sales history to forecast yet</p>
            <p style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.6, maxWidth: 480, margin: '0 auto' }}>
              Days-of-cover and reorder suggestions are computed from your completed sales, and right now
              {neverSold > 0 ? ` ${neverSold} product${neverSold === 1 ? ' has' : 's have'} never sold and the rest have` : ' your products have'} too little
              recent history to forecast honestly. Nothing is broken — sell through the till and this
              panel fills itself. A stocktake also helps: it confirms what&apos;s actually on hand, so the
              first forecasts start from a number someone counted.
            </p>
          </div>
        ) : below.length === 0 ? (
          <div style={{ padding: 20, borderRadius: 12, background: C.surface, border: '1px solid ' + C.border, fontSize: 13, color: C.dim, textAlign: 'center' }}>✓ Everything is above its reorder point — nothing to order right now.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {below.map(r => (
              <div key={r.product_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: C.surface, border: '1px solid ' + C.border, borderLeft: `3px solid ${coverColor(r.days_of_cover)}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{r.name}</span><Chip tier={r.abc_tier} />
                  </div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{r.on_hand} on hand · {r.units_per_day}/day · reorder at {r.reorder_point}</div>
                </div>
                <div style={{ textAlign: 'right', maxWidth: 190 }}>
                  {/* MS9 PHASE 5 — a cover date from thin evidence SAYS SO instead of standing
                      there looking precise. 'low' = under 14 days observed (two weekly cycles) or
                      under 5 sales in the window. */}
                  <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 22, fontWeight: 600, color: coverColor(r.days_of_cover), lineHeight: 1 }}>{r.days_of_cover != null ? `~${r.days_of_cover}` : '—'}<span style={{ fontSize: 10, fontStyle: 'normal', color: C.dim }}> days</span></div>
                  <div style={{ fontSize: 10, color: C.dim }}>of cover left</div>
                  {r.cover_confidence === 'low' && r.confidence_note && (
                    <div style={{ fontSize: 9.5, color: C.amber, marginTop: 3, lineHeight: 1.3 }}>{r.confidence_note}</div>
                  )}
                </div>
                <button style={{ padding: '8px 12px', borderRadius: 9, border: 'none', background: C.green, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Order {r.suggested_qty}</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PAR TABLE (editable) */}
      <div style={{ borderRadius: 14, border: '1px solid ' + C.border, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: C.surface }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Par levels — {data.rows.length} products</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['cover', 'velocity', 'tier'] as const).map(s => <button key={s} onClick={() => setSort(s)} style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 7, border: '1px solid ' + C.border, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize', background: sort === s ? C.sage : 'transparent', color: sort === s ? '#0E1812' : C.dim }}>{s}</button>)}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) 0.7fr 0.6fr 0.8fr 0.8fr 0.8fr', gap: 8, padding: '8px 16px', background: C.surface2, fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          <span>Product</span><span style={{ textAlign: 'right' }}>/day</span><span style={{ textAlign: 'right' }}>cover</span><span style={{ textAlign: 'right' }}>reorder pt</span><span style={{ textAlign: 'right' }}>target</span><span style={{ textAlign: 'right' }}>qty</span>
        </div>
        <div>
          {parRows.map((r, i) => (
            <div key={r.product_id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) 0.7fr 0.6fr 0.8fr 0.8fr 0.8fr', gap: 8, alignItems: 'center', padding: '8px 16px', borderTop: '1px solid ' + C.border, background: i % 2 ? C.surface : 'transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span><Chip tier={r.abc_tier} />{r.review && <span style={{ fontSize: 9, color: C.amber }}>review</span>}
              </div>
              <span style={{ fontSize: 12, color: C.dim, textAlign: 'right' }}>{r.units_per_day}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: coverColor(r.days_of_cover), textAlign: 'right' }}>{r.days_of_cover ?? '—'}</span>
              {(['reorder_point', 'target_stock', 'reorder_qty'] as const).map(field => (
                <input key={field} type="number" min={0}
                  value={edits[r.product_id + field] ?? String(r[field])}
                  onChange={e => setEdits(s => ({ ...s, [r.product_id + field]: e.target.value }))}
                  onBlur={() => { if (edits[r.product_id + field] != null && Number(edits[r.product_id + field]) !== r[field]) saveOverride(r.product_id, field) }}
                  style={{ ...numInput, width: '100%', textAlign: 'right', boxSizing: 'border-box', background: edits[r.product_id + field] != null ? 'rgba(127,184,151,0.12)' : '#16201B' }} />
              ))}
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 16px', background: C.surface, borderTop: '1px solid ' + C.border, fontSize: 10, color: C.dim }}>
          Reorder point = velocity × (lead {data.settings.lead_time_days}d + safety {data.settings.buffer_weeks}wk, ABC-weighted). Edit any cell to override — overrides persist + are flagged.
        </div>
      </div>
    </div>
  )
}
