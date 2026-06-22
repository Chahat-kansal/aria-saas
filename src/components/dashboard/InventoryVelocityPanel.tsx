'use client'
import { useState, useEffect, useCallback } from 'react'

// INV-VELOCITY-1 — the "Pulse / What sells" surface (Linear/Stripe analytics). Velocity board (ranked
// units/day with value bars, trend arrows, margin, ABC chip) · ABC summary + legend · dead-stock action
// list · a window note that shows the REAL data window (never silently "today"). All four states.
// Honest data only — margin NULL where cost unknown; nothing fabricated.

type Abc = 'A' | 'B' | 'C' | 'dead'
interface Row { product_id: string; name: string; units_window: number; units_per_day: number; velocity_vs_avg: number | null; margin_pct: number | null; composite_score: number; abc_tier: Abc; performance_tier: string | null }
interface Data { window: { start: string; end: string; days: number }; scored_at: string; rows: Row[]; counts: { A: number; B: number; C: number; dead: number; total: number; uncosted: number } }

const C = {
  green: '#7FB897', gold: '#C9A37A', amber: '#BA7517', red: '#E24B4A', blue: '#6E8FB8',
  surface: 'rgba(255,255,255,0.03)', surface2: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.08)',
  text: '#E8EDE7', dim: 'rgba(255,255,255,0.45)',
}
const DISPLAY = "'Cormorant', Georgia, serif"
const ABC_META: Record<Abc, { color: string; label: string; desc: string }> = {
  A: { color: C.green, label: 'A', desc: 'top ~80% of revenue' },
  B: { color: C.blue, label: 'B', desc: 'next ~15%' },
  C: { color: C.gold, label: 'C', desc: 'last ~5%' },
  dead: { color: C.red, label: 'Dead', desc: 'no sales in window' },
}
const fmtDate = (s: string) => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—'

function AbcChip({ tier }: { tier: Abc }) {
  const m = ABC_META[tier]
  return <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, color: m.color, background: m.color + '1a', border: `1px solid ${m.color}40`, whiteSpace: 'nowrap' }}>{m.label}</span>
}
function Trend({ v }: { v: number | null }) {
  if (v == null) return <span style={{ fontSize: 11, color: C.dim }}>—</span>
  if (v >= 1.05) return <span style={{ fontSize: 11, fontWeight: 700, color: C.green }}>↑ {v.toFixed(2)}×</span>
  if (v <= 0.95) return <span style={{ fontSize: 11, fontWeight: 700, color: C.red }}>↓ {v.toFixed(2)}×</span>
  return <span style={{ fontSize: 11, color: C.dim }}>→ {v.toFixed(2)}×</span>
}

