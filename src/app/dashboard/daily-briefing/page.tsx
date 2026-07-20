'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/components/providers/BusinessProvider'
import { supabase } from '@/lib/supabase'
import { pickCanonicalBriefing } from '@/lib/aria/briefing-guard'
import { SaveToFilesButton } from '@/components/dashboard/SaveToFilesButton'
import { AriaWhyPanel } from '@/components/dashboard/AriaWhyPanel'
import type { AriaIntelligenceContract } from '@/lib/aria/contract'
import { stripMarkdownToPlainText } from '@/lib/aria/markdown-lite'

interface Rec {
  id: string
  priority: 'high' | 'medium' | 'low'
  category: string
  title: string
  description: string
  action_label: string
  action_type: string
  metric: string
  metric_label: string
  trend: 'up' | 'down' | 'flat' | null
}

interface RadarSignal {
  id: string
  type: string
  title: string
  insight: string
  solution: string
  estimated_monthly_loss_aud: number
  propose_only: boolean
  act_label?: string
  payload: Record<string, unknown>
}

interface RadarPlan {
  title: string
  recommendation: string
  steps: string[]
  estimated_impact: string
  risk: 'low' | 'medium' | 'high'
  reversible: boolean
  propose_only: boolean
  preview_lines: string[]
  affected_count: number
  action_type: string
}

interface Snap {
  sales_yesterday_aud?: string
  sales_today_aud?: string
  revenue_last_7_days_aud?: string
  revenue_prev_7_days_aud?: string
  revenue_trend_pct?: number
  sales_count_7_days?: number
  low_stock_items?: number
  low_stock_names?: string[]
  lapsed_customers?: number
  total_customers?: number
  unanswered_reviews?: number
  external_context?: {
    weather_next_3_days?: Array<{ date: string; weather: string; temp_max: number }>
    upcoming_holidays?: Array<{ name: string; days_away: number }>
  }
}

interface WeatherDay {
  date: string
  description: string
  maxTemp: number
  demand_impact: string
}

interface BriefingResponse {
  recommendations: Rec[]
  generated_at: string
  data_snapshot: Snap
  radar_items?: RadarSignal[]
  cached: boolean
  no_data?: boolean
  no_data_message?: string
  weather_forecast?: WeatherDay[]
  contract?: AriaIntelligenceContract | null
}

interface HistoryEntry {
  id: string
  date: string
  generated_at: string
  content?: string | null
  recommendations?: Rec[]
  data_snapshot?: Snap
}

const G = '#7FB897'
const DG = '#2D5240'
const CARD = 'rgba(255,255,255,0.04)'
const BORDER = '1px solid rgba(255,255,255,0.08)'
const BR = '16px'

