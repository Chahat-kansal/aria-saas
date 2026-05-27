'use client'
import { useEffect, useState } from 'react'

interface TheftWeek { week: string; ratio: number }
interface TheftResult { pattern_detected: boolean; weekly: TheftWeek[]; analysis: string }

export function VarianceExtensions() {
  const [data, setData] = useState<TheftResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function run() {
    setLoading(true)
    const r = await fetch('/api/aria/theft-detection', { method: 'POST' }).then(r => r.json()).catch(() => null)
    setData(r); setLoading(false)
  }

  const max = Math.max(1, ...(data?.weekly.map(w => w.ratio) ?? [1]))

  return (
    <div style={{ marginTop: 18, padding: 18, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#A78BFA', textTransform: 'uppercase', letterSpacing: '0.08em' }}>✦ Variance trend & theft detection</p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Aria looks for 3+ consecutive weeks above 2% of revenue</p>
        </div>
        <button onClick={run} disabled={loading}
          style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#2D5240', color: '#7FB897', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
          {loading ? 'Analysing…' : data ? 'Re-run' : 'Detect patterns'}
        </button>
      </div>
      {data && data.weekly.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>Variance % of revenue · weekly</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 50 }}>
            {data.weekly.map(w => (
              <div key={w.week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }} title={`${w.week}: ${w.ratio.toFixed(2)}%`}>
                <div style={{ width: '100%', height: Math.max(2, (w.ratio / max) * 100) + '%', background: w.ratio > 2 ? '#ef4444' : '#7FB897', borderRadius: '2px 2px 0 0' }} />
                <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>{w.week.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {data?.pattern_detected && data.analysis && (
        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>⚠️ Aria alert</p>
          <p style={{ fontSize: 13, color: '#E8EDE7', lineHeight: 1.55 }}>{data.analysis}</p>
        </div>
      )}
    </div>
  )
}

interface RoadmapItem { id: string; title: string; description: string | null; status: 'now' | 'next' | 'later' }
interface FeatureRow { id: string; title?: string; feature_title?: string; description?: string | null; status?: string | null; upvotes?: number | null }

export function FeaturesExtensions({ items }: { items: FeatureRow[] }) {
  const [roadmap, setRoadmap] = useState<RoadmapItem[]>([])
  const [tab, setTab] = useState<'mine' | 'popular' | 'roadmap'>('mine')
  const [localItems, setLocalItems] = useState<FeatureRow[]>(items)

  useEffect(() => { setLocalItems(items) }, [items])
  useEffect(() => {
    if (tab === 'roadmap') fetch('/api/feature-roadmap').then(r => r.json()).then(d => setRoadmap(d.roadmap ?? [])).catch(() => {})
  }, [tab])

  async function upvote(id: string) {
    const r = await fetch(`/api/business-features/upvote?id=${id}`, { method: 'POST' }).then(r => r.json()).catch(() => null)
    if (r?.upvotes != null) setLocalItems(rows => rows.map(x => x.id === id ? { ...x, upvotes: r.upvotes } : x))
  }

  const STATUS_META: Record<string, { label: string; color: string }> = {
    submitted: { label: 'Submitted', color: '#6b7280' },
    under_review: { label: 'Under review', color: '#A78BFA' },
    in_development: { label: 'In development', color: '#60a5fa' },
    shipped: { label: 'Shipped', color: '#7FB897' },
    declined: { label: 'Declined', color: '#ef4444' },
  }

  const popular = [...localItems].sort((a, b) => Number(b.upvotes ?? 0) - Number(a.upvotes ?? 0))

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {(['mine', 'popular', 'roadmap'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: tab === t ? 700 : 500, color: tab === t ? '#A78BFA' : 'rgba(255,255,255,0.5)', borderBottom: tab === t ? '2px solid #A78BFA' : '2px solid transparent', marginBottom: -1, textTransform: 'capitalize' }}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'mine' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {localItems.length === 0 ? <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>No feature requests yet.</p> : localItems.map(f => (
            <div key={f.id} style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <p style={{ fontSize: 13, fontWeight: 700 }}>{f.title ?? f.feature_title ?? 'Untitled'}</p>
                {(() => { const meta = STATUS_META[f.status ?? 'submitted'] ?? STATUS_META.submitted; return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: meta.color + '20', color: meta.color, fontWeight: 700 }}>{meta.label}</span> })()}
              </div>
              {f.description && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{f.description}</p>}
            </div>
          ))}
        </div>
      )}
      {tab === 'popular' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {popular.length === 0 ? <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>No requests yet.</p> : popular.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={() => upvote(f.id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(167,139,250,0.3)', background: 'rgba(167,139,250,0.08)', cursor: 'pointer', fontFamily: 'inherit' }}>
                <span style={{ fontSize: 14, color: '#A78BFA' }}>▲</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#A78BFA' }}>{Number(f.upvotes ?? 0)}</span>
              </button>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600 }}>{f.title ?? f.feature_title ?? 'Untitled'}</p>
                {f.description && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{f.description}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === 'roadmap' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {(['now', 'next', 'later'] as const).map(col => (
            <div key={col} style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ fontSize: 10, color: col === 'now' ? '#7FB897' : col === 'next' ? '#A78BFA' : '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 8 }}>{col}</p>
              {roadmap.filter(r => r.status === col).length === 0 ? <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>—</p> : roadmap.filter(r => r.status === col).map(r => (
                <div key={r.id} style={{ marginBottom: 8 }}>
                  <p style={{ fontSize: 12, fontWeight: 600 }}>{r.title}</p>
                  {r.description && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{r.description}</p>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface SupplierScore { id: string; name: string; total_orders: number; received: number; fulfilment_rate: number; on_time_rate: number; avg_lead_days: number | null; spend_month: number; spend_year: number }
interface SavingOpp { product: string; cheapest: { supplier_name: string; avg_cost_cents: number }; dearest: { supplier_name: string; avg_cost_cents: number }; saving_per_unit_cents: number }
interface ReorderDraft { supplier: { id: string; name: string }; draft: Array<{ product_id: string; product_name: string; current_stock: number; suggested_qty: number; estimated_cost_cents: number; reason: string }>; total_cents: number; ai_note: string }

export function SuppliersExtensions({ suppliers }: { suppliers: Array<{ id: string; name: string }> }) {
  const [scorecards, setScorecards] = useState<SupplierScore[]>([])
  const [savings, setSavings] = useState<{ opportunities: SavingOpp[]; recommendation: string } | null>(null)
  const [savingsLoading, setSavingsLoading] = useState(false)
  const [reorder, setReorder] = useState<ReorderDraft | null>(null)
  const [reorderLoading, setReorderLoading] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/suppliers/scorecard').then(r => r.json()).then(d => setScorecards(d.suppliers ?? [])).catch(() => {})
  }, [])

  async function runSavings() {
    setSavingsLoading(true)
    const r = await fetch('/api/aria/supplier-savings', { method: 'POST' }).then(r => r.json()).catch(() => null)
    setSavings(r); setSavingsLoading(false)
  }
  async function runReorder(supplier_id: string) {
    setReorderLoading(supplier_id)
    const r = await fetch('/api/aria/supplier-reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ supplier_id, lead_days: 7 }) }).then(r => r.json()).catch(() => null)
    setReorder(r); setReorderLoading(null)
  }

  return (
    <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {scorecards.length > 0 && (
        <div style={{ padding: 18, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>📊 Scorecards · last 180 days</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Supplier', 'Orders', 'On-time %', 'Fulfilment %', 'Avg lead (d)', 'Spend MTD', 'Spend YTD', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scorecards.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{s.name}</td>
                  <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.6)' }}>{s.total_orders}</td>
                  <td style={{ padding: '8px 10px', color: s.on_time_rate > 80 ? '#7FB897' : s.on_time_rate > 50 ? '#f59e0b' : '#ef4444', fontWeight: 600 }}>{s.on_time_rate}%</td>
                  <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.6)' }}>{s.fulfilment_rate}%</td>
                  <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.6)' }}>{s.avg_lead_days ?? '—'}</td>
                  <td style={{ padding: '8px 10px', color: '#7FB897' }}>A${s.spend_month.toLocaleString('en-AU')}</td>
                  <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.5)' }}>A${s.spend_year.toLocaleString('en-AU')}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <button onClick={() => runReorder(s.id)} disabled={reorderLoading === s.id}
                      style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(167,139,250,0.15)', color: '#A78BFA', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: reorderLoading === s.id ? 0.5 : 1 }}>
                      {reorderLoading === s.id ? '…' : '✦ AI reorder'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* AI savings */}
      <div style={{ padding: 18, borderRadius: 12, background: 'rgba(127,184,151,0.06)', border: '1px solid rgba(127,184,151,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.08em' }}>✦ Price comparison · AI savings</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Products bought from multiple suppliers</p>
          </div>
          <button onClick={runSavings} disabled={savingsLoading}
            style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#2D5240', color: '#7FB897', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: savingsLoading ? 0.5 : 1 }}>
            {savingsLoading ? 'Analysing…' : savings ? 'Re-run' : 'Find savings'}
          </button>
        </div>
        {savings?.opportunities && savings.opportunities.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: savings.recommendation ? 10 : 0 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(127,184,151,0.15)' }}>
                {['Product', 'Cheapest', 'Dearest', 'Save / unit'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {savings.opportunities.slice(0, 6).map((o, i) => (
                <tr key={i}>
                  <td style={{ padding: '6px 8px' }}>{o.product}</td>
                  <td style={{ padding: '6px 8px', color: '#7FB897' }}>{o.cheapest.supplier_name} · A${(o.cheapest.avg_cost_cents / 100).toFixed(2)}</td>
                  <td style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.5)' }}>{o.dearest.supplier_name} · A${(o.dearest.avg_cost_cents / 100).toFixed(2)}</td>
                  <td style={{ padding: '6px 8px', color: '#7FB897', fontWeight: 700 }}>A${(o.saving_per_unit_cents / 100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {savings?.recommendation && <p style={{ fontSize: 13, color: '#E8EDE7', lineHeight: 1.55, marginTop: 8 }}>{savings.recommendation}</p>}
      </div>

      {/* Reorder draft */}
      {reorder && (
        <div style={{ padding: 18, borderRadius: 12, background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.25)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#A78BFA', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>✦ Draft reorder · {reorder.supplier.name}</p>
          {reorder.ai_note && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 10 }}>{reorder.ai_note}</p>}
          {reorder.draft.length === 0 ? <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Stock looks healthy — nothing to reorder.</p> : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 10 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(167,139,250,0.2)' }}>
                    {['Product', 'In stock', 'Qty', 'Est. cost', 'Reason'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reorder.draft.map(d => (
                    <tr key={d.product_id}>
                      <td style={{ padding: '6px 8px' }}>{d.product_name}</td>
                      <td style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.5)' }}>{d.current_stock}</td>
                      <td style={{ padding: '6px 8px', color: '#A78BFA', fontWeight: 700 }}>{d.suggested_qty}</td>
                      <td style={{ padding: '6px 8px', color: '#7FB897' }}>A${(d.estimated_cost_cents / 100).toFixed(2)}</td>
                      <td style={{ padding: '6px 8px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{d.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: 13, color: '#E8EDE7' }}><strong>Total:</strong> A${(reorder.total_cents / 100).toFixed(2)}</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function AuditScoreCard({ totalItems, completedItems, failedItems }: { totalItems: number; completedItems: number; failedItems: number }) {
  if (totalItems === 0) return null
  const score = Math.round((completedItems / totalItems) * 100)
  const color = score > 90 ? '#7FB897' : score >= 70 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 60, height: 60, borderRadius: '50%', background: color + '15', border: `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 16, fontWeight: 700, color }}>{score}%</span>
      </div>
      <div>
        <p style={{ fontSize: 13, fontWeight: 700, color }}>Audit score</p>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{completedItems} of {totalItems} items complete{failedItems > 0 ? ` · ${failedItems} failed` : ''}</p>
        {failedItems > 0 && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>Failed items need a corrective action before saving.</p>}
      </div>
    </div>
  )
}
