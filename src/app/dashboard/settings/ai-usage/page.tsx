'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface Usage {
  tier: string; budget_cents: number; sonnet_used_cents: number; total_this_month_cents: number; percent_used: number
  daily: { date: string; cents: number }[]
  by_feature: { feature: string; cents: number }[]
}

const fmt = (cents: number) => 'A$' + (cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 12, padding: '18px 20px' }

export default function AiUsagePage() {
  const { business } = useBusinessContext()
  const [usage, setUsage] = useState<Usage | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!business) return
    setLoading(true)
    fetch('/api/dashboard/ai-usage').then(r => r.json()).then(d => { if (!d.error) setUsage(d) }).finally(() => setLoading(false))
  }, [business])

  const pctColor = (usage?.percent_used ?? 0) >= 100 ? '#F87171' : (usage?.percent_used ?? 0) >= 80 ? '#F59E0B' : '#00B140'

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px', fontFamily: "'Manrope', system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>AI usage</h1>
      <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 22 }}>How much premium AI (Sonnet) you&apos;ve used this month. After your budget, Aria stays available on lite mode.</p>

      {loading ? (
        <p style={{ color: 'var(--text-tertiary)' }}>Loading…</p>
      ) : !usage ? (
        <p style={{ color: 'var(--text-tertiary)' }}>No usage data yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14 }}>
            <div style={card}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>This month</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', marginTop: 6 }}>{fmt(usage.total_this_month_cents)}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Premium budget</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', marginTop: 6 }}>{fmt(usage.budget_cents)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, textTransform: 'capitalize' }}>{usage.tier} plan</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Premium used</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: pctColor, marginTop: 6 }}>{usage.percent_used}%</div>
              <div style={{ height: 6, background: 'var(--bg-input)', borderRadius: 3, overflow: 'hidden', marginTop: 8 }}>
                <div style={{ height: '100%', width: `${usage.percent_used}%`, background: pctColor, borderRadius: 3 }} />
              </div>
            </div>
          </div>

          {usage.percent_used >= 100 && (
            <div style={{ ...card, borderColor: 'rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>⚡ You&apos;re in lite mode for the rest of this month. Upgrade for a larger premium AI budget.</span>
              <Link href="/dashboard/billing" style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Upgrade</Link>
            </div>
          )}

          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Last 30 days</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={usage.daily} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} interval={4} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} tickFormatter={v => `$${(Number(v) / 100).toFixed(0)}`} width={44} />
                <Tooltip formatter={(value) => fmt(Number(value ?? 0))} contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--divider)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="cents" fill="var(--violet)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>By feature (this month)</div>
            {usage.by_feature.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No AI usage yet this month.</p>
            ) : usage.by_feature.map(f => (
              <div key={f.feature} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '8px 0', borderTop: '1px solid var(--divider)' }}>
                <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{f.feature}</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(f.cents)}</span>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center' }}>
            <Link href="/dashboard/billing" style={{ fontSize: 13, color: 'var(--text-violet)', fontWeight: 600, textDecoration: 'none' }}>Need more premium AI? Upgrade your plan →</Link>
          </div>
        </div>
      )}
    </div>
  )
}