function fmtCurrency(val: string | undefined) {
  if (!val) return '—'
  const n = parseFloat(val)
  if (isNaN(n)) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

function Skel({ w = '100%', h = 18 }: { w?: string; h?: number }) {
  return <div style={{ width: w, height: h, background: 'rgba(255,255,255,0.07)', borderRadius: 6 }} />
}

function MetricCard({ label, value, sub, trend, loading }: { label: string; value: string; sub?: string; trend?: 'up' | 'down' | null; loading?: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: 150, background: CARD, border: BORDER, borderRadius: BR, padding: '18px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{label}</div>
      {loading ? <Skel h={28} /> : <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', lineHeight: 1 }}>{value}</div>}
      {sub && !loading && (
        <div style={{ fontSize: 12, marginTop: 6, color: trend === 'up' ? G : trend === 'down' ? '#f87171' : 'rgba(255,255,255,0.4)' }}>{sub}</div>
      )}
    </div>
  )
}

export default function DailyBriefingPage() {
  const business = useBusiness()
  const router = useRouter()
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyView, setHistoryView] = useState<HistoryEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [actionFiring, setActionFiring] = useState<Record<string, boolean>>({})
  const [actionToast, setActionToast] = useState('')
  const [weatherForecast, setWeatherForecast] = useState<WeatherDay[]>([])
  const [radarItems, setRadarItems] = useState<RadarSignal[]>([])
  const [radarPreview, setRadarPreview] = useState<{ signal: RadarSignal; plan: RadarPlan } | null>(null)
  const [radarLoading, setRadarLoading] = useState<string | null>(null)
  const [radarToast, setRadarToast] = useState('')
  const [radarUndoId, setRadarUndoId] = useState<string | null>(null)

  const fetchBriefing = useCallback(async (force = false) => {
    if (!business?.id) return
    if (force) setRefreshing(true)
    try {
      const res = await fetch('/api/aria/daily-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, force_refresh: force }),
      })
      if (res.ok) {
        const data = await res.json()
        setBriefing(data)
        if (Array.isArray(data.weather_forecast) && data.weather_forecast.length > 0) {
          setWeatherForecast(data.weather_forecast)
        }
        if (Array.isArray(data.radar_items)) {
          setRadarItems(data.radar_items)
        }
      }
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }, [business?.id])

  useEffect(() => {
    if (!business?.id) return
    fetchBriefing()
    // BRIEF-INTEGRITY-2 — up to 3 rows can now exist per calendar day (one per writing pipeline),
    // so this fetches enough rows to cover 7 days across all pipelines, then dedupes to one row per
    // date via the same pickCanonicalBriefing() precedence every other read site uses.
    supabase
      .from('aria_daily_briefings')
      .select('id, briefing_date, generated_at, content, source, pipeline')
      .eq('business_id', business.id)
      .order('briefing_date', { ascending: false })
      .limit(21)
      .then(({ data }: { data: Array<{ id: string; briefing_date: string; generated_at: string; content: string | null; source: string | null; pipeline: string }> | null }) => {
        if (!data) return
        const byDate = new Map<string, typeof data>()
        for (const row of data) {
          const arr = byDate.get(row.briefing_date) ?? []
          arr.push(row)
          byDate.set(row.briefing_date, arr)
        }
        const deduped = [...byDate.values()]
          .map(rows => pickCanonicalBriefing(rows))
          .filter((row): row is NonNullable<typeof row> => row !== null)
          .sort((a, b) => b.briefing_date.localeCompare(a.briefing_date))
          .slice(0, 7)
        setHistory(deduped.map(row => ({ id: row.id, date: row.briefing_date, generated_at: row.generated_at, content: row.content })))
      })
  }, [business?.id, fetchBriefing])

  async function handleRecAction(rec: Rec, idx: number) {
    if (!business?.id) return
    const key = String(idx)
    setActionFiring(prev => ({ ...prev, [key]: true }))
    try {
      const actionType = (rec as { action_type?: string }).action_type
      if (actionType === 'reorder' || rec.action_label?.toLowerCase().includes('reorder')) {
        await fetch('/api/pos/purchase-orders', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: business.id, notes: 'Auto from briefing: ' + rec.title }),
        }).catch(() => null)
      } else if (actionType === 'winback' || rec.action_label?.toLowerCase().includes('winback')) {
        await fetch('/api/aria/winback', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: business.id, customer_ids: [] }),
        }).catch(() => null)
      } else if ((rec as unknown as { action_href?: string }).action_href?.includes('/promotions')) {
        router.push('/dashboard/promotions?prefill=flash_deal')
        setActionFiring(prev => ({ ...prev, [key]: false })); return
      } else if ((rec as unknown as { action_href?: string }).action_href?.includes('/reviews')) {
        router.push('/dashboard/reviews')
        setActionFiring(prev => ({ ...prev, [key]: false })); return
      } else if ((rec as unknown as { action_href?: string }).action_href) {
        router.push((rec as unknown as { action_href: string }).action_href)
        setActionFiring(prev => ({ ...prev, [key]: false })); return
      }
      fetch('/api/aria/autopilot-actions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, action_type: 'briefing_rec_actioned', payload: { title: rec.title } }),
      }).catch(() => null)
      setActionToast('Done!')
      setTimeout(() => setActionToast(''), 2500)
    } catch (e) { console.warn('[non-fatal]', e) }
    setActionFiring(prev => ({ ...prev, [key]: false }))
  }

  async function handleRadarSavePlan(signal: RadarSignal) {
    if (!business?.id) return
    setRadarLoading(signal.id + '_save')
    try {
      const res = await fetch('/api/aria/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', business_id: business.id, signal }),
      })
      if (res.ok) {
        setRadarToast('Plan saved to your action queue')
        setTimeout(() => setRadarToast(''), 3000)
      } else {
        const err = await res.json()
        setRadarToast('Error: ' + (err.error ?? 'Failed to save plan'))
        setTimeout(() => setRadarToast(''), 4000)
      }
    } catch { setRadarToast('Failed to save plan'); setTimeout(() => setRadarToast(''), 3000) }
    setRadarLoading(null)
  }

  async function handleRadarPreview(signal: RadarSignal) {
    if (!business?.id) return
    setRadarLoading(signal.id + '_preview')
    try {
      const res = await fetch('/api/aria/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', business_id: business.id, signal }),
      })
      if (res.ok) {
        const data = await res.json()
        setRadarPreview({ signal, plan: data.plan as RadarPlan })
      } else {
        setRadarToast('Failed to load preview'); setTimeout(() => setRadarToast(''), 3000)
      }
    } catch { setRadarToast('Failed to load preview'); setTimeout(() => setRadarToast(''), 3000) }
    setRadarLoading(null)
  }

  async function handleRadarExecute(signal: RadarSignal) {
    if (!business?.id) return
    setRadarLoading(signal.id + '_exec')
    try {
      const res = await fetch('/api/aria/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'execute', business_id: business.id, signal }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setRadarPreview(null)
        setRadarToast(data.detail ?? 'Done!')
        if (data.reversible && data.log_id) setRadarUndoId(data.log_id as string)
        setTimeout(() => { setRadarToast(''); setRadarUndoId(null) }, 6000)
      } else {
        setRadarToast('Error: ' + (data.error ?? 'Execution failed'))
        setTimeout(() => setRadarToast(''), 4000)
      }
    } catch { setRadarToast('Execution failed'); setTimeout(() => setRadarToast(''), 3000) }
    setRadarLoading(null)
  }

  async function handleRadarUndo() {
    if (!business?.id || !radarUndoId) return
    setRadarLoading('undo')
    try {
      const res = await fetch('/api/aria/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'undo', business_id: business.id, log_id: radarUndoId }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setRadarToast('Action undone (' + (data.reverted_count as number) + ' item' + (data.reverted_count !== 1 ? 's' : '') + ' reverted)')
        setRadarUndoId(null)
        setTimeout(() => setRadarToast(''), 3000)
      } else {
        setRadarToast('Undo failed: ' + (data.error ?? 'unknown error'))
        setTimeout(() => setRadarToast(''), 4000)
      }
    } catch { setRadarToast('Undo failed'); setTimeout(() => setRadarToast(''), 3000) }
    setRadarLoading(null)
  }

  const snap: Snap = historyView?.data_snapshot ?? briefing?.data_snapshot ?? {}
  const recs: Rec[] = (historyView?.recommendations ?? briefing?.recommendations ?? []).filter(r => !dismissed.has(r.id))
  const now = new Date()
  const hr = now.getHours()
  const greeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = (business?.owner_name ?? '').split(' ')[0]
  const todayStr = now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const trendPct = snap.revenue_trend_pct ?? 0
  const revWeek = parseFloat(snap.revenue_last_7_days_aud ?? '0')
  const revPrev = parseFloat(snap.revenue_prev_7_days_aud ?? '0')
  const progressPct = revPrev > 0 ? Math.min(100, Math.round((revWeek / revPrev) * 100)) : 0

  const bullets = [
    snap.revenue_last_7_days_aud
      ? `Revenue this week: ${fmtCurrency(snap.revenue_last_7_days_aud)}${trendPct !== 0 ? ` (${trendPct > 0 ? '+' : ''}${trendPct}% vs last week)` : ''}`
      : null,
    (snap.low_stock_items ?? 0) > 0
      ? `${snap.low_stock_items} item${snap.low_stock_items! > 1 ? 's' : ''} running low on stock${snap.low_stock_names?.length ? `: ${snap.low_stock_names.slice(0, 2).join(', ')}` : ''}`
      : snap.low_stock_items === 0 ? 'All items well-stocked' : null,
    (snap.lapsed_customers ?? 0) > 0
      ? `${snap.lapsed_customers} customer${snap.lapsed_customers! > 1 ? 's' : ''} haven't visited in 60+ days`
      : snap.total_customers ? `${snap.total_customers} active customers on your list` : null,
  ].filter((b): b is string => Boolean(b))

  const weather = snap.external_context?.weather_next_3_days ?? []
  const holidays = snap.external_context?.upcoming_holidays ?? []

  // CANOPY-REPORTS-AS-FILES-1 — daily-briefing has no existing PDF/deliverable of its own
  // (confirmed via investigation); builds the same simple HTML shape generateDeliverable() already
  // produces for Ask Aria deliverables, reusing the identical downstream PDF pipeline (see
  // saveReport() in src/lib/aria/canopy-reports.ts) rather than adding a second one.
  function buildBriefingHtml(): string {
    const summary = historyView?.content ? stripMarkdownToPlainText(historyView.content) : bullets.join(' · ')
    const recRows = recs.map(r => `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">${stripMarkdownToPlainText(r.title)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555">${stripMarkdownToPlainText(r.description)}</td></tr>`).join('')
    return `<html><body style="font-family:sans-serif;padding:24px;color:#111">
      <h1 style="font-size:22px">Daily Briefing — ${historyView ? fmtDate(historyView.date) : todayStr}</h1>
      ${summary ? `<p style="background:#f0faf5;border-left:4px solid #7FB897;padding:12px 16px;color:#333">${summary}</p>` : ''}
      ${recRows ? `<table style="width:100%;border-collapse:collapse;margin-top:12px"><thead><tr><th style="text-align:left;padding:8px 12px">Recommendation</th><th style="text-align:left;padding:8px 12px">Detail</th></tr></thead><tbody>${recRows}</tbody></table>` : ''}
    </body></html>`
  }

  const prioColor = (p: string) => ({ high: '#f87171', medium: '#fbbf24', low: G }[p] ?? G)
  const catIcon = (c: string) => ({ customers: '👥', revenue: '💰', stock: '📦', reviews: '⭐', marketing: '📣', compliance: '⚠️' }[c] ?? '💡')

  return (
    <div style={{ display: 'flex', minHeight: '100%', background: '#0d0d14', color: '#fff', fontFamily: "'Inter', sans-serif" }}>
      <style>{`@keyframes shimmer{0%,100%{opacity:1}50%{opacity:.4}}`}</style>

      {/* Main */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px 60px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic', fontSize: 28, fontWeight: 700, margin: 0 }}>
              {greeting}{firstName ? `, ${firstName}` : ''}.
            </h1>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
              {historyView ? `Viewing briefing for ${fmtDate(historyView.date)}` : todayStr}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {historyView && (
              <button onClick={() => setHistoryView(null)} style={{ padding: '8px 16px', borderRadius: 10, border: BORDER, background: CARD, color: 'rgba(255,255,255,0.7)', fontSize: 13, cursor: 'pointer' }}>
                ← Today
              </button>
            )}
            <button onClick={() => fetchBriefing(true)} disabled={refreshing || loading}
              style={{ padding: '8px 16px', borderRadius: 10, border: `1px solid ${G}`, background: 'transparent', color: G, fontSize: 13, cursor: refreshing ? 'wait' : 'pointer', opacity: refreshing ? 0.6 : 1 }}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            {!loading && (bullets.length > 0 || historyView?.content) && (
              <SaveToFilesButton
                sourceKind="daily_briefing" title={'Daily Briefing — ' + (historyView ? fmtDate(historyView.date) : todayStr)}
                grounding="derived" html={buildBriefingHtml()}
                style={{ padding: '8px 16px', borderRadius: 10, border: BORDER, background: CARD, color: 'rgba(255,255,255,0.7)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }} />
            )}
          </div>
        </div>

        {/* Executive Summary */}
        <div style={{ background: CARD, border: BORDER, borderLeft: `4px solid ${G}`, borderRadius: BR, padding: '22px 24px', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${G}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✦</div>
            <span style={{ fontSize: 12, fontWeight: 700, color: G, letterSpacing: '0.06em' }}>ARIA'S EXECUTIVE SUMMARY</span>
          </div>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Skel /><Skel w="80%" /><Skel w="60%" />
            </div>
          ) : historyView?.content ? (
            <p style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(255,255,255,0.85)', margin: 0 }}>{stripMarkdownToPlainText(historyView.content)}</p>
          ) : bullets.length > 0 ? (
            <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {bullets.map((b, i) => <li key={i} style={{ fontSize: 14, lineHeight: 1.65, color: 'rgba(255,255,255,0.85)' }}>{b}</li>)}
            </ul>
          ) : (
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
              {briefing?.no_data ? briefing.no_data_message : 'No briefing data yet — check back tomorrow.'}
            </p>
          )}
          {briefing?.generated_at && !loading && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', marginTop: 12 }}>
              Generated {new Date(briefing.generated_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
              {briefing.cached ? ' · cached' : ''}
            </div>
          )}
          {!loading && !historyView && <AriaWhyPanel contract={briefing?.contract} />}
        </div>

        {/* Weather this week */}
        {weatherForecast.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Weather this week</div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {weatherForecast.map(w => {
                const icon = w.description.includes('Sunny') ? '☀️' : w.description.includes('Rainy') ? '🌧️' : w.description.includes('Storm') ? '⛈️' : w.description.includes('Shower') ? '🌦️' : '⛅'
                const dayName = new Date(w.date).toLocaleDateString('en-AU', { weekday: 'short' })
                return (
                  <div key={w.date} style={{ flexShrink: 0, textAlign: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', minWidth: 80 }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{dayName}</div>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{Math.round(w.maxTemp)}°</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{w.description}</div>
                    <div style={{ fontSize: 9, color: w.demand_impact.startsWith('+') ? '#7FB897' : w.demand_impact.startsWith('-') ? '#ef4444' : 'rgba(255,255,255,0.3)', marginTop: 3, fontWeight: 600 }}>{w.demand_impact}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Metric cards */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
          <MetricCard label="Yesterday Revenue" value={fmtCurrency(snap.sales_yesterday_aud)} loading={loading} />
          <MetricCard
            label="This Week" value={fmtCurrency(snap.revenue_last_7_days_aud)}
            sub={trendPct !== 0 ? `${trendPct > 0 ? '▲' : '▼'} ${Math.abs(trendPct)}% vs last week` : undefined}
            trend={trendPct > 0 ? 'up' : trendPct < 0 ? 'down' : null}
            loading={loading}
          />
          <MetricCard
            label="Low Stock Items" value={loading ? '—' : String(snap.low_stock_items ?? 0)}
            sub={snap.low_stock_names?.[0]}
            loading={loading}
          />
          <MetricCard
            label="Lapsed Customers" value={loading ? '—' : String(snap.lapsed_customers ?? 0)}
            sub={snap.total_customers != null ? `of ${snap.total_customers} total` : undefined}
            loading={loading}
          />
        </div>

        {/* Revenue vs previous week bar */}
        {!loading && revPrev > 0 && (
          <div style={{ background: CARD, border: BORDER, borderRadius: BR, padding: '18px 22px', marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>Revenue vs Previous Week</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: trendPct >= 0 ? G : '#f87171' }}>{progressPct}%</span>
            </div>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progressPct}%`, background: `linear-gradient(90deg,${DG},${G})`, borderRadius: 99 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>A$0</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>Previous: {fmtCurrency(snap.revenue_prev_7_days_aud)}</span>
            </div>
          </div>
        )}

        {/* Morning Loss Radar */}
        {!historyView && radarItems.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444' }} />
              <h2 style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Morning Loss Radar</h2>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>— top money leaks detected from live data</span>
            </div>

            {/* Preview card overlay */}
            {radarPreview && (
              <div style={{ background: 'rgba(15,15,25,0.96)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: BR, padding: '20px 22px', marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{radarPreview.plan.title}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 14, lineHeight: 1.6 }}>{radarPreview.plan.recommendation}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>What this will do</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
                  {radarPreview.plan.preview_lines.map((line, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#fff' }}>
                      <span style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>•</span>
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{radarPreview.plan.affected_count > 0 ? radarPreview.plan.affected_count + ' affected' : ''}</span>
                  <span style={{ fontSize: 12, color: '#7FB897' }}>{radarPreview.plan.estimated_impact}</span>
                  {radarPreview.plan.reversible && <span style={{ fontSize: 11, color: '#22c55e' }}>Reversible within 1 hour</span>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleRadarExecute(radarPreview.signal)}
                    disabled={radarLoading === radarPreview.signal.id + '_exec'}
                    style={{ flex: 1, padding: '9px 0', borderRadius: 10, background: '#2D5240', color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', opacity: radarLoading === radarPreview.signal.id + '_exec' ? 0.6 : 1, fontFamily: 'inherit' }}
                  >
                    {radarLoading === radarPreview.signal.id + '_exec' ? 'Working…' : 'Confirm — Do it'}
                  </button>
                  <button
                    onClick={() => setRadarPreview(null)}
                    style={{ padding: '9px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Cancel
                  </button>
                </div>
                <p style={{ fontSize: 10, textAlign: 'center', color: 'rgba(255,255,255,0.22)', margin: '10px 0 0' }}>
                  Nothing executes until you confirm above
                </p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {radarItems.map(signal => (
                <div key={signal.id} style={{ background: CARD, border: '1px solid rgba(239,68,68,0.15)', borderRadius: BR, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{signal.title}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '2px 7px', borderRadius: 99, flexShrink: 0 }}>
                          {'$' + signal.estimated_monthly_loss_aud + '/mo'}
                        </span>
                      </div>
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: '0 0 4px', lineHeight: 1.55 }}>{signal.insight}</p>
                      <p style={{ fontSize: 12, color: 'rgba(127,184,151,0.8)', margin: 0, lineHeight: 1.55 }}>{signal.solution}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 7, flexShrink: 0, alignItems: 'center' }}>
                      <button
                        onClick={() => handleRadarSavePlan(signal)}
                        disabled={radarLoading === signal.id + '_save'}
                        style={{ padding: '6px 12px', borderRadius: 9, background: 'rgba(45,82,64,0.2)', border: '1px solid rgba(127,184,151,0.25)', color: 'rgba(127,184,151,0.8)', fontSize: 12, cursor: 'pointer', opacity: radarLoading === signal.id + '_save' ? 0.6 : 1, fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                      >
                        {radarLoading === signal.id + '_save' ? 'Saving…' : 'Save plan'}
                      </button>
                      {!signal.propose_only && (
                        <button
                          onClick={() => handleRadarPreview(signal)}
                          disabled={radarLoading === signal.id + '_preview' || Boolean(radarPreview)}
                          style={{ padding: '6px 12px', borderRadius: 9, background: '#2D5240', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: (radarLoading === signal.id + '_preview' || Boolean(radarPreview)) ? 0.6 : 1, fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                        >
                          {radarLoading === signal.id + '_preview' ? 'Loading…' : (signal.act_label ?? 'Act on it')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Predictions */}
        {!historyView && (weather.length > 0 || holidays.length > 0) && (
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>Upcoming Conditions</h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {weather.slice(0, 3).map((w, i) => (
                <div key={i} style={{ flex: 1, minWidth: 130, background: CARD, border: BORDER, borderRadius: BR, padding: '16px 18px' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>{i === 0 ? 'Tomorrow' : i === 1 ? 'In 2 days' : fmtDate(w.date)}</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{w.weather}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{w.temp_max}°C</div>
                </div>
              ))}
              {holidays.map((h, i) => (
                <div key={i} style={{ flex: 1, minWidth: 160, background: CARD, border: BORDER, borderRadius: BR, padding: '16px 18px' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>
                    {h.days_away === 0 ? 'Today' : h.days_away === 1 ? 'Tomorrow' : `In ${h.days_away} days`}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>🎉 {h.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action items */}
        {recs.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>Action Items</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {recs.map(r => (
                <div key={r.id} style={{ background: CARD, border: BORDER, borderRadius: BR, padding: '18px 22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 14 }}>{catIcon(r.category)}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: prioColor(r.priority), textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.priority}</span>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>{r.category}</span>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{stripMarkdownToPlainText(r.title)}</div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>{stripMarkdownToPlainText(r.description)}</div>
                      {r.metric && (
                        <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '4px 10px' }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: r.trend === 'up' ? G : r.trend === 'down' ? '#f87171' : '#fff' }}>{r.metric}</span>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>{r.metric_label}</span>
                          {r.trend === 'up' && <span style={{ color: G, fontSize: 11 }}>▲</span>}
                          {r.trend === 'down' && <span style={{ color: '#f87171', fontSize: 11 }}>▼</span>}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {r.action_label && (
                        <button onClick={() => handleRecAction(r, recs.indexOf(r))} disabled={actionFiring[String(recs.indexOf(r))]}
                          style={{ padding: '7px 14px', borderRadius: 10, background: G + '22', border: '1px solid ' + G + '66', color: G, fontSize: 12, fontWeight: 600, cursor: actionFiring[String(recs.indexOf(r))] ? 'wait' : 'pointer', whiteSpace: 'nowrap', opacity: actionFiring[String(recs.indexOf(r))] ? 0.6 : 1, fontFamily: 'inherit' }}>
                          {actionFiring[String(recs.indexOf(r))] ? '…' : r.action_label}
                        </button>
                      )}
                      <a href={'/dashboard/ask-aria?q=' + encodeURIComponent(r.title + ': ' + r.description)}
                        style={{ padding: '7px 14px', borderRadius: 10, background: G + '18', border: '1px solid ' + G + '44', color: G, fontSize: 12, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                        Ask Aria
                      </a>
                      <button onClick={() => setDismissed(d => new Set([...d, r.id]))}
                        style={{ padding: '7px 10px', borderRadius: 10, background: 'transparent', border: BORDER, color: 'rgba(255,255,255,0.3)', fontSize: 13, cursor: 'pointer' }}>
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No data */}
        {!loading && briefing?.no_data && recs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px', background: CARD, border: BORDER, borderRadius: BR }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>📊</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>No data yet</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)' }}>{briefing.no_data_message}</div>
          </div>
        )}
      </div>

      {actionToast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', padding: '10px 18px', borderRadius: 10, background: '#1D9E75', color: '#fff', fontSize: 13, fontWeight: 600, zIndex: 60 }}>
          ✓ {actionToast}
        </div>
      )}
      {radarToast && (
        <div style={{ position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderRadius: 10, background: '#1a1a2e', border: '1px solid rgba(127,184,151,0.4)', color: '#fff', fontSize: 13, fontWeight: 600, zIndex: 61 }}>
          <span style={{ color: '#7FB897' }}>✓</span>
          <span>{radarToast}</span>
          {radarUndoId && (
            <button
              onClick={handleRadarUndo}
              disabled={radarLoading === 'undo'}
              style={{ marginLeft: 8, padding: '3px 10px', borderRadius: 7, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {radarLoading === 'undo' ? 'Undoing…' : 'Undo'}
            </button>
          )}
        </div>
      )}

      {/* History sidebar */}
      <div style={{ width: 210, borderLeft: BORDER, padding: '32px 14px', flexShrink: 0, overflowY: 'auto' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>History</div>
        {history.length === 0 ? (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.28)', lineHeight: 1.6 }}>No previous briefings.</div>
        ) : history.map(h => (
          <button key={h.id} onClick={() => setHistoryView(prev => prev?.id === h.id ? null : h)}
            style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: historyView?.id === h.id ? `1px solid ${G}55` : BORDER, background: historyView?.id === h.id ? `${G}12` : CARD, cursor: 'pointer', marginBottom: 8, display: 'block', fontFamily: 'inherit' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{fmtDate(h.date)}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.32)', marginTop: 3 }}>
              {h.content ? 'Daily briefing' : '—'}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
