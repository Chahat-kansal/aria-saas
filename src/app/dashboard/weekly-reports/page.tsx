'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { AriaSays } from '@/components/dashboard/AriaSays'

interface DayData { date: string; revenue: number; transactions: number }
interface ProductStat { name: string; revenue: number; quantitySold: number }
interface PaymentBreakdown { method: string; total: number }
interface ReportDataJson { weekStart?: string; weekEnd?: string; revenueByDay?: DayData[]; topProductsByRevenue?: ProductStat[]; topProductsByUnits?: ProductStat[]; paymentMethods?: PaymentBreakdown[]; suspiciousTransactions?: Array<{ flagReason: string }>; priorWeekRevenue?: number; priorWeekTransactions?: number; revenueChangePercent?: number | null }
interface NarrativeJson { executive_summary?: string; high_confidence_insights?: string[]; split_decisions?: Array<{ topic: string; optimist_view?: string; critic_view?: string; strategist_view?: string }>; promo_recommendations?: Array<{ title: string; mechanic: string; timing: string; expected_impact: string; urgency: string }>; suspicious_summary?: string | null }
interface ReportRecord { id: string; week_starting: string; pdf_url: string | null; email_sent: boolean; email_sent_at: string | null; revenue: number | null; transaction_count: number | null; avg_ticket: number | null; new_customers: number | null; goal_attainment_pct: number | null; created_at: string }
interface FullRecord extends ReportRecord { report_data: ReportDataJson | null; narrative: NarrativeJson | null }

