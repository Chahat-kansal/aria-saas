'use client'
import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

interface AnalysisCategory { name: string; amount: number; pct: number }
interface WeeklyBucket { week: string; in: number; out: number }
interface RecentTxn { date: string | null; description: string | null; amount: number; category: string }

interface Analysis {
  period: string; period_days: number
  total_in: number; total_out: number; net_cash_flow: number
  current_balance: number; runway_days: number | null
  categories: AnalysisCategory[]; weekly: WeeklyBucket[]
  recent: RecentTxn[]; ai_insight: string
}

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: 'var(--text-primary)',
  muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  green: '#22C55E', red: '#EF4444', amber: '#F59E0B', violet: '#8B5CF6',
  border: 'rgba(255,255,255,0.07)',
}
const PIE_COLORS = ['#8B5CF6', '#22C55E', '#F59E0B', '#60A5FA', '#EC4899']

function fmt(n: number) { return 'A$' + Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) }
function runwayColor(days: number | null) {
  if (days == null) return C.dim
  if (days < 30) return C.red
  if (days < 90) return C.amber
  return C.green
}

interface BankTabProps { businessId: string | null; connected: boolean }

export default function BankTab({ businessId, connected }: BankTabProps) {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d')
  const [data, setData] = useState<Analysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const load = useCallback(async () => {
    if (!businessId) return
    setLoading(true)
    try {
      const r = await fetch('/api/pos/cash-flow/analysis?period=' + period)
      const d = await r.json()
      if (!d.error) setData(d as Analysis)
    } catch (e) { console.warn('[non-fatal]', e) }
    setLoading(false)
  }, [businessId, period])

  useEffect(() => { load() }, [load])

  async function syncNow() {
    if (!businessId || syncing) return
    setSyncing(true)
    setSyncMsg('')
    try {
      const r = await fetch('/api/integrations/basiq/sync-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId }),
      })
      const d = await r.json()
      setSyncMsg(d.ok ? 'Synced ' + d.synced + ' transactions' : d.error ?? 'Sync failed')
      if (d.ok) await load()
    } catch { setSyncMsg('Network error') }
    setSyncing(false)
  }

  if (!connected) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center' }}>
        <p style={{ fontSize: 32, marginBottom: 8 }}>🏦</p>
        <p style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>Connect your bank account</p>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 20, maxWidth: 360, margin: '0 auto 20px' }}>
          Link your bank via Basiq to see real cash in vs out, expense categories, and runway days.
        </p>
        <a href="/dashboard/integrations#bank"
          style={{ display: 'inline-block', padding: '10px 24px', borderRadius: 10, background: '#60A5FA', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
          Connect bank →
        </a>
      </div>
    )
  }

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['7d', '30d', '90d'] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            style={{ padding: '6px 14px', borderRadius: 8, border: period === p ? '1px solid ' + C.violet : '1px solid ' + C.border, background: period === p ? 'rgba(139,92,246,0.12)' : 'transparent', color: period === p ? C.violet : C.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {p}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={syncNow} disabled={syncing}
          style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid rgba(127,184,151,0.3)', background: 'rgba(127,184,151,0.08)', color: '#7FB897', fontSize: 11, fontWeight: 700, cursor: syncing ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: syncing ? 0.6 : 1 }}>
          {syncing ? 'Syncing…' : '↻ Sync now'}
        </button>
        {syncMsg && <span style={{ fontSize: 11, color: C.muted }}>{syncMsg}</span>}
      </div>

      {loading && <div style={{ textAlign: 'center', color: C.muted, padding: '48px 0' }}>Loading…</div>}

      {!loading && data && (
        <>
          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Money in', value: fmt(data.total_in), color: C.green },
              { label: 'Money out', value: fmt(data.total_out), color: C.red },
              { label: 'Net cash flow', value: (data.net_cash_flow >= 0 ? '+' : '') + fmt(data.net_cash_flow), color: data.net_cash_flow >= 0 ? C.green : C.red },
              { label: 'Current balance', value: fmt(data.current_balance), color: C.text },
            ].map(k => (
              <div key={k.label} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '14px 18px' }}>
                <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Runway gauge */}
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20 }}>
            <div>
              <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Runway</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: runwayColor(data.runway_days) }}>
                {data.runway_days != null ? data.runway_days + 'd' : '—'}
              </div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>at current burn rate</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ height: 10, borderRadius: 6, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  borderRadius: 6,
                  width: data.runway_days != null ? Math.min(data.runway_days / 365 * 100, 100) + '%' : '0%',
                  background: runwayColor(data.runway_days),
                  transition: 'width 0.5s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                {[{ d: 30, label: '30d', c: C.red }, { d: 90, label: '90d', c: C.amber }, { d: 365, label: '1yr', c: C.green }].map(m => (
                  <span key={m.label} style={{ fontSize: 9, color: m.c }}>{m.label}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Charts row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {/* Weekly bar chart */}
            <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '16px' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 12 }}>In vs Out by Week</p>
              {data.weekly.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={data.weekly} barGap={2}>
                    <XAxis dataKey="week" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }} tickFormatter={v => v.slice(5)} />
                    <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }} tickFormatter={v => '$' + Math.round(Number(v) / 1000) + 'k'} width={36} />
                    <Tooltip formatter={(v: unknown) => fmt(Number(v))} contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
                    <Bar dataKey="in" name="In" fill={C.green} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="out" name="Out" fill={C.red} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.dim, fontSize: 12 }}>No data</div>
              )}
            </div>

            {/* Expense donut */}
            <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '16px' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 12 }}>Expense Breakdown</p>
              {data.categories.some(c => c.amount > 0) ? (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={data.categories.filter(c => c.amount > 0)} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="amount" nameKey="name" paddingAngle={2}>
                      {data.categories.filter(c => c.amount > 0).map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => fmt(Number(v))} contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
                    <Legend iconSize={8} iconType="circle" formatter={(v: string) => <span style={{ fontSize: 10, color: C.muted }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.dim, fontSize: 12 }}>No outflow data</div>
              )}
            </div>
          </div>

          {/* AI insight */}
          {data.ai_insight && (
            <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>✦</span>
              <p style={{ fontSize: 13, color: C.text, margin: 0, lineHeight: 1.6 }}>{data.ai_insight}</p>
            </div>
          )}

          {/* Recent transactions */}
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid ' + C.border }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, margin: 0 }}>Recent outflows</p>
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {data.recent.length === 0 && (
                <div style={{ padding: '24px', textAlign: 'center', color: C.dim, fontSize: 12 }}>No transactions</div>
              )}
              {data.recent.map((t, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 18px', borderBottom: i < data.recent.length - 1 ? '1px solid ' + C.border : 'none' }}>
                  <div>
                    <p style={{ fontSize: 12, color: C.text, margin: 0, fontWeight: 500 }}>{t.description ?? '—'}</p>
                    <p style={{ fontSize: 10, color: C.dim, margin: '2px 0 0' }}>{t.date ?? ''} · {t.category}</p>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.red }}>−{fmt(t.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
