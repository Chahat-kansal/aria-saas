'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { AriaSays } from '@/components/dashboard/AriaSays'
import BankTab from './BankTab'
import { toAESTWallClock } from '@/lib/date-au'

interface BankAccount { id: string; account_name: string | null; institution_name: string | null; balance: number | null; last_synced_at: string | null }
interface BankStatus { connected: boolean; accounts: BankAccount[]; total_balance: number }

interface DayForecast {
  date: string; day: string; revenue_actual: number | null; revenue_forecast: number
  expenses_actual: number | null; expenses_forecast: number
  net: number; cumulative: number; is_past: boolean
}

interface ManualExpense { label: string; amount: number }

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: 'var(--text-primary)',
  muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  green: '#22C55E', red: '#EF4444', amber: '#F59E0B', violet: '#8B5CF6',
  border: 'rgba(255,255,255,0.07)',
}
function fmt(n: number) { return 'A$' + Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) }

const DEFAULT_EXPENSES: ManualExpense[] = [
  { label: 'Rent', amount: 0 },
  { label: 'Wages', amount: 0 },
  { label: 'Utilities', amount: 0 },
  { label: 'COGS (auto)', amount: 0 },
]

export default function CashFlowPage() {
  const { business } = useBusinessContext()
  const [activeTab, setActiveTab] = useState<'forecast' | 'bank'>('forecast')
  const [bank, setBank] = useState<BankStatus | null>(null)
  const [bankSyncing, setBankSyncing] = useState(false)
  const [days, setDays] = useState<DayForecast[]>([])
  const [loading, setLoading] = useState(true)
  const [horizon, setHorizon] = useState(30)
  const [scenario, setScenario] = useState<'base' | 'optimistic' | 'pessimistic'>('base')
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const [expenses, setExpenses] = useState<ManualExpense[]>(DEFAULT_EXPENSES.map(e => ({ ...e })))
  const [showExpensePanel, setShowExpensePanel] = useState(false)
  const [newExpenseLabel, setNewExpenseLabel] = useState('')
  const [newExpenseAmount, setNewExpenseAmount] = useState('')
  const [expensesSaving, setExpensesSaving] = useState(false)
  const [expensesSavedAt, setExpensesSavedAt] = useState<string>('')
  const [cashCommentary, setCashCommentary] = useState<string | null>(null)
  const [dailyBurn, setDailyBurn] = useState<number | null>(null)
  const [runwayDays, setRunwayDays] = useState<number | null>(null)
  const [lowestPoint, setLowestPoint] = useState<number | null>(null)
  const [pendingPOs, setPendingPOs] = useState<Array<{id: string; supplier_name?: string; total_amount?: number; due_date?: string; status: string}>>([])
  const [lastYearData, setLastYearData] = useState<Array<{date: string; lastYearRevenue: number}>>([])
  const [seasonalInsight, setSeasonalInsight] = useState<string>('')

  // Load persisted expenses on mount
  useEffect(() => {
    if (!business?.id) return
    fetch('/api/business-expenses').then(r => r.json()).then((d: { expenses?: Array<{ label: string; amount: number }> }) => {
      if (Array.isArray(d.expenses) && d.expenses.length > 0) {
        setExpenses(d.expenses.map(e => ({ label: e.label, amount: Number(e.amount) || 0 })))
      }
    }).catch(() => { /* keep defaults */ })
  }, [business?.id])

  async function saveExpenses(rows: ManualExpense[]) {
    if (!business?.id) return
    setExpensesSaving(true)
    const r = await fetch('/api/business-expenses', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expenses: rows }),
    }).then(r => r.json()).catch(() => ({ error: 'Network error' }))
    setExpensesSaving(false)
    if (!r.error) setExpensesSavedAt(new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }))
  }
  const chartRef = useRef<HTMLCanvasElement>(null)
  const chartInstance = useRef<unknown>(null)

  const SCENARIO_MULT = { base: 1, optimistic: 1.2, pessimistic: 0.75 }

  // Total fixed monthly expenses from manual entry
  const totalMonthlyExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  // Daily fixed expense from manual entries (non-COGS ones)
  const fixedDailyExpense = (totalMonthlyExpenses - (expenses.find(e => e.label === 'COGS (auto)')?.amount ?? 0)) / 30

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    try {
      const salesRes = await fetch('/api/pos/sales?business_id=' + business.id + '&limit=500')
      const salesData = await salesRes.json() as { sales?: Array<{ created_at: string; total_amount: number; status: string }> }
      const sales = (salesData.sales ?? []).filter(s => s.status !== 'voided')

      // INTEL-COMPUTE-4 — /api/pos/sales now defaults to status='completed' server-side (fixed in
      // INTEL-COMPUTE-2), so the client-side `!== 'voided'` filter above is redundant but harmless.
      // The real remaining bug: date/day-of-week extraction via raw created_at.split('T')[0] +
      // new Date(d).getDay() (UTC), misattributing AEST-morning sales to the wrong day -- directly
      // undermines dowAvg, the day-of-week baseline this forecast's revenue projection is built on.
      const revenueByDate: Record<string, number> = {}
      const dowByDate: Record<string, number> = {}
      for (const s of sales) {
        const shifted = toAESTWallClock(s.created_at)
        const d = shifted.toISOString().split('T')[0]
        revenueByDate[d] = (revenueByDate[d] ?? 0) + Number(s.total_amount ?? 0)
        dowByDate[d] = shifted.getUTCDay()
      }
      const dowAvg: number[] = [0, 1, 2, 3, 4, 5, 6].map(dow => {
        const entries = Object.entries(revenueByDate).filter(([d]) => dowByDate[d] === dow)
        if (!entries.length) return 0
        return entries.reduce((s, [, v]) => s + v, 0) / entries.length
      })
      const mult = SCENARIO_MULT[scenario]
      const today = new Date()
      const forecastDays: DayForecast[] = []
      let cumulative = 0
      for (let i = -7; i < horizon; i++) {
        const d = new Date(today); d.setDate(today.getDate() + i)
        const dateStr = d.toISOString().split('T')[0]
        const dow = d.getDay()
        const isPast = i < 0
        const actual = revenueByDate[dateStr] ?? null
        const avgRevenue = Object.values(revenueByDate).reduce((a, b) => a + b, 0) / Math.max(Object.keys(revenueByDate).length, 1)
        const baseRevenue = dowAvg[dow] || avgRevenue
        const forecast = baseRevenue * mult
        // Use manual expenses if entered, otherwise 68% estimate
        const cogsRatio = 0.35 // estimated COGS as % of revenue
        const estCogs = forecast * cogsRatio
        const dailyFixed = fixedDailyExpense > 0 ? fixedDailyExpense : forecast * 0.33
        const estExpenses = estCogs + dailyFixed
        const net = (actual ?? forecast) - estExpenses
        cumulative += net
        forecastDays.push({ date: dateStr, day: d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }), revenue_actual: isPast ? (actual ?? 0) : null, revenue_forecast: Math.round(forecast), expenses_forecast: Math.round(estExpenses), expenses_actual: null, net: Math.round(net), cumulative: Math.round(cumulative), is_past: isPast })
      }
      setDays(forecastDays)

      // Compute burn metrics
      const pastDays = forecastDays.filter((d: DayForecast) => new Date(d.date) < new Date())
      const recentPast = pastDays.slice(-7)
      const burn = recentPast.length > 0
        ? recentPast.reduce((s: number, d: DayForecast) => s + (d.net ?? 0), 0) / recentPast.length
        : 0
      const currentForecast = forecastDays.find((d: DayForecast) => new Date(d.date) >= new Date())
      const balance = currentForecast?.cumulative ?? forecastDays[forecastDays.length - 1]?.cumulative ?? 0
      const runway = burn < 0 ? Math.round(Math.abs(balance / burn)) : null
      const lowest = Math.min(...forecastDays.map((d: DayForecast) => d.cumulative ?? 0))
      setDailyBurn(burn)
      setRunwayDays(runway)
      setLowestPoint(lowest)
      if (business?.id) {
        fetch('/api/aria/cash-commentary', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: business.id, burn_rate: burn, runway_days: runway, lowest_point: lowest }),
        }).then(r => r.json()).then(d => { if (d.commentary) setCashCommentary(d.commentary) }).catch(() => null)

        // Load pending POs
        fetch('/api/pos/purchase-orders?business_id=' + business.id + '&status=pending')
          .then(r => r.json())
          .then(d => {
            const orders = d.orders ?? d.purchase_orders ?? []
            if (Array.isArray(orders)) setPendingPOs(orders.slice(0, 10))
          }).catch(() => null)
      }

      // Load last year data for seasonal overlay
      const yearAgo = new Date(); yearAgo.setFullYear(yearAgo.getFullYear() - 1)
      const lyStart = new Date(yearAgo); lyStart.setDate(lyStart.getDate() - 5)
      const lyEnd = new Date(yearAgo); lyEnd.setDate(lyEnd.getDate() + 30)
      try {
        const lyRes = await fetch('/api/pos/sales?business_id=' + business!.id + '&limit=500&from=' + lyStart.toISOString() + '&to=' + lyEnd.toISOString())
        const lyData = await lyRes.json() as { sales?: Array<{ created_at: string; total_amount: number; status: string }> }
        const lySales = (lyData.sales ?? []).filter(s => s.status !== 'voided')
        // INTEL-COMPUTE-4 — was raw new Date(...).toISOString() (UTC), same misattribution bug.
        const lyByDay: Record<string, number> = {}
        for (const s of lySales) {
          const d = toAESTWallClock(s.created_at)
          d.setUTCFullYear(d.getUTCFullYear() + 1)
          const key = d.toISOString().split('T')[0]
          lyByDay[key] = (lyByDay[key] ?? 0) + (s.total_amount ?? 0)
        }
        setLastYearData(Object.entries(lyByDay).map(([date, rev]) => ({ date, lastYearRevenue: Math.round(rev) })))
      } catch (e) { console.warn('[non-fatal]', e) }

      const month = new Date().getMonth()
      setSeasonalInsight(
        month === 11 ? 'December typically spikes revenue but expenses also rise — plan your cash buffer accordingly.'
        : month === 0 || month === 1 ? 'January–February often runs below annual average — a quieter period to conserve cash.'
        : month >= 5 && month <= 7 ? 'Mid-year (June–August) can be slower for retail — watch your burn rate carefully.'
        : 'Compare your current trajectory to last year to spot seasonal patterns early.'
      )
    } catch (e) { console.warn('[non-fatal]', e) }
    setLoading(false)
  }, [business?.id, horizon, scenario, fixedDailyExpense])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (view !== 'chart' || !chartRef.current || days.length === 0) return
    const win = window as unknown as Record<string, unknown>
    function buildChart() {
      if (!(win.Chart as unknown)) return
      const ChartJS = win.Chart as { new(el: HTMLCanvasElement, cfg: unknown): unknown }
      if (chartInstance.current) { (chartInstance.current as { destroy(): void }).destroy() }
      const labels = days.map(d => d.day)
      const actuals = days.map(d => d.revenue_actual)
      const forecasts = days.map(d => d.revenue_forecast)
      const cumul = days.map(d => d.cumulative)
      chartInstance.current = new ChartJS(chartRef.current!, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { type: 'bar', label: 'Actual Revenue', data: actuals, backgroundColor: 'rgba(34,197,94,0.7)', borderRadius: 4, order: 2 },
            { type: 'bar', label: 'Forecast Revenue', data: forecasts, backgroundColor: 'rgba(139,92,246,0.4)', borderRadius: 4, order: 3 },
            { type: 'line', label: 'Cumulative Net', data: cumul, borderColor: '#F59E0B', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.4, yAxisID: 'y2', order: 1 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 9 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 14 }, grid: { color: 'rgba(255,255,255,0.04)' } },
            y: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 9 }, callback: (v: number) => '$' + Math.round(v / 1000) + 'k' }, grid: { color: 'rgba(255,255,255,0.04)' } },
            y2: { position: 'right', ticks: { color: '#F59E0B', font: { size: 9 }, callback: (v: number) => '$' + Math.round(v / 1000) + 'k' }, grid: { drawOnChartArea: false } },
          },
        },
      })
    }
    if (win.Chart) { buildChart() } else {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
      s.onload = buildChart
      document.head.appendChild(s)
    }
  }, [days, view])

  const totalForecastRevenue = days.filter(d => !d.is_past).reduce((s, d) => s + d.revenue_forecast, 0)
  const totalActualRevenue = days.filter(d => d.is_past).reduce((s, d) => s + (d.revenue_actual ?? 0), 0)
  const netPosition = days[days.length - 1]?.cumulative ?? 0
  const usingManualExpenses = totalMonthlyExpenses > 0

  useEffect(() => {
    if (!business?.id) return
    fetch(`/api/integrations/basiq/status?business_id=${business.id}`).then(r => r.json()).then(d => setBank(d)).catch(() => {})
  }, [business?.id])

  async function refreshBank() {
    if (!business?.id) return
    setBankSyncing(true)
    await fetch(`/api/integrations/basiq/sync?business_id=${business.id}`).catch(() => {})
    const d = await fetch(`/api/integrations/basiq/status?business_id=${business.id}`).then(r => r.json()).catch(() => null)
    if (d) setBank(d)
    setBankSyncing(false)
  }

  // First forecast day where cumulative dips negative — pass to Aria for context
  const negativeDip = days.find(d => !d.is_past && d.cumulative < 0) ?? null

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Inter',sans-serif", padding: '24px 28px' }}>
      <AriaSays businessId={business?.id ?? null} page="cash-flow" pageData={negativeDip ? { negative_day: negativeDip.date, cumulative_at_dip: negativeDip.cumulative } : undefined} />

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {([['forecast', 'Forecast'], ['bank', 'Bank Feed']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setActiveTab(t)}
            style={{ padding: '7px 18px', borderRadius: 7, border: 'none', background: activeTab === t ? C.card : 'transparent', color: activeTab === t ? C.text : C.muted, fontSize: 12, fontWeight: activeTab === t ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit', boxShadow: activeTab === t ? '0 1px 4px rgba(0,0,0,0.3)' : 'none' }}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'bank' && (
        <BankTab businessId={business?.id ?? null} connected={bank?.connected ?? false} />
      )}

      {activeTab === 'forecast' && bank !== null && !bank?.connected && (
        <div style={{ marginBottom: 18, padding: '12px 16px', borderRadius: 12, background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: 0 }}>🏦 Connect your bank to see live balance alongside your cash-flow forecast.</p>
          <a href="/dashboard/integrations#bank" style={{ fontSize: 12, fontWeight: 700, color: '#60A5FA', textDecoration: 'none', padding: '6px 14px', borderRadius: 7, border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.08)', whiteSpace: 'nowrap' }}>Connect bank →</a>
        </div>
      )}
      {activeTab === 'forecast' && bank?.connected && (
        <div style={{ marginBottom: 18, padding: 16, borderRadius: 12, background: 'rgba(127,184,151,0.06)', border: '1px solid rgba(127,184,151,0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>🏦 Live bank balance</p>
              <p style={{ fontSize: 24, fontWeight: 800, color: '#7FB897', margin: '6px 0 0' }}>A${Number(bank.total_balance ?? 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</p>
            </div>
            <button onClick={refreshBank} disabled={bankSyncing} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid rgba(127,184,151,0.3)', background: 'rgba(127,184,151,0.08)', color: '#7FB897', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: bankSyncing ? 0.5 : 1 }}>{bankSyncing ? 'Syncing…' : '↻ Refresh'}</button>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {bank.accounts.map(a => (
              <div key={a.id} style={{ flex: '1 1 200px', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ fontSize: 10, color: C.dim, margin: 0 }}>{a.institution_name ?? 'Bank'} · {a.account_name ?? 'Account'}</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '2px 0 0', fontFamily: 'monospace' }}>A${Number(a.balance ?? 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {activeTab === 'forecast' && <><div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Cash Flow Forecast</h1>
          <p style={{ fontSize: 13, color: C.muted }}>
            Revenue forecast based on your historical sales patterns.
            {usingManualExpenses && <span style={{ color: C.green, marginLeft: 8, fontSize: 11 }}>✓ Using your expense data</span>}
            {!usingManualExpenses && <span style={{ color: C.amber, marginLeft: 8, fontSize: 11 }}>Using estimated expenses (68%) — add real expenses for accuracy</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['base', 'optimistic', 'pessimistic'] as const).map(s => (
            <button key={s} onClick={() => setScenario(s)}
              style={{ padding: '6px 12px', borderRadius: 8, border: scenario === s ? '1px solid ' + (s === 'optimistic' ? C.green : s === 'pessimistic' ? C.red : C.violet) : '1px solid ' + C.border, background: scenario === s ? (s === 'optimistic' ? C.green : s === 'pessimistic' ? C.red : C.violet) + '20' : 'transparent', color: scenario === s ? (s === 'optimistic' ? C.green : s === 'pessimistic' ? C.red : C.violet) : C.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
              {s}
            </button>
          ))}
          <div style={{ width: 1, background: C.border, margin: '0 4px' }} />
          {(['chart', 'table'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: '6px 12px', borderRadius: 8, border: view === v ? '1px solid ' + C.violet : '1px solid ' + C.border, background: view === v ? 'rgba(139,92,246,0.1)' : 'transparent', color: view === v ? C.violet : C.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
              {v}
            </button>
          ))}
          {([14, 30, 60] as const).map(h => (
            <button key={h} onClick={() => setHorizon(h)}
              style={{ padding: '6px 12px', borderRadius: 8, border: horizon === h ? '1px solid ' + C.amber : '1px solid ' + C.border, background: horizon === h ? 'rgba(245,158,11,0.1)' : 'transparent', color: horizon === h ? C.amber : C.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {h}d
            </button>
          ))}
          <button data-tour="cash_flow" onClick={() => setShowExpensePanel(!showExpensePanel)}
            style={{ padding: '6px 12px', borderRadius: 8, border: showExpensePanel ? '1px solid rgba(34,197,94,0.4)' : '1px solid ' + C.border, background: showExpensePanel ? 'rgba(34,197,94,0.1)' : 'transparent', color: showExpensePanel ? C.green : C.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            ⚙ Expenses
          </button>
        </div>
      </div>

      {/* Manual expense panel */}
      {showExpensePanel && (
        <div style={{ background: C.card, border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>Monthly fixed expenses</p>
          <p style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>Enter your real monthly costs to get an accurate cash flow forecast instead of the 68% estimate.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {expenses.filter(e => e.label !== 'COGS (auto)').map((exp, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="text"
                  value={exp.label}
                  onChange={e => setExpenses(prev => prev.map((ex, j) => j === i ? { ...ex, label: e.target.value } : ex))}
                  style={{ width: 140, padding: '7px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid ' + C.border, borderRadius: 7, color: C.text, fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
                />
                <span style={{ color: C.muted, fontSize: 13 }}>A$</span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={exp.amount || ''}
                  onChange={e => setExpenses(prev => prev.map((ex, j) => j === i ? { ...ex, amount: parseFloat(e.target.value) || 0 } : ex))}
                  placeholder="0"
                  style={{ width: 100, padding: '7px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid ' + C.border, borderRadius: 7, color: C.text, fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
                />
                <span style={{ fontSize: 11, color: C.dim }}>/month</span>
                <button onClick={() => setExpenses(prev => prev.filter((_, j) => j !== i))}
                  style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'rgba(239,68,68,0.1)', color: C.red, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              value={newExpenseLabel}
              onChange={e => setNewExpenseLabel(e.target.value)}
              placeholder="New expense name"
              style={{ width: 140, padding: '7px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid ' + C.border, borderRadius: 7, color: C.text, fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
            />
            <span style={{ color: C.muted, fontSize: 13, display: 'flex', alignItems: 'center' }}>A$</span>
            <input
              type="number"
              step="1"
              min="0"
              value={newExpenseAmount}
              onChange={e => setNewExpenseAmount(e.target.value)}
              placeholder="0"
              style={{ width: 100, padding: '7px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid ' + C.border, borderRadius: 7, color: C.text, fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
            />
            <button
              onClick={() => {
                if (!newExpenseLabel.trim() || !newExpenseAmount) return
                setExpenses(prev => [...prev, { label: newExpenseLabel.trim(), amount: parseFloat(newExpenseAmount) || 0 }])
                setNewExpenseLabel('')
                setNewExpenseAmount('')
              }}
              style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: C.green, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              + Add
            </button>
          </div>
          <div style={{ borderTop: '1px solid ' + C.border, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: 12, color: C.muted }}>
              Total monthly expenses: <strong style={{ color: C.text }}>A${totalMonthlyExpenses.toLocaleString()}</strong>
              {' '}<span style={{ color: C.dim }}>= A${Math.round(totalMonthlyExpenses / 30).toLocaleString()}/day</span>
              {expensesSavedAt && <span style={{ color: C.green, marginLeft: 8 }}>✓ Saved {expensesSavedAt}</span>}
            </p>
            <button onClick={async () => { await saveExpenses(expenses); setShowExpensePanel(false) }} disabled={expensesSaving}
              style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: C.green, color: '#fff', fontSize: 12, fontWeight: 600, cursor: expensesSaving ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: expensesSaving ? 0.6 : 1 }}>
              {expensesSaving ? 'Saving…' : 'Save & Apply'}
            </button>
          </div>
        </div>
      )}

      {dailyBurn !== null && (
        <div style={{ marginBottom: 20, padding: '16px 18px', borderRadius: 12, border: '1px solid ' + (runwayDays !== null && runwayDays < 30 ? 'rgba(239,68,68,0.3)' : runwayDays !== null && runwayDays < 90 ? 'rgba(245,158,11,0.3)' : 'rgba(127,184,151,0.3)'), background: runwayDays !== null && runwayDays < 30 ? 'rgba(239,68,68,0.06)' : runwayDays !== null && runwayDays < 90 ? 'rgba(245,158,11,0.06)' : 'rgba(127,184,151,0.06)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>✦ Aria&apos;s read</div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, margin: '0 0 10px' }}>
            {runwayDays !== null && runwayDays < 30
              ? '⚠ At current burn rate, you may need to top up in ' + runwayDays + ' days.'
              : runwayDays !== null && runwayDays < 90
              ? 'Cash position tightens in ' + runwayDays + ' days — plan ahead.'
              : 'Cash position is healthy across the next 30 days.'}
          </p>
          {cashCommentary && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.55, margin: 0 }}>{cashCommentary}</p>}
          <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
            <span>Daily net: <strong style={{ color: dailyBurn < 0 ? '#ef4444' : '#7FB897' }}>${dailyBurn.toFixed(2)}/day</strong></span>
            {lowestPoint !== null && <span>Lowest point: <strong style={{ color: lowestPoint < 0 ? '#ef4444' : 'rgba(255,255,255,0.7)' }}>${lowestPoint.toFixed(0)}</strong></span>}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Last 7 days actual', value: fmt(totalActualRevenue), color: C.green },
          { label: 'Next ' + horizon + 'd forecast', value: fmt(totalForecastRevenue), color: C.violet },
          { label: 'Projected net position', value: (netPosition >= 0 ? '+' : '') + fmt(netPosition), color: netPosition >= 0 ? C.green : C.red },
        ].map(s => (
          <div key={s.label} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      {view === 'chart' && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
          {[
            { color: 'rgba(34,197,94,0.7)', label: 'Actual revenue' },
            { color: 'rgba(139,92,246,0.4)', label: 'Forecast revenue' },
            { color: '#F59E0B', label: 'Cumulative net', line: true },
          ].map(l => (
            <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.muted }}>
              <span style={{ width: l.line ? 24 : 10, height: l.line ? 2 : 10, borderRadius: l.line ? 0 : 2, background: l.color, display: 'inline-block' }} />
              {l.label}
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ color: C.muted, textAlign: 'center', padding: '60px 0' }}>Calculating…</div>
      ) : view === 'chart' ? (
        <div style={{ position: 'relative', height: 320, background: C.card, borderRadius: 12, border: '1px solid ' + C.border, padding: '16px' }}>
          <canvas ref={chartRef} role="img" aria-label="Cash flow forecast chart" />
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid ' + C.border }}>
                {['Date', 'Actual Revenue', 'Forecast', 'Est. Costs', 'Daily Net', 'Cumulative'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: C.dim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d, i) => {
                const isToday = !d.is_past && i === 7
                return (
                  <tr key={d.date} style={{ borderBottom: '1px solid ' + C.border, background: isToday ? 'rgba(139,92,246,0.05)' : 'transparent' }}>
                    <td style={{ padding: '8px 12px', fontWeight: isToday ? 700 : 400, color: isToday ? C.violet : C.text }}>
                      {isToday && <span style={{ fontSize: 9, fontWeight: 800, color: C.violet, marginRight: 6, background: 'rgba(139,92,246,0.15)', padding: '1px 5px', borderRadius: 4 }}>TODAY</span>}
                      {d.day}
                    </td>
                    <td style={{ padding: '8px 12px', color: d.revenue_actual != null ? C.green : C.dim }}>{d.revenue_actual != null ? fmt(d.revenue_actual) : '—'}</td>
                    <td style={{ padding: '8px 12px', color: C.muted }}>{fmt(d.revenue_forecast)}</td>
                    <td style={{ padding: '8px 12px', color: C.red }}>−{fmt(d.expenses_forecast)}</td>
                    <td style={{ padding: '8px 12px', color: d.net >= 0 ? C.green : C.red, fontWeight: 600 }}>{d.net >= 0 ? '+' : ''}{fmt(d.net)}</td>
                    <td style={{ padding: '8px 12px', color: d.cumulative >= 0 ? C.green : C.red, fontWeight: 700 }}>{d.cumulative >= 0 ? '+' : ''}{fmt(d.cumulative)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {seasonalInsight && (
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 10, fontStyle: 'italic' }}>{seasonalInsight}</p>
      )}

      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.8)', marginBottom: 12 }}>Supplier payment timing</div>
        {pendingPOs.length === 0 ? (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', padding: '20px 0' }}>No pending supplier invoices to optimise.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingPOs.slice(0, 5).map(po => {
              const optimalDay = days.filter(d => (d.cumulative ?? 0) > 0 && po.due_date && new Date(d.date) <= new Date(po.due_date)).slice(-1)[0]
              const daysDeferred = optimalDay && po.due_date
                ? Math.floor((new Date(optimalDay.date).getTime() - new Date().getTime()) / 86400000)
                : 0
              return (
                <div key={po.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{po.supplier_name ?? 'Supplier'}</div>
                    {po.total_amount && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>${po.total_amount.toFixed(2)} due</div>}
                  </div>
                  {optimalDay && daysDeferred > 0 ? (
                    <div style={{ fontSize: 12, color: '#7FB897', textAlign: 'right' }}>
                      <div style={{ fontWeight: 600 }}>Pay {new Date(optimalDay.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</div>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Save {daysDeferred}d cash float</div>
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Pay now</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: 20, padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, fontSize: 11, color: C.dim }}>
        Scenarios: <b style={{ color: C.green }}>Optimistic</b> +20%, <b style={{ color: C.amber }}>Base</b> historical average, <b style={{ color: C.red }}>Pessimistic</b> -25%.
        {usingManualExpenses ? ' Expenses from your manual entries.' : ' Expenses estimated at 68% of revenue — click ⚙ Expenses to enter real costs.'}
      </div></>}
    </div>
  )
}
