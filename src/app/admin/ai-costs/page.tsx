'use client'
import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCents } from '@/lib/admin'

const PIE_COLORS = ['#00E5FF', '#7C5CFF', '#00B140', '#F59E0B', '#F87171']
const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 12, padding: '18px 20px' }
const th: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', fontWeight: 600 }
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: 'var(--text-primary)', borderTop: '1px solid rgba(0,229,255,0.06)' }

interface Row { business_id: string; name: string; tier: string; budget: number; spent: number; sonnet: number; pct: number }
interface Overview { thisMonthTotal: number; lastMonthTotal: number; pctChange: number | null; top10: Row[]; byAgent: { agent_key: string; cents: number; calls: number }[]; byModel: { model: string; cents: number }[] }
interface Alerts { overBudget: Row[]; trackingToExceed: Row[]; spikes: { business_id: string; name: string; today: number; dailyAvg: number }[] }
interface PerBiz { business_id: string; name: string; tier: string; budget: number; sonnet: number; spent: number; pct: number; daily: { date: string; cents: number }[]; byAgent: { agent_key: string; cents: number }[] }
// AI-HEALTH-1
interface HealthRow {
  provider: string; total_calls: number; failures: number; failure_rate: number
  agents_affected: number; top_errors: { message: string; count: number }[]
}
interface Data { health?: HealthRow[]; overview: Overview; alerts: Alerts; businesses: { id: string; name: string }[]; perBusiness: PerBiz | null }

type Tab = 'overview' | 'business' | 'alerts'

