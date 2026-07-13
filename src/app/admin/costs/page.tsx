'use client'
import { useState, useEffect, useCallback } from 'react'
import { formatUsdCents } from '@/lib/admin'

const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 12, padding: '18px 20px' }
const th: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', fontWeight: 600 }
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: 'var(--text-primary)', borderTop: '1px solid rgba(0,229,255,0.06)' }
const input: React.CSSProperties = { background: 'var(--bg-elevated)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 6, padding: '6px 8px', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'inherit' }
const CATEGORY_LABELS: Record<string, string> = { ai: 'AI', sms: 'SMS', email: 'Email', payment_fee: 'Payment fees', infra: 'Infra', other: 'Other' }

interface Headline { this_month_metered_usd_cents: number; this_month_fixed_usd_cents: number; this_month_total_usd_cents: number; last_month_total_usd_cents: number; pct_change: number | null; anthropic_credits_purchased_usd_cents: number; anthropic_credits_used_usd_cents: number; anthropic_credits_remaining_usd_cents: number }
interface CategoryRow { category: string; usd_cents: number }
interface BizRow { business_id: string; name: string; plan: string; plan_price_usd_cents: number | null; metered_cost_usd_cents: number; allocated_fixed_usd_cents: number; total_cost_usd_cents: number; margin_pct: number | null }
interface AiDrillDown { chat_usd_cents: number; cron_usd_cents: number; realtime_usd_cents: number; batch_usd_cents: number; provider_split: { provider: string; usd_cents: number }[]; two_x_baseline_flags: { business_id: string; name: string; today_cents: number; daily_avg_cents: number }[]; budget_ceiling_status: { business_id: string; name: string; budget_cents: number; spent_today_cents: number; pct: number }[]; see_also: string }
interface ProjectionScenario { aiUsdPerBusinessPerDay: number; nonAiUsdPerBusinessPerDay: number; fixedUsdPerBusinessPerDay: number; totalUsdPerBusinessPerDay: number }
interface CostModelProjection { venues: number; as_is: ProjectionScenario; waste_gated: ProjectionScenario; plan_usd_per_month: number }
interface Renewal { id: string; provider: string; plan_name: string; amount_usd_cents: number; renewal_date: string; category: string }
interface Data { headline: Headline; category_breakdown: CategoryRow[]; per_business: BizRow[]; ai_drill_down: AiDrillDown; cost_model_projection: CostModelProjection; renewals: Renewal[]; active_business_count: number }

interface Subscription { id: string; provider: string; plan_name: string; amount_usd_cents: number; billing_cadence: string; renewal_date: string | null; category: string; notes: string | null; active: boolean }

type Tab = 'overview' | 'per_business' | 'ai' | 'subscriptions' | 'renewals'

export default function AdminCostLedgerPage() {
  const [tab, setTab] = useState<Tab>('overview')
  const [data, setData] = useState<Data | null>(null)
  const [venues, setVenues] = useState(1)
  const [subs, setSubs] = useState<Subscription[] | null>(null)
  const [newSub, setNewSub] = useState({ provider: '', plan_name: '', amount_usd_cents: '', billing_cadence: 'monthly', category: 'infra', renewal_date: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (venuesOverride?: number) => {
    const v = venuesOverride ?? venues
    const d = await fetch(`/api/admin/costs?venues=${v}`).then(r => r.json())
    setData(d)
    if (!venuesOverride) setVenues(d.active_business_count)
  }, [venues])

  const loadSubs = useCallback(async () => {
    const d = await fetch('/api/admin/cost-subscriptions').then(r => r.json())
    setSubs(d.subscriptions ?? [])
  }, [])

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'subscriptions' && !subs) loadSubs() }, [tab, subs, loadSubs])

  async function createSub() {
    if (!newSub.provider || !newSub.plan_name || !newSub.amount_usd_cents) return
    setSaving(true)
    await fetch('/api/admin/cost-subscriptions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newSub, amount_usd_cents: Math.round(parseFloat(newSub.amount_usd_cents) * 100), renewal_date: newSub.renewal_date || null }),
    })
    setSaving(false)
    setNewSub({ provider: '', plan_name: '', amount_usd_cents: '', billing_cadence: 'monthly', category: 'infra', renewal_date: '', notes: '' })
    loadSubs(); load()
  }

  async function updateSub(id: string, patch: Partial<Subscription>) {
    await fetch('/api/admin/cost-subscriptions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }) })
    loadSubs(); load()
  }

  async function deactivateSub(id: string) {
    await fetch(`/api/admin/cost-subscriptions?id=${id}`, { method: 'DELETE' })
    loadSubs(); load()
  }

  if (!data) return <p style={{ color: 'var(--text-tertiary)' }}>Loading cost ledger…</p>

  const { headline, category_breakdown, per_business, ai_drill_down, cost_model_projection, renewals } = data

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>Cost Ledger</h1>
      <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 20 }}>Every dollar Aria spends — AI, SMS, email, Stripe fees, and fixed subscriptions. Computed directly from cost_events/v_ai_costs/cost_subscriptions (not aria_daily_spend — see route comment for why).</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 22, borderBottom: '1px solid rgba(0,229,255,0.1)' }}>
        {(['overview', 'per_business', 'ai', 'subscriptions', 'renewals'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 16px', background: 'none', border: 'none', borderBottom: tab === t ? '2px solid #00E5FF' : '2px solid transparent', color: tab === t ? '#00E5FF' : 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
            {t === 'per_business' ? 'Per venue' : t === 'ai' ? 'AI drill-down' : t}
            {t === 'renewals' && renewals.length > 0 ? ` (${renewals.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14 }}>
            <div style={card}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total this month</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#00E5FF', marginTop: 6 }}>{formatUsdCents(headline.this_month_total_usd_cents)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{formatUsdCents(headline.this_month_metered_usd_cents)} metered + {formatUsdCents(headline.this_month_fixed_usd_cents)} fixed</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>vs last month</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: headline.pct_change == null ? 'var(--text-tertiary)' : headline.pct_change > 0 ? '#F87171' : '#00B140', marginTop: 6 }}>
                {headline.pct_change == null ? '—' : `${headline.pct_change > 0 ? '+' : ''}${headline.pct_change}%`}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{formatUsdCents(headline.last_month_total_usd_cents)} last month</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Anthropic credits remaining (est.)</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: headline.anthropic_credits_remaining_usd_cents < 0 ? '#F87171' : 'var(--text-primary)', marginTop: 6 }}>{formatUsdCents(headline.anthropic_credits_remaining_usd_cents)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{formatUsdCents(headline.anthropic_credits_purchased_usd_cents)} purchased − {formatUsdCents(headline.anthropic_credits_used_usd_cents)} used (all-time)</div>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Category breakdown (this month)</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Category</th><th style={th}>Spend</th></tr></thead>
              <tbody>
                {category_breakdown.map(c => (
                  <tr key={c.category}><td style={td}>{CATEGORY_LABELS[c.category] ?? c.category}</td><td style={td}>{formatUsdCents(c.usd_cents)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Cost-model projection</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Venues</span>
                <input type="range" min={1} max={500} value={venues} onChange={e => { const v = Number(e.target.value); setVenues(v); load(v) }} style={{ width: 140 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#00E5FF', width: 40, textAlign: 'right' }}>{venues}</span>
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Scenario</th><th style={th}>$/venue/day</th><th style={th}>$/mo total</th><th style={th}>% of plan revenue</th></tr></thead>
              <tbody>
                {(['as_is', 'waste_gated'] as const).map(k => {
                  const s = cost_model_projection[k]
                  const monthTotal = s.totalUsdPerBusinessPerDay * 30 * venues
                  const revenueTotal = cost_model_projection.plan_usd_per_month * venues
                  const pct = revenueTotal > 0 ? (monthTotal / revenueTotal) * 100 : null
                  return (
                    <tr key={k}>
                      <td style={td}>{k === 'as_is' ? 'As-is (current)' : 'Waste-gated (remaining cron-tail batch)'}</td>
                      <td style={td}>${s.totalUsdPerBusinessPerDay.toFixed(4)}</td>
                      <td style={td}>{formatUsdCents(Math.round(monthTotal * 100))}</td>
                      <td style={td}>{pct == null ? '—' : `${pct.toFixed(2)}%`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 8 }}>AI + SMS + email + Stripe fees + live fixed-cost allocation (${cost_model_projection.as_is.fixedUsdPerBusinessPerDay.toFixed(4)}/venue/day from active cost_subscriptions ÷ {data.active_business_count} active businesses). Assumes plan revenue = ${cost_model_projection.plan_usd_per_month}/mo/venue.</div>
          </div>
        </div>
      )}

      {tab === 'per_business' && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Per-venue unit economics (this month)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Business</th><th style={th}>Plan</th><th style={th}>Plan price</th><th style={th}>Metered</th><th style={th}>Allocated fixed</th><th style={th}>Total COGS</th><th style={th}>Margin</th></tr></thead>
            <tbody>
              {per_business.map(b => (
                <tr key={b.business_id}>
                  <td style={td}>{b.name}</td>
                  <td style={{ ...td, textTransform: 'capitalize' }}>{b.plan}</td>
                  <td style={td}>{b.plan_price_usd_cents == null ? '—' : formatUsdCents(b.plan_price_usd_cents)}</td>
                  <td style={td}>{formatUsdCents(b.metered_cost_usd_cents)}</td>
                  <td style={td}>{formatUsdCents(b.allocated_fixed_usd_cents)}</td>
                  <td style={td}>{formatUsdCents(b.total_cost_usd_cents)}</td>
                  <td style={{ ...td, color: b.margin_pct == null ? 'var(--text-tertiary)' : b.margin_pct < 50 ? '#F87171' : b.margin_pct < 75 ? '#F59E0B' : '#00B140', fontWeight: 600 }}>{b.margin_pct == null ? '—' : `${b.margin_pct}%`}</td>
                </tr>
              ))}
              {per_business.length === 0 && <tr><td style={td} colSpan={7}>No active businesses.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'ai' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Full per-agent/per-day AI breakdown, budget adjustment, and spend charts live at <a href={ai_drill_down.see_also} style={{ color: '#00E5FF' }}>{ai_drill_down.see_also}</a>. This tab covers what that page doesn&apos;t: chat vs cron, provider + batch split, and &gt;2x-baseline flags.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
            <div style={card}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Chat vs cron (this month)</div>
              <div style={{ fontSize: 13, marginTop: 8 }}>Chat: {formatUsdCents(ai_drill_down.chat_usd_cents)}</div>
              <div style={{ fontSize: 13 }}>Cron: {formatUsdCents(ai_drill_down.cron_usd_cents)}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Realtime vs batch (this month)</div>
              <div style={{ fontSize: 13, marginTop: 8 }}>Realtime: {formatUsdCents(ai_drill_down.realtime_usd_cents)}</div>
              <div style={{ fontSize: 13 }}>Batch: {formatUsdCents(ai_drill_down.batch_usd_cents)}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Provider split (this month)</div>
              {ai_drill_down.provider_split.map(p => <div key={p.provider} style={{ fontSize: 13, marginTop: 4, textTransform: 'capitalize' }}>{p.provider}: {formatUsdCents(p.usd_cents)}</div>)}
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Budget ceiling status</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Business</th><th style={th}>Today&apos;s spend</th><th style={th}>Ceiling</th><th style={th}>%</th></tr></thead>
              <tbody>
                {ai_drill_down.budget_ceiling_status.map(r => (
                  <tr key={r.business_id}><td style={td}>{r.name}</td><td style={td}>{formatUsdCents(r.spent_today_cents)}</td><td style={td}>{formatUsdCents(r.budget_cents)}</td><td style={{ ...td, color: r.pct >= 100 ? '#F87171' : r.pct >= 80 ? '#F59E0B' : 'var(--text-primary)', fontWeight: 600 }}>{r.pct}%</td></tr>
                ))}
                {ai_drill_down.budget_ceiling_status.length === 0 && <tr><td style={td} colSpan={4}>No business has a budget ceiling configured (default off).</td></tr>}
              </tbody>
            </table>
          </div>

          {ai_drill_down.two_x_baseline_flags.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#F59E0B', marginBottom: 12 }}>&gt;2x baseline today</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Business</th><th style={th}>Today</th><th style={th}>Daily avg</th></tr></thead>
                <tbody>
                  {ai_drill_down.two_x_baseline_flags.map(f => (
                    <tr key={f.business_id}><td style={td}>{f.name}</td><td style={td}>{formatUsdCents(f.today_cents)}</td><td style={td}>{formatUsdCents(f.daily_avg_cents)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'subscriptions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Add a fixed cost</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <input style={input} placeholder="Provider" value={newSub.provider} onChange={e => setNewSub({ ...newSub, provider: e.target.value })} />
              <input style={input} placeholder="Plan name" value={newSub.plan_name} onChange={e => setNewSub({ ...newSub, plan_name: e.target.value })} />
              <input style={{ ...input, width: 100 }} placeholder="USD/mo" type="number" value={newSub.amount_usd_cents} onChange={e => setNewSub({ ...newSub, amount_usd_cents: e.target.value })} />
              <select style={input} value={newSub.billing_cadence} onChange={e => setNewSub({ ...newSub, billing_cadence: e.target.value })}>
                <option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="one_time">One-time</option>
              </select>
              <select style={input} value={newSub.category} onChange={e => setNewSub({ ...newSub, category: e.target.value })}>
                {Object.entries(CATEGORY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <input style={input} type="date" value={newSub.renewal_date} onChange={e => setNewSub({ ...newSub, renewal_date: e.target.value })} />
              <input style={{ ...input, minWidth: 160 }} placeholder="Notes" value={newSub.notes} onChange={e => setNewSub({ ...newSub, notes: e.target.value })} />
              <button onClick={createSub} disabled={saving} style={{ background: '#00E5FF', color: '#001018', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Add</button>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Fixed costs</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Provider</th><th style={th}>Plan</th><th style={th}>Amount</th><th style={th}>Cadence</th><th style={th}>Category</th><th style={th}>Renewal</th><th style={th}>Active</th><th style={th}></th></tr></thead>
              <tbody>
                {(subs ?? []).map(s => (
                  <tr key={s.id} style={{ opacity: s.active ? 1 : 0.4 }}>
                    <td style={td}>{s.provider}</td>
                    <td style={td}>{s.plan_name}</td>
                    <td style={td}>
                      <input style={{ ...input, width: 80 }} type="number" defaultValue={(s.amount_usd_cents / 100).toFixed(2)}
                        onBlur={e => { const n = Math.round(parseFloat(e.target.value) * 100); if (Number.isFinite(n) && n !== s.amount_usd_cents) updateSub(s.id, { amount_usd_cents: n }) }} />
                    </td>
                    <td style={{ ...td, textTransform: 'capitalize' }}>{s.billing_cadence.replace('_', ' ')}</td>
                    <td style={td}>{CATEGORY_LABELS[s.category] ?? s.category}</td>
                    <td style={td}>{s.renewal_date ?? '—'}</td>
                    <td style={td}>{s.active ? 'Yes' : 'No'}</td>
                    <td style={td}>{s.active && <button onClick={() => deactivateSub(s.id)} style={{ background: 'none', border: '1px solid #F87171', color: '#F87171', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>Deactivate</button>}</td>
                  </tr>
                ))}
                {subs && subs.length === 0 && <tr><td style={td} colSpan={8}>No subscriptions.</td></tr>}
                {!subs && <tr><td style={td} colSpan={8}>Loading…</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'renewals' && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Next 60 days</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Provider</th><th style={th}>Plan</th><th style={th}>Amount</th><th style={th}>Renews</th><th style={th}>Category</th></tr></thead>
            <tbody>
              {renewals.map(r => (
                <tr key={r.id}><td style={td}>{r.provider}</td><td style={td}>{r.plan_name}</td><td style={td}>{formatUsdCents(r.amount_usd_cents)}</td><td style={td}>{r.renewal_date}</td><td style={td}>{CATEGORY_LABELS[r.category] ?? r.category}</td></tr>
              ))}
              {renewals.length === 0 && <tr><td style={td} colSpan={5}>Nothing renewing in the next 60 days.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