const fmtAud = (n: number | null | undefined) => n == null ? '—' : 'A$' + (Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtCompact = (n: number | null | undefined) => n == null ? '—' : 'A$' + Math.round(Number(n) || 0).toLocaleString('en-AU')
const weekRange = (start: string) => { const s = new Date(start); const e = new Date(s.getTime() + 6 * 86400_000); return `${s.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}` }
const fmtPct = (n: number | null) => n == null ? null : (n > 0 ? '↑' : n < 0 ? '↓' : '→') + ' ' + Math.abs(n).toFixed(0) + '%'

const C = { surface: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.07)', green: '#7FB897', sage: '#2D5240', amber: '#f59e0b', red: '#ef4444', violet: '#A78BFA', text: '#E8EDE7', dim: 'rgba(255,255,255,0.4)', muted: 'rgba(255,255,255,0.2)' }
const STEPS = ['Gathering sales data…', 'Running Aria Council analysis…', 'Generating promo recommendations…', 'Rendering PDF…', 'Uploading & sending email…']

function AreaChart({ data, target }: { data: DayData[]; target?: number }) {
  if (data.length === 0) return null
  const max = Math.max(target ?? 0, ...data.map(d => d.revenue), 1)
  const w = 100 / Math.max(1, data.length - 1)
  const points = data.map((d, i) => `${i * w},${100 - (d.revenue / max) * 90}`).join(' ')
  const area = `0,100 ${points} 100,100`
  return (
    <div style={{ position: 'relative', height: 140 }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.green} stopOpacity="0.4" />
            <stop offset="100%" stopColor={C.green} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {target && target > 0 && <line x1="0" y1={100 - (target / max) * 90} x2="100" y2={100 - (target / max) * 90} stroke={C.amber} strokeWidth="0.4" strokeDasharray="1,1" />}
        <polygon points={area} fill="url(#grad)" />
        <polyline points={points} fill="none" stroke={C.green} strokeWidth="0.6" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        {data.map((d, i) => (
          <span key={i} style={{ fontSize: 9, color: C.muted }}>{new Date(d.date).toLocaleDateString('en-AU', { weekday: 'short' })}</span>
        ))}
      </div>
    </div>
  )
}

export default function WeeklyReportsPage() {
  const { business } = useBusinessContext()
  const [records, setRecords] = useState<ReportRecord[]>([])
  const [selected, setSelected] = useState<FullRecord | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const [genError, setGenError] = useState<string | null>(null)
  const [target, setTarget] = useState<number>(0)
  const [targetSaving, setTargetSaving] = useState(false)
  const [targetSaved, setTargetSaved] = useState(false)

  const loadRecords = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    const res = await fetch('/api/reports/weekly-records?business_id=' + business.id).then(r => r.json()).catch(() => ({ records: [] }))
    setRecords(res.records ?? [])
    if (!selected && res.records?.length > 0) loadDetail(res.records[0].id)
    setLoading(false)
  }, [business?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadDetail(id: string) {
    if (!business?.id) return
    setLoadingDetail(true)
    const r = await fetch(`/api/reports/weekly-records?business_id=${business.id}&id=${id}`).then(r => r.json()).catch(() => null)
    if (r?.record) setSelected(r.record)
    setLoadingDetail(false)
  }

  useEffect(() => { loadRecords() }, [loadRecords])
  useEffect(() => {
    if (!business?.id) return
    fetch('/api/reports/weekly-goal?business_id=' + business.id).then(r => r.json()).then(d => setTarget(Number(d.target ?? 0))).catch(() => {})
  }, [business?.id])

  useEffect(() => {
    if (!generating) return
    const timer = setInterval(() => setStepIdx(i => (i + 1) % STEPS.length), 3500)
    return () => clearInterval(timer)
  }, [generating])

  async function saveTarget() {
    if (!business?.id) return
    setTargetSaving(true)
    await fetch('/api/reports/weekly-goal', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: business.id, target }) })
    setTargetSaving(false); setTargetSaved(true)
    setTimeout(() => setTargetSaved(false), 1800)
  }

  async function generate() {
    if (!business?.id) return
    setGenerating(true); setStepIdx(0); setGenError(null)
    try {
      const res = await fetch('/api/reports/weekly-generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id }),
      }).then(r => r.json())
      if (res.error) { setGenError(res.error); return }
      if (res.not_enough_data) { setGenError(res.message ?? 'Not enough sales data yet.'); return }
      await loadRecords()
    } catch { setGenError('Network error — please try again.') }
    finally { setGenerating(false) }
  }

  // KPI deltas vs prior week (from records list)
  const currentRev = selected?.revenue ?? null
  const priorIdx = records.findIndex(r => r.id === selected?.id) + 1
  const prior = records[priorIdx]
  const revDelta = currentRev != null && prior?.revenue != null && prior.revenue > 0 ? ((currentRev - Number(prior.revenue)) / Number(prior.revenue)) * 100 : null
  const txnDelta = selected?.transaction_count != null && prior?.transaction_count != null && prior.transaction_count > 0 ? ((selected.transaction_count - prior.transaction_count) / prior.transaction_count) * 100 : null
  const ticketDelta = selected?.avg_ticket != null && prior?.avg_ticket != null && Number(prior.avg_ticket) > 0 ? ((Number(selected.avg_ticket) - Number(prior.avg_ticket)) / Number(prior.avg_ticket)) * 100 : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#0E1812', color: C.text, fontFamily: 'Manrope, sans-serif' }}>
      <div style={{ padding: '16px 16px 0' }}>
        <AriaSays businessId={business?.id ?? null} page="weekly-reports" />
      </div>
      <div style={{ display: 'flex', flex: 1 }}>
      {/* Sidebar */}
      <aside style={{ width: 280, flexShrink: 0, borderRight: '1px solid ' + C.border, padding: 16, overflowY: 'auto' }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Reports</h2>
        <button onClick={generate} disabled={generating || !business?.id}
          style={{ width: '100%', padding: '10px 14px', borderRadius: 9, border: 'none', background: C.sage, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 14, opacity: generating ? 0.6 : 1 }}>
          {generating ? '⏳ Generating…' : '✦ Generate this week'}
        </button>
        {loading ? <p style={{ fontSize: 12, color: C.dim }}>Loading…</p>
          : records.length === 0 ? <p style={{ fontSize: 12, color: C.dim }}>No reports yet.</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {records.map(r => (
                <button key={r.id} onClick={() => loadDetail(r.id)}
                  style={{ textAlign: 'left', padding: '9px 12px', borderRadius: 8, border: '1px solid ' + (selected?.id === r.id ? 'rgba(127,184,151,0.4)' : C.border), background: selected?.id === r.id ? 'rgba(127,184,151,0.08)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, margin: 0, color: selected?.id === r.id ? C.green : C.text }}>{weekRange(r.week_starting)}</p>
                  <p style={{ fontSize: 10, color: C.dim, margin: '2px 0 0' }}>{fmtCompact(r.revenue)} · {r.transaction_count ?? 0} sales {r.email_sent ? ' · 📧 Sent' : ''}</p>
                </button>
              ))}
            </div>
          )}
        <div style={{ marginTop: 18, padding: 12, borderRadius: 8, background: C.surface, border: '1px solid ' + C.border }}>
          <p style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Weekly revenue target</p>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="number" min={0} step={100} value={target} onChange={e => setTarget(Number(e.target.value))}
              style={{ flex: 1, padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid ' + C.border, color: C.text, fontSize: 12, fontFamily: 'inherit' }} />
            <button onClick={saveTarget} disabled={targetSaving} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: C.sage, color: C.green, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{targetSaving ? '…' : 'Save'}</button>
          </div>
          {targetSaved && <p style={{ fontSize: 10, color: C.green, marginTop: 4 }}>✓ Saved</p>}
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: 28, overflowY: 'auto' }}>
        {generating && (
          <div style={{ marginBottom: 18, padding: 16, borderRadius: 12, background: 'rgba(45,82,64,0.12)', border: '1px solid rgba(127,184,151,0.25)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: C.green, marginBottom: 8 }}>✦ Aria is generating your report…</p>
            {STEPS.map((step, i) => (
              <div key={step} style={{ fontSize: 11, color: i <= stepIdx ? C.text : C.muted, padding: '3px 0' }}>{i < stepIdx ? '✓' : i === stepIdx ? '›' : '○'} {step}</div>
            ))}
          </div>
        )}
        {genError && <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', color: C.red, fontSize: 12 }}>{genError}</div>}

        {!selected && !loading && records.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <p style={{ fontSize: 36, marginBottom: 8 }}>📊</p>
            <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>No reports yet</p>
            <p style={{ fontSize: 13, color: C.dim, marginBottom: 16 }}>Generated Monday 8 AM AEST. Click above to generate now.</p>
          </div>
        )}

        {loadingDetail && <p style={{ color: C.dim, padding: 24 }}>Loading…</p>}

        {selected && (
          <>
            <div style={{ marginBottom: 22 }}>
              <p style={{ fontSize: 11, color: C.green, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Week of</p>
              <h1 style={{ fontSize: 28, fontWeight: 600, fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', margin: '4px 0 6px' }}>{weekRange(selected.week_starting)}</h1>
              {selected.pdf_url && (
                <a href={selected.pdf_url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-block', marginTop: 4, padding: '6px 14px', borderRadius: 8, background: 'rgba(45,82,64,0.3)', color: C.green, fontSize: 11, fontWeight: 700, textDecoration: 'none', border: '1px solid rgba(127,184,151,0.2)' }}>
                  ⬇ Download PDF
                </a>
              )}
              {selected.email_sent_at && (
                <span style={{ marginLeft: 10, fontSize: 11, color: C.dim }}>📧 Sent {new Date(selected.email_sent_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>

            {/* KPI scorecards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 22 }}>
              {[
                { label: 'Revenue', value: fmtAud(selected.revenue), delta: revDelta, color: C.green },
                { label: 'Transactions', value: String(selected.transaction_count ?? 0), delta: txnDelta, color: C.violet },
                { label: 'Avg ticket', value: fmtAud(selected.avg_ticket), delta: ticketDelta, color: C.amber },
                { label: 'New customers', value: String(selected.new_customers ?? 0), delta: null, color: '#60a5fa' },
              ].map(k => (
                <div key={k.label} style={{ padding: 16, borderRadius: 12, background: C.surface, border: '1px solid ' + C.border }}>
                  <p style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</p>
                  <p style={{ fontSize: 26, fontWeight: 600, color: k.color, fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', margin: '4px 0' }}>{k.value}</p>
                  {k.delta !== null && (
                    <p style={{ fontSize: 11, color: k.delta > 0 ? C.green : k.delta < 0 ? C.red : C.dim, fontWeight: 600 }}>{fmtPct(k.delta)} vs prior week</p>
                  )}
                </div>
              ))}
            </div>

            {/* Goal progress */}
            {target > 0 && selected.revenue != null && (
              <div style={{ marginBottom: 22, padding: 16, borderRadius: 12, background: C.surface, border: '1px solid ' + C.border }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <p style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Goal vs actual</p>
                  <p style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>{fmtAud(selected.revenue)} / {fmtAud(target)} · {((Number(selected.revenue) / target) * 100).toFixed(0)}%</p>
                </div>
                <div style={{ width: '100%', height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: Math.min(100, (Number(selected.revenue) / target) * 100) + '%', height: '100%', background: C.green }} />
                </div>
              </div>
            )}

            {/* Revenue chart */}
            {selected.report_data?.revenueByDay && selected.report_data.revenueByDay.length > 0 && (
              <div style={{ marginBottom: 22, padding: 18, borderRadius: 12, background: C.surface, border: '1px solid ' + C.border }}>
                <p style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Revenue · 7 days</p>
                <AreaChart data={selected.report_data.revenueByDay} target={target > 0 ? target / 7 : undefined} />
              </div>
            )}

            {/* Executive summary */}
            {selected.narrative?.executive_summary && (
              <div style={{ marginBottom: 22, padding: 18, borderRadius: 12, background: 'rgba(45,82,64,0.12)', border: '1px solid rgba(127,184,151,0.25)' }}>
                <p style={{ fontSize: 11, color: C.green, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontWeight: 700 }}>✦ Executive summary</p>
                <p style={{ fontSize: 14, lineHeight: 1.65, color: C.text, whiteSpace: 'pre-wrap' }}>{selected.narrative.executive_summary}</p>
              </div>
            )}

            {/* Two-column: Top products + Customer highlights */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 22 }}>
              {selected.report_data?.topProductsByRevenue && selected.report_data.topProductsByRevenue.length > 0 && (
                <div style={{ padding: 16, borderRadius: 12, background: C.surface, border: '1px solid ' + C.border }}>
                  <p style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Top products by revenue</p>
                  {(() => { const max = Math.max(1, ...(selected.report_data?.topProductsByRevenue ?? []).map(p => p.revenue)); return (selected.report_data?.topProductsByRevenue ?? []).slice(0, 6).map((p, i) => (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                        <span>{p.name}</span><span style={{ color: C.green }}>{fmtAud(p.revenue)}</span>
                      </div>
                      <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                        <div style={{ width: (p.revenue / max * 100) + '%', height: '100%', background: C.green, borderRadius: 2 }} />
                      </div>
                    </div>
                  )) })()}
                </div>
              )}
              {selected.report_data?.paymentMethods && selected.report_data.paymentMethods.length > 0 && (
                <div style={{ padding: 16, borderRadius: 12, background: C.surface, border: '1px solid ' + C.border }}>
                  <p style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Payments</p>
                  {selected.report_data.paymentMethods.map((p, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ textTransform: 'capitalize' }}>{p.method}</span>
                      <span style={{ color: C.green, fontWeight: 600 }}>{fmtAud(p.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Suspicious */}
            {selected.narrative?.suspicious_summary && (
              <div style={{ marginBottom: 22, padding: 16, borderRadius: 12, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <p style={{ fontSize: 11, color: C.amber, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, fontWeight: 700 }}>⚠ Flagged transactions</p>
                <p style={{ fontSize: 12, color: C.text, lineHeight: 1.55 }}>{selected.narrative.suspicious_summary}</p>
              </div>
            )}

            {/* Promo recommendations */}
            {selected.narrative?.promo_recommendations && selected.narrative.promo_recommendations.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <p style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>✦ AI recommendations</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                  {selected.narrative.promo_recommendations.map((r, i) => (
                    <div key={i} style={{ padding: 14, borderRadius: 10, background: C.surface, borderLeft: '3px solid ' + (r.urgency === 'high' ? C.red : r.urgency === 'medium' ? C.amber : C.green), border: '1px solid ' + C.border }}>
                      <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{r.title}</p>
                      <p style={{ fontSize: 11, color: C.dim, marginBottom: 6 }}>{r.timing}</p>
                      <p style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>{r.mechanic}</p>
                      <p style={{ fontSize: 11, color: C.green, marginTop: 6, fontWeight: 600 }}>{r.expected_impact}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
      </div>
    </div>
  )
}