export default function InventoryVelocityPanel() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [sort, setSort] = useState<'velocity' | 'margin' | 'tier'>('velocity')

  const load = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      const r = await fetch('/api/pos/inventory/velocity')
      if (!r.ok) throw new Error('failed')
      setData(await r.json())
    } catch { setError(true) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  // ── LOADING ──
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ height: 40, borderRadius: 10, background: C.surface, border: '1px solid ' + C.border }} />
        <div style={{ borderRadius: 12, border: '1px solid ' + C.border, overflow: 'hidden' }}>
          {[...Array(7)].map((_, i) => (
            <div key={i} style={{ height: 46, borderTop: i ? '1px solid ' + C.border : 'none', background: i % 2 ? C.surface : 'transparent', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12 }}>
              <div style={{ height: 12, width: '30%', borderRadius: 6, background: C.surface2 }} />
              <div style={{ height: 8, flex: 1, borderRadius: 6, background: C.surface2 }} />
              <div style={{ height: 12, width: 50, borderRadius: 6, background: C.surface2 }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── ERROR ──
  if (error) {
    return (
      <div style={{ padding: 32, borderRadius: 16, background: C.surface, border: `1px solid ${C.red}40`, textAlign: 'center' }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>Couldn&apos;t load velocity</p>
        <p style={{ fontSize: 13, color: C.dim, marginBottom: 16 }}>Something went wrong computing what sells.</p>
        <button onClick={load} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: C.green, color: '#0E1812', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Try again</button>
      </div>
    )
  }

  // ── EMPTY ──
  if (!data || data.rows.length === 0) {
    return (
      <div style={{ padding: 40, borderRadius: 16, background: C.surface, border: '1px solid ' + C.border, textAlign: 'center', maxWidth: 540, margin: '0 auto' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>📈</div>
        <p style={{ fontSize: 22, fontFamily: DISPLAY, fontStyle: 'italic', color: C.text, marginBottom: 6 }}>No sales to read yet</p>
        <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.6 }}>Once you ring up sales, this board ranks every product by how fast it sells, flags your A/B/C movers, and surfaces dead stock. Make a few sales and check back.</p>
      </div>
    )
  }

  const rows = [...data.rows].sort((a, b) =>
    sort === 'margin' ? (b.margin_pct ?? -1) - (a.margin_pct ?? -1)
    : sort === 'tier' ? (['A', 'B', 'C', 'dead'].indexOf(a.abc_tier) - ['A', 'B', 'C', 'dead'].indexOf(b.abc_tier)) || b.units_per_day - a.units_per_day
    : b.units_per_day - a.units_per_day)
  const maxUPD = Math.max(0.01, ...rows.map(r => r.units_per_day))
  const dead = data.rows.filter(r => r.abc_tier === 'dead')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* WINDOW NOTE — never imply "today" */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '10px 16px', borderRadius: 12, background: `linear-gradient(135deg, rgba(45,82,64,0.25), ${C.surface})`, border: '1px solid ' + C.border }}>
        <span style={{ fontSize: 13, color: C.text }}>📅 Based on sales <strong>{fmtDate(data.window.start)} – {fmtDate(data.window.end)}</strong> <span style={{ color: C.dim }}>({data.window.days} days)</span></span>
        {data.counts.uncosted > 0 && <span style={{ fontSize: 12, color: C.amber }}>⚠ {data.counts.uncosted} uncosted — margin partial</span>}
      </div>

      {/* ABC SUMMARY */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {(['A', 'B', 'C', 'dead'] as Abc[]).map(t => (
          <div key={t} style={{ padding: '14px 16px', borderRadius: 12, background: C.surface, border: `1px solid ${ABC_META[t].color}30` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 26, fontFamily: DISPLAY, fontStyle: 'italic', fontWeight: 600, color: ABC_META[t].color }}>{data.counts[t]}</span>
              <AbcChip tier={t} />
            </div>
            <p style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>{ABC_META[t].desc}</p>
          </div>
        ))}
      </div>

      {/* DEAD-STOCK CALLOUT (real action list) */}
      {dead.length > 0 && (
        <div style={{ padding: 16, borderRadius: 14, background: C.red + '10', border: `1px solid ${C.red}40` }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 8 }}>💀 {dead.length} dead — no sales in the last {data.window.days} days</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {dead.slice(0, 30).map(d => (
              <span key={d.product_id} style={{ fontSize: 12, color: C.text, padding: '4px 10px', borderRadius: 8, background: C.surface2, border: '1px solid ' + C.border }}>{d.name}</span>
            ))}
          </div>
        </div>
      )}

      {/* VELOCITY BOARD */}
      <div style={{ borderRadius: 14, border: '1px solid ' + C.border, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: C.surface }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>What sells — ranked by velocity</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['velocity', 'margin', 'tier'] as const).map(s => (
              <button key={s} onClick={() => setSort(s)}
                style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 7, border: '1px solid ' + C.border, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize', background: sort === s ? C.green : 'transparent', color: sort === s ? '#0E1812' : C.dim }}>{s}</button>
            ))}
          </div>
        </div>
        <div>
          {rows.map((r, i) => (
            <div key={r.product_id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.8fr) 0.8fr 0.7fr 0.6fr 0.5fr', gap: 10, alignItems: 'center', padding: '10px 16px', borderTop: '1px solid ' + C.border, background: i % 2 ? C.surface : 'transparent' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  <AbcChip tier={r.abc_tier} />
                </div>
                <div style={{ height: 5, marginTop: 6, borderRadius: 999, background: '#16201B', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round((r.units_per_day / maxUPD) * 100)}%`, background: r.abc_tier === 'dead' ? C.red : C.green }} />
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{r.units_per_day.toFixed(2)}<span style={{ fontSize: 10, color: C.dim }}>/day</span></div>
                <div style={{ fontSize: 10, color: C.dim }}>{r.units_window} in window</div>
              </div>
              <div style={{ textAlign: 'right' }}><Trend v={r.velocity_vs_avg} /></div>
              <div style={{ fontSize: 12, fontWeight: 700, textAlign: 'right', color: r.margin_pct == null ? C.amber : C.green }}>{r.margin_pct == null ? 'no cost' : `${r.margin_pct}%`}</div>
              <div style={{ fontSize: 12, fontWeight: 700, textAlign: 'right', color: C.gold }}>{r.composite_score.toFixed(0)}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, padding: '8px 16px', background: C.surface, borderTop: '1px solid ' + C.border, fontSize: 10, color: C.dim }}>
          <span>↑/↓ = vs the prior half of the window (trend)</span>
          <span style={{ marginLeft: 'auto' }}>last column = composite score (velocity + margin)</span>
        </div>
      </div>
    </div>
  )
}
