'use client'
import { useState, useEffect, useCallback } from 'react'
import { AriaSays } from '@/components/dashboard/AriaSays'

interface ShiftReport {
  id: string; session_id: string | null; cashier_name: string | null
  shift_start: string; shift_end: string
  total_transactions: number; total_revenue: number; avg_basket: number
  total_refunds: number; total_refund_value: number; total_voids: number
  opening_float: number; closing_float: number | null; variance_cents: number
  top_products: Array<{ name: string; qty: number; revenue: number }>
  payment_breakdown: Record<string, number>
  staff_on_shift: Array<{ name: string; hours: number | null }>
  aria_summary: string | null; created_at: string
  labour_hours?: number; labour_cost_dollars?: number; labour_ratio_pct?: number; revenue_per_hour?: number
}

interface StaffSummary {
  staff: Array<{ name: string; hours: number; pay_dollars: number; revenue: number; revenue_per_hour: number; sessions: number; overtime_weeks: Array<{ week: string; hours: number }> }>
  totals: { hours: number; pay_dollars: number; revenue: number } | null
  days: number
}

const fmt = (n: number) => 'A$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dur = (start: string, end: string) => { const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000); return mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + 'm' }
const dt = (iso: string) => new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const S = { surface: 'rgba(255,255,255,0.03)', surface2: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.07)', green: '#7FB897', amber: '#f59e0b', red: '#ef4444', blue: '#60a5fa', violet: '#A78BFA', text: '#e8ede7', dim: 'rgba(255,255,255,0.4)', muted: 'rgba(255,255,255,0.2)' }

function LabourGauge({ pct }: { pct: number }) {
  const color = pct === 0 ? S.dim : pct < 30 ? S.green : pct <= 40 ? S.amber : S.red
  const cap = Math.min(pct, 100)
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 60, height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: cap + '%', height: '100%', background: color }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color }}>{pct.toFixed(0)}%</span>
    </div>
  )
}

function MiniBars({ data, max }: { data: { label: string; value: number; highlight?: boolean }[]; max: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 50 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }} title={`${d.label}: ${d.value}`}>
          <div style={{ width: '100%', borderRadius: '2px 2px 0 0', height: Math.max(2, (d.value / Math.max(1, max)) * 100) + '%', background: d.highlight ? S.green : 'rgba(127,184,151,0.35)' }} />
          <span style={{ fontSize: 8, color: S.muted }}>{d.label}</span>
        </div>
      ))}
    </div>
  )
}

