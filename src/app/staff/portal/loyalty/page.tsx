'use client'
import { useEffect, useState } from 'react'
import { getTier, TIER_BADGE } from '@/lib/loyalty'

type LoyaltyData = {
  customer: { name: string; points_balance: number; loyalty_points: number; stamps_count: number; total_spent: number; total_spend: number; visit_count: number }
  config: { program_type: string; stamps_to_reward: number; stamp_reward_text: string; points_per_dollar: number; point_value_cents: number }
  transactions: Array<{ id: string; type: string; points_delta: number; stamps_delta: number; created_at: string }>
}

export default function StaffPortalLoyalty() {
  const [data, setData] = useState<LoyaltyData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/staff/portal/me').then(r => r.json()),
      fetch('/api/pos/loyalty/config').then(r => r.json()),
    ]).then(([meData, cfgData]) => {
      if (meData.member?.id) {
        // For portal users, we'd need a route that returns their loyalty data.
        // Using the customer linked to their staff account.
        setData({
          customer: {
            name: `${meData.member.first_name} ${meData.member.last_name}`,
            points_balance: 0, loyalty_points: 0, stamps_count: 0,
            total_spent: 0, total_spend: 0, visit_count: 0,
          },
          config: cfgData.config,
          transactions: [],
        })
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading…</div>
  if (!data) return <div className="p-6 text-sm text-gray-500">Not available.</div>

  const { customer, config } = data
  const isPoints = config?.program_type !== 'stamps'
  const pts = Number(customer.points_balance ?? customer.loyalty_points ?? 0)
  const stamps = Number(customer.stamps_count ?? 0)
  const stampsNeeded = Number(config?.stamps_to_reward ?? 10)
  const spend = Number(customer.total_spent ?? customer.total_spend ?? 0)
  const visits = Number(customer.visit_count ?? 0)
  const tier = getTier(spend, visits)
  const { label: tierLabel, color: tierColor } = TIER_BADGE[tier]
  const progressPct = isPoints ? 0 : Math.min(100, (stamps / stampsNeeded) * 100)

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: '#0A0F0C', color: '#E8EDE7' }}>
      <h1 className="text-xl font-medium">Your Loyalty Card</h1>

      {/* Card */}
      <div className="rounded-2xl p-6 space-y-4" style={{ background: 'linear-gradient(135deg, #1A2620, #2D5240)', border: '1px solid rgba(127,184,151,0.3)' }}>
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm" style={{ color: 'rgba(232,237,231,0.6)' }}>Welcome back</p>
            <p className="text-2xl font-medium mt-0.5">{customer.name}</p>
          </div>
          <span className="text-sm font-bold px-3 py-1 rounded-full" style={{ background: tierColor + '22', color: tierColor }}>
            {tierLabel}
          </span>
        </div>

        {isPoints ? (
          <div>
            <p className="text-4xl font-bold" style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', color: '#7FB897' }}>{pts}</p>
            <p className="text-sm mt-1" style={{ color: 'rgba(232,237,231,0.6)' }}>
              points · worth ${((pts * Number(config?.point_value_cents ?? 1)) / 100).toFixed(2)}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: 'rgba(232,237,231,0.6)' }}>
              {stamps}/{stampsNeeded} stamps · {stampsNeeded - stamps > 0 ? `${stampsNeeded - stamps} more until "${config?.stamp_reward_text}"` : `Reward ready: ${config?.stamp_reward_text}`}
            </p>
            {/* Stamp progress */}
            <div className="flex gap-2 flex-wrap">
              {Array.from({ length: stampsNeeded }).map((_, i) => (
                <div key={i} className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                  style={{ background: i < stamps ? '#2D5240' : 'rgba(255,255,255,0.08)', border: `1px solid ${i < stamps ? '#7FB897' : 'rgba(255,255,255,0.1)'}` }}>
                  {i < stamps ? '✓' : ''}
                </div>
              ))}
            </div>
            {/* Progress bar */}
            <div className="h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-2 rounded-full transition-all" style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #2D5240, #7FB897)' }} />
            </div>
          </div>
        )}

        <div className="flex gap-4 text-xs" style={{ color: 'rgba(232,237,231,0.5)' }}>
          <span>{visits} visits</span>
          <span>${spend.toFixed(2)} lifetime spend</span>
        </div>
      </div>

      {/* Tier info */}
      <div className="rounded-xl p-4 space-y-2" style={{ background: '#1A2620', border: '1px solid rgba(232,237,231,0.06)' }}>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Your tier benefits</p>
        {tier === 'bronze' && <p className="text-sm" style={{ color: 'rgba(232,237,231,0.6)' }}>Earn 1x points. Reach Silver ($500 spend or 20 visits) for 1.5x multiplier.</p>}
        {tier === 'silver' && <p className="text-sm" style={{ color: '#C0C0C0' }}>Silver member — earning 1.5x points. Reach Gold ($2,000 spend or 50 visits) for 2x.</p>}
        {tier === 'gold' && <p className="text-sm" style={{ color: '#FFD700' }}>Gold member — earning 2x points on every purchase.</p>}
      </div>

      {/* Recent history */}
      {data.transactions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Recent activity</p>
          {data.transactions.slice(0, 10).map(t => (
            <div key={t.id} className="flex justify-between text-sm px-3 py-2 rounded-lg" style={{ background: '#1A2620' }}>
              <span style={{ color: 'rgba(232,237,231,0.6)' }}>{new Date(t.created_at).toLocaleDateString('en-AU')}</span>
              <span style={{ color: t.points_delta > 0 || t.stamps_delta > 0 ? '#7FB897' : '#ef4444' }}>
                {t.points_delta !== 0 ? `${t.points_delta > 0 ? '+' : ''}${t.points_delta} pts` : ''}
                {t.stamps_delta !== 0 ? `${t.stamps_delta > 0 ? '+' : ''}${t.stamps_delta} stamps` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