export default function AdminAiCostsPage() {
  const [tab, setTab] = useState<Tab>('overview')
  const [data, setData] = useState<Data | null>(null)
  const [bizId, setBizId] = useState('')
  const [budgetInput, setBudgetInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')

  const load = useCallback(async (business_id?: string) => {
    const url = business_id ? `/api/admin/ai-costs?business_id=${business_id}` : '/api/admin/ai-costs'
    const d = await fetch(url).then(r => r.json())
    setData(prev => business_id && prev ? { ...prev, perBusiness: d.perBusiness } : d)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (bizId) load(bizId) }, [bizId, load])

  async function saveBudget() {
    if (!bizId || !budgetInput) return
    setSaving(true)
    await fetch('/api/admin/ai-costs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bizId, budget_cents: Math.round(parseFloat(budgetInput) * 100) }) })
    setSaving(false); setBudgetInput(''); load(bizId)
  }

  if (!data) return <p style={{ color: 'var(--text-tertiary)' }}>Loading AI costs…</p>

  const { overview, alerts } = data
  const health = data.health ?? []
  const unhealthy = health.filter(h => h.failures > 0)
  const pb = data.perBusiness
  const filteredBiz = data.businesses.filter(b => b.name?.toLowerCase().includes(query.toLowerCase()))

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>AI Costs</h1>
      <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 20 }}>Aria spend per business, agent and model. Source: aria_monthly_spend (trigger-maintained).</p>

      {/* AI-HEALTH-1 — ABOVE spend, deliberately. The only surface reading aria_ai_calls filtered
          .gt('cost_usd_cents', 0), and a failed call costs $0, so a 48% Anthropic failure rate was
          invisible here for weeks while every agent degraded. A dashboard that leads with cost is
          what produced that blind spot. */}
      {unhealthy.length > 0 && (
        <div style={{ marginBottom: 22, border: '1px solid rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.06)', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#F87171', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Provider health · last 30 days
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {unhealthy.map(h => (
              <div key={h.provider} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{h.provider}</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: h.failure_rate > 0.2 ? '#F87171' : 'var(--text-secondary)' }}>
                    {Math.round(h.failure_rate * 100)}% failing
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {h.failures.toLocaleString()} of {h.total_calls.toLocaleString()} calls
                    {h.agents_affected > 0 ? ' · ' + h.agents_affected + ' agents affected' : ''}
                  </span>
                </div>
                {/* Verbatim, truncated. A generic "provider error" label would hide
                    "Your credit balance is too low" exactly as well as the cost filter did. */}
                {h.top_errors.slice(0, 3).map(e => (
                  <div key={e.message} style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'ui-monospace, monospace', paddingLeft: 2 }}>
                    {e.count.toLocaleString()}× {e.message}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 22, borderBottom: '1px solid rgba(0,229,255,0.1)' }}>
        {(['overview', 'business', 'alerts'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 16px', background: 'none', border: 'none', borderBottom: tab === t ? '2px solid #00E5FF' : '2px solid transparent', color: tab === t ? '#00E5FF' : 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
            {t === 'business' ? 'Per business' : t}{t === 'alerts' && (alerts.overBudget.length + alerts.spikes.length) > 0 ? ` (${alerts.overBudget.length + alerts.spikes.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14 }}>
            <div style={card}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Spend this month</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#00E5FF', marginTop: 6 }}>{formatCents(overview.thisMonthTotal)}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>vs last month</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: overview.pctChange == null ? 'var(--text-tertiary)' : overview.pctChange > 0 ? '#F87171' : '#00B140', marginTop: 6 }}>
                {overview.pctChange == null ? '—' : `${overview.pctChange > 0 ? '+' : ''}${overview.pctChange}%`}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{formatCents(overview.lastMonthTotal)} last month</div>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Top 10 spenders</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Business</th><th style={th}>Plan</th><th style={th}>Budget</th><th style={th}>Spent</th><th style={th}>Sonnet %</th></tr></thead>
              <tbody>
                {overview.top10.map(r => (
                  <tr key={r.business_id}>
                    <td style={td}>{r.name}</td>
                    <td style={{ ...td, textTransform: 'capitalize' }}>{r.tier}</td>
                    <td style={td}>{formatCents(r.budget)}</td>
                    <td style={td}>{formatCents(r.spent)}</td>
                    <td style={{ ...td, color: r.pct >= 100 ? '#F87171' : r.pct >= 80 ? '#F59E0B' : 'var(--text-primary)', fontWeight: 600 }}>{r.pct}%</td>
                  </tr>
                ))}
                {overview.top10.length === 0 && <tr><td style={td} colSpan={5}>No spend recorded this month yet.</td></tr>}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Spend by agent (this month)</div>
              <ResponsiveContainer width="100%" height={Math.max(160, overview.byAgent.length * 30)}>
                <BarChart data={overview.byAgent} layout="vertical" margin={{ left: 20, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,229,255,0.08)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} tickFormatter={v => `$${(v / 100).toFixed(0)}`} />
                  <YAxis type="category" dataKey="agent_key" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} width={90} />
                  <Tooltip formatter={(value) => formatCents(Number(value ?? 0))} contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="cents" fill="#00E5FF" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Spend by model (this month)</div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={overview.byModel} dataKey="cents" nameKey="model" cx="50%" cy="50%" outerRadius={70} label={(p) => String((p as { name?: string }).name ?? '')}>
                    {overview.byModel.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => formatCents(Number(value ?? 0))} contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {tab === 'business' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={card}>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search businesses…" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(0,229,255,0.15)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 10 }} />
            <select value={bizId} onChange={e => setBizId(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(0,229,255,0.15)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit' }}>
              <option value="">Select a business…</option>
              {filteredBiz.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          {pb && pb.business_id === bizId && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14 }}>
                <div style={card}><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Plan</div><div style={{ fontSize: 20, fontWeight: 700, textTransform: 'capitalize', marginTop: 4 }}>{pb.tier}</div></div>
                <div style={card}><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Budget (Sonnet)</div><div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{formatCents(pb.budget)}</div></div>
                <div style={card}><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Spent (month)</div><div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{formatCents(pb.spent)}</div></div>
                <div style={card}><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Sonnet used</div><div style={{ fontSize: 20, fontWeight: 700, color: pb.pct >= 100 ? '#F87171' : pb.pct >= 80 ? '#F59E0B' : '#00B140', marginTop: 4 }}>{pb.pct}%</div></div>
              </div>

              <div style={card}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Last 30 days</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={pb.daily} margin={{ left: 0, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,229,255,0.08)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} interval={4} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} tickFormatter={v => `$${(v / 100).toFixed(0)}`} width={44} />
                    <Tooltip formatter={(value) => formatCents(Number(value ?? 0))} contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="cents" fill="#7C5CFF" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
                <div style={card}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>By agent (this month)</div>
                  {pb.byAgent.length === 0 ? <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No spend this month.</p> : pb.byAgent.map(a => (
                    <div key={a.agent_key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderTop: '1px solid rgba(0,229,255,0.06)' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{a.agent_key}</span><span style={{ fontWeight: 600 }}>{formatCents(a.cents)}</span>
                    </div>
                  ))}
                </div>
                <div style={card}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Adjust monthly Sonnet budget</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="number" value={budgetInput} onChange={e => setBudgetInput(e.target.value)} placeholder={`${(pb.budget / 100).toFixed(0)}`} style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(0,229,255,0.15)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit' }} />
                    <button onClick={saveBudget} disabled={saving || !budgetInput} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#00E5FF', color: '#001018', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving || !budgetInput ? 0.6 : 1 }}>{saving ? '…' : 'Save'}</button>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Dollars per month. Updates business_subscriptions.sonnet_monthly_budget_cents.</p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'alerts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <AlertTable title="Over budget (>100% Sonnet used)" rows={alerts.overBudget} accent="#F87171" />
          <AlertTable title="Tracking to exceed (>80%, >25% of month left)" rows={alerts.trackingToExceed} accent="#F59E0B" />
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#F87171', marginBottom: 10 }}>Anomalous spike (today &gt; 3× 30-day avg)</div>
            {alerts.spikes.length === 0 ? <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No spikes detected.</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Business</th><th style={th}>Today</th><th style={th}>30-day avg/day</th></tr></thead>
                <tbody>{alerts.spikes.map(s => (
                  <tr key={s.business_id}><td style={td}>{s.name}</td><td style={{ ...td, color: '#F87171', fontWeight: 600 }}>{formatCents(s.today)}</td><td style={td}>{formatCents(s.dailyAvg)}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function AlertTable({ title, rows, accent }: { title: string; rows: Row[]; accent: string }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 700, color: accent, marginBottom: 10 }}>{title}</div>
      {rows.length === 0 ? <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>None.</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Business</th><th style={th}>Plan</th><th style={th}>Budget</th><th style={th}>Sonnet used</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.business_id}><td style={td}>{r.name}</td><td style={{ ...td, textTransform: 'capitalize' }}>{r.tier}</td><td style={td}>{formatCents(r.budget)}</td><td style={{ ...td, color: accent, fontWeight: 600 }}>{r.pct}%</td></tr>
          ))}</tbody>
        </table>
      )}
    </div>
  )
}
