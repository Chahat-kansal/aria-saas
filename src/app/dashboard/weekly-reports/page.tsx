'use client'
import { useState, useEffect, useCallback } from 'react'

interface WeeklyReport { id: string; week_start: string; week_end: string; created_at: string; report_data: { revenue: { this_week: number; prev_week: number; change_pct: number | null }; transactions: { count: number }; avg_basket: number; top_products: Array<{ name: string; qty: number; revenue: number }>; staff_leaderboard: Array<{ name: string; revenue: number }>; new_customers: number; low_stock_products: Array<{ name: string; stock_quantity: number }>; audit_summary: { total: number; passed: number; flagged: Array<{ name: string }> }; narrative: string; business_name: string } }

function fmt(n: number) { return 'A$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

export default function WeeklyReportsPage() {
  const [reports, setReports] = useState<WeeklyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selected, setSelected] = useState<WeeklyReport | null>(null)
  const load = useCallback(async () => { setLoading(true); try { const r = await fetch('/api/aria/weekly-report'); const d = await r.json() as { reports?: WeeklyReport[] }; setReports(d.reports ?? []) } finally { setLoading(false) } }, [])
  useEffect(() => { load() }, [load])
  const generate = async () => { setGenerating(true); try { const r = await fetch('/api/aria/weekly-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }); const d = await r.json() as { ok?: boolean; report?: WeeklyReport }; if (d.ok) { await load() } } finally { setGenerating(false) } }
  const S = { surface: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.07)', green: '#7FB897', dim: 'rgba(255,255,255,0.4)', muted: 'rgba(255,255,255,0.2)' }

  return (
    <div style={{ padding: 24, maxWidth: 1100, color: '#e8ede7' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div><h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Weekly Reports</h1><p style={{ fontSize: 13, color: S.dim, marginTop: 4 }}>Your business at a glance, week by week</p></div>
        <button onClick={generate} disabled={generating} style={{ padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: '#2D5240', color: '#7FB897', opacity: generating ? 0.6 : 1 }}>{generating ? 'Generating…' : '✦ Generate This Week'}</button>
      </div>
      {loading ? <div style={{ textAlign: 'center', padding: 48, color: S.dim }}>Loading…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '300px 1fr' : '1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reports.length === 0 && <div style={{ textAlign: 'center', padding: 48, color: S.dim }}>No reports yet. Click Generate to create your first weekly report.</div>}
            {reports.map(r => (
              <div key={r.id} onClick={() => setSelected(selected?.id === r.id ? null : r)}
                style={{ background: selected?.id === r.id ? 'rgba(127,184,151,0.08)' : S.surface, border: '1px solid ' + (selected?.id === r.id ? 'rgba(127,184,151,0.3)' : S.border), borderRadius: 12, padding: '14px 18px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div><p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{new Date(r.week_start).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – {new Date(r.week_end).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p><p style={{ fontSize: 12, color: S.dim, margin: '2px 0 0' }}>{r.report_data?.transactions?.count ?? 0} transactions</p></div>
                  <div style={{ textAlign: 'right' }}><p style={{ fontSize: 16, fontWeight: 700, color: S.green, margin: 0 }}>{fmt(r.report_data?.revenue?.this_week ?? 0)}</p>{r.report_data?.revenue?.change_pct != null && <p style={{ fontSize: 11, margin: '2px 0 0', color: (r.report_data.revenue.change_pct ?? 0) >= 0 ? S.green : '#EF4444' }}>{(r.report_data.revenue.change_pct ?? 0) >= 0 ? '▲' : '▼'} {Math.abs(r.report_data.revenue.change_pct ?? 0)}% vs last week</p>}</div>
                </div>
              </div>
            ))}
          </div>
          {selected && (() => {
            const d = selected.report_data
            return (
              <div style={{ background: S.surface, border: '1px solid ' + S.border, borderRadius: 16, padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}><h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{new Date(selected.week_start).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })} – {new Date(selected.week_end).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</h2><button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.dim, fontSize: 20, lineHeight: 1, padding: 0 }}>×</button></div>
                {d.narrative && <div style={{ padding: '14px 18px', background: 'rgba(127,184,151,0.05)', border: '1px solid rgba(127,184,151,0.2)', borderRadius: 12, marginBottom: 20 }}><p style={{ fontSize: 13, fontStyle: 'italic', color: 'rgba(237,232,255,0.8)', margin: 0, lineHeight: 1.6 }}>{d.narrative}</p></div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
                  {[['Revenue', fmt(d.revenue?.this_week ?? 0)], ['Transactions', String(d.transactions?.count ?? 0)], ['Avg Basket', fmt(d.avg_basket ?? 0)], ['New Customers', String(d.new_customers ?? 0)], ['Low Stock', String(d.low_stock_products?.length ?? 0) + ' products'], ['Audit Pass Rate', d.audit_summary?.total > 0 ? Math.round((d.audit_summary.passed / d.audit_summary.total) * 100) + '%' : '—']].map(([label, val]) => (
                    <div key={label} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '12px 14px' }}>
                      <p style={{ fontSize: 10, color: S.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>{label}</p>
                      <p style={{ fontSize: 16, fontWeight: 700, color: S.green, margin: 0 }}>{val}</p>
                    </div>
                  ))}
                </div>
                {d.top_products?.length > 0 && <div style={{ marginBottom: 16 }}><p style={{ fontSize: 11, color: S.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Top Products</p>{d.top_products.map((p, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}><span>{i+1}. {p.name}</span><span style={{ color: S.dim }}>x{p.qty} · {fmt(p.revenue)}</span></div>)}</div>}
                {d.staff_leaderboard?.length > 0 && <div><p style={{ fontSize: 11, color: S.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Staff Leaderboard</p>{d.staff_leaderboard.map((s, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}><span>{['🥇','🥈','🥉'][i] ?? (i+1)+'.'} {s.name}</span><span style={{ color: S.green }}>{fmt(s.revenue)}</span></div>)}</div>}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
