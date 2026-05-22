'use client'
import { useState, useEffect, useCallback } from 'react'

interface WeeklyReport {
  id: string; week_start: string; week_end: string; created_at: string
  report_data: { business_name: string; revenue: { this_week: number; prev_week: number; change_pct: number | null }; transactions: { count: number }; avg_basket: number; top_products: Array<{ name: string; qty: number; revenue: number }>; staff_leaderboard: Array<{ name: string; revenue: number }>; new_customers: number; low_stock_products: Array<{ name: string; stock_quantity: number }>; audit_summary: { total: number; passed: number; flagged: Array<{ name: string; category: string }> }; narrative: string } | null
}

function fmt(n: number) { return 'A$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtW(s: string, e: string) { return new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + ' – ' + new Date(e).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) }
const S = { sf: 'rgba(255,255,255,0.03)', bd: 'rgba(255,255,255,0.07)', g: '#7FB897', d: 'rgba(255,255,255,0.4)', m: 'rgba(255,255,255,0.2)', r: '#EF4444', a: '#F59E0B' }

export default function WeeklyReportsPage() {
  const [reports, setReports] = useState<WeeklyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [gen, setGen] = useState(false)
  const [sel, setSel] = useState<WeeklyReport | null>(null)
  const [msg, setMsg] = useState('')
  const load = useCallback(async () => { setLoading(true); try { const d = await fetch('/api/aria/weekly-report').then(r => r.json()) as { reports?: WeeklyReport[] }; setReports(d.reports ?? []) } finally { setLoading(false) } }, [])
  useEffect(() => { load() }, [load])
  const generate = async () => {
    setGen(true); setMsg('')
    try { const d = await fetch('/api/aria/weekly-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json()) as { ok?: boolean; error?: string }; if (d.ok) { setMsg('Report generated!'); load() } else setMsg(d.error ?? 'Failed') }
    catch { setMsg('Error') } finally { setGen(false) }
  }
  return (
    <div style={{ padding: 24, maxWidth: 1100, color: '#e8ede7' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div><h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Weekly Reports</h1><p style={{ fontSize: 13, color: S.d, marginTop: 4 }}>AI-generated weekly summaries — revenue, staff, audits</p></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {msg && <span style={{ fontSize: 13, color: msg.includes('!') ? S.g : S.r }}>{msg}</span>}
          <button onClick={generate} disabled={gen} style={{ padding: '9px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: '#2D5240', color: '#fff', opacity: gen ? 0.6 : 1 }}>{gen ? 'Generating…' : '✦ Generate this week'}</button>
        </div>
      </div>
      {loading ? <div style={{ textAlign: 'center', padding: 48, color: S.d }}>Loading…</div>
      : reports.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 64, color: S.d }}>
          <p style={{ fontSize: 16, marginBottom: 8 }}>No weekly reports yet.</p>
          <p style={{ fontSize: 13, marginBottom: 20 }}>Click below to generate your first report.</p>
          <button onClick={generate} disabled={gen} style={{ padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: '#2D5240', color: '#fff' }}>{gen ? 'Generating…' : '✦ Generate first report'}</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: sel ? '320px 1fr' : '1fr', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reports.map(r => {
              const rd = r.report_data; const isSel = sel?.id === r.id; const ch = rd?.revenue?.change_pct
              return (
                <div key={r.id} onClick={() => setSel(isSel ? null : r)} style={{ background: isSel ? 'rgba(127,184,151,0.08)' : S.sf, border: '1px solid ' + (isSel ? 'rgba(127,184,151,0.3)' : S.bd), borderRadius: 14, padding: '16px 18px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div><p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{fmtW(r.week_start, r.week_end)}</p><p style={{ fontSize: 11, color: S.m, margin: '3px 0 0' }}>{rd?.transactions.count ?? 0} sales · {rd?.new_customers ?? 0} new</p></div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 17, fontWeight: 700, color: S.g, margin: 0 }}>{fmt(rd?.revenue.this_week ?? 0)}</p>
                      {ch !== null && ch !== undefined && <p style={{ fontSize: 11, margin: '2px 0 0', color: ch >= 0 ? S.g : S.r }}>{ch >= 0 ? '▲' : '▼'} {Math.abs(ch)}% vs prior</p>}
                    </div>
                  </div>
                  {rd?.audit_summary && rd.audit_summary.flagged.length > 0 && <div style={{ marginTop: 8, fontSize: 11, color: S.a }}>⚠ {rd.audit_summary.flagged.length} audit item{rd.audit_summary.flagged.length > 1 ? 's' : ''} flagged</div>}
                </div>
              )
            })}
          </div>
          {sel && sel.report_data && (() => {
            const rd = sel.report_data
            return (
              <div style={{ background: S.sf, border: '1px solid ' + S.bd, borderRadius: 16, padding: 24, height: 'fit-content' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div><h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{fmtW(sel.week_start, sel.week_end)}</h2><p style={{ fontSize: 12, color: S.d, margin: '3px 0 0' }}>{rd.business_name}</p></div>
                  <button onClick={() => setSel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.d, fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
                </div>
                {rd.narrative && <div style={{ background: 'rgba(127,184,151,0.06)', border: '1px solid rgba(127,184,151,0.15)', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}><p style={{ fontSize: 11, color: S.g, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>✦ Aria Summary</p><p style={{ fontSize: 13, color: '#d1fae5', margin: 0, lineHeight: 1.6 }}>{rd.narrative}</p></div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                  {[['Revenue', fmt(rd.revenue.this_week), rd.revenue.change_pct !== null ? ((rd.revenue.change_pct >= 0 ? '+' : '') + rd.revenue.change_pct + '% vs last week') : null], ['Transactions', String(rd.transactions.count), null], ['Avg Basket', fmt(rd.avg_basket), null]].map(([lbl, val, sub]) => (
                    <div key={String(lbl)} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '12px 14px' }}>
                      <p style={{ fontSize: 10, color: S.m, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>{lbl}</p>
                      <p style={{ fontSize: 18, fontWeight: 700, color: S.g, margin: 0 }}>{val}</p>
                      {sub && <p style={{ fontSize: 11, color: S.d, margin: '3px 0 0' }}>{sub}</p>}
                    </div>
                  ))}
                </div>
                {rd.top_products.length > 0 && <div style={{ marginBottom: 18 }}><p style={{ fontSize: 10, color: S.m, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Top Products</p>{rd.top_products.map((p, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}><span style={{ fontSize: 13 }}>{p.name}</span><span style={{ fontSize: 13, color: S.d }}>x{p.qty} · {fmt(p.revenue)}</span></div>)}</div>}
                {rd.staff_leaderboard.length > 0 && <div style={{ marginBottom: 18 }}><p style={{ fontSize: 10, color: S.m, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Staff Revenue</p>{rd.staff_leaderboard.map((s, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}><span style={{ fontSize: 13 }}>{['🥇','🥈','🥉'][i] ?? (i+1)+'.'} {s.name}</span><span style={{ fontSize: 13, color: S.g }}>{fmt(s.revenue)}</span></div>)}</div>}
                {rd.audit_summary.total > 0 && <div style={{ marginBottom: 18 }}><p style={{ fontSize: 10, color: S.m, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Audit Compliance</p><div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}><span style={{ fontSize: 20, fontWeight: 700, color: rd.audit_summary.passed === rd.audit_summary.total ? S.g : S.a }}>{rd.audit_summary.total > 0 ? Math.round(rd.audit_summary.passed / rd.audit_summary.total * 100) : 0}%</span><span style={{ fontSize: 12, color: S.d }}>{rd.audit_summary.passed}/{rd.audit_summary.total} passed</span></div>{rd.audit_summary.flagged.length > 0 && <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, padding: '10px 12px' }}><p style={{ fontSize: 11, fontWeight: 600, color: S.r, margin: '0 0 6px' }}>Flagged</p>{rd.audit_summary.flagged.slice(0,5).map((f,i) => <p key={i} style={{ fontSize: 11, color: 'rgba(239,68,68,0.7)', margin: '2px 0' }}>• {f.name}</p>)}</div>}</div>}
                {rd.low_stock_products.length > 0 && <div><p style={{ fontSize: 10, color: S.m, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Low Stock</p>{rd.low_stock_products.map((p,i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', color: S.a }}><span>{p.name}</span><span>{p.stock_quantity} left</span></div>)}</div>}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