export default function ShiftReportsPage() {
  const [reports, setReports] = useState<ShiftReport[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'staff' | 'compare'>('list')
  const [windowDays, setWindowDays] = useState<7 | 14 | 30>(7)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [staff, setStaff] = useState<StaffSummary | null>(null)
  const [staffLoading, setStaffLoading] = useState(false)
  const [analysis, setAnalysis] = useState<Record<string, { analysis: string; hourly_revenue: Record<string, number> }>>({})
  const [analysisLoading, setAnalysisLoading] = useState<string | null>(null)
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set())
  const today = new Date().toISOString().slice(0, 10)
  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
  const [payFrom, setPayFrom] = useState(monthAgo)
  const [payTo, setPayTo] = useState(today)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/pos/shift-reports?limit=60')
      const d = await r.json() as { reports?: ShiftReport[] }
      setReports(d.reports ?? [])
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (view !== 'staff') return
    setStaffLoading(true)
    fetch(`/api/pos/shift-reports/staff-hours?days=${windowDays}`).then(r => r.json()).then(d => { setStaff(d); setStaffLoading(false) }).catch(() => setStaffLoading(false))
  }, [view, windowDays])

  async function runAnalysis(reportId: string) {
    setAnalysisLoading(reportId)
    const r = await fetch('/api/aria/shift-analysis', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_id: reportId }),
    }).then(r => r.json()).catch(() => null)
    if (r) setAnalysis(a => ({ ...a, [reportId]: r }))
    setAnalysisLoading(null)
  }

  function toggleCompare(id: string) {
    setCompareIds(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else { if (n.size >= 2) { const first = n.values().next().value as string; n.delete(first) } n.add(id) } return n })
  }

  const recentChart = reports.slice(0, windowDays).reverse()
  const maxRevenue = Math.max(1, ...recentChart.map(r => r.total_revenue))
  const maxLabour = Math.max(1, ...recentChart.map(r => r.labour_cost_dollars ?? 0))
  const sortedByRatio = [...recentChart].filter(r => r.labour_ratio_pct !== undefined && r.labour_ratio_pct > 0).sort((a, b) => (a.labour_ratio_pct ?? 999) - (b.labour_ratio_pct ?? 999))
  const bestShift = sortedByRatio[0]
  const worstShift = sortedByRatio[sortedByRatio.length - 1]

  const compareList = Array.from(compareIds).map(id => reports.find(r => r.id === id)).filter((r): r is ShiftReport => Boolean(r))

  return (
    <div style={{ padding: 24, maxWidth: 1200, color: S.text, fontFamily: 'Manrope, sans-serif' }}>
      <AriaSays businessId={null} page="shift-reports" />
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Shift Reports</h1>
          <p style={{ fontSize: 13, color: S.dim, marginTop: 4 }}>Labour vs revenue, staff efficiency, AI shift analysis</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['list', 'staff', 'compare'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid ' + S.border, background: view === v ? 'rgba(127,184,151,0.15)' : 'transparent', color: view === v ? S.green : S.dim, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
              {v === 'staff' ? '👥 Staff hours' : v === 'compare' ? '⚖ Compare' : '📋 Shifts'}
            </button>
          ))}
        </div>
      </div>

      {/* Labour vs revenue chart */}
      {view === 'list' && reports.length > 0 && (
        <div style={{ background: S.surface, border: '1px solid ' + S.border, borderRadius: 14, padding: 18, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <p style={{ fontSize: 11, color: S.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Labour vs revenue</p>
              <p style={{ fontSize: 13, color: S.muted, marginTop: 2 }}>Bars = revenue · Line dots = labour cost</p>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {([7, 14, 30] as const).map(d => (
                <button key={d} onClick={() => setWindowDays(d)}
                  style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid ' + S.border, background: windowDays === d ? 'rgba(127,184,151,0.15)' : 'transparent', color: windowDays === d ? S.green : S.dim, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <div style={{ position: 'relative', height: 140 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: '100%' }}>
              {recentChart.map(r => {
                const rh = (r.total_revenue / maxRevenue) * 100
                const lh = ((r.labour_cost_dollars ?? 0) / maxLabour) * 100
                const isBest = bestShift && r.id === bestShift.id
                const isWorst = worstShift && r.id === worstShift.id
                return (
                  <div key={r.id} style={{ flex: 1, position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
                       title={`${dt(r.shift_start)} · Rev ${fmt(r.total_revenue)} · Labour ${fmt(r.labour_cost_dollars ?? 0)} · ${r.labour_ratio_pct?.toFixed(1)}%`}>
                    <div style={{ height: rh + '%', background: isBest ? S.green : isWorst ? 'rgba(239,68,68,0.6)' : 'rgba(127,184,151,0.4)', borderRadius: '3px 3px 0 0', position: 'relative' }}>
                      <div style={{ position: 'absolute', bottom: lh + '%', left: '50%', transform: 'translate(-50%, 50%)', width: 6, height: 6, borderRadius: '50%', background: S.amber, border: '1.5px solid #0E1812' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          {bestShift && worstShift && bestShift.id !== worstShift.id && (
            <div style={{ display: 'flex', gap: 10, marginTop: 12, fontSize: 11 }}>
              <span style={{ color: S.green }}>● Best labour: {bestShift.labour_ratio_pct?.toFixed(1)}% ({dt(bestShift.shift_start)})</span>
              <span style={{ color: S.red }}>● Worst labour: {worstShift.labour_ratio_pct?.toFixed(1)}% ({dt(worstShift.shift_start)})</span>
            </div>
          )}
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 48, color: S.dim }}>Loading…</div>
        : reports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: S.dim, background: S.surface, borderRadius: 12 }}>
            <p style={{ fontSize: 15, marginBottom: 8 }}>No shift reports yet.</p>
            <p style={{ fontSize: 13 }}>Reports generate automatically when a register session is closed.</p>
          </div>
        ) : view === 'list' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reports.map(r => {
              const isExp = expanded === r.id
              return (
                <div key={r.id} style={{ background: S.surface, border: '1px solid ' + (isExp ? 'rgba(127,184,151,0.25)' : S.border), borderRadius: 12, padding: '14px 18px' }}>
                  <div onClick={() => setExpanded(isExp ? null : r.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{dt(r.shift_start)} → {new Date(r.shift_end).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</p>
                      <p style={{ fontSize: 12, color: S.dim, margin: '2px 0 0' }}>{dur(r.shift_start, r.shift_end)} · {r.cashier_name || 'Unknown'} · {r.staff_on_shift?.length ?? 0} staff</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 16, fontWeight: 700, color: S.green, margin: 0 }}>{fmt(r.total_revenue)}</p>
                        <p style={{ fontSize: 11, color: S.muted, margin: '2px 0 0' }}>{r.total_transactions} sales</p>
                      </div>
                      <LabourGauge pct={r.labour_ratio_pct ?? 0} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11 }}>
                    {[['Avg basket', fmt(r.avg_basket)], ['Labour', fmt(r.labour_cost_dollars ?? 0)], ['Rev/hr', fmt(r.revenue_per_hour ?? 0)], ['Voids', String(r.total_voids)], ['Refunds', String(r.total_refunds)], ['Variance', (r.variance_cents >= 0 ? '+' : '') + fmt(r.variance_cents / 100)]].map(([label, val]) => (
                      <div key={label}>
                        <p style={{ fontSize: 10, color: S.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{label}</p>
                        <p style={{ fontSize: 13, fontWeight: 600, margin: '2px 0 0', color: label === 'Variance' && r.variance_cents !== 0 ? (r.variance_cents > 0 ? S.green : S.red) : S.text }}>{val}</p>
                      </div>
                    ))}
                    <div style={{ marginLeft: 'auto' }}>
                      <button onClick={(e) => { e.stopPropagation(); toggleCompare(r.id) }}
                        style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid ' + S.border, background: compareIds.has(r.id) ? 'rgba(167,139,250,0.15)' : 'transparent', color: compareIds.has(r.id) ? S.violet : S.dim, fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {compareIds.has(r.id) ? '✓ In compare' : '+ Compare'}
                      </button>
                    </div>
                  </div>
                  {r.aria_summary && <p style={{ fontSize: 12, color: S.dim, margin: '10px 0 0', fontStyle: 'italic', lineHeight: 1.5 }}>{r.aria_summary}</p>}

                  {isExp && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid ' + S.border, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      {r.top_products?.length > 0 && (
                        <div>
                          <p style={{ fontSize: 10, color: S.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Top products</p>
                          {r.top_products.map((p, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                              <span>{p.name}</span><span style={{ color: S.dim }}>×{p.qty} · {fmt(p.revenue)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {r.staff_on_shift?.length > 0 && (
                        <div>
                          <p style={{ fontSize: 10, color: S.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Staff on shift</p>
                          {r.staff_on_shift.map((s, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                              <span>{s.name}</span><span style={{ color: S.dim }}>{s.hours ? s.hours + 'h' : '—'}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <p style={{ fontSize: 10, color: S.violet, textTransform: 'uppercase', letterSpacing: '0.06em' }}>✦ Aria analysis</p>
                          <button onClick={() => runAnalysis(r.id)} disabled={analysisLoading === r.id}
                            style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(167,139,250,0.15)', color: S.violet, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: analysisLoading === r.id ? 0.5 : 1 }}>
                            {analysisLoading === r.id ? 'Analysing…' : analysis[r.id] ? 'Re-run' : 'Run analysis'}
                          </button>
                        </div>
                        {analysis[r.id] && (
                          <>
                            <p style={{ fontSize: 12, color: S.text, lineHeight: 1.6, padding: '10px 12px', borderRadius: 8, background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)' }}>{analysis[r.id].analysis}</p>
                            {Object.keys(analysis[r.id].hourly_revenue ?? {}).length > 0 && (
                              <div style={{ marginTop: 10 }}>
                                <p style={{ fontSize: 10, color: S.muted, marginBottom: 4 }}>Hourly revenue</p>
                                <MiniBars data={Object.entries(analysis[r.id].hourly_revenue).sort().map(([h, v]) => ({ label: h, value: v }))} max={Math.max(1, ...Object.values(analysis[r.id].hourly_revenue))} />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : view === 'staff' ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {([7, 14, 30] as const).map(d => (
                  <button key={d} onClick={() => setWindowDays(d)}
                    style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid ' + S.border, background: windowDays === d ? 'rgba(127,184,151,0.15)' : 'transparent', color: windowDays === d ? S.green : S.dim, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Last {d} days
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="date" value={payFrom} onChange={e => setPayFrom(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid ' + S.border, background: 'transparent', color: S.text, fontSize: 12, fontFamily: 'inherit' }} />
                <span style={{ fontSize: 12, color: S.dim }}>→</span>
                <input type="date" value={payTo} onChange={e => setPayTo(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid ' + S.border, background: 'transparent', color: S.text, fontSize: 12, fontFamily: 'inherit' }} />
                <a href={`/api/pos/shift-reports/payroll-export?from=${payFrom}&to=${payTo}`} download
                  style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#2D5240', color: S.green, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none' }}>
                  ⬇ Payroll CSV
                </a>
              </div>
            </div>
            {staffLoading ? <p style={{ color: S.dim, textAlign: 'center', padding: 24 }}>Loading…</p>
              : !staff || staff.staff.length === 0 ? <p style={{ color: S.dim, textAlign: 'center', padding: 24 }}>No timesheets in this window.</p> : (
                <div style={{ borderRadius: 12, border: '1px solid ' + S.border, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: S.surface }}>
                        {['Staff', 'Hours', 'Pay (A$)', 'Revenue', 'Rev/hr', 'Sessions', 'Overtime'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 700, color: S.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {staff.staff.map(s => (
                        <tr key={s.name} style={{ borderTop: '1px solid ' + S.border }}>
                          <td style={{ padding: '10px 14px', fontWeight: 600 }}>{s.name}</td>
                          <td style={{ padding: '10px 14px' }}>{s.hours}h</td>
                          <td style={{ padding: '10px 14px', color: S.dim }}>{fmt(s.pay_dollars)}</td>
                          <td style={{ padding: '10px 14px', color: S.green }}>{fmt(s.revenue)}</td>
                          <td style={{ padding: '10px 14px', color: S.amber }}>{fmt(s.revenue_per_hour)}</td>
                          <td style={{ padding: '10px 14px', color: S.dim }}>{s.sessions}</td>
                          <td style={{ padding: '10px 14px' }}>
                            {s.overtime_weeks.length > 0
                              ? <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(245,158,11,0.15)', color: S.amber, fontWeight: 700 }}>{s.overtime_weeks.length} wk{s.overtime_weeks.length === 1 ? '' : 's'} &gt;38h</span>
                              : <span style={{ color: S.muted }}>—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        ) : (
          <div>
            {compareList.length === 0 ? (
              <p style={{ color: S.dim, textAlign: 'center', padding: 24 }}>Pick 2 shifts from the Shifts tab to compare.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: compareList.length === 2 ? '1fr 1fr' : '1fr', gap: 14 }}>
                {compareList.map(r => (
                  <div key={r.id} style={{ background: S.surface, border: '1px solid ' + S.border, borderRadius: 12, padding: 16 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{dt(r.shift_start)}</p>
                    {[
                      ['Revenue', fmt(r.total_revenue), S.green],
                      ['Labour cost', fmt(r.labour_cost_dollars ?? 0), S.amber],
                      ['Labour ratio', (r.labour_ratio_pct ?? 0).toFixed(1) + '%', (r.labour_ratio_pct ?? 0) < 30 ? S.green : (r.labour_ratio_pct ?? 0) <= 40 ? S.amber : S.red],
                      ['Transactions', String(r.total_transactions), S.text],
                      ['Avg basket', fmt(r.avg_basket), S.text],
                      ['Revenue per hour', fmt(r.revenue_per_hour ?? 0), S.violet],
                      ['Top product', r.top_products?.[0]?.name ?? '—', S.text],
                    ].map(([label, val, col]) => (
                      <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 12 }}>
                        <span style={{ color: S.dim }}>{label}</span>
                        <span style={{ color: col as string, fontWeight: 600 }}>{val}</span>
                      </div>
                    ))}
                  </div>
                ))}
                {compareList.length === 2 && (() => {
                  const [a, b] = compareList
                  const aRatio = a.labour_ratio_pct ?? 0
                  const bRatio = b.labour_ratio_pct ?? 0
                  if (aRatio === 0 || bRatio === 0) return null
                  const diff = ((bRatio - aRatio) / bRatio) * 100
                  const better = aRatio < bRatio ? 'A' : 'B'
                  return (
                    <div style={{ gridColumn: '1 / -1', padding: 14, borderRadius: 10, background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)', textAlign: 'center', fontSize: 13, color: S.violet }}>
                      Shift {better} was <strong>{Math.abs(diff).toFixed(0)}% more efficient</strong> on labour ratio.
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )}
    </div>
  )
}
